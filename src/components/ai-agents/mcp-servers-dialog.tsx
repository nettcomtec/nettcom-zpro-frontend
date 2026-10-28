"use client";

// v8 — cadastro dos Servidores MCP da empresa (docs/PLANO_AGENTES_IA_MCP.md
// §5.6.4). A interface `McpServersDialogProps` e os dois exports são CONTRATO:
// a página /agentes-ia e o editor do agente (aba Ferramentas) abrem este
// diálogo.
//
// Duas telas dentro do mesmo diálogo: a LISTA dos servidores e o DETALHE de um
// servidor (formulário + ferramentas para aprovar). O token nunca volta do
// servidor (só `hasSecret`), então o campo nunca é preenchido com o salvo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Globe,
  HelpCircle, Info, Loader2, Pencil, PlugZap, Plus, RefreshCw, Server, Trash2,
  XCircle,
} from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { useLocale } from "@/i18n/locale-provider";
import { useAuthStore } from "@/stores/auth-store";
import {
  aiAgentErrorCode, aiAgentErrorKey, aiAgentErrorKeyFromCode,
} from "@/components/ai-agents/agent-error";
import {
  MAX_MCP_HEADER_NAME,
  MAX_MCP_SECRET,
  MAX_MCP_SERVER_NAME,
  MAX_MCP_SERVERS_PER_TENANT,
  MAX_MCP_URL,
  MCP_TIMEOUT_DEFAULT_SEC,
  MCP_TIMEOUT_MAX_SEC,
  MCP_TIMEOUT_MIN_SEC,
  approveAiMcpServerTools,
  createAiMcpServer,
  deleteAiMcpServer,
  listAiMcpServers,
  syncAiMcpServer,
  testAiMcpServer,
  updateAiMcpServer,
  type McpApprovalInput,
  type McpAuthType,
  type McpServerPayload,
  type McpServerToolView,
  type McpServerView,
  type McpToolState,
} from "@/services/ai-mcp-servers";

export interface McpServersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Chamado depois de qualquer mudança salva (criar, editar, excluir,
  // atualizar ferramentas, aprovar) — quem abriu recarrega o que mostra.
  onChanged?: () => void;
}

const AUTH_TYPES: McpAuthType[] = ["none", "bearer", "header", "url"];

const AUTH_LABEL_KEY: Record<McpAuthType, string> = {
  none: "mcpAuthNone",
  bearer: "mcpAuthBearer",
  header: "mcpAuthHeader",
  url: "mcpAuthUrl",
};

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const TOOL_STATE_BADGE: Record<McpToolState, { key: string; variant: BadgeVariant }> = {
  pending: { key: "mcpBadgePending", variant: "secondary" },
  active: { key: "mcpBadgeActive", variant: "success-soft" },
  changed: { key: "mcpBadgeChanged", variant: "warning-soft" },
  removed: { key: "mcpBadgeRemoved", variant: "destructive-soft" },
  invalid: { key: "mcpBadgeInvalid", variant: "secondary" },
};

// Nomes de agentes mostrados no cartão; o resto vira "e mais N"
const AGENT_NAMES_SHOWN = 5;
// Na confirmação de exclusão cabem mais nomes
const DELETE_AGENT_NAMES_SHOWN = 10;

// Parâmetros mostrados no "O que a IA recebe": profundidade e linhas (o
// servidor já corta os parâmetros em 4 KB por ferramenta).
const MAX_PARAM_DEPTH = 4;
const MAX_PARAM_LINES = 150;

// Formulário do servidor. `secret` é SÓ o que foi digitado agora (o salvo
// nunca vem do servidor); `timeout` é texto para não perder o que está sendo
// digitado (o número é conferido ao sair do campo e no envio).
interface ServerForm {
  name: string;
  url: string;
  authType: McpAuthType;
  headerName: string;
  secret: string;
  secretClear: boolean;
  timeout: string;
  isActive: boolean;
}

const EMPTY_FORM: ServerForm = {
  name: "",
  url: "",
  authType: "none",
  headerName: "",
  secret: "",
  secretClear: false,
  timeout: String(MCP_TIMEOUT_DEFAULT_SEC),
  isActive: true,
};

const formFromServer = (server: McpServerView): ServerForm => ({
  name: server.name || "",
  // No modo "Endereço com token" o `url` salvo é só a origem (exibição): o
  // endereço inteiro é o segredo e nunca volta.
  url: server.authType === "url" ? "" : server.url || "",
  authType: AUTH_TYPES.includes(server.authType) ? server.authType : "none",
  headerName: server.headerName || "",
  secret: "",
  secretClear: false,
  timeout: String(server.timeoutSec || MCP_TIMEOUT_DEFAULT_SEC),
  isActive: server.isActive !== false,
});

const clampTimeout = (raw: string): number => {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return MCP_TIMEOUT_DEFAULT_SEC;
  return Math.min(Math.max(parsed, MCP_TIMEOUT_MIN_SEC), MCP_TIMEOUT_MAX_SEC);
};

