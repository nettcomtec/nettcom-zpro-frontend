"use client";

// PLANO_CRM_CONTATO — Fase 1 (D15). Cartão resumido do cliente para a aba Perfil do
// painel do atendimento (coluna de 360px). Some em silêncio quando o usuário não tem
// acesso, o contato não existe, o backend é antigo (rota ausente) ou a carga falha.

import { useEffect, useState, type ElementType, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarClock, ChevronRight, MessagesSquare, Target, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RatingStars } from "@/components/contact-crm/rating-stars";
import { useLiveMode } from "@/hooks/use-live-mode";
import { formatCurrencyBRL, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { loadContactCrmSummary, type ContactCrmLoadState } from "@/services/contact-crm";

export interface ContactCrmCardProps {
  contactId: number;
  /** Ticket aberto no painel — dica para o backend liberar quem está atendendo */
  ticketId?: number | null;
  className?: string;
}

type CardState = ContactCrmLoadState | { status: "loading" };

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function CardRow({ icon: Icon, label, children }: { icon: ElementType; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/40 last:border-b-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-[3px]" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-1">{label}</div>
        {children}
      </div>
    </div>
  );
}

export function ContactCrmCard({ contactId, ticketId, className }: ContactCrmCardProps) {
  const t = useTranslations("contactCrm");
  const { isLiveMode } = useLiveMode();
  const [state, setState] = useState<CardState>({ status: "loading" });

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    setState({ status: "loading" });
    loadContactCrmSummary(contactId, { ticketId, background: true })
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      // Troca de ticket/contato antes da resposta: a resposta antiga é descartada.
      cancelled = true;
    };
  }, [contactId, ticketId]);

  if (!contactId) return null;

  if (state.status === "loading") {
    return (
      <Card className={className}>
        <CardHeader className="py-2">
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent className="py-2 pt-0 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (state.status !== "ok") return null;

  const summary = state.data;
  const opp = summary.opportunities;
  const stars = opp?.rating?.stars == null ? null : toNumber(opp?.rating?.stars);

  return (
    <Card className={className}>
      <CardHeader className="py-2">
        <CardTitle className="text-sm">{t("cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="py-2 pt-0">
        <CardRow icon={MessagesSquare} label={t("tickets")}>
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm leading-snug">
            <span className="font-medium tabular-nums">{formatNumber(toNumber(summary.tickets?.total))}</span>
            <span className="text-xs text-muted-foreground">
              {t("openNow", { count: toNumber(summary.tickets?.openNow) })}
            </span>
          </div>
        </CardRow>

        <CardRow icon={CalendarClock} label={t("customerSince")}>
          <div className={cn("text-sm leading-snug", !summary.firstContactAt && "text-muted-foreground")}>
            {summary.firstContactAt ? formatDate(summary.firstContactAt) : t("noConversation")}
          </div>
        </CardRow>

        {opp && (
          <>
            <CardRow icon={TrendingUp} label={t("sales")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug">
                <span className={cn("font-medium tabular-nums", isLiveMode && "live-blur-text")}>
                  {formatCurrencyBRL(toNumber(opp.wonValue))}
                </span>
                {stars != null ? (
                  <RatingStars stars={stars} size="sm" label={t("rating")} />
                ) : (
                  <span className="text-xs text-muted-foreground">{t("notEnoughHistory")}</span>
                )}
              </div>
            </CardRow>

            <CardRow icon={Target} label={t("openOpportunities")}>
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm leading-snug">
                <span className={cn("font-medium tabular-nums", isLiveMode && "live-blur-text")}>
                  {formatCurrencyBRL(toNumber(opp.openValue))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("openCount", { count: toNumber(opp.open) })}
                </span>
              </div>
            </CardRow>

            {opp.scopedToOwn && (
              <p className="pt-1 text-[11px] leading-snug text-muted-foreground">{t("scopedToOwn")}</p>
            )}
          </>
        )}

        <Button asChild variant="outline" size="sm" className="w-full mt-2">
          <Link href={ticketId ? `/contatos/${contactId}?ticketId=${ticketId}` : `/contatos/${contactId}`}>
            {t("viewFullProfile")}
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default ContactCrmCard;
