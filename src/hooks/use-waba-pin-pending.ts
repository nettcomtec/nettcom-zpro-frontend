"use client";

import { useEffect, useState } from "react";
import { getPhoneById } from "@/services/waba-meta";
import { fetchWabaPhoneStateById } from "@/lib/waba-phone-quality";

interface Args {
  type?: string;
  tokenAPI?: string | null;
  bmToken?: string | null;
  wabaVersion?: string | null;
  webhookOrigin?: string | null;
  /**
   * WABA do canal. Só o canal `zdg_oauth` usa: o pendente dele sai da mesma
   * consulta de qualidade que o card já faz (lista de números do WABA, cache de
   * 5 min). Sem ele, o canal `zdg_oauth` segue sem aviso, como antes.
   */
  wabaId?: string | null;
  enabled?: boolean;
}

const cache = new Map<string, boolean>();
const subscribers = new Set<() => void>();
let cacheVersion = 0;
// Números registrados nesta aba (diálogo de PIN, /configuracoes/meta ou o registro
// automático do popup do Embedded Signup). A Meta leva minutos para tirar o número
// de PENDING; a marca impede o aviso de voltar na consulta seguinte.
const registeredMarks = new Set<string>();

function buildKey(tokenAPI: string, bmToken: string, wabaVersion: string) {
  return `${tokenAPI}|${bmToken.slice(-12)}|${wabaVersion}`;
}

function notifySubscribers() {
  cacheVersion++;
  subscribers.forEach((cb) => cb());
}

/** O número foi registrado nesta aba (marca do `invalidateWabaPinPendingCache`). */
export function isWabaPhoneMarkedRegistered(phoneNumberId?: string | null): boolean {
  return !!phoneNumberId && registeredMarks.has(String(phoneNumberId));
}

/**
 * Canal `zdg_oauth` (Embedded Signup pelo proxy): pendente = número em `PENDING`
 * que não está no app WhatsApp Business (`is_on_biz_app !== true` — coexistência é
 * gerenciada pela Meta), ou ON_PREMISE com `isOnPremiseRegistrable`. Lido da lista de números do WABA que a consulta de
 * qualidade já fez (sem chamada própria) e casado só pelo id do número. Respeita a
 * marca de registrado. Qualquer falha = sem aviso.
 */
export async function resolveZdgOauthPinPending(params: {
  tokenAPI?: string | null;
  bmToken?: string | null;
  wabaId?: string | null;
  wabaVersion?: string | null;
}): Promise<boolean> {
  const tokenAPI = (params.tokenAPI || "").trim();
  if (!tokenAPI || !params.bmToken || !params.wabaId) return false;
  if (registeredMarks.has(tokenAPI)) return false;
  const st = await fetchWabaPhoneStateById({
    bmToken: params.bmToken,
    tokenAPI,
    wabaId: params.wabaId,
    wabaVersion: params.wabaVersion,
    phoneId: tokenAPI,
  });
  if (!st.found) return false;
  if (registeredMarks.has(tokenAPI)) return false;
  if (st.is_on_biz_app === true) return false;
  return String(st.status || "").toUpperCase() === "PENDING" || isOnPremiseRegistrable(st);
}

/** Número reportado pela Meta na plataforma On-Premises. */
export function isWabaPhoneOnPremise(platformType?: string | null): boolean {
  return String(platformType || "").toUpperCase() === "ON_PREMISE";
}

const ON_PREMISE_UNREGISTRABLE_STATUSES = new Set(["BANNED", "DELETED", "MIGRATED"]);

/**
 * ON_PREMISE que pede o registro com PIN na Cloud API: a Meta desligou a API
 * On-Premises em 10/2025 e, até o registro, todo envio volta 133010. Só com PROVA de
 * que o número não está no app WhatsApp Business — coexistência desfeita também volta
 * ON_PREMISE (caso real: ON_PREMISE + is_on_biz_app true + NOT_VERIFIED), e nela o
 * registro é recusado e o "Definir novo PIN" gravaria um PIN no número do app. Exige
 * `is_on_biz_app === false` explícito e status que permita registro.
 */
function isOnPremiseRegistrable(st: { platform_type?: string; is_on_biz_app?: boolean; status?: string }): boolean {
  return (
    isWabaPhoneOnPremise(st.platform_type) &&
    st.is_on_biz_app === false &&
    !ON_PREMISE_UNREGISTRABLE_STATUSES.has(String(st.status || "").toUpperCase())
  );
}

