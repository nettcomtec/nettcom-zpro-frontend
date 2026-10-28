"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
//
// Canal sem som do Android: o push de quem desligou o som (botão do topo) ou de empresa com
// "Notificações sonoras" desligada sai com esse canal (backend/src/helpers/
// NotificationSoundPolicyZPRO.ts, `ANDROID_SILENT_CHANNEL_ID` — espelho). O som no Android 8+
// é do canal, e o plugin só cria canal sem som com importância baixa (2): o aviso aparece na
// lista, sem tocar nem vibrar. Recriar com o mesmo id só atualiza nome e descrição. Aparelho
// sem o canal (app aberto antes desta versão) recebe pelo canal padrão, com som.
const ANDROID_SILENT_CHANNEL_ID = "notifications_silent";

export function NativePushInitializer() {
  const router = useRouter();
  const t = useTranslations("layoutHeader");
  const userId = useAuthStore((s) => s.user?.userId);
  const listenersRef = useRef<any[]>([]);
  const silentChannelName = t("soundToggle.silentChannelName");
  const silentChannelDescription = t("soundToggle.silentChannelDescription");

  useEffect(() => {
    if (!isNativeApp() || !userId) return;
    if (getNativePlatform() !== "android") return;
    const messaging = getNativePlugin("FirebaseMessaging");
    if (!messaging || typeof messaging.createChannel !== "function") return;
    try {
      Promise.resolve(
        messaging.createChannel({
          id: ANDROID_SILENT_CHANNEL_ID,
          name: silentChannelName,
          description: silentChannelDescription,
          importance: 2,
          // Nome da tipagem do plugin; o código Android lê "vibrate" com padrão desligado.
          vibration: false,
        })
      ).catch(() => {});
    } catch {
      // Plugin sem o método no aparelho: o push segue pelo canal padrão.
    }
  }, [userId, silentChannelName, silentChannelDescription]);

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
            const data = ev?.notification?.data;
            const ticketId = data?.ticketId;
            if (ticketId) {
              router.push(`/atendimento?ticketId=${ticketId}`);
              return;
            }
            // Aviso sem atendimento (ex.: lembrete de tarefa): só caminho interno do painel
            // ("//" e "/\" virariam outro domínio na leitura da URL).
            const url = data?.url;
            if (typeof url === "string" && url.startsWith("/") && !/^\/[/\\]/.test(url)) {
              router.push(url);
            }
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
