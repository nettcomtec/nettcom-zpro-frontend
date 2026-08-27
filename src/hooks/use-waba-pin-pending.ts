"use client";

import { useEffect, useState } from "react";
import { getPhoneById } from "@/services/waba-meta";

interface Args {
  type?: string;
  tokenAPI?: string | null;
  bmToken?: string | null;
  wabaVersion?: string | null;
  webhookOrigin?: string | null;
  enabled?: boolean;
}

const cache = new Map<string, boolean>();
const subscribers = new Set<() => void>();
let cacheVersion = 0;

function buildKey(tokenAPI: string, bmToken: string, wabaVersion: string) {
  return `${tokenAPI}|${bmToken.slice(-12)}|${wabaVersion}`;
}

function notifySubscribers() {
  cacheVersion++;
  subscribers.forEach((cb) => cb());
}

/**
 * Probes a WABA channel to see whether it still needs PIN registration
 * via Cloud API. Returns `pending = true` when Meta phone `status` is
 * `PENDING` (channel added to WABA but not registered for Cloud API yet)
 * — which corresponds to the "Pendente" badge shown in WhatsApp Manager.
 *
 * COEX/Embedded Signup channels (`webhookOrigin = "zdg_oauth"`) are skipped
 * since registration is managed automatically by Meta.
 *
 * Cache is keyed per (phoneNumberId, bmToken, wabaVersion). Successful
 * registration calls `invalidateWabaPinPendingCache({ phoneNumberId })`
 * which marks the cache as not-pending and notifies subscribed hooks
 * so the badge disappears immediately (Meta's `status` may take a few
 * minutes to propagate, but the local cache reflects the registration).
 */
export function useWabaPinPending({
  type,
  tokenAPI,
  bmToken,
  wabaVersion,
  webhookOrigin,
  enabled = true,
}: Args) {
  const [pending, setPending] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setVersion] = useState(cacheVersion);

  // Subscribe to cache invalidations so this hook re-renders when the
  // PIN registration succeeds elsewhere on the page.
  useEffect(() => {
    const cb = () => setVersion(cacheVersion);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  useEffect(() => {
    // COEX / Embedded Signup channels: Meta manages registration,
    // /register endpoint returns "Register endpoint is not available
    // for SMB businesses." — no badge.
    if (webhookOrigin === "zdg_oauth") {
      setPending(false);
      return;
    }
    if (!enabled || type !== "waba" || !tokenAPI || !bmToken) {
      setPending(null);
      return;
    }
    const version = wabaVersion || "v19.0";
    const key = buildKey(tokenAPI, bmToken, version);
    if (cache.has(key)) {
      setPending(cache.get(key)!);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getPhoneById({
      phoneNumberId: tokenAPI,
      wabaVersion: version,
      wabaToken: bmToken,
    })
      .then((res) => {
        if (cancelled) return;
        const d: any = (res as any)?.data ?? res;
        const info = d?.phone_info ?? d;
        const status = String(info?.status || "").toUpperCase();
        const platform = String(info?.platform_type || "").toUpperCase();
        const codeStatus = String(info?.code_verification_status || "").toUpperCase();
        // PIN registration applies to Cloud API numbers that are PENDING or
        // have an EXPIRED code_verification_status (PIN expired, needs renewal).
        // Non-CLOUD_API platforms are managed by Meta (no PIN flow).
        const isCloudApi = platform === "" || platform === "CLOUD_API";
        const needs =
          isCloudApi &&
          (status === "PENDING" || codeStatus === "EXPIRED");
        cache.set(key, needs);
        setPending(needs);
      })
      .catch(() => {
        if (cancelled) return;
        // Meta error (incl. SMB/COEX) → managed mode, no badge.
        cache.set(key, false);
        setPending(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // cacheVersion in deps so subscribers fire-and-rerun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, type, tokenAPI, bmToken, wabaVersion, webhookOrigin, cacheVersion]);

  return { pending, loading };
}

interface InvalidateOpts {
  phoneNumberId?: string;
  /**
   * Mark the channel as not-pending (optimistic update after a successful
   * registerPhone). Meta's `status` may stay `PENDING` for a few minutes
   * after registration; this prevents the badge from re-appearing on the
   * next probe.
   */
  markRegistered?: boolean;
}

export function invalidateWabaPinPendingCache(opts?: InvalidateOpts) {
  if (opts?.phoneNumberId) {
    const prefix = `${opts.phoneNumberId}|`;
    for (const key of [...cache.keys()]) {
      if (!key.startsWith(prefix)) continue;
      if (opts.markRegistered) {
        cache.set(key, false);
      } else {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
  notifySubscribers();
}
