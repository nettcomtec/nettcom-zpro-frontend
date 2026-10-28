"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { displayContactIdentity } from "@/lib/contact-identity";
import { cn, isValidHttpUrl } from "@/lib/utils";
import { isTicketAccessDenied } from "@/lib/ticket-access-denied";
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import {
  isOrderDetailsTemplate,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  type OrderDetailsValue,
} from "@/lib/order-details";
import { useLiveMode } from "@/hooks/use-live-mode";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, RefreshCw, Trash2, ChevronLeft, ChevronRight, ChevronDown,
  User, Phone, Mail, Calendar, Search, X, MessageCircle, Paperclip,
  Images, Download, Eye, UserRound, MoreHorizontal, Info,
} from "lucide-react";
import { ContactAvatar } from "@/components/contact-avatar";
import { SpyContactMessagesPopover } from "@/components/atendimento/spy-contact-messages-dialog";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  fetchPipelines,
  fetchStages,
  fetchOpportunities,
  fetchOpportunity,
  updateOpportunity,
  deleteOpportunity,
} from "@/services/funnel";
import { fetchAllUsers } from "@/services/users";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { fetchTags, type Tag as TagOption } from "@/services/tags";
import { fetchWallets, type Wallet as WalletOption } from "@/services/wallets";
import { fetchKanbans, type Kanban as KanbanOption } from "@/services/kanban";
import {
  sendIndividualMessage,
  sendWabaTemplateComponents,
  sendEmailWebmail,
  type WabaTemplate,
} from "@/services/messages";
import { AVULSA_MESSAGE_CHANNEL_TYPES, AVULSA_EMAIL_CHANNEL_TYPES } from "@/services/individual-message";
import { useQuickReplies } from "@/hooks/use-quick-replies";
import { QuickReplyTextarea } from "@/components/quick-replies/quick-reply-textarea";
import { QuickReplyTemplateShortcuts } from "@/components/quick-replies/quick-reply-template-shortcuts";
import { buildSignedBody, isSignatureMandatory } from "@/lib/signature";
import { type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { usePageAccess } from "@/hooks/use-page-access";
import { useAuthStore } from "@/stores/auth-store";
import { useTouchDrag } from "@/hooks/use-touch-drag";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { KanbanStatsChips } from "@/components/funil/kanban-stats-chips";
import { OpportunityAlerts } from "@/components/funil/opportunity-alerts";
import { useOpportunityCalendarEvent, type OpportunityEventData } from "@/components/funil/opportunity-calendar-event";
import { OpportunityFormBody } from "@/components/funil/opportunity-form-fields";
import { PipelineSelector } from "@/components/funil/pipeline-selector";
import { OpportunitySheet } from "@/components/funil/opportunity-sheet";
import { useOpportunityTicketFlow, OpportunityTicketBadge } from "@/components/funil/opportunity-ticket-flow";
import {
  formatValue,
  formatDateUTC,
  isUrgent,
  statusColor,
  statusLabel,
  normalizeOpportunity,
  restrictedContactName,
  isBlockedByNotViewAssigned,
  pickDefaultPipeline,
  type Pipeline,
  type Stage,
  type Responsible,
  type Opportunity,
  type OpportunityContact,
  type Filters,
  type Pagination,
} from "@/components/funil/opportunity-shared";
import { useRegion } from "@/hooks/use-region";
import { countryLocale } from "@/lib/region";

// ─── Helpers do CSV ──────────────────────────────────────────────────────────
// Tipos e helpers do quadro moram em components/funil/opportunity-shared.ts (a ficha
// e o formulário usam os mesmos); aqui ficam só os da exportação.

// Valor no CSV: sem símbolo e sem separador de milhar, com o separador decimal do
// país da empresa (no BR segue "1234,50", como sempre).
function csvDecimal(val: number | string | null | undefined, country: string) {
  const n = Number(val ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(countryLocale(country), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false,
    }).format(safe);
  } catch {
    return safe.toFixed(2).replace(".", ",");
  }
}

// Separador do CSV: onde o decimal e virgula (BR) o Excel espera ";" e, com ",",
// abre o arquivo inteiro na coluna A; nos demais paises segue a virgula.
function csvDelimiter(country: string) {
  try {
    const decimal = new Intl.NumberFormat(countryLocale(country))
      .formatToParts(1.5)
      .find(p => p.type === "decimal")?.value;
    return decimal === "," ? ";" : ",";
  } catch {
    return ";";
  }
}

// Texto que comeca com = + - @ o Excel le como formula ("- pendente" vira #NOME? e
// "=HYPERLINK(...)" executa). Um espaco na frente mantem como texto; numero e o
// telefone de csvPhoneCell (formula de proposito) passam intactos.
function csvNeutralizeFormula(text: string) {
  if (!/^[=+\-@]/.test(text)) return text;
  if (/^[+-]?\d+([.,]\d+)?$/.test(text) || /^="[\d\s().+-]*"$/.test(text)) return text;
  return ` ${text}`;
}

// Um registro por linha: quebra de linha dentro da celula (descricao com varias
// linhas) vira " | " e as linhas vazias somem.
function csvEscape(value: unknown) {
  if (value === null || value === undefined) return '""';
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const singleLine = /[\r\n]/.test(raw)
    ? raw.split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean).join(" | ")
    : raw;
  return `"${csvNeutralizeFormula(singleLine).replace(/"/g, '""')}"`;
}

// O Excel le uma sequencia longa de digitos como numero e mostra 5,54796E+11 no
// lugar do telefone. `="..."` obriga a celula a ser texto. So entra em valor de
// telefone (digitos/sinais) para nunca transformar texto do usuario em formula.
function csvPhoneCell(value: string) {
  if (!value) return "";
  return /^[+\d][\d\s().+-]*$/.test(value) ? `="${value}"` : value;
}

// ─── Nova oportunidade ────────────────────────────────────────────────────────

interface CreateOpportunityDialogProps {
  open: boolean;
  onClose: () => void;
  /** Depois de gravar: a página fecha, recarrega as oportunidades e pergunta do Google Agenda */
  onSaved: () => void;
  onCreated: (data: OpportunityEventData) => void;
  pipelines: Pipeline[];
  stages: Stage[];
  responsaveis: Responsible[];
  defaultPipelineId: number | null;
  defaultStageId: number | null;
}

// Só criação: a edição mora na ficha (D7). O hook do Google Agenda fica na página,
// porque este diálogo fecha logo depois de criar e desmontaria a pergunta.
function CreateOpportunityDialog({
  open, onClose, onSaved, onCreated, pipelines, stages, responsaveis, defaultPipelineId, defaultStageId,
}: CreateOpportunityDialogProps) {
  const t = useTranslations("funilKanbanPage");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createOpportunity")}</DialogTitle>
        </DialogHeader>
        <OpportunityFormBody
          oportunidade={null}
          pipelines={pipelines}
          stages={stages}
          responsaveis={responsaveis}
          defaultPipelineId={defaultPipelineId}
          defaultStageId={defaultStageId}
          onCreated={onCreated}
          onSaved={() => onSaved()}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Message Modal ───────────────────────────────────────────────────────

// Nome de verdade (com letra): contato que nasceu com o telefone como nome não conta
// como "dados do cadastro" nos avisos de variável da mensagem rápida.
function nameHasLetter(name?: string | null) {
  return /\p{L}/u.test(name ?? "");
}

// Preferência "Assinado" do atendente: a mesma chave da Nova Conversa e do chat.
function readSignaturePreference() {
  if (typeof window === "undefined") return true;
  try {
    const saved = localStorage.getItem("signatureEnabled");
    return saved === null ? true : saved === "true";
  } catch {
    return true;
  }
}

function readSignatureName(username?: string | null) {
  if (username) return username;
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("username") || "";
  } catch {
    return "";
  }
}