// Endereço que parece trazer o segredo no CAMINHO (Zapier `/s/<segredo>/mcp`,
// Make `/u/<token>/`, n8n `/mcp/<uuid>/`): só um AVISO sugerindo o
// tipo "Endereço com token" (que guarda o endereço inteiro protegido) — nunca
// recusa. Mesma regra de segmento do servidor (20+ caracteres com letra e
// dígito).
const TOKEN_LIKE_SEGMENT_RE = /^(?=[A-Za-z0-9_-]*[0-9])(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{20,}$/;

const urlLooksTokenized = (raw: string): boolean => {
  try {
    const parsed = new URL(raw.trim());
    return parsed.pathname.split("/").some(segment => TOKEN_LIKE_SEGMENT_RE.test(segment));
  } catch {
    return false;
  }
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

const isServerView = (value: unknown): value is McpServerView => {
  const v = value as { id?: unknown; tools?: unknown } | null;
  return !!v && typeof v === "object" && Number(v.id) > 0 && Array.isArray(v.tools);
};

// Rascunho da aprovação de UMA ferramenta, preso ao hash que o admin viu: se a
// ferramenta mudar (sincronização no meio), o rascunho deixa de valer sozinho.
interface ToolDraft {
  hash: string;
  approved: boolean;
  altersData: boolean;
}

// Estado inicial do "Liberada"/"Altera dados" de cada ferramenta (D5: nada vem
// marcado). Para a que MUDOU no servidor o "Liberada" começa desmarcado: ela
// está pausada e só volta com nova aprovação. "Altera dados" vem do que foi
// salvo na aprovação ou, para a pendente, da dica do servidor (D20).
const initialDraft = (tool: McpServerToolView): ToolDraft => {
  if (tool.state === "active") {
    return { hash: tool.hash, approved: true, altersData: !!tool.altersData };
  }
  if (tool.state === "pending") {
    return { hash: tool.hash, approved: false, altersData: tool.readOnlyHint !== true };
  }
  // Mudou/sumiu/inválida: nunca REBAIXA sozinha para "só consulta". Se a
  // ferramenta passou a se declarar de escrita (a troca da dica pausa a
  // ferramenta), o switch vem ligado mesmo que a aprovação antiga dissesse
  // "não altera" — senão rodaria sem reserva nem nota.
  return {
    hash: tool.hash,
    approved: false,
    altersData: !!tool.altersData || tool.readOnlyHint !== true,
  };
};

const effectiveDraft = (
  tool: McpServerToolView,
  drafts: Record<string, ToolDraft>
): ToolDraft => {
  const draft = drafts[tool.name];
  return draft && draft.hash === tool.hash ? draft : initialDraft(tool);
};

// Ferramenta que dá para aprovar agora: válida e ainda presente no servidor
const isApprovable = (tool: McpServerToolView): boolean =>
  tool.valid !== false && tool.state !== "invalid" && tool.state !== "removed";

// Aprovação antiga que ficou parada (mudou, sumiu ou ficou inválida): pode ser
// descartada para tirar a ferramenta da contagem de pausadas.
const hasStaleApproval = (tool: McpServerToolView): boolean =>
  tool.state === "changed" ||
  tool.state === "removed" ||
  (tool.state === "invalid" && tool.approved === true);

// Só as ferramentas cuja decisão mudou vão ao servidor (§5.6.4).
const buildApprovalChanges = (
  tools: McpServerToolView[],
  drafts: Record<string, ToolDraft>
): McpApprovalInput[] => {
  const changes: McpApprovalInput[] = [];
  for (const tool of tools) {
    if (!isApprovable(tool)) continue;
    const base = initialDraft(tool);
    const draft = effectiveDraft(tool, drafts);
    if (tool.state === "active") {
      if (!draft.approved) {
        changes.push({ name: tool.name, hash: tool.hash, approved: false });
      } else if (draft.altersData !== base.altersData) {
        changes.push({
          name: tool.name,
          hash: tool.hash,
          approved: true,
          altersData: draft.altersData,
        });
      }
    } else if (draft.approved) {
      // Pendente ou que mudou: aprovar grava o hash ATUAL
      changes.push({
        name: tool.name,
        hash: tool.hash,
        approved: true,
        altersData: draft.altersData,
      });
    }
  }
  return changes;
};

// ── "O que a IA recebe": parâmetros lidos de `parameters.properties` ────────

interface ParamLine {
  key: string;
  name: string;
  depth: number;
  type: string;
  required: boolean;
  description: string;
  enumValues: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const schemaType = (node: Record<string, unknown>, depth = 0): string => {
  const raw = node.type;
  const base = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string").join(" | ")
    : typeof raw === "string"
      ? raw
      : "";
  if (base === "array" && isRecord(node.items) && depth < MAX_PARAM_DEPTH) {
    const inner = schemaType(node.items, depth + 1);
    return inner ? `array<${inner}>` : base;
  }
  return base;
};

const collectParamLines = (schema: unknown, depth: number, out: ParamLine[]): void => {
  if (!isRecord(schema) || depth > MAX_PARAM_DEPTH) return;
  const properties = isRecord(schema.properties) ? schema.properties : null;
  if (!properties) return;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
  for (const [name, node] of Object.entries(properties)) {
    if (out.length >= MAX_PARAM_LINES) return;
    const prop = isRecord(node) ? node : {};
    out.push({
      key: `${depth}-${out.length}-${name}`,
      name,
      depth,
      type: schemaType(prop),
      required: required.includes(name),
      description: typeof prop.description === "string" ? prop.description : "",
      enumValues: Array.isArray(prop.enum) ? prop.enum.map(value => String(value)) : [],
    });
    if (isRecord(prop.properties)) collectParamLines(prop, depth + 1, out);
    else if (isRecord(prop.items)) collectParamLines(prop.items, depth + 1, out);
  }
};

const paramLinesOf = (parameters: unknown): ParamLine[] => {
  const out: ParamLine[] = [];
  collectParamLines(parameters, 0, out);
  return out;
};

// ── Ajuda (explica o funcionamento e os alertas, sem termo técnico) ─────────

function McpHelp({ label, text }: { label: string; text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label={label}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      {/* Altura presa à área visível (rolagem interna): dentro do diálogo, em
          tela baixa, o fim do texto ficava cortado */}
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={16}
        className="w-[380px] max-w-[calc(100vw-2rem)] overflow-y-auto text-xs"
        style={{ maxHeight: "var(--radix-popover-content-available-height, 70vh)" }}
      >
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-2 whitespace-pre-line text-muted-foreground">{text}</p>
      </PopoverContent>
    </Popover>
  );
}

export function McpServersDialog({ open, onOpenChange, onChanged }: McpServersDialogProps) {
  const t = useTranslations("aiAgents");
  const tc = useTranslations("common");
  const { locale } = useLocale();
  // D21 — cadastrar, testar, atualizar, aprovar e excluir: admin, superadmin,
  // supervisor e personalizado com `ai_agents_manage`. O `user` comum vê tudo
  // só para leitura (o servidor recusa a escrita de qualquer jeito).
  const profile = useAuthStore(s => s.user?.profile);
  const canManage = useAuthStore(s => s.hasPermission("ai_agents_manage"));
  const canWrite = canManage && profile !== "user";

  const [servers, setServers] = useState<McpServerView[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const loadSeqRef = useRef(0);

  // null = lista; "new" = servidor novo (ainda não salvo); número = salvo
  const [detail, setDetail] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<ServerForm>(EMPTY_FORM);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ToolDraft>>({});

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<McpServerView | null>(null);
  const busy = saving || syncing || testing || approving || deleting;

  // Lista completa (com ferramentas). Silenciosa: `null` = servidor antigo ou
  // falha. Recarga em segundo plano que falha mantém a lista que já está na
  // tela; só a carga inicial mostra o erro.
  const reloadServers = useCallback(
    async (showSpinner = false): Promise<McpServerView[] | null> => {
      loadSeqRef.current += 1;
      const seq = loadSeqRef.current;
      if (showSpinner) setListState("loading");
      const list = await listAiMcpServers();
      if (seq !== loadSeqRef.current) return null;
      if (list === null) {
        if (showSpinner) setListState("error");
        return null;
      }
      setServers(list.filter(isServerView));
      setListState("ready");
      return list;
    },
    []
  );

  // Cada abertura começa na lista, recarregada do servidor
  useEffect(() => {
    if (!open) return;
    setDetail(null);
    setForm(EMPTY_FORM);
    setTestResult(null);
    setDrafts({});
    setDeleteTarget(null);
    void reloadServers(true);
  }, [open, reloadServers]);

  const savedServer =
    typeof detail === "number" ? servers.find(server => server.id === detail) || null : null;

  // Servidor aberto que sumiu da lista (excluído em outra aba): volta à lista
  useEffect(() => {
    if (typeof detail === "number" && listState === "ready" && !savedServer) {
      setDetail(null);
    }
  }, [detail, listState, savedServer]);

  const upsertServer = (server: McpServerView) => {
    setServers(prev => {
      const index = prev.findIndex(item => item.id === server.id);
      if (index < 0) return [...prev, server];
      const next = prev.slice();
      next[index] = server;
      return next;
    });
  };

  const errorText = (err: unknown): string => {
    const key = aiAgentErrorKey(err);
    return key ? t(key) : tc("errorOccurred");
  };

  const codeText = (code?: string | null): string => {
    const key = aiAgentErrorKeyFromCode(code);
    return key ? t(key) : tc("errorOccurred");
  };

  // Servidor que não existe mais (404 com código): volta à lista atualizada
  const handleNotFound = (err: unknown): boolean => {
    if (aiAgentErrorCode(err) !== "ERR_MCP_NOT_FOUND") return false;
    setDetail(null);
    void reloadServers();
    onChanged?.();
    return true;
  };

  const formatDate = (value?: string | null): string => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    try {
      return date.toLocaleString(locale);
    } catch {
      return date.toLocaleString();
    }
  };

  const formatNames = (names: string[], shown: number): string => {
    const head = names.slice(0, shown).join(", ");
    const rest = names.length - shown;
    return rest > 0 ? `${head} ${t("usageMore", { count: rest })}` : head;
  };

  const setField = <K extends keyof ServerForm>(key: K, value: ServerForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setTestResult(null);
  };

  const openDetail = (server: McpServerView | null) => {
    setDetail(server ? server.id : "new");
    setForm(server ? formFromServer(server) : EMPTY_FORM);
    setTestResult(null);
    setDrafts({});
  };

  const backToList = () => {
    setDetail(null);
    setTestResult(null);
    setDrafts({});
  };

  // ── Segredo: quando o salvo é reaproveitado ───────────────────────────────

  // O servidor só reaproveita o token salvo com o mesmo endereço e a mesma
  // autenticação (senão ERR_MCP_SECRET_REQUIRED). Aqui é só a DICA na tela: a
  // comparação de endereço do servidor é por origem + caminho.
  const bindingChanged =
    !!savedServer &&
    savedServer.hasSecret &&
    !form.secretClear &&
    !form.secret.trim() &&
    form.authType !== "none" &&
    (savedServer.authType !== form.authType ||
      (form.authType === "header" &&
        (savedServer.headerName || "") !== form.headerName.trim()) ||
      (form.authType !== "url" && (savedServer.url || "") !== form.url.trim()));

  const secretKept =
    !!savedServer &&
    savedServer.hasSecret &&
    !savedServer.secretUnreadable &&
    !form.secretClear &&
    !bindingChanged;

  // Monta o envio do formulário; `null` = faltou campo (já avisado). O teste
  // não exige o nome.
  const buildPayload = (forTest: boolean): McpServerPayload | null => {
    const name = form.name.trim();
    if (!forTest && !name) {
      toast.error(t("errMcpInvalidName"));
      return null;
    }
    const authType = form.authType;
    const payload: McpServerPayload = {
      name,
      authType,
      timeoutSec: clampTimeout(form.timeout),
      isActive: form.isActive,
      headerName: authType === "header" ? form.headerName.trim() : null,
    };
    if (authType !== "url") {
      const url = form.url.trim();
      if (!url) {
        toast.error(t("errMcpInvalidUrl"));
        return null;
      }
      // Endereço com parâmetros (`?token=...`) ou `usuário:senha@` nunca sai do
      // navegador neste modo: o token iria para a auditoria. O caminho certo é
      // o tipo "Endereço com token", em que o endereço é o campo secreto.
      try {
        const parsed = new URL(url);
        if (parsed.search || parsed.username || parsed.password) {
          toast.error(t(parsed.search ? "errMcpUrlQuery" : "errMcpInvalidUrl"));
          return null;
        }
      } catch {
        toast.error(t("errMcpInvalidUrl"));
        return null;
      }
      payload.url = url;
    }
    if (authType === "header" && !payload.headerName) {
      toast.error(t("errMcpInvalidHeader"));
      return null;
    }
    const secret = form.secret.trim();
    if (authType === "none") {
      // Sem autenticação o token salvo não serve mais: sai junto ao salvar
      if (!forTest && savedServer?.hasSecret) payload.secretClear = true;
    } else if (secret) {
      payload.secret = secret;
    } else if (form.secretClear && !forTest && authType !== "url") {
      // "Remover token": o servidor decide se a autenticação escolhida aceita
      // ficar sem token
      payload.secretClear = true;
    } else {
      // Campo vazio = manter o salvo. No modo "Endereço com token" o endereço
      // é o próprio segredo: só um endereço salvo NESSE modo serve.
      const canReuse =
        savedServer !== null &&
        savedServer.hasSecret &&
        !form.secretClear &&
        (authType !== "url" || savedServer.authType === "url");
      if (!canReuse) {
        toast.error(t(authType === "url" ? "errMcpInvalidUrl" : "errMcpSecretRequired"));
        return null;
      }
      // Testar com um token que não abre mais só repetiria a falha
      if (forTest && savedServer?.secretUnreadable) {
        toast.error(t("errMcpSecretUnreadable"));
        return null;
      }
    }
    return payload;
  };

  // ── Ações ──────────────────────────────────────────────────────────────────

  // Atualiza as ferramentas do servidor. Depois do Salvar (`afterSave`) o
  // servidor JÁ está salvo: falha aqui só avisa, nunca desfaz.
  const runSync = async (id: number, afterSave: boolean) => {
    setSyncing(true);
    try {
      const res = await syncAiMcpServer(id);
      const synced = res?.server;
      if (isServerView(synced)) upsertServer(synced);
      else await reloadServers();
      if (res?.ok) {
        if (afterSave) toast.success(t("mcpSaved"), { description: t("mcpSyncDone") });
        else toast.success(t("mcpSyncDone"));
      } else {
        const reason = codeText(res?.code);
        if (afterSave) toast.warning(t("mcpSaved"), { description: reason });
        else toast.error(reason);
      }
    } catch (err: unknown) {
      if (!handleNotFound(err)) {
        const reason = errorText(err);
        if (afterSave) toast.warning(t("mcpSaved"), { description: reason });
        else toast.error(reason);
      }
    } finally {
      setSyncing(false);
      // Salvou e/ou conferiu: quem abriu recarrega (selo de pausadas, lista
      // de servidores no editor do agente)
      onChanged?.();
    }
  };

  const handleSave = async () => {
    if (!canWrite || busy || detail === null) return;
    const payload = buildPayload(false);
    if (!payload) return;
    const editingId = typeof detail === "number" ? detail : null;
    setSaving(true);
    let result: unknown;
    try {
      result = editingId
        ? await updateAiMcpServer(editingId, payload)
        : await createAiMcpServer(payload);
    } catch (err: unknown) {
      setSaving(false);
      if (!handleNotFound(err)) toast.error(errorText(err));
      return;
    }
    setSaving(false);

    let savedId = editingId;
    if (isServerView(result)) {
      savedId = result.id;
      upsertServer(result);
      setDetail(result.id);
      // O token digitado não fica no campo: daqui em diante ele é "o salvo"
      setForm(formFromServer(result));
    } else {
      // Resposta fora do formato: a lista do servidor é a verdade
      await reloadServers();
      if (!editingId) {
        setDetail(null);
        onChanged?.();
        return;
      }
      setForm(prev => ({ ...prev, secret: "", secretClear: false }));
    }
    setTestResult(null);
    // A15/B8 — o salvar não confere as ferramentas: a tela pede em seguida,
    // com o aviso de "conferindo" (o `onChanged` sai no fim da conferência)
    if (savedId) await runSync(savedId, true);
    else onChanged?.();
  };

  const handleTest = async () => {
    if (!canWrite || busy || detail === null) return;
    const payload = buildPayload(true);
    if (!payload) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Editando: o servidor usa o token salvo quando o campo está vazio (só
      // com o mesmo endereço e a mesma autenticação)
      const res = await testAiMcpServer({
        ...payload,
        id: typeof detail === "number" ? detail : null,
      });
      if (res?.ok) {
        setTestResult({
          ok: true,
          text: t("mcpTestOk", { count: Number(res.toolCount) || 0 }),
        });
      } else {
        setTestResult({ ok: false, text: codeText(res?.code) });
      }
    } catch (err: unknown) {
      if (!handleNotFound(err)) setTestResult({ ok: false, text: errorText(err) });
    } finally {
      setTesting(false);
    }
  };

  const submitApprovals = async (serverId: number, entries: McpApprovalInput[]) => {
    if (!canWrite || busy || entries.length === 0) return;
    setApproving(true);
    try {
      const updated = await approveAiMcpServerTools(serverId, entries);
      if (isServerView(updated)) upsertServer(updated);
      else await reloadServers();
      setDrafts(prev => {
        const next = { ...prev };
        for (const entry of entries) delete next[entry.name];
        return next;
      });
      toast.success(t("mcpApprovalsSaved"));
      onChanged?.();
    } catch (err: unknown) {
      if (aiAgentErrorCode(err) === "ERR_MCP_HASH_MISMATCH") {
        // A ferramenta mudou enquanto o admin revisava: nada foi gravado. A
        // lista nova mostra o texto novo; o rascunho preso ao hash antigo
        // deixa de valer sozinho.
        toast.error(t("errMcpHashMismatch"));
        await reloadServers();
      } else if (!handleNotFound(err)) {
        toast.error(errorText(err));
      }
    } finally {
      setApproving(false);
    }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!canWrite || !target || deleting) return;
    setDeleting(true);
    try {
      await deleteAiMcpServer(target.id);
      setServers(prev => prev.filter(server => server.id !== target.id));
      setDetail(prev => (prev === target.id ? null : prev));
      toast.success(t("mcpDeleted"));
      onChanged?.();
    } catch (err: unknown) {
      if (!handleNotFound(err)) toast.error(errorText(err));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const approvalChanges = useMemo(
    () => (savedServer ? buildApprovalChanges(savedServer.tools || [], drafts) : []),
    [savedServer, drafts]
  );

  const patchDraft = (tool: McpServerToolView, patch: Partial<Omit<ToolDraft, "hash">>) => {
    setDrafts(prev => ({
      ...prev,
      [tool.name]: { ...effectiveDraft(tool, prev), ...patch, hash: tool.hash },
    }));
  };

  // ── Pedaços de tela ────────────────────────────────────────────────────────

  const statusBadge = (server: McpServerView) => {
    const status = server.lastSyncStatus;
    if (!status) return <Badge variant="secondary">{t("mcpStatusNever")}</Badge>;
    if (status === "ok") return <Badge variant="success-soft">{t("mcpStatusOk")}</Badge>;
    return <Badge variant="destructive-soft">{t("mcpStatusError")}</Badge>;
  };

  const lastCheckText = (server: McpServerView): string => {
    const date = formatDate(server.lastCheckAt || server.lastSyncAt);
    return date ? t("mcpLastCheck", { date }) : "";
  };

  const pausedWarning = (count: number) => (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs text-foreground">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      <p className="min-w-0">{t("mcpPausedWarning", { count })}</p>
    </div>
  );

  const unreadableWarning = (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs text-foreground">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      <p className="min-w-0">{t("mcpSecretUnreadable")}</p>
    </div>
  );

  // D22 (cluster): cache de até 1 minuto nos outros processos
  const propagationNote = (
    <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0">{t("mcpPropagationNote")}</p>
    </div>
  );

  const atLimit = servers.length >= MAX_MCP_SERVERS_PER_TENANT;

  const renderServerCard = (server: McpServerView) => {
    const tools = Array.isArray(server.tools) ? server.tools : [];
    const activeCount = tools.filter(tool => tool.state === "active").length;
    const pendingCount = tools.filter(tool => tool.state === "pending").length;
    const pausedCount = Number(server.pausedCount) || 0;
    const agentNames = (Array.isArray(server.agents) ? server.agents : [])
      .map(agent => agent?.name)
      .filter((name): name is string => !!name);
    const lastCheck = lastCheckText(server);
    return (
      <div key={server.id} className="space-y-2 rounded-md border p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-0 break-words font-medium">{server.name}</span>
              {statusBadge(server)}
              {!server.isActive && <Badge variant="outline">{t("statusInactive")}</Badge>}
            </div>
            <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{hostOf(server.url || "")}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {canWrite ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openDetail(server)}
                  aria-label={t("edit")}
                  title={t("edit")}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => setDeleteTarget(server)}
                  disabled={busy}
                  aria-label={t("delete")}
                  title={t("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openDetail(server)}
                aria-label={server.name}
                title={server.name}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {(activeCount > 0 || pendingCount > 0 || pausedCount > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {activeCount > 0 && (
              <Badge variant="success-soft">{t("mcpCountActive", { count: activeCount })}</Badge>
            )}
            {pendingCount > 0 && (
              <Badge variant="secondary">{t("mcpCountPending", { count: pendingCount })}</Badge>
            )}
            {pausedCount > 0 && (
              <Badge variant="warning-soft">{t("mcpPausedBadge", { count: pausedCount })}</Badge>
            )}
          </div>
        )}

        {lastCheck && <p className="text-xs text-muted-foreground">{lastCheck}</p>}
        {agentNames.length > 0 && (
          <p className="break-words text-xs text-muted-foreground">
            {t("mcpUsedBy", { names: formatNames(agentNames, AGENT_NAMES_SHOWN) })}
          </p>
        )}
        {pausedCount > 0 && pausedWarning(pausedCount)}
        {server.secretUnreadable && unreadableWarning}
      </div>
    );
  };

  const renderToolRow = (server: McpServerView, tool: McpServerToolView, index: number) => {
    const draft = effectiveDraft(tool, drafts);
    const approvable = isApprovable(tool);
    const stateBadge = TOOL_STATE_BADGE[tool.state] || TOOL_STATE_BADGE.pending;
    const lines = paramLinesOf(tool.parameters);
    const approveId = `mcp-tool-approved-${server.id}-${index}`;
    const writeId = `mcp-tool-writes-${server.id}-${index}`;
    return (
      <div key={`${tool.name}-${index}`} className="space-y-2.5 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 break-all font-mono text-sm font-medium">{tool.name}</span>
          <Badge variant={stateBadge.variant}>{t(stateBadge.key)}</Badge>
          {/* Dica do servidor, só informativa (D5): quem decide é o "Altera dados" */}
          {approvable && (
            <Badge variant="outline">
              {tool.readOnlyHint === true ? t("mcpBadgeReadOnly") : t("mcpBadgeWrites")}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={approveId}
              checked={draft.approved}
              disabled={!canWrite || !approvable || busy}
              onCheckedChange={value => patchDraft(tool, { approved: value === true })}
            />
            <Label htmlFor={approveId} className="text-sm font-normal">
              {t("mcpToolApproved")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={writeId}
              checked={draft.altersData}
              disabled={!canWrite || !approvable || busy}
              onCheckedChange={value => patchDraft(tool, { altersData: value })}
            />
            <Label htmlFor={writeId} className="text-sm font-normal">
              {t("mcpToolAltersData")}
            </Label>
            <McpHelp label={t("mcpToolAltersData")} text={t("mcpAltersDataHelp")} />
          </div>
          {canWrite && hasStaleApproval(tool) && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs text-destructive"
              disabled={busy}
              onClick={() =>
                void submitApprovals(server.id, [
                  { name: tool.name, hash: tool.hash, approved: false },
                ])
              }
            >
              {t("mcpToolDiscard")}
            </Button>
          )}
        </div>

        {/* A7/B5 — exatamente o que vai à IA: a descrição e os parâmetros já
            limpos e cortados pelo servidor */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
              {t("mcpToolSentToAi")}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-3 rounded-md bg-muted/40 p-3 text-xs">
              {tool.descriptionForModel && (
                <p className="whitespace-pre-wrap break-words">{tool.descriptionForModel}</p>
              )}
              <div className="space-y-1.5">
                <p className="font-medium">{t("toolParams")}</p>
                {lines.length === 0 ? (
                  <p className="text-muted-foreground">{t("mcpToolNoParams")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {lines.map(line => (
                      <li
                        key={line.key}
                        className="min-w-0"
                        style={{ paddingLeft: `${line.depth * 12}px` }}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-1.5">
                          <code className="break-all font-mono font-medium">{line.name}</code>
                          {line.type && (
                            <span className="break-all font-mono text-muted-foreground">
                              {line.type}
                            </span>
                          )}
                          {line.required && (
                            <span className="text-destructive">{t("paramRequired")}</span>
                          )}
                        </div>
                        {line.enumValues.length > 0 && (
                          <p className="break-words font-mono text-muted-foreground">
                            {line.enumValues.join(" | ")}
                          </p>
                        )}
                        {line.description && (
                          <p className="whitespace-pre-wrap break-words text-muted-foreground">
                            {line.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  // ── Tela: lista ────────────────────────────────────────────────────────────

  const renderList = () => {
    if (listState === "loading") {
      return (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (listState === "error") {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">{tc("errorFetchingData")}</p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void reloadServers(true)}>
            <RefreshCw className="h-4 w-4" />
            {tc("atualizar")}
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {servers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center">
            <Server className="h-8 w-8 text-muted-foreground" />
            <p className="px-4 text-sm text-muted-foreground">{t("mcpServersEmpty")}</p>
          </div>
        ) : (
          servers.map(renderServerCard)
        )}
        {canWrite && atLimit && (
          <p className="text-xs text-muted-foreground">
            {t("mcpLimitReached", { max: MAX_MCP_SERVERS_PER_TENANT })}
          </p>
        )}
        {propagationNote}
      </div>
    );
  };

  // ── Tela: detalhe (formulário + ferramentas) ───────────────────────────────

  const renderSecretHints = () => (
    <>
      {savedServer?.secretUnreadable && !form.secret.trim() && unreadableWarning}
      {bindingChanged && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t("errMcpSecretRequired")}</p>
      )}
    </>
  );

  const renderDetail = () => {
    const isUrlMode = form.authType === "url";
    const hasTokenField = form.authType === "bearer" || form.authType === "header";
    const savedUrlMode = !!savedServer && savedServer.authType === "url";
    const tools = savedServer && Array.isArray(savedServer.tools) ? savedServer.tools : [];
    const pausedCount = Number(savedServer?.pausedCount) || 0;
    const statusCode =
      savedServer?.lastSyncStatus && savedServer.lastSyncStatus !== "ok"
        ? savedServer.lastSyncStatus
        : null;
    const lastCheck = savedServer ? lastCheckText(savedServer) : "";

    return (
      <div className="space-y-5">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="mcp-server-name">
                {t("mcpServerName")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mcp-server-name"
                value={form.name}
                onChange={e => setField("name", e.target.value)}
                placeholder={t("mcpServerNamePlaceholder")}
                maxLength={MAX_MCP_SERVER_NAME}
                disabled={!canWrite}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t("mcpAuthType")}</Label>
                <McpHelp label={t("mcpAuthType")} text={t("mcpAuthHelp")} />
              </div>
              <Select
                value={form.authType}
                onValueChange={value => {
                  if (AUTH_TYPES.includes(value as McpAuthType)) {
                    setField("authType", value as McpAuthType);
                  }
                }}
                disabled={!canWrite}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">
                  {AUTH_TYPES.map(type => (
                    <SelectItem key={type} value={type}>
                      {t(AUTH_LABEL_KEY[type])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isUrlMode ? (
            // "Endereço com token": o endereço inteiro é o segredo (cifrado,
            // nunca volta). O salvo aparece só pela origem.
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="mcp-server-url-secret">
                  {t("mcpServerUrlSecret")} <span className="text-destructive">*</span>
                </Label>
                <McpHelp label={t("mcpServerUrlSecret")} text={t("mcpUrlHelp")} />
              </div>
              <Input
                id="mcp-server-url-secret"
                type="password"
                autoComplete="new-password"
                value={form.secret}
                onChange={e => setField("secret", e.target.value)}
                placeholder={secretKept ? t("mcpSecretKept") : "https://"}
                maxLength={MAX_MCP_SECRET}
                disabled={!canWrite}
              />
              {savedUrlMode && savedServer?.url && (
                <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span className="break-all">{savedServer.url}</span>
                </p>
              )}
              {renderSecretHints()}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="mcp-server-url">
                  {t("mcpServerUrl")} <span className="text-destructive">*</span>
                </Label>
                <McpHelp label={t("mcpServerUrl")} text={t("mcpUrlHelp")} />
              </div>
              <Input
                id="mcp-server-url"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={form.url}
                onChange={e => setField("url", e.target.value)}
                placeholder="https://"
                maxLength={MAX_MCP_URL}
                disabled={!canWrite}
              />
              {urlLooksTokenized(form.url) && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t("mcpUrlTokenHint")}</span>
                </p>
              )}
            </div>
          )}

          {hasTokenField && (
            <div className={form.authType === "header" ? "grid gap-3 sm:grid-cols-2" : ""}>
              {form.authType === "header" && (
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="mcp-server-header">
                    {t("mcpHeaderName")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="mcp-server-header"
                    autoComplete="off"
                    spellCheck={false}
                    value={form.headerName}
                    onChange={e => setField("headerName", e.target.value)}
                    maxLength={MAX_MCP_HEADER_NAME}
                    disabled={!canWrite}
                  />
                </div>
              )}
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="mcp-server-secret">{t("mcpSecret")}</Label>
                <Input
                  id="mcp-server-secret"
                  type="password"
                  autoComplete="new-password"
                  value={form.secret}
                  onChange={e => setField("secret", e.target.value)}
                  placeholder={secretKept ? t("mcpSecretKept") : ""}
                  maxLength={MAX_MCP_SECRET}
                  disabled={!canWrite}
                />
                {renderSecretHints()}
                {canWrite && savedServer?.hasSecret && !form.secret.trim() && (
                  form.secretClear ? (
                    <div className="flex flex-wrap items-center gap-x-2 text-xs">
                      <span className="text-muted-foreground">{t("mcpSecretWillClear")}</span>
                      <button
                        type="button"
                        className="text-primary underline-offset-4 hover:underline"
                        onClick={() => setField("secretClear", false)}
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-destructive underline-offset-4 hover:underline"
                      onClick={() => setField("secretClear", true)}
                    >
                      {t("mcpSecretClear")}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="mcp-server-timeout">{t("mcpTimeout")}</Label>
                <McpHelp label={t("mcpTimeout")} text={t("mcpTimeoutHelp")} />
              </div>
              {/* Texto numérico, não type="number": entrada inválida viraria ""
                  em silêncio */}
              <Input
                id="mcp-server-timeout"
                type="text"
                inputMode="numeric"
                maxLength={2}
                className="sm:max-w-[8rem]"
                value={form.timeout}
                onChange={e => setField("timeout", e.target.value.replace(/\D+/g, "").slice(0, 2))}
                onBlur={() => setField("timeout", String(clampTimeout(form.timeout)))}
                placeholder={String(MCP_TIMEOUT_DEFAULT_SEC)}
                disabled={!canWrite}
              />
            </div>
            <div className="flex h-9 items-center justify-between gap-2 rounded-md border px-3">
              <Label htmlFor="mcp-server-active">{t("mcpActive")}</Label>
              <Switch
                id="mcp-server-active"
                checked={form.isActive}
                onCheckedChange={value => setField("isActive", value)}
                disabled={!canWrite}
              />
            </div>
          </div>

          {canWrite && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onClick={handleTest} disabled={busy} className="gap-1.5">
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                {t("mcpTest")}
              </Button>
              <Button onClick={handleSave} disabled={busy} className="gap-1.5">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("save")}
              </Button>
            </div>
          )}

          {testResult && (
            <div
              className={
                testResult.ok
                  ? "flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-sm text-emerald-700 dark:text-emerald-300"
                  : "flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive"
              }
              role="status"
            >
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <p className="min-w-0 break-words">{testResult.text}</p>
            </div>
          )}
        </div>

        <div className="space-y-3 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium">{t("mcpToolsTitle")}</p>
              <McpHelp label={t("mcpToolsTitle")} text={t("mcpApproveHelp")} />
            </div>
            {canWrite && savedServer && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void runSync(savedServer.id, false)}
                disabled={busy}
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("mcpSync")}
              </Button>
            )}
          </div>

          {!savedServer ? (
            <p className="text-sm text-muted-foreground">{t("mcpToolsSaveFirst")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {statusBadge(savedServer)}
                {lastCheck && <span className="text-xs text-muted-foreground">{lastCheck}</span>}
              </div>
              {statusCode && (
                <p className="break-words text-xs text-destructive">{codeText(statusCode)}</p>
              )}
              {syncing && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("mcpSyncing")}
                </p>
              )}
              {pausedCount > 0 && pausedWarning(pausedCount)}

              {tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("mcpToolsEmpty")}</p>
              ) : (
                <div className="space-y-2">
                  {tools.map((tool, index) => renderToolRow(savedServer, tool, index))}
                </div>
              )}

              {canWrite && tools.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    onClick={() => void submitApprovals(savedServer.id, approvalChanges)}
                    disabled={busy || approvalChanges.length === 0}
                    className="gap-1.5"
                  >
                    {approving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("mcpSaveApprovals")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {propagationNote}
      </div>
    );
  };

  const detailTitle =
    detail === "new" ? t("mcpAddServer") : savedServer?.name || t("mcpServersTitle");

  const deleteAgentNames = (deleteTarget?.agents || [])
    .map(agent => agent?.name)
    .filter((name): name is string => !!name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1.5 border-b px-4 py-4 pr-12 text-left sm:px-6 sm:pr-12">
          {detail !== null && (
            <button
              type="button"
              onClick={backToList}
              className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("mcpServersTitle")}
            </button>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <DialogTitle className="flex min-w-0 items-center gap-2">
              <Server className="h-5 w-5 shrink-0" />
              <span className="min-w-0 break-words">
                {detail === null ? t("mcpServersTitle") : detailTitle}
              </span>
            </DialogTitle>
            {detail === null && (
              <McpHelp label={t("mcpServersTitle")} text={t("mcpServersHelp")} />
            )}
          </div>
          {detail === null && (
            <DialogDescription>{t("mcpServersDescription")}</DialogDescription>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {detail === null ? renderList() : renderDetail()}
        </div>

        <DialogFooter className="flex-row flex-wrap items-center justify-end gap-2 border-t px-4 py-3 sm:space-x-0 sm:px-6">
          {detail === null ? (
            canWrite &&
            listState === "ready" && (
              <Button
                onClick={() => openDetail(null)}
                disabled={atLimit || busy}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                {t("mcpAddServer")}
              </Button>
            )
          ) : (
            canWrite &&
            savedServer && (
              <Button
                variant="ghost"
                onClick={() => setDeleteTarget(savedServer)}
                disabled={busy}
                className="mr-auto gap-1.5 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                {t("delete")}
              </Button>
            )
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("close")}
          </Button>
        </DialogFooter>

        {/* D18 — excluir nunca é bloqueado: a confirmação lista os agentes que
            perdem as ferramentas deste servidor */}
        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={value => {
            if (!value && !deleting) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("mcpDeleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription className="break-words">
                {deleteTarget
                  ? deleteAgentNames.length > 0
                    ? t("mcpDeleteConfirm", {
                        name: deleteTarget.name,
                        agents: formatNames(deleteAgentNames, DELETE_AGENT_NAMES_SHOWN),
                      })
                    : t("mcpDeleteConfirmNoAgents", { name: deleteTarget.name })
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={e => {
                  // Fica aberto até o servidor responder
                  e.preventDefault();
                  void handleDelete();
                }}
                disabled={deleting}
                className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

export default McpServersDialog;
