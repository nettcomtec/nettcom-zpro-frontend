"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { getPublicVapidKey, saveUserSubscription } from "@/services/push-service";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

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

export function usePushNotifications() {
  const t = useTranslations("usePushNotifications");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId;
  const [subscribed, setSubscribed] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    setSubscribed(!!localStorage.getItem(`subscriptionData_${tenantId}`));
    setIsPWA(
      window.matchMedia("(display-mode: standalone)").matches ||
        !!(navigator as Navigator & { standalone?: boolean }).standalone
    );
  }, [tenantId]);

  // fromUserGesture: default true preserva o comportamento do clique em
  // PushNotifications.tsx (que passa o MouseEvent como 1º argumento — truthy);
  // o auto-subscribe do useEffect passa `false` explicitamente. Tipado como
  // unknown para continuar compatível com onClick={subscribeToPush}.
  const subscribeToPush = useCallback(async (fromUserGesture: unknown = true) => {
    if (subscribeInFlight) return;
    subscribeInFlight = true;
    try {
      const isUserGesture = fromUserGesture !== false;

      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) {
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

      let registration: ServiceWorkerRegistration;
      try {
        registration = await navigator.serviceWorker.ready;
      } catch (error) {
        logger.error("Web Push: serviceWorker.ready falhou", error);
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

        localStorage.setItem(`subscriptionData_${tenantId}`, JSON.stringify(subscription));
        setSubscribed(true);
        toast.success(t("subscribeSuccess"));
      } catch (error: unknown) {
        const e = error as { response?: { status?: number; data?: unknown }; message?: string };
        logger.error("Web Push: falha ao salvar subscription no servidor", { status: e?.response?.status, data: e?.response?.data, message: e?.message });
        toast.error(t("saveSubscriptionError"));
      }
    } finally {
      subscribeInFlight = false;
    }
  }, [tenantId, t]);

  // Auto-subscribe em modo PWA se ainda não inscrito — apenas quando a permissão
  // já foi concedida antes (nunca dispara o prompt nativo sem gesto do usuário).
  useEffect(() => {
    if (
      isPWA &&
      !subscribed &&
      tenantId &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      subscribeToPush(false);
    }
  }, [isPWA, subscribed, tenantId, subscribeToPush]);

  return { subscribed, isPWA, subscribeToPush };
}
