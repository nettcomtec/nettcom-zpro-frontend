import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

// ─── Tenant validation via IndexedDB ─────────────────────────────────────────
const IDB_NAME = "zpro-auth";
const IDB_STORE = "session";

function getCurrentTenantIdFromDB(): Promise<number | null> {
  // Defensivo: iOS Safari tem bugs de IndexedDB dentro de SW (open pode travar).
  // Qualquer falha/timeout resolve null para nao bloquear showNotification.
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 1500);
    const done = (v: number | null) => { clearTimeout(timer); resolve(v); };
    try {
      const req = (self as any).indexedDB.open(IDB_NAME, 1);
      // Sem essa handler, se o SW abre o DB antes do auth-store, o objectStore
      // "session" nunca e criado e todas as leituras retornam null para sempre.
      req.onupgradeneeded = (e: any) => {
        const db: IDBDatabase = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (e: any) => {
        const db: IDBDatabase = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          done(null);
          return;
        }
        try {
          const tx = db.transaction(IDB_STORE, "readonly");
          const getReq = tx.objectStore(IDB_STORE).get("current");
          getReq.onsuccess = () => done((getReq.result as any)?.tenantId ?? null);
          getReq.onerror = () => done(null);
        } catch {
          done(null);
        }
      };
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── i18n ────────────────────────────────────────────────────────────────────
let swLocale = "pt";

const swStrings: Record<string, Record<string, string>> = {
  pt: { defaultTitle: "APP", defaultBody: "Nova notificação", internalChat: "💬 Chat Interno", internalBody: "Nova mensagem recebida", newTicket: "🆕 Novo Ticket", open: "Abrir", close: "Fechar" },
  en: { defaultTitle: "APP", defaultBody: "New notification", internalChat: "💬 Internal Chat", internalBody: "New message received", newTicket: "🆕 New Ticket", open: "Open", close: "Close" },
  es: { defaultTitle: "APP", defaultBody: "Nueva notificación", internalChat: "💬 Chat Interno", internalBody: "Nuevo mensaje recibido", newTicket: "🆕 Nuevo Ticket", open: "Abrir", close: "Cerrar" },
  de: { defaultTitle: "APP", defaultBody: "Neue Benachrichtigung", internalChat: "💬 Interner Chat", internalBody: "Neue Nachricht erhalten", newTicket: "🆕 Neues Ticket", open: "Öffnen", close: "Schließen" },
  fr: { defaultTitle: "APP", defaultBody: "Nouvelle notification", internalChat: "💬 Chat Interne", internalBody: "Nouveau message reçu", newTicket: "🆕 Nouveau Ticket", open: "Ouvrir", close: "Fermer" },
  it: { defaultTitle: "APP", defaultBody: "Nuova notifica", internalChat: "💬 Chat Interno", internalBody: "Nuovo messaggio ricevuto", newTicket: "🆕 Nuovo Ticket", open: "Apri", close: "Chiudi" },
  ja: { defaultTitle: "APP", defaultBody: "新しい通知", internalChat: "💬 内部チャット", internalBody: "新しいメッセージを受信しました", newTicket: "🆕 新しいチケット", open: "開く", close: "閉じる" },
  zh: { defaultTitle: "APP", defaultBody: "新通知", internalChat: "💬 内部聊天", internalBody: "收到新消息", newTicket: "🆕 新工单", open: "打开", close: "关闭" },
  ar: { defaultTitle: "APP", defaultBody: "إشعار جديد", internalChat: "💬 دردشة داخلية", internalBody: "تم استلام رسالة جديدة", newTicket: "🆕 تذكرة جديدة", open: "فتح", close: "إغلاق" },
  hi: { defaultTitle: "APP", defaultBody: "नई सूचना", internalChat: "💬 आंतरिक चैट", internalBody: "नया संदेश प्राप्त हुआ", newTicket: "🆕 नया टिकट", open: "खोलें", close: "बंद करें" },
  id: { defaultTitle: "APP", defaultBody: "Notifikasi baru", internalChat: "💬 Chat Internal", internalBody: "Pesan baru diterima", newTicket: "🆕 Tiket Baru", open: "Buka", close: "Tutup" },
  ru: { defaultTitle: "APP", defaultBody: "Новое уведомление", internalChat: "💬 Внутренний чат", internalBody: "Получено новое сообщение", newTicket: "🆕 Новый тикет", open: "Открыть", close: "Закрыть" },
  tr: { defaultTitle: "APP", defaultBody: "Yeni bildirim", internalChat: "💬 Dahili Sohbet", internalBody: "Yeni mesaj alındı", newTicket: "🆕 Yeni Bilet", open: "Aç", close: "Kapat" },
};

function t(key: string): string {
  return (swStrings[swLocale] ?? swStrings.pt)[key] ?? (swStrings.pt)[key] ?? key;
}
// ─────────────────────────────────────────────────────────────────────────────

// Branding assets must always come from the network (updated dynamically at runtime)
const BRANDING_PATTERN = /\/(logo\.png|logo_dark\.png|favicon\.ico|manifest\.json|icons\/.+|publicPwaIcon\/.+)(\?.*)?$/;

// API base for dynamic branding (PWA icon, favicon, etc.) — inlined at build time by Next/Serwist
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const PWA_ICON_192 = API_BASE ? `${API_BASE}/publicPwaIcon/icon-192x192.png` : "/icons/icon-192x192.png";
const PWA_ICON_128 = API_BASE ? `${API_BASE}/publicPwaIcon/icon-128x128.png` : "/icons/icon-128x128.png";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: BRANDING_PATTERN,
      handler: new NetworkFirst({ cacheName: "branding", networkTimeoutSeconds: 3 }),
    },
    ...defaultCache,
  ],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.addEventListener("push", (event: any) => {
  let data: Record<string, unknown> = {};
  let title = "APP";
  let body = "Nova notificação";
  let url = "/";
  let tag = `notif-${Date.now()}`;

  try {
    data = event.data?.json() ?? {};
    body = (data.body as string) || body;

    const inner = data.data as Record<string, unknown> | undefined;
    const isInternalChat = inner?.messageId && !inner?.ticketId;

    if (isInternalChat) {
      title = t("internalChat");
      body = (data.body as string) || t("internalBody");
      tag = `chat-interno-${inner?.messageId}`;
      url = "/chat-privado";
    } else if (inner?.ticketId) {
      // `titleKind: "contact"` só existe em backend novo, que manda o nome do
      // contato no title e a prévia da mensagem no body. Backend antigo não manda
      // o campo (title vinha fixo) -> mantém o rótulo traduzido de sempre.
      title =
        data.titleKind === "contact" && data.title
          ? (data.title as string)
          : t("newTicket");
      tag = `ticket-${inner.ticketId}`;
      url = "/atendimento";
    } else {
      title = (data.title as string) || title;
    }
  } catch {
    body = event.data?.text() || body;
  }

  const inner = data.data as Record<string, unknown> | undefined;
  const payloadTenantId = data.tenantId != null ? Number(data.tenantId) : null;

  // `silent` vem do backend quando o toggle "Notificações sonoras" está desligado no
  // tenant (Setting notificationSilenced). Só chega em alerta de mensagem nova de
  // cliente. Backend antigo não manda o campo -> undefined -> som normal (sem
  // regressão). Quando silencioso, também não vibra: vibração é o "som" do mobile.
  const isSilent = data.silent === true;

  const showOptions = {
    body,
    icon: PWA_ICON_192,
    badge: PWA_ICON_128,
    ...(isSilent ? { silent: true } : { vibrate: [200, 100, 200] }),
    tag,
    requireInteraction: false,
    data: { url, ...(inner || {}) },
    actions: [
      { action: "open", title: t("open") },
      { action: "close", title: t("close") },
    ],
  };

  // Tenant gate: so descartamos quando TEMOS CERTEZA de mismatch
  // (ambos lados nao-null e diferentes). Em qualquer duvida (IDB indisponivel,
  // timeout, payload sem tenantId) exibimos — alinhado com comportamento legado.
  event.waitUntil(
    Promise.resolve()
      .then(() => (payloadTenantId !== null ? getCurrentTenantIdFromDB() : null))
      .then((currentTenantId) => {
        if (
          payloadTenantId !== null &&
          currentTenantId !== null &&
          payloadTenantId !== currentTenantId
        ) {
          return undefined;
        }
        return (self as any).registration.showNotification(title, showOptions);
      })
      .catch(() => (self as any).registration.showNotification(title, showOptions))
  );
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();

  if (event.action === "close") return;

  const url = (event.notification.data as Record<string, string>)?.url || "/";

  event.waitUntil(
    (self as any).clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList: any[]) => {
        for (const client of clientList) {
          if (client.url.includes((self as any).location.origin) && "focus" in client) {
            if ("navigate" in client) {
              return (client as any).navigate(url).then(() => client.focus());
            }
            client.focus();
            client.postMessage({ type: "NOTIFICATION_CLICK", url });
            return;
          }
        }
        return (self as any).clients.openWindow(url);
      })
  );
});