// Mesmo critério do servidor para achar o contato do e-mail: exatamente 1 destinatário
// (para + cópia + cópia oculta, e-mails distintos sem diferença de caixa).
function singleRecipientEmail(...fields: string[]): string | null {
  const set = new Set(
    fields
      .flatMap(f => (f || "").split(/[,;]+/))
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return set.size === 1 ? Array.from(set)[0] : null;
}

interface SendMessageModalProps {
  open: boolean;
  opp: Opportunity | null;
  whatsapps: Whatsapp[];
  onClose: () => void;
}

function SendMessageModal({ open, opp, whatsapps, onClose }: SendMessageModalProps) {
  const t = useTranslations("funilKanbanPage");
  const tErrors = useTranslations("errors");
  const tOrder = useTranslations("orderDetails");
  // Seletor de status: MESMO vocabulario do dialog "Nova Conversa" (as 5 chaves ja
  // existem nos 13 locales) — reusar evita duas traducoes divergindo para a mesma escolha.
  const tHeader = useTranslations("layoutHeader");
  const tChat = useTranslations("atendimentoChat");
  const tMsgInput = useTranslations("messageInput");
  const router = useRouter();
  // Mensagens rápidas ("/" no campo e atalhos de template): carregadas a cada abertura
  const { rows: quickReplies, loading: quickRepliesLoading } = useQuickReplies(open);
  // Assinatura com a regra do chat (D9): isentos admin, superadmin e supervisor que é admin
  const authUser = useAuthStore((s) => s.user);
  const supervisorAdmin = useAuthStore((s) => s.supervisorAdmin);
  const signedSetting = useAuthStore((s) => s.getConfigValue("signed"));
  const forceSignature = isSignatureMandatory({ signedSetting, profile: authUser?.profile, supervisorAdmin });
  const signName = readSignatureName(authUser?.username);
  const [signatureEnabled, setSignatureEnabled] = useState(readSignaturePreference);
  const [sessionId, setSessionId] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  // Status do ticket iniciado pelo card (espelha "Nova Conversa"): "open" nasce
  // atribuido ao operador; "pending" fica na fila sem dono. Sem este campo o
  // backend criava o ticket sem vinculo nenhum com quem enviou e o guard de acesso
  // barrava o proprio envio do template (403 ERR_NO_TICKET_ACCESS) para atendente.
  const [desiredStatus, setDesiredStatus] = useState<"open" | "pending">("open");
  const [loading, setLoading] = useState(false);

  // WABA state
  const [wabaTemplates, setWabaTemplates] = useState<WabaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WabaTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateVars, setTemplateVars] = useState<{ key: string; label: string; value: string }[]>([]);
  // Cobranca (template ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md F6.
  // Estado paralelo ao templateVars: o botao de cobranca nao gera variavel.
  const [orderDetailsValue, setOrderDetailsValue] = useState<OrderDetailsValue>(() => emptyOrderDetails());
  const [tplGalleryOpen, setTplGalleryOpen] = useState(false);

  // Só as conexões que o /individual atende (P2): Telegram, Instagram, Hub e afins começam
  // pelo atendimento, e o e-mail tem o diálogo próprio.
  const connectedSessions = whatsapps.filter(w =>
    w.status === "CONNECTED" && AVULSA_MESSAGE_CHANNEL_TYPES.includes((w.type ?? "").toLowerCase())
  );
  const selectedSession = whatsapps.find(w => String(w.id) === sessionId);
  const chType = (selectedSession?.type ?? "").toLowerCase();
  const isDialog360 = chType === "dialog360";
  const isGupshup = chType === "gupshup";
  const isWabaLike = chType.includes("waba") || isDialog360 || isGupshup;

  // Reset on open
  useEffect(() => {
    if (open && opp) {
      setPhone(opp.contact?.number ?? "");
      setSessionId("");
      setMessage("");
      setSelectedTemplate(null);
      setTemplateSearch("");
      setWabaTemplates([]);
      setDesiredStatus("open");
      // A preferência pode ter mudado em outra tela desde a última abertura
      setSignatureEnabled(readSignaturePreference());
    }
  }, [open, opp]);

  // Load templates (WABA/Dialog360/Gupshup) when session changes. A troca de canal limpa
  // lista, seleção e variáveis do anterior, e a resposta de um canal anterior é descartada:
  // sem isso um atalho de 1 clique escolhia o modelo do canal A e enviava pelo B.
  useEffect(() => {
    setWabaTemplates([]);
    setSelectedTemplate(null);
    setTemplateVars([]);
    if (!isWabaLike || (chType.includes("waba") && !selectedSession?.tokenAPI)) {
      setLoadingTemplates(false);
      return;
    }
    let alive = true;
    setLoadingTemplates(true);
    import("@/services/channel-templates")
      .then(m => m.getTemplatesForChannel({ id: selectedSession!.id, type: selectedSession!.type, tokenAPI: selectedSession!.tokenAPI, appId: (selectedSession as { appId?: string })?.appId }))
      .then((res: any) => {
        if (!alive) return;
        const list = (Array.isArray(res) ? res : res?.data || []) as any[];
        setWabaTemplates([...list].sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())));
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingTemplates(false); });
    return () => { alive = false; };
  }, [sessionId, isWabaLike, chType, selectedSession?.tokenAPI]);

  // Avisos de variável da mensagem rápida: dados do contato só quando o número do campo é
  // o do contato da oportunidade (com nome de verdade); atendente só em "Em atendimento";
  // protocolo/atendimento vazios nas conexões que enviam antes de criar o atendimento.
  const quickReplyWarnings = useMemo(() => {
    const oppDigits = (opp?.contact?.number ?? "").replace(/\D/g, "");
    const phoneDigits = phone.replace(/\D/g, "");
    return {
      contactKnown: !!oppDigits && phoneDigits === oppDigits && nameHasLetter(opp?.contact?.name),
      ownerKnown: desiredStatus === "open",
      ticketVarsEmpty: ["whatsapp", "baileys", "zapo"].includes(chType),
      channel: "phone" as const,
    };
  }, [opp?.contact?.number, opp?.contact?.name, phone, desiredStatus, chType]);

  // Parse template variables when template selected
  useEffect(() => {
    // Zera a ficha de cobranca ao trocar de template (nao ha var de botao p/ ORDER_DETAILS).
    setOrderDetailsValue(emptyOrderDetails());
    if (!selectedTemplate) { setTemplateVars([]); return; }
    const vars: { key: string; label: string; value: string }[] = [];
    selectedTemplate.components?.forEach(comp => {
      if (comp.type === "HEADER" && comp.format && comp.format !== "TEXT" && comp.format !== "NONE")
        vars.push({ key: "header_link", label: `Header (${comp.format})`, value: "" });
      if ((comp.type === "BODY" || comp.type === "HEADER") && comp.text) {
        // Variáveis WABA são numeradas independentemente por componente — prefixar key com header_/body_.
        const keyPrefix = comp.type === "HEADER" ? "header_" : "body_";
        const labelPrefix = comp.type === "HEADER" ? "Header — " : "";
        [...comp.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)].forEach(m => {
          const k = `${keyPrefix}named_${m[1]}`;
          if (!vars.some(v => v.key === k))
            vars.push({ key: k, label: `${labelPrefix}{{${m[1]}}}`, value: "" });
        });
        [...comp.text.matchAll(/\{\{(\d+)\}\}/g)].forEach(m => {
          const k = `${keyPrefix}var_${m[1]}`;
          if (!vars.some(v => v.key === k))
            vars.push({ key: k, label: `${labelPrefix}{{${m[1]}}}`, value: "" });
        });
      }
    });
    setTemplateVars(vars);
  }, [selectedTemplate]);

  // Template de cobranca: exige a ficha de pagamento no envio (sub_category/display_format/botao).
  const isOrderDetailsSelected = useMemo(
    () => isOrderDetailsTemplate(selectedTemplate),
    [selectedTemplate]
  );

  const filteredTemplates = wabaTemplates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const pickTplGalleryItem = (item: GalleryItem) => {
    setTemplateVars(prev => prev.map(v => v.key === "header_link" ? { ...v, value: item.url } : v));
    setTplGalleryOpen(false);
  };

  function updateVar(key: string, value: string) {
    setTemplateVars(vars => vars.map(v => v.key === key ? { ...v, value } : v));
  }

  function getTemplatePreview(tpl: WabaTemplate) {
    const body = tpl.components?.find(c => c.type === "BODY");
    return body?.text?.slice(0, 80) ?? tpl.name;
  }

  async function handleSend() {
    if (!sessionId) { toast.error(t("msgSessionRequired")); return; }
    if (!phone.trim()) { toast.error(t("msgPhoneRequired")); return; }
    if (isWabaLike && !selectedTemplate) { toast.error(t("msgTemplateRequired")); return; }
    if (!isWabaLike && !message.trim()) { toast.error(t("msgTextRequired")); return; }
    if (isWabaLike && selectedTemplate) {
      const headerLinkCheck = templateVars.find(v => v.key === "header_link");
      if (headerLinkCheck && !isValidHttpUrl(headerLinkCheck.value)) { toast.error(tErrors("invalidMediaHeaderUrl")); return; }
      // Cobranca: valida antes de criar o ticket — evita ticket orfao com envio 400.
      if (isOrderDetailsSelected) {
        const orderError = validateOrderDetails(orderDetailsValue);
        if (orderError) { toast.warning(tOrder(orderError)); return; }
      }
    }

    const cleanNumber = phone.replace(/\D/g, "");
    // Assinatura como na Nova Conversa (P2): só no texto livre, nunca no template oficial
    const useSignature = forceSignature || signatureEnabled;
    const outgoingMessage = !isWabaLike && useSignature && signName.trim() && message.trim()
      ? buildSignedBody(signName, message, chType)
      : message;
    setLoading(true);
    try {
      const res = await sendIndividualMessage({
        whatsappId: Number(sessionId),
        whatsappType: chType,
        number: cleanNumber,
        message: isWabaLike ? "" : outgoingMessage,
        desiredStatus,
      });

      if (isWabaLike && selectedTemplate) {
        const ticketId = (res.data as { ticketId?: number })?.ticketId;
        const components: Record<string, unknown>[] = [];

        const headerComp = selectedTemplate.components?.find(c => c.type === "HEADER");
        if (headerComp) {
          if (headerComp.format === "TEXT") {
            const headerPositional = templateVars.filter(v => v.key.startsWith("header_var_"));
            const headerNamed = templateVars.filter(v => v.key.startsWith("header_named_"));
            if (headerPositional.length > 0) {
              const variables: string[] = [];
              headerPositional
                .sort((a, b) => parseInt(a.key.replace("header_var_", "")) - parseInt(b.key.replace("header_var_", "")))
                .forEach((v, i) => { variables[i] = v.value.trim() || " "; });
              components.push({ type: "HEADER", format: "TEXT", variables });
            } else if (headerNamed.length > 0) {
              components.push({
                type: "HEADER",
                format: "TEXT",
                parameters: headerNamed.map(v => ({ type: "text", text: v.value.trim() || " ", name: v.key.replace("header_named_", "") })),
              });
            }
          } else {
            const hlv = templateVars.find(v => v.key === "header_link");
            if (hlv?.value)
              components.push({ type: "HEADER", format: headerComp.format, value: hlv.value });
          }
        }

        const positionalVars = templateVars.filter(v => v.key.startsWith("body_var_"));
        const namedVars = templateVars.filter(v => v.key.startsWith("body_named_"));

        if (positionalVars.length > 0) {
          const variables: string[] = [];
          positionalVars
            .sort((a, b) => parseInt(a.key.replace("body_var_", "")) - parseInt(b.key.replace("body_var_", "")))
            .forEach((v, i) => { variables[i] = v.value; });
          components.push({ type: "BODY", variables });
        } else if (namedVars.length > 0) {
          components.push({
            type: "BODY",
            parameters: namedVars.map(v => ({
              type: "text",
              text: v.value.trim() || " ",
              name: v.key.replace("body_named_", ""),
            })),
          });
        }

        const idFront = `kanban_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        // Cobranca vai como campo proprio: o backend monta, valida e injeta o
        // componente no BUTTONS. Sem cobranca o spread vira {} (no-op).
        const orderDetailsField = isOrderDetailsSelected
          ? { orderDetails: buildOrderDetailsPayload(orderDetailsValue) }
          : {};

        if (isGupshup) {
          const { sendGupshupTemplateMsg } = await import("@/services/gupshup-messages");
          await sendGupshupTemplateMsg({
            from: cleanNumber,
            ticketId,
            whatsappId: selectedSession!.id,
            tokenApi: selectedSession!.tokenAPI,
            idFront,
            fromMe: true,
            read: 1,
            name: selectedTemplate.name,
            language: selectedTemplate.language,
            components,
            // Mesmo array de components do ramo WABA (contrato do dataJson):
            // sem ele a bolha nao tem o que renderizar no Gupshup/Dialog360.
            dataJson: JSON.stringify(components),
            ...orderDetailsField,
          });
        } else if (isDialog360) {
          const { sendDialog360Template } = await import("@/services/dialog360-messages");
          await sendDialog360Template({
            from: cleanNumber,
            ticketId,
            whatsappId: selectedSession!.id,
            tokenApi: selectedSession!.tokenAPI,
            idFront,
            fromMe: true,
            read: 1,
            templateName: selectedTemplate.name,
            templateLanguage: selectedTemplate.language,
            components,
            // Mesmo array de components do ramo WABA (contrato do dataJson):
            // sem ele a bolha nao tem o que renderizar no Gupshup/Dialog360.
            dataJson: JSON.stringify(components),
            ...orderDetailsField,
          });
        } else {
          await sendWabaTemplateComponents({
            from: cleanNumber,
            tokenApi: selectedSession!.tokenAPI,
            ticketId,
            phone_number_id: selectedSession!.tokenAPI,
            language: selectedTemplate.language,
            templateName: selectedTemplate.name,
            body: JSON.stringify(selectedTemplate.components || []),
            mediaType: "templates",
            sendType: "templates",
            fromMe: true,
            components,
            dataJson: JSON.stringify(components),
            scheduleDate: null,
            quotedMsg: null,
            idFront,
            ...orderDetailsField,
          });
        }
      }

      // Atalho para a conversa só quando o atendimento é abrível por quem enviou: com
      // "não ver atendimentos de outros", o /individual pode devolver o de um colega.
      const sent = res?.data as { ticketId?: number | null; userId?: number | null } | undefined;
      const sentTicketId = sent?.ticketId;
      const { user: me, getConfigValue } = useAuthStore.getState();
      const blocked = isBlockedByNotViewAssigned({
        notViewOn: getConfigValue("NotViewAssignedTickets") === "enabled",
        profile: me?.profile,
        meId: me?.userId,
        ticketUserId: sent?.userId ?? null,
        viewerLinked: false,
      });
      if (sentTicketId && !blocked) {
        toast.success(t("msgSentOk"), {
          action: {
            label: t("openTicket"),
            onClick: () => router.push(`/atendimento?ticketId=${sentTicketId}`),
          },
        });
      } else {
        toast.success(t("msgSentOk"));
      }
      onClose();
    } catch (err: unknown) {
      const errCode = String((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "");
      // Cobrança: o interceptor de api.ts rejeita com a RESPOSTA (não com o
      // AxiosError), então o código chega em `data.error`. Lê as duas formas —
      // sem isso o motivo da recusa (CRC, valor, permissão) some no toast genérico.
      const chargeErrCode = String(
        (err as { data?: { error?: string } })?.data?.error ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        ""
      );
      if (errCode.startsWith("ERR_NUMBER_RESOLVED_MISMATCH")) {
        toast.error(tErrors("numberResolvedMismatch"));
      } else if (isTicketAccessDenied(err)) {
        // Guard de acesso do backend: o contato ja tem atendimento de outra
        // pessoa/fila. Mostra o motivo real em vez do "erro ao enviar" generico.
        toast.error(tChat("noTicketAccess"));
      } else if (chargeErrCode === "ERR_ORDER_DETAILS_NOT_SUPPORTED") {
        toast.error(tOrder("errorNotSupportedHere"));
      } else if (isOrderDetailsSelected && chargeErrCode === "ERR_NO_PERMISSION") {
        toast.error(tOrder("errorNotAllowed"));
      } else if (chargeErrCode.startsWith("ERR_ORDER_DETAILS")) {
        // A validação do formulário espelha a do backend, então um código aqui é
        // divergência real — mostra o código para o suporte em vez de engolir.
        toast.error(`${tOrder("errorSendFailed")}: ${chargeErrCode}`);
      } else if (isOrderDetailsSelected && chargeErrCode === "ERR_FEATURE_NOT_IN_PLAN") {
        // O interceptor global já avisa "recurso fora do plano" — não duplicar.
      } else {
        toast.error(t("msgSentError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90dvh] flex flex-col">
        <DialogHeader><DialogTitle>{t("msgModalTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Canal */}
          <div>
            <Label className="text-xs mb-1 block">{t("msgSession")}</Label>
            <Select value={sessionId} onValueChange={v => { setSessionId(v); setSelectedTemplate(null); setTemplateSearch(""); }}>
              <SelectTrigger><SelectValue placeholder={t("msgSessionPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {connectedSessions.length === 0
                  ? <SelectItem value="__none" disabled>{t("noSessions")}</SelectItem>
                  : connectedSessions.map(w => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name} <span className="text-muted-foreground text-xs">({w.type})</span>
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
            <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
              <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t("msgChannelsHint")}</span>
            </p>
          </div>

          {/* Número */}
          <div>
            <Label className="text-xs mb-1 block">{t("msgPhone")}</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t("msgPhonePlaceholder")} />
          </div>

          {/* Canal oficial (WABA/Dialog360/Gupshup): template selector */}
          {isWabaLike && (
            <>
              <div>
                <Label className="text-xs mb-1 block">{t("msgSelectTemplate")}</Label>
                {/* Atalhos das mensagens rápidas do tipo Template (D6); somem enquanto a lista carrega */}
                <div className="mb-2 empty:hidden">
                  <QuickReplyTemplateShortcuts
                    quickReplies={quickReplies}
                    templates={wabaTemplates}
                    loading={loadingTemplates}
                    onSelectTemplate={(tpl) => setSelectedTemplate(tpl)}
                    onFilterByName={(name) => setTemplateSearch(name)}
                  />
                </div>
                <Input
                  value={templateSearch}
                  onChange={e => setTemplateSearch(e.target.value)}
                  placeholder={t("msgTemplateSearch")}
                  className="mb-2"
                />
                {loadingTemplates ? (
                  <p className="text-xs text-muted-foreground py-2">{t("msgLoadingTemplates")}</p>
                ) : filteredTemplates.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">{t("msgNoTemplates")}</p>
                ) : (
                  <div className="border rounded-md overflow-y-auto max-h-40 divide-y">
                    {filteredTemplates.map(tpl => {
                      // Mesmo nome em mais de um idioma: o idioma diferencia (o atalho filtra pelo nome)
                      const isSelected = selectedTemplate?.name === tpl.name && selectedTemplate?.language === tpl.language;
                      return (
                        <button
                          key={`${tpl.name}-${tpl.language}`}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${isSelected ? "bg-primary/10 font-semibold" : ""}`}
                          onClick={() => setSelectedTemplate(tpl)}
                        >
                          <p className="font-medium flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{tpl.name}</span>
                            {tpl.language && (
                              <span className="shrink-0 text-[10px] font-normal text-muted-foreground">{tpl.language}</span>
                            )}
                          </p>
                          <p className="text-muted-foreground truncate">{getTemplatePreview(tpl)}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Variáveis do template */}
              {templateVars.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs mb-1 block">{t("msgTemplateVars")}</Label>
                  {templateVars.map(v => (
                    <div key={v.key}>
                      <Label className="text-xs mb-0.5 block text-muted-foreground">{v.label}</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          value={v.value}
                          onChange={e => updateVar(v.key, e.target.value)}
                          placeholder={v.label}
                          className="h-8 text-xs flex-1"
                        />
                        {v.key === "header_link" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            title={t("pickFromGallery")}
                            onClick={() => setTplGalleryOpen(true)}
                          >
                            <Images className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ficha de cobranca — so aparece em template ORDER_DETAILS */}
              {isOrderDetailsSelected && selectedTemplate && (
                <div className="space-y-2 border-t pt-2">
                  <div>
                    <Label className="text-xs mb-0.5 block">{tOrder("sectionTitle")}</Label>
                    <p className="text-xs text-muted-foreground">{tOrder("sectionHint")}</p>
                  </div>
                  <OrderDetailsFields
                    key={`${selectedTemplate.name}-${selectedTemplate.language}`}
                    value={orderDetailsValue}
                    onChange={setOrderDetailsValue}
                    compact
                  />
                </div>
              )}

              {/* Preview do template */}
              {selectedTemplate && (
                <div>
                  <Label className="text-xs mb-1 block">{t("msgTemplatePreview")}</Label>
                  <div className="bg-[#e5ddd5] rounded-lg p-3">
                    <div className="bg-white rounded-lg shadow-sm p-3 max-w-[90%] ml-auto space-y-1.5">
                      {selectedTemplate.components?.find(c => c.type === "HEADER") && (() => {
                        const hdr = selectedTemplate.components!.find(c => c.type === "HEADER")!;
                        if (hdr.format === "TEXT" && hdr.text) {
                          let rendered = hdr.text;
                          templateVars.filter(v => v.key.startsWith("header_var_") || v.key.startsWith("header_named_")).forEach(v => {
                            const n = v.key.startsWith("header_var_") ? v.key.replace("header_var_", "") : v.key.replace("header_named_", "");
                            rendered = rendered.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), v.value || `{{${n}}}`);
                          });
                          return <p className="font-bold text-sm text-gray-900">{rendered}</p>;
                        }
                        if (hdr.format === "IMAGE") return <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">[Imagem]</div>;
                        if (hdr.format === "VIDEO") return <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">[Video]</div>;
                        if (hdr.format === "DOCUMENT") return <div className="h-10 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">[Documento]</div>;
                        return null;
                      })()}
                      {selectedTemplate.components?.find(c => c.type === "BODY")?.text && (() => {
                        let text = selectedTemplate.components!.find(c => c.type === "BODY")!.text!;
                        templateVars.filter(v => v.key.startsWith("body_var_") || v.key.startsWith("body_named_")).forEach(v => {
                          const n = v.key.startsWith("body_var_") ? v.key.replace("body_var_", "") : v.key.replace("body_named_", "");
                          text = text.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), v.value || `{{${n}}}`);
                        });
                        return <p className="text-sm whitespace-pre-wrap text-gray-800">{text}</p>;
                      })()}
                      {selectedTemplate.components?.find(c => c.type === "FOOTER")?.text && (
                        <p className="text-xs text-gray-400">{selectedTemplate.components!.find(c => c.type === "FOOTER")!.text}</p>
                      )}
                      {selectedTemplate.components?.find(c => c.type === "BUTTONS")?.buttons && (
                        <div className="border-t border-gray-200 pt-1.5 mt-1 space-y-1">
                          {selectedTemplate.components!.find(c => c.type === "BUTTONS")!.buttons!.map((btn, i) => (
                            <div key={i} className="text-center text-xs text-blue-500 py-0.5 border border-gray-200 rounded">{btn.text}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Não-oficial: textarea de mensagem */}
          {!isWabaLike && sessionId && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <Label htmlFor="funil-msg-text" className="text-xs">{t("msgText")}</Label>
                {signName.trim() && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch
                      id="funil-msg-sig-toggle"
                      checked={forceSignature ? true : signatureEnabled}
                      onCheckedChange={forceSignature ? undefined : (v) => {
                        try { localStorage.setItem("signatureEnabled", String(v)); } catch { /* só não lembra */ }
                        setSignatureEnabled(v);
                      }}
                      disabled={forceSignature}
                      className="scale-90"
                    />
                    <Label htmlFor="funil-msg-sig-toggle" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                      {(forceSignature || signatureEnabled) ? tMsgInput("signatureEnabled") : tMsgInput("signatureDisabled")}
                    </Label>
                  </div>
                )}
              </div>
              {forceSignature && signName.trim() && (
                <p className="mb-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{tHeader("newConversation.signatureMandatoryHint")}</span>
                </p>
              )}
              <QuickReplyTextarea
                id="funil-msg-text"
                value={message}
                onChange={setMessage}
                quickReplies={quickReplies}
                quickRepliesLoading={quickRepliesLoading}
                placeholder={t("msgTextPlaceholder")}
                textareaRows={4}
                warnings={quickReplyWarnings}
              />
            </div>
          )}

          {/* Status do atendimento — ultima escolha antes de Enviar, igual ao dialog
              "Nova Conversa". Define se o ticket nasce com o operador ou fica na fila. */}
          <div className="space-y-2">
            <Label>{tHeader("newConversation.statusLabel")}</Label>
            <RadioGroup
              value={desiredStatus}
              onValueChange={(v) => setDesiredStatus(v as "open" | "pending")}
              className="grid grid-cols-2 gap-2"
            >
              <label className={cn(
                "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                desiredStatus === "open" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              )}>
                <RadioGroupItem value="open" id="funil-status-open" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium leading-none">{tHeader("newConversation.statusOpen")}</div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{tHeader("newConversation.statusOpenDesc")}</p>
                </div>
              </label>
              <label className={cn(
                "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                desiredStatus === "pending" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              )}>
                <RadioGroupItem value="pending" id="funil-status-pending" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium leading-none">{tHeader("newConversation.statusPending")}</div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{tHeader("newConversation.statusPendingDesc")}</p>
                </div>
              </label>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={handleSend} disabled={loading}>
            {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Gallery picker for template header */}
    <GalleryPickerWithUploadDialog
      open={tplGalleryOpen}
      onOpenChange={setTplGalleryOpen}
      onPick={pickTplGalleryItem}
      {...wabaHeaderFormatToGalleryParams(
        selectedTemplate?.components?.find((c) => c.type === "HEADER")?.format
      )}
    />
    </>
  );
}

// ─── Send Email Modal ─────────────────────────────────────────────────────────

interface SendEmailModalProps {
  open: boolean;
  opp: Opportunity | null;
  whatsapps: Whatsapp[];
  onClose: () => void;
}

function SendEmailModal({ open, opp, whatsapps, onClose }: SendEmailModalProps) {
  const t = useTranslations("funilKanbanPage");
  const [channelId, setChannelId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mensagens rápidas ("/" no corpo do e-mail): carregadas a cada abertura
  const { rows: quickReplies, loading: quickRepliesLoading } = useQuickReplies(open);

  // Webmail e e-mail (D13): a mesma lista de e-mail da Nova Conversa
  const emailChannels = whatsapps.filter(w =>
    w.status === "CONNECTED" && AVULSA_EMAIL_CHANNEL_TYPES.includes((w.type ?? "").toLowerCase())
  );

  // Avisos de variável: o servidor acha o contato pelo e-mail só com 1 destinatário;
  // sem atendimento, {{user}} é quem envia e protocolo/atendimento saem vazios.
  const quickReplyWarnings = useMemo(() => {
    const recipient = singleRecipientEmail(to, cc, bcc);
    const contactEmail = (opp?.contact?.email ?? "").trim().toLowerCase();
    return {
      contactKnown: !!recipient && !!contactEmail && recipient === contactEmail && nameHasLetter(opp?.contact?.name),
      ownerKnown: true,
      ticketVarsEmpty: true,
      channel: "email" as const,
    };
  }, [to, cc, bcc, opp?.contact?.email, opp?.contact?.name]);

  useEffect(() => {
    if (open && opp) {
      setTo(opp.contact?.email ?? "");
      setChannelId(emailChannels.length === 1 ? String(emailChannels[0].id) : "");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      setFiles([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opp]);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  async function handleSend() {
    if (!channelId) { toast.error(t("emailChannelRequired")); return; }
    if (!to.trim()) { toast.error(t("emailToRequired")); return; }
    if (!subject.trim()) { toast.error(t("emailSubjectRequired")); return; }
    if (!body.trim()) { toast.error(t("emailBodyRequired")); return; }
    setLoading(true);
    try {
      const ccList = cc.trim() ? cc.split(",").map(e => e.trim()).filter(Boolean) : undefined;
      const bccList = bcc.trim() ? bcc.split(",").map(e => e.trim()).filter(Boolean) : undefined;
      const attachments = files.length > 0
        ? await Promise.all(files.map(async f => ({
            filename: f.name.replace(/\s+/g, "_"),
            content: await readFileAsBase64(f),
            contentType: f.type || undefined,
          })))
        : undefined;
      await sendEmailWebmail(Number(channelId), {
        to: to.trim(),
        subject: subject.trim(),
        text: body.trim(),
        ...(ccList?.length && { cc: ccList }),
        ...(bccList?.length && { bcc: bccList }),
        ...(attachments?.length && { attachments }),
        // Variáveis da mensagem rápida trocadas no servidor (backend antigo ignora)
        applyVariables: true,
      });
      toast.success(t("emailSentOk"));
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        ?? (e as Error).message
        ?? t("emailSentError");
      toast.error(String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />{t("emailModalTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          {/* Canal de e-mail (webmail ou e-mail) */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailChannel")}</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue placeholder={t("emailChannelPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {emailChannels.length === 0
                  ? <SelectItem value="__none" disabled>{t("noWebmailSessions")}</SelectItem>
                  : emailChannels.map(w => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>

          {/* Para */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailTo")} *</Label>
            <Input value={to} onChange={e => setTo(e.target.value)} placeholder="email@exemplo.com" />
          </div>

          {/* CC */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailCc")}</Label>
            <Input value={cc} onChange={e => setCc(e.target.value)} placeholder={t("emailCcPlaceholder")} />
          </div>

          {/* CCO */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailBcc")}</Label>
            <Input value={bcc} onChange={e => setBcc(e.target.value)} placeholder={t("emailBccPlaceholder")} />
          </div>

          {/* Assunto */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailSubject")} *</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t("emailSubjectPlaceholder")} />
          </div>

          {/* Mensagem */}
          <div>
            <Label htmlFor="funil-email-body" className="text-xs mb-1 block">{t("emailBody")} *</Label>
            <QuickReplyTextarea
              id="funil-email-body"
              value={body}
              onChange={setBody}
              quickReplies={quickReplies}
              quickRepliesLoading={quickRepliesLoading}
              placeholder={t("emailBodyPlaceholder")}
              textareaRows={5}
              className="resize-none"
              warnings={quickReplyWarnings}
            />
          </div>

          {/* Anexos */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailAttachments")}</Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={e => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                setFiles(prev => [...prev, ...list].slice(0, 10));
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-3.5 w-3.5" />{t("emailAttachBtn")}
            </Button>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 bg-muted/50">
                    <span className="truncate flex-1 min-w-0 text-xs">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={handleSend} disabled={loading || !channelId || !to.trim() || !subject.trim() || !body.trim()}>
            {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Opportunity Card ─────────────────────────────────────────────────────────

interface OpportunityCardProps {
  opp: Opportunity;
  isRestricted: boolean;
  onClick: () => void;
  onDelete: () => void;
  onSendMessage?: () => void;
  onSendEmail?: () => void;
  onTicketClick: () => void;
  canStartTicket: boolean;
  ticketLoading?: boolean;
}

// Card enxuto (D9): no topo enviar mensagem, e-mail, espiar e "⋯"; embaixo o selo do
// atendimento. Os diálogos de atendimento vivem uma vez na página, nunca no card.
function OpportunityCardComp({
  opp, isRestricted, onClick, onDelete, onSendMessage, onSendEmail, onTicketClick, canStartTicket, ticketLoading,
}: OpportunityCardProps) {
  const t = useTranslations("funilKanbanPage");
  const tCrm = useTranslations("contactCrm");
  const router = useRouter();
  // PLANO_CRM_CONTATO F1 (D16): perfil do contato a partir do card; restrito nao tem acesso ao perfil
  const profileContactId = opp.contact?.id ?? opp.contactId;
  const { isLiveMode } = useLiveMode();
  const { formatMoney } = useRegion();
  // Restrito (D16): nome cortado em 5 letras e sem número, como no painel do atendimento
  const contactName = restrictedContactName(opp.contact?.name, isRestricted);
  const contactIdentity = !isRestricted && opp.contact ? displayContactIdentity(opp.contact) : "";
  return (
    <Card
      className="cursor-pointer hover:-translate-y-0.5 transition-transform border border-border/60 mb-2"
      onClick={(e) => {
        // Clique dentro de portal (menu, espiar) sobe pela árvore do React até aqui
        if (!(e.currentTarget as HTMLElement).contains(e.target as Node)) return;
        onClick();
      }}
    >
      <CardContent className="p-3 flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusColor(opp.status)}`}>
            {statusLabel(opp.status, t)}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {!isRestricted && opp.contact?.number && onSendMessage && (
              <button
                type="button"
                className="text-muted-foreground hover:text-green-600 transition-colors"
                onClick={e => { e.stopPropagation(); onSendMessage(); }}
                title={t("sendMessage")}
                aria-label={t("sendMessage")}
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </button>
            )}
            {!isRestricted && opp.contact?.email && onSendEmail && (
              <button
                type="button"
                className="text-muted-foreground hover:text-blue-600 transition-colors"
                onClick={e => { e.stopPropagation(); onSendEmail(); }}
                title={t("sendEmail")}
                aria-label={t("sendEmail")}
              >
                <Mail className="h-3.5 w-3.5" />
              </button>
            )}
            {opp.contact?.id && (
              <SpyContactMessagesPopover contactId={opp.contact.id} contactName={contactName}>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-cyan-600 transition-colors"
                  onClick={e => e.stopPropagation()}
                  title={t("viewTickets")}
                  aria-label={t("viewTickets")}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </SpyContactMessagesPopover>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={e => e.stopPropagation()}
                  title={t("moreActions")}
                  aria-label={t("moreActions")}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              {/* Menu em portal: clique e toque subiriam pela árvore do React até o card
                  (abrindo a ficha) e até o wrapper do arrastar */}
              <DropdownMenuContent
                align="end"
                className="min-w-[10rem]"
                onClick={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
              >
                {!!profileContactId && !isRestricted && (
                  <DropdownMenuItem onClick={() => router.push(`/contatos/${profileContactId}`)}>
                    <UserRound className="mr-2 h-4 w-4" />
                    {tCrm("viewProfile")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("deleteAction")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Title & Value */}
        <div>
          <p className="text-sm font-semibold leading-snug">#{opp.id} - {opp.name}</p>
          <p className="text-sm font-bold text-green-600 mt-0.5">{formatValue(opp.value, formatMoney)}</p>
        </div>

        {/* Contact */}
        {opp.contact && (
          <div className="flex items-center gap-2">
            <ContactAvatar
              name={contactName}
              profilePicUrl={opp.contact.profilePicUrl}
              sizeClassName="w-7 h-7 shrink-0"
              fallbackClassName="bg-primary/20 text-primary text-xs font-bold"
              blur={isLiveMode}
            />
            <div className="min-w-0">
              {contactName && (
                <div className={cn("flex items-center gap-1 text-xs text-muted-foreground truncate", isLiveMode && "live-blur-text")}>
                  <User className="h-3 w-3 shrink-0" />{contactName}
                </div>
              )}
              {contactIdentity && (
                <div className={cn("flex items-center gap-1 text-xs text-muted-foreground truncate", isLiveMode && "live-blur-text")}>
                  <Phone className="h-3 w-3 shrink-0" />{contactIdentity}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer dates */}
        <div className="flex flex-col gap-0.5">
          {opp.closingForecast && (
            <div className={`flex items-center gap-1 text-xs ${isUrgent(opp.closingForecast) ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
              <Calendar className="h-3 w-3" />
              {t("closingLabel")} {formatDateUTC(opp.closingForecast)}
            </div>
          )}
          {opp.createdAt && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {t("createdLabel")} {formatDateUTC(opp.createdAt)}
            </div>
          )}
        </div>

        {/* Selo do atendimento + Abrir/Iniciar (D1, D9); sem contato o selo não aparece */}
        <OpportunityTicketBadge
          variant="card"
          contact={opp.contact}
          onClick={onTicketClick}
          canStart={canStartTicket}
          loading={ticketLoading}
        />
      </CardContent>
    </Card>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: Filters;
  onFiltersChange: (f: Partial<Filters>) => void;
  onApply: () => void;
  onClear: () => void;
  stages: Stage[];
  responsaveis: Responsible[];
  tagsList: TagOption[];
  walletsList: WalletOption[];
  kanbansList: KanbanOption[];
}

// O funil saiu daqui: é o seletor do topo, sempre visível (D4).
function FilterBar({ filters, onFiltersChange, onApply, onClear, stages, responsaveis, tagsList, walletsList, kanbansList }: FilterBarProps) {
  const t = useTranslations("funilKanbanPage");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("funilKanbanFiltersOpen") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("funilKanbanFiltersOpen", String(isOpen));
    } catch {
      // sem armazenamento: o painel só não lembra se estava aberto
    }
  }, [isOpen]);

  useEffect(() => () => {
    if (searchRef.current) clearTimeout(searchRef.current);
  }, []);

  // O funil escolhido não conta como filtro (não dá para "tirar" o funil)
  const activeCount = useMemo(() => {
    let c = 0;
    if (filters.stageId != null) c++;
    if (filters.responsibleId != null) c++;
    // "open" é o status default — não conta como filtro ativo
    if (filters.status && filters.status !== "open") c++;
    if (filters.valorMin != null) c++;
    if (filters.valorMax != null) c++;
    if (filters.dataInicio) c++;
    if (filters.dataFim) c++;
    if (filters.tagId != null) c++;
    if (filters.walletUserId != null) c++;
    if (filters.kanbanId != null) c++;
    return c;
  }, [filters]);

  // Só as etapas do funil escolhido
  const filteredStages = filters.pipelineId != null
    ? stages.filter(s => String(s.pipelineId) === String(filters.pipelineId))
    : [];

  function handleSearchChange(val: string) {
    onFiltersChange({ searchTerm: val });
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => onApply(), 500);
  }

  return (
    <div className="border rounded-lg">
      {/* Toolbar sempre visível: busca + botão toggle */}
      <div className="flex items-center gap-2 p-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder={t("filterSearch")}
            value={filters.searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 shrink-0"
          onClick={() => setIsOpen(o => !o)}
          aria-expanded={isOpen}
        >
          <span className="text-xs">{t("moreFilters")}</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4">{activeCount}</Badge>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
        </Button>
      </div>

      {/* Painel recolhível */}
      {isOpen && (
      <div className="border-t p-4 space-y-3">
      {/* Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Etapa (do funil escolhido no topo) */}
        <div>
          <Label className="text-xs mb-1 block">{t("filterStage")}</Label>
          <Select
            value={filters.stageId ? String(filters.stageId) : "all"}
            onValueChange={v => {
              onFiltersChange({ stageId: v === "all" ? null : Number(v) });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAllF")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAllF")}</SelectItem>
              {filteredStages.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Responsável */}
        <div>
          <Label className="text-xs mb-1 block">{t("filterResponsible")}</Label>
          <Select
            value={filters.responsibleId ? String(filters.responsibleId) : "all"}
            onValueChange={v => {
              onFiltersChange({ responsibleId: v === "all" ? null : Number(v) });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              {responsaveis.map(r => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div>
          <Label className="text-xs mb-1 block">{t("filterStatus")}</Label>
          <Select
            value={filters.status || "all"}
            onValueChange={v => {
              onFiltersChange({ status: v === "all" ? "" : v });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              <SelectItem value="open">{t("statusOpen")}</SelectItem>
              <SelectItem value="win">{t("statusWin")}</SelectItem>
              <SelectItem value="lose">{t("statusLose")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 1b — Tag / Carteira / Kanban (filtros via contato) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs mb-1 block">{t("filterTag")}</Label>
          <Select
            value={filters.tagId ? String(filters.tagId) : "all"}
            onValueChange={v => {
              onFiltersChange({ tagId: v === "all" ? null : Number(v) });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              {tagsList.map(tg => (
                <SelectItem key={tg.id} value={String(tg.id)}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: tg.color || "#3B82F6" }} />
                    {tg.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("filterWallet")}</Label>
          <Select
            value={filters.walletUserId ? String(filters.walletUserId) : "all"}
            onValueChange={v => {
              onFiltersChange({ walletUserId: v === "all" ? null : Number(v) });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              {walletsList.map(w => (
                <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("filterKanban")}</Label>
          <Select
            value={filters.kanbanId ? String(filters.kanbanId) : "all"}
            onValueChange={v => {
              onFiltersChange({ kanbanId: v === "all" ? null : Number(v) });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              {kanbansList.map(k => (
                <SelectItem key={k.id} value={String(k.id)}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: k.color || "#9CA3AF" }} />
                    {k.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3 – Values & Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs mb-1 block">{t("filterMinValue")}</Label>
          <Input
            type="number" className="h-8 text-xs"
            placeholder="0"
            value={filters.valorMin ?? ""}
            onChange={e => onFiltersChange({ valorMin: e.target.value ? Number(e.target.value) : null })}
            onBlur={onApply}
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("filterMaxValue")}</Label>
          <Input
            type="number" className="h-8 text-xs"
            placeholder="0"
            value={filters.valorMax ?? ""}
            onChange={e => onFiltersChange({ valorMax: e.target.value ? Number(e.target.value) : null })}
            onBlur={onApply}
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("filterStartDate")}</Label>
          <Input
            type="date" className="h-8 text-xs"
            value={filters.dataInicio ?? ""}
            onChange={e => { onFiltersChange({ dataInicio: e.target.value || null }); setTimeout(onApply, 0); }}
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("filterEndDate")}</Label>
          <Input
            type="date" className="h-8 text-xs"
            value={filters.dataFim ?? ""}
            onChange={e => { onFiltersChange({ dataFim: e.target.value || null }); setTimeout(onApply, 0); }}
          />
        </div>
      </div>

      {/* Row 4 – Buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>{t("clearFilters")}</Button>
        <Button size="sm" onClick={onApply}>
          <Search className="mr-1 h-3.5 w-3.5" />{t("filter")}
        </Button>
      </div>
      </div>
      )}
    </div>
  );
}

// ─── Main Kanban Page ─────────────────────────────────────────────────────────

// pipelineId aqui é sempre o funil escolhido no seletor do topo (um funil por vez, D4).
const DEFAULT_FILTERS: Filters = {
  pipelineId: null,
  stageId: null,
  responsibleId: null,
  status: "open",
  valorMin: null,
  valorMax: null,
  dataInicio: null,
  dataFim: null,
  searchTerm: "",
  ordenacao: "data_desc",
  tagId: null,
  walletUserId: null,
  kanbanId: null,
};

const DEFAULT_PAGINATION: Pagination = { page: 1, limit: 100, total: 0 };

// Último funil escolhido, por usuário: o logout não limpa chaves novas, e dois usuários
// no mesmo navegador não herdam o funil um do outro.
const PIPELINE_STORAGE_PREFIX = "funilKanbanPipeline:";

function readStoredPipelineId(userId: number | null | undefined): number | null {
  if (userId == null) return null;
  try {
    const raw = window.localStorage.getItem(`${PIPELINE_STORAGE_PREFIX}${userId}`);
    if (!raw || !/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeStoredPipelineId(userId: number | null | undefined, pipelineId: number) {
  if (userId == null) return;
  try {
    window.localStorage.setItem(`${PIPELINE_STORAGE_PREFIX}${userId}`, String(pipelineId));
  } catch {
    // navegador sem armazenamento: o quadro só não lembra o funil
  }
}

function positiveIntParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

// ?pipeline= (sempre) e &opportunity= (enquanto a ficha está aberta) sem passar pelo
// roteador: router.replace iria ao servidor (layout raiz com revalidate = 0).
function syncBoardUrl(pipelineId: number | null, opportunityId: number | null) {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (pipelineId != null) params.set("pipeline", String(pipelineId));
    else params.delete("pipeline");
    if (opportunityId != null) params.set("opportunity", String(opportunityId));
    else params.delete("opportunity");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(null, "", next);
  } catch {
    // a URL é só o link para colar; nunca derruba o quadro
  }
}

/** 1ª etapa do funil pela ordem (a nova oportunidade nasce nela) */
function firstStageOf(stages: Stage[], pipelineId: number | null): number | null {
  if (pipelineId == null) return null;
  const sorted = stages
    .filter(s => Number(s.pipelineId) === Number(pipelineId))
    .sort((a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || Number(a.id) - Number(b.id));
  return sorted[0]?.id ?? null;
}

interface BoardLookups {
  pipelines: Pipeline[];
  stages: Stage[];
}

export default function FunilKanbanPage() {
  // Gate isolado num wrapper: sair com `return` no meio dos hooks do conteúdo
  // quebrava o React ("Rendered fewer hooks than expected") quando a permissão
  // caía com a página montada — o teto do tenant chega após o 1º render.
  const allowed = usePageAccess("funil", { alsoAccept: ["kanban"] });
  if (!allowed) return <AccessDenied />;
  return <FunilKanbanPageContent />;
}

function FunilKanbanPageContent() {
  const t = useTranslations("funilKanbanPage");
  const tCommon = useTranslations("common");
  const { user, supervisorAdmin } = useAuthStore();
  const isRestricted = useAuthStore((s) => s.isRestrictedUser());
  // Perfil personalizado sem "criar atendimento" nem "envio em massa": o /individual recusa (D12)
  const canStartConversation = useAuthStore((s) => s.canStartConversation());
  const { formatMoney, country: regionCountry } = useRegion();
  // Funil escolhido resolvido (URL, salvo ou padrão) antes da 1ª busca de oportunidades
  const [pipelineReady, setPipelineReady] = useState(false);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [oppsLoading, setOppsLoading] = useState(false);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsible[]>([]);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [pagination, setPagination] = useState<Pagination>({ ...DEFAULT_PAGINATION });

  // Valores atuais para quem roda fora do render (timers do FilterBar, ficha, fluxo de
  // atendimento). O setTimeout do FilterBar chamava o onApply do render anterior e
  // aplicava o filtro de antes (a busca ficava sem a última letra).
  const filtersRef = useRef<Filters>(filters);
  const paginationRef = useRef<Pagination>(pagination);
  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { paginationRef.current = pagination; }, [pagination]);

  const updateFilters = useCallback((next: Filters) => {
    filtersRef.current = next;
    setFilters(next);
  }, []);
  const updatePagination = useCallback((next: Pagination) => {
    paginationRef.current = next;
    setPagination(next);
  }, []);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollBoard = useCallback((dir: -1 | 1) => {
    const el = boardRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: "smooth" });
  }, []);

  // Auto-scroll horizontal nas bordas do board durante o drag — o DnD nativo
  // do HTML5 nao rola containers com overflow, entao arrastar um card para uma
  // etapa fora da viewport exigia soltar no meio do caminho. Loop rAF unico
  // (guard em autoScrollRaf) com delta proporcional a proximidade da borda.
  const autoScrollRaf = useRef<number | null>(null);
  const autoScrollDelta = useRef(0);

  const stopEdgeAutoScroll = useCallback(() => {
    autoScrollDelta.current = 0;
    if (autoScrollRaf.current !== null) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }, []);

  const updateEdgeAutoScroll = useCallback((clientX: number) => {
    const el = boardRef.current;
    if (!el) return;
    const EDGE = 80; // px da borda que ativa o auto-scroll
    const MIN_STEP = 8; // px/frame ao entrar na zona
    const MAX_STEP = 20; // px/frame colado na borda
    const rect = el.getBoundingClientRect();
    let delta = 0;
    if (clientX < rect.left + EDGE) {
      const ratio = Math.min(1, (rect.left + EDGE - clientX) / EDGE);
      delta = -(MIN_STEP + (MAX_STEP - MIN_STEP) * ratio);
    } else if (clientX > rect.right - EDGE) {
      const ratio = Math.min(1, (clientX - (rect.right - EDGE)) / EDGE);
      delta = MIN_STEP + (MAX_STEP - MIN_STEP) * ratio;
    }
    autoScrollDelta.current = delta;
    if (delta === 0) {
      stopEdgeAutoScroll();
      return;
    }
    if (autoScrollRaf.current !== null) return; // loop ja ativo — so atualiza o delta
    const step = () => {
      const container = boardRef.current;
      if (!container || autoScrollDelta.current === 0) {
        autoScrollRaf.current = null;
        return;
      }
      container.scrollLeft += autoScrollDelta.current;
      autoScrollRaf.current = requestAnimationFrame(step);
    };
    autoScrollRaf.current = requestAnimationFrame(step);
  }, [stopEdgeAutoScroll]);

  // Cancela o loop de auto-scroll no unmount
  useEffect(() => stopEdgeAutoScroll, [stopEdgeAutoScroll]);

  // Google Agenda na casca: o diálogo de criar fecha antes da pergunta "criar evento?"
  const gcal = useOpportunityCalendarEvent();
  const pendingEventRef = useRef<OpportunityEventData | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Ficha da oportunidade (clique no card, alertas e ?opportunity=)
  const [sheetOpp, setSheetOpp] = useState<Opportunity | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<Opportunity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [whatsapps, setWhatsapps] = useState<Whatsapp[]>([]);
  const allowedWhatsapps = useMemo(() => {
    const isAdminLike = user?.profile === "admin" || (user?.profile === "super" && supervisorAdmin !== "enabled");
    if (isAdminLike) return whatsapps;
    const allowedList = user?.whatsappAllowed as { id: number }[] | undefined;
    if (!allowedList || !Array.isArray(allowedList) || allowedList.length === 0) return whatsapps;
    const allowedIds = allowedList.map((a) => a.id);
    return whatsapps.filter((w) => allowedIds.includes(w.id));
  }, [whatsapps, user?.profile, user?.whatsappAllowed, supervisorAdmin]);
  const [tagsList, setTagsList] = useState<TagOption[]>([]);
  const [walletsList, setWalletsList] = useState<WalletOption[]>([]);
  const [kanbansList, setKanbansList] = useState<KanbanOption[]>([]);
  const [msgModal, setMsgModal] = useState<{ open: boolean; opp: Opportunity | null }>({ open: false, opp: null });
  const [emailModal, setEmailModal] = useState<{ open: boolean; opp: Opportunity | null }>({ open: false, opp: null });
  const [exportTipo, setExportTipo] = useState<"oportunidades" | "pipelines" | "etapas" | "">("");

  // Drag-and-drop state
  const [draggingOpp, setDraggingOpp] = useState<Opportunity | null>(null);
  const [dragOverStage, setDragOverStage] = useState<number | null>(null);

  // Listas de apoio: só na abertura e no "Atualizar" (antes iam junto a cada filtro)
  const loadLookups = useCallback(async (): Promise<BoardLookups | null> => {
    setLookupsLoading(true);
    try {
      const [stagesRes, pipesRes, usersRes, whatsRes, tagsRes, walletsRes, kanbansRes] = await Promise.all([
        fetchStages({ page: 1, limit: 1000 }),
        fetchPipelines(),
        fetchAllUsers(),
        fetchWhatsapps(),
        fetchTags().catch(() => ({ data: [] as TagOption[] })),
        fetchWallets().catch(() => ({ data: [] as WalletOption[] })),
        fetchKanbans().catch(() => ({ data: [] as KanbanOption[] })),
      ]);

      const rawStages: Stage[] = stagesRes.data?.data ?? (Array.isArray(stagesRes.data) ? stagesRes.data : []);
      setStages(rawStages);

      const rawPipes: Pipeline[] = pipesRes.data?.data ?? (Array.isArray(pipesRes.data) ? pipesRes.data : []);
      setPipelines(rawPipes);

      const rawUsers = usersRes.data?.users ?? (Array.isArray(usersRes.data) ? usersRes.data : []);
      setResponsaveis(
        rawUsers
          .filter((u: { profile: string }) => u.profile !== "superadmin")
          .map((u: { id: number; name: string }) => ({ label: u.name, value: u.id }))
      );

      const rawWhats = Array.isArray(whatsRes.data) ? whatsRes.data : [];
      setWhatsapps(rawWhats);

      setTagsList(Array.isArray(tagsRes.data) ? tagsRes.data : []);
      setWalletsList(Array.isArray(walletsRes.data) ? walletsRes.data : []);
      setKanbansList(Array.isArray(kanbansRes.data) ? kanbansRes.data : []);
      return { pipelines: rawPipes, stages: rawStages };
    } catch {
      toast.error(t("loadError"));
      return null;
    } finally {
      setLookupsLoading(false);
    }
  }, [t]);

  // Oportunidades do funil escolhido: 1 request por filtro/funil/página/gravação.
  // Só a resposta da última busca vale (troca rápida de filtro não volta atrás).
  const oppsRequestSeq = useRef(0);
  const loadOpportunities = useCallback(async (f: Filters, pg: Pagination) => {
    const seq = ++oppsRequestSeq.current;
    if (f.pipelineId == null) {
      setOpportunities([]);
      setPagination(p => ({ ...p, total: 0 }));
      setOppsLoading(false);
      return;
    }
    setOppsLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: pg.page,
        limit: pg.limit,
        ordenacao: f.ordenacao,
        pipelineId: f.pipelineId,
        // Includes opt-in: tags/carteiras/kanban do contato e o atendimento ativo (selo do card).
        // Backend antigo descarta `activeTicket` e o card fica sem selo.
        include: "tags,wallets,kanban,activeTicket",
      };
      if (f.stageId) params.stageId = f.stageId;
      if (f.responsibleId) params.responsibleId = f.responsibleId;
      if (f.status) params.status = f.status;
      if (f.valorMin != null) params.valorMin = f.valorMin;
      if (f.valorMax != null) params.valorMax = f.valorMax;
      if (f.dataInicio) params.startDate = f.dataInicio;
      if (f.dataFim) params.endDate = f.dataFim;
      if (f.searchTerm) params.searchTerm = f.searchTerm;
      if (f.tagId) params.tagId = f.tagId;
      if (f.walletUserId) params.walletUserId = f.walletUserId;
      if (f.kanbanId) params.kanbanId = f.kanbanId;

      const oppsRes = await fetchOpportunities(params);
      if (seq !== oppsRequestSeq.current) return;
      const rawOpps: Opportunity[] = oppsRes.data?.data ?? (Array.isArray(oppsRes.data) ? oppsRes.data : []);
      setOpportunities(rawOpps.map((o) => normalizeOpportunity(o)));
      setPagination(p => ({ ...p, total: oppsRes.data?.pagination?.total ?? rawOpps.length }));
    } catch {
      if (seq === oppsRequestSeq.current) toast.error(t("loadError"));
    } finally {
      if (seq === oppsRequestSeq.current) setOppsLoading(false);
    }
  }, [t]);

  const reloadOpportunities = useCallback(
    () => loadOpportunities(filtersRef.current, paginationRef.current),
    [loadOpportunities]
  );

  // Abertura: URL e funil resolvidos UMA vez (o ref segura o StrictMode e as trocas de
  // dependência). Ordem: ?opportunity= → ?pipeline= → salvo do usuário → mais antigo com etapas.
  const initDoneRef = useRef(false);
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;
    (async () => {
      let deepOppId: number | null = null;
      let urlPipelineId: number | null = null;
      try {
        const params = new URLSearchParams(window.location.search);
        deepOppId = positiveIntParam(params, "opportunity");
        urlPipelineId = positiveIntParam(params, "pipeline");
      } catch {
        // sem URL legível: segue pelo salvo/padrão
      }
      const deepOppPromise: Promise<Opportunity | null> = deepOppId != null
        ? fetchOpportunity(deepOppId, { include: "activeTicket" })
          .then((res) => {
            const data = res?.data as Opportunity | undefined;
            return data && typeof data === "object" && data.id ? normalizeOpportunity(data) : null;
          })
          .catch(() => null)
        : Promise.resolve(null);
      const [lookups, deepOpp] = await Promise.all([loadLookups(), deepOppPromise]);
      if (deepOppId != null && !deepOpp) toast.error(t("opportunityNotFound"));

      const pipes = lookups?.pipelines ?? [];
      const inList = (id: number | null | undefined) =>
        id != null && pipes.some(p => Number(p.id) === Number(id));
      let pipelineId: number | null = null;
      if (deepOpp && inList(deepOpp.pipelineId)) pipelineId = Number(deepOpp.pipelineId);
      else if (inList(urlPipelineId)) pipelineId = urlPipelineId;
      else {
        const stored = readStoredPipelineId(useAuthStore.getState().user?.userId);
        if (inList(stored)) pipelineId = stored;
      }
      if (pipelineId == null) pipelineId = pickDefaultPipeline(pipes, lookups?.stages ?? [])?.id ?? null;

      const f: Filters = { ...filtersRef.current, pipelineId, stageId: null };
      updateFilters(f);
      if (deepOpp) {
        setSheetOpp(deepOpp);
        setSheetOpen(true);
      }
      setPipelineReady(true);
      loadOpportunities(f, paginationRef.current);
    })();
  }, [loadLookups, loadOpportunities, updateFilters, t]);

  // URL acompanha o funil e a ficha aberta (link para colar)
  const openSheetId = sheetOpen ? sheetOpp?.id ?? null : null;
  useEffect(() => {
    if (!pipelineReady) return;
    syncBoardUrl(filters.pipelineId, openSheetId);
  }, [pipelineReady, filters.pipelineId, openSheetId]);

  // Atendimento ativo relido no clique do selo: corrige o contato no card e na ficha
  const handleActiveTicketRefreshed = useCallback((opportunityId: number, contact: OpportunityContact) => {
    // Mesmo contato: mantém etiquetas/carteiras/kanban que só a lista traz. Contato trocado
    // por outra pessoa depois da carga: substitui, sem misturar dados dos dois.
    const merge = (o: Opportunity): Opportunity => ({
      ...o,
      contact: o.contact && Number(o.contact.id) === Number(contact.id) ? { ...o.contact, ...contact } : contact,
    });
    setOpportunities(list => list.map(o => (o.id === opportunityId ? merge(o) : o)));
    setSheetOpp(cur => (cur && cur.id === opportunityId ? merge(cur) : cur));
  }, []);
  const ticketFlow = useOpportunityTicketFlow({ onActiveTicketRefreshed: handleActiveTicketRefreshed });

  const openSheet = useCallback((opp: Opportunity) => {
    setSheetOpp(opp);
    setSheetOpen(true);
  }, []);

  // Ficha gravou: mesma oportunidade (já com o contato preservado) na lista e na ficha
  const handleOppChanged = useCallback((opp: Opportunity) => {
    setOpportunities(list => list.map(o => (o.id === opp.id ? opp : o)));
    setSheetOpp(cur => (cur && cur.id === opp.id ? opp : cur));
  }, []);

  const handleOppDeleted = useCallback((id: number) => {
    setOpportunities(list => list.filter(o => o.id !== id));
    setSheetOpen(false);
    loadOpportunities(filtersRef.current, paginationRef.current);
  }, [loadOpportunities]);

  // Etapas do funil escolhido (nunca mais as de todos os funis misturadas)
  const etapasVisiveis = useMemo(() => {
    if (filters.pipelineId == null) return [] as Stage[];
    const doFunil = stages.filter(s => Number(s.pipelineId) === Number(filters.pipelineId));
    if (filters.stageId != null) return doFunil.filter(s => Number(s.id) === Number(filters.stageId));
    return doFunil;
  }, [stages, filters.pipelineId, filters.stageId]);

  const createDefaultStageId = useMemo(
    () => firstStageOf(stages, filters.pipelineId),
    [stages, filters.pipelineId]
  );

  function oppsForStage(stageId: number) {
    return opportunities.filter(o => Number(o.stageId) === Number(stageId));
  }

  const totalPages = Math.ceil(pagination.total / pagination.limit) || 1;

  // Paginação ativa: somas por coluna cobrem só a página carregada — o header
  // de cada lane sinaliza "nesta página" p/ não parecer total global.
  const isPartialPage = pagination.total > opportunities.length;

  function applyFilters(newFilters: Filters) {
    const pg = { ...paginationRef.current, page: 1 };
    updatePagination(pg);
    loadOpportunities(newFilters, pg);
  }

  function handleFilterChange(partial: Partial<Filters>) {
    updateFilters({ ...filtersRef.current, ...partial });
  }

  // "Limpar filtros" mantém o funil escolhido
  function handleClearFilters() {
    const cleared: Filters = { ...DEFAULT_FILTERS, pipelineId: filtersRef.current.pipelineId };
    updateFilters(cleared);
    applyFilters(cleared);
  }

  function handleApplyFilters() {
    applyFilters(filtersRef.current);
  }

  // Trocar de funil: lembra a escolha, zera etapa e página e busca só as oportunidades
  function handlePipelineChange(pipelineId: number) {
    if (Number(filtersRef.current.pipelineId) === Number(pipelineId)) return;
    writeStoredPipelineId(useAuthStore.getState().user?.userId, pipelineId);
    const f: Filters = { ...filtersRef.current, pipelineId, stageId: null };
    updateFilters(f);
    setOpportunities([]);
    applyFilters(f);
  }

  async function handleRefresh() {
    const [lookups] = await Promise.all([
      loadLookups(),
      loadOpportunities(filtersRef.current, paginationRef.current),
    ]);
    if (!lookups) return;
    const cur = filtersRef.current;
    const pipelineOk = cur.pipelineId != null && lookups.pipelines.some(p => Number(p.id) === Number(cur.pipelineId));
    if (pipelineOk) {
      // Etapa filtrada que deixou de existir: volta para todas as etapas do funil
      const stageOk = cur.stageId == null || lookups.stages.some(s =>
        Number(s.id) === Number(cur.stageId) && Number(s.pipelineId) === Number(cur.pipelineId));
      if (!stageOk) {
        const f: Filters = { ...cur, stageId: null };
        updateFilters(f);
        applyFilters(f);
      }
      return;
    }
    // Funil escolhido apagado (ou a 1ª carga falhou): salvo do usuário, senão o padrão
    const stored = readStoredPipelineId(useAuthStore.getState().user?.userId);
    const pipelineId = stored != null && lookups.pipelines.some(p => Number(p.id) === stored)
      ? stored
      : pickDefaultPipeline(lookups.pipelines, lookups.stages)?.id ?? null;
    const f: Filters = { ...cur, pipelineId, stageId: null };
    updateFilters(f);
    setOpportunities([]);
    applyFilters(f);
  }

  function handleExportCSV() {
    let headers: string[] = [];
    let linhas: string[][] = [];

    if (exportTipo === "oportunidades") {
      if (!opportunities.length) { toast.warning(t("exportNoData")); return; }
      // Colunas legiveis: o contato e um objeto aninhado (virava "[object Object]")
      // e funil/etapa/responsavel chegam como id \u2014 resolvidos aqui pelas listas ja
      // carregadas na tela, sem consulta extra.
      headers = [
        "id", "name", "value", "description", "status",
        "pipeline", "stage", "responsible",
        "contactName", "contactNumber", "contactEmail",
        "closingForecast", "createdAt", "updatedAt",
      ];
      linhas = opportunities.map(o => {
        const pipeline = pipelines.find(p => String(p.id) === String(o.pipelineId));
        const stage = stages.find(s => String(s.id) === String(o.stageId));
        const responsavel = responsaveis.find(r => String(r.value) === String(o.responsibleId));
        return [
          String(o.id),
          o.name ?? "",
          csvDecimal(o.value, regionCountry),
          o.description ?? "",
          statusLabel(o.status, t),
          pipeline?.name ?? (o.pipelineId ? String(o.pipelineId) : ""),
          stage?.name ?? (o.stageId ? String(o.stageId) : ""),
          responsavel?.label ?? (o.responsibleId ? String(o.responsibleId) : ""),
          o.contact?.name ?? "",
          csvPhoneCell(displayContactIdentity(o.contact)),
          o.contact?.email ?? "",
          formatDateUTC(o.closingForecast),
          formatDateUTC(o.createdAt),
          formatDateUTC(o.updatedAt),
        ];
      });
    } else if (exportTipo === "pipelines" || exportTipo === "etapas") {
      const dados = (exportTipo === "pipelines" ? pipelines : stages) as unknown as Record<string, unknown>[];
      if (!dados.length) { toast.warning(t("exportNoData")); return; }
      // Uniao das chaves: campo ausente na 1a linha deixava a coluna de fora do arquivo.
      headers = Array.from(new Set(dados.flatMap(d => Object.keys(d))));
      linhas = dados.map(d => headers.map(k => {
        const v = d[k];
        if (v === null || v === undefined) return "";
        return typeof v === "object" ? JSON.stringify(v) : String(v);
      }));
    } else {
      return;
    }

    const sep = csvDelimiter(regionCountry);
    const rows = [headers.join(sep), ...linhas.map(l => l.map(csvEscape).join(sep))];
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportTipo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openCreateForm() {
    pendingEventRef.current = null;
    setCreateOpen(true);
  }

  const handleCreated = useCallback((data: OpportunityEventData) => {
    pendingEventRef.current = data;
  }, []);

  function handleCreateSaved() {
    setCreateOpen(false);
    reloadOpportunities();
    // Pergunta do Google Agenda depois de fechar o formulário (o hook vive aqui)
    const eventData = pendingEventRef.current;
    pendingEventRef.current = null;
    if (eventData) gcal.askToCreateEvent(eventData);
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteOpportunity(deleteConfirm.id);
      toast.success(t("deleteSuccess"));
      setDeleteConfirm(null);
      reloadOpportunities();
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setDeleting(false);
    }
  }

  // Touch drag-and-drop (segurar o card ~300 ms; antes disso o dedo rola a coluna)
  const { touchStart } = useTouchDrag<Opportunity>({
    dataAttr: "data-stage-id",
    // Touch: mesmo auto-scroll de borda do drag nativo, usando a posicao do dedo
    onMove: (clientX) => updateEdgeAutoScroll(clientX),
    onEnd: stopEdgeAutoScroll,
    onDrop: (opp, zoneId) => {
      const stageId = Number(zoneId);
      if (opp.stageId === stageId) return;
      const targetStage = stages.find(s => s.id === stageId);
      const payload = { ...opp, stageId, pipelineId: targetStage?.pipelineId ?? opp.pipelineId };
      setOpportunities(opps => opps.map(o => o.id === opp.id ? { ...o, stageId, pipelineId: payload.pipelineId } : o));
      updateOpportunity(opp.id, payload).catch(() => {
        toast.error(t("moveError"));
        reloadOpportunities();
      });
    },
  });

  // Drag-and-drop handlers
  function onDragStart(opp: Opportunity) {
    setDraggingOpp(opp);
  }

  function onDragOver(e: React.DragEvent, stageId: number) {
    e.preventDefault();
    setDragOverStage(stageId);
  }

  function onDragLeave() {
    setDragOverStage(null);
  }

  async function onDrop(stageId: number) {
    setDragOverStage(null);
    if (!draggingOpp || draggingOpp.stageId === stageId) { setDraggingOpp(null); return; }
    const targetStage = stages.find(s => s.id === stageId);
    const payload = {
      ...draggingOpp,
      stageId,
      pipelineId: targetStage?.pipelineId ?? draggingOpp.pipelineId,
    };
    // Optimistic update
    setOpportunities(opps => opps.map(o => o.id === draggingOpp.id ? { ...o, stageId, pipelineId: payload.pipelineId } : o));
    setDraggingOpp(null);
    try {
      await updateOpportunity(draggingOpp.id, payload);
      toast.success(t("moveSuccess"));
    } catch {
      toast.error(t("moveError"));
      reloadOpportunities();
    }
  }

  if (!pipelineReady) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0" />)}
      </div>
    );
  }

  const refreshing = lookupsLoading || oppsLoading;

  return (
    <div className="flex flex-col gap-2">
      <OpportunityAlerts
        opportunities={opportunities}
        onOpen={(id) => { const opp = opportunities.find((o) => o.id === id); if (opp) openSheet(opp); }}
      />
      {/* Top controls — funil + help + stats + ações + scroll na mesma linha */}
      <div className="flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <PipelineSelector
            pipelines={pipelines}
            value={filters.pipelineId}
            onChange={handlePipelineChange}
          />
          <PageHelp
            description={t("helpDesc")}
            sections={[
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), tCommon("touchDragHint"), t("helpS1I1"), t("helpS1I2")] },
              { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
              { title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1"), t("helpS3I2")] },
            ]}
          />
          <div className="flex items-center gap-1 min-w-0">
            <KanbanStatsChips opportunities={opportunities} paginationTotal={pagination.total} />
            {/* Números do topo (e alertas) são só do funil escolhido (D12) */}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("alertsScopeHint")}
                    className="text-muted-foreground/70 hover:text-foreground transition-colors shrink-0"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs font-normal">
                  {t("alertsScopeHint")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={exportTipo} onValueChange={v => setExportTipo(v as typeof exportTipo)}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder={t("exportLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oportunidades">{t("exportOpportunities")}</SelectItem>
              <SelectItem value="pipelines">{t("exportPipelines")}</SelectItem>
              <SelectItem value="etapas">{t("exportStages")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!exportTipo}>
            <Download className="mr-2 h-4 w-4" />
            {t("exportCSV")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
          <Button size="sm" onClick={openCreateForm}>
            <Plus className="mr-2 h-4 w-4" />
            {t("newOpportunity")}
          </Button>
          <div className="flex items-center gap-1 ml-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scrollBoard(-1)} aria-label={tCommon("scrollLeft")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scrollBoard(1)} aria-label={tCommon("scrollRight")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onFiltersChange={handleFilterChange}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
        stages={stages}
        responsaveis={responsaveis}
        tagsList={tagsList}
        walletsList={walletsList}
        kanbansList={kanbansList}
      />

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline" size="sm"
            disabled={pagination.page <= 1}
            onClick={() => {
              const pg = { ...pagination, page: pagination.page - 1 };
              updatePagination(pg);
              loadOpportunities(filtersRef.current, pg);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">{t("pageLabel")} {pagination.page} / {totalPages}</span>
          <Button
            variant="outline" size="sm"
            disabled={pagination.page >= totalPages}
            onClick={() => {
              const pg = { ...pagination, page: pagination.page + 1 };
              updatePagination(pg);
              loadOpportunities(filtersRef.current, pg);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Select
            value={String(pagination.limit)}
            onValueChange={v => {
              const pg = { ...pagination, limit: Number(v), page: 1 };
              updatePagination(pg);
              loadOpportunities(filtersRef.current, pg);
            }}
          >
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} {t("perPage")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Kanban Board */}
      <div
        ref={boardRef}
        className="flex gap-4 overflow-x-auto pb-2"
        style={{ scrollbarWidth: "thin", scrollbarGutter: "stable" }}
        onDragOver={(e) => updateEdgeAutoScroll(e.clientX)}
        onDragLeave={(e) => {
          // So para quando o ponteiro sai do container de fato (nao ao entrar em filho)
          const related = e.relatedTarget as Node | null;
          if (!related || !(e.currentTarget as HTMLElement).contains(related)) stopEdgeAutoScroll();
        }}
        onDrop={stopEdgeAutoScroll}
        onDragEnd={stopEdgeAutoScroll}
      >
        {etapasVisiveis.length === 0 ? (
          <div className="flex-1 text-center py-12 text-muted-foreground">
            {t("noStages")}
          </div>
        ) : (
          etapasVisiveis.map(stage => {
            const items = oppsForStage(stage.id);
            const isDragTarget = dragOverStage === stage.id;
            return (
              <div
                key={stage.id}
                className={`w-72 shrink-0 rounded-xl border p-3 flex flex-col h-[75vh] min-h-[500px] transition-all ${
                  isDragTarget ? "border-primary bg-primary/5 shadow-lg" : "border-border/40 bg-muted/20"
                }`}
                data-stage-id={stage.id}
                onDragOver={e => onDragOver(e, stage.id)}
                onDragLeave={onDragLeave}
                onDrop={() => onDrop(stage.id)}
              >
                {/* Column Header — fixo no topo da lane (flex shrink-0) */}
                <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b shrink-0">
                  <span className="font-semibold text-sm truncate">{stage.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="text-xs font-semibold text-green-600 tabular-nums"
                      title={isPartialPage ? t("statOnThisPage") : undefined}
                    >
                      {formatValue(items.reduce((s, o) => s + (Number(o.value) || 0), 0), formatMoney)}
                      {isPartialPage && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          ({t("statOnThisPage")})
                        </span>
                      )}
                    </span>
                    <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                  </div>
                </div>

                {/* Cards — scroll vertical dentro da lane */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-0" style={{ scrollbarWidth: "thin" }}>
                  {items.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-xs text-muted-foreground border border-dashed rounded-lg">
                      {t("dragHint")}
                    </div>
                  ) : (
                    items.map(opp => (
                      <div
                        key={opp.id}
                        draggable
                        // Eventos vindos de portal (espiar, menu "⋯") sobem pela árvore do React
                        // até aqui: só o que nasce dentro do card arrasta
                        onDragStart={(e) => {
                          if (!(e.currentTarget as HTMLElement).contains(e.target as Node)) return;
                          onDragStart(opp);
                        }}
                        // Soltar fora de uma etapa (ou Esc) nao chama onDrop: sem isto o card ficava apagado
                        onDragEnd={() => setDraggingOpp(null)}
                        onTouchStart={(e) => {
                          if (!(e.currentTarget as HTMLElement).contains(e.target as Node)) return;
                          touchStart(e, opp);
                        }}
                        className={`select-none [-webkit-touch-callout:none]${draggingOpp?.id === opp.id ? " opacity-50" : ""}`}
                      >
                        <OpportunityCardComp
                          opp={opp}
                          isRestricted={isRestricted}
                          onClick={() => openSheet(opp)}
                          onDelete={() => setDeleteConfirm(opp)}
                          onSendMessage={!isRestricted && canStartConversation && opp.contact?.number ? () => setMsgModal({ open: true, opp }) : undefined}
                          onSendEmail={!isRestricted && opp.contact?.email ? () => setEmailModal({ open: true, opp }) : undefined}
                          onTicketClick={() => ticketFlow.openFromOpportunity(opp)}
                          canStartTicket={ticketFlow.canStart(opp.contact)}
                          ticketLoading={ticketFlow.busyOpportunityId === opp.id}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        onClick={openCreateForm}
        title={t("newOpportunity")}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Nova oportunidade (só criação; editar é na ficha) */}
      <CreateOpportunityDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={handleCreateSaved}
        onCreated={handleCreated}
        pipelines={pipelines}
        stages={stages}
        responsaveis={responsaveis}
        defaultPipelineId={filters.pipelineId}
        defaultStageId={createDefaultStageId}
      />

      {/* Ficha da oportunidade (D5-D8) */}
      <OpportunitySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        opportunity={sheetOpp}
        pipelines={pipelines}
        stages={stages}
        responsaveis={responsaveis}
        isRestricted={isRestricted}
        ticketFlow={ticketFlow}
        gcal={gcal}
        onChanged={handleOppChanged}
        onReloadList={reloadOpportunities}
        onDeleted={handleOppDeleted}
        onSendMessage={isRestricted ? undefined : (o) => setMsgModal({ open: true, opp: o })}
        onSendEmail={isRestricted ? undefined : (o) => setEmailModal({ open: true, opp: o })}
      />

      {/* Send Message Modal */}
      <SendMessageModal
        open={msgModal.open}
        opp={msgModal.opp}
        whatsapps={allowedWhatsapps}
        onClose={() => setMsgModal({ open: false, opp: null })}
      />

      {/* Send Email Modal */}
      <SendEmailModal
        open={emailModal.open}
        opp={emailModal.opp}
        whatsapps={allowedWhatsapps}
        onClose={() => setEmailModal({ open: false, opp: null })}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={v => { if (!v) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("deleteConfirmMsg")} <strong>{deleteConfirm?.name}</strong>?
            {t("deleteConfirmNote")}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>{t("deleteNo")}</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {t("deleteYes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogos do atendimento e do Google Agenda: uma vez na página, fora de card e ficha
          (clique dentro de portal sobe pela árvore do React até o pai) */}
      {ticketFlow.dialogs}
      {gcal.dialogs}
    </div>
  );
}