/**
 * Pendente para número ON_PREMISE, lido da lista de números da WABA (a mesma
 * consulta em cache de 5 min do selo de qualidade; casada só pelo id). Sem WABA, sem
 * `is_on_biz_app` na resposta ou com falha = sem aviso, como antes. Nunca lança.
 */
export async function resolveOnPremisePinPending(params: {
  tokenAPI?: string | null;
  bmToken?: string | null;
  wabaId?: string | null;
  wabaVersion?: string | null;
}): Promise<boolean> {
  const tokenAPI = (params.tokenAPI || "").trim();
  if (!tokenAPI || !params.bmToken || !params.wabaId) return false;
  // Registrado nesta aba: a Meta leva minutos para trocar a plataforma.
  if (registeredMarks.has(tokenAPI)) return false;
  const st = await fetchWabaPhoneStateById({
    bmToken: params.bmToken,
    tokenAPI,
    wabaId: params.wabaId,
    wabaVersion: params.wabaVersion,
    phoneId: tokenAPI,
  });
  if (registeredMarks.has(tokenAPI)) return false;
  return st.found === true && isOnPremiseRegistrable(st);
}

/**
 * Probes a WABA channel to see whether it still needs PIN registration
 * via Cloud API. Returns `pending = true` when Meta phone `status` is
 * `PENDING` (channel added to WABA but not registered for Cloud API yet)
 * — which corresponds to the "Pendente" badge shown in WhatsApp Manager.
 *
 * Embedded Signup channels (`webhookOrigin = "zdg_oauth"`) derive the state
 * from the WABA phone list already fetched by the quality badge (no extra
 * request): pending = `PENDING` and not on the WhatsApp Business app
 * (coexistence is managed by Meta). Without `wabaId` they show no badge.
 *
 * Both paths also flag an `ON_PREMISE` number, but only with proof that it is
 * not on the WhatsApp Business app (`resolveOnPremisePinPending`).
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
  wabaId,
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
    // Embedded Signup (proxy): o estado vem da lista de números do WABA que a
    // consulta de qualidade já trouxe. Sem os dados para casar o número, sem aviso
    // (comportamento de antes).
    if (webhookOrigin === "zdg_oauth") {
      if (!enabled || type !== "waba" || !tokenAPI || !bmToken || !wabaId) {
        setPending(false);
        return;
      }
      if (registeredMarks.has(tokenAPI)) {
        setPending(false);
        return;
      }
      let cancelledZdg = false;
      setLoading(true);
      resolveZdgOauthPinPending({ tokenAPI, bmToken, wabaId, wabaVersion })
        .then((needs) => {
          if (!cancelledZdg) setPending(needs);
        })
        .catch(() => {
          if (!cancelledZdg) setPending(false);
        })
        .finally(() => {
          if (!cancelledZdg) setLoading(false);
        });
      return () => {
        cancelledZdg = true;
      };
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
      .then(async (res) => {
        if (cancelled) return;
        const d: any = (res as any)?.data ?? res;
        const info = d?.phone_info ?? d;
        const status = String(info?.status || "").toUpperCase();
        const platform = String(info?.platform_type || "").toUpperCase();
        const codeStatus = String(info?.code_verification_status || "").toUpperCase();
        // PIN registration applies to Cloud API numbers that are PENDING or
        // have an EXPIRED code_verification_status (PIN expired, needs renewal).
        // ON_PREMISE só com a prova de `resolveOnPremisePinPending` (fora do app
        // WhatsApp Business); NOT_APPLICABLE segue sem aviso.
        const isCloudApi = platform === "" || platform === "CLOUD_API";
        const needs = isWabaPhoneOnPremise(platform)
          ? await resolveOnPremisePinPending({ tokenAPI, bmToken, wabaId, wabaVersion })
          : isCloudApi && (status === "PENDING" || codeStatus === "EXPIRED");
        if (cancelled) return;
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
  }, [enabled, type, tokenAPI, bmToken, wabaVersion, webhookOrigin, wabaId, cacheVersion]);

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
    if (opts.markRegistered) registeredMarks.add(String(opts.phoneNumberId));
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
