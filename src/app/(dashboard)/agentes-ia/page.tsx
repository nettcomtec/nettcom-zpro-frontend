"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, Bot, Copy, LayoutTemplate, Library, Loader2, Network, Pencil, Plus, Server,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { usePageAccess } from "@/hooks/use-page-access";
import { useAuthStore } from "@/stores/auth-store";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { AgentEditorDialog } from "@/components/ai-agents/agent-editor-dialog";
import { AgentMapDialog } from "@/components/ai-agents/agent-map-dialog";
import { AgentTemplateDialog } from "@/components/ai-agents/agent-template-dialog";
import { McpServersDialog } from "@/components/ai-agents/mcp-servers-dialog";
import { aiAgentErrorKey, isNotFoundStatus } from "@/components/ai-agents/agent-error";
import { usePlatformAiEnabled } from "@/components/ai-credits/platform-ai-selector";
import { TEAM_TRIAGE_ID } from "@/lib/ai-agent-templates";
import {
  deleteAiAgent, duplicateAiAgent, fetchAiAgentEngineFeatures, fetchAiAgents,
  fetchAiAgentUsage,
  type AiAgentEngineFeature, type AiAgentSummary, type AiAgentTemplateCreated,
  type AiAgentUsage, type AiAgentUsageRef,
} from "@/services/ai-agents";
import { listAiMcpServers } from "@/services/ai-mcp-servers";

// Recursos que tornam útil o aviso de "quem usa este agente" ao excluir (DA8):
// sem nenhum deles o servidor não tem a rota nem os vínculos que ela lista
const USAGE_FEATURES: AiAgentEngineFeature[] = [
  "kbShared", "kbOnly", "agentHandoff", "agentConsult",
];
// Nomes mostrados por linha no aviso de exclusão; o resto vira "e mais N"
const USAGE_NAMES_SHOWN = 5;

