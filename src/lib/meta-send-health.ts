import { useEffect, useSyncExternalStore } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { usePageAccess } from "@/hooks/use-page-access";
import { getMetaSendHealth, type MetaSendHealthRow } from "@/services/meta-send-health";

// Alerta de canal WABA sem forma de pagamento / bloqueado para envio
// (docs/PLANO_ALERTA_PAGAMENTO_WABA.md). Módulo único compartilhado pela faixa,
// pelo aviso do canal (/sessoes e Integrações Meta) e pelo selo dos seletores:
// um GET por janela de 60 s para todos os consumidores montados.

/** Tela do WhatsApp Manager com o botão "Adicionar forma de pagamento" (URL documentada pela Meta). */
export const WHATSAPP_MANAGER_URL = "https://business.facebook.com/wa/manage/home/";
/** Artigo de ajuda da Meta sobre adicionar forma de pagamento à conta do WhatsApp Business. */
export const META_PAYMENT_HELP_URL = "https://www.facebook.com/business/help/488291839463771";

const CACHE_TTL_MS = 60 * 1000;
// Falha passageira (backend reiniciando, 503, rede): a faixa fica no layout e não
// remonta, então sem esta nova tentativa o alerta sumiria até recarregar a página.
const RETRY_AFTER_ERROR_MS = 30 * 1000;
const EMPTY: MetaSendHealthRow[] = [];

interface CacheState {
  /** tenantId:userId dono do cache — troca de sessão no mesmo navegador não reaproveita linhas. */
  key: string | null;
  rows: MetaSendHealthRow[];
  loadedAt: number;
  /** Backend sem a rota (404/405): para de tentar nesta sessão. */
  unsupported: boolean;
}

let state: CacheState = { key: null, rows: EMPTY, loadedAt: 0, unsupported: false };
let inflight: Promise<void> | null = null;
// Geração da busca em andamento: uma busca antiga (de antes de trocar de sessão) nunca limpa a atual.
let inflightSeq = 0;
// Refresh forçado pedido com um GET já em andamento (ex.: logo após "Já resolvi"):
// aquele GET pode ter saído antes da gravação, então busca de novo quando ele terminar.
let forceQueued = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function scheduleRetry(key: string): void {
  if (retryTimer || typeof window === "undefined") return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (listeners.size > 0 && currentKey() === key) void refreshMetaSendHealth(true);
  }, RETRY_AFTER_ERROR_MS);
}

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // consumidor com erro não derruba os demais
    }
  });
}

function currentKey(): string | null {
  const user = useAuthStore.getState().user;
  if (!user?.tenantId) return null;
  return `${user.tenantId}:${user.userId ?? ""}`;
}

export function subscribeMetaSendHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): MetaSendHealthRow[] {
  return state.key !== null && state.key === currentKey() ? state.rows : EMPTY;
}

function getServerSnapshot(): MetaSendHealthRow[] {
  return EMPTY;
}

/** Esvazia o cache (troca de sessão). */
export function resetMetaSendHealthCache(): void {
  state = { key: null, rows: EMPTY, loadedAt: 0, unsupported: false };
  inflight = null;
  forceQueued = false;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  notify();
}

/**
 * Busca GET /meta/send-health respeitando o cache de 60 s (a menos que `force`)
 * e deduplicando a chamada em andamento. Nunca lança.
 */
