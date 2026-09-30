"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Bot, Copy, Loader2, Network, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { AgentEditorDialog } from "@/components/ai-agents/agent-editor-dialog";
import { AgentMapDialog } from "@/components/ai-agents/agent-map-dialog";
import { aiAgentErrorKey, isNotFoundStatus } from "@/components/ai-agents/agent-error";
import { usePlatformAiEnabled } from "@/components/ai-credits/platform-ai-selector";
import {
  deleteAiAgent, duplicateAiAgent, fetchAiAgents, type AiAgentSummary,
} from "@/services/ai-agents";

export default function AiAgentsPage() {
  const t = useTranslations("aiAgents");
  const hasAccess = usePageAccess("agentes-ia");
  const platformAiEnabled = usePlatformAiEnabled();

  const [agents, setAgents] = useState<AiAgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Sonda de backend antigo: GET /ai-agents com 404 = rota inexistente nesta
  // versão do servidor → banner + tela vazia, sem outras chamadas
  const [unavailable, setUnavailable] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editAgentId, setEditAgentId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [mapAgentId, setMapAgentId] = useState<number | null>(null);
  // Um por vez: a cópia leva a base de conhecimento junto e pode demorar
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchAiAgents();
      setAgents(records);
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

  const openCreate = () => {
    setEditAgentId(null);
    setEditorOpen(true);
  };

  const openEdit = (agent: AiAgentSummary) => {
    setEditAgentId(agent.id);
    setEditorOpen(true);
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
      setDeleteId(null);
    }
  };

  // Recursos que ESTE servidor sabe executar — vêm em cada item da listagem.
  // A ajuda só cita o que existe: servidor antigo (sem o campo) ou nenhum
  // agente criado ainda = ajuda de sempre.
  const serverFeatures =
    agents.find(agent => Array.isArray(agent.engineFeatures))?.engineFeatures || [];
  const helpKbJsonMd = serverFeatures.includes("kbJsonMd");
  const helpAgentHandoff = serverFeatures.includes("agentHandoff");
  const helpAgentConsult = serverFeatures.includes("agentConsult");
  const teamworkItems = [
    ...(helpAgentHandoff ? [t("helpS6I0"), t("helpS6I1")] : []),
    ...(helpAgentConsult ? [t("helpS6I2")] : []),
  ];

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
        ],
      },
      {
        title: t("helpS1T"),
        items: [t("helpS1I0"), t("helpS1I1"), ...(helpKbJsonMd ? [t("helpS1I2")] : [])],
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
    ],
  };

  if (!hasAccess) return <AccessDenied />;

  return (
    <div className="space-y-6" data-tour="tour-agentes-ia">
      <PageHeader title={t("title")} description={t("description")} help={pageHelp}>
        {!unavailable && (
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("newAgent")}
          </Button>
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
          <Button onClick={openCreate} variant="outline" className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("newAgent")}
          </Button>
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
                  <Badge variant={agent.isActive ? "default" : "secondary"} className="shrink-0">
                    {agent.isActive ? t("statusActive") : t("statusInactive")}
                  </Badge>
                </div>
                <p className="line-clamp-2 min-h-[2rem] flex-1 text-sm text-muted-foreground">
                  {agent.description || ""}
                </p>
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
                      onClick={() => openEdit(agent)}
                      aria-label={t("edit")}
                      title={t("edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(agent.id)}
                      aria-label={t("delete")}
                      title={t("delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
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
      />

      <AgentMapDialog
        open={mapAgentId !== null}
        onOpenChange={o => { if (!o) setMapAgentId(null); }}
        agentId={mapAgentId}
        onEdit={id => {
          setEditAgentId(id);
          setEditorOpen(true);
        }}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirmDesc")}</AlertDialogDescription>
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
