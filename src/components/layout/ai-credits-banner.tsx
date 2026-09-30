"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Coins, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCentsBRL } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { useNotificationSocket } from "@/hooks/use-notification-socket";
import { fetchAiCreditsStatus } from "@/services/ai-credits";

/**
 * A página /creditos-ia já carrega o status; em vez de a faixa refazer o request, a
 * página anuncia o que leu por este evento (zero chamada extra).
 */
export const AI_CREDITS_STATUS_EVENT = "zpro:ai-credits-status";

export interface AiCreditsStatusEventDetail {
  enabled: boolean;
  balanceCents: number;
  lowBalanceCents: number;
}

export function announceAiCreditsStatus(detail: AiCreditsStatusEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AiCreditsStatusEventDetail>(AI_CREDITS_STATUS_EVENT, { detail }));
}

const DISMISS_MS = 24 * 60 * 60 * 1000;
// Várias notificações chegam juntas (saldo baixo + zerado): uma busca só.
const NOTIFICATION_COALESCE_MS = 1000;
// Com a faixa na tela, voltar para a aba revalida o saldo — quem pagou em outra aba
// não fica olhando um aviso vencido. Teto de uma busca a cada 5 minutos.
const VISIBLE_REFRESH_MIN_MS = 5 * 60 * 1000;

function dismissKey(tenantId: number | string | undefined): string {
  return `aiCreditsBannerDismissedUntil:${tenantId ?? "0"}`;
}

function readDismissedUntil(tenantId: number | string | undefined): number {
  try {
    const raw = localStorage.getItem(dismissKey(tenantId));
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeDismissedUntil(tenantId: number | string | undefined, until: number): void {
  try {
    localStorage.setItem(dismissKey(tenantId), String(until));
  } catch {
    // Sem localStorage a dispensa vale só até recarregar a página.
  }
}

/**
 * Faixa de saldo dos Créditos de IA. O gate vem ANTES de tudo: empresa sem o recurso,
 * perfil que não gerencia créditos e superadmin não montam o componente interno — sem
 * request, sem listener de socket, sem nada na tela.
 */
export function AiCreditsBanner() {
  const allowed = useAuthStore((s) => {
    if (!s.isAiCreditsEnabled() || !s.canManageAiCredits()) return false;
    // Painel travado (inadimplência, troca de senha, termos): o servidor recusa tudo —
    // a busca só geraria erro.
    if (s.paymentOverdue || s.billingState === "blocked") return false;
    if (s.user?.mustChangePassword || s.user?.resellerTermsPending) return false;
    return true;
  });
  if (!allowed) return null;
  return <AiCreditsBannerInner />;
}

function AiCreditsBannerInner() {
  const t = useTranslations("aiCreditsBanner");
  const pathname = usePathname();
  const tenantId = useAuthStore((s) => s.user?.tenantId);

  const [status, setStatus] = useState<AiCreditsStatusEventDetail | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState(0);

  const aliveRef = useRef(true);
  const fetchedRef = useRef(false);
  const lastFetchRef = useRef(0);
  const coalesceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    lastFetchRef.current = Date.now();
    try {
      const { data } = await fetchAiCreditsStatus({ silent: true });
      if (!aliveRef.current) return;
      setStatus({
        enabled: data?.enabled === true,
        balanceCents: Number(data?.balanceCents) || 0,
        lowBalanceCents: Number(data?.lowBalanceCents) || 0,
      });
    } catch {
      // Chamada automática: falha (servidor antigo, rede, recurso desligado) = sem faixa.
      if (aliveRef.current) setStatus(null);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (coalesceRef.current) clearTimeout(coalesceRef.current);
    };
  }, []);

  // Busca UMA vez ao montar (o ref segura a montagem dupla do modo de desenvolvimento).
  useEffect(() => {
    setDismissedUntil(readDismissedUntil(tenantId));
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void load();
  }, [load, tenantId]);

  // Refaz quando chega aviso de Créditos de IA no sino (saldo baixo, zerado, recarga).
  useNotificationSocket({
    onNotification: (n) => {
      if (n.source !== "ai_credits") return;
      if (coalesceRef.current) clearTimeout(coalesceRef.current);
      coalesceRef.current = setTimeout(() => {
        coalesceRef.current = null;
        void load();
      }, NOTIFICATION_COALESCE_MS);
    },
  });

  // A página de créditos anuncia o status que ela mesma leu.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AiCreditsStatusEventDetail>).detail;
      if (!detail || typeof detail.balanceCents !== "number") return;
      setStatus({
        enabled: detail.enabled === true,
        balanceCents: detail.balanceCents,
        lowBalanceCents: Number(detail.lowBalanceCents) || 0,
      });
    };
    window.addEventListener(AI_CREDITS_STATUS_EVENT, handler);
    return () => window.removeEventListener(AI_CREDITS_STATUS_EVENT, handler);
  }, []);

  const active = !!status && status.enabled;
  const balanceCents = status?.balanceCents ?? 0;
  const isZero = active && balanceCents <= 0;
  const isLow = active && !isZero && balanceCents <= (status?.lowBalanceCents ?? 0);
  const hasWarning = isZero || isLow;

  // Só com aviso na tela: ao voltar para a aba, revalida (com teto de frequência).
  useEffect(() => {
    if (!hasWarning) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current < VISIBLE_REFRESH_MIN_MS) return;
      void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [hasWarning, load]);

  if (!hasWarning) return null;
  if (isLow && dismissedUntil > Date.now()) return null;

  const onPage = pathname === "/creditos-ia";

  const handleDismiss = () => {
    const until = Date.now() + DISMISS_MS;
    writeDismissedUntil(tenantId, until);
    setDismissedUntil(until);
  };

  return (
    <div
      role={isZero ? "alert" : "status"}
      className={cn(
        "border-b px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
        isZero
          ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
          : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
      )}
    >
      {isZero ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Coins className="h-4 w-4 shrink-0" />}
      <span className="flex-1 min-w-0">
        {isZero ? t("zero") : t("low")}
        {isLow && (
          <span className="ml-1.5 font-semibold tabular-nums whitespace-nowrap">
            {formatCentsBRL(balanceCents)}
          </span>
        )}
      </span>
      {!onPage && (
        <Link
          href="/creditos-ia"
          className={cn(
            "shrink-0 font-medium underline underline-offset-2 hover:opacity-80",
            isZero && "rounded-md bg-red-600 px-2.5 py-1 text-white no-underline hover:bg-red-700 hover:opacity-100 dark:bg-red-700 dark:hover:bg-red-600"
          )}
        >
          {t("addBalance")}
        </Link>
      )}
      {isLow && (
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 hover:opacity-70 transition-opacity"
          aria-label={t("dismiss")}
          title={t("dismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
