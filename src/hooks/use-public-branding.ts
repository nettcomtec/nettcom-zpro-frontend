"use client";

import { useState, useEffect } from "react";
import api from "@/lib/api";
import { getLogoUrl, getLogoDarkUrl } from "@/lib/branding-urls";
import { loadAppFont, applyAvatarShape, type FontSource, type AvatarShape } from "@/lib/load-app-font";
import { useBrandingStore } from "@/stores/branding-store";

interface PublicBranding {
  appName: string;
  logoTimestamp: number;
  fontFamily?: string;
  fontWeights?: string;
  fontSource?: FontSource;
  avatarShape?: AvatarShape;
}

interface PublicBrandingResult extends PublicBranding {
  logoUrl: string;
  logoDarkUrl: string;
}

const STORAGE_KEY = "zpro-branding";

function readFromStorage(): PublicBranding {
  if (typeof window === "undefined") return { appName: "", logoTimestamp: 0 };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as PublicBranding;
  } catch { /* ignore */ }
  return { appName: "", logoTimestamp: 0 };
}

function getApiBaseUrl(): string {
  const env = (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_API_URL) || "";
  return env.replace(/\/$/, "");
}

function applyBrandingToDocument(b: PublicBranding) {
  if (b.fontFamily && b.fontWeights && b.fontSource) {
    loadAppFont({
      family: b.fontFamily,
      weights: b.fontWeights.split(","),
      source: b.fontSource,
      selfHostBaseUrl: `${getApiBaseUrl()}/api/fonts`,
    });
  }
  if (b.avatarShape) {
    applyAvatarShape(b.avatarShape);
  }
}

export function usePublicBranding(): PublicBrandingResult {
  const [branding, setBranding] = useState<PublicBranding>(readFromStorage);
  const setTypography = useBrandingStore((s) => s.setTypography);

  useEffect(() => {
    // Apply cached branding immediately to reduce font/shape flash
    applyBrandingToDocument(branding);

    const controller = new AbortController();
    api
      .get("/publicBrandingNovo", { signal: controller.signal })
      .then(({ data }) => {
        const b = data as PublicBranding;
        setBranding(b);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
        applyBrandingToDocument(b);
        if (b.fontFamily && b.fontWeights && b.fontSource && b.avatarShape) {
          setTypography({
            fontFamily: b.fontFamily,
            fontWeights: b.fontWeights,
            fontSource: b.fontSource,
            avatarShape: b.avatarShape,
          });
        }
      })
      .catch(() => {});
    return () => { controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Logo sempre via /publicLogo SEM ?t= (no-cache): retorna a logo ATUAL a cada
  // carga. Usar o ?t=<logoTimestamp> do cache aqui causava flash da logo antiga,
  // pois essa URL é servida como immutable por 1 ano — quando o timestamp do
  // localStorage está defasado em relação ao upload mais recente, o browser
  // entregava a logo antiga (cacheada) até o fetch chegar e só então trocava.
  return {
    ...branding,
    logoUrl: getLogoUrl(undefined),
    logoDarkUrl: getLogoDarkUrl(undefined),
  };
}
