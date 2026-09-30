"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, CloudOff, RotateCw, SearchX, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import type { PageHelpProps } from "@/components/layout/page-help";
import { ContactCrmSummary } from "@/components/contact-crm/contact-crm-summary";
import { ContactTimeline } from "@/components/contact-crm/contact-timeline";
import { RelationshipTab } from "@/components/contact-crm/relationship-tab";
import { useLiveMode } from "@/hooks/use-live-mode";
import { displayContactName } from "@/lib/contact-identity";
import { fetchContact } from "@/services/contacts";
import { loadContactCrmSummary, type ContactCrmLoadState } from "@/services/contact-crm";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Perfil do contato (PLANO_CRM_CONTATO — Fase 1).
 *
 * Não usa `usePageAccess("contatos")` de propósito (D25): quem decide o acesso é o
 * backend (carteira ou atendimento que o usuário consegue abrir — D5). No front só o
 * usuário restrito é barrado, sem chamar a API. O guard de rota tem exceção para
 * `/contatos/<id>` pelo mesmo motivo.
 */

type PageState = ContactCrmLoadState | { status: "loading" };

type TabValue = "profile" | "timeline" | "relationship";

export default function ContactProfilePage() {
  const t = useTranslations("contactCrm");
  const router = useRouter();
  const params = useParams();
  const { user, isRestrictedUser } = useAuthStore();
  const { isLiveMode } = useLiveMode();

  const rawId = params?.contactId;
  const contactId = Number(Array.isArray(rawId) ? rawId[0] : rawId);
  const validId = Number.isInteger(contactId) && contactId > 0;
  // Dica do ticket de origem (link do painel do atendimento): libera quem está atendendo
  // mesmo que o ticket não esteja entre os mais recentes do contato.
  const searchParams = useSearchParams();
  const rawTicketId = Number(searchParams?.get("ticketId"));
  const ticketIdHint = Number.isInteger(rawTicketId) && rawTicketId > 0 ? rawTicketId : null;
  // `user` no destructuring mantém a assinatura do store: o flag muda com o refresh do perfil.
  const restricted = !!user && isRestrictedUser();

  const [state, setState] = useState<PageState>({ status: "loading" });
  const [contactName, setContactName] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState<TabValue>("profile");

  useEffect(() => {
    if (restricted) return;
    if (!validId) {
      setState({ status: "notFound" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    setContactName("");

    loadContactCrmSummary(contactId, { ticketId: ticketIdHint })
      .then((result) => {
        if (cancelled) return;
        setState(result);
        // Nome só depois do acesso confirmado: GET /contacts/:id não confere carteira.
        if (result.status !== "ok") return;
        fetchContact(contactId)
          .then(({ data }) => {
            if (!cancelled) setContactName(displayContactName(data));
          })
          .catch(() => {
            /* sem nome: o cabeçalho fica com a descrição padrão */
          });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [contactId, validId, restricted, reloadKey, ticketIdHint]);

  const handleBack = useCallback(() => {
    // Link aberto direto (nova aba) não tem para onde voltar no histórico.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }, [router]);

  const pageHelp: PageHelpProps = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0")] },
    ],
  };

  // Abas por condição, ambas declaradas pelo backend no summary (backend antigo não manda
  // `features` → aba oculta, sem sonda extra): Timeline e Relacionamento (este já considera
  // a capacidade do plano e a tabela). A lista só aparece com 2+ abas.
  const timelineEnabled = state.status === "ok" && state.data.features?.timeline === true;
  const relationshipEnabled = state.status === "ok" && state.data.features?.relationship === true;
  const tabs: { value: TabValue; label: string; enabled: boolean }[] = [
    { value: "profile", label: t("tabProfile"), enabled: true },
    { value: "timeline", label: t("tabTimeline"), enabled: timelineEnabled },
    { value: "relationship", label: t("tabRelationship"), enabled: relationshipEnabled },
  ];
  const visibleTabs = tabs.filter((tab) => tab.enabled);
  const currentTab = visibleTabs.some((tab) => tab.value === activeTab) ? activeTab : "profile";

  // O PageHeader só aceita texto na descrição, então no modo apresentação o nome
  // do contato não é exibido (equivale ao blur dos demais nomes).
  const headerDescription =
    state.status === "ok" && contactName && !isLiveMode ? contactName : t("description");

  const renderHeader = (description: string) => (
    <PageHeader title={t("title")} description={description} help={pageHelp}>
      <Button variant="outline" size="sm" onClick={handleBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t("back")}
      </Button>
    </PageHeader>
  );

  if (restricted) {
    return (
      <div className="space-y-6">
        {renderHeader(t("description"))}
        <EmptyState icon={ShieldOff} title={t("noAccessTitle")} description={t("noAccessDesc")} />
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="space-y-6">
        {renderHeader(t("description"))}
        <div className="space-y-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {renderHeader(headerDescription)}

      {state.status === "noAccess" && (
        <EmptyState icon={ShieldOff} title={t("noAccessTitle")} description={t("noAccessDesc")} />
      )}

      {state.status === "notFound" && (
        <EmptyState icon={SearchX} title={t("notFoundTitle")} description={t("notFoundDesc")} />
      )}

      {state.status === "unavailable" && (
        <EmptyState icon={CloudOff} title={t("unavailableTitle")} description={t("unavailableDesc")} />
      )}

      {state.status === "error" && (
        <EmptyState icon={AlertTriangle} title={t("loadError")}>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            <RotateCw className="mr-2 h-4 w-4" />
            {t("retry")}
          </Button>
        </EmptyState>
      )}

      {state.status === "ok" && (
        <Tabs value={currentTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
          {visibleTabs.length > 1 && (
            <TabsList className="max-w-full overflow-x-auto justify-start">
              {visibleTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          )}
          <TabsContent value="profile" className={visibleTabs.length > 1 ? "mt-4" : "mt-0"}>
            <ContactCrmSummary summary={state.data} />
          </TabsContent>
          {timelineEnabled && (
            <TabsContent value="timeline" className="mt-4">
              <ContactTimeline
                contactId={contactId}
                ticketId={ticketIdHint}
                showFunnel={!!state.data.opportunities}
                showCalls={state.data.features?.calls === true}
                showRelationship={relationshipEnabled}
              />
            </TabsContent>
          )}
          {relationshipEnabled && (
            <TabsContent value="relationship" className="mt-4">
              <RelationshipTab contactId={contactId} ticketId={ticketIdHint} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