// O navegador rotacionou/expirou a assinatura de push: refaz com a MESMA chave
// VAPID e avisa as janelas abertas. O SW não tem token para salvar no servidor;
// quem re-salva é o hook usePushNotifications (na mensagem abaixo com o app
// aberto, ou no próximo boot do PWA, que compara o endpoint com a flag).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.addEventListener("pushsubscriptionchange", (event: any) => {
  const notifyClients = () =>
    (self as any).clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList: any[]) => {
        clientList.forEach((client) => {
          try {
            client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" });
          } catch {
            // noop
          }
        });
      });

  const resubscribe = () => {
    if (event.newSubscription) return Promise.resolve();
    const key = event.oldSubscription?.options?.applicationServerKey;
    if (!key) return Promise.resolve();
    return (self as any).registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  };

  event.waitUntil(
    Promise.resolve()
      .then(resubscribe)
      .catch(() => undefined)
      .then(notifyClients)
      .catch(() => undefined)
  );
});

// Permite que o cliente envie SKIP_WAITING para ativar nova versão do SW
// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.addEventListener("message", (event: any) => {
  if (event.data?.type === "SKIP_WAITING") {
    (self as any).skipWaiting();
  }
  if (event.data?.type === "SET_LOCALE" && typeof event.data.locale === "string") {
    swLocale = event.data.locale;
  }
});

serwist.addEventListeners();
