import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { logger } from "./logger";
import { showBackendOfflineToast, dismissBackendOfflineToast } from "./backend-offline-toast";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";

if (!process.env.NEXT_PUBLIC_API_URL) {
  logger.warn("NEXT_PUBLIC_API_URL is not set — falling back to http://localhost:3101");
}

declare module "axios" {
  export interface AxiosRequestConfig {
    /**
     * Marca a request como AUTOMÁTICA (mount/refresh/polling). Um 402
     * ERR_FEATURE_NOT_IN_PLAN nela NÃO dispara o toast global "recurso fora do
     * plano" — o usuário não pediu nada, então o aviso seria ruído.
     * Ações iniciadas pelo usuário (clicar em "Resumir com IA", abrir o funil)
     * NÃO devem usar isto: ali o toast é o feedback correto.
     */
    skipFeatureToast?: boolean;
  }
}

/** Spread em chamadas automáticas: `api.get(url, { params, ...BACKGROUND_REQUEST })`. */
export const BACKGROUND_REQUEST = { skipFeatureToast: true } as const;

/**
 * O erro é um 402 de "recurso fora do plano"?
 *
 * Atenção: o interceptor rejeita com `error.response || error`, então o catch do
 * chamador recebe o RESPONSE (status/data na raiz), não o AxiosError. Cobrimos os
 * dois formatos para o helper servir em qualquer ponto da cadeia.
 */
export function isFeatureNotInPlanError(err: unknown): boolean {
  const e = err as {
    status?: number;
    data?: { error?: string };
    response?: { status?: number; data?: { error?: string } };
  } | null;
  const status = e?.response?.status ?? e?.status;
  const code = e?.response?.data?.error ?? e?.data?.error;
  return status === 402 && code === "ERR_FEATURE_NOT_IN_PLAN";
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101",
  timeout: 30000,
  withCredentials: true,
});

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];
let isRedirecting = false;
let healthPollTimer: ReturnType<typeof setTimeout> | null = null;
let healthProbeInFlight: Promise<boolean> | null = null;

