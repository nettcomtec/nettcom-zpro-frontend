"use client";

import { useCallback, useEffect, useRef } from "react";
import { OAUTH_PROXY_URL } from "@/config/oauth-proxy";
import { waLinkInit, importWebSession, checkLicenseProxy } from "@/services/whatsapp";

/**
 * Passkey Linker (Abordagem B) — abre o popup do conector (wa-link.html no
 * oauth-proxy), recebe as credenciais do WhatsApp Web via postMessage
 * (`PLK_WA_CREDS`) e importa no backend, conectando o canal sem QR.
 *
 * Fluxo:
 *  1. Abre um popup EM BRANCO de forma sincrona (no clique) p/ nao ser bloqueado.
 *  2. Reusa o gate de licenca do front (checkLicenseProxy) + pede a linkUrl
 *     assinada ao backend (waLinkInit → proxy valida licenca de novo, Gate ①).
 *  3. Navega o popup para a linkUrl (dominio canonico do proxy).
 *  4. Escuta `message`: valida origin === proxy, type === PLK_WA_CREDS e o nonce.
 *  5. Importa as creds (importWebSession). O status "CONNECTED" chega pelo socket.
 *
 * O ID da extensao NAO vive aqui — quem conversa com a extensao e o wa-link.html.
 */

export interface WaLinkResult {
  status?: string;
}

export type WaLinkErrorCode =
  | "POPUP_BLOCKED"
  | "LICENSE"
  | "INIT_FAILED"
  | "IMPORT_FAILED";

interface OpenWaLinkOptions {
  whatsappId: number;
  onSuccess?: (result: WaLinkResult) => void;
  onError?: (code: WaLinkErrorCode) => void;
  onCancelled?: () => void;
  windowFeatures?: string;
}

function makeNonce(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore — fallback abaixo
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useWaLinkPopup() {
  const popupRef = useRef<Window | null>(null);
  const messageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const teardown = useCallback(() => {
    if (messageHandlerRef.current) {
      window.removeEventListener("message", messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  // Cleanup no unmount: fecha popup + remove listener/watchdog.
  useEffect(() => {
    return () => {
      teardown();
      if (popupRef.current && !popupRef.current.closed) {
        try {
          popupRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [teardown]);

  const open = useCallback(
    ({ whatsappId, onSuccess, onError, onCancelled, windowFeatures }: OpenWaLinkOptions) => {
      // A linkUrl pode voltar do proxy de FAILOVER (oauth2.*) quando o backend
      // não alcança o primário (OAuthProxyClient faz failover em erro de rede).
      // A origem esperada é definida pela linkUrl devolvida, restrita a esta
      // allowlist canônica — espelha os hosts hardcoded do OAuthProxyClientZPRO
      // e o externally_connectable da extensão PassKey.
      const ALLOWED_PROXY_ORIGINS = [
        "https://oauth.techprovider.com.br",
        "https://oauth2.techprovider.com.br",
        "https://oauth.passaportezdg.com.br",
        "https://oauth2.passaportezdg.com.br",
      ];
      let expectedOrigin = new URL(OAUTH_PROXY_URL).origin;
      const returnOrigin = typeof window !== "undefined" ? window.location.origin : "";
      const nonce = makeNonce();

      // 1) Popup EM BRANCO sincrono (gesto do usuario) — evita popup blocker.
      const features = windowFeatures || "width=480,height=720,resizable=yes,scrollbars=yes";
      const popup = window.open("", `plk_wa_${whatsappId}`, features);
      if (!popup) {
        onError?.("POPUP_BLOCKED");
        return;
      }
      popupRef.current = popup;

      // remove listener anterior, se houver
      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current);
        messageHandlerRef.current = null;
      }

      let done = false;
      const finish = () => {
        done = true;
        teardown();
      };

      // 4) Listener das creds vindas do wa-link.html
      const handler = (event: MessageEvent) => {
        if (event.origin !== expectedOrigin) return;
        const data = event.data as {
          type?: string;
          nonce?: string;
          whatsappId?: string | number;
          creds?: Record<string, unknown>;
        };
        if (!data || data.type !== "PLK_WA_CREDS") return;
        if (data.nonce !== nonce) return; // correlaciona com ESTE fluxo
        if (String(data.whatsappId) !== String(whatsappId)) return;
        if (!data.creds || done) return;

        finish();
        // Responde ao conector (wa-link.html) o desfecho da gravação. É esse retorno
        // que autoriza a extensão a apagar+fechar a aba do WhatsApp Web (via ACK).
        // Só confirmamos DEPOIS que o backend grava — nunca antes.
        const replyToConnector = (payload: Record<string, unknown>) => {
          try {
            popupRef.current?.postMessage({ ...payload, nonce }, expectedOrigin);
          } catch {
            // popup já fechado / cross-origin — ignore
          }
        };
        // 5) Importa no backend → canal conecta (status via socket)
        importWebSession(whatsappId, data.creds)
          .then(({ data: result }) => {
            replyToConnector({ type: "PLK_WA_SAVED" });
            onSuccess?.(result || {});
          })
          .catch(() => {
            replyToConnector({ type: "PLK_WA_FAILED", error: "IMPORT_FAILED" });
            onError?.("IMPORT_FAILED");
          });
      };
      window.addEventListener("message", handler);
      messageHandlerRef.current = handler;

      // Watchdog: popup fechado sem entregar → cancelado
      watchdogRef.current = setInterval(() => {
        if (popup.closed) {
          if (watchdogRef.current) {
            clearInterval(watchdogRef.current);
            watchdogRef.current = null;
          }
          if (!done) {
            finish();
            onCancelled?.();
          }
        }
      }, 500);

      // 2+3) Licenca (front) + linkUrl assinada (proxy) → navega o popup.
      (async () => {
        try {
          await checkLicenseProxy(); // reusa o gate de licenca do front
        } catch {
          if (done) return;
          finish();
          try { popup.close(); } catch { /* ignore */ }
          onError?.("LICENSE");
          return;
        }
        try {
          const { data } = await waLinkInit(whatsappId, { returnOrigin, nonce });
          if (done) return;
          if (!data?.linkUrl) {
            finish();
            try { popup.close(); } catch { /* ignore */ }
            onError?.("INIT_FAILED");
            return;
          }
          let linkOrigin = "";
          try { linkOrigin = new URL(data.linkUrl).origin; } catch { /* invalida */ }
          if (!ALLOWED_PROXY_ORIGINS.includes(linkOrigin)) {
            finish();
            try { popup.close(); } catch { /* ignore */ }
            onError?.("INIT_FAILED");
            return;
          }
          expectedOrigin = linkOrigin;
          try {
            popup.location.href = data.linkUrl;
          } catch {
            finish();
            onError?.("INIT_FAILED");
          }
        } catch (e: unknown) {
          if (done) return;
          finish();
          try { popup.close(); } catch { /* ignore */ }
          // 403 do proxy = licenca invalida
          const status = (e as { status?: number } | null)?.status;
          onError?.(status === 403 ? "LICENSE" : "INIT_FAILED");
        }
      })();
    },
    [teardown]
  );

  return { open };
}
