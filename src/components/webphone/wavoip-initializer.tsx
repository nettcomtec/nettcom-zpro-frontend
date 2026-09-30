"use client";

/**
 * WaVoIPInitializer — espelho do webphone_novo.js (front legado).
 *
 * Regras de visibilidade (igual ao front legado):
 *  - superadmin → nunca inicializa
 *  - admin      → sempre inicializa (ignora blockWavoip)
 *  - user/super → inicializa somente se !usuario.blockWavoip
 *
 * Acima de todas elas vem o gate do TENANT (isWavoipEnabled = plano + interruptor
 * Tenant.wavoipEnabled): desligado, nada é inicializado e o SDK do CDN sequer é
 * baixado. O gate depende do fetch do tenant, por isso ele retorna false enquanto
 * `tenantConfigsLoaded` for false — caso contrário haveria uma janela de um
 * round-trip em que o script era injetado e o widget ficava na tela.
 *
 * O widget é NATIVO (CDN window.wavoipWebphone).
 * O botão do header controla show/hide via window.wavoip.settings.setShowWidgetButton().
 */

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { createWavoipCall, updateWavoipCall } from "@/services/wavoip";
import { fetchWhatsapps } from "@/services/whatsapp";

declare global {
  interface Window {
    wavoipWebphone?: {
      render: (opts: Record<string, unknown>) => Promise<unknown>;
      destroy: () => void;
    };
    wavoip?: {
      device: { add: (token: string) => void };
      call: {
        startCall: (phone: string, tokens: string[]) => Promise<unknown>;
        onOffer: (cb: (data: unknown) => void) => void;
        getOffers: () => { id: string; status?: string; peer?: { phone?: string } }[];
        getCallActive: () => { peer?: { phone?: string } } | null;
      };
      settings: { setShowWidgetButton: (show: boolean) => void };
    };
    __wavoipOnOfferLogRegistered?: boolean;
    __wavoipIncomingPollInterval?: ReturnType<typeof setInterval>;
  }
}

// Fixado em 1.4.5 — versão que a extensão ZDG usa e que INJETA áudio corretamente.
// O 1.6.0 (latest) refatorou o pipeline de áudio p/ AudioWorklets que NÃO repassam
// o MediaStream sintético (getUserMedia interceptado) → destinatário ouve silêncio.
const CDN_URL =
  "https://cdn.jsdelivr.net/npm/@wavoip/wavoip-webphone@1.4.5/dist/index.umd.min.js";

type OfferLog = {
  logId: number;
  startedAt: number;
  phone: string;
  lastStatus: string;
};

const incomingOfferLogs = new Map<string, OfferLog>();

function startIncomingOfferPolling() {
  if (window.__wavoipIncomingPollInterval) return;
  window.__wavoipIncomingPollInterval = setInterval(() => {
    if (!window.wavoip?.call?.getOffers || !window.wavoip?.call?.getCallActive) return;
    const offers = window.wavoip.call.getOffers() || [];
    const callActive = window.wavoip.call.getCallActive();
    const duration = (meta: OfferLog) => Math.round((Date.now() - meta.startedAt) / 1000);

    for (const [offerId, meta] of incomingOfferLogs.entries()) {
      const offer = offers.find((o) => o.id === offerId);
      const status = (offer?.status || "").toLowerCase();
      const update = (payload: { callStatus?: string; callDuration?: number }) => {
        updateWavoipCall(meta.logId, payload).catch(() => {});
      };
      const isActiveCall = callActive?.peer?.phone === meta.phone;

      if (isActiveCall) {
        if (meta.lastStatus !== "active") {
          meta.lastStatus = "active";
          update({ callStatus: "active", callDuration: duration(meta) });
        }
      } else if (meta.lastStatus === "active") {
        incomingOfferLogs.delete(offerId);
        update({ callStatus: "ended", callDuration: duration(meta) });
      } else if (offer) {
        if (status !== meta.lastStatus) {
          meta.lastStatus = status;
          const finalStatuses = ["ended", "rejected", "disconnected", "not_answered"];
          if (finalStatuses.includes(status)) {
            incomingOfferLogs.delete(offerId);
            update({ callStatus: status, callDuration: duration(meta) });
          } else {
            update({ callStatus: status || "ringing" });
          }
        }
      } else {
        incomingOfferLogs.delete(offerId);
        update({ callStatus: "ended", callDuration: duration(meta) });
      }
    }
  }, 1500);
}

