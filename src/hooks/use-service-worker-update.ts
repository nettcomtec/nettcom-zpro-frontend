"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { disconnectSocket } from "@/lib/socket";
import { logger } from "@/lib/logger";
import { clearStoredPushFlags } from "@/lib/push-subscription";
import pkg from "../../package.json";

// Versão real do build (frontend/package.json) — antes era um "4.0.0" hardcoded
// que nunca mudava e deixava o check de versão morto.
const APP_VERSION: string = pkg.version;
const RELOAD_GUARD_KEY = "sw_reload_guard";
const RELOAD_GUARD_MAX = 2;
const RELOAD_GUARD_WINDOW_MS = 15000;
const JUST_UPDATED_KEY = "sw_just_updated";

function getReloadGuard(): { count: number; time: number } {
  try {
    const raw = sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (!raw) return { count: 0, time: 0 };
    const { count, time } = JSON.parse(raw);
    return { count: count || 0, time: time || 0 };
  } catch {
    return { count: 0, time: 0 };
  }
}

function setReloadGuard(count: number, time: number) {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ count, time }));
  } catch {
    // noop
  }
}

function reloadIfAllowed(): boolean {
  const now = Date.now();
  let { count, time } = getReloadGuard();
  if (now - time > RELOAD_GUARD_WINDOW_MS) count = 0;
  count += 1;
  if (count > RELOAD_GUARD_MAX) {
    setReloadGuard(0, 0);
    logger.warn(
      `[SW Update] Bloqueado reload em loop (máx. ${RELOAD_GUARD_MAX} em ${RELOAD_GUARD_WINDOW_MS / 1000}s)`
    );
    return false;
  }
  setReloadGuard(count, now);
  return true;
}

