"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import {
  isNativeApp,
  getNativePlatform,
  getNativePlugin,
  FCM_TOKEN_STORAGE_KEY
} from "@/lib/native";
import { registerMobileDeviceToken } from "@/services/mobile";

// PLANO_APP_MOBILE §6.4 — dentro do app nativo: pede permissão de notificação,
// registra o token FCM no backend (best-effort; backend antigo sem as rotas
// /mobile/* responde 404 e o erro é engolido), re-registra quando o FCM
// rotaciona o token e abre o ticket ao tocar na notificação (deep-link que a
// página /atendimento já entende via ?ticketId=). No navegador comum é no-op
// absoluto: isNativeApp() false → efeito não roda e o componente rende null.
export function NativePushInitializer() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.userId);
  const listenersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!isNativeApp() || !userId) return;
    const messaging = getNativePlugin("FirebaseMessaging");
    if (!messaging) return;

    let cancelled = false;

    const register = async (tokenOverride?: string) => {
      try {
        let token = tokenOverride;
        if (!token) {
          const perm = await messaging.requestPermissions();
          if (perm?.receive !== "granted") return;
          token = (await messaging.getToken())?.token;
        }
        if (!token || cancelled) return;
        localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
        await registerMobileDeviceToken({
          token,
          platform: getNativePlatform()
        });
      } catch {
        // Sem rede ou backend sem as rotas novas: silencioso por design.
      }
    };

    register();

    (async () => {
      try {
        const h1 = await messaging.addListener("tokenReceived", (ev: any) => {
          if (ev?.token) register(ev.token);
        });
        const h2 = await messaging.addListener(
          "notificationActionPerformed",
          (ev: any) => {
            const ticketId = ev?.notification?.data?.ticketId;
            if (ticketId) router.push(`/atendimento?ticketId=${ticketId}`);
          }
        );
        listenersRef.current = [h1, h2];
      } catch {
        // Plugin sem suporte a listeners: registro simples continua valendo.
      }
    })();

    return () => {
      cancelled = true;
      listenersRef.current.forEach((h) => h?.remove?.());
      listenersRef.current = [];
    };
  }, [userId, router]);

  return null;
}
