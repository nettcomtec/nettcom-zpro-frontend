"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { getPublicVapidKey, saveUserSubscription } from "@/services/push-service";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  applicationServerKeyToBase64Url,
  isPushSupported,
  normalizeVapidKey,
  pushFlagKey,
  readStoredPushEndpoint,
  waitServiceWorkerReady,
} from "@/lib/push-subscription";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function getDeviceInfo(): string {
  const userAgent = navigator.userAgent;
  let deviceType = "Unknown Device";

  if (userAgent.includes("Windows")) deviceType = "Windows";
  if (userAgent.includes("Macintosh")) deviceType = "MacOS";
  if (userAgent.includes("Linux") && !userAgent.includes("Android")) deviceType = "Linux";
  if (userAgent.includes("Android")) deviceType = "Android";
  if (userAgent.includes("iPhone") || userAgent.includes("iPad")) deviceType = "iOS";

  const browser = (() => {
    if (userAgent.includes("Edg")) return "Edge";
    if (userAgent.includes("Chrome")) return "Chrome";
    if (userAgent.includes("Firefox")) return "Firefox";
    if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) return "Safari";
    return "Other";
  })();

  let deviceId = localStorage.getItem("device_id");
  if (!deviceId) {
    deviceId = Math.random().toString(36).substr(2, 9);
    localStorage.setItem("device_id", deviceId);
  }

  return `${deviceType} - ${browser} - ${deviceId}`;
}

// Singleton anti-corrida (module-level): impede duas subscriptions simultâneas
// (ex.: auto-subscribe do PWA + clique do usuário) de disparar unsubscribe/subscribe
// concorrentes no mesmo pushManager.
let subscribeInFlight = false;

// Self-heal da assinatura: no máximo 1 verificação por minuto por processo. O
// hook é montado em dois lugares (header e PushNotifications) e cada um
// dispararia a sua no mesmo boot.
let verifyInFlight = false;
let lastVerifyAt = 0;
const VERIFY_MIN_INTERVAL_MS = 60_000;

