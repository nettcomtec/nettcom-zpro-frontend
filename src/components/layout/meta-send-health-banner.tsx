"use client";

// Faixa global do alerta de envio dos canais WABA (docs/PLANO_ALERTA_PAGAMENTO_WABA.md, F3):
// a Meta recusou mensagem por falha na forma de pagamento da conta (131042) ou está
// bloqueando o envio (health_status BLOCKED). Só monta para quem pode resolver (D2: admin,
// superadmin e custom com sessions_manage) — os demais perfis não buscam, não assinam o
// socket e veem só o motivo no tique da mensagem. `limited` fica fora da faixa (é aviso do
// card e do painel do canal).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CreditCard, ExternalLink, Loader2, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { markMetaPaymentResolved, type MetaSendHealthRow } from "@/services/meta-send-health";
import {
  META_PAYMENT_HELP_URL,
  WHATSAPP_MANAGER_URL,
  refreshMetaSendHealth,
  useCanResolveMetaSendHealth,
  useMetaChannelsHref,
  useMetaSendHealth,
} from "@/lib/meta-send-health";

const DISMISS_MS = 24 * 60 * 60 * 1000;
// O backend emite quando um alerta começa, termina ou muda; vários chegam juntos quando a
// WABA tem mais de um número ou o "Já resolvi" limpa mais de uma conta — uma busca só.
const SOCKET_COALESCE_MS = 1000;

interface DismissRecord {
  sig: string;
  until: number;
}

type TenantKey = number | string | null | undefined;

function hasTenant(tenantId: TenantKey): tenantId is number | string {
  return tenantId !== null && tenantId !== undefined && tenantId !== "";
}

function dismissKey(tenantId: number | string): string {
  return `metaSendHealthDismissed:${tenantId}`;
}

