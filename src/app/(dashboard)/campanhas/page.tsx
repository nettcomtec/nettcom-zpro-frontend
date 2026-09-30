"use client";

import { formatDate as formatDateIntl } from "@/lib/format";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { format, sub } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { WabaConnectionQualityBadge } from "@/components/atendimento/waba-connection-quality-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Target, Plus, Search, MoreHorizontal, Play, XCircle, Copy, Trash2,
  ChevronDown, Users, SkipForward, CheckCheck, Edit, RefreshCw, FileText,
  Pause, PlayCircle, Camera, Globe, Phone,
  FolderOpen, Video, Sparkles, Loader2, Shuffle,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchCampaigns, fetchCampaign, deleteCampaign, duplicateCampaign, startCampaign, cancelCampaign,
  createCampaign, updateCampaign, addCampaignContacts, fetchContactsReportCampaign,
  fetchCampaignContacts, deleteCampaignContact, deleteAllCampaignContacts,
  skipCampaignMessage, forceFinishCampaign, getCampaignReport,
  pauseCampaign, resumeCampaign,
} from "@/services/campaigns";
import {
  fetchEmailTemplates, fetchEmailTemplate, fetchEmailEditorCapabilities, readApiError,
  type EmailTemplate as EmailMktTemplate, type EmailTemplateAttachment, type EmailEditorCapabilities,
} from "@/services/email-marketing";
import { EmailBodyField } from "@/components/email-marketing/email-body-field";
import { parseEmailDesign, type EmailDesign } from "@/lib/email-design";
import { fetchQueues } from "@/services/queues";
import { fetchKanbans } from "@/services/kanban";
import { fetchStages } from "@/services/funnel";
import { fetchWhatsapps, type Whatsapp, type WABATemplate } from "@/services/whatsapp";
import { type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { WhatsAppPreview } from "@/components/massa/whatsapp-preview";
import { sanitize } from "@/lib/sanitize";
import { fetchTags } from "@/services/tags";
import { fetchAllUsers } from "@/services/users";
import { generateTemplateViaCopilot } from "@/services/copilot";
import { estadosBR } from "@/lib/constants";
import { AddressFilterFields } from "@/components/contatos/address-filter-fields";
import {
  type AddressFilter,
  AddressFilterUnsupportedError,
  EMPTY_ADDRESS_FILTER,
  assertAddressFilterEcho,
  sameAddressFilter,
  toAddressQuery,
} from "@/lib/address-filter";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
// Cobranca (template ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md F6.2.
// A ficha vai gravada na coluna `orderDetails` da campanha; o disparo monta o
// componente da Meta com uma referencia NOVA por destinatario (D7). Template
// comum nao encosta em nada disto.
import {
  isOrderDetailsTemplate,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  type OrderDetailsValue,
} from "@/lib/order-details";
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import { cn, isValidHttpUrl } from "@/lib/utils";
import { useTableDensity } from "@/hooks/use-table-density";
import { TableDensityToggle } from "@/components/ui/table-density-toggle";
import { useLiveMode } from "@/hooks/use-live-mode";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Campaign {
  id: number;
  name: string;
  status: string;
  sessionId?: number;
  contactsCount?: number;
  pendentesEnvio?: number;
  recebidas?: number;
  sentCount?: number;
  failedCount?: number;
  start?: string;
  createdAt: string;
  message1?: string;
  message2?: string;
  message3?: string;
  mediaUrl?: string;
  mediaType?: string;
  delay?: number;
  sendTimeWindowEnabled?: boolean;
  sendTimeStart?: string;
  sendTimeEnd?: string;
  dailyLimit?: number;
  showOriginalOnReply?: boolean;
  originalOnReplyWindowMinutes?: number;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: string;
  /** Cobrança (ORDER_DETAILS): ficha de pagamento em JSON — reidratada ao editar */
  orderDetails?: string | null;
  currentMessageId?: number;
}

interface ContactForCampaign {
  id: number;
  name: string;
  number: string;
  tags?: { id: number; name: string; tag?: string }[];
  campaignContacts?: { ack: number; body?: string; messageRandom?: string; providerStatus?: string | null }[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

type TFunc = (key: string) => string;

function getMessageVars(t: TFunc) {
  return [
    { label: t("varName"), value: "{{name}}" },
    { label: t("varEmail"), value: "{{email}}" },
    { label: t("varPhone"), value: "{{phoneNumber}}" },
    { label: t("varFirstName"), value: "{{firstName}}" },
    { label: t("varLastName"), value: "{{lastName}}" },
    { label: t("varCompany"), value: "{{businessName}}" },
    { label: t("varKanban"), value: "{{kanban}}" },
  ];
}

function getAckLabels(t: TFunc): Record<string, string> {
  return {
    "-1": t("ackError"),
    "0": t("ackPendingSend"),
    "1": t("ackPendingDelivery"),
    "2": t("ackReceived"),
    "3": t("ackRead"),
    "4": t("ackPlayed"),
  };
}

// Registro pulado pelo backend (crossChannelTicketCheck): destinatário já em
// atendimento (ticket open/pending) → ack = -1 + body/messageRandom = "active_conversation".
// Não é erro real; exibir rótulo próprio e nunca vazar a string crua.
const ACTIVE_CONVERSATION_SKIP = "active_conversation";

function isSkippedActiveConversation(
  rec?: { ack?: number; body?: string; messageRandom?: string } | null
): boolean {
  return (
    rec?.ack === -1 &&
    (rec?.body === ACTIVE_CONVERSATION_SKIP || rec?.messageRandom === ACTIVE_CONVERSATION_SKIP)
  );
}

// Skips do canal e-mail (PLANO_EMAIL_MASSA §4.2): markers gravados pelo backend
// em body/messageRandom com ack -1 — rótulo próprio, nunca a string crua.
const EMAIL_SKIP_MARKERS = ["optout", "no_email", "duplicate_email"] as const;

function getEmailSkipMarker(
  rec?: { ack?: number; body?: string; messageRandom?: string; providerStatus?: string } | null
): string | null {
  if (rec?.ack !== -1) return null;
  if (String(rec?.providerStatus || "").toLowerCase() === "optout") return "optout";
  for (const marker of EMAIL_SKIP_MARKERS) {
    if (rec?.body === marker || rec?.messageRandom === marker) return marker;
  }
  return null;
}

function getStatusMap(t: TFunc): Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> {
  return {
    pending: { label: t("statusPending"), variant: "secondary" },
    scheduled: { label: t("statusScheduled"), variant: "outline" },
    processing: { label: t("statusInProgress"), variant: "default" },
    running: { label: t("statusInProgress"), variant: "default" },
    finished: { label: t("statusCompleted"), variant: "secondary" },
    completed: { label: t("statusCompleted"), variant: "secondary" },
    canceled: { label: t("statusCancelled"), variant: "destructive" },
    cancelled: { label: t("statusCancelled"), variant: "destructive" },
    failed: { label: t("statusFailed"), variant: "destructive" },
    paused: { label: t("statusPaused"), variant: "outline" },
  };
}

// WABA + BSPs (gupshup, dialog360) — todos enviam template no fluxo de campanha.
const WABA_TYPES = ["waba", "whatsapp-api", "360", "gupshup", "dialog360"];

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return formatDateIntl(new Date(dateStr), {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── WABA Template Variable Fields helper ────────────────────────────────────

interface TemplateVarField {
  label: string;
  key: string;
}

function getTemplateVarFields(template: WABATemplate | null): TemplateVarField[] {
  if (!template?.components) return [];
  const fields: TemplateVarField[] = [];
  const comps = template.components as { type?: string; format?: string; text?: string; example?: { body_text?: string[][]; body_text_named_params?: { param_name: string }[] }; parameters?: unknown[]; buttons?: { type?: string; sub_type?: string; text?: string; url?: string; parameters?: unknown[] }[] }[];

  for (const comp of comps) {
    if (comp.type === "HEADER" && (comp.format === "IMAGE" || comp.format === "VIDEO" || comp.format === "DOCUMENT")) {
      fields.push({ label: `URL Header (${(comp.format || "").toLowerCase()})`, key: `header_url` });
    }
    if (comp.type === "BODY") {
      // Detecta NAMED pelo parameter_format OU pelo example OU pelos placeholders
      // não-numéricos (Meta nem sempre devolve parameter_format no list).
      const isNamed =
        ((template as Record<string, unknown>).parameter_format === "NAMED" && comp.example?.body_text_named_params) ||
        (comp.example?.body_text_named_params?.length || 0) > 0 ||
        (!!comp.text && /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/.test(comp.text));
      if (isNamed && comp.example?.body_text_named_params) {
        comp.example.body_text_named_params.forEach((p, i) => {
          fields.push({ label: p.param_name || `Variável ${i + 1}`, key: `body_named_${i}` });
        });
      } else {
        const matches = comp.text?.match(/{{\d+}}/g) || [];
        matches.forEach((_, i) => {
          fields.push({ label: `Variável ${i + 1}`, key: `body_${i}` });
        });
      }
    }
    if (comp.type === "BUTTONS" && comp.buttons) {
      comp.buttons.forEach((btn, idx) => {
        if (btn.type === "COPY_CODE" || btn.type === "QUICK_REPLY") {
          fields.push({ label: `Botão ${idx + 1}`, key: `button_${idx}` });
        }
        // Botao URL dinamico: Meta permite ate 1 variavel `{{N}}` no final da URL.
        // Detectamos qualquer `{{...}}` na URL e expomos como campo `button_url_${idx}`.
        if (btn.type === "URL" && btn.url && /\{\{[^}]+\}\}/.test(btn.url)) {
          fields.push({ label: `Botão ${idx + 1} — URL (${btn.text || "link"})`, key: `button_url_${idx}` });
        }
      });
    }
  }
  return fields;
}

function buildTemplateComponents(template: WABATemplate | null, vars: Record<string, string>): string | null {
  if (!template?.components) return null;
  const comps = template.components as { type?: string; format?: string; text?: string; example?: { body_text?: string[][]; body_text_named_params?: { param_name: string }[] }; buttons?: { type?: string; sub_type?: string }[] }[];
  const result: unknown[] = [];
  let vi = 0;

  for (const comp of comps) {
    if (comp.type === "HEADER" && (comp.format === "IMAGE" || comp.format === "VIDEO" || comp.format === "DOCUMENT")) {
      const val = vars[`header_url`] || "";
      result.push({ type: "HEADER", format: comp.format, value: val });
      vi++;
    } else if (comp.type === "BODY") {
      // Detecta NAMED pelo parameter_format OU pelo example OU pelos placeholders
      // não-numéricos (Meta nem sempre devolve parameter_format no list).
      const isNamed =
        ((template as Record<string, unknown>).parameter_format === "NAMED" && comp.example?.body_text_named_params) ||
        (comp.example?.body_text_named_params?.length || 0) > 0 ||
        (!!comp.text && /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/.test(comp.text));
      if (isNamed && comp.example?.body_text_named_params) {
        result.push({
          type: "BODY",
          // Texto do template junto dos valores: os senders ignoram `text` (leem só
          // `parameters`/`variables`), mas é dele que a bolha de "Exibir mensagem
          // original ao receber resposta" monta o corpo real — sem ele o atendente
          // vê o NOME do template na conversa.
          text: comp.text,
          parameters: comp.example.body_text_named_params.map((p, i) => ({
            type: "text",
            text: vars[`body_named_${i}`] || " ",
            name: p.param_name,
          })),
        });
      } else {
        const matches = comp.text?.match(/{{\d+}}/g) || [];
        result.push({
          type: "BODY",
          text: comp.text,
          parameters: matches.map((_, i) => ({
            type: "text",
            text: vars[`body_${i}`] || " ",
          })),
        });
      }
    } else if (comp.type === "BUTTONS" && comp.buttons) {
      const buttons = comp.buttons
        .map((btn, idx) => {
          const btnAny = btn as { type?: string; sub_type?: string; text?: string; url?: string };
          if (btnAny.type === "COPY_CODE" || btnAny.type === "QUICK_REPLY") {
            return { sub_type: btnAny.type.toLowerCase(), index: idx, parameters: [{ type: "text", text: vars[`button_${idx}`] || " " }] };
          }
          // Botao URL dinamico (Meta exige sub_type=url + text com o valor da variavel).
          // So emite o component quando o usuario preencheu — botoes URL estaticos nao
          // precisam de component button (a Meta usa a URL do template direto).
          if (btnAny.type === "URL" && btnAny.url && /\{\{[^}]+\}\}/.test(btnAny.url) && vars[`button_url_${idx}`]) {
            return { sub_type: "url", index: idx, parameters: [{ type: "text", text: vars[`button_url_${idx}`] }] };
          }
          // Flow / Catálogo: botão sem variável, mas a Meta exige o component
          // BUTTONS com o índice — sem ele o template ia sem o botão.
          if (btnAny.type === "FLOW" || btnAny.type === "CATALOG") {
            return { sub_type: btnAny.type.toLowerCase(), index: idx, parameters: [] };
          }
          return null;
        })
        .filter(Boolean);
      if (buttons.length) result.push({ type: "BUTTONS", buttons });
    } else if (comp.type === "HEADER" && comp.format === "TEXT" && comp.text) {
      // Só para a bolha injetada: sem `value`/`variables` nenhum dos 3 senders
      // emite parâmetro de header (todos exigem um dos dois), então o que a Meta
      // recebe continua idêntico.
      result.push({ type: "HEADER", format: "TEXT", text: comp.text });
    } else if (comp.type === "FOOTER" && comp.text) {
      // Idem: tipo que os senders não conhecem e ignoram no loop.
      result.push({ type: "FOOTER", text: comp.text });
    }
    void vi;
  }

  return result.length ? JSON.stringify(result) : null;
}

/**
 * Inverso de buildTemplateComponents: reidrata os valores já configurados a
 * partir da coluna `templateComponents` da campanha. Sem isso os campos de
 * variável/botão voltavam vazios ao editar e o Salvar gravava espaço em branco
 * por cima do que o cliente tinha preenchido.
 *
 * Os parâmetros de BODY são gravados nas DUAS chaves possíveis (`body_N` e
 * `body_named_N`) de propósito: só uma delas é renderizada — depende de o
 * template ser numerado ou nomeado — e payloads antigos nem sempre trazem o
 * `name` do parâmetro para desempatar.
 */
function templateVarsFromSaved(raw: string | null | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!raw) return vars;
  let saved: unknown;
  try {
    saved = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return vars;
  }
  if (!Array.isArray(saved)) return vars;
  // Campo não preenchido é gravado como " " (a Meta recusa string vazia).
  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v : "");

  for (const comp of saved as Record<string, any>[]) {
    if (comp?.type === "HEADER" && ["IMAGE", "VIDEO", "DOCUMENT"].includes(String(comp.format))) {
      const val = clean(comp.value);
      if (val) vars["header_url"] = val;
    } else if (comp?.type === "BODY" && Array.isArray(comp.parameters)) {
      comp.parameters.forEach((p: Record<string, unknown>, i: number) => {
        const val = clean(p?.text);
        if (!val) return;
        vars[`body_${i}`] = val;
        vars[`body_named_${i}`] = val;
      });
    } else if (comp?.type === "BUTTONS" && Array.isArray(comp.buttons)) {
      comp.buttons.forEach((btn: Record<string, any>) => {
        const idx = Number(btn?.index);
        const val = clean(btn?.parameters?.[0]?.text);
        if (!Number.isFinite(idx) || !val) return;
        vars[btn?.sub_type === "url" ? `button_url_${idx}` : `button_${idx}`] = val;
      });
    }
  }
  return vars;
}

/**
 * Reidrata o formulário de cobrança a partir da coluna `orderDetails` da campanha.
 * O que fica gravado é o payload de envio (buildOrderDetailsPayload), com os ajustes
 * em `{ value }` e sem o total (que é derivado) — daqui volta o shape do formulário.
 */
function orderDetailsFromSaved(raw: string | null | undefined): OrderDetailsValue {
  const base = emptyOrderDetails();
  if (!raw) return base;
  let saved: Record<string, any>;
  try {
    saved = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return base;
  }
  if (!saved || typeof saved !== "object") return base;
  const items = Array.isArray(saved.items) && saved.items.length > 0
    ? saved.items.map((i: Record<string, unknown>) => ({
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

// ─── WABA Template preview helpers ───────────────────────────────────────────

function buildPreviewTemplate(template: WABATemplate | null, vars: Record<string, string>): WABATemplate | null {
  if (!template?.components) return template;
  const comps = template.components as Record<string, unknown>[];
  const previewComps = comps.map((comp) => {
    if (comp.type === "HEADER" && (comp.format === "IMAGE" || comp.format === "VIDEO" || comp.format === "DOCUMENT")) {
      return { ...comp, _previewUrl: vars["header_url"] || "" };
    }
    if (comp.type === "BODY" && typeof comp.text === "string") {
      let text = comp.text as string;
      const exampleAny = (comp.example as Record<string, unknown> | undefined);
      const namedParamsRaw = exampleAny?.body_text_named_params as { param_name: string }[] | undefined;
      const isNamed =
        ((template as Record<string, unknown>).parameter_format === "NAMED" && namedParamsRaw?.length) ||
        (namedParamsRaw?.length || 0) > 0 ||
        (typeof comp.text === "string" && /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/.test(comp.text as string));
      if (isNamed) {
        const params = ((comp.example as Record<string, unknown>).body_text_named_params as { param_name: string }[]);
        params.forEach((p, i) => {
          text = text.replaceAll(`{{${p.param_name}}}`, vars[`body_named_${i}`] || `{{${p.param_name}}}`);
        });
      } else {
        const matches = text.match(/{{\d+}}/g) || [];
        matches.forEach((m, i) => {
          text = text.replace(m, vars[`body_${i}`] || m);
        });
      }
      return { ...comp, text };
    }
    return comp;
  });
  return { ...template, components: previewComps };
}

function TemplateMobilePreview({ template }: { template: WABATemplate | null }) {
  if (!template) return null;
  const components = (template.components || []) as Record<string, unknown>[];
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  const footer = components.find((c) => c.type === "FOOTER");
  const buttons = components.find((c) => c.type === "BUTTONS");

  const formatBodyText = (text: string) =>
    text
      .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/\n/g, "<br/>");

  const previewUrl = header?._previewUrl as string | undefined;
  const headerFormat = header?.format as string | undefined;
  const headerText = header?.text != null ? String(header.text) : undefined;
  const bodyText = body?.text != null ? String(body.text) : undefined;
  const footerText = footer?.text != null ? String(footer.text) : undefined;

  return (
    <div className="flex justify-center">
      <div className="w-56 bg-gray-800 rounded-3xl p-2.5 shadow-xl">
        <div className="bg-white rounded-2xl overflow-hidden min-h-72">
          <div className="bg-green-600 px-3 py-2 flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center">
              <Phone className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-white text-xs font-medium">WhatsApp Business</span>
          </div>
          <div className="p-2.5 bg-gray-50 min-h-48">
            <div className="bg-white rounded-lg shadow-sm p-2.5 max-w-full">
              {header && (
                <div className="mb-2">
                  {headerFormat === "IMAGE" && (
                    previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="header" className="w-full h-24 object-cover rounded" />
                    ) : (
                      <div className="w-full h-20 bg-gray-200 rounded flex items-center justify-center">
                        <Camera className="w-6 h-6 text-gray-400" />
                      </div>
                    )
                  )}
                  {headerFormat === "VIDEO" && (
                    previewUrl ? (
                      <video src={previewUrl} className="w-full h-20 rounded object-cover" controls={false} />
                    ) : (
                      <div className="w-full h-20 bg-gray-200 rounded flex items-center justify-center gap-1">
                        <Video className="w-5 h-5 text-gray-400" />
                        <span className="text-gray-400 text-xs">VIDEO</span>
                      </div>
                    )
                  )}
                  {headerFormat === "DOCUMENT" && (
                    <div className="w-full h-14 bg-gray-200 rounded flex items-center justify-center gap-1">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <span className="text-gray-400 text-xs">{previewUrl ? previewUrl.split("/").pop()?.slice(0, 20) : "DOCUMENT"}</span>
                    </div>
                  )}
                  {(headerFormat === "TEXT" || !headerFormat) && headerText && (
                    <p className="font-semibold text-sm text-gray-900">{headerText}</p>
                  )}
                </div>
              )}
              {bodyText && (
                <p
                  className="text-xs text-gray-700 mb-2 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitize(formatBodyText(bodyText)) }}
                />
              )}
              {footerText && (
                <p className="text-xs text-gray-400 mt-1">{footerText}</p>
              )}
              <div className="flex justify-end mt-1">
                <span className="text-xs text-gray-300">12:00</span>
              </div>
            </div>
            {buttons && Array.isArray((buttons as Record<string, unknown>).buttons) && (
              <div className="mt-1 space-y-1">
                {((buttons as Record<string, unknown>).buttons as Record<string, unknown>[]).map((btn, i) => (
                  <div key={i} className="bg-white rounded border border-green-200 text-center py-1 px-2 text-xs text-green-600 font-medium shadow-sm flex items-center justify-center gap-1">
                    {btn.type === "URL" && <Globe className="w-3 h-3 shrink-0" />}
                    {btn.type === "PHONE_NUMBER" && <Phone className="w-3 h-3 shrink-0" />}
                    <span>{(btn.text as string) || (btn.type === "URL" ? (btn.url as string) || "URL" : btn.type === "PHONE_NUMBER" ? (btn.phone_number as string) || "Telefone" : "Resposta Rápida")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Form Dialog ─────────────────────────────────────────────────────

interface CampaignFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editCampaign?: Campaign | null;
  sessions: Whatsapp[];
}

function CampaignFormDialog({ open, onClose, onSaved, editCampaign, sessions }: CampaignFormProps) {
  const t = useTranslations("campanhasPage");
  const tErrors = useTranslations("errors");
  const tOrder = useTranslations("orderDetails");
  const isEdit = !!editCampaign?.id;

  const [formName, setFormName] = useState("");
  const [formSessionId, setFormSessionId] = useState("");
  const [formStart, setFormStart] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  const [formDelay, setFormDelay] = useState(20);
  const [formSendTimeWindow, setFormSendTimeWindow] = useState(false);
  const [formSendTimeStart, setFormSendTimeStart] = useState("09:00");
  const [formSendTimeEnd, setFormSendTimeEnd] = useState("18:00");
  const [formDailyLimit, setFormDailyLimit] = useState(0);
  const [formShowOriginal, setFormShowOriginal] = useState(false);
  const [formOriginalWindow, setFormOriginalWindow] = useState(1440);
  const [formMessage1, setFormMessage1] = useState("");
  const [formMessage2, setFormMessage2] = useState("");
  const [formMessage3, setFormMessage3] = useState("");
  const [formMediaFile, setFormMediaFile] = useState<File | null>(null);
  // Mídia já gravada na campanha: o <input type="file"> não pode ser pré-preenchido
  // pelo navegador, então a mídia atual é exibida ao lado do campo (antes o campo
  // voltava vazio e parecia que a mídia tinha sumido — ela sempre esteve no banco).
  // Este flag é o único caminho para limpar a coluna: PUT com mediaUrl "" — payload
  // sem a chave preserva o valor atual no backend.
  const [formRemoveMedia, setFormRemoveMedia] = useState(false);
  const [formTemplate, setFormTemplate] = useState<WABATemplate | null>(null);
  const [formTemplateVars, setFormTemplateVars] = useState<Record<string, string>>({});
  // Cobrança: estado paralelo ao formTemplateVars — o botão ORDER_DETAILS não gera
  // variável de template, a ficha inteira vai em campo próprio.
  const [formOrderDetails, setFormOrderDetails] = useState<OrderDetailsValue>(() => emptyOrderDetails());
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<WABATemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [previewMsg, setPreviewMsg] = useState(0); // 0,1,2 → message1,2,3
  // Destaca os campos de mensagem vazios só depois de uma tentativa de salvar
  const [showMessageErrors, setShowMessageErrors] = useState(false);

  // Gallery picker (for WABA header media)
  const [galleryOpen, setGalleryOpen] = useState(false);

  const msg1Ref = useRef<HTMLTextAreaElement>(null);
  const msg2Ref = useRef<HTMLTextAreaElement>(null);
  const msg3Ref = useRef<HTMLTextAreaElement>(null);
  const msgRefs = [msg1Ref, msg2Ref, msg3Ref];
  const messages = [formMessage1, formMessage2, formMessage3];
  const setMessages = [setFormMessage1, setFormMessage2, setFormMessage3];
  const messageLabels = [t("message1"), t("message2"), t("message3")];
  const messageInvalid = messages.map((m) => showMessageErrors && !m?.trim());

  // AI campaign generator
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiTargetIdx, setAiTargetIdx] = useState<number>(0);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  const tCampaignAI = useTranslations("campaignAI");
  const tCopilotPrompts = useTranslations("copilotPrompts");
  const tCopilot = useTranslations("copilot");

  const openAiDialog = (idx: number) => {
    setAiTargetIdx(idx);
    setAiPrompt("");
    setAiDialogOpen(true);
  };

  const handleGenerateAICampaign = async () => {
    if (!aiPrompt.trim() || aiGenerating) return;
    setAiGenerating(true);
    try {
      const systemPrompt = tCopilotPrompts("campaignCopywriter");
      const result = await generateTemplateViaCopilot(systemPrompt, aiPrompt);
      setMessages[aiTargetIdx](result.result.trim());
      setPreviewMsg(aiTargetIdx);
      setAiDialogOpen(false);
      toast.success(tCampaignAI("apply"));
    } catch (err: unknown) {
      const { status } = readApiError(err);
      if (status === 422) {
        toast.error(tCopilot("noApiKey"));
      } else {
        toast.error(tCampaignAI("errorGenerate"));
      }
    } finally {
      setAiGenerating(false);
    }
  };

  const selectedSession = sessions.find((s) => String(s.id) === formSessionId);
  const isWabaSession = selectedSession && WABA_TYPES.includes((selectedSession.type ?? "").toLowerCase());
  // PLANO_EMAIL_MASSA: família e-mail cobre 'email' E 'webmail' (Gmail)
  const isEmailSession = !!selectedSession && ["email", "webmail"].includes((selectedSession.type ?? "").toLowerCase());
  const tEmail = useTranslations("campaignEmail");

  // ── Modo e-mail (PLANO_EMAIL_MASSA §5.2) ──────────────────────────────────
  const [formEmailSubject, setFormEmailSubject] = useState("");
  const [formEmailHtml, setFormEmailHtml] = useState("");
  const [formEmailTemplateId, setFormEmailTemplateId] = useState<string>("");
  const [formEmailAttachments, setFormEmailAttachments] = useState<EmailTemplateAttachment[]>([]);
  const [formUnsubFooter, setFormUnsubFooter] = useState(true);
  const [emailTemplates, setEmailTemplates] = useState<EmailMktTemplate[]>([]);
  const [loadingEmailBody, setLoadingEmailBody] = useState(false);
  // Editor visual (PLANO_EMAIL_EDITOR_VISUAL D6): a campanha guarda só o HTML; o projeto
  // do modelo escolhido semeia uma cópia editável
  const [emailEditorCaps, setEmailEditorCaps] = useState<EmailEditorCapabilities | null>(null);
  const [emailBodySeed, setEmailBodySeed] = useState<{ design: EmailDesign | null; nonce: number } | undefined>(undefined);
  // Ações quando o contato responder (replyActions)
  const [raQueueId, setRaQueueId] = useState("");
  const [raUserId, setRaUserId] = useState("");
  const [raKanbanId, setRaKanbanId] = useState("");
  const [raStageId, setRaStageId] = useState("");
  const [raTagIds, setRaTagIds] = useState<number[]>([]);
  const [raWebhookUrl, setRaWebhookUrl] = useState("");
  const [raWindow, setRaWindow] = useState(4320);
  const [raQueues, setRaQueues] = useState<{ id: number; queue: string }[]>([]);
  const [raUsers, setRaUsers] = useState<{ id: number; name: string }[]>([]);
  const [raKanbans, setRaKanbans] = useState<{ id: number; name: string }[]>([]);
  const [raStages, setRaStages] = useState<{ id: number; name: string; pipeline?: { name?: string } }[]>([]);
  const [raTags, setRaTags] = useState<{ id: number; tag: string }[]>([]);

  const resetEmailForm = () => {
    setFormEmailSubject("");
    setFormEmailHtml("");
    setEmailBodySeed({ design: null, nonce: Date.now() });
    setFormEmailTemplateId("");
    setFormEmailAttachments([]);
    setFormUnsubFooter(true);
    setRaQueueId(""); setRaUserId(""); setRaKanbanId(""); setRaStageId("");
    setRaTagIds([]); setRaWebhookUrl(""); setRaWindow(4320);
  };

  const applyReplyActions = (raw?: string | null) => {
    try {
      const parsed = raw ? JSON.parse(String(raw)) : null;
      setRaQueueId(parsed?.queueId ? String(parsed.queueId) : "");
      setRaUserId(parsed?.userId ? String(parsed.userId) : "");
      setRaKanbanId(parsed?.kanbanId ? String(parsed.kanbanId) : "");
      setRaStageId(parsed?.funnelStageId ? String(parsed.funnelStageId) : "");
      setRaTagIds(Array.isArray(parsed?.tagIds) ? parsed.tagIds.map(Number).filter(Boolean) : []);
      setRaWebhookUrl(parsed?.webhookUrl || "");
      setRaWindow(Number(parsed?.windowMinutes) || 4320);
    } catch {
      setRaQueueId(""); setRaUserId(""); setRaKanbanId(""); setRaStageId("");
      setRaTagIds([]); setRaWebhookUrl(""); setRaWindow(4320);
    }
  };

  // Fontes de dados do modo e-mail (templates + destinos das ações de resposta)
  useEffect(() => {
    if (!open || !isEmailSession) return;
    fetchEmailTemplates({ limit: 200 })
      .then(res => setEmailTemplates(res.records || []))
      .catch(() => setEmailTemplates([]));
    fetchQueues().then((res: any) => {
      const arr = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
      setRaQueues(Array.isArray(arr) ? arr : []);
    }).catch(() => setRaQueues([]));
    fetchAllUsers().then((users: any) => {
      const arr = Array.isArray(users) ? users : users?.data?.users ?? users?.users ?? [];
      setRaUsers(Array.isArray(arr) ? arr : []);
    }).catch(() => setRaUsers([]));
    fetchKanbans().then((res: any) => {
      const arr = Array.isArray(res?.data) ? res.data : res?.data?.kanban ?? res?.data?.data ?? [];
      setRaKanbans(Array.isArray(arr) ? arr : []);
    }).catch(() => setRaKanbans([]));
    fetchStages().then((res: any) => {
      const arr = Array.isArray(res?.data) ? res.data : res?.data?.stages ?? res?.data?.data ?? [];
      setRaStages(Array.isArray(arr) ? arr : []);
    }).catch(() => setRaStages([]));
    fetchTags().then((res: any) => {
      const arr = Array.isArray(res?.data) ? res.data : res?.data?.tags ?? res?.data?.data ?? [];
      setRaTags(Array.isArray(arr) ? arr : []);
    }).catch(() => setRaTags([]));
    // Capacidades do editor visual (null = backend antigo → só o editor clássico)
    fetchEmailEditorCapabilities().then(setEmailEditorCaps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEmailSession]);

  // Edição de campanha de e-mail: a LISTA não traz emailHtml/emailAttachments —
  // buscar o corpo completo no Show (degrada em silêncio se o backend for antigo)
  useEffect(() => {
    if (!open || !editCampaign?.id) return;
    const ec: any = editCampaign;
    if (!ec.emailSubject && !ec.emailHtml) {
      // Campanha não-email: limpa estado que poderia ter vazado de uma edição
      // anterior de campanha de e-mail (auditoria pós-impl. #4)
      resetEmailForm();
      return;
    }
    resetEmailForm();
    setFormEmailSubject(ec.emailSubject || "");
    setFormUnsubFooter(ec.unsubscribeFooterEnabled !== false);
    setFormEmailTemplateId(ec.emailTemplateId ? String(ec.emailTemplateId) : "");
    applyReplyActions(ec.replyActions);
    setLoadingEmailBody(true);
    fetchCampaign(editCampaign.id)
      .then(({ data: full }: any) => {
        setFormEmailHtml(full?.emailHtml || "");
        // Campanha guarda só HTML: nada de projeto visual a semear
        setEmailBodySeed({ design: null, nonce: Date.now() });
        try {
          const atts = full?.emailAttachments ? JSON.parse(String(full.emailAttachments)) : [];
          setFormEmailAttachments(Array.isArray(atts) ? atts : []);
        } catch {
          setFormEmailAttachments([]);
        }
        if (full?.replyActions !== undefined) applyReplyActions(full.replyActions);
      })
      .catch(() => { /* backend antigo: sem Show — corpo fica para reescrever */ })
      .finally(() => setLoadingEmailBody(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editCampaign?.id]);

  const handlePickEmailTemplate = async (templateId: string) => {
    setFormEmailTemplateId(templateId);
    if (!templateId) return;
    try {
      const full = await fetchEmailTemplate(Number(templateId));
      setFormEmailSubject(full.subject || "");
      setFormEmailHtml(full.html || "");
      setEmailBodySeed({ design: parseEmailDesign(full.designJson), nonce: Date.now() });
      setFormEmailAttachments(full.attachments || []);
    } catch {
      toast.error(tEmail("errorLoadTemplate"));
    }
  };

  // Populate form when editing
  useEffect(() => {
    if (!open) return;
    if (editCampaign) {
      setFormName(editCampaign.name || "");
      setFormSessionId(String(editCampaign.sessionId || ""));
      const startStr = editCampaign.start
        ? format(new Date(editCampaign.start), "yyyy-MM-dd'T'HH:mm")
        : format(new Date(Date.now() + 30 * 60000), "yyyy-MM-dd'T'HH:mm");
      setFormStart(startStr);
      setFormDelay(editCampaign.delay ?? 20);
      setFormSendTimeWindow(editCampaign.sendTimeWindowEnabled ?? false);
      setFormSendTimeStart(editCampaign.sendTimeStart || "09:00");
      setFormSendTimeEnd(editCampaign.sendTimeEnd || "18:00");
      setFormDailyLimit(editCampaign.dailyLimit ?? 0);
      setFormShowOriginal(editCampaign.showOriginalOnReply ?? false);
      setFormOriginalWindow(editCampaign.originalOnReplyWindowMinutes ?? 1440);
      setFormMessage1(editCampaign.message1 || "");
      setFormMessage2(editCampaign.message2 || "");
      setFormMessage3(editCampaign.message3 || "");
      setFormMediaFile(null);
      setFormRemoveMedia(false);
      setFormTemplate(null);
      setFormTemplateVars({});
      // Cobrança: reidrata a ficha gravada (campanha comum devolve o form vazio).
      setFormOrderDetails(orderDetailsFromSaved(editCampaign.orderDetails));
    } else {
      setFormName("");
      setFormSessionId("");
      setFormStart(format(new Date(Date.now() + 30 * 60000), "yyyy-MM-dd'T'HH:mm"));
      setFormDelay(20);
      setFormSendTimeWindow(false);
      setFormSendTimeStart("09:00");
      setFormSendTimeEnd("18:00");
      setFormDailyLimit(0);
      setFormShowOriginal(false);
      setFormOriginalWindow(1440);
      setFormMessage1("");
      setFormMessage2("");
      setFormMessage3("");
      setFormMediaFile(null);
      setFormRemoveMedia(false);
      setFormTemplate(null);
      setFormTemplateVars({});
      setFormOrderDetails(emptyOrderDetails());
      resetEmailForm();
    }
    setPreviewMsg(0);
    setShowMessageErrors(false);
    setTemplates([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editCampaign]);

  // Load WABA/Gupshup/Dialog360 templates
  //
  // `open` e `editCampaign?.id` são dependências OBRIGATÓRIAS: o diálogo fica
  // sempre montado (só a prop `open` muda), então o estado sobrevive ao fechar.
  // Sem elas, reabrir o formulário com a MESMA sessão não re-executava o efeito
  // — mas a rotina que popula o form já tinha zerado a lista e a seleção — e o
  // template gravado sumia do seletor ("Nenhum template aprovado encontrado")
  // até um F5.
  useEffect(() => {
    if (!open) return;
    if (!isWabaSession || !selectedSession) {
      setTemplates([]);
      setFormTemplate(null);
      return;
    }
    let cancelled = false;
    const sessType = (selectedSession.type ?? "").toLowerCase();
    setLoadingTemplates(true);
    // getTemplatesForChannel resolve tokenAPI/id do canal e auto-cura pos-login
    // (sessao pode chegar sem tokenAPI logo apos o login). Cobre WABA e BSP.
    const fetchPromise = import("@/services/channel-templates").then(
      ({ getTemplatesForChannel }) =>
        getTemplatesForChannel({ id: selectedSession.id, type: sessType, tokenAPI: selectedSession.tokenAPI }),
    );
    fetchPromise
      .then((list: any) => {
        if (cancelled) return; // troca de sessão/fechamento: resposta antiga não escreve
        const arr: any[] = Array.isArray(list) ? list : [];
        setTemplates([...arr].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
        // If editing and had a template, re-select it
        if (editCampaign?.templateName) {
          const found = arr.find(
            (t: any) => t.name === editCampaign.templateName && t.language === editCampaign.templateLanguage
          );
          if (found) {
            setFormTemplate(found);
            // Reidrata os valores gravados (variáveis, header e botões) — sem
            // isso o Salvar sobrescreveria o conteúdo configurado com vazio.
            setFormTemplateVars(templateVarsFromSaved(editCampaign.templateComponents));
          }
        }
      })
      .catch(() => { if (!cancelled) setTemplates([]); })
      .finally(() => { if (!cancelled) setLoadingTemplates(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editCampaign?.id, isWabaSession, selectedSession?.id, selectedSession?.tokenAPI]);

  const insertVar = (varValue: string, msgIndex: number) => {
    const ref = msgRefs[msgIndex];
    const setter = setMessages[msgIndex];
    const el = ref.current;
    if (!el) {
      setter((prev) => prev + varValue);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newVal = el.value.substring(0, start) + varValue + el.value.substring(end);
    setter(newVal);
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + varValue.length;
      el.focus();
    }, 10);
  };

  const templateVarFields = getTemplateVarFields(formTemplate);
  const templateComponents = buildTemplateComponents(formTemplate, formTemplateVars);
  const previewTemplate = buildPreviewTemplate(formTemplate, formTemplateVars);

  // Mídia gravada na campanha — a listagem e o Show já devolvem a URL absoluta
  // (getter do model). Só aparece na edição e enquanto nenhum arquivo novo for
  // escolhido nem a remoção pedida.
  const savedMediaUrl = isEdit ? editCampaign?.mediaUrl || "" : "";
  const savedMediaName = savedMediaUrl
    ? (() => {
        const raw = savedMediaUrl.split("?")[0].split("/").pop() || "";
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      })()
    : "";
  const showSavedMedia = !!savedMediaUrl && !formMediaFile && !formRemoveMedia;

  // Template de cobranca (sub_category/display_format/botao ORDER_DETAILS).
  // Unico gate do caminho novo: false aqui e a campanha segue byte a byte igual —
  // mesmo payload, mesmo disparo. True libera a ficha de pagamento, gravada em
  // `orderDetails` e resolvida por destinatario no SendCampaignService.
  const isOrderDetailsSelected = React.useMemo(
    () => isOrderDetailsTemplate(formTemplate as unknown as Parameters<typeof isOrderDetailsTemplate>[0]),
    [formTemplate]
  );

  const handlePickGalleryItem = (item: GalleryItem) => {
    setFormTemplateVars((p) => ({ ...p, header_url: item.url }));
    setGalleryOpen(false);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error(t("nameRequired")); return; }
    if (!formSessionId) { toast.error(t("sessionRequired")); return; }

    if (isWabaSession) {
      if (!formTemplate) { toast.error(t("wabaChannel")); return; }
      // Cobrança: valida a ficha antes de gravar — campanha salva com Pix inválido
      // só falharia no disparo, contato a contato.
      if (isOrderDetailsSelected) {
        const orderError = validateOrderDetails(formOrderDetails);
        if (orderError) { toast.warning(tOrder(orderError)); return; }
      }
      // Header de mídia exige URL http(s) — texto comum vira image.link e a Meta rejeita (#100)
      // no disparo. Placeholder {{...}} é aceito (substituído em runtime).
      const hasMediaHeader = templateVarFields.some((f) => f.key === "header_url");
      const headerUrlVal = formTemplateVars["header_url"] || "";
      if (hasMediaHeader && !isValidHttpUrl(headerUrlVal) && !/\{\{.+\}\}/.test(headerUrlVal)) {
        toast.error(tErrors("invalidMediaHeaderUrl"));
        return;
      }
    } else if (isEmailSession) {
      if (!formEmailSubject.trim()) { toast.error(tEmail("subjectRequired")); return; }
      if (!formEmailHtml.trim()) { toast.error(tEmail("bodyRequired")); return; }
      if (raWebhookUrl.trim() && !/^https?:\/\//i.test(raWebhookUrl.trim())) {
        toast.error(tEmail("webhookInvalid"));
        return;
      }
    } else {
      // O backend exige as TRÊS mensagens (cada contato recebe uma delas, sorteada
      // no disparo). Validar só a 1ª deixava o usuário salvar com 2/3 vazias e
      // levar um erro genérico — aqui a tela aponta o campo que falta.
      const missing = messages
        .map((m, i) => (m?.trim() ? -1 : i))
        .filter((i) => i >= 0);
      if (missing.length > 0) {
        setShowMessageErrors(true);
        setPreviewMsg(missing[0]);
        msgRefs[missing[0]].current?.focus();
        toast.error(t("messagesRequired", { fields: missing.map((i) => messageLabels[i]).join(", ") }));
        return;
      }
    }

    const startDate = new Date(formStart);
    if (!isEdit && startDate < new Date()) {
      toast.error(t("startDatetime"));
      return;
    }

    if (formSendTimeWindow) {
      const [startH = 0, startM = 0] = formSendTimeStart.split(":").map(Number);
      const [endH = 0, endM = 0] = formSendTimeEnd.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      if (endMinutes <= startMinutes) {
        toast.error(t("windowEndBeforeStart"));
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: formName.trim(),
        sessionId: formSessionId,
        start: startDate.toISOString(),
        delay: formDelay,
        sendTimeWindowEnabled: formSendTimeWindow,
        sendTimeStart: formSendTimeWindow ? formSendTimeStart : null,
        sendTimeEnd: formSendTimeWindow ? formSendTimeEnd : null,
        dailyLimit: formDailyLimit,
        showOriginalOnReply: formShowOriginal,
        originalOnReplyWindowMinutes: formOriginalWindow,
      };

      if (isWabaSession && formTemplate) {
        payload.templateName = formTemplate.name;
        payload.templateLanguage = formTemplate.language;
        payload.templateComponents = templateComponents;
        // Cobrança: a chave só entra no payload quando há ficha para gravar ou ficha
        // antiga para limpar (troca de cobrança por template comum na edição — sem o
        // null explícito o backend preservaria a ficha). Campanha comum que nunca teve
        // cobrança sai com o payload de sempre, sem campo novo.
        if (isOrderDetailsSelected) {
          payload.orderDetails = JSON.stringify(buildOrderDetailsPayload(formOrderDetails));
        } else if (isEdit && editCampaign?.orderDetails) {
          payload.orderDetails = null;
        }
      } else if (isEmailSession) {
        payload.emailSubject = formEmailSubject.trim();
        payload.emailHtml = formEmailHtml;
        payload.emailTemplateId = formEmailTemplateId || "";
        payload.emailAttachments = JSON.stringify(formEmailAttachments);
        payload.unsubscribeFooterEnabled = formUnsubFooter;
        const ra: Record<string, unknown> = {};
        if (raQueueId) ra.queueId = Number(raQueueId);
        if (raUserId) ra.userId = Number(raUserId);
        if (raKanbanId) ra.kanbanId = Number(raKanbanId);
        if (raStageId) ra.funnelStageId = Number(raStageId);
        if (raTagIds.length > 0) ra.tagIds = raTagIds;
        if (raWebhookUrl.trim()) ra.webhookUrl = raWebhookUrl.trim();
        if (Object.keys(ra).length > 0) {
          ra.windowMinutes = raWindow || 4320;
          payload.replyActions = JSON.stringify(ra);
        } else {
          // "null" explícito limpa as ações na edição (campo ausente preservaria)
          payload.replyActions = "null";
        }
      } else {
        payload.message1 = formMessage1 ?? "";
        payload.message2 = formMessage2 ?? "";
        payload.message3 = formMessage3 ?? "";
        // Remover mídia: só o "" explícito limpa a coluna no backend — payload SEM a
        // chave preserva o arquivo atual (é por isso que a edição comum nunca a envia).
        // Arquivo novo escolhido tem precedência e substitui a mídia, sem passar aqui.
        if (isEdit && formRemoveMedia && !formMediaFile) {
          payload.mediaUrl = "";
        }
      }

      let dataToSend: FormData | Record<string, unknown> = payload;
      // E-mail SEMPRE via FormData: body JSON passaria pelo sanitizador global do
      // backend, que removeria as tags do emailHtml (PLANO_EMAIL_MASSA §4.1)
      if ((formMediaFile && !isWabaSession) || isEmailSession) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => { if (v != null) fd.append(k, String(v)); });
        if (formMediaFile && !isWabaSession && !isEmailSession) fd.append("medias", formMediaFile);
        dataToSend = fd;
      }

      if (isEdit && editCampaign?.id) {
        await updateCampaign(editCampaign.id, dataToSend);
        toast.success(t("campaignUpdated"));
      } else {
        await createCampaign(dataToSend);
        toast.success(t("campaignCreated"));
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      // lib/api.ts rejeita com `error.response || error`: o corpo fica na RAIZ
      const errBody = e as { data?: { message?: string }; response?: { data?: { message?: string } } } | null;
      const msg = errBody?.data?.message ?? errBody?.response?.data?.message;
      // Código ERR_* cru do backend não vira toast (sem tradução) — cai no
      // fallback genérico traduzido (auditoria pós-impl. RISCO-6)
      const displayable = msg && !msg.startsWith("ERR_") ? msg : null;
      toast.error(displayable || (isEdit ? t("errorUpdate") : t("errorCreate")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editCampaign") : t("newCampaignTitle")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editApiDescription") : t("newApiDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Basic fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="camp-name">{t("name")}</Label>
              <Input id="camp-name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t("namePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="camp-session">{t("session")}</Label>
              <SearchableSelect
                options={sessions.map((s) => ({ value: String(s.id), label: s.number ? `${s.name} (${s.number})` : s.name }))}
                value={formSessionId}
                onValueChange={setFormSessionId}
                placeholder={t("select")}
              />
              {selectedSession && (selectedSession.type ?? "").toLowerCase() === "waba" ? (
                <WabaConnectionQualityBadge
                  bmToken={selectedSession.bmToken}
                  tokenAPI={selectedSession.tokenAPI}
                  wabaId={selectedSession.wabaId}
                  phoneHint={selectedSession.number}
                  wabaVersion={selectedSession.wabaVersion}
                  loadingLabel={t("qualityLoading")}
                  tooltipTitle={t("qualityTitle")}
                  tooltipBody={t("qualityBody")}
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("startDatetime")}</Label>
              <Input type="datetime-local" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("messageDelay")}</Label>
              <Input type="number" min={1} value={formDelay} onChange={(e) => setFormDelay(Number(e.target.value) || 20)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label>{t("sendingWindow")}</Label>
            </div>
            <Switch checked={formSendTimeWindow} onCheckedChange={setFormSendTimeWindow} />
          </div>
          {formSendTimeWindow && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("windowFrom")}</Label>
                <Input type="time" value={formSendTimeStart} onChange={(e) => setFormSendTimeStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("windowTo")}</Label>
                <Input type="time" value={formSendTimeEnd} onChange={(e) => setFormSendTimeEnd(e.target.value)} />
              </div>
            </div>
          )}

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>{t("showOriginalOnReplyLabel")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t("showOriginalOnReplyHint")}</p>
              </div>
              <Switch checked={formShowOriginal} onCheckedChange={setFormShowOriginal} />
            </div>
            {formShowOriginal && (
              <div className="space-y-2">
                <Label>{t("showOriginalOnReplyWindow")}</Label>
                <Select value={String(formOriginalWindow)} onValueChange={(v) => setFormOriginalWindow(Number(v) || 1440)}>
                  <SelectTrigger className="w-full sm:w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="120">2h</SelectItem>
                    <SelectItem value="360">6h</SelectItem>
                    <SelectItem value="720">12h</SelectItem>
                    <SelectItem value="1440">24h</SelectItem>
                    <SelectItem value="2880">48h</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("dailyLimitLabel")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formDailyLimit > 0 ? t("dailyLimitHint") : t("dailyLimitUnlimited")}
                </p>
              </div>
              <Switch checked={formDailyLimit > 0} onCheckedChange={(v) => setFormDailyLimit(v ? 100 : 0)} />
            </div>
            {formDailyLimit > 0 && (() => {
              const [wsH = 0, wsM = 0] = formSendTimeStart.split(":").map(Number);
              const [weH = 0, weM = 0] = formSendTimeEnd.split(":").map(Number);
              const windowSeconds = ((weH * 60 + weM) - (wsH * 60 + wsM)) * 60;
              const windowCapacity = formSendTimeWindow && windowSeconds > 0 && formDelay > 0
                ? Math.floor(windowSeconds / formDelay)
                : 0;
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {[50, 100, 200, 500].map((p) => (
                      <Button
                        key={p}
                        type="button"
                        size="sm"
                        variant={formDailyLimit === p ? "default" : "outline"}
                        onClick={() => setFormDailyLimit(p)}
                      >
                        {p}
                      </Button>
                    ))}
                    <Input
                      type="number"
                      min={1}
                      className="w-28"
                      value={formDailyLimit}
                      onChange={(e) => setFormDailyLimit(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                  {windowCapacity > 0 && formDailyLimit > windowCapacity && (
                    <p className="text-xs text-amber-600">{t("dailyLimitCapacityWarning", { capacity: windowCapacity })}</p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* WABA or regular messages */}
          {isWabaSession ? (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Canal WABA: campanhas enviam apenas templates aprovados.
              </div>
              <div className="space-y-2">
                <Label>{t("template")}</Label>
                <SearchableSelect
                  options={templates.map((tmpl) => ({ value: `${tmpl.name}|${tmpl.language}`, label: `${tmpl.name} (${tmpl.language})` }))}
                  value={formTemplate ? `${formTemplate.name}|${formTemplate.language}` : ""}
                  onValueChange={(v) => {
                    const [name, lang] = v.split("|");
                    const tmpl = templates.find((x) => x.name === name && x.language === lang);
                    setFormTemplate(tmpl ?? null);
                    setFormTemplateVars({});
                  }}
                  placeholder={loadingTemplates ? t("loadingTemplates") : templates.length === 0 ? t("wabaChannel") : t("template")}
                  disabled={loadingTemplates}
                />
                {!loadingTemplates && formSessionId && isWabaSession && templates.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("noApprovedTemplates")}</p>
                )}
              </div>

              {/* Ficha de cobrança — só aparece em template ORDER_DETAILS */}
              {isOrderDetailsSelected && formTemplate && (
                <div className="space-y-2 rounded-lg border p-4 bg-muted/30">
                  <div>
                    <Label className="text-sm font-medium">{tOrder("sectionTitle")}</Label>
                    <p className="text-xs text-muted-foreground">{tOrder("sectionHint")}</p>
                  </div>
                  <OrderDetailsFields
                    key={`${formTemplate.name}-${formTemplate.language}`}
                    value={formOrderDetails}
                    onChange={setFormOrderDetails}
                    compact
                    bulkWarning
                  />
                </div>
              )}

              {/* Template vars + preview side by side */}
              {formTemplate && (
                <div className="flex flex-col md:flex-row gap-5 items-start">
                  {/* Left: var fields */}
                  <div className="flex-1 min-w-0">
                    {templateVarFields.length > 0 && (
                      <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                        <p className="text-sm font-medium">{t("templateVars")}</p>
                        <p className="text-xs text-muted-foreground">{t("templateVarsDesc")}</p>
                        {templateVarFields.map((field) => (
                          <div key={field.key} className="space-y-1">
                            <Label className="text-xs">{field.label}</Label>
                            {field.key === "header_url" ? (
                              <div className="flex gap-2">
                                <Input
                                  value={formTemplateVars[field.key] || ""}
                                  onChange={(e) => setFormTemplateVars((p) => ({ ...p, [field.key]: e.target.value }))}
                                  placeholder="https://... ou selecione da galeria"
                                  className="h-8 text-sm flex-1"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 shrink-0 gap-1"
                                  onClick={() => setGalleryOpen(true)}
                                >
                                  <FolderOpen className="w-3.5 h-3.5" />
                                  {t("galleryBtn")}
                                </Button>
                              </div>
                            ) : (
                              <Input
                                value={formTemplateVars[field.key] || ""}
                                onChange={(e) => setFormTemplateVars((p) => ({ ...p, [field.key]: e.target.value }))}
                                placeholder={`{{name}} ou valor fixo`}
                                className="h-8 text-sm"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {templateVarFields.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t("templateVarsDesc")}</p>
                    )}
                  </div>

                  {/* Right: template preview */}
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("preview")}</p>
                    <TemplateMobilePreview template={previewTemplate} />
                  </div>
                </div>
              )}

              {/* Gallery picker dialog */}
              <GalleryPickerWithUploadDialog
                open={galleryOpen}
                onOpenChange={setGalleryOpen}
                onPick={handlePickGalleryItem}
                {...wabaHeaderFormatToGalleryParams(
                  (formTemplate?.components as Array<{ type?: string; format?: string }> | undefined)?.find((c) => c.type === "HEADER")?.format
                )}
              />
            </>
          ) : isEmailSession ? (
            <div className="space-y-4">
              {/* ── Modo e-mail (PLANO_EMAIL_MASSA §5.2) ─────────────────── */}
              <div className="rounded-lg border p-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{tEmail("templateLabel")}</Label>
                    <Select
                      value={formEmailTemplateId || "none"}
                      onValueChange={(v) => handlePickEmailTemplate(v === "none" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={tEmail("templateFree")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tEmail("templateFree")}</SelectItem>
                        {emailTemplates.map((tpl) => (
                          <SelectItem key={tpl.id} value={String(tpl.id)}>{tpl.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{tEmail("templateHint")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{tEmail("subjectLabel")}</Label>
                    <Input
                      value={formEmailSubject}
                      onChange={(e) => setFormEmailSubject(e.target.value)}
                      placeholder={tEmail("subjectPlaceholder")}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{tEmail("bodyLabel")}</Label>
                  {loadingEmailBody ? (
                    <Skeleton className="h-[260px] w-full" />
                  ) : (
                    <EmailBodyField
                      value={formEmailHtml}
                      onChange={setFormEmailHtml}
                      seed={emailBodySeed}
                      capabilities={emailEditorCaps}
                    />
                  )}
                </div>

                {formEmailAttachments.length > 0 && (
                  <div className="space-y-1">
                    <Label>{tEmail("attachmentsLabel")}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {formEmailAttachments.map((att) => (
                        <Badge key={att.key} variant="secondary" className="gap-1">
                          {att.filename}
                          <button
                            type="button"
                            className="ml-1 text-muted-foreground hover:text-destructive"
                            onClick={() => setFormEmailAttachments((prev) => prev.filter((a) => a.key !== att.key))}
                            aria-label={tEmail("removeAttachment")}
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{tEmail("attachmentsHint")}</p>

                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <Label>{tEmail("unsubLabel")}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{tEmail("unsubHint")}</p>
                  </div>
                  <Switch checked={formUnsubFooter} onCheckedChange={setFormUnsubFooter} />
                </div>

                <p className="text-xs text-muted-foreground">{tEmail("skipNote")}</p>
              </div>

              {/* ── Ações quando o contato responder (replyActions §7) ────── */}
              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <Label>{tEmail("replyActionsTitle")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{tEmail("replyActionsHint")}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{tEmail("raQueue")}</Label>
                    <Select value={raQueueId || "none"} onValueChange={(v) => setRaQueueId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tEmail("raNone")}</SelectItem>
                        {raQueues.map((q) => (
                          <SelectItem key={q.id} value={String(q.id)}>{q.queue}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{tEmail("raUser")}</Label>
                    <Select value={raUserId || "none"} onValueChange={(v) => setRaUserId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tEmail("raNone")}</SelectItem>
                        {raUsers.map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{tEmail("raKanban")}</Label>
                    <Select value={raKanbanId || "none"} onValueChange={(v) => setRaKanbanId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tEmail("raNone")}</SelectItem>
                        {raKanbans.map((k) => (
                          <SelectItem key={k.id} value={String(k.id)}>{k.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{tEmail("raStage")}</Label>
                    <Select value={raStageId || "none"} onValueChange={(v) => setRaStageId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tEmail("raNone")}</SelectItem>
                        {raStages.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.pipeline?.name ? `${s.pipeline.name} — ${s.name}` : s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {raTags.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{tEmail("raTags")}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {raTags.map((tag) => {
                        const active = raTagIds.includes(tag.id);
                        return (
                          <Badge
                            key={tag.id}
                            variant={active ? "default" : "outline"}
                            className="cursor-pointer select-none"
                            onClick={() =>
                              setRaTagIds((prev) =>
                                active ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                              )
                            }
                          >
                            {tag.tag}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{tEmail("raWebhook")}</Label>
                    <Input
                      value={raWebhookUrl}
                      onChange={(e) => setRaWebhookUrl(e.target.value)}
                      placeholder="https://"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{tEmail("raWindow")}</Label>
                    <Select value={String(raWindow)} onValueChange={(v) => setRaWindow(Number(v) || 4320)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1440">24h</SelectItem>
                        <SelectItem value="2880">48h</SelectItem>
                        <SelectItem value="4320">72h</SelectItem>
                        <SelectItem value="10080">7d</SelectItem>
                        <SelectItem value="43200">30d</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6">
              {/* Messages panel */}
              <div className="flex-1 space-y-4 min-w-0">
                <div className="space-y-2">
                  <Label>{t("mediaOptional")}</Label>
                  {showSavedMedia && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {t("mediaCurrent")}
                        </p>
                        {/* rel sem "noreferrer" de propósito: o /public do backend
                            libera pelo Referer do front — com noreferrer a aba nova
                            abre em 403. "noopener" já barra o window.opener. */}
                        <a
                          href={savedMediaUrl}
                          target="_blank"
                          rel="noopener"
                          className="block truncate text-xs text-primary hover:underline"
                          title={savedMediaName}
                        >
                          {savedMediaName}
                        </a>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 text-destructive hover:text-destructive"
                        onClick={() => setFormRemoveMedia(true)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("mediaRemove")}
                      </Button>
                    </div>
                  )}
                  {!!savedMediaUrl && formRemoveMedia && !formMediaFile && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2">
                      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                        {t("mediaWillBeRemoved")}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0"
                        onClick={() => setFormRemoveMedia(false)}
                      >
                        {t("mediaUndoRemove")}
                      </Button>
                    </div>
                  )}
                  <Input
                    type="file"
                    accept=".mp3,.mp4,.ogg,.jpg,.png,.jpeg,.pdf,.doc,.docx,.xls,.xlsx,.zip,.ppt,.pptx,image/*"
                    onChange={(e) => {
                      setFormMediaFile(e.target.files?.[0] ?? null);
                      setFormRemoveMedia(false);
                    }}
                  />
                  {formMediaFile && (
                    <p className="text-xs text-muted-foreground">{formMediaFile.name}</p>
                  )}
                  {showSavedMedia && (
                    <p className="text-[11px] text-muted-foreground">{t("mediaKeepHint")}</p>
                  )}
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2 flex gap-2 items-start text-xs text-blue-700 dark:text-blue-300">
                  <Shuffle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-medium">{t("messagesVariationTitle")}</p>
                    <p>{t("messagesVariationNote")}</p>
                  </div>
                </div>
                {messageLabels.map((label, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setPreviewMsg(i)}
                        className={`text-sm font-medium px-2 py-0.5 rounded transition-colors ${previewMsg === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {label}
                        <span className={previewMsg === i ? "ml-0.5" : "ml-0.5 text-destructive"}>*</span>
                      </button>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                          onClick={() => openAiDialog(i)}
                          title={tCampaignAI("title")}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          IA
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 text-xs">{t("variables")}</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {getMessageVars(t).map((v) => (
                              <DropdownMenuItem key={v.value} onClick={() => insertVar(v.value, i)}>
                                {v.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <Textarea
                      ref={msgRefs[i]}
                      value={messages[i]}
                      onChange={(e) => setMessages[i](e.target.value)}
                      onFocus={() => setPreviewMsg(i)}
                      placeholder={t("messagePlaceholder")}
                      rows={3}
                      aria-invalid={messageInvalid[i] || undefined}
                      className={cn("text-sm", messageInvalid[i] && "border-destructive focus-visible:ring-destructive")}
                    />
                  </div>
                ))}
              </div>

              {/* WhatsApp Preview panel */}
              <div className="flex flex-col items-center gap-3 md:min-w-[230px]">
                <div className="text-center">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("preview")}</p>
                  <div className="flex gap-1 justify-center mb-3">
                    {["Msg 1", "Msg 2", "Msg 3"].map((lbl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPreviewMsg(i)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${previewMsg === i ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <WhatsAppPreview
                  message={messages[previewMsg] || ""}
                  mediaFile={formMediaFile}
                  mediaUrl={showSavedMedia ? savedMediaUrl : undefined}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">{t("cancel")}</Button>
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? t("saving") : (isEdit ? t("save") : t("createCampaign"))}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* AI Campaign Generator Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              {tCampaignAI("title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={tCampaignAI("placeholder")}
              rows={4}
              className="text-sm"
              disabled={aiGenerating}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)} disabled={aiGenerating}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleGenerateAICampaign}
              disabled={!aiPrompt.trim() || aiGenerating}
              className="gap-1.5 bg-violet-600 hover:bg-violet-700"
            >
              {aiGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {aiGenerating ? tCampaignAI("generating") : tCampaignAI("generate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// ─── Contact Select Dialog ────────────────────────────────────────────────────

interface ContactSelectDialogProps {
  open: boolean;
  campaignId: number | null;
  campaignStatus?: string;
  onClose: () => void;
  onAdded: () => void;
}

function ContactSelectDialog({ open, campaignId, campaignStatus, onClose, onAdded }: ContactSelectDialogProps) {
  const t = useTranslations("campanhasPage");
  const tErrors = useTranslations("errors");
  const tAddr = useTranslations("addressFilter");
  const { isLiveMode } = useLiveMode();
  const [tags, setTags] = useState<{ id: number; name: string; tag?: string }[]>([]);
  const [wallets, setWallets] = useState<{ id: number; name: string }[]>([]);
  const [contactFilters, setContactFilters] = useState({
    startDate: format(sub(new Date(), { days: 30 }), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    ddds: [] as string[],
    tags: [] as number[],
    wallets: [] as number[],
    searchParam: "",
  });
  // Endereço do cadastro (bairro, cidade, UF do cadastro) APLICADO: só ele vai na busca.
  const [addressFilter, setAddressFilter] = useState<AddressFilter>(EMPTY_ADDRESS_FILTER);
  // Retrato do filtro com que a lista foi montada: "Adicionar" exige que seja o aplicado.
  const [listAddressFilter, setListAddressFilter] = useState<AddressFilter | null>(null);
  const [addressUnsupported, setAddressUnsupported] = useState(false);
  // Filtro digitado e ainda não aplicado: "Adicionar" espera o "Aplicar".
  const [addressDraftPending, setAddressDraftPending] = useState(false);
  // Geração da busca: resposta de busca velha (ou de antes de reabrir o diálogo) é descartada.
  const loadGenRef = useRef(0);
  const [contacts, setContacts] = useState<ContactForCampaign[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<ContactForCampaign[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [adding, setAdding] = useState(false);

  const canEdit = !campaignStatus || campaignStatus === "pending" || campaignStatus === "canceled";

  useEffect(() => {
    if (!open) return;
    loadGenRef.current += 1;
    setLoadingContacts(false);
    setSelectedContacts([]);
    setContacts([]);
    setListAddressFilter(null);
    setAddressUnsupported(false);
    Promise.all([fetchTags(), fetchAllUsers()]).then(([tagsRes, usersRes]) => {
      setTags((tagsRes?.data ?? []) as { id: number; name: string; tag?: string }[]);
      const usersArr = usersRes.data?.users ?? [];
      setWallets(usersArr as { id: number; name: string }[]);
    }).catch(() => { toast.error(tErrors("loadFailed")); });
  }, [open]);

  // Toda busca zera a seleção e a lista: "Todos" marcado na lista anterior nunca vira público
  // da lista nova. Sem o eco, com filtro de endereço ativo, a lista fica vazia (backend antigo
  // ignora o filtro e devolveria o público sem ele).
  const loadContacts = async (filter: AddressFilter = addressFilter) => {
    const gen = ++loadGenRef.current;
    setLoadingContacts(true);
    setSelectedContacts([]);
    setContacts([]);
    setListAddressFilter(null);
    try {
      const res = await fetchContactsReportCampaign<ContactForCampaign>({
        startDate: contactFilters.startDate,
        endDate: contactFilters.endDate,
        ddds: contactFilters.ddds.length ? contactFilters.ddds : undefined,
        tags: contactFilters.tags.length ? contactFilters.tags : undefined,
        wallets: contactFilters.wallets.length ? contactFilters.wallets : undefined,
        searchParam: contactFilters.searchParam || undefined,
        ...toAddressQuery(filter),
      });
      if (gen !== loadGenRef.current) return;
      assertAddressFilterEcho(filter, res?.data);
      const list = (res?.data?.contacts ?? res?.data ?? []) as ContactForCampaign[];
      setSelectedContacts([]);
      setContacts(Array.isArray(list) ? list : []);
      setListAddressFilter(filter);
      setAddressUnsupported(false);
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      setSelectedContacts([]);
      setContacts([]);
      if (err instanceof AddressFilterUnsupportedError) {
        setAddressUnsupported(true);
        toast.error(tAddr("unsupported"));
        return;
      }
      toast.error(t("errorLoad"));
    } finally {
      if (gen === loadGenRef.current) setLoadingContacts(false);
    }
  };

  // Aplicar (ou limpar) o filtro de endereço refaz a busca com os demais filtros da tela.
  const handleAddressFilterChange = (next: AddressFilter) => {
    setAddressFilter(next);
    void loadContacts(next);
  };

  const toggleContact = (c: ContactForCampaign) => {
    setSelectedContacts((prev) =>
      prev.some((x) => x.id === c.id) ? prev.filter((x) => x.id !== c.id) : [...prev, c]
    );
  };

  const toggleAll = () => {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts([...contacts]);
    }
  };

  const handleAdd = async () => {
    if (!campaignId || selectedContacts.length === 0) { toast.error(t("selectAtLeastOne")); return; }
    // Lista ainda carregando, montada com outro filtro de endereço ou filtro digitado sem
    // "Aplicar": nada é gravado.
    if (loadingContacts || addressDraftPending || !sameAddressFilter(listAddressFilter, addressFilter)) {
      toast.warning(tAddr("staleList"));
      return;
    }
    setAdding(true);
    try {
      await addCampaignContacts(campaignId, selectedContacts.map((c) => ({ id: c.id, name: c.name || "" })));
      toast.success(t("addNContacts", { n: selectedContacts.length }));
      onAdded();
      onClose();
    } catch {
      toast.error(t("errorAddContacts"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[92vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("addContactsDialog")}</DialogTitle>
          <DialogDescription>
            {canEdit ? t("filters") : t("addContactsDialog")}
          </DialogDescription>
        </DialogHeader>

        {canEdit && (
          <fieldset className="rounded-lg border p-4 space-y-3 shrink-0">
            <legend className="px-2 font-medium text-sm">{t("filters")}</legend>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("startDate")}</Label>
                <Input type="date" value={contactFilters.startDate}
                  onChange={(e) => setContactFilters((p) => ({ ...p, startDate: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("endDate")}</Label>
                <Input type="date" value={contactFilters.endDate}
                  onChange={(e) => setContactFilters((p) => ({ ...p, endDate: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("tags")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between font-normal h-8 text-xs">
                      {contactFilters.tags.length ? `${contactFilters.tags.length} tag(s)` : "Todas"}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2 max-h-52 overflow-auto">
                    {tags.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted text-sm">
                        <Checkbox
                          checked={contactFilters.tags.includes(t.id)}
                          onCheckedChange={(checked) =>
                            setContactFilters((p) => ({
                              ...p,
                              tags: checked ? [...p.tags, t.id] : p.tags.filter((id) => id !== t.id),
                            }))
                          }
                        />
                        {t.tag || t.name}
                      </label>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("wallets")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between font-normal h-8 text-xs">
                      {contactFilters.wallets.length ? `${contactFilters.wallets.length} carteira(s)` : "Todas"}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2 max-h-52 overflow-auto">
                    {wallets.map((w) => (
                      <label key={w.id} className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted text-sm">
                        <Checkbox
                          checked={contactFilters.wallets.includes(w.id)}
                          onCheckedChange={(checked) =>
                            setContactFilters((p) => ({
                              ...p,
                              wallets: checked ? [...p.wallets, w.id] : p.wallets.filter((id) => id !== w.id),
                            }))
                          }
                        />
                        {w.name}
                      </label>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-1.5 sm:w-[180px] sm:shrink-0">
                <Label className="text-xs">{t("stateDdd")}</Label>
                <SearchableSelect
                  options={[{ value: "__all__", label: t("allStates") }, ...estadosBR.map((e) => ({ value: e.sigla, label: e.nome }))]}
                  value={contactFilters.ddds.join(",") || "__all__"}
                  onValueChange={(v) =>
                    setContactFilters((p) => ({ ...p, ddds: v === "__all__" ? [] : [v] }))
                  }
                  placeholder={t("stateDdd")}
                  className="w-[180px] h-8 text-sm"
                />
              </div>
              <div className="flex flex-1 gap-2">
                <Input
                  placeholder={t("searchNamePhone")}
                  value={contactFilters.searchParam}
                  onChange={(e) => setContactFilters((p) => ({ ...p, searchParam: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && loadContacts()}
                  className="flex-1 h-8 text-sm"
                />
                <Button size="sm" onClick={() => void loadContacts()} disabled={loadingContacts} className="h-8">
                  {loadingContacts ? "..." : t("search")}
                </Button>
              </div>
            </div>
            <div className="space-y-2 border-t pt-3">
              <AddressFilterFields
                value={addressFilter}
                onChange={handleAddressFilterChange}
                mode="apply"
                layout="row"
                showTitle
                disabled={adding}
                onPendingChange={setAddressDraftPending}
              />
              {addressUnsupported && (
                <p role="alert" className="text-xs text-destructive">{tAddr("unsupported")}</p>
              )}
            </div>
          </fieldset>
        )}

        {contacts.length > 0 && (
          <div className="flex-1 overflow-auto border rounded-lg min-h-[180px]">
            <Table>
              <TableHeader>
                <TableRow>
                  {canEdit && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedContacts.length === contacts.length && contacts.length > 0}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("whatsapp")}</TableHead>
                  <TableHead>{t("tags")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => canEdit && toggleContact(c)}
                    className={canEdit ? "cursor-pointer" : ""}
                  >
                    {canEdit && (
                      <TableCell>
                        <Checkbox
                          checked={selectedContacts.some((x) => x.id === c.id)}
                          onCheckedChange={() => toggleContact(c)}
                        />
                      </TableCell>
                    )}
                    <TableCell className={cn(isLiveMode && "live-blur-text")}>{c.name || "—"}</TableCell>
                    <TableCell className={cn(isLiveMode && "live-blur-text")}>{c.number}</TableCell>
                    <TableCell className={cn("text-muted-foreground text-sm", isLiveMode && "live-blur-text")}>
                      {(c.tags ?? []).map((t) => t.tag || t.name).join(", ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {contacts.length === 0 && canEdit && (
          <div className="flex-1 flex items-center justify-center border rounded-lg min-h-[120px]">
            {loadingContacts ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-sm text-muted-foreground">Use os filtros acima e clique em Buscar</p>
            )}
          </div>
        )}

        {canEdit && contacts.length > 0 && (
          <p className="text-sm text-muted-foreground shrink-0">
            {selectedContacts.length} de {contacts.length} contato(s) selecionado(s)
          </p>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">{t("cancel")}</Button>
          {canEdit && (
            <Button onClick={handleAdd} disabled={adding || loadingContacts || selectedContacts.length === 0} className="w-full sm:w-auto">
              {adding ? t("saving") : t("addNContacts", { n: selectedContacts.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campaign Contacts View Dialog ────────────────────────────────────────────

interface CampaignContactsViewProps {
  open: boolean;
  campaign: Campaign | null;
  onClose: () => void;
  onRefresh: () => void;
}

function CampaignContactsViewDialog({ open, campaign, onClose, onRefresh }: CampaignContactsViewProps) {
  const t = useTranslations("campanhasPage");
  const statusMap = getStatusMap(t);
  const { isLiveMode } = useLiveMode();
  const [contacts, setContacts] = useState<ContactForCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [addContactsOpen, setAddContactsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const canEdit = campaign?.status === "pending" || campaign?.status === "canceled";

  const loadContacts = useCallback(async () => {
    if (!campaign?.id) return;
    setLoading(true);
    try {
      const res = await fetchCampaignContacts(campaign.id);
      const arr = res?.data ?? [];
      setContacts(Array.isArray(arr) ? arr : []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [campaign?.id]);

  useEffect(() => {
    if (open) {
      loadContacts();
      setSearch("");
    }
  }, [open, loadContacts]);

  const handleDeleteContact = async (contactId: number) => {
    if (!campaign?.id) return;
    setDeletingId(contactId);
    try {
      await deleteCampaignContact(campaign.id, contactId);
      toast.success(t("contactsCleared"));
      loadContacts();
      onRefresh();
    } catch {
      toast.error(t("errorClearContacts"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!campaign?.id) return;
    try {
      await deleteAllCampaignContacts(campaign.id);
      toast.success(t("contactsCleared"));
      loadContacts();
      onRefresh();
    } catch {
      toast.error(t("errorClearContacts"));
    }
  };

  const filtered = contacts.filter(
    (c) =>
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.number || "").includes(search) ||
      ((c as { email?: string }).email || "").toLowerCase().includes(search.toLowerCase())
  );

  const getAckLabel = (contact: ContactForCampaign) => {
    const cc = contact.campaignContacts?.[0];
    const ack = cc?.ack;
    if (ack == null) return "—";
    if (isSkippedActiveConversation(cc)) return t("ackSkippedActiveConversation");
    const emailSkip = getEmailSkipMarker(cc as any);
    if (emailSkip === "optout") return t("ackOptOut");
    if (emailSkip === "no_email") return t("ackNoEmail");
    if (emailSkip === "duplicate_email") return t("ackDuplicateEmail");
    // Confirmação do provedor tem precedência sobre o `ack`: em WABA/BSP o `ack` é
    // gravado no aceite da solicitação e sozinho não distingue aceite de entrega.
    const provider = String(cc?.providerStatus || "").toLowerCase();
    if (provider === "failed") return t("ackError");
    if (provider === "read") return t("ackRead");
    if (provider === "delivered") return t("ackReceived");
    if (provider === "sent") return t("ackSent");
    return getAckLabels(t)[String(ack)] ?? `ACK ${ack}`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Contatos — {campaign?.name}
            </DialogTitle>
            <DialogDescription>
              Início: {campaign?.start ? formatDate(campaign.start) : "—"} · Status: {campaign?.status ? (statusMap[campaign.status]?.label ?? campaign.status) : "—"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t("searchContacts")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button size="sm" variant="outline" onClick={loadContacts} className="h-8">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {canEdit && (
              <>
                <Button size="sm" variant="destructive" onClick={handleDeleteAll} className="h-8">
                  {t("clearAll")}
                </Button>
                <Button size="sm" onClick={() => setAddContactsOpen(true)} className="h-8">
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t("addContacts")}
                </Button>
              </>
            )}
          </div>

          <div className="flex-1 overflow-auto border rounded-lg">
            {loading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-muted-foreground">
                  {contacts.length === 0 ? "Nenhum contato vinculado" : "Nenhum contato corresponde à busca"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead>{t("colNumber")}</TableHead>
                    <TableHead>{t("colSendStatus")}</TableHead>
                    {canEdit && <TableHead className="w-16">{t("colAction")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className={cn("font-medium", isLiveMode && "live-blur-text")}>{c.name || "—"}</TableCell>
                      <TableCell className={cn(isLiveMode && "live-blur-text")}>{c.number || (c as { email?: string }).email || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{getAckLabel(c)}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteContact(c.id)}
                            disabled={deletingId === c.id}
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <p className="text-xs text-muted-foreground shrink-0">{contacts.length} contato(s) vinculado(s)</p>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactSelectDialog
        open={addContactsOpen}
        campaignId={campaign?.id ?? null}
        campaignStatus={campaign?.status}
        onClose={() => setAddContactsOpen(false)}
        onAdded={() => { loadContacts(); onRefresh(); }}
      />
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampanhasPage() {
  const allowed = usePageAccess("campanhas");
  if (!allowed) return <AccessDenied />;
  const { density, updateDensity, rowClassName, cellClassName } = useTableDensity();
  const t = useTranslations("campanhasPage");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Campaign[]>([]);
  const [sessions, setSessions] = useState<Whatsapp[]>([]);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [contactsViewCampaign, setContactsViewCampaign] = useState<Campaign | null>(null);
  const [contactsViewOpen, setContactsViewOpen] = useState(false);
  const [addContactsCampaignId, setAddContactsCampaignId] = useState<number | null>(null);
  const [addContactsStatus, setAddContactsStatus] = useState<string | undefined>();
  const [addContactsOpen, setAddContactsOpen] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      const { data: res } = await fetchCampaigns({ page: 1, limit: 100 });
      const arr = res?.campaigns ?? res?.data ?? (Array.isArray(res) ? res : []);
      setData(Array.isArray(arr) ? arr : []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      // Sonda de capacidade (PLANO_EMAIL_MASSA D17): backend antigo não tem
      // /email-templates — nesse caso o modo e-mail NÃO aparece (o Yup antigo
      // devolveria 400, nunca 404, então sniff de erro no save não funciona).
      let emailCapable = false;
      try {
        await fetchEmailTemplates({ limit: 1 });
        emailCapable = true;
      } catch (probeErr: unknown) {
        // Só 404 (backend antigo) e 402 (fora do plano) desligam o modo e-mail;
        // erro transitório (timeout/500) não pode sumir com o canal de uma
        // campanha de e-mail existente (auditoria pós-impl. #10)
        const { status } = readApiError(probeErr);
        emailCapable = status !== 404 && status !== 402;
      }
      const { data: res } = await fetchWhatsapps();
      const arr = Array.isArray(res) ? res : (res as any)?.data ?? [];
      // Backend SendCampaignServiceZPRO já tem branches gupshup/dialog360 — incluir no filtro.
      const allowedTypes = [
        "whatsapp", "baileys", "zapo", "meow", "evo", "evogo", "zapi", "uazapi",
        "waba", "whatsapp-api", "360", "gupshup", "dialog360",
        ...(emailCapable ? ["email", "webmail"] : [])
      ];
      const filtered = arr.filter((w: Whatsapp) => allowedTypes.includes(w.type ?? ""));
      setSessions(filtered);
    } catch {
      toast.error("Erro ao carregar sessões");
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
    loadSessions();
  }, [loadCampaigns, loadSessions]);

  // ── Polling: auto-refresh while any campaign is sending ──────────────────────
  const SENDING_STATUSES = ["processing", "running"];
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const hasSending = data.some((c) => SENDING_STATUSES.includes(c.status));
    if (hasSending) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          loadCampaigns();
        }, 8000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loadCampaigns]);

  const handleDuplicate = async (id: number) => {
    try {
      await duplicateCampaign(id);
      toast.success(t("duplicated"));
      await loadCampaigns();
    } catch {
      toast.error(t("errorDuplicate"));
    }
  };

  const handleStart = async (campaign: Campaign) => {
    if ((campaign.contactsCount ?? 0) === 0) {
      toast.error(t("addContactsFirst"));
      return;
    }
    if (campaign.start && new Date(campaign.start) < new Date()) {
      toast.error(t("startDatetime"));
      return;
    }
    try {
      await startCampaign(campaign.id);
      toast.success(t("campaignStarted"));
      await loadCampaigns();
    } catch {
      toast.error(t("errorStart"));
    }
  };

  const handlePause = async (campaign: Campaign) => {
    try {
      await pauseCampaign(campaign.id);
      toast.success(t("campaignPaused"));
      await loadCampaigns();
    } catch {
      toast.error(t("errorPause"));
    }
  };

  const handleResume = async (campaign: Campaign) => {
    try {
      await resumeCampaign(campaign.id);
      toast.success(t("campaignResumed"));
      await loadCampaigns();
    } catch {
      toast.error(t("errorResume"));
    }
  };

  const handleCancel = async (campaign: Campaign) => {
    if (campaign.status === "processing") {
      toast.error("Não é possível cancelar uma campanha em andamento");
      return;
    }
    try {
      await cancelCampaign(campaign.id);
      toast.success(t("campaignCancelled"));
      await loadCampaigns();
    } catch {
      toast.error(t("errorCancel"));
    }
  };

  const handleSkipMessage = async (campaign: Campaign) => {
    try {
      await skipCampaignMessage(campaign.id);
      toast.success("Mensagem pulada com sucesso");
      await loadCampaigns();
    } catch {
      toast.error("Erro ao pular mensagem");
    }
  };

  const handleForceFinish = async (campaign: Campaign) => {
    try {
      await forceFinishCampaign(campaign.id);
      toast.success("Campanha finalizada");
      await loadCampaigns();
    } catch {
      toast.error("Erro ao finalizar campanha");
    }
  };

  type ReportContact = {
    name?: string; number?: string | null; email?: string | null; ack?: number; body?: string; messageRandom?: string; mediaName?: string;
    sentAt?: string | null; messageId?: string | null; providerStatus?: string | null; providerError?: string | null;
  };
  type CampaignReport = {
    id: number; status: string; start: string;
    channelType?: string | null; acceptanceOnly?: boolean;
    totalContacts: number; delivered: number; pending: number; failed: number;
    accepted?: number; awaitingConfirmation?: number;
    confirmedSent?: number; confirmedDelivered?: number; confirmedRead?: number; confirmedFailed?: number;
    optOut?: number;
    contacts: ReportContact[];
  };

  const isEmailReport = (report: CampaignReport) =>
    ["email", "webmail"].includes(String(report.channelType || "").toLowerCase());

  // Canal e-mail: a coluna de destino é o e-mail, não o número
  const reportRecipient = (report: CampaignReport, c: ReportContact) =>
    isEmailReport(report) ? (c.email || "—") : (c.number || "—");

  // Em WABA/BSP o `ack` positivo é gravado quando o provedor ACEITA a solicitação — não
  // prova entrega. A confirmação real chega depois, por webhook, em `providerStatus`.
  // Sem esse cuidado o relatório afirmava "Entregue" para todo destinatário aceito.
  const ackStatus = (c: ReportContact, acceptanceOnly = false) => {
    if (isSkippedActiveConversation(c)) return t("ackSkippedActiveConversation");
    const emailSkip = getEmailSkipMarker(c as any);
    if (emailSkip === "optout") return t("ackOptOut");
    if (emailSkip === "no_email") return t("ackNoEmail");
    if (emailSkip === "duplicate_email") return t("ackDuplicateEmail");

    const provider = String(c.providerStatus || "").toLowerCase();
    if (provider === "failed") return t("ackError");
    if (provider === "read") return t("ackRead");
    if (provider === "delivered") return t("ackReceived");
    if (provider === "sent") return t("ackSent");

    if (c.ack === -1) return t("ackError");
    if (c.ack === 0) return t("ackPending");
    // Aceito pelo provedor, ainda sem nenhum status de entrega.
    if (acceptanceOnly) return t("reportStatusAccepted");
    // Canais em que o `ack` vem do próprio WhatsApp: continua valendo como entrega.
    if (c.ack === 1) return t("ackSent");
    if (c.ack === 2) return t("ackReceived");
    return t("ackRead");
  };

  // Status cru devolvido pelo provedor, sem interpretação — é o que o cliente confere
  // contra o painel da Meta. "—" quando ainda não houve nenhum retorno.
  // `optout` ganha rótulo traduzido (nunca a string crua no PDF/CSV).
  const providerStatusCell = (c: ReportContact) =>
    String(c.providerStatus || "").toLowerCase() === "optout"
      ? t("ackOptOut")
      : (c.providerStatus || "—");

  const sentAtCell = (c: ReportContact) =>
    c.sentAt ? new Date(c.sentAt).toLocaleString("pt-BR") : "—";

  // Corpo exibido nos exports: registro pulado nunca imprime a string crua "active_conversation"
  const reportBody = (c: ReportContact, fallback: string) =>
    isSkippedActiveConversation(c) ? t("ackSkippedActiveConversation") : (c.body || fallback);

  const handleDownloadPDF = async (campaign: Campaign) => {
    try {
      const res = await getCampaignReport(campaign.id);
      const report = res.data as CampaignReport;

      const doc = new jsPDF();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(18);
      doc.text("Relatório de Campanha", 10, 15);

      doc.setFontSize(11);
      let y = 26;
      doc.text(`ID: ${report.id}`, 10, y); y += 7;
      doc.text(`Status: ${report.status}`, 10, y); y += 7;
      doc.text(`Início: ${report.start ? new Date(report.start).toLocaleString("pt-BR") : "—"}`, 10, y); y += 7;
      doc.text(`Total de contatos: ${report.totalContacts}`, 10, y); y += 7;
      if (report.acceptanceOnly) {
        // Canal em que "enviada" = aceite do provedor: o resumo separa o que foi aceito
        // do que teve entrega/leitura efetivamente confirmada por webhook.
        doc.text(`${t("reportSummaryAccepted")}: ${report.accepted ?? report.delivered}`, 10, y); y += 7;
        doc.text(`${t("reportSummaryConfirmedDelivered")}: ${report.confirmedDelivered ?? 0}`, 10, y); y += 7;
        doc.text(`${t("reportSummaryConfirmedRead")}: ${report.confirmedRead ?? 0}`, 10, y); y += 7;
        doc.text(`${t("reportSummaryAwaiting")}: ${report.awaitingConfirmation ?? 0}`, 10, y); y += 7;
      } else {
        doc.text(`Entregues: ${report.delivered}`, 10, y); y += 7;
      }
      doc.text(`Pendentes: ${report.pending}`, 10, y); y += 7;
      doc.text(`Falhas: ${report.failed}`, 10, y); y += 7;
      if (report.acceptanceOnly) {
        doc.setFontSize(8);
        doc.setTextColor(110);
        const note = doc.splitTextToSize(t("reportAcceptanceNote"), 190) as string[];
        note.forEach((line) => { doc.text(line, 10, y); y += 4; });
        doc.setTextColor(0);
        doc.setFontSize(11);
      }
      y += 3;

      doc.setDrawColor(80, 80, 200);
      doc.setLineWidth(0.4);
      doc.line(10, y, 200, y);
      y += 4;

      if (isEmailReport(report) && (report.optOut ?? 0) > 0) {
        doc.text(`${t("ackOptOut")}: ${report.optOut}`, 10, y); y += 7;
      }

      const body = (report.contacts || []).map((c, i) => [
        i + 1,
        c.name || "Desconhecido",
        reportRecipient(report, c),
        ackStatus(c, report.acceptanceOnly),
        sentAtCell(c),
        (isEmailReport(report)
          ? reportBody(c, "—").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
          : reportBody(c, "—")
        ).substring(0, 60).replace(/\n/g, " "),
      ]);

      autoTable(doc, {
        startY: y,
        head: [["#", "Nome", isEmailReport(report) ? t("reportColEmail") : t("reportColNumber"), "Status", t("reportColSentAt"), "Mensagem"]],
        body,
        styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [33, 102, 172], textColor: 255, fontStyle: "bold", halign: "center" },
        alternateRowStyles: { fillColor: [240, 245, 255] },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 32 },
          2: { cellWidth: 28 },
          3: { cellWidth: 24, halign: "center" },
          4: { cellWidth: 30, halign: "center" },
          5: { cellWidth: 63 },
        },
        margin: { left: 10, right: 10 },
      });

      const pages = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 10, 290);
        doc.text(`Página ${i}/${pages}`, 200, 290, { align: "right" });
      }

      doc.save(`relatorio-campanha-${report.id}.pdf`);
      toast.success("Relatório PDF exportado");
    } catch {
      toast.error("Erro ao gerar relatório PDF");
    }
  };

  const handleDownloadCSV = async (campaign: Campaign) => {
    try {
      const res = await getCampaignReport(campaign.id);
      const report = res.data as CampaignReport;
      // CSV é o material de conferência contra o painel do provedor: leva o número, o
      // status cru do provedor e o ID da mensagem, além do rótulo consolidado.
      const headers = [
        "#",
        "Nome",
        isEmailReport(report) ? t("reportColEmail") : t("reportColNumber"),
        "Status",
        t("reportColProviderStatus"),
        t("reportColSentAt"),
        t("reportColMessageId"),
        "Mensagem",
        "Mídia",
      ];
      const rows = (report.contacts || []).map((c, i) => [
        i + 1,
        c.name || "Desconhecido",
        reportRecipient(report, c),
        ackStatus(c, report.acceptanceOnly),
        providerStatusCell(c),
        sentAtCell(c),
        c.messageId || "—",
        (isEmailReport(report)
          ? reportBody(c, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
          : reportBody(c, "")
        ).substring(0, 80).replace(/\n/g, " "),
        c.mediaName || "—",
      ]);
      let csv = headers.join(";") + "\n";
      rows.forEach((row) => {
        csv += row.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(";") + "\n";
      });
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-campanha-${campaign.id}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Relatório CSV exportado");
    } catch {
      toast.error("Erro ao gerar relatório CSV");
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await deleteCampaign(deleteId);
      setData((prev) => prev.filter((c) => c.id !== deleteId));
      toast.success(t("campaignDeleted"));
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setDeleting(false);
      setDeleteId(null);
      setDeleteName("");
    }
  };

  const openEdit = (campaign: Campaign) => {
    setEditCampaign(campaign);
    setFormOpen(true);
  };

  const openContacts = (campaign: Campaign) => {
    setContactsViewCampaign(campaign);
    setContactsViewOpen(true);
  };

  const openAddContacts = (campaign: Campaign) => {
    setAddContactsCampaignId(campaign.id);
    setAddContactsStatus(campaign.status);
    setAddContactsOpen(true);
  };

  const sessionName = (id?: number) => sessions.find((s) => s.id === id)?.name ?? "—";

  const filtered = data.filter((c) =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            {
              title: t("helpS0T"),
              items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2"), t("helpS0I3"), t("helpS0I4")],
            },
            {
              title: t("helpS1T"),
              items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2"), t("helpS1I3")],
            },
            {
              title: t("helpS2T"),
              items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")],
            },
            {
              title: t("helpAiT"),
              items: [t("helpAiI0"), t("helpAiI1"), t("helpAiI2")],
            },
          ],
        }}
      >
        <Button onClick={() => { setEditCampaign(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> {t("newCampaign")}
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-[400px]" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchContacts")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={loadCampaigns} title="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <TableDensityToggle density={density} onChange={updateDensity} />
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Target}
              title={t("noData")}
              description={t("description")}
              steps={[
                { number: 1, title: t("emptyStep1") },
                { number: 2, title: t("emptyStep2") },
                { number: 3, title: t("emptyStep3") },
              ]}
            >
              <Button onClick={() => { setEditCampaign(null); setFormOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> {t("newCampaign")}
              </Button>
            </EmptyState>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>{t("colName")}</TableHead>
                      <TableHead>{t("colSession")}</TableHead>
                      <TableHead>{t("colStartAt")}</TableHead>
                      <TableHead>{t("colStatus")}</TableHead>
                      <TableHead>{t("addContacts")}</TableHead>
                      <TableHead>{t("sendingProgress")}</TableHead>
                      <TableHead className="w-[100px]">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((campaign) => {
                      const st = getStatusMap(t)[campaign.status] || { label: campaign.status, variant: "secondary" as const };
                      const total = campaign.contactsCount ?? 0;
                      // recebidas = ack IN (2,3,4) — messages confirmed as sent/delivered/read
                      // pendentesEnvio = ack=0 — queued but not sent yet
                      // pendentesEntrega = ack=1 — sent but not delivered yet
                      const sent = campaign.recebidas ?? campaign.sentCount ?? 0;
                      const pendingEnvio = campaign.pendentesEnvio ?? 0;
                      const progress = total > 0 ? Math.round((sent / total) * 100) : 0;
                      const isSending = ["processing", "running"].includes(campaign.status);
                      // Estimated time: delay * remaining contacts (pendentesEnvio still waiting to be sent)
                      const remaining = pendingEnvio;
                      const delaySeconds = campaign.delay ?? 20;
                      const estimatedSeconds = remaining * delaySeconds;
                      const estimatedMinutes = Math.round(estimatedSeconds / 60);
                      return (
                        <TableRow key={campaign.id} className={rowClassName}>
                          <TableCell className={cn("text-muted-foreground text-sm", cellClassName)}>{campaign.id}</TableCell>
                          <TableCell className={cn("font-medium", cellClassName)}>{campaign.name}</TableCell>
                          <TableCell className={cn("text-muted-foreground", cellClassName)}>{sessionName(campaign.sessionId)}</TableCell>
                          <TableCell className={cn("text-muted-foreground text-sm", cellClassName)}>{campaign.start ? formatDate(campaign.start) : "—"}</TableCell>
                          <TableCell className={cellClassName}>
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </TableCell>
                          <TableCell className={cellClassName}>{campaign.contactsCount ?? "—"}</TableCell>
                          <TableCell className={cellClassName}>
                            {total > 0 ? (
                              <div className="space-y-1 min-w-[140px]">
                                <div className="flex items-center gap-2">
                                  <Progress
                                    value={progress}
                                    className={cn("h-2 flex-1", isSending && "animate-pulse")}
                                  />
                                  <span className="text-xs text-muted-foreground shrink-0">{progress}%</span>
                                </div>
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-xs text-muted-foreground">
                                    {sent} de {total} enviados
                                  </span>
                                  {isSending && (
                                    <span className="text-xs text-muted-foreground">
                                      {estimatedMinutes > 0
                                        ? `~${estimatedMinutes}min`
                                        : "em andamento..."}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell className={cellClassName}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {/* View / Add contacts */}
                                <DropdownMenuItem onClick={() => openContacts(campaign)}>
                                  <Users className="h-4 w-4 mr-2" /> {t("view")}
                                </DropdownMenuItem>
                                {(campaign.status === "pending" || campaign.status === "canceled") && (
                                  <DropdownMenuItem onClick={() => openAddContacts(campaign)}>
                                    <Plus className="h-4 w-4 mr-2" /> {t("addContacts")}
                                  </DropdownMenuItem>
                                )}

                                {/* Edit — mesma lista aceita pelo backend (UpdateCampaignServiceZPRO):
                                    pausada também edita, pois o disparo relê a campanha ao retomar */}
                                {["pending", "canceled", "scheduled", "paused"].includes(campaign.status) && (
                                  <DropdownMenuItem onClick={() => openEdit(campaign)}>
                                    <Edit className="h-4 w-4 mr-2" /> {t("editCampaign")}
                                  </DropdownMenuItem>
                                )}

                                {/* Start / Schedule */}
                                {(campaign.status === "pending" || campaign.status === "canceled") && (
                                  <DropdownMenuItem onClick={() => handleStart(campaign)}>
                                    <Play className="h-4 w-4 mr-2" /> {t("start")}
                                  </DropdownMenuItem>
                                )}

                                {/* Pause (for scheduled or processing) */}
                                {["scheduled", "processing", "running"].includes(campaign.status) && (
                                  <DropdownMenuItem onClick={() => handlePause(campaign)}>
                                    <Pause className="h-4 w-4 mr-2 text-yellow-600" /> {t("pauseCampaign")}
                                  </DropdownMenuItem>
                                )}

                                {/* Resume (only for paused) */}
                                {campaign.status === "paused" && (
                                  <DropdownMenuItem onClick={() => handleResume(campaign)}>
                                    <PlayCircle className="h-4 w-4 mr-2 text-green-600" /> {t("resumeCampaign")}
                                  </DropdownMenuItem>
                                )}

                                {/* Cancel (only for scheduled) */}
                                {campaign.status === "scheduled" && (
                                  <DropdownMenuItem onClick={() => handleCancel(campaign)}>
                                    <XCircle className="h-4 w-4 mr-2" /> {t("cancelCampaign")}
                                  </DropdownMenuItem>
                                )}

                                {/* Skip message — for processing/running */}
                                {["processing", "running"].includes(campaign.status) && (
                                  <DropdownMenuItem onClick={() => handleSkipMessage(campaign)}>
                                    <SkipForward className="h-4 w-4 mr-2 text-yellow-600" /> {t("start")}
                                  </DropdownMenuItem>
                                )}

                                {/* Force finish / Pausar forçado — for processing/running */}
                                {["processing", "running"].includes(campaign.status) && (
                                  <DropdownMenuItem onClick={() => handleForceFinish(campaign)} className="text-orange-600">
                                    <CheckCheck className="h-4 w-4 mr-2" /> {t("cancelCampaign")}
                                  </DropdownMenuItem>
                                )}

                                {/* Duplicate */}
                                <DropdownMenuItem onClick={() => handleDuplicate(campaign.id)}>
                                  <Copy className="h-4 w-4 mr-2" /> {t("duplicate")}
                                </DropdownMenuItem>

                                {/* Download PDF report */}
                                <DropdownMenuItem onClick={() => handleDownloadPDF(campaign)}>
                                  <FileText className="h-4 w-4 mr-2 text-red-500" /> PDF
                                </DropdownMenuItem>

                                {/* Download CSV report */}
                                <DropdownMenuItem onClick={() => handleDownloadCSV(campaign)}>
                                  <FileText className="h-4 w-4 mr-2 text-blue-500" /> CSV
                                </DropdownMenuItem>

                                {/* Delete */}
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => { setDeleteId(campaign.id); setDeleteName(campaign.name); }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> {t("delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Create/Edit Campaign Dialog */}
      <CampaignFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditCampaign(null); }}
        onSaved={loadCampaigns}
        editCampaign={editCampaign}
        sessions={sessions}
      />

      {/* Contacts view dialog (for existing campaigns) */}
      <CampaignContactsViewDialog
        open={contactsViewOpen}
        campaign={contactsViewCampaign}
        onClose={() => { setContactsViewOpen(false); setContactsViewCampaign(null); }}
        onRefresh={loadCampaigns}
      />

      {/* Add contacts dialog (quick access from table) */}
      <ContactSelectDialog
        open={addContactsOpen}
        campaignId={addContactsCampaignId}
        campaignStatus={addContactsStatus}
        onClose={() => { setAddContactsOpen(false); setAddContactsCampaignId(null); }}
        onAdded={loadCampaigns}
      />

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteId != null} onOpenChange={() => { setDeleteId(null); setDeleteName(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDelete")}</DialogTitle>
            <DialogDescription>
              {deleteName ? `"${deleteName}" — ` : ""}{t("actionCannotBeUndone")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteId(null); setDeleteName(""); }} disabled={deleting}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? t("saving") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
