"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ShieldX } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { usePageAccess } from "@/hooks/use-page-access";
import { useAuthStore } from "@/stores/auth-store";
import { announceAiCreditsStatus } from "@/components/layout/ai-credits-banner";
import {
  TopupDialog,
  aiCreditsErrorCode,
  aiCreditsErrorKey,
  aiCreditsErrorStatus
} from "@/components/ai-credits/topup-dialog";
import { BalanceCard } from "@/components/ai-credits/balance-card";
import { StatementTable } from "@/components/ai-credits/statement-table";
import { UsageTable } from "@/components/ai-credits/usage-table";
import { PriceTable } from "@/components/ai-credits/price-table";
import { AlertsCard } from "@/components/ai-credits/alerts-card";
import { isNotFoundStatus } from "@/components/ai-agents/agent-error";
import {
  fetchAiCreditsStatus,
  refreshAiTopup,
  type AiCreditsStatusResponse,
} from "@/services/ai-credits";

// Créditos de IA (lado da empresa): saldo, recarga, extrato, consumo, preços e
// aviso de saldo baixo.
//
// Gate ANTES de qualquer request: empresa sem o recurso, perfil que não gerencia
// créditos e superadmin não disparam NENHUMA chamada a /ai-credits/*.

type TabKey = "statement" | "usage" | "prices" | "alerts";

