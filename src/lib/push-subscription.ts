/**
 * Helpers puros (sem React) da assinatura de Web Push do PWA.
 *
 * Usados por três lugares que não podem importar um ao outro: o hook
 * `usePushNotifications` (boot/self-heal), o `clearAuth` do auth-store
 * (limpeza da flag) e os fluxos explícitos de logout (desinscrever).
 *
 * A flag `subscriptionData_<tenantId>` no localStorage NÃO é prova de que o
 * navegador ainda tem assinatura: desregistrar o service worker ("Atualizar
 * agora"), rotação de endpoint pelo navegador e troca de usuário no mesmo
 * aparelho deixam a flag gravada com a assinatura morta. Quem decide é sempre
 * `pushManager.getSubscription()`; a flag só guarda o último endpoint salvo
 * no servidor para comparação.
 */

export const PUSH_FLAG_PREFIX = "subscriptionData_";

export function pushFlagKey(tenantId: number | string): string {
  return `${PUSH_FLAG_PREFIX}${tenantId}`;
}

/** Endpoint gravado na flag do tenant, ou null sem flag / JSON inválido. */
export function readStoredPushEndpoint(tenantId: number | string): string | null {
  try {
    const raw = localStorage.getItem(pushFlagKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.endpoint === "string" ? parsed.endpoint : null;
  } catch {
    return null;
  }
}

/** Remove TODAS as flags `subscriptionData_*`, de qualquer tenant. */
export function clearStoredPushFlags(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PUSH_FLAG_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // noop
  }
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.isSecureContext
  );
}

/**
 * `navigator.serviceWorker.ready` com teto. Sem service worker registrado a
 * promise nativa nunca resolve — e o chamador ficaria pendurado em silêncio,
 * sem toast e sem log.
 */
export function waitServiceWorkerReady(
  timeoutMs = 15000
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.serviceWorker.ready.then(
      (reg) => {
        clearTimeout(timer);
        resolve(reg);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

/** Chave VAPID da assinatura (ArrayBuffer) em base64url, para comparar com a do servidor. */
export function applicationServerKeyToBase64Url(
  key: ArrayBuffer | null | undefined
): string | null {
  if (!key) return null;
  try {
    const bytes = new Uint8Array(key);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return normalizeVapidKey(window.btoa(binary));
  } catch {
    return null;
  }
}

/** base64 ou base64url, com ou sem padding -> base64url sem padding. */
export function normalizeVapidKey(key: string): string {
  return key.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Desfaz a assinatura do navegador (best-effort, com teto) e limpa as flags.
 * Só para logout EXPLÍCITO: o aparelho deixa de receber os avisos de quem saiu
 * e o próximo usuário é inscrito do zero no boot. O servidor não precisa ser
 * avisado — o próximo envio para o endpoint desfeito responde 410 e a linha
 * é removida pelo próprio backend.
 */
export async function unsubscribePush(timeoutMs = 3000): Promise<void> {
  clearStoredPushFlags();
  if (!isPushSupported()) return;
  try {
    const work = (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    })();
    await Promise.race([work, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
  } catch {
    // best-effort: sair nunca pode travar por causa do push
  }
}