export function usePushNotifications() {
  const t = useTranslations("usePushNotifications");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId;
  const [subscribed, setSubscribed] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    setSubscribed(!!localStorage.getItem(pushFlagKey(tenantId)));
    setIsPWA(
      window.matchMedia("(display-mode: standalone)").matches ||
        !!(navigator as Navigator & { standalone?: boolean }).standalone
    );
  }, [tenantId]);

  // fromUserGesture: default true preserva o comportamento do clique em
  // PushNotifications.tsx (que passa o MouseEvent como 1º argumento — truthy);
  // o caminho automático (boot/self-heal do PWA) passa `false` explicitamente.
  // Tipado como unknown para continuar compatível com onClick={subscribeToPush}.
  const subscribeToPush = useCallback(async (fromUserGesture: unknown = true) => {
    if (subscribeInFlight) return;
    subscribeInFlight = true;
    try {
      const isUserGesture = fromUserGesture !== false;

      if (!isPushSupported()) {
        toast.error(t("unsupportedBrowser"));
        return;
      }
      if (!tenantId) return;

      let permission: NotificationPermission;
      try {
        permission = await Notification.requestPermission();
      } catch (error) {
        logger.error("Web Push: requestPermission falhou", error);
        toast.error(t("subscribeError"));
        return;
      }

      if (permission !== "granted") {
        // Permissão negada: só avisa quando o pedido veio de clique do usuário;
        // no caminho automático (PWA) fica silencioso.
        if (isUserGesture) toast.warning(t("permissionDenied"));
        return;
      }

      let publicVapidKey: string;
      try {
        const { data } = await getPublicVapidKey(tenantId);
        publicVapidKey = data.publicKeyVapid;
        if (!publicVapidKey) throw new Error("empty publicKeyVapid");
      } catch (error: unknown) {
        const e = error as { response?: { status?: number; data?: unknown }; message?: string };
        logger.error("Web Push: falha ao obter VAPID key", { status: e?.response?.status, data: e?.response?.data, message: e?.message });
        toast.error(t("vapidError"));
        return;
      }

      // `serviceWorker.ready` nativo nunca resolve sem SW registrado — o clique
      // ficava pendurado sem toast e o singleton acima nunca era liberado.
      const registration = await waitServiceWorkerReady(15000);
      if (!registration) {
        logger.error("Web Push: serviceWorker.ready não resolveu (sem SW ativo?)");
        toast.error(t("serviceWorkerError"));
        return;
      }

      let subscription: PushSubscription;
      try {
        const existing = await registration.pushManager.getSubscription();
        if (existing) await existing.unsubscribe().catch(() => {});

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicVapidKey) as any,
        });
      } catch (error: unknown) {
        const e = error as { name?: string; message?: string };
        logger.error("Web Push: pushManager.subscribe falhou", { name: e?.name, message: e?.message });
        toast.error(t("subscribeBrowserError"));
        return;
      }

      try {
        const deviceInfo = getDeviceInfo();
        await saveUserSubscription(subscription, deviceInfo);

        localStorage.setItem(pushFlagKey(tenantId), JSON.stringify(subscription));
        setSubscribed(true);
        // Toast de sucesso só no clique: a reinscrição automática do boot é
        // rotina (depois de "Atualizar agora", troca de usuário, rotação de
        // endpoint) e não pede atenção de ninguém.
        if (isUserGesture) toast.success(t("subscribeSuccess"));
      } catch (error: unknown) {
        const e = error as { response?: { status?: number; data?: unknown }; message?: string };
        logger.error("Web Push: falha ao salvar subscription no servidor", { status: e?.response?.status, data: e?.response?.data, message: e?.message });
        toast.error(t("saveSubscriptionError"));
      }
    } finally {
      subscribeInFlight = false;
    }
  }, [tenantId, t]);

  // Self-heal no PWA: a flag do localStorage NÃO prova que o navegador ainda
  // tem assinatura. "Atualizar agora" desregistra o service worker (a assinatura
  // morre junto), o navegador pode rotacionar o endpoint, a chave VAPID do
  // tenant pode ter sido regenerada e outro usuário pode ter usado o aparelho.
  // Em todos esses casos a flag continuava dizendo "inscrito" e ninguém refazia
  // a assinatura — no iPhone, onde o PWA é o único lugar com push, o sintoma era
  // "iOS não recebe". Só roda com permissão já concedida: nunca abre o prompt
  // nativo sem gesto do usuário.
  const verifySubscription = useCallback(async (force = false) => {
    if (!isPWA || !tenantId || !isPushSupported()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (verifyInFlight) return;
    const now = Date.now();
    if (!force && now - lastVerifyAt < VERIFY_MIN_INTERVAL_MS) return;
    verifyInFlight = true;
    lastVerifyAt = now;
    try {
      const registration = await waitServiceWorkerReady(15000);
      if (!registration) return;

      const current = await registration.pushManager.getSubscription();
      if (!current) {
        localStorage.removeItem(pushFlagKey(tenantId));
        setSubscribed(false);
        await subscribeToPush(false);
        return;
      }

      let serverKey: string | null = null;
      try {
        const { data } = await getPublicVapidKey(tenantId);
        serverKey = data?.publicKeyVapid ? normalizeVapidKey(data.publicKeyVapid) : null;
      } catch (error) {
        logger.warn("Web Push: self-heal sem a chave do servidor, mantendo a assinatura atual", error);
      }
      const localKey = applicationServerKeyToBase64Url(current.options?.applicationServerKey);
      if (serverKey && localKey && serverKey !== localKey) {
        // Chave do tenant mudou: toda assinatura feita com a antiga responde 403
        // para sempre. Refaz com a nova.
        await subscribeToPush(false);
        return;
      }

      const storedEndpoint = readStoredPushEndpoint(tenantId);
      if (storedEndpoint === current.endpoint) {
        setSubscribed(true);
        return;
      }

      if (storedEndpoint === null) {
        // Existe assinatura, mas nada prova que é deste usuário (flag limpa por
        // logout forçado ou troca de usuário no mesmo aparelho): rotaciona. O
        // endpoint antigo some do servidor com o 410 do próximo envio.
        await subscribeToPush(false);
        return;
      }

      // Endpoint rotacionado pelo navegador (pushsubscriptionchange): a chave e
      // o usuário são os mesmos, basta re-salvar no servidor.
      try {
        await saveUserSubscription(current, getDeviceInfo());
        localStorage.setItem(pushFlagKey(tenantId), JSON.stringify(current));
        setSubscribed(true);
      } catch (error) {
        logger.error("Web Push: falha ao re-salvar assinatura rotacionada", error);
      }
    } catch (error) {
      logger.error("Web Push: verificação da assinatura falhou", error);
    } finally {
      verifyInFlight = false;
    }
  }, [isPWA, tenantId, subscribeToPush]);

  useEffect(() => {
    verifySubscription();
  }, [verifySubscription]);

  // O service worker avisa quando o navegador rotacionou a assinatura com o app
  // aberto (handler `pushsubscriptionchange` em app/sw.ts).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") verifySubscription(true);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [verifySubscription]);

  return { subscribed, isPWA, subscribeToPush };
}