export default function AiCreditsPage() {
  const t = useTranslations("aiCreditsPage");

  const hasAccess = usePageAccess("creditos-ia");
  const canManage = useAuthStore(s => s.canManageAiCredits());
  const featureEnabled = useAuthStore(s => s.isAiCreditsEnabled());
  const allowed = hasAccess && canManage && featureEnabled;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<AiCreditsStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Sonda de servidor antigo: 404 em GET /ai-credits/status = rota inexistente
  // nesta versão do backend → aviso e nenhuma outra chamada.
  const [unavailable, setUnavailable] = useState(false);
  // Falha do status (recurso desligado no meio da sessão, rede): sem saldo não
  // faz sentido montar as abas — cada uma tomaria o mesmo erro e mais um toast.
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  const [topupOpen, setTopupOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  // Recarga creditada muda o extrato: força a recarga da primeira página.
  const [statementKey, setStatementKey] = useState(0);

  const [tab, setTab] = useState<TabKey>("statement");
  // Aba já aberta continua montada (escondida), para voltar nela não refazer as
  // buscas nem perder as páginas já carregadas.
  const [visited, setVisited] = useState<TabKey[]>(["statement"]);

  const seqRef = useRef(0);
  const checkingRef = useRef(false);
  const topupParamRef = useRef(false);

  const load = useCallback(async () => {
    seqRef.current += 1;
    const seq = seqRef.current;
    setLoading(true);
    try {
      const { data } = await fetchAiCreditsStatus();
      if (seqRef.current !== seq) return;
      setStatus(data || null);
      setUnavailable(false);
      setLoadErrorKey(null);
      // A faixa do topo reaproveita o que esta página leu (zero request extra).
      announceAiCreditsStatus({
        enabled: data?.enabled === true,
        balanceCents: Number(data?.balanceCents) || 0,
        lowBalanceCents: Number(data?.lowBalanceCents) || 0,
      });
    } catch (err: unknown) {
      if (seqRef.current !== seq) return;
      // Servidor sem as rotas (404) e servidor com o módulo indisponível (503, típico de
      // binário novo antes do migrate) são a MESMA coisa para quem está olhando: o que
      // falta é atualizar o servidor. Sem este segundo caso a tela dizia "recarga
      // indisponível" quando o que falhou foi ler o saldo — e a tela do superadmin já
      // tratava esse mesmo 503 como servidor desatualizado.
      const status = aiCreditsErrorStatus(err);
      const code = aiCreditsErrorCode(err);
      if (isNotFoundStatus(err) || (status === 503 && code === "ERR_AI_PLATFORM_UNAVAILABLE")) {
        setUnavailable(true);
      } else {
        const key = aiCreditsErrorKey(err);
        setLoadErrorKey(key);
        toast.error(t(key));
      }
    } finally {
      if (seqRef.current === seq) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!allowed) return;
    void load();
    return () => {
      seqRef.current += 1;
    };
  }, [allowed, load]);

  const handleCheckPayment = useCallback(async (topupId: string) => {
    // O servidor limita a frequência da consulta; uma por vez já basta.
    if (!topupId || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const { data } = await refreshAiTopup(topupId);
      if (data?.status === "credited") toast.success(t("topupPaid"));
      else toast.info(t("topupPending"));
      setStatementKey(key => key + 1);
      await load();
    } catch (err: unknown) {
      toast.error(t(aiCreditsErrorKey(err)));
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [load, t]);

  // Volta do pagamento (`?topup=<id>`): confere UMA vez e limpa o parâmetro, para
  // um F5 não repetir a consulta.
  useEffect(() => {
    if (!allowed || topupParamRef.current) return;
    const topupId = searchParams.get("topup");
    if (!topupId) return;
    topupParamRef.current = true;
    void handleCheckPayment(topupId);
    router.replace(pathname, { scroll: false });
  }, [allowed, searchParams, pathname, router, handleCheckPayment]);

  const openTab = (next: TabKey) => {
    setTab(next);
    setVisited(prev => (prev.includes(next) ? prev : [...prev, next]));
  };

  // Mesmo objeto de ajuda nos dois branches: o botão de ajuda não pode sumir na
  // tela de acesso negado nem durante a carga.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
    ],
  };

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
          <ShieldX className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{t("accessDenied")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} help={pageHelp} />

      {unavailable ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>{t("serverOutdated")}</p>
        </div>
      ) : loading && !status ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !status && loadErrorKey ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>{t(loadErrorKey)}</p>
        </div>
      ) : (
        <>
          <BalanceCard
            status={status}
            onTopup={() => setTopupOpen(true)}
            onCheckPayment={handleCheckPayment}
            checking={checking}
          />

          <Tabs value={tab} onValueChange={next => openTab(next as TabKey)}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
              <TabsTrigger value="statement">{t("tabStatement")}</TabsTrigger>
              <TabsTrigger value="usage">{t("tabUsage")}</TabsTrigger>
              <TabsTrigger value="prices">{t("tabPrices")}</TabsTrigger>
              <TabsTrigger value="alerts">{t("tabAlerts")}</TabsTrigger>
            </TabsList>

            {/* `forceMount` mantém a aba visitada montada; o Radix não esconde
                sozinho nesse modo, daí o `data-[state=inactive]:hidden`. */}
            <TabsContent
              value="statement"
              forceMount
              className="mt-4 data-[state=inactive]:hidden"
            >
              <StatementTable refreshKey={statementKey} />
            </TabsContent>

            <TabsContent
              value="usage"
              forceMount={visited.includes("usage") ? true : undefined}
              className="mt-4 data-[state=inactive]:hidden"
            >
              <UsageTable />
            </TabsContent>

            <TabsContent
              value="prices"
              forceMount={visited.includes("prices") ? true : undefined}
              className="mt-4 data-[state=inactive]:hidden"
            >
              <PriceTable />
            </TabsContent>

            <TabsContent
              value="alerts"
              forceMount={visited.includes("alerts") ? true : undefined}
              className="mt-4 data-[state=inactive]:hidden"
            >
              <AlertsCard status={status} onSaved={() => void load()} />
            </TabsContent>
          </Tabs>

          <TopupDialog
            open={topupOpen}
            onOpenChange={setTopupOpen}
            status={status}
            onCreated={() => {
              setStatementKey(key => key + 1);
              void load();
            }}
            onCheckPayment={handleCheckPayment}
            checking={checking}
          />
        </>
      )}
    </div>
  );
}
