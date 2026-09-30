"use client";

import { useTranslations } from "next-intl";
import { Coins, ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCentsBRL } from "@/lib/format";
import type { AiCreditsStatusResponse } from "@/services/ai-credits";

// Cartão de saldo dos Créditos de IA. Puramente de apresentação: quem busca o
// status, abre o diálogo de recarga e consulta o pagamento é a página — assim o
// saldo mostrado aqui é sempre o mesmo que a faixa do topo recebeu.

export interface BalanceCardProps {
  status: AiCreditsStatusResponse | null;
  /** Abre o diálogo de recarga. */
  onTopup: () => void;
  /** "Verificar pagamento" da recarga pendente (a consulta é da página). */
  onCheckPayment: (topupId: string) => void;
  /** true enquanto a página consulta o pagamento (o servidor limita a frequência). */
  checking: boolean;
}

export function BalanceCard({ status, onTopup, onCheckPayment, checking }: BalanceCardProps) {
  const t = useTranslations("aiCreditsPage");

  const balanceCents = Number(status?.balanceCents) || 0;
  const lowBalanceCents = Number(status?.lowBalanceCents) || 0;
  const pending = status?.pendingTopup || null;

  // Saldo pode ficar negativo (piso configurado pelo dono da instalação).
  const zero = balanceCents <= 0;
  const low = !zero && balanceCents <= lowBalanceCents;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Coins className="h-3.5 w-3.5 shrink-0" />
              {t("balance")}
            </p>
            <p
              className={cn(
                "break-words text-2xl font-semibold tabular-nums sm:text-3xl",
                zero
                  ? "text-destructive"
                  : low
                    ? "text-amber-600 dark:text-amber-500"
                    : undefined
              )}
            >
              {formatCentsBRL(balanceCents)}
            </p>
          </div>
          <Button onClick={onTopup} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("addBalance")}
          </Button>
        </div>

        {pending && (
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("pendingTopup")}</p>
              <p className="font-medium tabular-nums">
                {formatCentsBRL(Number(pending.priceCents) || 0)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {pending.paymentUrl && (
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <a href={pending.paymentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {t("openPayment")}
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={checking}
                onClick={() => onCheckPayment(pending.id)}
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t("checkPayment")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
