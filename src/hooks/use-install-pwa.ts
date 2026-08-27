"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INSTALLED_KEY = "pwa-installed";

export function useInstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(INSTALLED_KEY) === "1";
  });
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showOpenTip, setShowOpenTip] = useState(false);

  useEffect(() => {
    // iPadOS 13+ Safari manda UA de macOS (desktop-class browsing) — sem "iPad".
    // Detecta iPad por touch: Mac desktop tem maxTouchPoints 0/1, iPad > 1.
    const ios =
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) &&
      !(window as any).MSStream;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;

    setIsIOS(ios);
    setIsStandalone(standalone);
    setInstalled(standalone || localStorage.getItem(INSTALLED_KEY) === "1");

    if (standalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      localStorage.removeItem(INSTALLED_KEY);
      setInstalled(false);
    };

    const installedHandler = () => {
      localStorage.setItem(INSTALLED_KEY, "1");
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    if ("getInstalledRelatedApps" in navigator) {
      (navigator as any)
        .getInstalledRelatedApps()
        .then((apps: any[]) => {
          if (apps.length > 0) {
            localStorage.setItem(INSTALLED_KEY, "1");
            setInstalled(true);
          }
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const install = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        localStorage.setItem(INSTALLED_KEY, "1");
        setInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSInstructions(true);
    }
  }, [deferredPrompt, isIOS]);

  const canPromptInstall = !isStandalone && !installed && (!!deferredPrompt || isIOS);
  const canOpenApp = !isStandalone && installed;
  const showButton = !isStandalone;

  return {
    showButton,
    canPromptInstall,
    canOpenApp,
    install,
    isIOS,
    showIOSInstructions,
    setShowIOSInstructions,
    showOpenTip,
    setShowOpenTip,
  };
}