// Quick one-shot probe — distinguishes "backend really offline" from
// "this single request failed at an intermediate proxy" (e.g. dev tunnel /
// CloudFlare returning 413 / 502 without CORS headers, which axios surfaces
// as a generic Network Error). Concurrent callers share the same in-flight
// probe so we never spam /health.
function probeBackendHealth(): Promise<boolean> {
  if (healthProbeInFlight) return healthProbeInFlight;
  const baseURL = (api.defaults.baseURL as string) || "";
  healthProbeInFlight = (async () => {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${baseURL}/health`, { method: "GET", signal: ctrl.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    } finally {
      healthProbeInFlight = null;
    }
  })();
  return healthProbeInFlight;
}

function startHealthPoller(): void {
  if (healthPollTimer !== null) return;
  const poll = () => {
    healthPollTimer = setTimeout(() => {
      probeBackendHealth()
        .then((ok) => {
          if (!ok) {
            poll();
            return;
          }
          healthPollTimer = null;
          dismissBackendOfflineToast();
          import("./socket")
            .then(({ ensureConnectedFromStorage }) => ensureConnectedFromStorage())
            .catch(() => undefined);
        });
    }, 5000);
  };
  poll();
}

function readStoredToken(): string | null {
  try {
    const raw = localStorage.getItem("token");
    return raw ? (JSON.parse(raw) as string) : null;
  } catch {
    return null;
  }
}

async function refreshWithCrossTabLock(staleToken: string | null): Promise<string | null> {
  const doRefresh = async (): Promise<string | null> => {
    const current = readStoredToken();
    if (current && current !== staleToken) return current;
    const csrfToken =
      document.cookie.split("; ").find((c) => c.startsWith("csrf_token="))?.split("=")[1] ?? "";
    const res = await api.post("/auth/refresh_token", undefined, {
      headers: { "X-CSRF-Token": csrfToken },
    });
    const newToken = (res.data?.token as string | undefined) ?? null;
    if (newToken) localStorage.setItem("token", JSON.stringify(newToken));
    return newToken;
  };
  const locks = (navigator as { locks?: { request: (n: string, cb: () => Promise<string | null>) => Promise<string | null> } }).locks;
  if (locks?.request) {
    return locks.request("zpro-refresh-token", doRefresh);
  }
  return doRefresh();
}

type LogoutReason = {
  status?: number;
  code?: string;
  url?: string;
  message?: string;
  responseData?: unknown;
};

// Toast amigável de sessão encerrada — fora do React (mesmo padrão de
// backend-offline-toast.ts): carrega as mensagens do locale ativo direto do
// bundle i18n. O detalhe técnico (status/código/URL) fica apenas no logger.
async function showSessionEndedToast(): Promise<void> {
  let message = "Sua sessão foi encerrada. Faça login novamente.";

  try {
    const stored = typeof window !== "undefined" ? localStorage.getItem("language") : null;
    const locale: Locale =
      stored && (locales as readonly string[]).includes(stored) ? (stored as Locale) : defaultLocale;
    const messages = (await getMessages(locale)) as {
      api?: { sessionExpiredToast?: string };
      useSocketAuth?: { forceLogout?: string };
    };
    message = messages.api?.sessionExpiredToast ?? messages.useSocketAuth?.forceLogout ?? message;
  } catch {
    // noop — fallback usado
  }

  toast.error(message, { duration: 3000 });
}

function redirectToLogin(reason?: LogoutReason): void {
  if (isRedirecting) return;
  isRedirecting = true;
  if (reason) {
    logger.error("[auth] forced logout", reason);
    void showSessionEndedToast();
    setTimeout(() => {
      useAuthStore.getState().clearAuth();
      window.location.href = "/login";
    }, 3000);
    return;
  }
  useAuthStore.getState().clearAuth();
  window.location.href = "/login";
}

function redirectToPaymentBlocked(): void {
  if (typeof window === "undefined") return;
  try {
    useAuthStore.getState().setBillingState("blocked");
    useAuthStore.getState().setPaymentOverdue(true);
  } catch {
    // noop
  }
  if (window.location.pathname !== "/configuracoesPagamentoAtrasado") {
    window.location.href = "/configuracoesPagamentoAtrasado";
  }
}

function redirectToLicenseRecovery(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/license-recovery") {
    window.location.href = "/license-recovery";
  }
}

function redirectToForcePasswordChange(): void {
  if (typeof window === "undefined") return;
  try {
    useAuthStore.getState().patchUser({ mustChangePassword: true });
  } catch {
    // noop
  }
  if (window.location.pathname !== "/trocar-senha") {
    window.location.href = "/trocar-senha";
  }
}

api.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  try {
    const raw = localStorage.getItem("token");
    const token = raw ? JSON.parse(raw) : null;
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // noop
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      skipFeatureToast?: boolean;
    };
    const url = String(originalRequest?.url || "");
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/refresh_token") || url.includes("/auth/logout");

    // Backend offline (nginx 502/504) ou rede sem resposta. Sem este guard, o navegador
    // rotula como "erro CORS" porque o nginx nao devolve Access-Control-Allow-Origin no 502.
    // Antes de mostrar o toast, fazemos um probe ao /health: se o backend responder,
    // a falha foi de um intermediario (dev tunnel/CF 413/502) e nao queremos confundir
    // o usuario com "Servidor offline".
    const isLikelyBackendOffline =
      status === 502 ||
      status === 503 ||
      status === 504 ||
      error.code === "ERR_NETWORK" ||
      (!error.response && error.message === "Network Error");
    if (isLikelyBackendOffline) {
      void probeBackendHealth().then((alive) => {
        if (alive) return;
        (error as AxiosError & { isBackendOffline?: boolean }).isBackendOffline = true;
        void showBackendOfflineToast();
        startHealthPoller();
      });
    }

    // Allowlist de "JWT/sessao expirada" — unicos casos onde 401 deve disparar refresh.
    // Backend usa 403 para JWT invalido/expirado (isAuthZPRO:125 -> ERR_AUTH_INVALID_TOKEN).
    // Os 401 que sao genuinamente "sessao expirou":
    //   - 401 sem body (proxy/middleware externo retornando cru)
    //   - codigos futuros explicitos (TokenExpiredError, ERR_JWT_EXPIRED, ERR_TOKEN_EXPIRED)
    // Force logout ("Session expired. Please login again." de isAuthZPRO:62) NAO faz refresh,
    // vai direto pro redirect. Demais 401 com codigo de erro sao erros de aplicacao
    // (ERR_USER_NOT_FOUND, ERR_INVALID_CREDENTIALS, ERR_TENANT_*, ERR_GOOGLE_*, etc) —
    // devolvem o erro pro chamador sem refresh nem deslogar.
    const errBody = error.response?.data as { error?: string; message?: string } | undefined;
    const errorCode = errBody?.error ?? errBody?.message ?? "";
    const isJwtExpired =
      !errorCode ||
      errorCode === "TokenExpiredError" ||
      errorCode === "ERR_JWT_EXPIRED" ||
      errorCode === "ERR_TOKEN_EXPIRED";
    const isForceLogout = errorCode.startsWith("Session expired");
    // Defesa em profundidade: um backend antigo (ou um proxy) pode devolver
    // 403 ERR_AUTH_INVALID_TOKEN para um access token apenas EXPIRADO (o isAuth antigo
    // nao distinguia expirado de invalido). Tentamos renovar a sessao antes de deslogar;
    // se o refresh falhar, o logout acontece normalmente no catch abaixo. Token com
    // assinatura realmente invalida -> refresh falha -> logout (apenas 1 request extra).
    const isMaybeExpired403 = status === 403 && errorCode === "ERR_AUTH_INVALID_TOKEN";

    if (!originalRequest._retry && !isAuthCall && !isForceLogout && ((status === 401 && isJwtExpired) || isMaybeExpired403)) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const reqAuth = String(originalRequest.headers?.Authorization ?? "");
          const staleToken = reqAuth.startsWith("Bearer ") ? reqAuth.slice(7) : null;
          const newToken = await refreshWithCrossTabLock(staleToken);
          refreshQueue.forEach((cb) => cb(newToken));
          refreshQueue = [];
          if (newToken) {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return api(originalRequest);
        } catch (refreshErr) {
          refreshQueue.forEach((cb) => cb(null));
          refreshQueue = [];
          const refreshAxios = refreshErr as AxiosError;
          const refreshBody = refreshAxios?.response?.data as { error?: string; message?: string } | undefined;
          redirectToLogin({
            status: refreshAxios?.response?.status ?? status,
            code: refreshBody?.error ?? "REFRESH_FAILED",
            url: "/auth/refresh_token",
            message: refreshBody?.message ?? `Falha ao renovar sessão (request original: ${url})`,
            responseData: refreshAxios?.response?.data,
          });
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      }

      return new Promise((resolve, reject) => {
        refreshQueue.push((newToken) => {
          if (!newToken) return reject(error);
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(api(originalRequest));
        });
      });
    }

    const isAuthError =
      errorCode.startsWith("ERR_AUTH_") || errorCode === "ERR_SESSION_EXPIRED";

    // Force logout (forceLogout do tenant) — redirect direto, sem refresh.
    if (status === 401 && !isAuthCall && isForceLogout) {
      redirectToLogin({
        status,
        code: errorCode || "FORCE_LOGOUT",
        url,
        message: errBody?.message,
        responseData: errBody,
      });
    }

    if (status === 403 && !isAuthCall && isAuthError) {
      redirectToLogin({
        status,
        code: errorCode,
        url,
        message: errBody?.message,
        responseData: errBody,
      });
    }

    // Troca de senha obrigatória (gate do isAuth): mesmo molde da inadimplência —
    // redirect direto, sem depender do store já conhecer a flag. Cobre o cenário
    // de admin redefinindo a senha de usuário com sessão aberta.
    if (status === 403 && !isAuthCall && errorCode === "ERR_MUST_CHANGE_PASSWORD") {
      redirectToForcePasswordChange();
    }

    // Permissão negada (requirePermission / ERR_NO_PERMISSION): sem feedback global
    // esse 403 caía em catches silenciosos e virava "botão que não faz nada".
    // Avisa via evento (toast i18n no layout) e deixa o erro seguir pro chamador.
    if (status === 403 && !isAuthCall && !isAuthError && errorCode === "ERR_NO_PERMISSION") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("zpro:no-permission"));
      }
    }

    if (status === 402) {
      if (errorCode === "LICENSE_BLOCKED") {
        redirectToLicenseRecovery();
      } else if (errorCode === "ERR_FEATURE_NOT_IN_PLAN") {
        // Recurso fora do plano contratado — NÃO é bloqueio de pagamento. Avisa via
        // evento (toast i18n no layout) e deixa o erro seguir pro chamador, sem redirect.
        // Requests automáticas (skipFeatureToast) ficam mudas: o toast só faz sentido
        // quando o usuário pediu a ação — senão vira ruído a cada ticket aberto.
        if (typeof window !== "undefined" && !originalRequest?.skipFeatureToast) {
          window.dispatchEvent(new CustomEvent("zpro:feature-not-in-plan"));
        }
      } else {
        redirectToPaymentBlocked();
      }
    }

    return Promise.reject(error.response || error);
  }
);

export default api;