export async function refreshMetaSendHealth(force = false): Promise<void> {
  const key = currentKey();
  if (!key) return;
  if (state.key !== key) {
    state = { key, rows: EMPTY, loadedAt: 0, unsupported: false };
    inflight = null;
    forceQueued = false;
  }
  if (state.unsupported) return;
  if (!force && state.loadedAt > 0 && Date.now() - state.loadedAt < CACHE_TTL_MS) return;
  if (inflight) {
    if (force) forceQueued = true;
    return inflight;
  }

  const seq = ++inflightSeq;
  const run = (async () => {
    try {
      const { data } = await getMetaSendHealth();
      if (currentKey() !== key) return;
      state = {
        ...state,
        key,
        rows: Array.isArray(data) ? data : EMPTY,
        loadedAt: Date.now(),
      };
    } catch (err: unknown) {
      if (currentKey() !== key) return;
      const e = err as { status?: number; response?: { status?: number } } | null;
      const status = e?.status ?? e?.response?.status;
      if (status === 404 || status === 405) {
        state = { ...state, key, rows: EMPTY, unsupported: true };
      } else {
        // Falha passageira: mantém o que já tinha e tenta de novo em 30 s (se alguém ainda mostra o alerta).
        state = { ...state, key, loadedAt: Date.now() };
        scheduleRetry(key);
      }
    } finally {
      if (seq === inflightSeq) inflight = null;
      notify();
      if (forceQueued && currentKey() === key) {
        forceQueued = false;
        void refreshMetaSendHealth(true);
      }
    }
  })();
  inflight = run;
  return run;
}

/**
 * Linhas de alerta do tenant (só canais com alerta). Dispara o fetch quando o
 * consumidor monta e `enabled` é true; respeita o cache compartilhado.
 */
export function useMetaSendHealth(enabled = true): MetaSendHealthRow[] {
  const rows = useSyncExternalStore(subscribeMetaSendHealth, getSnapshot, getServerSnapshot);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const userId = useAuthStore((s) => s.user?.userId);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !tenantId) return;
    void refreshMetaSendHealth(false);
  }, [enabled, isAuthenticated, tenantId, userId]);

  return enabled ? rows : EMPTY;
}

export function findSendHealthByWhatsappId(
  rows: MetaSendHealthRow[],
  whatsappId: number | string | null | undefined
): MetaSendHealthRow | null {
  if (whatsappId === null || whatsappId === undefined || whatsappId === "") return null;
  const id = Number(whatsappId);
  return rows.find((r) => Number(r.whatsappId) === id) ?? null;
}

/** Casa só por phone_number_id numérico (o `tokenAPI` do canal WABA); número exibido nunca casa. */
export function findSendHealthByPhoneNumberId(
  rows: MetaSendHealthRow[],
  phoneNumberId: string | null | undefined
): MetaSendHealthRow | null {
  const id = (phoneNumberId ?? "").trim();
  if (!/^\d{6,}$/.test(id)) return null;
  return rows.find((r) => String(r.phoneNumberId) === id) ?? null;
}

/**
 * Quem pode resolver o alerta (D2): admin, superadmin e custom com `sessions_manage`.
 * Escrito por extenso de propósito: `hasPermission` devolve true para todo perfil
 * que não é custom, então copiar o `canManageSessions` de /sessoes liberaria user e super,
 * que o backend recusa com 403.
 */
export function useCanResolveMetaSendHealth(): boolean {
  // Assina `user` inteiro: o refresh de 30 s troca o objeto e a permissão é reavaliada.
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const profile = user?.profile;
  if (profile === "admin" || profile === "superadmin") return true;
  if (profile === "custom") return hasPermission("sessions_manage");
  return false;
}

/**
 * Tela de canais que o perfil consegue abrir, ou null quando não há nenhuma:
 * admin e superadmin → /integracoes-meta; custom com settings_general → /integracoes-meta;
 * super/custom → /sessoes só se a página liberar; user → null.
 */
export function useMetaChannelsHref(): string | null {
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const sessoesAllowed = usePageAccess("sessoes", { adminSuperOnly: true });
  if (!user) return null;
  const profile = user.profile;
  if (profile === "admin" || profile === "superadmin") return "/integracoes-meta";
  if (profile === "custom" && hasPermission("settings_general")) return "/integracoes-meta";
  if ((profile === "super" || profile === "custom") && sessoesAllowed) return "/sessoes";
  return null;
}
