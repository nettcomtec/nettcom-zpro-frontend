// Sessão do painel no navegador: o cookie que o middleware do Next confere antes de
// abrir qualquer tela (`zpro_auth`) e o código anti-CSRF que a renovação do login exige.
//
// `zpro_auth` é só aviso de roteamento (a constante `1`): quem autentica é o token.
// Ele vive o mesmo que a renovação do login — 5 dias desde a última emissão do par de
// tokens (login ou renovação). Até 2026-10-08 nascia no login com 24 h e nunca era
// renovado: depois de 24 h qualquer carregamento de página (reabrir o app no celular,
// tocar numa notificação, o recarregamento por inatividade) caía no login, mesmo com a
// renovação válida.
//
// O código anti-CSRF fica num cookie do domínio da API. Com o painel em outro subdomínio
// (o padrão das instalações) o navegador não deixa o front lê-lo, e a renovação ia sem
// ele e era recusada (403 ERR_CSRF_TOKEN_INVALID). O backend passou a devolvê-lo também
// no corpo do login e da renovação; guardamos aqui e o guardado vence. O cookie só vale
// sem nada guardado (sessão aberta antes desta versão com painel e API no mesmo
// endereço): um `csrf_token` legível pode ser de outro sistema no domínio pai.

/** Espelho de `refreshExpiresIn` em backend/src/config/authZPRO.ts — mudar um exige o outro. */
export const SESSION_WINDOW_SECONDS = 5 * 24 * 60 * 60;

const AUTH_ROUTE_COOKIE = "zpro_auth";
const CSRF_COOKIE = "csrf_token";
const CSRF_STORAGE_KEY = "zproCsrfToken";

function writeAuthRouteCookie(maxAgeSeconds: number): void {
  const secureFlag = window.location.protocol === "https:" ? "Secure; " : "";
  document.cookie = `${AUTH_ROUTE_COOKIE}=1; path=/; ${secureFlag}SameSite=Lax; max-age=${maxAgeSeconds}`;
}

/** Login ou renovação: o par de tokens acabou de sair, vale a janela inteira. */
export function setAuthRouteCookie(): void {
  if (typeof window === "undefined") return;
  writeAuthRouteCookie(SESSION_WINDOW_SECONDS);
}

export function clearAuthRouteCookie(): void {
  if (typeof window === "undefined") return;
  const secureFlag = window.location.protocol === "https:" ? "Secure; " : "";
  document.cookie = `${AUTH_ROUTE_COOKIE}=; path=/; ${secureFlag}max-age=0`;
}

/** `iat` do token de acesso em ms, ou null se não der para ler. */
export function jwtIssuedAtMs(token: string | null | undefined): number | null {
  if (!token || typeof token !== "string") return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { iat?: unknown };
    return typeof payload.iat === "number" && Number.isFinite(payload.iat) ? payload.iat * 1000 : null;
  } catch {
    return null;
  }
}

/** Segundos que faltam da janela contada a partir da emissão (0 = acabou). */
export function remainingSessionSeconds(issuedAtMs: number, nowMs: number = Date.now()): number {
  const remaining = Math.floor((issuedAtMs + SESSION_WINDOW_SECONDS * 1000 - nowMs) / 1000);
  return Math.min(Math.max(remaining, 0), SESSION_WINDOW_SECONDS);
}

/**
 * Abertura do painel: alinha o cookie à emissão do token guardado. Cobre a sessão
 * aberta antes desta versão (cookie de 24 h). Nunca apaga: sem `iat` legível ou com a
 * janela já vencida (ou relógio do aparelho muito adiantado), deixa o cookie como está.
 */
export function syncAuthRouteCookieWithToken(token: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const issuedAt = jwtIssuedAtMs(token);
  if (issuedAt === null) return;
  const remaining = remainingSessionSeconds(issuedAt);
  if (remaining > 0) writeAuthRouteCookie(remaining);
}

export function rememberCsrfToken(value: unknown): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(value)) return;
  try {
    localStorage.setItem(CSRF_STORAGE_KEY, value);
  } catch {
    /* storage indisponível: a renovação tenta pelo cookie */
  }
}

export function readCsrfToken(): string {
  try {
    const stored = localStorage.getItem(CSRF_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* storage indisponível: tenta o cookie */
  }
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${CSRF_COOKIE}=`))
      ?.split("=")[1] ?? ""
  );
}

/**
 * "Sair": encerra no servidor a renovação do login deste aparelho e apaga os cookies
 * dela. Best-effort com teto de 2 s — sair nunca trava. Backend antigo responde 404 e
 * fica como antes (a renovação some só no prazo).
 */
export async function endServerSession(): Promise<void> {
  if (typeof window === "undefined") return;
  const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101";
  const request = fetch(`${baseURL}/auth/revoke_session`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "X-Requested-With": "XMLHttpRequest" },
  }).then(
    () => undefined,
    () => undefined
  );
  await Promise.race([request, new Promise<void>((resolve) => setTimeout(resolve, 2000))]);
}

export function forgetCsrfToken(): void {
  try {
    localStorage.removeItem(CSRF_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