export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controllerChangeHandlerRef = useRef<(() => void) | null>(null);

  const checkVersionUpdate = useCallback(() => {
    const stored = localStorage.getItem("app_version");
    if (!stored) {
      localStorage.setItem("app_version", APP_VERSION);
      return false;
    }
    return stored !== APP_VERSION;
  }, []);

  const checkHashUpdate = useCallback(async () => {
    try {
      const timestamp = Date.now();
      const response = await fetch(`/?v=${timestamp}&_=${timestamp}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });
      if (response.ok) {
        const text = await response.text();
        // Usa os hashes reais dos chunks JS do Next.js — estáveis entre requests,
        // mudam apenas em builds novos. Evita falsos positivos por nonces/timestamps dinâmicos.
        const chunks = [...text.matchAll(/\/_next\/static\/[a-zA-Z0-9/_-]+\.js/g)]
          .map((m) => m[0])
          .sort()
          .join(",");
        if (!chunks) return false;
        const storedHash = localStorage.getItem("app_html_hash");
        if (storedHash && storedHash !== chunks) return true;
        localStorage.setItem("app_html_hash", chunks);
      }
    } catch {
      // silenciar erros de rede
    }
    return false;
  }, []);

  const checkForUpdates = useCallback(async () => {
    // Grace period: skip the first check after a user-triggered update reload.
    // This prevents the notification from reappearing immediately after "Atualizar agora".
    try {
      if (sessionStorage.getItem(JUST_UPDATED_KEY)) {
        sessionStorage.removeItem(JUST_UPDATED_KEY);
        localStorage.setItem("app_version", APP_VERSION);
        localStorage.removeItem("app_html_hash"); // force fresh baseline on next cycle
        return;
      }
    } catch {
      // noop
    }

    if (checkVersionUpdate()) {
      setUpdateAvailable(true);
      return;
    }

    const hashUpdate = await checkHashUpdate();
    if (hashUpdate) {
      setUpdateAvailable(true);
      return;
    }

    if (!("serviceWorker" in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      registrationRef.current = reg || null;
      if (!reg) return;

      const handleUpdateFound = () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
            registrationRef.current = reg;
          }
        });
      };

      reg.addEventListener("updatefound", handleUpdateFound);

      if (reg.waiting) {
        setUpdateAvailable(true);
        registrationRef.current = reg;
      }

      await reg.update();
    } catch (error) {
      logger.error("Erro ao verificar atualizações do service worker:", error);
    }
  }, [checkVersionUpdate, checkHashUpdate]);

  const updateServiceWorker = useCallback(async () => {
    const reg = registrationRef.current;
    if (reg?.waiting) {
      try {
        sessionStorage.setItem("sw_skip_waiting_sent", "1");
      } catch {
        // noop
      }
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }, []);

  const clearCacheAndReload = useCallback(async () => {
    if (!reloadIfAllowed()) {
      logger.warn("[SW Update] clearCacheAndReload ignorado (proteção contra loop)");
      return;
    }

    const forceReloadTimeout = setTimeout(() => {
      if (!reloadIfAllowed()) return;
      window.location.reload();
    }, 2000);

    try {
      // Flag para suprimir a notificação no primeiro check após o reload
      try { sessionStorage.setItem(JUST_UPDATED_KEY, "1"); } catch { /* noop */ }

      localStorage.setItem("app_version", APP_VERSION);

      if ("caches" in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.race([
            Promise.all(cacheNames.map((n) => caches.delete(n))),
            new Promise((r) => setTimeout(r, 2000)),
          ]);
        } catch {
          // continuar mesmo com erro
        }
      }

      localStorage.removeItem("app_html_hash");

      try {
        const savedGuard = getReloadGuard();
        const savedSkipWaiting = sessionStorage.getItem("sw_skip_waiting_sent");
        sessionStorage.clear();
        setReloadGuard(savedGuard.count, savedGuard.time);
        if (savedSkipWaiting) sessionStorage.setItem("sw_skip_waiting_sent", savedSkipWaiting);
        // Restore the just-updated flag so it survives the sessionStorage.clear()
        sessionStorage.setItem(JUST_UPDATED_KEY, "1");
      } catch {
        // noop
      }

      if ("indexedDB" in window) {
        try {
          const databases = await indexedDB.databases();
          for (const db of databases) {
            if (db.name && (db.name.includes("workbox") || db.name.includes("cache"))) {
              const req = indexedDB.deleteDatabase(db.name);
              await new Promise<void>((resolve) => {
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              });
            }
          }
        } catch {
          // continuar
        }
      }

      if ("serviceWorker" in navigator) {
        try {
          // Desregistrar o SW mata a assinatura de Web Push junto. Sem limpar a
          // flag, o PWA seguia achando que estava inscrito e ninguém refazia a
          // assinatura — o iPhone parava de receber push a cada versão nova.
          // Com a flag limpa, o self-heal do usePushNotifications reinscreve no
          // boot seguinte (permissão já concedida, sem prompt).
          clearStoredPushFlags();
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
          await new Promise((r) => setTimeout(r, 300));
        } catch {
          // continuar
        }
      }

      clearTimeout(forceReloadTimeout);

      try {
        await new Promise((r) => setTimeout(r, 200));
        try {
          await fetch(window.location.href, {
            method: "GET",
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
          });
        } catch {
          // ignorar
        }

        const baseUrl = window.location.origin + window.location.pathname;
        const hash = window.location.hash.split("?")[0] || "";
        const ts = Date.now();
        disconnectSocket();
        window.location.replace(`${baseUrl}${hash}?v=${ts}&_nocache=${ts}`);
      } catch {
        if (reloadIfAllowed()) window.location.reload();
      }
    } catch (error) {
      logger.error("Erro ao limpar cache:", error);
      clearTimeout(forceReloadTimeout);
      if (reloadIfAllowed()) window.location.reload();
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
    checkIntervalRef.current = setInterval(checkForUpdates, 2 * 60 * 1000);

    if ("serviceWorker" in navigator) {
      controllerChangeHandlerRef.current = () => {
        try {
          if (sessionStorage.getItem("sw_skip_waiting_sent") !== "1") return;
          sessionStorage.removeItem("sw_skip_waiting_sent");
          if (!reloadIfAllowed()) return;
          window.location.reload();
        } catch {
          // noop
        }
      };
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        controllerChangeHandlerRef.current
      );
    }

    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      if ("serviceWorker" in navigator && controllerChangeHandlerRef.current) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          controllerChangeHandlerRef.current
        );
      }
    };
  }, [checkForUpdates]);

  return { updateAvailable, updateServiceWorker, clearCacheAndReload };
}
