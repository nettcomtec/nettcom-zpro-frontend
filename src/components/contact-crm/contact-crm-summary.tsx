"use client";

import type { ElementType, ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarClock, Info, MessagesSquare, Tag, Target, TrendingDown, TrendingUp, Wallet, Briefcase,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RatingStars } from "@/components/contact-crm/rating-stars";
import { useLiveMode } from "@/hooks/use-live-mode";
import { getReadableTextColor } from "@/lib/color-contrast";
import { formatCurrencyBRL, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContactCrmSummary as ContactCrmSummaryData } from "@/services/contact-crm";

// PLANO_CRM_CONTATO — Fase 1 (D2/D3/D15). Aba Perfil da página /contatos/[contactId].
// Cartões no visual do StatCard, mas próprios: o StatCard não aceita conteúdo extra
// (estrelas) nem ofuscar só o valor no modo apresentação.

const DEFAULT_TAG_COLOR = "#3B82F6";

/** Somas do backend podem chegar como string (SUM do Postgres) — nunca confiar no tipo. */
function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface SummaryStatProps {
  title: string;
  value: string;
  icon: ElementType;
  sub?: string;
  /** Valor de cliente (moeda): ofuscado no modo apresentação */
  blur?: boolean;
  /** Valor é um texto de ausência ("Sem atendimentos") — fonte menor e apagada */
  placeholder?: boolean;
  children?: ReactNode;
}

function SummaryStat({ title, value, icon: Icon, sub, blur, placeholder, children }: SummaryStatProps) {
  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="p-4 h-full flex flex-col justify-between gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground leading-tight">{title}</p>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div className="min-w-0">
          <p
            className={cn(
              "tracking-tight tabular-nums break-words",
              placeholder ? "text-base font-medium text-muted-foreground" : "text-2xl font-bold",
              blur && "live-blur-text"
            )}
          >
            {value}
          </p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export interface ContactCrmSummaryProps {
  summary: ContactCrmSummaryData;
  className?: string;
}

export function ContactCrmSummary({ summary, className }: ContactCrmSummaryProps) {
  const t = useTranslations("contactCrm");
  const { isLiveMode } = useLiveMode();

  const ticketsTotal = toNumber(summary.tickets?.total);
  const ticketsOpen = toNumber(summary.tickets?.openNow);
  const tags = Array.isArray(summary.tags) ? summary.tags : [];
  const wallets = Array.isArray(summary.wallets) ? summary.wallets : [];
  const opp = summary.opportunities;

  const rating = opp?.rating;
  const stars = rating?.stars == null ? null : toNumber(rating?.stars);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryStat
          title={t("tickets")}
          value={formatNumber(ticketsTotal)}
          icon={MessagesSquare}
          sub={t("openNow", { count: ticketsOpen })}
        />
        <SummaryStat
          title={t("customerSince")}
          value={summary.firstContactAt ? formatDate(summary.firstContactAt) : t("noConversation")}
          placeholder={!summary.firstContactAt}
          icon={CalendarClock}
        />

        {opp && (
          <>
            <SummaryStat
              title={t("sales")}
              value={formatCurrencyBRL(toNumber(opp.wonValue))}
              icon={TrendingUp}
              sub={t("wonCount", { count: toNumber(opp.won) })}
              blur={isLiveMode}
            >
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                {stars != null ? (
                  <>
                    <RatingStars stars={stars} size="sm" label={t("rating")} />
                    <span className="text-xs text-muted-foreground">
                      {t("ratingConversion", {
                        percent: Math.round(toNumber(rating?.conversion) * 100),
                        won: toNumber(opp.won),
                        closed: toNumber(rating?.closedCount),
                      })}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("notEnoughHistory")}</span>
                )}
              </div>
            </SummaryStat>
            <SummaryStat
              title={t("openOpportunities")}
              value={formatCurrencyBRL(toNumber(opp.openValue))}
              icon={Target}
              sub={t("openCount", { count: toNumber(opp.open) })}
              blur={isLiveMode}
            />
            <SummaryStat
              title={t("lostValue")}
              value={formatCurrencyBRL(toNumber(opp.lostValue))}
              icon={TrendingDown}
              sub={t("lostCount", { count: toNumber(opp.lost) })}
              blur={isLiveMode}
            />
            <SummaryStat
              title={t("opportunities")}
              value={formatNumber(toNumber(opp.created))}
              icon={Briefcase}
              sub={t("createdCount", { count: toNumber(opp.created) })}
            />
          </>
        )}
      </div>

      {opp?.scopedToOwn && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>{t("scopedToOwn")}</span>
        </p>
      )}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              {t("tags")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const color = tag.color || DEFAULT_TAG_COLOR;
                  return (
                    <Badge
                      key={tag.id}
                      className="max-w-full truncate"
                      style={{ backgroundColor: color, color: getReadableTextColor(color) }}
                    >
                      {tag.tag}
                    </Badge>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noTags")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              {t("wallets")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {wallets.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {wallets.map((wallet) => (
                  <Badge key={wallet.id} variant="outline" className="max-w-full truncate">
                    {wallet.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noWallet")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ContactCrmSummary;
