"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, RefreshCw, Zap, Loader2, GitBranch, ArrowUp, ArrowDown, Images, FileText, Video, History, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { isValidHttpUrl, formatDateTime } from "@/lib/utils";
import {
  isOrderDetailsTemplate,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  type OrderDetailsValue,
} from "@/lib/order-details";
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import { useAuthStore } from "@/stores/auth-store";
import { PageHeader } from "@/components/layout/page-header";
import { GalleryPickerWithUploadDialog } from "@/components/gallery/gallery-picker-with-upload-dialog";
import type { GalleryItem } from "@/services/gallery";
import {
  fetchPipelines,
  fetchStages,
  fetchPipelineActions,
  createPipelineAction,
  updatePipelineAction,
  deletePipelineAction,
  togglePipelineAction,
  createPipelineActionsSequential,
  fetchPipelineActionLogs,
} from "@/services/funnel";
import { fetchWhatsapps } from "@/services/whatsapp";
import { fetchTags } from "@/services/tags";
import { fetchAllUsers } from "@/services/users";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { TextareaWithVars, InputWithVars } from "@/components/shared/variable-picker";

const NONE = "__none__";

interface Pipeline { id: number; name: string; }
interface Stage    { id: number; name: string; pipelineId: number; }
interface WabaConn { id: number; name: string; tokenAPI: string; type?: string; }
interface WabaTemplate {
  name: string;
  language: string;
  status: string;
  components?: any[];
  parameter_format?: string;
}

interface PipelineAction {
  id: number;
  name: string;
  description?: string;
  pipelineId?: number;
  stageId?: number;
  actionType: string;
  actionContent?: string;
  daysToTrigger?: number;
  tagId?: number;
  walletId?: number;
  whatsappId?: number;
  targetStageId?: number;
  targetStatus?: string;
  templateComponents?: any[];
  active: boolean;
  pipeline?: { name: string };
  stage?: { name: string };
}

interface PipelineActionLog {
  id: number;
  createdAt: string;
  status: string;
  errorMessage?: string | null;
  opportunity?: {
    name?: string;
    contact?: { name?: string; number?: string; email?: string };
  } | null;
  pipelineAction?: { name?: string } | null;
}

interface FlowSubAction {
  id: string;
  actionType: string;
  name: string;
  actionContent?: string;
  whatsappId?: number | null;
  targetStageId?: number | null;
  targetStatus?: string | null;
  tagId?: number | null;
  walletId?: number | null;
  daysToTrigger: number;
  relativeDay?: number;
  templateComponents?: any[];
}

interface FlowForm {
  name: string;
  description: string;
  pipelineId: string;
  stageId: string;
  actions: FlowSubAction[];
}

interface MessageConfig { name: string; message: string; whatsappId: string; daysToTrigger: number; }
interface MediaConfig { name: string; mediaUrl: string; mediaCaption: string; mediaType: string; mediaPtt: boolean; whatsappId: string; daysToTrigger: number; }
interface StageChangeConfig { name: string; targetStageId: string; daysToTrigger: number; }
interface StatusChangeConfig { name: string; targetStatus: string; daysToTrigger: number; }
interface TagConfig { name: string; tagId: string; daysToTrigger: number; }
interface WalletConfig { name: string; walletId: string; daysToTrigger: number; }
interface TemplateFlowConfig {
  name: string;
  whatsappId: string;
  templateKey: string;
  varFields: { label: string; value: string }[];
  daysToTrigger: number;
  // Ficha de cobranca (template ORDER_DETAILS). So e gravada quando o template
  // selecionado e de cobranca — template comum ignora este campo.
  orderDetails: OrderDetailsValue;
}

const blankFlowForm = (): FlowForm => ({ name: "", description: "", pipelineId: NONE, stageId: NONE, actions: [] });
const blankMsgCfg = (): MessageConfig => ({ name: "", message: "", whatsappId: NONE, daysToTrigger: 0 });
const blankMediaCfg = (): MediaConfig => ({ name: "", mediaUrl: "", mediaCaption: "", mediaType: "", mediaPtt: true, whatsappId: NONE, daysToTrigger: 0 });
const blankStageCfg = (): StageChangeConfig => ({ name: "", targetStageId: NONE, daysToTrigger: 0 });
const blankStatusCfg = (): StatusChangeConfig => ({ name: "", targetStatus: NONE, daysToTrigger: 0 });
const blankTagCfg = (): TagConfig => ({ name: "", tagId: NONE, daysToTrigger: 0 });
const blankWalletCfg = (): WalletConfig => ({ name: "", walletId: NONE, daysToTrigger: 0 });
const blankTplFlowCfg = (): TemplateFlowConfig => ({ name: "", whatsappId: NONE, templateKey: NONE, varFields: [], daysToTrigger: 0, orderDetails: emptyOrderDetails() });

const ACTION_TYPE_VALUES = ["message", "media", "template", "stage_change", "status_change", "add_tag", "add_wallet", "flow"] as const;
const STATUS_OPTION_VALUES = ["open", "win", "lose"] as const;

interface FormState {
  name: string;
  description: string;
  pipelineId: string;
  stageId: string;
  actionType: string;
  actionContent: string;
  daysToTrigger: number;
  tagId: string;
  walletId: string;
  whatsappId: string;
  targetStageId: string;
  targetStatus: string;
  mediaUrl: string;
  mediaCaption: string;
  mediaType: string;
  mediaPtt: boolean;
  active: boolean;
}

const blankForm = (): FormState => ({
  name: "", description: "",
  pipelineId: NONE, stageId: NONE,
  actionType: "message", actionContent: "",
  daysToTrigger: 0,
  tagId: NONE, walletId: NONE, whatsappId: NONE,
  targetStageId: NONE, targetStatus: NONE,
  mediaUrl: "", mediaCaption: "", mediaType: "", mediaPtt: true,
  active: true,
});

