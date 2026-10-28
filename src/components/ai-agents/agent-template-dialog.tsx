"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, Bot, Check, ExternalLink, Info, LayoutTemplate, Loader2, RefreshCw,
  Users, type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import { OpenAIBaseUrlField } from "@/components/copilot/openai-base-url-field";
import {
  loadPlatformAiCatalog, usePlatformAiEnabled,
} from "@/components/ai-credits/platform-ai-selector";
import { CHATGPT_MODELS } from "@/lib/openai-models";
import { cn } from "@/lib/utils";
import {
  AI_AGENT_SPECIALIST_TEMPLATES, AI_AGENT_TEMPLATES, TEAM_TRIAGE_ID,
  buildTemplateAgents, resolveTemplateSelection,
  type AiAgentTemplateDef, type AiAgentTemplateId, type AiAgentTemplateTranslator,
} from "@/lib/ai-agent-templates";
import { isPlatformKey } from "@/services/ai-credits";
import { fetchQueues, type Queue } from "@/services/queues";
import {
  createAiAgentsFromTemplate,
  type AiAgentEngineFeature, type AiAgentSummary, type AiAgentTemplateConnection,
  type AiAgentTemplateCreated,
} from "@/services/ai-agents";

import { aiAgentErrorKey, isNotFoundStatus } from "./agent-error";

// Assistente "Modelos prontos" (v7 — docs/PLANO_AGENTES_IA_BASE_COMPARTILHADA_MODELOS.md
// §5.10). Passo 1 escolhe o modelo (ou a equipe); passo 2 pede o nome da
// empresa, a conexão de IA e a fila de emergência. O servidor cria tudo numa
// transação só (tudo ou nada) e devolve a lista enxuta, sem chave.

type TemplateMode = "single" | "team";
type ConnectionMode = "platform" | "copy" | "key";

interface CatalogState {
  status: "idle" | "loading" | "ready" | "error";
  // Modelo de chat usado no modo plataforma: o padrão do servidor SÓ se for de
  // chat do catálogo, senão o 1º de chat (C21). null = plataforma indisponível.
  model: string | null;
}

interface QueueState {
  status: "loading" | "ready" | "error";
  list: Queue[];
}

// Mesmo padrão do editor para quem informa a própria chave
const DEFAULT_KEY_MODEL = "gpt-4o-mini";
const COMPANY_NAME_MAX = 100;
const URL_REGEX = /^https?:\/\//i;

// Erros do servidor que têm texto próprio aqui; qualquer outro código vira o
// aviso genérico do assistente
const TEMPLATE_ERROR_KEYS = new Set<string>([
  "errPlatformDisabled",
  "errPlatformModelNotAllowed",
  "errKeySourceNotFound",
  "errInvalidFallbackQueue",
  "errTemplateInvalid",
  "requiredFields",
  "errInvalidMemoryFields",
]);

const INVALID_FIELD_CLASS =
  "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20";

// O interceptor de `lib/api.ts` rejeita com o RESPONSE (ou o erro cru, sem
// resposta): o status e o código são lidos das duas formas
const errorStatusOf = (err: unknown): number | undefined =>
  (err as { status?: number })?.status ??
  (err as { response?: { status?: number } })?.response?.status;

// Resultado INCERTO: sem resposta (rede, corte por tempo) ou 502/503/504 de
// um intermediário — o servidor pode ter criado os agentes antes da falha
// chegar à tela.
const isUncertainOutcome = (err: unknown): boolean => {
  const status = errorStatusOf(err);
  if (status === 502 || status === 503 || status === 504) return true;
  return (
    status === undefined &&
    Boolean((err as { isAxiosError?: boolean })?.isAxiosError)
  );
};

const errorCodeOf = (err: unknown): string => {
  const raw =
    (err as { data?: { error?: unknown } })?.data?.error ??
    (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof raw === "string" ? raw : "";
};

const segmentClass = (active: boolean) =>
  cn(
    "flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-center text-sm leading-tight transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
    "disabled:cursor-not-allowed disabled:opacity-50",
    active
      ? "bg-background font-medium text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground"
  );

const cardClass = (active: boolean) =>
  cn(
    "min-w-0 rounded-lg border p-3 text-left transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
    "disabled:cursor-not-allowed disabled:opacity-60",
    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-ring/50"
  );

function TemplateCardBody({
  icon: Icon,
  name,
  description,
  indicator,
}: {
  icon: LucideIcon;
  name: string;
  description: string;
  indicator?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium">{name}</span>
        <span className="mt-0.5 block break-words text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      {indicator}
    </span>
  );
}

function CheckIndicator({ checked, muted = false }: { checked: boolean; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
        checked && "bg-primary text-primary-foreground",
        muted && "opacity-60"
      )}
    >
      {checked && <Check className="h-3 w-3" />}
    </span>
  );
}