export default function AiAgentsPage() {
  const t = useTranslations("aiAgents");
  const hasAccess = usePageAccess("agentes-ia");
  const platformAiEnabled = usePlatformAiEnabled();
  // Espelho do `requirePermission("ai_agents_manage")` do backend (só restringe
  // perfil personalizado). Sem ela a página é SÓ LEITURA (R5-4): todo botão que
  // criaria, editaria ou excluiria daria erro de permissão.
  const canManage = useAuthStore(s => s.hasPermission("ai_agents_manage"));
  // v8 (D21) — o cadastro de Servidores MCP é de quem gerencia agentes, menos o
  // perfil `user` comum (o servidor recusa a escrita dele de qualquer jeito)
  const profile = useAuthStore(s => s.user?.profile);
  const canManageMcp = canManage && profile !== "user";

  const [agents, setAgents] = useState<AiAgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Listagem já respondeu com sucesso pelo menos uma vez (vazia é diferente de
  // "falhou")
  const [listLoaded, setListLoaded] = useState(false);
  // Sonda de backend antigo: GET /ai-agents com 404 = rota inexistente nesta
  // versão do servidor → banner + tela vazia, sem outras chamadas
  const [unavailable, setUnavailable] = useState(false);
  // Recursos pela rota própria — só consultada com a listagem VAZIA (C16).
  // null = desconhecido (não consultado, servidor antigo ou falha).
  const [routeFeatures, setRouteFeatures] = useState<AiAgentEngineFeature[] | null>(null);
  const routeFeaturesRequestedRef = useRef(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editAgentId, setEditAgentId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [mapAgentId, setMapAgentId] = useState<number | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  // Um por vez: a cópia leva a base de conhecimento junto e pode demorar
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  // Quem usa o agente que vai ser excluído (aviso, nunca bloqueio — DA4)
  const [deleteUsage, setDeleteUsage] = useState<AiAgentUsage | null>(null);
  const [deleteUsageLoading, setDeleteUsageLoading] = useState(false);
  const deleteUsageSeqRef = useRef(0);
  // v8 — Servidores MCP: diálogo do cadastro e soma das ferramentas pausadas
  // (D23). null = desconhecido (não consultado, servidor antigo ou falha): o
  // selo some.
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpPausedTotal, setMcpPausedTotal] = useState<number | null>(null);
  const mcpSummaryRequestedRef = useRef(false);
  const mcpSummarySeqRef = useRef(0);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchAiAgents();
      setAgents(records);
      setListLoaded(true);
      setUnavailable(false);
    } catch (err: unknown) {
      if (isNotFoundStatus(err)) {
        setUnavailable(true);
      } else {
        toast.error(t("loadError"));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!hasAccess) return;
    loadAgents();
  }, [hasAccess, loadAgents]);

  // Empresa sem nenhum agente: a listagem não traz o anúncio de recursos, então
  // UMA consulta à rota própria (C16). Com agentes, o anúncio vem da listagem
  // como sempre — no servidor antigo com agentes, zero requisição extra.
  useEffect(() => {
    if (!hasAccess || !canManage || !listLoaded || unavailable || agents.length > 0) return;
    if (routeFeaturesRequestedRef.current) return;
    routeFeaturesRequestedRef.current = true;
    void fetchAiAgentEngineFeatures().then(features => setRouteFeatures(features));
  }, [hasAccess, canManage, listLoaded, unavailable, agents.length]);

  const openCreate = () => {
    setEditAgentId(null);
    setEditorOpen(true);
  };

  const openEdit = (agentId: number) => {
    setEditAgentId(agentId);
    setEditorOpen(true);
  };

  // Depois de criar pelo modelo pronto (N3): um agente abre o editor dele para
  // revisar; a equipe abre o mapa da Recepção, que mostra as ligações
  const handleTemplatesCreated = async (
    created: AiAgentTemplateCreated[],
    team: boolean
  ) => {
    await loadAgents();
    const valid = created.filter(agent => Number(agent?.id) > 0);
    if (valid.length === 0) return;
    if (team || valid.length > 1) {
      const reception = valid.find(agent => agent.ref === TEAM_TRIAGE_ID) || valid[0];
      setMapAgentId(Number(reception.id));
    } else {
      openEdit(Number(valid[0].id));
    }
  };

  const handleDuplicate = async (agent: AiAgentSummary) => {
    if (duplicatingId !== null) return;
    setDuplicatingId(agent.id);
    try {
      // O nome vai pronto (o servidor não traduz) e cabe nos 255 do campo
      const suffix = ` ${t("duplicateNameSuffix")}`;
      const name = `${agent.name.slice(0, 255 - suffix.length)}${suffix}`;
      await duplicateAiAgent(agent.id, name);
      toast.success(t("duplicated"));
      await loadAgents();
    } catch (err: unknown) {
      const key = aiAgentErrorKey(err);
      // 404 COM código = agente sumiu; 404 sem código = servidor sem a rota
      if (key) toast.error(t(key));
      else if (isNotFoundStatus(err)) toast.error(t("duplicateUnavailable"));
      else toast.error(t("duplicateError"));
    } finally {
      setDuplicatingId(null);
    }
  };

  const closeDelete = () => {
    // Invalida a consulta de uso em voo: a resposta atrasada não pode aparecer
    // na confirmação de OUTRO agente
    deleteUsageSeqRef.current += 1;
    setDeleteId(null);
    setDeleteUsage(null);
    setDeleteUsageLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteAiAgent(deleteId);
      toast.success(t("deleted"));
      setAgents(prev => prev.filter(agent => agent.id !== deleteId));
    } catch (err: unknown) {
      const key = aiAgentErrorKey(err);
      toast.error(key ? t(key) : t("saveError"));
    } finally {
      closeDelete();
    }
  };

  // Recursos que ESTE servidor sabe executar — vêm em cada item da listagem;
  // com a listagem vazia, da rota própria (C16). A ajuda só cita o que existe:
  // servidor antigo (sem o campo) = ajuda de sempre.
  const listFeatures =
    agents.find(agent => Array.isArray(agent.engineFeatures))?.engineFeatures || [];
  const serverFeatures: AiAgentEngineFeature[] = routeFeatures ?? listFeatures;
  const helpKbJsonMd = serverFeatures.includes("kbJsonMd");
  const helpAgentHandoff = serverFeatures.includes("agentHandoff");
  const helpAgentConsult = serverFeatures.includes("agentConsult");
  const helpKbShared = serverFeatures.includes("kbShared");
  const helpKbOnly = serverFeatures.includes("kbOnly");
  const helpReplyDelay = serverFeatures.includes("replyDelay");
  const supportsTemplates = serverFeatures.includes("agentTemplates");
  const supportsUsage = USAGE_FEATURES.some(feature => serverFeatures.includes(feature));
  // v8 — Servidores MCP só com o servidor que anuncia o recurso
  const supportsMcp = serverFeatures.includes("mcp");
  const showMcpButton = !unavailable && canManageMcp && supportsMcp;

  // Selo do botão (D23): soma das ferramentas pausadas pela rota enxuta.
  // Silenciosa: servidor antigo ou falha = sem selo.
  const loadMcpSummary = useCallback(async () => {
    mcpSummarySeqRef.current += 1;
    const seq = mcpSummarySeqRef.current;
    const summary = await listAiMcpServers({ summary: true });
    if (seq !== mcpSummarySeqRef.current) return;
    if (!summary) {
      setMcpPausedTotal(null);
      return;
    }
    setMcpPausedTotal(
      summary.reduce((total, server) => total + (Number(server?.pausedCount) || 0), 0)
    );
  }, []);

  // 1× por carga da página, quando o anúncio `mcp` aparece; depois, só quando
  // o diálogo avisa que algo mudou
  useEffect(() => {
    if (!showMcpButton || mcpSummaryRequestedRef.current) return;
    mcpSummaryRequestedRef.current = true;
    void loadMcpSummary();
  }, [showMcpButton, loadMcpSummary]);

  const teamworkItems = [
    ...(helpAgentHandoff ? [t("helpS6I0"), t("helpS6I1")] : []),
    ...(helpAgentConsult ? [t("helpS6I2")] : []),
  ];

  // Ao abrir a confirmação de exclusão, avisa quem usa o agente (DA4/DA8/C27).
  // Silenciosa: erro ou servidor sem a rota = o diálogo genérico de sempre, e o
  // Excluir nunca fica bloqueado esperando.
  const openDelete = (agentId: number) => {
    deleteUsageSeqRef.current += 1;
    const seq = deleteUsageSeqRef.current;
    setDeleteId(agentId);
    setDeleteUsage(null);
    if (!supportsUsage) {
      setDeleteUsageLoading(false);
      return;
    }
    setDeleteUsageLoading(true);
    void fetchAiAgentUsage(agentId)
      .then(usage => {
        if (deleteUsageSeqRef.current === seq) setDeleteUsage(usage);
      })
      .finally(() => {
        if (deleteUsageSeqRef.current === seq) setDeleteUsageLoading(false);
      });
  };

  const formatUsageNames = (items: AiAgentUsageRef[]): string => {
    const shown = items.slice(0, USAGE_NAMES_SHOWN).map(item => item.name).join(", ");
    const rest = items.length - USAGE_NAMES_SHOWN;
    return rest > 0 ? `${shown} ${t("usageMore", { count: rest })}` : shown;
  };

  const usageLines: string[] = deleteUsage
    ? (
        [
          ["usageSharedKb", deleteUsage.sharedKbBy],
          ["usageTransfer", deleteUsage.transferFrom],
          ["usageConsult", deleteUsage.consultedBy],
          ["usageChannels", deleteUsage.channels],
        ] as Array<[string, AiAgentUsageRef[]]>
      )
        .filter(([, items]) => items.length > 0)
        .map(([key, items]) => t(key, { names: formatUsageNames(items) }))
    : [];

  // Help hoistado: se um dia a página ganhar branch de loading com segundo
  // PageHeader, o MESMO objeto vai nos dois
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      {
        title: t("helpS0T"),
        // A dica da IA da plataforma só aparece para a empresa que tem o recurso
        items: [
          t("helpS0I0"), t("helpS0I1"), t("helpS0I2"),
          ...(platformAiEnabled ? [t("helpS0I3")] : []),
          // Atraso na resposta (aba Perfil)
          ...(helpReplyDelay ? [t("helpS0I4")] : []),
        ],
      },
      {
        title: t("helpS1T"),
        items: [
          t("helpS1I0"), t("helpS1I1"),
          ...(helpKbJsonMd ? [t("helpS1I2")] : []),
          // v7 — bases compartilhadas e agente "só base"
          ...(helpKbShared ? [t("helpS1I3")] : []),
          ...(helpKbOnly ? [t("helpS1I4")] : []),
        ],
      },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
      { title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1")] },
      { title: t("helpS4T"), items: [t("helpS4I0"), t("helpS4I1"), t("helpS4I2")] },
      { title: t("helpS5T"), items: [t("helpS5I0"), t("helpS5I1")] },
      // Agentes trabalhando juntos (v6): transferência para outro agente de IA
      // e consulta a especialista
      ...(teamworkItems.length > 0
        ? [{ title: t("helpS6T"), items: teamworkItems }]
        : []),
      // v7 — modelos prontos (a equipe só existe com a troca entre agentes)
      ...(supportsTemplates
        ? [{
            title: t("helpS7T"),
            items: [
              t("helpS7I0"), t("helpS7I1"),
              ...(helpAgentHandoff ? [t("helpS7I2")] : []),
            ],
          }]
        : []),
      // v8 — Servidores MCP (cadastro, aprovação, escolha no agente, pausa e
      // custo), só com o servidor que anuncia o recurso
      ...(supportsMcp
        ? [{ title: t("helpMcpTitle"), items: [t("helpMcpBody1"), t("helpMcpBody2")] }]
        : []),
    ],
  };

  const templatesButton = (
    <Button variant="outline" onClick={() => setTemplateOpen(true)} className="gap-1.5">
      <LayoutTemplate className="h-4 w-4" />
      {t("templatesButton")}
    </Button>
  );

  if (!hasAccess) return <AccessDenied />;

  return (
    <div className="space-y-6" data-tour="tour-agentes-ia">
      <PageHeader title={t("title")} description={t("description")} help={pageHelp}>
        {!unavailable && canManage && (
          <>
            {/* v8 — cadastro dos Servidores MCP da empresa; o selo conta as
                ferramentas que mudaram no servidor e estão pausadas (D23) */}
            {showMcpButton && (
              <Button variant="outline" onClick={() => setMcpOpen(true)} className="gap-1.5">
                <Server className="h-4 w-4" />
                {t("mcpServersButton")}
                {mcpPausedTotal !== null && mcpPausedTotal > 0 && (
                  <Badge variant="warning-soft" className="ml-0.5">
                    {t("mcpPausedBadge", { count: mcpPausedTotal })}
                  </Badge>
                )}
              </Button>
            )}
            {/* DB7 — caminho novo AO LADO; o "Novo agente" fica igual */}
            {supportsTemplates && templatesButton}
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("newAgent")}
            </Button>
          </>
        )}
      </PageHeader>

      {unavailable ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>{t("unavailableBanner")}</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed py-12 text-center">
          <Bot className="h-10 w-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("empty")}</p>
            <p className="mx-auto max-w-md px-4 text-xs text-muted-foreground">{t("emptyHint")}</p>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center justify-center gap-2 px-4">
              {supportsTemplates && templatesButton}
              <Button onClick={openCreate} variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" />
                {t("newAgent")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map(agent => (
            <Card key={agent.id}>
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <span className="truncate font-medium">{agent.name}</span>
                  </div>
                  {/* Agente "só base" nunca atende: o selo diz isso no lugar
                      de Ativo/Inativo */}
                  {agent.kbOnly ? (
                    <Badge variant="secondary" className="shrink-0 gap-1">
                      <Library className="h-3 w-3" />
                      {t("badgeKbOnly")}
                    </Badge>
                  ) : (
                    <Badge variant={agent.isActive ? "default" : "secondary"} className="shrink-0">
                      {agent.isActive ? t("statusActive") : t("statusInactive")}
                    </Badge>
                  )}
                </div>
                <p className="line-clamp-2 min-h-[2rem] flex-1 text-sm text-muted-foreground">
                  {agent.description || ""}
                </p>
                {/* Sem a permissão de gerenciar agentes o card é só leitura
                    (R5-4): mapa, duplicar, editar e excluir dariam erro */}
                {canManage && (
                  <div className="flex items-center justify-between gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => setMapAgentId(agent.id)}
                    >
                      <Network className="h-4 w-4" />
                      {t("viewMap")}
                    </Button>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDuplicate(agent)}
                        disabled={duplicatingId !== null}
                        aria-label={t("duplicate")}
                        title={t("duplicate")}
                      >
                        {duplicatingId === agent.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(agent.id)}
                        aria-label={t("edit")}
                        title={t("edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => openDelete(agent.id)}
                        aria-label={t("delete")}
                        title={t("delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AgentEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        agentId={editAgentId}
        onSaved={loadAgents}
        // Só o anúncio da rota própria (null = desconhecido): o editor usa na
        // criação quando a listagem não anunciou nada (C13)
        fallbackFeatures={routeFeatures}
      />

      <AgentMapDialog
        open={mapAgentId !== null}
        onOpenChange={o => { if (!o) setMapAgentId(null); }}
        agentId={mapAgentId}
        onEdit={id => openEdit(id)}
      />

      {canManage && supportsTemplates && (
        <AgentTemplateDialog
          open={templateOpen}
          onOpenChange={setTemplateOpen}
          features={serverFeatures}
          agents={agents}
          onCreated={handleTemplatesCreated}
        />
      )}

      {showMcpButton && (
        <McpServersDialog
          open={mcpOpen}
          onOpenChange={setMcpOpen}
          onChanged={() => void loadMcpSummary()}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={o => { if (!o) closeDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {t("deleteConfirmDesc")}
                  {deleteUsageLoading && (
                    <Loader2
                      aria-hidden
                      className="ml-1.5 inline h-3.5 w-3.5 animate-spin align-[-2px]"
                    />
                  )}
                </p>
                {usageLines.length > 0 && (
                  <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-foreground">
                    <ul className="list-disc space-y-1 pl-4">
                      {usageLines.map(line => (
                        <li key={line} className="break-words">{line}</li>
                      ))}
                    </ul>
                    <p className="text-muted-foreground">{t("deleteUsageAfter")}</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
