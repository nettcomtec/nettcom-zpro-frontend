"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCentsBRL, formatDateTime } from "@/lib/format";
import { aiCreditsErrorKey } from "@/components/ai-credits/topup-dialog";
import {
  fetchAiCreditsStatement,
  type AiCreditTransactionType,
  type AiCreditTransactionView,
} from "@/services/ai-credits";

// Extrato de movimentos do saldo. Paginação por `cursor` (keyset): o servidor
// devolve `nextCursor` e o botão "Carregar mais" pede a página seguinte — nunca
// número de página, que duplicaria linhas quando uma recarga cai no meio.

// Tipo vindo de um servidor mais novo não tem tradução: mostra o valor cru em vez
// de estourar a chave de i18n.
const KNOWN_TYPES = new Set<string>([
  "topup", "manual_credit", "manual_debit", "reversal", "dispute", "dispute_won",
]);

export interface StatementTableProps {
  /** Muda quando um pagamento é confirmado: recarrega a primeira página. */
  refreshKey?: number;
}

export function StatementTable({ refreshKey = 0 }: StatementTableProps) {
  const t = useTranslations("aiCreditsPage");

  const [items, setItems] = useState<AiCreditTransactionView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Resposta em voo é descartada quando outra começa (ou no desmonte).
  const seqRef = useRef(0);

  const loadPage = useCallback(async (cursor: string | null) => {
    seqRef.current += 1;
    const seq = seqRef.current;
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    try {
      const { data } = await fetchAiCreditsStatement(cursor);
      if (seqRef.current !== seq) return;
      const rows = Array.isArray(data?.items) ? data.items : [];
      setItems(prev => (cursor ? [...prev, ...rows] : rows));
      setNextCursor(
        typeof data?.nextCursor === "string" && data.nextCursor ? data.nextCursor : null
      );
    } catch (err: unknown) {
      if (seqRef.current !== seq) return;
      toast.error(t(aiCreditsErrorKey(err)));
      if (!cursor) {
        setItems([]);
        setNextCursor(null);
      }
    } finally {
      if (seqRef.current === seq) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [t]);

  useEffect(() => {
    void loadPage(null);
    return () => {
      seqRef.current += 1;
    };
  }, [loadPage, refreshKey]);

  const typeLabel = (type: AiCreditTransactionType): string =>
    KNOWN_TYPES.has(type) ? t(`type_${type}`) : String(type);

  const amountClass = (cents: number): string | undefined => {
    if (cents > 0) return "text-emerald-600 dark:text-emerald-400";
    if (cents < 0) return "text-destructive";
    return undefined;
  };

  const signedAmount = (cents: number): string =>
    cents > 0 ? `+${formatCentsBRL(cents)}` : formatCentsBRL(cents);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center">
        <p className="px-4 text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-0">
          {/* O container da tabela rola na horizontal; a página nunca rola */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">{t("colDate")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("colType")}</TableHead>
                <TableHead>{t("colDescription")}</TableHead>
                <TableHead className="whitespace-nowrap text-right">{t("colAmount")}</TableHead>
                <TableHead className="whitespace-nowrap text-right">{t("colBalanceAfter")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(row => {
                const amount = Number(row.amountCents) || 0;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.createdAt, { dateStyle: "short", timeStyle: "short" })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{typeLabel(row.type)}</TableCell>
                    <TableCell className="max-w-[18rem] break-words text-muted-foreground">
                      {row.description || "—"}
                    </TableCell>
                    <TableCell className={cn("whitespace-nowrap text-right font-medium", amountClass(amount))}>
                      {signedAmount(amount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {formatCentsBRL(Number(row.balanceAfterCents) || 0)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {nextCursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loadingMore}
            onClick={() => void loadPage(nextCursor)}
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