function ConnectionOption({
  value,
  label,
  hint,
  active,
  disabled,
  children,
}: {
  value: ConnectionMode;
  label: string;
  hint?: string;
  active: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const id = `ai-template-connection-${value}`;
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border p-3 transition-colors",
        active && "border-primary bg-primary/5"
      )}
    >
      <div className="flex items-start gap-2.5">
        <RadioGroupItem value={value} id={id} disabled={disabled} className="mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={id} className="cursor-pointer break-words leading-snug">
            {label}
          </Label>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children && <div className="mt-3 min-w-0 space-y-3 sm:pl-6">{children}</div>}
    </div>
  );
}

export interface AgentTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Recursos que o servidor anuncia (a "Equipe pronta" só com `agentHandoff`)
  features: AiAgentEngineFeature[];
  // Listagem enxuta da página: opções de "Mesma conexão de outro agente" (a
  // chave é copiada no servidor, nunca passa pelo navegador)
  agents: AiAgentSummary[];
  // Chamado depois do toast de sucesso, com o diálogo já fechado. `team` diz se
  // o lote foi a equipe (a página abre o mapa da Recepção) ou um agente só (a
  // página abre o editor dele).
  onCreated: (agents: AiAgentTemplateCreated[], team: boolean) => void | Promise<void>;
}

