/**
 * Aviso do sistema para chamada SIP recebida com a aba minimizada ou atrás de outra
 * janela — antes a chamada tocava e o WebPhone abria numa aba que ninguém estava vendo.
 *
 * - Só com a permissão de notificação já concedida (a mesma das mensagens); nunca pede.
 * - Sem som (`silent`): o toque de chamada já toca (lib/call-ringtone.ts).
 * - Sem service worker de propósito: o clique dele NAVEGA a página (app/sw.ts) e
 *   derrubaria a chamada que está tocando. No Android/PWA, onde `new Notification` não
 *   existe, fica só o toque.
 */
const TAG = "zpro-sip-incoming-call";

const noop = (): void => {};

/** Aba escondida, minimizada ou atrás de outra janela. */
export const isPageInBackground = (doc?: Document): boolean => {
  try {
    const d = doc ?? (typeof document !== "undefined" ? document : undefined);
    if (!d) return false;
    return d.visibilityState !== "visible" || !d.hasFocus();
  } catch {
    return false;
  }
};

/** Mostra o aviso e devolve quem o fecha (chamada atendida, recusada ou encerrada). */
export const showIncomingSipCallNotification = (opts: {
  title: string;
  body: string;
  icon?: string;
  onClick: () => void;
}): (() => void) => {
  if (typeof window === "undefined" || typeof Notification === "undefined") return noop;
  if (Notification.permission !== "granted") return noop;
  let notification: Notification;
  try {
    notification = new Notification(opts.title, {
      body: opts.body,
      icon: opts.icon,
      tag: TAG,
      requireInteraction: true,
      silent: true,
    });
  } catch {
    return noop;
  }
  notification.onclick = () => {
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    try {
      opts.onClick();
    } finally {
      notification.close();
    }
  };
  return () => {
    try {
      notification.close();
    } catch {
      /* ignore */
    }
  };
};
