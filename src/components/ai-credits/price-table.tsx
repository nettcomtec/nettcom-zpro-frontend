"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCentsBRL } from "@/lib/format";
import { aiCreditsErrorKey } from "@/components/ai-credits/topup-dialog";
import { loadPlatformAiCatalog } from "@/components/ai-credits/platform-ai-selector";
import type { AiCreditsModelsResponse, AiPublicModelPrice } from "@/services/ai-credits";

// Preços FINAIS por modelo — o que a empresa paga. Nada de custo de atacado,
// câmbio ou margem aqui: o servidor nem manda esses campos nesta rota.
// O catálogo é o mesmo do seletor "Chave própria / IA da plataforma", com cache
// no módulo: abrir esta aba duas vezes não gera duas buscas.

export function PriceTable() {
  const t = useTranslations("aiCreditsPage");
  const tCommon = useTranslations("common");

  const [catalog, setCatalog] = useState<AiCreditsModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const seqRef = useRef(0);

  const load = useCallback(async (force: boolean) => {
    seqRef.current += 1;
    const seq = seqRef.current;
    setLoading(true);
    try {
      const data = await loadPlatformAiCatalog(force);
      if (seqRef.current !== seq) return;
      setCatalog(data);
    } catch (err: unknown) {
      if (seqRef.current !== seq) return;
      toast.error(t(aiCreditsErrorKey(err)));
      setCatalog(null);
    } finally {
      if (seqRef.current === seq) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load(false);
    return () => {
      seqRef.current += 1;
    };
  }, [load]);

  const models = catalog?.models || [];
  // Coluna de modalidade que nenhum modelo usa fica fora: menos largura para
  // rolar no telefone.
  const hasPerMinute = models.some(item => Number(item.perMinutePriceCents) > 0);
  const hasPerChars = models.some(item => Number(item.perMillionCharsPriceCents) > 0);

  // Preço com fração de centavo (por minuto de áudio, por exemplo) perderia o
  // valor com 2 casas; inteiro sai no formato normal de moeda.
  const money = (cents: number | undefined): string => {
    const value = Number(cents) || 0;
    if (value <= 0) return "—";
    return formatCentsBRL(value, { precise: !Number.isInteger(value) });
  };

  const modelLabel = (item: AiPublicModelPrice): string => item.name || item.modelId;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">{t("pricesNote")}</p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={loading}
          onClick={() => void load(true)}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {tCommon("atualizar")}
        </Button>
      </div>

      {loading && models.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center">
          <p className="px-4 text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{t("colModel")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("pricesInput")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("pricesOutput")}</TableHead>
                  {hasPerMinute && (
                    <TableHead className="whitespace-nowrap text-right">{t("pricesPerMinute")}</TableHead>
                  )}
                  {hasPerChars && (
                    <TableHead className="whitespace-nowrap text-right">
                      {t("pricesPerMillionChars")}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map(item => (
                  <TableRow key={`${item.kind}|${item.modelId}`}>
                    <TableCell className="max-w-[16rem]">
                      <span className="block break-words font-medium">{modelLabel(item)}</span>
                      {item.name && item.name !== item.modelId && (
                        <span className="block break-all font-mono text-xs text-muted-foreground">
                          {item.modelId}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(item.inputPriceCentsPer1M)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(item.outputPriceCentsPer1M)}
                    </TableCell>
                    {hasPerMinute && (
                      <TableCell className="whitespace-nowrap text-right">
                        {money(item.perMinutePriceCents)}
                      </TableCell>
                    )}
                    {hasPerChars && (
                      <TableCell className="whitespace-nowrap text-right">
                        {money(item.perMillionCharsPriceCents)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
