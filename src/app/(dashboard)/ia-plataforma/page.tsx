"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";

import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/stores/auth-store";
import {
  ConnectionCard,
  aiPlatformErrorCode,
  aiPlatformErrorStatus,
} from "@/components/ai-platform/connection-card";
import { ModelsCard } from "@/components/ai-platform/models-card";
import { PriceTableCard } from "@/components/ai-platform/price-table-card";
import { MarkupEditor } from "@/components/ai-platform/markup-editor";
import { SaleConfigCard } from "@/components/ai-platform/sale-config-card";
import { fetchAiPlatformSettings, type AiPlatformSettings } from "@/services/ai-platform";

// PLANO_CREDITOS_IA §5.1.6 — página do superadmin: conecta o serviço de IA, escolhe
// modelos e margem e define como o crédito é vendido. Cada aba salva SÓ os próprios
// campos e recebe de volta a configuração inteira, com `pricePreview` recalculado pelo
// servidor (a conta atacado/margem/cliente paga nunca é feita aqui).

type LoadState = "loading" | "ready" | "outdated" | "error";

export default function AiPlatformPage() {
  const t = useTranslations("aiPlatformPage");
  const tc = useTranslations("common");
  const profile = useAuthStore((s) => s.user?.profile);
  const isSuperadmin = profile === "superadmin";

  const [settings, setSettings] = useState<AiPlatformSettings | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const { data } = await fetchAiPlatformSettings();
      setSettings(data);
      setState("ready");
    } catch (err: unknown) {
      const status = aiPlatformErrorStatus(err);
      const code = aiPlatformErrorCode(err);
      // Servidor sem a rota (404/405/501) ou com a rota e sem a tabela (503
      // ERR_AI_PLATFORM_UNAVAILABLE): a tela mostra SÓ o aviso de atualizar, uma vez,
      // sem toast e sem nova tentativa em laço.
      if (
        status === 404 ||
        status === 405 ||
        status === 501 ||
        (status === 503 && code === "ERR_AI_PLATFORM_UNAVAILABLE")
      ) {
        setState("outdated");
        return;
      }
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (!isSuperadmin) return;
    void load();
  }, [isSuperadmin, load]);

  // Help hoistado: o MESMO objeto vale para qualquer branch de carregamento — o botão
  // de ajuda não pode sumir enquanto os dados chegam.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
    ],
  };

  if (!isSuperadmin) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} help={pageHelp} />

      {state === "loading" && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {state === "outdated" && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>{t("serverOutdated")}</p>
        </div>
      )}

      {state === "error" && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p>{tc("errorFetchingData")}</p>
        </div>
      )}

      {state === "ready" && settings && (
        <Tabs defaultValue="connection" className="space-y-4">
          {/* Em telas estreitas a faixa de abas rola sozinha — a página nunca rola na horizontal */}
          <div className="overflow-x-auto">
            <TabsList className="h-9 w-max justify-start gap-1">
              <TabsTrigger value="connection">{t("tabConnection")}</TabsTrigger>
              <TabsTrigger value="models">{t("tabModels")}</TabsTrigger>
              <TabsTrigger value="prices">{t("tabPrices")}</TabsTrigger>
              <TabsTrigger value="markups">{t("tabMarkups")}</TabsTrigger>
              <TabsTrigger value="sale">{t("tabSale")}</TabsTrigger>
            </TabsList>
          </div>

          {/* `forceMount` + `hidden` por data-state: as cinco abas ficam montadas, então
              edição pendente em uma não se perde ao dar uma olhada na outra. Nenhuma
              delas faz request no mount — sincronizar e testar são cliques. */}
          <TabsContent value="connection" forceMount className="data-[state=inactive]:hidden">
            <ConnectionCard settings={settings} onSaved={setSettings} />
          </TabsContent>
          <TabsContent value="models" forceMount className="data-[state=inactive]:hidden">
            <ModelsCard settings={settings} onSaved={setSettings} />
          </TabsContent>
          <TabsContent value="prices" forceMount className="data-[state=inactive]:hidden">
            <PriceTableCard settings={settings} onSaved={setSettings} />
          </TabsContent>
          <TabsContent value="markups" forceMount className="data-[state=inactive]:hidden">
            <MarkupEditor settings={settings} onSaved={setSettings} />
          </TabsContent>
          <TabsContent value="sale" forceMount className="data-[state=inactive]:hidden">
            <SaleConfigCard settings={settings} onSaved={setSettings} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