function readDismiss(tenantId: TenantKey): DismissRecord | null {
  if (!hasTenant(tenantId)) return null;
  try {
    const raw = localStorage.getItem(dismissKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DismissRecord> | null;
    const until = Number(parsed?.until);
    if (!parsed || typeof parsed.sig !== "string" || !Number.isFinite(until)) return null;
    return { sig: parsed.sig, until };
  } catch {
    return null;
  }
}

function writeDismiss(tenantId: TenantKey, record: DismissRecord): void {
  if (!hasTenant(tenantId)) return;
  try {
    localStorage.setItem(dismissKey(tenantId), JSON.stringify(record));
  } catch {
    // Sem localStorage a dispensa vale só até recarregar a página.
  }
}

/** Assinatura do conjunto na faixa: canal novo ou tipo trocado faz a faixa reaparecer. */
function buildSignature(rows: MetaSendHealthRow[]): string {
  return rows
    .map((r) => `${r.whatsappId}:${r.kind}`)
    .sort()
    .join(",");
}

function channelLabel(row: MetaSendHealthRow): string {
  const name = row.whatsappName == null ? "" : String(row.whatsappName).trim();
  return name || String(row.phoneNumberId ?? "");
}

/** Um canal por WABA: o pagamento é da conta, e o "Já resolvi" de um canal limpa a WABA inteira. */
function pickResolveTargets(rows: MetaSendHealthRow[]): number[] {
  const seen = new Set<string>();
  const ids: number[] = [];
  for (const row of rows) {
    const wabaId = row.wabaId == null ? "" : String(row.wabaId).trim();
    const key = wabaId ? `waba:${wabaId}` : `channel:${row.whatsappId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(row.whatsappId);
  }
  return ids;
}

/** O interceptor rejeita com o próprio `response`: status em `err.status` ou `err.response.status`. */
function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
}

const TONES = {
  payment: {
    row: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",
    icon: "text-red-600 dark:text-red-400",
    text: "text-red-900 dark:text-red-200",
    link: "text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100",
    dismiss: "text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200",
  },
  blocked: {
    row: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
    icon: "text-amber-600 dark:text-amber-400",
    text: "text-amber-900 dark:text-amber-200",
    link: "text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100",
    dismiss: "text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200",
  },
} as const;

export function MetaSendHealthBanner() {
  const canResolve = useCanResolveMetaSendHealth();
  if (!canResolve) return null;
  return <MetaSendHealthBannerInner />;
}

function MetaSendHealthBannerInner() {
  const t = useTranslations("metaSendHealth");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const rows = useMetaSendHealth(true);
  const channelsHref = useMetaChannelsHref();

  const [dismiss, setDismiss] = useState<DismissRecord | null>(null);
  const [dismissLoaded, setDismissLoaded] = useState(false);
  const [resolving, setResolving] = useState(false);

  const aliveRef = useRef(true);
  const resolvingRef = useRef(false);
  const coalesceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Dispensa guardada por tenant, lida só no navegador. Até ler, a faixa não aparece
  // (sem piscar a faixa já dispensada quando o cache compartilhado chega antes).
  useEffect(() => {
    setDismiss(readDismiss(tenantId));
    setDismissLoaded(true);
  }, [tenantId]);

  // Tempo real: alerta que começa, termina ou muda refaz a busca (ignorando o cache de 60 s).
  useEffect(() => {
    if (!isAuthenticated || !tenantId) return;
    const socket = getSocket();
    if (!socket) return;
    const event = `${tenantId}:meta:send-health:update`;
    const handler = () => {
      if (coalesceRef.current) return;
      coalesceRef.current = setTimeout(() => {
        coalesceRef.current = null;
        void refreshMetaSendHealth(true);
      }, SOCKET_COALESCE_MS);
    };
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
      if (coalesceRef.current) {
        clearTimeout(coalesceRef.current);
        coalesceRef.current = null;
      }
    };
  }, [isAuthenticated, tenantId]);

  const paymentRows = rows.filter((r) => r.kind === "payment");
  const blockedRows = rows.filter((r) => r.kind === "blocked");
  const bannerRows = [...paymentRows, ...blockedRows];

  if (!dismissLoaded || bannerRows.length === 0) return null;

  const signature = buildSignature(bannerRows);
  if (dismiss && dismiss.sig === signature && dismiss.until > Date.now()) return null;

  const handleDismiss = () => {
    const record: DismissRecord = { sig: signature, until: Date.now() + DISMISS_MS };
    writeDismiss(tenantId, record);
    setDismiss(record);
  };

  const handleResolved = async () => {
    if (resolvingRef.current) return;
    const targets = pickResolveTargets(paymentRows);
    if (targets.length === 0) return;
    resolvingRef.current = true;
    setResolving(true);
    let failed = false;
    let forbidden = false;
    let stillFailing = false;
    try {
      for (const whatsappId of targets) {
        try {
          const { data } = await markMetaPaymentResolved(whatsappId);
          // A Meta ainda acusa falha de pagamento nessa WABA: o aviso fica (D10).
          if (data && typeof data === "object" && data.stillPaymentIssue === true) stillFailing = true;
        } catch (err) {
          // 403 (ERR_NO_PERMISSION) já tem toast global e vale para todas as contas.
          if (errorStatus(err) === 403) {
            forbidden = true;
            break;
          }
          failed = true;
        }
      }
      await refreshMetaSendHealth(true);
    } finally {
      resolvingRef.current = false;
      if (aliveRef.current) setResolving(false);
    }
    if (!aliveRef.current || forbidden) return;
    if (failed) toast.error(t("resolvedError"));
    else if (stillFailing) toast.warning(t("stillFailingToast"));
    else toast.success(t("resolvedToast"));
  };

  const hasPayment = paymentRows.length > 0;
  const hasBlocked = blockedRows.length > 0;

  const linkClass = (tone: keyof typeof TONES) =>
    cn("inline-flex items-center gap-1 underline underline-offset-2", TONES[tone].link);

  const dismissButton = (tone: keyof typeof TONES) => (
    <button
      type="button"
      onClick={handleDismiss}
      className={cn("mt-0.5 shrink-0 transition-colors", TONES[tone].dismiss)}
      aria-label={t("dismiss")}
      title={t("dismiss")}
    >
      <X className="h-4 w-4" />
    </button>
  );

  return (
    <div role="alert" className="text-sm">
      {hasPayment && (
        <div className={cn("border-b px-4 py-2 flex items-start gap-3", TONES.payment.row)}>
          <CreditCard className={cn("h-4 w-4 mt-0.5 shrink-0", TONES.payment.icon)} />
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={cn("min-w-0 break-words font-medium", TONES.payment.text)}>
              {t("bannerPayment", { channels: paymentRows.map(channelLabel).join(", ") })}
            </span>
            <a
              href={WHATSAPP_MANAGER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-0.5 font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            >
              {t("addPaymentCta")}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
            <a href={META_PAYMENT_HELP_URL} target="_blank" rel="noopener noreferrer" className={linkClass("payment")}>
              {t("howToCta")}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
            <button
              type="button"
              onClick={handleResolved}
              disabled={resolving}
              aria-busy={resolving || undefined}
              className={cn(linkClass("payment"), "disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline")}
            >
              {resolving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
              {t("resolvedCta")}
            </button>
            {channelsHref && (
              <Link href={channelsHref} className={linkClass("payment")}>
                {t("viewChannelsCta")}
              </Link>
            )}
          </div>
          {dismissButton("payment")}
        </div>
      )}
      {hasBlocked && (
        <div className={cn("border-b px-4 py-2 flex items-start gap-3", TONES.blocked.row)}>
          <ShieldAlert className={cn("h-4 w-4 mt-0.5 shrink-0", TONES.blocked.icon)} />
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={cn("min-w-0 break-words font-medium", TONES.blocked.text)}>
              {t("bannerBlocked", { channels: blockedRows.map(channelLabel).join(", ") })}
            </span>
            <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noopener noreferrer" className={linkClass("blocked")}>
              {t("openManagerCta")}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
            {channelsHref && (
              <Link href={channelsHref} className={linkClass("blocked")}>
                {t("viewChannelsCta")}
              </Link>
            )}
          </div>
          {!hasPayment && dismissButton("blocked")}
        </div>
      )}
    </div>
  );
}