export function WaVoIPInitializer() {
  const { user } = useAuthStore();
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());
  const initializedRef = useRef(false);

  useEffect(() => {
 // superadmin nunca usa WaVoIP (igual ao front legado)
    if (user?.profile === "superadmin") return;

    // Gate do tenant (plano + Tenant.wavoipEnabled) — antes de qualquer outra coisa,
    // inclusive do carregamento do script do CDN.
    if (!wavoipEnabled) return;

    // admin → sempre inicializa; user/super → verifica blockWavoip
    const isAdmin = user?.profile === "admin";
    if (!isAdmin && user?.blockWavoip) return;

    if (initializedRef.current) return;

 // Busca sessões do WhatsApp para obter tokens WaVoIP (igual ao front legado: watchEffect sobre inboxes)
    const initWithSessions = async () => {
      if (initializedRef.current) return;

      let sessionTokens: { token: string; inboxName: string }[] = [];
      try {
        const { data } = await fetchWhatsapps();
        const sessions = Array.isArray(data) ? data : [];
        for (const s of sessions) {
          if (!s.wavoipToken) continue;
          // wavoipToken pode ser CSV de tokens
          const tokens = s.wavoipToken.split(",").map((t) => t.trim()).filter(Boolean);
          for (const t of tokens) {
            sessionTokens.push({ token: t, inboxName: s.name });
          }
        }
      } catch {
        // sem sessões disponíveis
      }

      // Só inicializa se ao menos um canal tiver wavoipToken configurado
      if (sessionTokens.length === 0) return;

      initializedRef.current = true;

      // Mapa token → inboxName para onOffer
      const tokenMap: Record<string, string> = {};
      sessionTokens.forEach((t) => { tokenMap[t.token] = t.inboxName; });

 // Renderiza widget nativo com botão flutuante (igual ao front legado: startWavoip)
      const wavoipapi = await window.wavoipWebphone?.render({
        buttonPosition: { x: window.innerWidth - 80, y: window.innerHeight - 120 },
      });
      if (!wavoipapi) {
        initializedRef.current = false;
        return;
      }

 // Restaura visibilidade salva do botão flutuante (igual front legado: webphone_novo.js getWidgetButtonState)
      const savedVisible = localStorage.getItem("wavoipWidgetVisible");
      const isVisible = savedVisible !== null ? savedVisible === "true" : true; // default: visível
      window.wavoip?.settings?.setShowWidgetButton(isVisible);

      // Registra cada token/device
      for (const t of sessionTokens) {
        window.wavoip?.device.add(t.token);
      }

      // Listener de chamadas recebidas — registrado apenas uma vez globalmente
      if (!window.__wavoipOnOfferLogRegistered) {
        window.__wavoipOnOfferLogRegistered = true;
        startIncomingOfferPolling();

        window.wavoip?.call.onOffer((rawData) => {
          const data = rawData as {
            offer?: { id?: string; peer?: { phone?: string }; status?: string; device_token?: string };
            phone?: string; id?: string; peer?: { phone?: string };
            status?: string; device_token?: string;
          };
          const offer = data?.offer ?? data;
          if (!offer) return;

          const phone = (offer as { peer?: { phone?: string } }).peer?.phone || (data as { phone?: string }).phone || "";
          const deviceToken = (offer as { device_token?: string }).device_token || "";
          const inboxName = tokenMap[deviceToken] || "";
          const wavoipCallId = (offer as { id?: string }).id || "";

          createWavoipCall({
            direction: "incoming",
            phone,
            deviceToken,
            inboxName,
            callStatus: ((offer as { status?: string }).status || "ringing").toLowerCase(),
            tenantId: user?.tenantId,
            userId: user?.userId,
            ...(wavoipCallId && { wavoipCallId }),
          })
            .then((res) => {
              const logId = (res?.data as { id?: number })?.id;
              if (!logId || !wavoipCallId) return;
              incomingOfferLogs.set(wavoipCallId, {
                logId,
                startedAt: Date.now(),
                phone,
                lastStatus: ((offer as { status?: string }).status || "").toLowerCase(),
              });
            })
            .catch(() => {});
        });
      }
    };

    const runInit = () => {
      if (window.wavoipWebphone) {
        initWithSessions();
      } else if (!document.querySelector(`script[src="${CDN_URL}"]`)) {
        // Carrega o CDN somente uma vez
        const script = document.createElement("script");
        script.src = CDN_URL;
        script.async = true;
        script.onload = () => initWithSessions();
        document.head.appendChild(script);
      } else {
        // Script já no DOM mas wavoipWebphone ainda não disponível — aguarda
        const check = setInterval(() => {
          if (window.wavoipWebphone) { clearInterval(check); initWithSessions(); }
        }, 200);
      }
    };

    runInit();

    return () => {
      if (window.__wavoipIncomingPollInterval) {
        clearInterval(window.__wavoipIncomingPollInterval);
        window.__wavoipIncomingPollInterval = undefined;
      }
      window.__wavoipOnOfferLogRegistered = false;
      incomingOfferLogs.clear();
      // Desmonta o widget nativo. Sem isso, desligar o WaVoIP no tenant deixava o
      // botão flutuante na tela até o próximo reload: o cleanup só zerava o ref e o
      // SDK já renderizado seguia vivo no DOM.
      if (initializedRef.current) {
        try {
          window.wavoip?.settings?.setShowWidgetButton(false);
          window.wavoipWebphone?.destroy();
        } catch {
          // teardown é best-effort — SDK pode já ter sido descarregado
        }
      }
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profile, user?.blockWavoip, wavoipEnabled]);

  return null;
}