// ─── Template variable helpers (mirrors legacy logic) ───────────────────────────
function getTemplateVariableLabels(t: WabaTemplate): string[] {
  const labels: string[] = [];
  if (!t?.components) return labels;
  const header = t.components.find(c => c.type === "HEADER");
  if (header && ["IMAGE","VIDEO","DOCUMENT"].includes(header.format)) {
    labels.push("URL Header");
  }
  const body = t.components.find(c => c.type === "BODY");
  if (body) {
    // Detecta NAMED pelo parameter_format OU pelo example OU pelos placeholders
    // não-numéricos (Meta nem sempre devolve parameter_format no list).
    const isNamed =
      (t.parameter_format === "NAMED" && body.example?.body_text_named_params) ||
      (body.example?.body_text_named_params?.length || 0) > 0 ||
      (!!body.text && /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/.test(body.text));
    if (isNamed) {
      body.example.body_text_named_params.forEach((p: any) => labels.push(p.param_name || ""));
    } else {
      const matches: string[] = body.text?.match(/{{\d+}}/g) || [];
      matches.forEach((_, i) => labels.push(`Variável ${i + 1}`));
    }
  }
  const buttons = t.components.find(c => c.type === "BUTTONS");
  if (buttons?.buttons?.length) {
    // Só botões que exigem valor no envio geram campo (paridade com o atendimento):
    // COPY_CODE (cupom) e URL com sufixo dinâmico {{1}} (exceto OTP, resolvido no backend).
    // Reply/QUICK_REPLY e PHONE_NUMBER são estáticos — não pedem preenchimento.
    buttons.buttons.forEach((b: any, idx: number) => {
      const btnUrl: string | undefined = b?.url;
      const needsInput =
        b?.type === "COPY_CODE" ||
        (b?.type === "URL" && !!btnUrl && /\{\{1\}\}/.test(btnUrl) && !/otp_type=|\/otp\//i.test(btnUrl));
      if (needsInput) labels.push(`Botão ${idx + 1}`);
    });
  }
  return labels;
}

function buildTemplateComponents(t: WabaTemplate, fields: { label: string; value: string }[]): any[] {
  if (!t?.components) return [];
  const components: any[] = [];
  let vi = 0;
  const header = t.components.find(c => c.type === "HEADER");
  if (header && ["IMAGE","VIDEO","DOCUMENT"].includes(header.format)) {
    const val = (fields[vi++]?.value || "").trim() || " ";
    components.push({ type: "HEADER", format: header.format, value: val });
  } else if (header?.format === "TEXT" && header.text) {
    // Só para a bolha do disparo: sem `value`/`variables` o sender não emite
    // parâmetro de header (exige um dos dois), então a Meta recebe o mesmo de antes.
    components.push({ type: "HEADER", format: "TEXT", text: header.text });
  }
  const body = t.components.find(c => c.type === "BODY");
  if (body) {
    // Detecta NAMED pelo parameter_format OU pelo example OU pelos placeholders
    // não-numéricos (Meta nem sempre devolve parameter_format no list).
    const isNamed =
      (t.parameter_format === "NAMED" && body.example?.body_text_named_params) ||
      (body.example?.body_text_named_params?.length || 0) > 0 ||
      (!!body.text && /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/.test(body.text));
    const bodyCount = isNamed
      ? (body.example?.body_text_named_params?.length || 0)
      : (body.text?.match(/{{\d+}}/g) || []).length;
    if (bodyCount > 0) {
      const bodyVars = Array.from({ length: bodyCount }, () => (fields[vi++]?.value || "").trim() || " ");
      if (isNamed) {
        components.push({
          type: "BODY",
          // Texto do template junto dos valores: os senders ignoram `text` (leem só
          // `parameters`/`variables`), mas é dele que a bolha do disparo monta o corpo
          // real — sem ele o atendente veria o NOME do template na conversa.
          text: body.text,
          parameters: body.example.body_text_named_params.map((p: any, i: number) => ({
            type: "text", text: bodyVars[i] || " ", name: p.param_name,
          })),
        });
      } else {
        components.push({ type: "BODY", text: body.text, variables: bodyVars });
      }
    } else if (body.text) {
      // Template sem variáveis: só a bolha usa este componente (o sender pula BODY
      // sem `parameters`/`variables`).
      components.push({ type: "BODY", text: body.text });
    }
  }
  const footer = t.components.find(c => c.type === "FOOTER");
  // Idem: tipo que os senders não conhecem e ignoram no loop.
  if (footer?.text) components.push({ type: "FOOTER", text: footer.text });
  const buttons = t.components.find(c => c.type === "BUTTONS");
  if (buttons?.buttons?.length) {
    const btns: any[] = [];
    // Mesma regra do getTemplateVariableLabels/atendimento: só COPY_CODE (cupom) e
    // URL dinâmica {{1}} não-OTP consomem campo. A ordem de consumo de `fields`
    // acompanha a ordem em que os labels foram gerados.
    buttons.buttons.forEach((button: any, idx: number) => {
      const btnUrl: string | undefined = button?.url;
      if (button?.type === "COPY_CODE") {
        const val = (fields[vi++]?.value || "").trim() || " ";
        btns.push({
          type: "button",
          sub_type: "copy_code",
          index: String(idx),
          parameters: [{ type: "coupon_code", coupon_code: val }],
        });
      } else if (button?.type === "URL" && btnUrl && /\{\{1\}\}/.test(btnUrl) && !/otp_type=|\/otp\//i.test(btnUrl)) {
        const val = (fields[vi++]?.value || "").trim() || " ";
        btns.push({
          type: "button",
          sub_type: "url",
          index: String(idx),
          parameters: [{ type: "text", text: val }],
        });
      }
    });
    if (btns.length) components.push({ type: "BUTTONS", buttons: btns });
  }
  return components;
}

/**
 * Reidrata o formulario de cobranca a partir do que foi gravado no actionContent.
 * O que fica salvo e o payload de envio (buildOrderDetailsPayload), com os ajustes
 * em `{ value }` e sem o total (que e derivado) — daqui volta o shape do formulario.
 */
function orderDetailsFromSaved(saved: any): OrderDetailsValue {
  const base = emptyOrderDetails();
  if (!saved || typeof saved !== "object") return base;
  const items = Array.isArray(saved.items) && saved.items.length > 0
    ? saved.items.map((i: any) => ({
        name: String(i?.name ?? ""),
        quantity: Number(i?.quantity) || 1,
        amount: Number(i?.amount) || 0,
      }))
    : base.items;
  return {
    goodsType: saved.goodsType === "physical-goods" ? "physical-goods" : "digital-goods",
    items,
    tax: Number(saved.tax?.value) || undefined,
    shipping: Number(saved.shipping?.value) || undefined,
    discount: Number(saved.discount?.value) || undefined,
    expirationTimestamp: saved.expirationTimestamp,
    expirationDescription: saved.expirationDescription,
    payment: { ...base.payment, ...(saved.payment ?? {}) },
  };
}

function getValuesFromComponents(t: WabaTemplate | null, components: any[]): string[] {
  if (!t || !components?.length) return [];
  const values: string[] = [];
  const header = components.find(c => c.type === "HEADER");
  if (header?.value) values.push(header.value);
  const body = components.find(c => c.type === "BODY");
  if (body?.variables) body.variables.forEach((v: any) => values.push(typeof v === "string" ? v : (v?.text || "")));
  else if (body?.parameters) body.parameters.forEach((p: any) => values.push(p?.text || ""));
  const btns = components.find(c => c.type === "BUTTONS");
  if (btns?.buttons) btns.buttons.forEach((b: any) => {
    // url → parameters[0].text ; copy_code → parameters[0].coupon_code (repopula edição)
    const p = b.parameters?.[0];
    if (p) values.push(p.text || p.coupon_code || "");
  });
  return values;
}
// ─────────────────────────────────────────────────────────────────────────────

export default function FunilAcaoPage() {
  // Gate isolado num wrapper: sair com `return` no meio dos hooks do conteúdo
  // quebrava o React ("Rendered fewer hooks than expected") quando a permissão
  // caía com a página montada — o teto do tenant chega após o 1º render.
  const allowed = usePageAccess("funil", { alsoAccept: ["kanban"] });
  if (!allowed) return <AccessDenied />;
  return <FunilAcaoPageContent />;
}

function FunilAcaoPageContent() {
  const t = useTranslations("funilAcaoPage");
  const tErrors = useTranslations("errors");
  const tOrder = useTranslations("orderDetails");
  const { user } = useAuthStore();

  const ACTION_TYPES = [
    { value: "message",       label: t("actionTypeMessage") },
    { value: "media",         label: t("actionTypeMedia") },
    { value: "template",      label: t("actionTypeTemplate") },
    { value: "stage_change",  label: t("actionTypeStageChange") },
    { value: "status_change", label: t("actionTypeStatusChange") },
    { value: "add_tag",       label: t("actionTypeAddTag") },
    { value: "add_wallet",    label: t("actionTypeAddWallet") },
    { value: "flow",          label: t("actionTypeFlow") },
  ];

  const STATUS_OPTIONS = [
    { value: "open", label: t("statusOpen") },
    { value: "win",  label: t("statusWin") },
    { value: "lose", label: t("statusLose") },
  ];

  const [loading, setLoading]     = useState(true);
  const [actions, setActions]     = useState<PipelineAction[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [allStages, setAllStages] = useState<Stage[]>([]);
  const [wabaConns, setWabaConns] = useState<WabaConn[]>([]);
  const [whatsapps, setWhatsapps] = useState<{ id: number; name: string }[]>([]);
  const [tags, setTags]           = useState<{ id: number; name: string }[]>([]);
  const [users, setUsers]         = useState<{ id: number; name: string }[]>([]);
  // Ids de TODOS os canais existentes (qualquer tipo, conectado ou não) — usado
  // só para detectar referência excluída. Os selects continuam usando whatsapps
  // (canais de mensagem) e wabaConns (canais de template): canal WABA/BSP nunca
  // entra em whatsapps, e canal desconectado continua existindo — nenhum dos
  // dois pode ser lido como "excluído".
  const [existingChannelIds, setExistingChannelIds] = useState<number[]>([]);

  // Filters
  const [fSearch,   setFSearch]   = useState("");
  const [fPipeline, setFPipeline] = useState(NONE);
  const [fStage,    setFStage]    = useState(NONE);
  const [fType,     setFType]     = useState(NONE);
  const [fActive,   setFActive]   = useState(true);

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing,    setEditing]    = useState<PipelineAction | null>(null);
  const [deleting,   setDeleting]   = useState<PipelineAction | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const f = useCallback((patch: Partial<FormState>) => setForm(p => ({ ...p, ...patch })), []);

  // Flow state
  const [flowOpen,           setFlowOpen]           = useState(false);
  const [actionSelOpen,      setActionSelOpen]      = useState(false);
  const [msgCfgOpen,         setMsgCfgOpen]         = useState(false);
  const [mediaCfgOpen,       setMediaCfgOpen]       = useState(false);
  const [stageCfgOpen,       setStageCfgOpen]       = useState(false);
  const [statusCfgOpen,      setStatusCfgOpen]      = useState(false);
  const [tagCfgOpen,         setTagCfgOpen]         = useState(false);
  const [walletCfgOpen,      setWalletCfgOpen]      = useState(false);
  const [tplFlowOpen,        setTplFlowOpen]        = useState(false);
  const [flowForm,           setFlowForm]           = useState<FlowForm>(blankFlowForm());
  const [editingFlowAction,  setEditingFlowAction]  = useState<PipelineAction | null>(null);
  const [editingSubIdx,      setEditingSubIdx]      = useState<number | null>(null);
  const [msgCfg,             setMsgCfg]             = useState<MessageConfig>(blankMsgCfg());
  const [mediaCfg,           setMediaCfg]           = useState<MediaConfig>(blankMediaCfg());
  const [stageCfg,           setStageCfg]           = useState<StageChangeConfig>(blankStageCfg());
  const [statusCfg,          setStatusCfg]          = useState<StatusChangeConfig>(blankStatusCfg());
  const [tagCfg,             setTagCfg]             = useState<TagConfig>(blankTagCfg());
  const [walletCfg,          setWalletCfg]          = useState<WalletConfig>(blankWalletCfg());
  const [tplFlowCfg,         setTplFlowCfg]         = useState<TemplateFlowConfig>(blankTplFlowCfg());
  const [flowTemplates,      setFlowTemplates]      = useState<WabaTemplate[]>([]);
  const [loadingFlowTpls,    setLoadingFlowTpls]    = useState(false);
  const ff = useCallback((patch: Partial<FlowForm>) => setFlowForm(p => ({ ...p, ...patch })), []);

  // Media picker (galeria + upload) — alvo decide se preenche o form simples ou o mediaCfg do fluxo
  const [mediaPickerOpen,  setMediaPickerOpen]  = useState(false);
  const mediaPickTargetRef = useRef<"form" | "flow">("form");

  // Logs de ações (histórico de disparos)
  const [logsOpen,        setLogsOpen]        = useState(false);
  const [logs,            setLogs]            = useState<PipelineActionLog[]>([]);
  const [logsLoading,     setLogsLoading]     = useState(false);
  const [logsPage,        setLogsPage]        = useState(1);
  const [logsTotalPages,  setLogsTotalPages]  = useState(1);
  const [logsTotal,       setLogsTotal]       = useState(0);

  // Template WABA state
  const [templates,        setTemplates]        = useState<WabaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WabaTemplate | null>(null);
  const [templateKey,      setTemplateKey]      = useState(NONE); // "name|language"
  const [varFields,        setVarFields]        = useState<{ label: string; value: string }[]>([]);
  // Ficha de cobranca da acao simples (paralela a varFields: o botao de cobranca
  // nao gera variavel de template).
  const [orderDetailsValue, setOrderDetailsValue] = useState<OrderDetailsValue>(() => emptyOrderDetails());

  // Derived
  const formStages   = allStages.filter(s => form.pipelineId === NONE || s.pipelineId === Number(form.pipelineId));
  const filterStages = allStages.filter(s => fPipeline === NONE || s.pipelineId === Number(fPipeline));

  // Template de cobranca (ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md F6.
  // Esta tela AGENDA a cobranca: a ficha vai gravada em `orderDetails` dentro do
  // actionContent e o ExecutePipelineActionsJob monta, valida e injeta o componente
  // no BUTTONS no momento do disparo — com uma referencia por oportunidade. Template
  // comum nao passa por nada disto (D0).
  const isOrderDetailsSelected = React.useMemo(
    () => isOrderDetailsTemplate(selectedTemplate),
    [selectedTemplate]
  );
  const isOrderDetailsFlowSelected = React.useMemo(() => {
    if (tplFlowCfg.templateKey === NONE) return false;
    const [n, l] = tplFlowCfg.templateKey.split("|");
    return isOrderDetailsTemplate(flowTemplates.find(x => x.name === n && x.language === l) ?? null);
  }, [tplFlowCfg.templateKey, flowTemplates]);

  const loadActions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { active: fActive };
      if (fSearch)            params.searchTerm = fSearch;
      if (fPipeline !== NONE) params.pipelineId = Number(fPipeline);
      if (fStage !== NONE)    params.stageId    = Number(fStage);
      if (fType !== NONE)     params.actionType = fType;
      const { data } = await fetchPipelineActions(params);
      setActions(data);
    } catch { toast.error(t("errorLoadActions")); }
    finally { setLoading(false); }
  }, [fSearch, fPipeline, fStage, fType, fActive]);

  const loadOptions = useCallback(async () => {
    try {
      const [pRes, sRes, wRes, tRes, uRes] = await Promise.all([
        fetchPipelines(), fetchStages(), fetchWhatsapps(), fetchTags(), fetchAllUsers(),
      ]);
      const pRaw = pRes.data?.data ?? (Array.isArray(pRes.data) ? pRes.data : []);
      setPipelines(Array.isArray(pRaw) ? pRaw : []);

      const sRaw = sRes.data?.data ?? (Array.isArray(sRes.data) ? sRes.data : []);
      setAllStages(Array.isArray(sRaw) ? sRaw : []);

      const wData: any[] = Array.isArray((wRes as any)?.data) ? (wRes as any).data : ((wRes as any)?.data?.data ?? []);
      const connected = wData.filter((w: any) => w.status === "CONNECTED" && !w.isDeleted);

      setExistingChannelIds(wData.filter((w: any) => !w.isDeleted).map((w: any) => Number(w.id)));

      setWhatsapps(connected
        .filter((w: any) => ["baileys","zapo","whatsapp","evo","evogo","meow","zapi","uazapi"].includes((w.type||"").toLowerCase()))
        .map((w: any) => ({ id: w.id, name: w.name ?? String(w.id) }))
      );
      // Templates suportados: WABA + BSPs (gupshup, dialog360).
      const TEMPLATE_CAPABLE_TYPES = ["waba", "gupshup", "dialog360"];
      setWabaConns(connected
        .filter((w: any) => TEMPLATE_CAPABLE_TYPES.includes((w.type||"").toLowerCase()))
        .map((w: any) => ({ id: w.id, name: w.name ?? String(w.id), tokenAPI: w.tokenAPI || "", type: (w.type||"").toLowerCase() }))
      );

      const tData = tRes.data ?? [];
      setTags((Array.isArray(tData) ? tData : []).map((t: any) => ({
        id: t.id, name: t.name ?? t.tag ?? String(t.id),
      })));

      const uData = uRes.data?.users ?? uRes.data ?? [];
      setUsers((Array.isArray(uData) ? uData : [])
        .filter((u: any) => u.profile !== "superadmin")
        .map((u: any) => ({ id: u.id, name: u.name }))
      );
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);
  useEffect(() => { loadActions(); }, [loadActions]);

  // ── Template handlers ──────────────────────────────────────────────────────
  const onWabaChange = async (wabaId: string) => {
    f({ whatsappId: wabaId });
    setTemplates([]); setSelectedTemplate(null); setTemplateKey(NONE); setVarFields([]);
    if (wabaId === NONE) return;
    const conn = wabaConns.find(c => String(c.id) === wabaId);
    if (!conn) return;
    setLoadingTemplates(true);
    try {
      const { getTemplatesForChannel } = await import("@/services/channel-templates");
      // Cast — services retornam shapes equivalentes mas tipos diferentes.
      const list = (await getTemplatesForChannel({ id: conn.id, type: conn.type, tokenAPI: conn.tokenAPI })) as any;
      setTemplates([...list].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
    } catch { toast.error(t("errorFetchTemplates")); }
    finally { setLoadingTemplates(false); }
  };

  const onTemplateSelect = (key: string) => {
    setTemplateKey(key);
    // Zera a ficha ao trocar de template: cobranca de um template nao vale para outro.
    setOrderDetailsValue(emptyOrderDetails());
    if (key === NONE) { setSelectedTemplate(null); setVarFields([]); return; }
    const [name, language] = key.split("|");
    const t = templates.find(x => x.name === name && x.language === language) ?? null;
    setSelectedTemplate(t);
    if (t) {
      const labels = getTemplateVariableLabels(t);
      setVarFields(labels.map(label => ({ label, value: "" })));
    } else {
      setVarFields([]);
    }
  };

  const updateVarField = (idx: number, value: string) => {
    setVarFields(prev => prev.map((f, i) => i === idx ? { ...f, value } : f));
  };
  // ──────────────────────────────────────────────────────────────────────────

  const resetTemplateState = () => {
    setTemplates([]); setSelectedTemplate(null); setTemplateKey(NONE); setVarFields([]);
    setOrderDetailsValue(emptyOrderDetails());
    setLoadingTemplates(false);
  };

  const openCreate = () => {
    setEditing(null); setForm(blankForm()); resetTemplateState(); setDialogOpen(true);
  };

  const openEdit = async (a: PipelineAction) => {
    if (a.actionType === "flow") { openEditFlow(a); return; }
    setEditing(a);
    // Acao de midia guarda { mediaUrl, caption, mediaType, ptt } como JSON em actionContent.
    let mUrl = "", mCaption = "", mType = "";
    let mPtt = true;
    if (a.actionType === "media" && a.actionContent) {
      try { const p = JSON.parse(a.actionContent); mUrl = p.mediaUrl ?? ""; mCaption = p.caption ?? ""; mType = p.mediaType ?? ""; mPtt = p.ptt !== false; } catch { /* ignore */ }
    }
    setForm({
      name: a.name ?? "", description: a.description ?? "",
      pipelineId:    a.pipelineId    != null ? String(a.pipelineId)    : NONE,
      stageId:       a.stageId       != null ? String(a.stageId)       : NONE,
      actionType:    a.actionType ?? "message",
      actionContent: a.actionContent ?? "",
      daysToTrigger: a.daysToTrigger ?? 0,
      tagId:         a.tagId         != null ? String(a.tagId)         : NONE,
      walletId:      a.walletId      != null ? String(a.walletId)      : NONE,
      whatsappId:    a.whatsappId    != null ? String(a.whatsappId)    : NONE,
      targetStageId: a.targetStageId != null ? String(a.targetStageId) : NONE,
      targetStatus:  a.targetStatus  ?? NONE,
      mediaUrl:      mUrl,
      mediaCaption:  mCaption,
      mediaType:     mType,
      mediaPtt:      mPtt,
      active:        a.active ?? true,
    });
    resetTemplateState();

    // If editing a template action, reload the templates for that WABA
    if (a.actionType === "template" && a.whatsappId) {
      const conn = wabaConns.find(c => c.id === a.whatsappId);
      if (conn) {
        setLoadingTemplates(true);
        try {
          const { getTemplatesForChannel } = await import("@/services/channel-templates");
      // Cast — services retornam shapes equivalentes mas tipos diferentes.
      const list = (await getTemplatesForChannel({ id: conn.id, type: conn.type, tokenAPI: conn.tokenAPI })) as any;
          setTemplates([...list].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
          // Restaura o template do actionContent: JSON { templateName, templateLanguage,
          // templateComponents } (formato atual) ou legado "name|language" (acoes antigas —
          // essas nunca tiveram componentes persistidos, entao os campos voltam vazios).
          if (a.actionContent) {
            let name = "", language = "";
            let savedComponents: any[] = [];
            let savedOrder: any = null;
            try {
              const parsed = JSON.parse(a.actionContent);
              name = parsed?.templateName ?? "";
              language = parsed?.templateLanguage ?? "";
              savedComponents = Array.isArray(parsed?.templateComponents) ? parsed.templateComponents : [];
              savedOrder = parsed?.orderDetails ?? null;
            } catch {
              const legacy = a.actionContent.split("|");
              name = legacy[0] ?? "";
              language = legacy[1] ?? "";
            }
            const t = list.find((x: any) => x.name === name && x.language === language) ?? null;
            if (t) {
              const key = `${t.name}|${t.language}`;
              setTemplateKey(key);
              setSelectedTemplate(t);
              const labels = getTemplateVariableLabels(t);
              const existingVals = getValuesFromComponents(t, savedComponents);
              setVarFields(labels.map((label, i) => ({ label, value: existingVals[i] ?? "" })));
              // Cobranca gravada volta para o formulario; acao sem cobranca fica com a ficha vazia.
              if (savedOrder) setOrderDetailsValue(orderDetailsFromSaved(savedOrder));
            }
          }
        } catch { /* silencioso */ }
        finally { setLoadingTemplates(false); }
      }
    }

    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim())           { toast.error(t("validationNameRequired"));     return; }
    if (form.pipelineId === NONE)    { toast.error(t("validationPipelineRequired")); return; }
    if (form.stageId === NONE)       { toast.error(t("validationStageRequired"));    return; }
    if (!form.actionType)            { toast.error(t("validationActionTypeRequired")); return; }

    if (form.actionType === "message" && (!form.actionContent.trim() || form.whatsappId === NONE)) {
      toast.error(t("validationMessageAndWhatsapp")); return;
    }
    if (form.actionType === "media" && (!form.mediaUrl.trim() || form.whatsappId === NONE)) {
      toast.error(t("validationMediaAndWhatsapp")); return;
    }
    if (form.actionType === "template") {
      if (form.whatsappId === NONE)  { toast.error(t("validationSelectWaba")); return; }
      if (templateKey === NONE)      { toast.error(t("validationSelectTemplate")); return; }
      // Header de mídia: o 1º campo é a URL — texto comum vira image.link e a Meta
      // rejeita (#100) no disparo. Placeholder {{...}} é aceito (pupa em runtime).
      const tplHeader = selectedTemplate?.components?.find((c) => c.type === "HEADER");
      if (tplHeader && ["IMAGE", "VIDEO", "DOCUMENT"].includes(tplHeader.format)) {
        const urlVal = (varFields[0]?.value || "").trim();
        if (!isValidHttpUrl(urlVal) && !/\{\{.+\}\}/.test(urlVal)) {
          toast.error(tErrors("invalidMediaHeaderUrl"));
          return;
        }
      }
      // Cobranca invalida barrada aqui: o disparo e assincrono e um erro no job so
      // apareceria depois, no log da acao.
      if (isOrderDetailsSelected) {
        const orderError = validateOrderDetails(orderDetailsValue);
        if (orderError) { toast.warning(tOrder(orderError)); return; }
      }
    }
    if (form.actionType === "add_tag"      && form.tagId         === NONE) { toast.error(t("validationTagRequired"));          return; }
    if (form.actionType === "add_wallet"   && form.walletId      === NONE) { toast.error(t("validationWalletRequired"));     return; }
    if (form.actionType === "stage_change" && form.targetStageId === NONE) { toast.error(t("validationTargetStageRequired"));return; }
    if (form.actionType === "status_change"&& form.targetStatus  === NONE) { toast.error(t("validationTargetStatusRequired"));return; }

    const payload: Record<string, unknown> = {
      name: form.name.trim(), description: form.description?.trim() ?? "",
      pipelineId: Number(form.pipelineId), stageId: Number(form.stageId),
      actionType: form.actionType, daysToTrigger: Number(form.daysToTrigger) || 0,
      active: form.active,
    };

    switch (form.actionType) {
      case "message":
        payload.actionContent = form.actionContent.trim();
        payload.whatsappId    = Number(form.whatsappId);
        break;
      case "media":
        payload.whatsappId    = Number(form.whatsappId);
        payload.actionContent = JSON.stringify({ mediaUrl: form.mediaUrl.trim(), caption: form.mediaCaption.trim(), mediaType: form.mediaType, ptt: form.mediaPtt });
        break;
      case "template": {
        payload.whatsappId    = Number(form.whatsappId);
        // actionContent em JSON { templateName, templateLanguage, templateComponents } —
        // mesmo shape das sub-acoes de fluxo, que e o que ExecutePipelineActionsJob
        // espera (JSON.parse). O formato antigo "name|language" quebrava o disparo, e
        // templateComponents como campo solto era descartado (sem coluna no model).
        const [tplName, tplLanguage] = templateKey.split("|");
        payload.actionContent = JSON.stringify({
          templateName: tplName,
          templateLanguage: tplLanguage,
          // Sem o gate de "tem variável": o array também carrega o texto do template,
          // que é o que a bolha do disparo desenha na conversa.
          templateComponents: selectedTemplate
            ? buildTemplateComponents(selectedTemplate, varFields)
            : [],
          // Cobranca: campo extra so em template ORDER_DETAILS. O job monta e valida
          // no disparo; sem ele o actionContent fica identico ao de sempre.
          ...(isOrderDetailsSelected ? { orderDetails: buildOrderDetailsPayload(orderDetailsValue) } : {}),
        });
        break;
      }
      case "add_tag":      payload.tagId         = Number(form.tagId);         break;
      case "add_wallet":   payload.walletId      = Number(form.walletId);      break;
      case "stage_change": payload.targetStageId = Number(form.targetStageId); break;
      case "status_change":payload.targetStatus  = form.targetStatus;          break;
    }

    try {
      if (editing) {
        await updatePipelineAction(editing.id, payload);
        toast.success(t("actionUpdated"));
      } else {
        await createPipelineAction(payload);
        toast.success(t("actionCreated"));
      }
      setDialogOpen(false);
      loadActions();
    } catch { toast.error(editing ? t("errorUpdate") : t("errorCreate")); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deletePipelineAction(deleting.id);
      toast.success(t("actionDeleted"));
      setDeleteOpen(false); setDeleting(null); loadActions();
    } catch { toast.error(t("errorDelete")); }
  };

  const handleToggle = async (a: PipelineAction) => {
    try {
      await togglePipelineAction(a.id);
      toast.success(a.active ? t("actionDeactivated") : t("actionActivated"));
      loadActions();
    } catch { toast.error(t("errorToggle")); }
  };

  // ── Flow helpers ─────────────────────────────────────────────────────────────
  const updateRelativeDays = (actions: FlowSubAction[]) => {
    let acc = 0;
    return actions.map(a => { const r = { ...a, relativeDay: acc }; acc += a.daysToTrigger || 0; return r; });
  };

  const openCreateFlow = () => {
    setEditingFlowAction(null);
    setFlowForm(blankFlowForm());
    setFlowOpen(true);
  };

  const openEditFlow = (a: PipelineAction) => {
    setEditingFlowAction(a);
    const base: FlowForm = {
      name: a.name ?? "",
      description: a.description ?? "",
      pipelineId: a.pipelineId != null ? String(a.pipelineId) : NONE,
      stageId:    a.stageId    != null ? String(a.stageId)    : NONE,
      actions: [],
    };
    if (a.actionContent) {
      try {
        const parsed = JSON.parse(a.actionContent);
        const rawActions: FlowSubAction[] = (parsed.actions || []).map((act: any) => ({
          id:            act.id ?? `sub_${Date.now()}_${Math.random()}`,
          actionType:    act.actionType || act.type || "message",
          name:          act.name ?? "",
          actionContent: act.actionContent ?? act.message ?? "",
          whatsappId:    act.whatsappId ?? null,
          targetStageId: act.targetStageId ?? null,
          targetStatus:  act.targetStatus ?? null,
          tagId:         act.tagId ?? null,
          walletId:      act.walletId ?? null,
          daysToTrigger: act.daysToTrigger ?? 0,
          relativeDay:   act.relativeDay ?? 0,
          templateComponents: act.templateComponents ?? [],
        }));
        base.actions = updateRelativeDays(rawActions);
      } catch { /* ignore */ }
    }
    setFlowForm(base);
    setFlowOpen(true);
  };

  const openFlowActionSelector = () => { setActionSelOpen(true); };

  const selectFlowActionType = (type: string) => {
    setActionSelOpen(false);
    setEditingSubIdx(null);
    switch (type) {
      case "message":      setMsgCfg(blankMsgCfg());       setMsgCfgOpen(true);    break;
      case "media":        setMediaCfg(blankMediaCfg());   setMediaCfgOpen(true);  break;
      case "stage_change": setStageCfg(blankStageCfg());   setStageCfgOpen(true);  break;
      case "status_change":setStatusCfg(blankStatusCfg()); setStatusCfgOpen(true); break;
      case "add_tag":      setTagCfg(blankTagCfg());       setTagCfgOpen(true);    break;
      case "add_wallet":   setWalletCfg(blankWalletCfg()); setWalletCfgOpen(true); break;
      case "template":
        setTplFlowCfg(blankTplFlowCfg());
        setFlowTemplates([]);
        setTplFlowOpen(true);
        break;
    }
  };

  const editSubAction = (idx: number) => {
    const a = flowForm.actions[idx];
    setEditingSubIdx(idx);
    switch (a.actionType) {
      case "message":
        setMsgCfg({ name: a.name, message: a.actionContent ?? "", whatsappId: a.whatsappId != null ? String(a.whatsappId) : NONE, daysToTrigger: a.daysToTrigger });
        setMsgCfgOpen(true);
        break;
      case "media": {
        let mUrl = "", mCap = "", mType = "";
        let mPtt = true;
        if (a.actionContent) { try { const p = JSON.parse(a.actionContent); mUrl = p.mediaUrl ?? ""; mCap = p.caption ?? ""; mType = p.mediaType ?? ""; mPtt = p.ptt !== false; } catch { /* */ } }
        setMediaCfg({ name: a.name, mediaUrl: mUrl, mediaCaption: mCap, mediaType: mType, mediaPtt: mPtt, whatsappId: a.whatsappId != null ? String(a.whatsappId) : NONE, daysToTrigger: a.daysToTrigger });
        setMediaCfgOpen(true);
        break;
      }
      case "stage_change":
        setStageCfg({ name: a.name, targetStageId: a.targetStageId != null ? String(a.targetStageId) : NONE, daysToTrigger: a.daysToTrigger });
        setStageCfgOpen(true);
        break;
      case "status_change":
        setStatusCfg({ name: a.name, targetStatus: a.targetStatus ?? NONE, daysToTrigger: a.daysToTrigger });
        setStatusCfgOpen(true);
        break;
      case "add_tag":
        setTagCfg({ name: a.name, tagId: a.tagId != null ? String(a.tagId) : NONE, daysToTrigger: a.daysToTrigger });
        setTagCfgOpen(true);
        break;
      case "add_wallet":
        setWalletCfg({ name: a.name, walletId: a.walletId != null ? String(a.walletId) : NONE, daysToTrigger: a.daysToTrigger });
        setWalletCfgOpen(true);
        break;
      case "template": {
        let tKey = NONE;
        let savedOrder: any = null;
        if (a.actionContent) {
          try {
            const p = JSON.parse(a.actionContent);
            tKey = p.templateName && p.templateLanguage ? `${p.templateName}|${p.templateLanguage}` : NONE;
            savedOrder = p.orderDetails ?? null;
          } catch { /* */ }
        }
        setTplFlowCfg({ name: a.name, whatsappId: a.whatsappId != null ? String(a.whatsappId) : NONE, templateKey: tKey, varFields: [], daysToTrigger: a.daysToTrigger, orderDetails: orderDetailsFromSaved(savedOrder) });
        setFlowTemplates([]);
        if (a.whatsappId) {
          const conn = wabaConns.find(c => c.id === a.whatsappId);
          if (conn) {
            setLoadingFlowTpls(true);
            import("@/services/channel-templates").then(m => m.getTemplatesForChannel({ id: conn.id, type: conn.type, tokenAPI: conn.tokenAPI })).then((list: any[]) => {
              setFlowTemplates(list);
              if (tKey !== NONE) {
                const [name, language] = tKey.split("|");
                const tmpl = list.find(x => x.name === name && x.language === language);
                if (tmpl) {
                  const labels = getTemplateVariableLabels(tmpl);
                  const existing = a.templateComponents ? getValuesFromComponents(tmpl, a.templateComponents) : [];
                  setTplFlowCfg(prev => ({ ...prev, varFields: labels.map((lbl, i) => ({ label: lbl, value: existing[i] ?? "" })) }));
                }
              }
            }).catch(() => {}).finally(() => setLoadingFlowTpls(false));
          }
        }
        setTplFlowOpen(true);
        break;
      }
    }
  };

  const commitSubAction = (updated: FlowSubAction) => {
    setFlowForm(prev => {
      const actions = editingSubIdx !== null
        ? prev.actions.map((a, i) => i === editingSubIdx ? updated : a)
        : [...prev.actions, updated];
      return { ...prev, actions: updateRelativeDays(actions) };
    });
    setEditingSubIdx(null);
  };

  const removeSubAction = (idx: number) => {
    setFlowForm(prev => ({ ...prev, actions: updateRelativeDays(prev.actions.filter((_, i) => i !== idx)) }));
  };

  const moveSubAction = (idx: number, dir: -1 | 1) => {
    setFlowForm(prev => {
      const arr = [...prev.actions];
      const to = idx + dir;
      if (to < 0 || to >= arr.length) return prev;
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      return { ...prev, actions: updateRelativeDays(arr) };
    });
  };

  const handleSaveFlow = async () => {
    if (!flowForm.name.trim())          { toast.error(t("validationNameRequired"));         return; }
    if (flowForm.pipelineId === NONE)   { toast.error(t("validationPipelineRequired"));     return; }
    if (flowForm.stageId === NONE)      { toast.error(t("validationStageRequired"));        return; }
    if (flowForm.actions.length === 0)  { toast.error(t("validationFlowNeedActions"));      return; }

    try {
      if (editingFlowAction) {
        await updatePipelineAction(editingFlowAction.id, {
          name: flowForm.name.trim(),
          description: flowForm.description.trim(),
          actionType: "flow",
          pipelineId: Number(flowForm.pipelineId),
          stageId:    Number(flowForm.stageId),
          active: true,
          daysToTrigger: 0,
          actionContent: JSON.stringify({
            actions: flowForm.actions.map((a, i) => ({
              ...a,
              relativeDay: i === 0 ? 0 : flowForm.actions.slice(0, i).reduce((s, x) => s + (x.daysToTrigger || 0), 0),
            })),
          }),
        });
      } else {
        await createPipelineActionsSequential({
          pipelineId: Number(flowForm.pipelineId),
          stageId:    Number(flowForm.stageId),
          flowName:   flowForm.name.trim(),
          actions: flowForm.actions.map(a => ({
            name:          a.name,
            description:   flowForm.description.trim(),
            actionType:    a.actionType,
            daysToTrigger: a.daysToTrigger || 0,
            pipelineId:    Number(flowForm.pipelineId),
            stageId:       Number(flowForm.stageId),
            active:        true,
            actionContent: a.actionContent,
            whatsappId:    a.whatsappId,
            targetStageId: a.targetStageId,
            targetStatus:  a.targetStatus,
            tagId:         a.tagId,
            walletId:      a.walletId,
          })),
        });
      }
      toast.success(t("flowSaved"));
      setFlowOpen(false);
      loadActions();
    } catch { toast.error(t("errorSaveFlow")); }
  };

  const onFlowWabaChange = async (wabaId: string) => {
    setTplFlowCfg(prev => ({ ...prev, whatsappId: wabaId, templateKey: NONE, varFields: [], orderDetails: emptyOrderDetails() }));
    setFlowTemplates([]);
    if (wabaId === NONE) return;
    const conn = wabaConns.find(c => String(c.id) === wabaId);
    if (!conn) return;
    setLoadingFlowTpls(true);
    try {
      const { getTemplatesForChannel } = await import("@/services/channel-templates");
      // Cast — services retornam shapes equivalentes mas tipos diferentes.
      const list = (await getTemplatesForChannel({ id: conn.id, type: conn.type, tokenAPI: conn.tokenAPI })) as any;
      setFlowTemplates([...list].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
    } catch { toast.error(t("errorFetchTemplates")); }
    finally { setLoadingFlowTpls(false); }
  };

  const onFlowTemplateSelect = (key: string) => {
    setTplFlowCfg(prev => {
      const tmpl = key === NONE ? null : flowTemplates.find(x => `${x.name}|${x.language}` === key) ?? null;
      const varFields = tmpl ? getTemplateVariableLabels(tmpl).map(l => ({ label: l, value: "" })) : [];
      // Ficha zerada ao trocar de template (cobranca de um template nao vale para outro).
      return { ...prev, templateKey: key, varFields, orderDetails: emptyOrderDetails() };
    });
  };

  const updateFlowOrderDetails = (value: OrderDetailsValue) =>
    setTplFlowCfg(prev => ({ ...prev, orderDetails: value }));

  const updateFlowVarField = (idx: number, value: string) => {
    setTplFlowCfg(prev => ({ ...prev, varFields: prev.varFields.map((f, i) => i === idx ? { ...f, value } : f) }));
  };

  const saveMsgCfg = () => {
    if (!msgCfg.name.trim() || !msgCfg.message.trim() || msgCfg.whatsappId === NONE) { toast.error(t("validationMessageAndWhatsapp")); return; }
    commitSubAction({ id: `msg_${Date.now()}`, actionType: "message", name: msgCfg.name.trim(), actionContent: msgCfg.message.trim(), whatsappId: Number(msgCfg.whatsappId), daysToTrigger: msgCfg.daysToTrigger || 0 });
    setMsgCfgOpen(false);
    setFlowOpen(true);
  };

  const saveMediaCfg = () => {
    if (!mediaCfg.name.trim() || !mediaCfg.mediaUrl.trim() || mediaCfg.whatsappId === NONE) { toast.error(t("validationMediaAndWhatsapp")); return; }
    commitSubAction({
      id: `med_${Date.now()}`, actionType: "media", name: mediaCfg.name.trim(),
      whatsappId: Number(mediaCfg.whatsappId),
      actionContent: JSON.stringify({ mediaUrl: mediaCfg.mediaUrl.trim(), caption: mediaCfg.mediaCaption.trim(), mediaType: mediaCfg.mediaType, ptt: mediaCfg.mediaPtt }),
      daysToTrigger: mediaCfg.daysToTrigger || 0,
    });
    setMediaCfgOpen(false);
    setFlowOpen(true);
  };

  const saveStageCfg = () => {
    if (!stageCfg.name.trim() || stageCfg.targetStageId === NONE) { toast.error(t("validationTargetStageRequired")); return; }
    commitSubAction({ id: `stg_${Date.now()}`, actionType: "stage_change", name: stageCfg.name.trim(), targetStageId: Number(stageCfg.targetStageId), daysToTrigger: stageCfg.daysToTrigger || 0 });
    setStageCfgOpen(false);
    setFlowOpen(true);
  };

  const saveStatusCfg = () => {
    if (!statusCfg.name.trim() || statusCfg.targetStatus === NONE) { toast.error(t("validationTargetStatusRequired")); return; }
    commitSubAction({ id: `sts_${Date.now()}`, actionType: "status_change", name: statusCfg.name.trim(), targetStatus: statusCfg.targetStatus, daysToTrigger: statusCfg.daysToTrigger || 0 });
    setStatusCfgOpen(false);
    setFlowOpen(true);
  };

  const saveTagCfg = () => {
    if (!tagCfg.name.trim() || tagCfg.tagId === NONE) { toast.error(t("validationTagRequired")); return; }
    commitSubAction({ id: `tag_${Date.now()}`, actionType: "add_tag", name: tagCfg.name.trim(), tagId: Number(tagCfg.tagId), daysToTrigger: tagCfg.daysToTrigger || 0 });
    setTagCfgOpen(false);
    setFlowOpen(true);
  };

  const saveWalletCfg = () => {
    if (!walletCfg.name.trim() || walletCfg.walletId === NONE) { toast.error(t("validationWalletRequired")); return; }
    commitSubAction({ id: `wal_${Date.now()}`, actionType: "add_wallet", name: walletCfg.name.trim(), walletId: Number(walletCfg.walletId), daysToTrigger: walletCfg.daysToTrigger || 0 });
    setWalletCfgOpen(false);
    setFlowOpen(true);
  };

  const saveTplFlowCfg = () => {
    if (!tplFlowCfg.name.trim())             { toast.error(t("validationNameRequired"));    return; }
    if (tplFlowCfg.whatsappId === NONE)      { toast.error(t("validationSelectWaba"));      return; }
    if (tplFlowCfg.templateKey === NONE)     { toast.error(t("validationSelectTemplate"));  return; }
    const [name, language] = tplFlowCfg.templateKey.split("|");
    const tmpl = flowTemplates.find(x => x.name === name && x.language === language) ?? null;
    // Header de mídia: o 1º campo é a URL (mesma regra do save de ação simples).
    const flowTplHeader = tmpl?.components?.find((c) => c.type === "HEADER");
    if (flowTplHeader && ["IMAGE", "VIDEO", "DOCUMENT"].includes(flowTplHeader.format)) {
      const urlVal = (tplFlowCfg.varFields[0]?.value || "").trim();
      if (!isValidHttpUrl(urlVal) && !/\{\{.+\}\}/.test(urlVal)) {
        toast.error(tErrors("invalidMediaHeaderUrl"));
        return;
      }
    }
    // Cobranca invalida barrada aqui: o disparo e assincrono e um erro no job so
    // apareceria depois, no log da acao.
    if (isOrderDetailsFlowSelected) {
      const orderError = validateOrderDetails(tplFlowCfg.orderDetails);
      if (orderError) { toast.warning(tOrder(orderError)); return; }
    }
    // Idem sub-ação de fluxo: sem variável o array ainda leva o texto para a bolha.
    const components = tmpl ? buildTemplateComponents(tmpl, tplFlowCfg.varFields) : [];
    commitSubAction({
      id: `tpl_${Date.now()}`, actionType: "template", name: tplFlowCfg.name.trim(),
      whatsappId: Number(tplFlowCfg.whatsappId),
      actionContent: JSON.stringify({
        templateName: name,
        templateLanguage: language,
        templateComponents: components,
        // Campo extra so em template ORDER_DETAILS — sub-acao comum fica igual.
        ...(isOrderDetailsFlowSelected ? { orderDetails: buildOrderDetailsPayload(tplFlowCfg.orderDetails) } : {}),
      }),
      templateComponents: components,
      daysToTrigger: tplFlowCfg.daysToTrigger || 0,
    });
    setTplFlowOpen(false);
    setFlowOpen(true);
  };

  const flowStages = allStages.filter(s => flowForm.pipelineId === NONE || s.pipelineId === Number(flowForm.pipelineId));
  // ─────────────────────────────────────────────────────────────────────────────

  const getPipelineName = (a: PipelineAction) =>
    a.pipeline?.name ?? pipelines.find(p => p.id === a.pipelineId)?.name ?? "—";
  const getStageName = (a: PipelineAction) =>
    a.stage?.name ?? allStages.find(s => s.id === a.stageId)?.name ?? "—";
  const actionLabel = (v: string) => ACTION_TYPES.find(t => t.value === v)?.label ?? v;
  // "Dias para Disparar": para um flow o registro pai tem daysToTrigger=0 (o flow inicia
  // junto com a entrada no estagio) e os dias reais vivem nas sub-acoes do actionContent.
  // O executor dispara a ultima sub-acao em createdAt + soma(daysToTrigger), entao o total
  // do fluxo = soma dos dias das sub-acoes.
  const getActionDays = (a: PipelineAction): number => {
    if (a.actionType !== "flow") return a.daysToTrigger ?? 0;
    if (!a.actionContent) return a.daysToTrigger ?? 0;
    try {
      const parsed = JSON.parse(a.actionContent);
      const subs: any[] = Array.isArray(parsed?.actions) ? parsed.actions : [];
      return subs.reduce((sum, s) => sum + (Number(s?.daysToTrigger) || 0), 0);
    } catch {
      return a.daysToTrigger ?? 0;
    }
  };

  const mediaPreview = (url: string, type: string) => {
    if (!url) return null;
    const fileName = (url.split("/").pop() || url).split("?")[0];
    const isImg = type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(fileName);
    const isVid = type.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(fileName);
    return (
      <div className="flex items-center gap-2 rounded border p-2 bg-muted/40">
        {isImg ? (
          <img src={url} alt={fileName} className="h-12 w-12 rounded object-cover" />
        ) : isVid ? (
          <Video className="h-6 w-6 text-muted-foreground shrink-0" />
        ) : (
          <FileText className="h-6 w-6 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs text-muted-foreground truncate flex-1">{fileName}</span>
      </div>
    );
  };

  const isAudioMedia = (type: string, url: string) => {
    const fileName = (url.split("/").pop() || url).split("?")[0];
    return type.startsWith("audio/") || /\.(mp3|ogg|oga|opus|m4a|aac|wav|amr)$/i.test(fileName);
  };

  const onMediaPick = (item: GalleryItem) => {
    if (mediaPickTargetRef.current === "form") {
      f({ mediaUrl: item.url, mediaType: item.type });
    } else {
      setMediaCfg(p => ({ ...p, mediaUrl: item.url, mediaType: item.type }));
    }
  };

  // ── Logs de ações ───────────────────────────────────────────────────────────
  const loadLogs = useCallback(async (page = 1) => {
    if (!user?.tenantId) return;
    setLogsLoading(true);
    try {
      const { data } = await fetchPipelineActionLogs(user.tenantId, page);
      setLogs(Array.isArray(data?.data) ? data.data : []);
      setLogsPage(data?.pagination?.page ?? page);
      setLogsTotalPages(data?.pagination?.totalPages ?? 1);
      setLogsTotal(data?.pagination?.total ?? 0);
    } catch { toast.error(t("errorLoadLogs")); }
    finally { setLogsLoading(false); }
  }, [user?.tenantId]);

  const openLogs = () => { setLogsOpen(true); loadLogs(1); };

  const logStatusMeta = (status: string): { label: string; variant: "success" | "destructive" | "warning" | "info" | "secondary" } => {
    switch (status) {
      case "success":     return { label: t("logStatusSuccess"),    variant: "success" };
      case "error":       return { label: t("logStatusError"),      variant: "destructive" };
      case "pending":     return { label: t("logStatusPending"),    variant: "warning" };
      case "in_progress": return { label: t("logStatusInProgress"), variant: "info" };
      case "completed":   return { label: t("logStatusCompleted"),  variant: "success" };
      default:            return { label: status,                   variant: "secondary" };
    }
  };
  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[300px]" />
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("pageTitle")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      >
        <Button variant="outline" size="sm" onClick={loadActions}>
          <RefreshCw className="mr-2 h-4 w-4" />{t("refresh")}
        </Button>
        <Button variant="outline" onClick={openLogs}>
          <History className="mr-2 h-4 w-4" />{t("viewLogs")}
        </Button>
        <Button variant="outline" onClick={openCreateFlow}>
          <GitBranch className="mr-2 h-4 w-4" />{t("newFlow")}
        </Button>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />{t("newAction")}
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs mb-1 block">{t("search")}</Label>
          <Input placeholder={t("searchPlaceholder")} value={fSearch} onChange={e => setFSearch(e.target.value)} className="w-48" />
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("pipeline")}</Label>
          <Select value={fPipeline} onValueChange={v => { setFPipeline(v); setFStage(NONE); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t("allPipelines")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("allPipelines")}</SelectItem>
              {pipelines.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("stage")}</Label>
          <Select value={fStage} onValueChange={setFStage}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t("allStages")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("allStages")}</SelectItem>
              {filterStages.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("type")}</Label>
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger className="w-44"><SelectValue placeholder={t("allTypes")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("allTypes")}</SelectItem>
              {ACTION_TYPES.map(at => <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pt-4">
          <Switch checked={fActive} onCheckedChange={setFActive} id="filter-active" />
          <Label htmlFor="filter-active" className="text-sm">{t("active")}</Label>
        </div>
      </div>

      {/* Table / empty state */}
      {actions.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Zap className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("noActions")}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t("noActionsDesc")}</p>
              <Button className="mt-4" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("createAction")}</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colPipeline")}</TableHead>
                  <TableHead>{t("colStage")}</TableHead>
                  <TableHead>{t("colType")}</TableHead>
                  <TableHead>{t("colDays")}</TableHead>
                  <TableHead>{t("active")}</TableHead>
                  <TableHead className="w-[100px]">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map(a => {
                  // Referências que envelheceram (canal/etiqueta/carteira/etapa
                  // excluídos após configurar) — listas vivas já carregadas pela
                  // página; cobre também sub-ações de fluxos (actionContent JSON).
                  const broken: string[] = [];
                  // Canal: existência apenas (lista completa, não a dos selects).
                  // Lista vazia = canais não carregaram (o catch do loadOptions é
                  // silencioso) — nesse caso não acusa nada, para falha de rede não
                  // marcar toda ação como quebrada.
                  const chkChannel = (id?: number | null) => { if (id && existingChannelIds.length > 0 && !existingChannelIds.includes(Number(id))) broken.push(t("brokenChannel", { id: Number(id) })); };
                  const chkTag = (id?: number | null) => { if (id && !tags.some((x) => x.id === Number(id))) broken.push(t("brokenTag", { id: Number(id) })); };
                  const chkWallet = (id?: number | null) => { if (id && !users.some((u) => u.id === Number(id))) broken.push(t("brokenWallet", { id: Number(id) })); };
                  const chkStage = (id?: number | null) => { if (id && !allStages.some((s) => s.id === Number(id))) broken.push(t("brokenStage", { id: Number(id) })); };
                  chkChannel(a.whatsappId); chkTag(a.tagId); chkWallet(a.walletId); chkStage(a.targetStageId);
                  if (a.actionType === "flow" && a.actionContent) {
                    try {
                      const flow = JSON.parse(a.actionContent) as { actions?: FlowSubAction[] };
                      (flow.actions || []).forEach((sub) => { chkChannel(sub.whatsappId); chkTag(sub.tagId); chkWallet(sub.walletId); chkStage(sub.targetStageId); });
                    } catch { /* actionContent não-JSON: sem checagem de sub-ações */ }
                  }
                  return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {a.name}
                        {broken.length > 0 && (
                          <span title={`${broken.join(" • ")} — ${t("brokenHint")}`} aria-label={t("brokenBadge")}>
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{getPipelineName(a)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{getStageName(a)}</TableCell>
                    <TableCell><Badge variant="secondary">{actionLabel(a.actionType)}</Badge></TableCell>
                    <TableCell>{getActionDays(a)}d</TableCell>
                    <TableCell><Switch checked={a.active} onCheckedChange={() => handleToggle(a)} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setDeleting(a); setDeleteOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? t("editAction") : t("newAction")}</DialogTitle>
            <DialogDescription>
              {t("dialogDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 overflow-y-auto flex-1 pr-1">
            {/* Name */}
            <div className="grid gap-2">
              <Label>{t("labelName")}</Label>
              <Input value={form.name} onChange={e => f({ name: e.target.value })} placeholder={t("placeholderName")} />
            </div>

            {/* Pipeline */}
            <div className="grid gap-2">
              <Label>{t("labelPipeline")}</Label>
              <Select value={form.pipelineId} onValueChange={v => f({ pipelineId: v, stageId: NONE, targetStageId: NONE })}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {pipelines.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Stage */}
            <div className="grid gap-2">
              <Label>{t("labelStage")}</Label>
              <Select value={form.stageId} onValueChange={v => f({ stageId: v })} disabled={form.pipelineId === NONE}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {formStages.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Action type */}
            <div className="grid gap-2">
              <Label>{t("labelActionType")}</Label>
              <Select
                value={form.actionType}
                onValueChange={v => {
                  f({ actionType: v, whatsappId: NONE });
                  resetTemplateState();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map(at => <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* ── message ── */}
            {form.actionType === "message" && (
              <>
                <div className="grid gap-2">
                  <Label>{t("labelMessage")}</Label>
                  <TextareaWithVars value={form.actionContent} onChange={val => f({ actionContent: val })} placeholder={t("placeholderMessage")} rows={3} />
                </div>
                <div className="grid gap-2">
                  <Label>{t("labelWhatsapp")}</Label>
                  <Select value={form.whatsappId} onValueChange={v => f({ whatsappId: v })}>
                    <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {whatsapps.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* ── media ── */}
            {form.actionType === "media" && (
              <>
                <div className="grid gap-2">
                  <Label>{t("labelMedia")}</Label>
                  {mediaPreview(form.mediaUrl, form.mediaType)}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => { mediaPickTargetRef.current = "form"; setMediaPickerOpen(true); }}>
                      <Images className="mr-2 h-4 w-4" />{form.mediaUrl ? t("mediaChange") : t("mediaPickBtn")}
                    </Button>
                    {form.mediaUrl && (
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => f({ mediaUrl: "", mediaType: "" })}>
                        {t("mediaRemove")}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>{t("labelCaption")}</Label>
                  <TextareaWithVars value={form.mediaCaption} onChange={val => f({ mediaCaption: val })} placeholder={t("placeholderCaption")} rows={2} />
                </div>
                {isAudioMedia(form.mediaType, form.mediaUrl) && (
                  <div className="flex items-center gap-2">
                    <Switch id="media-ptt" checked={form.mediaPtt} onCheckedChange={v => f({ mediaPtt: v })} />
                    <Label htmlFor="media-ptt">{t("labelSendAsVoice")}</Label>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>{t("labelWhatsapp")}</Label>
                  <Select value={form.whatsappId} onValueChange={v => f({ whatsappId: v })}>
                    <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {whatsapps.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">{t("mediaWindowNote")}</p>
              </>
            )}

            {/* ── template WABA ── */}
            {form.actionType === "template" && (
              <>
                {/* WABA connection (only waba type) */}
                <div className="grid gap-2">
                  <Label>{t("labelWabaConn")}</Label>
                  {wabaConns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("noWabaConnFound")}</p>
                  ) : (
                    <Select value={form.whatsappId} onValueChange={onWabaChange}>
                      <SelectTrigger><SelectValue placeholder={t("placeholderSelectWaba")} /></SelectTrigger>
                      <SelectContent>
                        {wabaConns.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Template selector */}
                {form.whatsappId !== NONE && (
                  <div className="grid gap-2">
                    <Label>{t("labelTemplate")}</Label>
                    {loadingTemplates ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />{t("loadingTemplates")}
                      </div>
                    ) : templates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("noApprovedTemplates")}</p>
                    ) : (
                      <Select value={templateKey} onValueChange={onTemplateSelect}>
                        <SelectTrigger><SelectValue placeholder={t("placeholderSelectTemplate")} /></SelectTrigger>
                        <SelectContent>
                          {templates.map(t => (
                            <SelectItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                              {t.name} ({t.language})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {/* Ficha de cobranca — so aparece em template ORDER_DETAILS */}
                {isOrderDetailsSelected && selectedTemplate && (
                  <div className="grid gap-2 border-t pt-3">
                    <div>
                      <Label className="text-xs mb-0.5 block">{tOrder("sectionTitle")}</Label>
                      <p className="text-xs text-muted-foreground">{tOrder("sectionHint")}</p>
                    </div>
                    <OrderDetailsFields
                      key={`${selectedTemplate.name}-${selectedTemplate.language}`}
                      value={orderDetailsValue}
                      onChange={setOrderDetailsValue}
                      compact
                      bulkWarning
                    />
                  </div>
                )}

                {/* Variable fields */}
                {varFields.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
                      {t("fillTemplateVars")}
                    </p>
                    {varFields.map((vf, i) => (
                      <div key={i} className="grid gap-1">
                        <Label className="text-xs">{vf.label}</Label>
                        <InputWithVars value={vf.value} onChange={val => updateVarField(i, val)} placeholder={vf.label} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── stage_change ── */}
            {form.actionType === "stage_change" && (
              <div className="grid gap-2">
                <Label>{t("labelTargetStage")}</Label>
                <Select value={form.targetStageId} onValueChange={v => f({ targetStageId: v })} disabled={form.pipelineId === NONE}>
                  <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {formStages.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── status_change ── */}
            {form.actionType === "status_change" && (
              <div className="grid gap-2">
                <Label>{t("labelTargetStatus")}</Label>
                <Select value={form.targetStatus} onValueChange={v => f({ targetStatus: v })}>
                  <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── add_tag ── */}
            {form.actionType === "add_tag" && (
              <div className="grid gap-2">
                <Label>{t("labelTag")}</Label>
                <Select value={form.tagId} onValueChange={v => f({ tagId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {tags.map(tag => <SelectItem key={tag.id} value={String(tag.id)}>{tag.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── add_wallet ── */}
            {form.actionType === "add_wallet" && (
              <div className="grid gap-2">
                <Label>{t("labelWallet")}</Label>
                <Select value={form.walletId} onValueChange={v => f({ walletId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Days to trigger */}
            <div className="grid gap-2">
              <Label>{t("labelDaysToTrigger")}</Label>
              <Input type="number" min={0} value={form.daysToTrigger} onChange={e => f({ daysToTrigger: Number(e.target.value) || 0 })} />
              <p className="text-xs text-muted-foreground">{t("daysToTriggerSimpleHint")}</p>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label>{t("labelDescription")}</Label>
              <Textarea value={form.description} onChange={e => f({ description: e.target.value })} rows={2} />
            </div>

            {/* Active */}
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => f({ active: v })} id="form-active" />
              <Label htmlFor="form-active">{t("active")}</Label>
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSubmit}>{editing ? t("save") : t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteAction")}</DialogTitle>
            <DialogDescription>{t("deleteConfirm")} <strong>{deleting?.name}</strong>?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Flow main dialog ── */}
      <Dialog open={flowOpen} onOpenChange={setFlowOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("flowDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 overflow-y-auto flex-1 pr-1">
            <div className="grid gap-2">
              <Label>{t("labelName")}</Label>
              <Input value={flowForm.name} onChange={e => ff({ name: e.target.value })} placeholder={t("placeholderName")} />
            </div>
            <div className="grid gap-2">
              <Label>{t("labelPipeline")}</Label>
              <Select value={flowForm.pipelineId} onValueChange={v => ff({ pipelineId: v, stageId: NONE })}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {pipelines.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("labelStage")}</Label>
              <Select value={flowForm.stageId} onValueChange={v => ff({ stageId: v })} disabled={flowForm.pipelineId === NONE}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {flowStages.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("labelDescription")}</Label>
              <Textarea value={flowForm.description} onChange={e => ff({ description: e.target.value })} rows={2} />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">{t("flowActions")}</p>
              {flowForm.actions.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("noFlowActionsYet")}</p>
              )}
              <div className="space-y-2">
                {flowForm.actions.map((a, idx) => {
                  // Dia real de disparo (apos o inicio do fluxo) = soma cumulativa INCLUSIVA dos
                  // daysToTrigger ate esta acao, espelhando o ExecutePipelineActionsJob.executeFlow:
                  // triggerDate = createdAt + (daysToTrigger + accumulatedDays); accumulatedDays += daysToTrigger.
                  // Ou seja, cada acao dispara no dia = soma dos delays dela e de todas as anteriores.
                  const triggerDay = flowForm.actions
                    .slice(0, idx + 1)
                    .reduce((s, x) => s + (Number(x.daysToTrigger) || 0), 0);
                  return (
                  <Card key={a.id}>
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{actionLabel(a.actionType)} · {t("daysAfterStart", { days: triggerDay })}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => moveSubAction(idx, -1)}><ArrowUp className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" disabled={idx === flowForm.actions.length - 1} onClick={() => moveSubAction(idx, 1)}><ArrowDown className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { setFlowOpen(false); editSubAction(idx); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeSubAction(idx)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setFlowOpen(false); openFlowActionSelector(); }}>
                <Plus className="mr-2 h-3 w-3" />{t("addAction")}
              </Button>
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setFlowOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveFlow}>{editingFlowAction ? t("save") : t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Action selector ── */}
      <Dialog open={actionSelOpen} onOpenChange={v => { setActionSelOpen(v); if (!v) setFlowOpen(true); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("selectActionTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-1 py-2">
            {ACTION_TYPES.filter(at => at.value !== "flow").map(at => (
              <Button key={at.value} variant="ghost" className="w-full justify-start" onClick={() => selectFlowActionType(at.value)}>
                {at.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Message config ── */}
      <Dialog open={msgCfgOpen} onOpenChange={v => { setMsgCfgOpen(v); if (!v) { setFlowOpen(true); setEditingSubIdx(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("configMessage")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>{t("labelName")}</Label><Input value={msgCfg.name} onChange={e => setMsgCfg(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid gap-2"><Label>{t("labelMessage")}</Label><TextareaWithVars value={msgCfg.message} onChange={val => setMsgCfg(p => ({ ...p, message: val }))} rows={3} /></div>
            <div className="grid gap-2">
              <Label>{t("labelWhatsapp")}</Label>
              <Select value={msgCfg.whatsappId} onValueChange={v => setMsgCfg(p => ({ ...p, whatsappId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>{whatsapps.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>{t("labelDaysToTrigger")}</Label><Input type="number" min={0} value={msgCfg.daysToTrigger} onChange={e => setMsgCfg(p => ({ ...p, daysToTrigger: Number(e.target.value) || 0 }))} /><p className="text-xs text-muted-foreground">{t("daysToTriggerFlowHint")}</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMsgCfgOpen(false); setFlowOpen(true); setEditingSubIdx(null); }}>{t("cancel")}</Button>
            <Button onClick={saveMsgCfg}>{t("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Media config ── */}
      <Dialog open={mediaCfgOpen} onOpenChange={v => { setMediaCfgOpen(v); if (!v) { setFlowOpen(true); setEditingSubIdx(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("configMedia")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>{t("labelName")}</Label><Input value={mediaCfg.name} onChange={e => setMediaCfg(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid gap-2">
              <Label>{t("labelMedia")}</Label>
              {mediaPreview(mediaCfg.mediaUrl, mediaCfg.mediaType)}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { mediaPickTargetRef.current = "flow"; setMediaPickerOpen(true); }}>
                  <Images className="mr-2 h-4 w-4" />{mediaCfg.mediaUrl ? t("mediaChange") : t("mediaPickBtn")}
                </Button>
                {mediaCfg.mediaUrl && (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setMediaCfg(p => ({ ...p, mediaUrl: "", mediaType: "" }))}>
                    {t("mediaRemove")}
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-2"><Label>{t("labelCaption")}</Label><TextareaWithVars value={mediaCfg.mediaCaption} onChange={val => setMediaCfg(p => ({ ...p, mediaCaption: val }))} rows={2} /></div>
            {isAudioMedia(mediaCfg.mediaType, mediaCfg.mediaUrl) && (
              <div className="flex items-center gap-2">
                <Switch id="media-cfg-ptt" checked={mediaCfg.mediaPtt} onCheckedChange={v => setMediaCfg(p => ({ ...p, mediaPtt: v }))} />
                <Label htmlFor="media-cfg-ptt">{t("labelSendAsVoice")}</Label>
              </div>
            )}
            <div className="grid gap-2">
              <Label>{t("labelWhatsapp")}</Label>
              <Select value={mediaCfg.whatsappId} onValueChange={v => setMediaCfg(p => ({ ...p, whatsappId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>{whatsapps.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>{t("labelDaysToTrigger")}</Label><Input type="number" min={0} value={mediaCfg.daysToTrigger} onChange={e => setMediaCfg(p => ({ ...p, daysToTrigger: Number(e.target.value) || 0 }))} /><p className="text-xs text-muted-foreground">{t("daysToTriggerFlowHint")}</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMediaCfgOpen(false); setFlowOpen(true); setEditingSubIdx(null); }}>{t("cancel")}</Button>
            <Button onClick={saveMediaCfg}>{t("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Stage change config ── */}
      <Dialog open={stageCfgOpen} onOpenChange={v => { setStageCfgOpen(v); if (!v) { setFlowOpen(true); setEditingSubIdx(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("configStageChange")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>{t("labelName")}</Label><Input value={stageCfg.name} onChange={e => setStageCfg(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid gap-2">
              <Label>{t("labelTargetStage")}</Label>
              <Select value={stageCfg.targetStageId} onValueChange={v => setStageCfg(p => ({ ...p, targetStageId: v }))} disabled={flowForm.pipelineId === NONE}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>{flowStages.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>{t("labelDaysToTrigger")}</Label><Input type="number" min={0} value={stageCfg.daysToTrigger} onChange={e => setStageCfg(p => ({ ...p, daysToTrigger: Number(e.target.value) || 0 }))} /><p className="text-xs text-muted-foreground">{t("daysToTriggerFlowHint")}</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStageCfgOpen(false); setFlowOpen(true); setEditingSubIdx(null); }}>{t("cancel")}</Button>
            <Button onClick={saveStageCfg}>{t("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Status change config ── */}
      <Dialog open={statusCfgOpen} onOpenChange={v => { setStatusCfgOpen(v); if (!v) { setFlowOpen(true); setEditingSubIdx(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("configStatusChange")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>{t("labelName")}</Label><Input value={statusCfg.name} onChange={e => setStatusCfg(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid gap-2">
              <Label>{t("labelTargetStatus")}</Label>
              <Select value={statusCfg.targetStatus} onValueChange={v => setStatusCfg(p => ({ ...p, targetStatus: v }))}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>{t("labelDaysToTrigger")}</Label><Input type="number" min={0} value={statusCfg.daysToTrigger} onChange={e => setStatusCfg(p => ({ ...p, daysToTrigger: Number(e.target.value) || 0 }))} /><p className="text-xs text-muted-foreground">{t("daysToTriggerFlowHint")}</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStatusCfgOpen(false); setFlowOpen(true); setEditingSubIdx(null); }}>{t("cancel")}</Button>
            <Button onClick={saveStatusCfg}>{t("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Tag config ── */}
      <Dialog open={tagCfgOpen} onOpenChange={v => { setTagCfgOpen(v); if (!v) { setFlowOpen(true); setEditingSubIdx(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("configTag")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>{t("labelName")}</Label><Input value={tagCfg.name} onChange={e => setTagCfg(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid gap-2">
              <Label>{t("labelTag")}</Label>
              <Select value={tagCfg.tagId} onValueChange={v => setTagCfg(p => ({ ...p, tagId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>{tags.map(tag => <SelectItem key={tag.id} value={String(tag.id)}>{tag.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>{t("labelDaysToTrigger")}</Label><Input type="number" min={0} value={tagCfg.daysToTrigger} onChange={e => setTagCfg(p => ({ ...p, daysToTrigger: Number(e.target.value) || 0 }))} /><p className="text-xs text-muted-foreground">{t("daysToTriggerFlowHint")}</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTagCfgOpen(false); setFlowOpen(true); setEditingSubIdx(null); }}>{t("cancel")}</Button>
            <Button onClick={saveTagCfg}>{t("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Wallet config ── */}
      <Dialog open={walletCfgOpen} onOpenChange={v => { setWalletCfgOpen(v); if (!v) { setFlowOpen(true); setEditingSubIdx(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("configWallet")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>{t("labelName")}</Label><Input value={walletCfg.name} onChange={e => setWalletCfg(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid gap-2">
              <Label>{t("labelWallet")}</Label>
              <Select value={walletCfg.walletId} onValueChange={v => setWalletCfg(p => ({ ...p, walletId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>{users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>{t("labelDaysToTrigger")}</Label><Input type="number" min={0} value={walletCfg.daysToTrigger} onChange={e => setWalletCfg(p => ({ ...p, daysToTrigger: Number(e.target.value) || 0 }))} /><p className="text-xs text-muted-foreground">{t("daysToTriggerFlowHint")}</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setWalletCfgOpen(false); setFlowOpen(true); setEditingSubIdx(null); }}>{t("cancel")}</Button>
            <Button onClick={saveWalletCfg}>{t("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Template flow config ── */}
      <Dialog open={tplFlowOpen} onOpenChange={v => { setTplFlowOpen(v); if (!v) { setFlowOpen(true); setEditingSubIdx(null); } }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0"><DialogTitle>{t("configTemplate")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 overflow-y-auto flex-1 pr-1">
            <div className="grid gap-2"><Label>{t("labelName")}</Label><Input value={tplFlowCfg.name} onChange={e => setTplFlowCfg(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid gap-2">
              <Label>{t("labelWabaConn")}</Label>
              {wabaConns.length === 0
                ? <p className="text-sm text-muted-foreground">{t("noWabaConnFound")}</p>
                : <Select value={tplFlowCfg.whatsappId} onValueChange={onFlowWabaChange}>
                    <SelectTrigger><SelectValue placeholder={t("placeholderSelectWaba")} /></SelectTrigger>
                    <SelectContent>{wabaConns.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
              }
            </div>
            {tplFlowCfg.whatsappId !== NONE && (
              <div className="grid gap-2">
                <Label>{t("labelTemplate")}</Label>
                {loadingFlowTpls
                  ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loadingTemplates")}</div>
                  : flowTemplates.length === 0
                    ? <p className="text-sm text-muted-foreground">{t("noApprovedTemplates")}</p>
                    : <Select value={tplFlowCfg.templateKey} onValueChange={onFlowTemplateSelect}>
                        <SelectTrigger><SelectValue placeholder={t("placeholderSelectTemplate")} /></SelectTrigger>
                        <SelectContent>{flowTemplates.map(tmpl => <SelectItem key={`${tmpl.name}|${tmpl.language}`} value={`${tmpl.name}|${tmpl.language}`}>{tmpl.name} ({tmpl.language})</SelectItem>)}</SelectContent>
                      </Select>
                }
              </div>
            )}
            {/* Ficha de cobranca — so aparece em template ORDER_DETAILS */}
            {isOrderDetailsFlowSelected && (
              <div className="grid gap-2 border-t pt-3">
                <div>
                  <Label className="text-xs mb-0.5 block">{tOrder("sectionTitle")}</Label>
                  <p className="text-xs text-muted-foreground">{tOrder("sectionHint")}</p>
                </div>
                <OrderDetailsFields
                  key={tplFlowCfg.templateKey}
                  value={tplFlowCfg.orderDetails}
                  onChange={updateFlowOrderDetails}
                  compact
                  bulkWarning
                />
              </div>
            )}
            {tplFlowCfg.varFields.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">{t("fillTemplateVars")}</p>
                {tplFlowCfg.varFields.map((vf, i) => (
                  <div key={i} className="grid gap-1">
                    <Label className="text-xs">{vf.label}</Label>
                    <InputWithVars value={vf.value} onChange={val => updateFlowVarField(i, val)} placeholder={vf.label} />
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-2"><Label>{t("labelDaysToTrigger")}</Label><Input type="number" min={0} value={tplFlowCfg.daysToTrigger} onChange={e => setTplFlowCfg(p => ({ ...p, daysToTrigger: Number(e.target.value) || 0 }))} /><p className="text-xs text-muted-foreground">{t("daysToTriggerFlowHint")}</p></div>
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => { setTplFlowOpen(false); setFlowOpen(true); setEditingSubIdx(null); }}>{t("cancel")}</Button>
            <Button onClick={saveTplFlowCfg}>{t("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Logs de ações ── */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("logsTitle")}</DialogTitle>
            <DialogDescription>{t("logsDesc")}</DialogDescription>
          </DialogHeader>

          <div className="overflow-auto flex-1 -mx-6 px-6">
            {logsLoading ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <History className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">{t("noLogs")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t("logColDate")}</TableHead>
                    <TableHead>{t("logColOpportunity")}</TableHead>
                    <TableHead>{t("logColContact")}</TableHead>
                    <TableHead>{t("logColNumber")}</TableHead>
                    <TableHead>{t("logColEmail")}</TableHead>
                    <TableHead>{t("logColAction")}</TableHead>
                    <TableHead>{t("logColStatus")}</TableHead>
                    <TableHead>{t("logColError")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => {
                    const meta = logStatusMeta(log.status);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDateTime(log.createdAt)}</TableCell>
                        <TableCell className="text-sm">{log.opportunity?.name || "—"}</TableCell>
                        <TableCell className="text-sm">{log.opportunity?.contact?.name || "—"}</TableCell>
                        <TableCell className="text-sm">{log.opportunity?.contact?.number || "—"}</TableCell>
                        <TableCell className="text-sm">{log.opportunity?.contact?.email || "—"}</TableCell>
                        <TableCell className="text-sm">{log.pipelineAction?.name || "—"}</TableCell>
                        <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={log.errorMessage || ""}>{log.errorMessage || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-2 sm:justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {t("logsPageInfo", { page: logsPage, totalPages: Math.max(logsTotalPages, 1), total: logsTotal })}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={logsLoading || logsPage <= 1} onClick={() => loadLogs(logsPage - 1)}>
                <ChevronLeft className="h-4 w-4" />{t("prev")}
              </Button>
              <Button variant="outline" size="sm" disabled={logsLoading || logsPage >= logsTotalPages} onClick={() => loadLogs(logsPage + 1)}>
                {t("next")}<ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Media picker (galeria + upload) ── */}
      <GalleryPickerWithUploadDialog
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onPick={onMediaPick}
      />
    </div>
  );
}