export function AgentTemplateDialog({
  open,
  onOpenChange,
  features,
  agents,
  onCreated,
}: AgentTemplateDialogProps) {
  const tTpl = useTranslations("aiAgentTemplates");
  const tAgents = useTranslations("aiAgents");
  const tCommon = useTranslations("common");

  const platformEnabled = usePlatformAiEnabled();
  const supportsTeam = features.includes("agentHandoff");

  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<TemplateMode>("single");
  const [singleId, setSingleId] = useState<AiAgentTemplateId | null>(null);
  const [teamIds, setTeamIds] = useState<AiAgentTemplateId[]>([]);
  const [companyName, setCompanyName] = useState("");
  // null = ninguém escolheu ainda: vale o padrão (plataforma > copiar > chave)
  const [chosenConnection, setChosenConnection] = useState<ConnectionMode | null>(null);
  const [copyAgentId, setCopyAgentId] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState(DEFAULT_KEY_MODEL);
  const [queueId, setQueueId] = useState<number | null>(null);
  // As mensagens de campo obrigatório só aparecem depois da 1ª tentativa
  const [submitted, setSubmitted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [catalog, setCatalog] = useState<CatalogState>({ status: "idle", model: null });
  const [queueState, setQueueState] = useState<QueueState>({ status: "loading", list: [] });

  const catalogSeq = useRef(0);
  const queueSeq = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const team = supportsTeam && mode === "team";

  const loadCatalog = useCallback((force: boolean) => {
    catalogSeq.current += 1;
    const seq = catalogSeq.current;
    // O modelo já resolvido fica valendo durante a recarga
    setCatalog(prev => ({ status: "loading", model: prev.model }));
    loadPlatformAiCatalog(force)
      .then(data => {
        if (catalogSeq.current !== seq) return;
        const chat = (data?.models || []).filter(item => item.kind === "chat");
        const preferred = chat.find(item => item.modelId === data?.defaultModelId);
        setCatalog({ status: "ready", model: (preferred || chat[0])?.modelId ?? null });
      })
      .catch(() => {
        // Sem catálogo a opção "IA da plataforma" some; as outras seguem
        if (catalogSeq.current !== seq) return;
        setCatalog({ status: "error", model: null });
      });
  }, []);

  const loadQueues = useCallback((silent: boolean) => {
    queueSeq.current += 1;
    const seq = queueSeq.current;
    if (!silent) setQueueState(prev => ({ status: "loading", list: prev.list }));
    fetchQueues()
      .then(({ data }) => {
        if (queueSeq.current !== seq) return;
        const list = (data || []).filter(queue => queue.isActive !== false);
        setQueueState({ status: "ready", list });
        // Uma fila só = não há o que escolher
        setQueueId(prev =>
          prev !== null && list.some(queue => queue.id === prev)
            ? prev
            : list.length === 1
              ? list[0].id
              : null
        );
      })
      .catch(() => {
        if (queueSeq.current !== seq) return;
        setQueueState(prev =>
          silent && prev.status === "ready" ? prev : { status: "error", list: [] }
        );
      });
  }, []);

  // Cada abertura começa do zero
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setMode("single");
    setSingleId(null);
    setTeamIds([]);
    setCompanyName("");
    setChosenConnection(null);
    setCopyAgentId(null);
    setApiKey("");
    setBaseUrl("");
    setModel(DEFAULT_KEY_MODEL);
    setQueueId(null);
    setSubmitted(false);
    loadQueues(false);
  }, [open, loadQueues]);

  // Catálogo só para quem tem a IA da plataforma liberada (sem o recurso,
  // nenhum request sai daqui); o carregador guarda em cache por tenant
  useEffect(() => {
    if (!open || !platformEnabled) return;
    loadCatalog(false);
  }, [open, platformEnabled, loadCatalog]);

  // Empresa sem fila: o link abre /filas em outra aba — ao voltar para esta,
  // a lista é conferida de novo
  const needsQueueRefresh =
    queueState.status === "error" ||
    (queueState.status === "ready" && queueState.list.length === 0);
  useEffect(() => {
    if (!open || !needsQueueRefresh) return;
    const onFocus = () => loadQueues(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open, needsQueueRefresh, loadQueues]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const copyOptions = useMemo(
    () => agents.filter(agent => Number(agent?.id) > 0),
    [agents]
  );

  const platformAvailable = platformEnabled && catalog.model !== null;
  const copyAvailable = copyOptions.length > 0;
  const isConnectionAvailable = (value: ConnectionMode) =>
    value === "platform" ? platformAvailable : value === "copy" ? copyAvailable : true;
  const defaultConnection: ConnectionMode = platformAvailable
    ? "platform"
    : copyAvailable
      ? "copy"
      : "key";
  const connection: ConnectionMode =
    chosenConnection && isConnectionAvailable(chosenConnection)
      ? chosenConnection
      : defaultConnection;

  // Um agente só na empresa = já vem escolhido
  const effectiveCopyId =
    copyAgentId !== null && copyOptions.some(agent => agent.id === copyAgentId)
      ? copyAgentId
      : copyOptions.length === 1
        ? copyOptions[0].id
        : null;

  const noQueues = queueState.status === "ready" && queueState.list.length === 0;
  const selectedQueueId =
    queueId !== null && queueState.list.some(queue => queue.id === queueId) ? queueId : null;

  const pickedIds: AiAgentTemplateId[] = team ? teamIds : singleId ? [singleId] : [];
  const step1Valid = team ? teamIds.length > 0 : singleId !== null;
  const selectionDefs = resolveTemplateSelection(pickedIds, team)
    .map(id => AI_AGENT_TEMPLATES.find(def => def.id === id))
    .filter((def): def is AiAgentTemplateDef => !!def);
  const receptionDef = AI_AGENT_TEMPLATES.find(def => def.id === TEAM_TRIAGE_ID);

  // O marcador da IA da plataforma nunca vale como chave digitada (C21)
  const typedKey = isPlatformKey(apiKey.trim()) ? "" : apiKey.trim();
  const baseUrlTrim = baseUrl.trim();
  const companyTrim = companyName.trim();

  const companyError = submitted && companyTrim.length === 0;
  const copyError = submitted && connection === "copy" && effectiveCopyId === null;
  const keyError = submitted && connection === "key" && typedKey.length === 0;
  const queueError =
    submitted && queueState.status === "ready" && !noQueues && selectedQueueId === null;

  const handleOpenChange = (next: boolean) => {
    // Durante a criação o diálogo fica aberto: o servidor segue criando
    if (!next && creating) return;
    onOpenChange(next);
  };

  const toggleSpecialist = (id: AiAgentTemplateId) =>
    setTeamIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));

  const focusField = (id: string) => {
    if (typeof document === "undefined") return;
    document.getElementById(id)?.focus();
  };

  const handleCreate = async () => {
    if (creating || !step1Valid) return;
    setSubmitted(true);

    if (companyTrim.length === 0) {
      focusField("ai-template-company");
      return;
    }
    let connectionPayload: AiAgentTemplateConnection;
    if (connection === "platform" && catalog.model) {
      connectionPayload = { mode: "platform", model: catalog.model };
    } else if (connection === "copy") {
      if (effectiveCopyId === null) {
        focusField("ai-template-copy");
        return;
      }
      connectionPayload = { mode: "copy", aiAgentId: effectiveCopyId };
    } else {
      if (!typedKey) {
        focusField("ai-template-api-key");
        return;
      }
      // Endereço inválido: o próprio campo já mostra o motivo
      if (baseUrlTrim && !URL_REGEX.test(baseUrlTrim)) return;
      const modelTrim = model.trim();
      connectionPayload = {
        mode: "key",
        apiKey: typedKey,
        ...(baseUrlTrim ? { baseUrl: baseUrlTrim } : {}),
        ...(modelTrim ? { model: modelTrim } : {}),
      };
    }
    if (selectedQueueId === null) {
      focusField("ai-template-queue");
      return;
    }

    setCreating(true);
    try {
      const templateAgents = buildTemplateAgents({
        // Cast local: o tradutor do next-intl tem assinatura genérica mais larga
        t: tTpl as unknown as AiAgentTemplateTranslator,
        ids: pickedIds,
        team,
        companyName: companyTrim,
        fallbackQueueId: selectedQueueId,
      });
      const { agents: created } = await createAiAgentsFromTemplate({
        connection: connectionPayload,
        fallbackQueueId: selectedQueueId,
        agents: templateAgents,
      });
      toast.success(
        team
          ? tTpl("createdTeam", { count: created.length || templateAgents.length })
          : tTpl("createdOne")
      );
      onOpenChange(false);
      void onCreated(created, team);
    } catch (err: unknown) {
      // Repetir às cegas criaria a equipe de novo: fecha, recarrega a lista e
      // pede para conferir antes de tentar outra vez
      if (isUncertainOutcome(err)) {
        toast.error(tTpl("createUncertain"));
        onOpenChange(false);
        void onCreated([], team);
        return;
      }
      const status = errorStatusOf(err);
      const code = errorCodeOf(err);
      // Sem permissão (403) e recurso fora do plano / bloqueio (402) já têm
      // aviso global em lib/api.ts — repetir aqui daria toast duplo
      if ((status === 403 && code === "ERR_NO_PERMISSION") || status === 402) return;
      const key = aiAgentErrorKey(err);
      if (key && TEMPLATE_ERROR_KEYS.has(key)) {
        toast.error(tAgents(key));
        // Catálogo ou filas mudaram desde a abertura: recarrega para a próxima
        // tentativa já sair certa
        if (key === "errPlatformModelNotAllowed") loadCatalog(true);
        else if (key === "errInvalidFallbackQueue") {
          setQueueId(null);
          loadQueues(true);
        }
      } else if (isNotFoundStatus(err) && !code.startsWith("ERR_")) {
        // 404 sem código = servidor sem a rota (versão anterior)
        toast.error(tTpl("unavailable"));
      } else {
        toast.error(tTpl("createError"));
      }
    } finally {
      setCreating(false);
    }
  };

  const agentMarker = (agent: AiAgentSummary): string =>
    agent.kbOnly
      ? tAgents("markerKbOnly")
      : agent.isActive === false
        ? tAgents("targetAiAgentInactive")
        : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-4 pr-12 text-left sm:px-6 sm:pr-12">
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 shrink-0" />
            <span className="min-w-0 break-words">{tTpl("title")}</span>
          </DialogTitle>
          <DialogDescription>{tTpl("subtitle")}</DialogDescription>
        </DialogHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {step === 1 ? (
            <div className="space-y-5">
              {supportsTeam && (
                <div className="space-y-2">
                  <div
                    role="radiogroup"
                    aria-label={`${tTpl("modeSingle")} / ${tTpl("modeTeam")}`}
                    className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={mode === "single"}
                      onClick={() => setMode("single")}
                      className={segmentClass(mode === "single")}
                    >
                      <Bot className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">{tTpl("modeSingle")}</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={mode === "team"}
                      onClick={() => setMode("team")}
                      className={segmentClass(mode === "team")}
                    >
                      <Users className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">{tTpl("modeTeam")}</span>
                    </button>
                  </div>
                  {team && (
                    <p className="text-xs text-muted-foreground">{tTpl("modeTeamHint")}</p>
                  )}
                </div>
              )}

              {!team ? (
                <div className="space-y-2">
                  <Label>{tTpl("pickTemplate")}</Label>
                  <div
                    role="radiogroup"
                    aria-label={tTpl("pickTemplate")}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  >
                    {AI_AGENT_TEMPLATES.map(tpl => {
                      const selected = singleId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setSingleId(tpl.id)}
                          className={cardClass(selected)}
                        >
                          <TemplateCardBody
                            icon={tpl.icon}
                            name={tTpl(`${tpl.id}.name`)}
                            description={tTpl(`${tpl.id}.description`)}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* A Recepção é fixa: é ela que faz a triagem da equipe */}
                  {receptionDef && (
                    <div
                      role="checkbox"
                      aria-checked
                      aria-disabled
                      className="min-w-0 rounded-lg border border-primary/40 bg-muted/40 p-3"
                    >
                      <TemplateCardBody
                        icon={receptionDef.icon}
                        name={tTpl(`${TEAM_TRIAGE_ID}.name`)}
                        description={tTpl("teamTriageFixed")}
                        indicator={<CheckIndicator checked muted />}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label id="ai-template-team-label">{tTpl("teamPickSpecialists")}</Label>
                    <div
                      role="group"
                      aria-labelledby="ai-template-team-label"
                      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                    >
                      {AI_AGENT_SPECIALIST_TEMPLATES.map(tpl => {
                        const checked = teamIds.includes(tpl.id);
                        return (
                          <button
                            key={tpl.id}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => toggleSpecialist(tpl.id)}
                            className={cardClass(checked)}
                          >
                            <TemplateCardBody
                              icon={tpl.icon}
                              name={tTpl(`${tpl.id}.name`)}
                              description={tTpl(`${tpl.id}.description`)}
                              indicator={<CheckIndicator checked={checked} />}
                            />
                          </button>
                        );
                      })}
                    </div>
                    {teamIds.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        {tTpl("teamPickAtLeastOne")}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* O que vai ser criado */}
              <div className="flex flex-wrap gap-1.5">
                {selectionDefs.map(def => {
                  const Icon = def.icon;
                  return (
                    <Badge key={def.id} variant="secondary" className="max-w-full gap-1 font-normal">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-words">{tTpl(`${def.id}.name`)}</span>
                    </Badge>
                  );
                })}
              </div>

              {/* Nome da empresa (obrigatório — R5-3) */}
              <div className="space-y-1.5">
                <Label htmlFor="ai-template-company">
                  {tTpl("companyName")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ai-template-company"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  maxLength={COMPANY_NAME_MAX}
                  autoComplete="organization"
                  disabled={creating}
                  aria-invalid={companyError || undefined}
                  className={cn(companyError && INVALID_FIELD_CLASS)}
                />
                <p className="text-xs text-muted-foreground">{tTpl("companyNameHint")}</p>
                {companyError && (
                  <p className="text-xs text-destructive">{tTpl("companyNameRequired")}</p>
                )}
              </div>

              {/* Conexão de IA */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label id="ai-template-connection-label">{tTpl("connectionTitle")}</Label>
                  {platformEnabled && catalog.status === "loading" && (
                    <Loader2
                      aria-hidden
                      className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                    />
                  )}
                </div>
                <RadioGroup
                  value={connection}
                  onValueChange={value => setChosenConnection(value as ConnectionMode)}
                  aria-labelledby="ai-template-connection-label"
                  disabled={creating}
                  className="gap-2"
                >
                  {platformAvailable && (
                    <ConnectionOption
                      value="platform"
                      label={tTpl("connectionPlatform")}
                      hint={tTpl("connectionPlatformHint")}
                      active={connection === "platform"}
                      disabled={creating}
                    />
                  )}

                  {copyAvailable && (
                    <ConnectionOption
                      value="copy"
                      label={tTpl("connectionCopy")}
                      hint={tTpl("connectionCopyHint")}
                      active={connection === "copy"}
                      disabled={creating}
                    >
                      {connection === "copy" && (
                        <div className="space-y-1.5">
                          <Select
                            value={effectiveCopyId !== null ? String(effectiveCopyId) : ""}
                            onValueChange={value => {
                              setChosenConnection("copy");
                              setCopyAgentId(Number(value));
                            }}
                            disabled={creating}
                          >
                            <SelectTrigger
                              id="ai-template-copy"
                              aria-label={tTpl("connectionCopy")}
                              aria-invalid={copyError || undefined}
                              className={cn(copyError && INVALID_FIELD_CLASS)}
                            >
                              <SelectValue placeholder={tTpl("connectionCopyPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent className="max-w-[calc(100vw-2rem)]">
                              {copyOptions.map(agent => {
                                const marker = agentMarker(agent);
                                return (
                                  <SelectItem key={agent.id} value={String(agent.id)}>
                                    <span className="break-words">
                                      {agent.name}
                                      {marker ? ` ${marker}` : ""}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {copyError && (
                            <p className="text-xs text-destructive">
                              {tAgents("requiredFields")}
                            </p>
                          )}
                        </div>
                      )}
                    </ConnectionOption>
                  )}

                  <ConnectionOption
                    value="key"
                    label={tTpl("connectionKey")}
                    active={connection === "key"}
                    disabled={creating}
                  >
                    {connection === "key" && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="ai-template-api-key">
                            {tAgents("fieldApiKey")}
                            <span className="text-destructive"> *</span>
                          </Label>
                          <Input
                            id="ai-template-api-key"
                            type="password"
                            autoComplete="new-password"
                            value={apiKey}
                            onChange={e => {
                              // Digitar fixa o modo: o catálogo chegando depois
                              // não troca a opção por baixo de quem está digitando
                              setChosenConnection("key");
                              setApiKey(e.target.value);
                            }}
                            placeholder="sk-..."
                            disabled={creating}
                            aria-invalid={keyError || undefined}
                            className={cn(keyError && INVALID_FIELD_CLASS)}
                          />
                          <p className="text-xs text-muted-foreground">{tAgents("apiKeyHint")}</p>
                          {keyError && (
                            <p className="text-xs text-destructive">
                              {tAgents("apiKeyRequired")}
                            </p>
                          )}
                        </div>

                        <OpenAIBaseUrlField
                          value={baseUrl}
                          onChange={value => {
                            setChosenConnection("key");
                            setBaseUrl(value);
                          }}
                          context="agent"
                          disabled={creating}
                        />

                        <div className="space-y-1.5">
                          <Label htmlFor="ai-template-model">{tAgents("fieldModel")}</Label>
                          <Input
                            id="ai-template-model"
                            list="ai-template-model-list"
                            value={model}
                            onChange={e => {
                              setChosenConnection("key");
                              setModel(e.target.value);
                            }}
                            placeholder={DEFAULT_KEY_MODEL}
                            disabled={creating}
                          />
                          <datalist id="ai-template-model-list">
                            {CHATGPT_MODELS.map(item => (
                              <option key={item} value={item} />
                            ))}
                          </datalist>
                          <p className="text-xs text-muted-foreground">{tAgents("modelHint")}</p>
                        </div>
                      </>
                    )}
                  </ConnectionOption>
                </RadioGroup>
              </div>

              {/* Fila de emergência (obrigatória — R5-1) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ai-template-queue">
                    {tAgents("fallbackQueue")} <span className="text-destructive">*</span>
                  </Label>
                  {queueState.status === "loading" && (
                    <Loader2
                      aria-hidden
                      className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                    />
                  )}
                  {queueState.status === "error" && (
                    <button
                      type="button"
                      onClick={() => loadQueues(false)}
                      title={tCommon("atualizar")}
                      aria-label={tCommon("atualizar")}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {noQueues ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    {/* Nova aba: o assistente fica aberto e confere as filas de
                        novo quando esta aba volta ao foco */}
                    <Link
                      href="/filas"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 break-words underline-offset-2 hover:underline"
                    >
                      {tTpl("noQueuesHint")}
                      <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" />
                    </Link>
                  </div>
                ) : (
                  <>
                    <Select
                      value={selectedQueueId !== null ? String(selectedQueueId) : ""}
                      onValueChange={value => setQueueId(Number(value))}
                      disabled={creating || queueState.status !== "ready"}
                    >
                      <SelectTrigger
                        id="ai-template-queue"
                        aria-invalid={queueError || undefined}
                        className={cn(queueError && INVALID_FIELD_CLASS)}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-w-[calc(100vw-2rem)]">
                        {queueState.list.map(queue => (
                          <SelectItem key={queue.id} value={String(queue.id)}>
                            <span className="break-words">{queue.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{tAgents("fallbackQueueNote")}</p>
                    {queueError && (
                      <p className="text-xs text-destructive">{tTpl("queueRequired")}</p>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="min-w-0">{tTpl("examplesNote")}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t px-4 py-4 sm:space-x-0 sm:px-6">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {tTpl("cancel")}
              </Button>
              <Button onClick={() => setStep(2)} disabled={!step1Valid}>
                {tTpl("next")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={creating}>
                {tTpl("back")}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || queueState.status !== "ready" || noQueues}
                className="gap-1.5"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {creating ? tTpl("creating") : tTpl("create")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
