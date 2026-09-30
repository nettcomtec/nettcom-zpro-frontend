"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Info, Loader2, MessageSquare, Mic, Save, Volume2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCentsBRL, formatNumber } from "@/lib/format";
import type { AiPlatformModelKind } from "@/services/ai-credits";
import { updateAiPlatformSettings, type AiOwnerPriceRow } from "@/services/ai-platform";
import { aiPlatformSaveErrorKey, type AiPlatformCardProps } from "./connection-card";

// 100 bp = 1%
function formatMarkup(markupBp: number): string {
  return `${formatNumber((Number(markupBp) || 0) / 100, { maximumFractionDigits: 2 })}%`;
}

export function PriceTableCard({ settings, onSaved }: AiPlatformCardProps) {
  const t = useTranslations("aiPlatformPage");
  const tCredits = useTranslations("aiCreditsPage");

  const [chargeEnabled, setChargeEnabled] = useState(settings.chargeEnabled === true);
  const [saving, setSaving] = useState(false);

  const dirty = chargeEnabled !== (settings.chargeEnabled === true);
  // A conta (custo × cotação × margem) mora no servidor: a tabela só mostra o que ele devolve.
  const rows: AiOwnerPriceRow[] = Array.isArray(settings.pricePreview) ? settings.pricePreview : [];

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { data } = await updateAiPlatformSettings({ chargeEnabled });
      onSaved(data);
      setChargeEnabled(data.chargeEnabled === true);
      toast.success(t("saved"));
    } catch (err: unknown) {
      toast.error(t(aiPlatformSaveErrorKey(err)));
    } finally {
      setSaving(false);
    }
  };

  const kindIcon = (kind: AiPlatformModelKind) => {
    if (kind === "transcription") {
      return <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t("transcriptionModel")} />;
    }
    if (kind === "speech") {
      return <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t("speechModel")} />;
    }
    return <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <Label htmlFor="ai-platform-charge" className="text-sm font-semibold">{t("chargeCustomers")}</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {chargeEnabled ? t("chargeCustomersOn") : t("chargeCustomersOff")}
            </p>
          </div>
          <Switch
            id="ai-platform-charge"
            checked={chargeEnabled}
            onCheckedChange={setChargeEnabled}
            disabled={saving}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void handleSave()} disabled={saving || !dirty} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("save")}
          </Button>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-2.5 text-xs text-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
          <span>{t("pricePreviewNote")}</span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            {tCredits("empty")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colModel")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colWholesale")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colMarkup")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colCustomerPays")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colYouKeep")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.modelId}>
                    <TableCell className="max-w-[260px]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {kindIcon(row.kind)}
                        <span className="truncate font-medium" title={row.name || row.modelId}>
                          {row.name || row.modelId}
                        </span>
                      </div>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground" title={row.modelId}>
                        {row.modelId}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {formatCentsBRL(row.wholesaleCentsPer1M)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {settings.chargeEnabled ? (
                        formatMarkup(row.markupBp)
                      ) : (
                        <Badge variant="secondary" className="font-normal">{t("inactive")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">
                      {formatCentsBRL(row.customerCentsPer1M)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-success">
                      {formatCentsBRL(row.keepCentsPer1M)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PriceTableCard;
