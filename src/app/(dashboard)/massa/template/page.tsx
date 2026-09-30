"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { logger } from "@/lib/logger";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Send, RefreshCw, X, Search, Loader2, Pause, PlayCircle, Images, Upload, AlertCircle, Info, ChevronDown, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AddressFilterFields } from "@/components/contatos/address-filter-fields";
import {
  type AddressFilter,
  AddressFilterUnsupportedError,
  EMPTY_ADDRESS_FILTER,
  addressFilterActiveCount,
  assertAddressFilterEcho,
  sameAddressFilter,
  toAddressQuery,
} from "@/lib/address-filter";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { filterWhatsappsForCurrentUser } from "@/lib/whatsapp-user-access";
import { fetchContacts, createContact, type Contact } from "@/services/contacts";
import { fetchWallets } from "@/services/wallets";
import { fetchAllContactsForWallet } from "@/lib/massa-fetch-contacts-wallet";
import { fetchTags, type Tag } from "@/services/tags";
import { fetchKanbans, type Kanban } from "@/services/kanban";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchWabaTemplates, createDispatch, filterBulkRecipients, incrementDispatch, BULK_WABA_CHANNEL_TYPE, type WabaTemplate, type WabaTemplateComponent } from "@/services/bulk";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuthStore } from "@/stores/auth-store";
import { fetchGallery, type GalleryItem } from "@/services/gallery";
import { createTicket, updateTicket } from "@/services/tickets";
import { sendWabaTemplateComponents, sendWabaTemplateMarketingComponents } from "@/services/messages";
import { parseBulkPhoneList, getBrPhoneVariants, detectBrPhoneAmbiguity, normalizeBrPhone } from "@/lib/phone-utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBulkSendError } from "@/lib/bulk-send-error-format";
import { WabaTemplateMobilePreview } from "@/components/meta/waba-template-mobile-preview";
// W3-B: picker agnostico de BSP. Renderiza o picker correto para o canal
// selecionado (waba | dialog360 | gupshup). Para WABA o caller pode manter o
// Select inline; este componente cobre os casos onde o canal e nao-WABA.
import { TemplatePickerByChannel } from "@/components/massa/template-picker-by-channel";
import {
  TemplateCategorySelect,
  type TemplateCategoryFilter,
  matchTemplateCategory,
} from "@/components/atendimento/template-category-filter";
import { SendProgressModal } from "@/components/massa/send-progress-modal";
import { BulkCsvImportDialog } from "@/components/massa/bulk-csv-import-dialog";
import { WhatsAppPreview } from "@/components/massa/whatsapp-preview";
import { WabaConnectionQualityBadge } from "@/components/atendimento/waba-connection-quality-badge";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn, isValidHttpUrl } from "@/lib/utils";
// Cobrança (template ORDER_DETAILS) — caminho paralelo: só liga quando o
// template selecionado é de cobrança; template comum não passa por aqui.
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import {
  isOrderDetailsTemplate,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  type OrderDetailsValue,
} from "@/lib/order-details";

interface ContactOption {
  label: string;
  value: string;
}

function getSystemVars(t: (key: string) => string) {
  return [
    { label: t("varName"), value: "{{name}}" },
    { label: t("varGreeting"), value: "{{greeting}}" },
    { label: t("varProtocol"), value: "{{protocol}}" },
    { label: t("varEmail"), value: "{{email}}" },
    { label: t("varPhone"), value: "{{phoneNumber}}" },
    { label: t("varKanban"), value: "{{kanban}}" },
    { label: t("varAttendant"), value: "{{user}}" },
    { label: t("varAttendantEmail"), value: "{{userEmail}}" },
    { label: t("varFirstName"), value: "{{firstName}}" },
    { label: t("varLastName"), value: "{{lastName}}" },
    { label: t("varCompany"), value: "{{businessName}}" },
  ];
}

interface TemplateField {
  label: string;
  value: string;
  key: string;
}

function extractTemplateFields(template: WabaTemplate, t: (key: string, values?: Record<string, string | number | Date>) => string): TemplateField[] {
  const fields: TemplateField[] = [];
  (template.components || []).forEach((comp) => {
    // HEADER media (IMAGE / VIDEO / DOCUMENT)
    if (comp.type === "HEADER" && comp.format && !["TEXT", "NONE"].includes(comp.format)) {
      fields.push({
        label: t("headerUrlLabel", { format: comp.format.toLowerCase() }),
        value: "",
        key: `header_${comp.format.toLowerCase()}`,
      });
    }

    // HEADER TEXT variables (numeração independente do body)
    if (comp.type === "HEADER" && comp.format === "TEXT" && comp.text) {
      const matches = comp.text.match(/\{\{(\d+)\}\}/g) || [];
      matches.forEach((m) => {
        const num = m.replace(/\{|\}/g, "");
        const k = `header_variable_${num}`;
        if (!fields.some((f) => f.key === k)) {
          fields.push({
            label: `Header — ${t("variableNumberLabel", { n: num })}`,
            value: "",
            key: k,
          });
        }
      });
    }

    // BODY variables — detecta named pela presença dos placeholders/example,
    // não só pelo parameter_format (que a Meta nem sempre devolve no list).
    if (comp.type === "BODY") {
      const namedParams = comp.example?.body_text_named_params || [];
      const namedTextMatches = comp.text ? Array.from(comp.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)) : [];
      const isNamed =
        template.parameter_format === "NAMED" ||
        namedParams.length > 0 ||
        namedTextMatches.length > 0;

      if (isNamed) {
        // União dos nomes vindos do example + do próprio texto, sem duplicar.
        const names = new Set<string>();
        namedParams.forEach((p) => { if (p?.param_name) names.add(p.param_name); });
        namedTextMatches.forEach((m) => { if (m[1]) names.add(m[1]); });
        names.forEach((name) => {
          const key = `named_variable_${name}`;
          if (!fields.some((f) => f.key === key)) {
            fields.push({
              label: t("namedVariableLabel", { name }),
              value: "",
              key,
            });
          }
        });
      } else if (comp.text) {
        const matches = comp.text.match(/\{\{(\d+)\}\}/g) || [];
        matches.forEach((m) => {
          const num = m.replace(/\{|\}/g, "");
          if (!fields.some((f) => f.key === `variable_${num}`)) {
            fields.push({
              label: t("variableNumberLabel", { n: num }),
              value: "",
              key: `variable_${num}`,
            });
          }
        });
      }
    }

    // BUTTONS
    if (comp.type === "BUTTONS" && comp.buttons) {
      comp.buttons.forEach((btn, idx) => {
        // PHONE_NUMBER nunca tem variavel (numero fixo). URL pode ter `{{N}}` ao final
        // (Meta permite 1 variavel por URL de botao) — expoe campo separado.
        if (btn.type === "PHONE_NUMBER") return;
        // ORDER_DETAILS não é campo de texto: a cobrança vem do formulário próprio
        // (OrderDetailsFields) e o backend monta o componente. Sem este skip, o
        // botão virava um `button_${N}` pré-preenchido e o payload saía inválido.
        if (btn.type === "ORDER_DETAILS") return;
        if (btn.type === "URL") {
          const btnAny = btn as unknown as { url?: string; text?: string };
          if (btnAny.url && /\{\{[^}]+\}\}/.test(btnAny.url)) {
            fields.push({
              label: `Button ${idx + 1} — URL (${btnAny.text || "link"})`,
              value: "",
              key: `button_url_${idx + 1}`,
            });
          }
          return;
        }
        fields.push({
          label: `Button ${idx + 1}: ${btn.text}`,
          value: btn.text,
          key: `button_${idx + 1}`,
        });
      });
    }
  });
  return fields;
}

function buildPreviewText(text: string, components: { value: string; key?: string }[], keyPrefix: "" | "header_" = ""): string {
  let result = text;
  const positionalPrefix = `${keyPrefix}variable_`;
  // Numbered variables (header_variable_N para header, variable_N para body)
  const numbered = components.filter((c) => c.key?.startsWith(positionalPrefix));
  numbered.forEach((comp) => {
    const num = comp.key!.replace(positionalPrefix, "");
    result = result.replace(
      new RegExp(`\\{\\{${num}\\}\\}`, "g"),
      comp.value ? `*${comp.value}*` : `{{${num}}}`
    );
  });
  // Named variables (somente body — header NAMED não é suportado aqui)
  if (keyPrefix === "") {
    const named = components.filter((c) => c.key?.startsWith("named_variable_"));
    named.forEach((comp) => {
      const name = comp.key!.replace("named_variable_", "");
      result = result.replace(
        new RegExp(`\\{\\{${name}\\}\\}`, "g"),
        comp.value ? `*${comp.value}*` : `{{${name}}}`
      );
    });
    // Fallback for positional index-based (apenas body, sem keys nomeadas)
    const namedCount = components.filter((c) => c.key?.startsWith("named_variable_")).length;
    if (numbered.length === 0 && namedCount === 0) {
      components.forEach((comp, i) => {
        result = result.replace(
          new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"),
          comp.value ? `*${comp.value}*` : `{{${i + 1}}}`
        );
      });
    }
  }
  return result;
}

/**
 * Clona o template substituindo variáveis no body/header com valores preenchidos.
 * Usado para passar ao WabaTemplateMobilePreview.
 */
function buildPreviewTemplate(template: WabaTemplate, components: { value: string; key?: string }[]) {
  const clone = JSON.parse(JSON.stringify(template));
  if (!Array.isArray(clone.components)) return clone;
  for (const comp of clone.components) {
    if (comp?.text) {
      const isHeader = comp.type === "HEADER";
      comp.text = buildPreviewText(comp.text, components, isHeader ? "header_" : "");
    }
  }
  return clone;
}

function TemplatePreview({
  template,
  components,
  t,
}: {
  template: WabaTemplate;
  components: TemplateField[];
  t: (key: string) => string;
}) {
  const comps: WabaTemplateComponent[] = template.components || [];
  const header = comps.find((c) => c.type === "HEADER");
  const body = comps.find((c) => c.type === "BODY");
  const footer = comps.find((c) => c.type === "FOOTER");
  const buttons = comps.find((c) => c.type === "BUTTONS");

  return (
    <div className="flex flex-col items-center bg-[#e5ddd5] rounded-xl p-4 min-h-[120px]">
      <div className="w-full max-w-xs">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          {header && (
            <div className="bg-gray-100 px-3 pt-3 pb-2">
              {header.format === "IMAGE" ? (
                <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
                  {t("imagePreview")}
                </div>
              ) : header.format === "VIDEO" ? (
                <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
                  {t("videoPreview")}
                </div>
              ) : header.format === "DOCUMENT" ? (
                <div className="w-full h-10 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
                  {t("documentPreview")}
                </div>
              ) : header.text ? (
                <p className="text-sm font-semibold text-gray-800">
                  {buildPreviewText(header.text, components, "header_")}
                </p>
              ) : null}
            </div>
          )}

          {/* Body */}
          {body?.text && (
            <div className="px-3 py-2">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {buildPreviewText(body.text, components)}
              </p>
            </div>
          )}

          {/* Footer */}
          {footer?.text && (
            <div className="px-3 pb-2">
              <p className="text-xs text-gray-400">{footer.text}</p>
            </div>
          )}

          {/* Buttons */}
          {buttons?.buttons && buttons.buttons.length > 0 && (
            <div className="border-t divide-y">
              {buttons.buttons.map((btn, i) => (
                <div key={i} className="px-3 py-2 text-center text-xs text-blue-500 font-medium">
                  {btn.text}
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 text-right">{template.language}</p>
      </div>
    </div>
  );
}

function SystemVarDropdown({
  onSelect,
  t,
}: {
  onSelect: (val: string) => void;
  t: (key: string) => string;
}) {
  const systemVars = getSystemVars(t);
  return (
    <Select value="" onValueChange={(v) => { if (v) onSelect(v); }}>
      <SelectTrigger className="h-8 text-xs w-auto min-w-[140px]">
        <SelectValue placeholder={t("insertVariable")} />
      </SelectTrigger>
      <SelectContent>
        {systemVars.map((sv) => (
          <SelectItem key={sv.value} value={sv.value} className="text-xs">
            {sv.label} — <span className="font-mono">{sv.value}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function MassaTemplatePage() {
  const t = useTranslations("massaTemplatePage");
  const tWarn = useTranslations("bulkPhoneWarnings");
  const tErrors = useTranslations("errors");
  const tCsv = useTranslations("bulkCsvImport");
  const tOrder = useTranslations("orderDetails");
  const tAddr = useTranslations("addressFilter");
  const allowed = usePageAccess("massa");
  if (!allowed) return <AccessDenied />;
  const { isLiveMode } = useLiveMode();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  // Camada 1c — single-flight: bloqueia double-click no botao Enviar antes mesmo
  // que setSending(true) cause re-render, fechando a janela de 1 frame em que o
  // botao ainda nao esta disabled.
  const sendingRef = useRef(false);
  const [sentCount, setSentCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [sendErrorLog, setSendErrorLog] = useState<{ number: string; error: string; timestamp: Date }[]>([]);
  const [sendSuccessLog, setSendSuccessLog] = useState<{ number: string; timestamp: Date }[]>([]);

  // Guarda de saída: alerta ao fechar/atualizar a aba durante um disparo e marca
  // o dispatch como cancelado no backend via fetch keepalive (axios não suporta
  // keepalive) — mesmo endpoint PUT /bulk-dispatch/:id do updateDispatch (services/bulk.ts).
  const bulkDispatchIdRef = useRef<number | null>(null);
  useEffect(() => {
    const cancelDispatchOnExit = () => {
      if (!sendingRef.current || !bulkDispatchIdRef.current) return;
      try {
        const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101";
        let token: string | null = null;
        try {
          const raw = localStorage.getItem("token");
          token = raw ? (JSON.parse(raw) as string) : null;
        } catch {
          token = null;
        }
        void fetch(`${baseURL}/bulk-dispatch/${bulkDispatchIdRef.current}`, {
          method: "PUT",
          keepalive: true,
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ status: "cancelled", cancellationReason: "browser_closed" }),
        }).catch(() => undefined);
      } catch {
        // best-effort
      }
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!sendingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", cancelDispatchOnExit);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", cancelDispatchOnExit);
    };
  }, []);

  const [connections, setConnections] = useState<Whatsapp[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<Whatsapp | null>(null);

  const [minDelay, setMinDelay] = useState("");
  const [maxDelay, setMaxDelay] = useState("");

  const [contatosImportar, setContatosImportar] = useState(false);
  const [fecharTicket, setFecharTicket] = useState(true);
  const [assignQueue, setAssignQueue] = useState(false);
  const [assignUser, setAssignUser] = useState(false);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedAssignQueueId, setSelectedAssignQueueId] = useState<string>("");
  const [assignUsers, setAssignUsers] = useState<{ id: number; name: string }[]>([]);
  const [selectedAssignUserId, setSelectedAssignUserId] = useState<string>("");
  const [useTags, setUseTags] = useState(false);
  const [useKanban, setUseKanban] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [useAllContacts, setUseAllContacts] = useState(false);
  const [loadingAllContacts, setLoadingAllContacts] = useState(false);
  const [allContactsLoadedCount, setAllContactsLoadedCount] = useState(0);

  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [loadingTag, setLoadingTag] = useState(false);

  const [kanbans, setKanbans] = useState<Kanban[]>([]);
  const [selectedKanban, setSelectedKanban] = useState<string>("");
  const [loadingKanban, setLoadingKanban] = useState(false);

  const [wallets, setWallets] = useState<{ id: number; name: string }[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>("");
  const [loadingWallet, setLoadingWallet] = useState(false);

  // Endereço (bairro, cidade, UF do cadastro): estreita etiqueta, kanban, carteira e todos.
  // Só o filtro APLICADO entra nas cargas; digitar não recarrega nada.
  const [addressFilter, setAddressFilter] = useState<AddressFilter>(EMPTY_ADDRESS_FILTER);
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressUnsupported, setAddressUnsupported] = useState(false);
  // Filtro digitado e ainda não aplicado: o envio espera o "Aplicar".
  const [addressDraftPending, setAddressDraftPending] = useState(false);
  // Retrato do filtro com que a lista foi montada: o envio exige que seja o aplicado.
  const [listAddressFilter, setListAddressFilter] = useState<AddressFilter | null>(null);
  // Geração da carga de contatos: carga nova ou troca de modo invalida a anterior, e o
  // resultado de carga velha é descartado.
  const loadGenRef = useRef(0);

  const [selectedContacts, setSelectedContacts] = useState<ContactOption[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const contactSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contactDropdownRef = useRef<HTMLDivElement>(null);

  const [numberInput, setNumberInput] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [csvImport, setCsvImport] = useState<{ fileName: string; content: string } | null>(null);

  const ambiguousLines = useMemo(() => {
    const out: { lineNumber: number; raw: string; normalized: string; reason: string }[] = [];
    if (!numberInput.trim()) return out;
    const raws = numberInput.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    raws.forEach((entry, idx) => {
      const a = detectBrPhoneAmbiguity(entry);
      if (a) out.push({ lineNumber: idx + 1, raw: a.raw, normalized: a.normalized, reason: a.reason });
    });
    return out;
  }, [numberInput]);

  const duplicateGroups = useMemo(() => {
    if (!numberInput.trim()) return [] as { normalized: string; lines: number[] }[];
    const raws = numberInput.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    const map = new Map<string, number[]>();
    raws.forEach((entry, idx) => {
      const digits = entry.replace(/\D/g, "");
      if (!digits) return;
      const norm = normalizeBrPhone(digits) || digits;
      if (!map.has(norm)) map.set(norm, []);
      map.get(norm)!.push(idx + 1);
    });
    return Array.from(map.entries())
      .filter(([, lines]) => lines.length > 1)
      .map(([normalized, lines]) => ({ normalized, lines }));
  }, [numberInput]);

  const [showModal, setShowModal] = useState(false);
  const [templates, setTemplates] = useState<WabaTemplate[]>([]);
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<TemplateCategoryFilter>("all");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WabaTemplate | null>(null);
  const [templateComponents, setTemplateComponents] = useState<TemplateField[]>([]);
  // Ficha de cobrança única do disparo (mesmo código de pagamento p/ todos os
  // destinatários nesta fase — o reference_id por destinatário nasce no backend).
  const [orderDetailsValue, setOrderDetailsValue] = useState<OrderDetailsValue>(() => emptyOrderDetails());

  // Gallery picker for header media URL
  const [tplGalleryOpen, setTplGalleryOpen] = useState(false);
  const [tplGalleryTarget, setTplGalleryTarget] = useState<number | null>(null);
  const [tplGalleryItems, setTplGalleryItems] = useState<GalleryItem[]>([]);
  const [tplGalleryLoading, setTplGalleryLoading] = useState(false);
  const [tplGallerySearch, setTplGallerySearch] = useState("");

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWhatsapps();
      const raw: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
      // Restringe ao whatsappAllowed do usuário (espelha o Atendimento).
      const all = filterWhatsappsForCurrentUser(raw);
      // Massa template aceita WABA + BSPs (gupshup, dialog360) — todos têm template send no backend.
      const ALLOWED_BULK_TYPES = [BULK_WABA_CHANNEL_TYPE, "gupshup", "dialog360"];
      setConnections(
        all.filter(
          (c) => ALLOWED_BULK_TYPES.includes((c.type || "").toLowerCase()) && c.status === "CONNECTED"
        )
      );
    } catch {
      toast.error(t("errorLoadConnections"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const res = await fetchTags();
      const sorted = [...(res.data || [])].sort((a, b) =>
        (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
      );
      setTags(sorted);
    } catch {
      toast.error(t("errorLoadTags"));
    }
  }, []);

  const loadKanbans = useCallback(async () => {
    try {
      const res = await fetchKanbans();
      const sorted = [...(res.data || [])].sort((a, b) =>
        (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
      );
      setKanbans(sorted);
    } catch {
      toast.error(t("errorLoadKanbans"));
    }
  }, []);

  const loadWallets = useCallback(async () => {
    try {
      const { data } = await fetchWallets();
      const list = (data as { id: number; name: string; profile?: string }[]).filter((u) => u.profile !== "superadmin");
      const sorted = list.sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));
      setWallets(sorted.map((u) => ({ id: u.id, name: u.name })));
    } catch {
      toast.error(t("errorLoadWallets"));
    }
  }, []);

  const loadAssignQueues = useCallback(async () => {
    try {
      const res = await fetchQueues();
      // Fila desativada recusa o ticket (400 ERR_QUEUE_INACTIVE) em toda linha do disparo.
      const sorted = [...(res.data || [])].filter((q) => q.isActive !== false).sort((a, b) =>
        (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
      );
      setQueues(sorted);
    } catch {
      toast.error(t("errorLoadQueues"));
    }
  }, []);

  const loadAssignUsers = useCallback(async () => {
    try {
      const { data } = await fetchWallets();
      const list = (data as { id: number; name: string; profile?: string }[]).filter((u) => u.profile !== "superadmin");
      const sorted = list.sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));
      setAssignUsers(sorted.map((u) => ({ id: u.id, name: u.name })));
    } catch {
      toast.error(t("errorLoadUsers"));
    }
  }, []);

  // Invalida a carga de contatos em andamento (a que terminar depois é descartada) e zera os
  // indicadores de carga de todos os modos.
  const invalidateContactsLoad = () => {
    loadGenRef.current += 1;
    setLoadingTag(false);
    setLoadingKanban(false);
    setLoadingWallet(false);
    setLoadingAllContacts(false);
    return loadGenRef.current;
  };

  // Início de carga: geração nova, lista vazia e sem retrato até a carga terminar.
  const beginContactsLoad = (setLoadingFlag: (value: boolean) => void) => {
    const gen = invalidateContactsLoad();
    setLoadingFlag(true);
    setSelectedContacts([]);
    setListAddressFilter(null);
    return gen;
  };

  const isCurrentLoad = (gen: number) => gen === loadGenRef.current;

  const finishContactsLoad = (list: ContactOption[], filter: AddressFilter) => {
    setSelectedContacts(list);
    setListAddressFilter(filter);
    setAddressUnsupported(false);
  };

  // Resposta sem o eco com filtro ativo: backend antigo ignoraria o filtro e devolveria o
  // público inteiro. A carga para, a lista fica vazia e o aviso aparece.
  const failAddressUnsupported = () => {
    setSelectedContacts([]);
    setListAddressFilter(null);
    setAddressUnsupported(true);
    setAddressOpen(true);
    toast.error(tAddr("unsupported"));
  };

  const filterContactsByWallet = useCallback(async () => {
    if (!selectedWallet) return;
    const gen = beginContactsLoad(setLoadingWallet);
    const filter = addressFilter;
    try {
      const list = await fetchAllContactsForWallet(selectedWallet, filter, () => isCurrentLoad(gen));
      if (!isCurrentLoad(gen)) return;
      finishContactsLoad(list.map((c) => ({ label: c.name ?? c.number, value: c.number })), filter);
    } catch (err) {
      if (!isCurrentLoad(gen)) return;
      if (err instanceof AddressFilterUnsupportedError) {
        failAddressUnsupported();
        return;
      }
      toast.error(t("errorFilterByWallet"));
    } finally {
      if (isCurrentLoad(gen)) setLoadingWallet(false);
    }
  }, [selectedWallet, addressFilter]);

  const filterContactsByTag = useCallback(async () => {
    if (!selectedTag) return;
    const gen = beginContactsLoad(setLoadingTag);
    const filter = addressFilter;
    const all: ContactOption[] = [];
    let page = 1;
    const pageSize = 500;
    try {
      while (true) {
        const res = await fetchContacts({ pageNumber: page, tagId: Number(selectedTag), pageSize, ...toAddressQuery(filter) });
        if (!isCurrentLoad(gen)) return;
        assertAddressFilterEcho(filter, res.data);
        const data = res.data as { contacts: { name: string; number: string }[] };
        const list = data.contacts || [];
        all.push(...list.map((c) => ({ label: c.name, value: c.number })));
        if (list.length < pageSize) break;
        page++;
        await new Promise((r) => setTimeout(r, 200));
        if (!isCurrentLoad(gen)) return;
      }
      finishContactsLoad(all, filter);
    } catch (err) {
      if (!isCurrentLoad(gen)) return;
      if (err instanceof AddressFilterUnsupportedError) {
        failAddressUnsupported();
        return;
      }
      toast.error(t("errorFilterByTag"));
    } finally {
      if (isCurrentLoad(gen)) setLoadingTag(false);
    }
  }, [selectedTag, addressFilter]);

  const filterContactsByKanban = useCallback(async () => {
    if (!selectedKanban) return;
    const gen = beginContactsLoad(setLoadingKanban);
    const filter = addressFilter;
    const allContacts: ContactOption[] = [];
    let page = 1;
    const pageSize = 500;
    try {
      while (true) {
        const res = await fetchContacts({ pageNumber: page, pageSize, ...toAddressQuery(filter) });
        if (!isCurrentLoad(gen)) return;
        assertAddressFilterEcho(filter, res.data);
        const data = res.data as { contacts: { name: string; number: string; kanban?: number }[] };
        const list = data.contacts || [];
        const filtered = list.filter((c) => String(c.kanban) === selectedKanban);
        allContacts.push(...filtered.map((c) => ({ label: c.name, value: c.number })));
        if (list.length < pageSize) break;
        page++;
        await new Promise((r) => setTimeout(r, 200));
        if (!isCurrentLoad(gen)) return;
      }
      finishContactsLoad(allContacts, filter);
    } catch (err) {
      if (!isCurrentLoad(gen)) return;
      if (err instanceof AddressFilterUnsupportedError) {
        failAddressUnsupported();
        return;
      }
      toast.error(t("errorFilterByKanban"));
    } finally {
      if (isCurrentLoad(gen)) setLoadingKanban(false);
    }
  }, [selectedKanban, addressFilter]);

  const filterAllContacts = useCallback(async () => {
    const gen = beginContactsLoad(setLoadingAllContacts);
    const filter = addressFilter;
    setAllContactsLoadedCount(0);
    const all: ContactOption[] = [];
    let page = 1;
    const pageSize = 500;
    const maxPages = 200;
    try {
      while (page <= maxPages) {
        const res = await fetchContacts({ pageNumber: page, pageSize, ...toAddressQuery(filter) });
        if (!isCurrentLoad(gen)) return;
        assertAddressFilterEcho(filter, res.data);
        const list = (res.data as { contacts?: { name: string; number: string }[] })?.contacts ?? [];
        if (list.length === 0) break;
        const opts = list.map((c) => ({ label: c.name, value: c.number }));
        all.push(...opts);
        setAllContactsLoadedCount(all.length);
        if (list.length < pageSize) break;
        page += 1;
        await new Promise((r) => setTimeout(r, 200));
        if (!isCurrentLoad(gen)) return;
      }
      finishContactsLoad(all, filter);
    } catch (err) {
      if (!isCurrentLoad(gen)) return;
      if (err instanceof AddressFilterUnsupportedError) {
        failAddressUnsupported();
        return;
      }
      toast.error(t("errorLoadContacts"));
    } finally {
      if (isCurrentLoad(gen)) setLoadingAllContacts(false);
    }
  }, [addressFilter]);

  // Filtro aplicado mudou: a lista atual deixa de valer e é esvaziada. Como as cargas dependem
  // do filtro aplicado, o efeito do modo ativo roda de novo e recarrega uma vez.
  const handleAddressFilterChange = (next: AddressFilter) => {
    if (sameAddressFilter(next, addressFilter)) return;
    invalidateContactsLoad();
    setSelectedContacts([]);
    setListAddressFilter(null);
    setAllContactsLoadedCount(0);
    setAddressUnsupported(false);
    setAddressFilter(next);
  };

  const handleContactSearchChange = (value: string) => {
    setContactSearch(value);
    setShowContactDropdown(true);
    if (contactSearchTimer.current) clearTimeout(contactSearchTimer.current);
    if (value.length < 2) { setContactResults([]); return; }
    contactSearchTimer.current = setTimeout(async () => {
      setContactSearching(true);
      try {
        const res = await fetchContacts({ searchParam: value, pageNumber: 1 });
        const data = res.data as { contacts: Contact[] };
        setContactResults((data.contacts || []).slice(0, 10).map((c) => ({ label: c.name, value: c.number })));
      } catch {
        setContactResults([]);
      } finally {
        setContactSearching(false);
      }
    }, 400);
  };

  const handleSelectContact = (opt: ContactOption) => {
    if (!selectedContacts.find((x) => x.value === opt.value)) {
      setSelectedContacts((prev) => [...prev, opt]);
    }
    setContactSearch("");
    setContactResults([]);
    setShowContactDropdown(false);
  };

  useEffect(() => { loadConnections(); loadTags(); loadKanbans(); }, [loadConnections, loadTags, loadKanbans]);
  useEffect(() => { if (selectedTag && useTags) filterContactsByTag(); }, [selectedTag, useTags, filterContactsByTag]);
  useEffect(() => { if (selectedKanban && useKanban) filterContactsByKanban(); }, [selectedKanban, useKanban, filterContactsByKanban]);
  useEffect(() => { if (useWallet && wallets.length === 0) loadWallets(); }, [useWallet, wallets.length, loadWallets]);
  useEffect(() => { if (assignQueue && queues.length === 0) loadAssignQueues(); }, [assignQueue, queues.length, loadAssignQueues]);
  useEffect(() => { if (assignUser && assignUsers.length === 0) loadAssignUsers(); }, [assignUser, assignUsers.length, loadAssignUsers]);
  useEffect(() => { if (selectedWallet && useWallet) filterContactsByWallet(); }, [selectedWallet, useWallet, filterContactsByWallet]);
  useEffect(() => { if (useAllContacts) filterAllContacts(); }, [useAllContacts, filterAllContacts]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contactDropdownRef.current && !contactDropdownRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const buscarTemplates = async () => {
    if (!selectedConnection) { toast.error(t("selectConnectionFirst")); return; }
    setLoadingTemplates(true);
    setShowModal(true);
    try {
      const res = await fetchWabaTemplates(selectedConnection.id);
      const sorted = (Array.isArray(res.data) ? res.data : []).sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      );
      setTemplates(sorted);
    } catch {
      toast.error(t("errorLoadingTemplates"));
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleTemplateSelection = (template: WabaTemplate) => {
    setSelectedTemplate(template);
    setTemplateComponents(extractTemplateFields(template, t));
    // Zera a ficha de cobrança ao trocar de template (não há campo de variável
    // para ORDER_DETAILS — o valor antigo não pertence ao template novo).
    setOrderDetailsValue(emptyOrderDetails());
  };

  // Template de cobrança (sub_category / display_format / botão ORDER_DETAILS):
  // liga o formulário de pagamento e o campo `orderDetails` no payload.
  const isOrderDetailsSelected = useMemo(
    () => isOrderDetailsTemplate(selectedTemplate),
    [selectedTemplate]
  );

  const openTplGallery = (idx: number) => {
    setTplGalleryTarget(idx);
    setTplGalleryOpen(true);
  };

  const pickTplGalleryItem = (item: GalleryItem) => {
    if (tplGalleryTarget === null) return;
    const updated = [...templateComponents];
    updated[tplGalleryTarget] = { ...updated[tplGalleryTarget], value: item.url };
    setTemplateComponents(updated);
    setTplGalleryOpen(false);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".txt")) {
      toast.warning(tCsv("onlyCsvTxtAccepted"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvImport({ fileName: file.name, content: String(ev.target?.result ?? "") });
    };
    reader.readAsText(file, "UTF-8");
  };

  const getNumbers = (): string[] => {
    if (useTags || useKanban || useWallet || useAllContacts || contatosImportar) return selectedContacts.map((c) => c.value);
    return parseBulkPhoneList(numberInput);
  };

  /** Busca ou cria contato pelo número; retorna o id.
   *  Tolera variações do dígito 9 nos números BR (contato pode ter sido
   *  salvo com 12 ou 13 dígitos) e recupera do erro ERR_DUPLICATED_CONTACT
   *  refazendo a busca em todas as variantes. */
  const findOrCreateContactId = async (number: string): Promise<number> => {
    const clean = number.replace(/\D/g, "");
    const variants = getBrPhoneVariants(clean);

    const lookup = async (query: string): Promise<number | null> => {
      try {
        const res = await fetchContacts({ searchParam: query, pageNumber: 1 });
        const data = res.data as { contacts: { id: number; number: string }[] };
        const contacts = data.contacts || [];
        const exact = contacts.find((c) => c.number === query);
        if (exact?.id) return exact.id;
        const suffix = query.slice(-8);
        const bySuffix = contacts.find((c) => c.number.endsWith(suffix));
        if (bySuffix?.id) return bySuffix.id;
      } catch {}
      return null;
    };

    const lookupAny = async (): Promise<number | null> => {
      for (const v of variants) {
        const id = await lookup(v);
        if (id) return id;
      }
      return null;
    };

    const direct = await lookupAny();
    if (direct) return direct;

    try {
      const res = await createContact({ name: clean, number: clean });
      if (res.data?.id) return res.data.id;
    } catch (err: unknown) {
      const code = (err as { data?: { error?: unknown } })?.data?.error;
      if (code === "ERR_DUPLICATED_CONTACT") {
        // O backend normaliza BR antes do findOne, então o duplicado pode
        // estar sob qualquer variante — buscamos todas.
        const again = await lookupAny();
        if (again) return again;
      } else {
        throw err;
      }
    }

    throw new Error(`Não foi possível criar contato: ${number}`);
  };

  /** Cria ou obtém ticket existente (trata 409); `created` = nasceu neste disparo.
   *  O ticket nasce com quem dispara como dono (como Nova Conversa, Contatos e
   *  Kanban): sem dono e sem fila, o guard de acesso do envio barrava com 403
   *  ERR_NO_TICKET_ACCESS o atendente, o supervisor por departamento e o usuário
   *  com canais restritos — e o ticket ficava aberto, sem template e sem destino. */
  const findOrCreateTicketId = async (
    contactId: number,
    whatsappId: number,
    senderUserId: number | null
  ): Promise<{ id: number; created: boolean }> => {
    try {
      const res = await createTicket({
        contactId,
        isActiveDemand: true,
        channel: "waba",
        channelId: whatsappId,
        status: "open",
        ...(senderUserId ? { userId: senderUserId } : {}),
      });
      if (res.data?.id) return { id: res.data.id, created: true };
    } catch (err: unknown) {
      // O interceptor do axios rejeita com error.response diretamente,
      // então err já é o objeto response: { status, data, ... }
      const d = (err as { data?: { ticket?: { id: number }; error?: unknown } })?.data;
      if (d?.ticket?.id) return { id: d.ticket.id, created: false };
      if (d?.error) {
        const t = typeof d.error === "string" ? JSON.parse(d.error) : d.error;
        if ((t as { id?: number })?.id) return { id: (t as { id: number }).id, created: false };
      }
    }
    throw new Error(`Não foi possível criar ticket para contato ${contactId}`);
  };

  /** Aplica o destino pós-envio (pendente/fila/usuário). Plano B: se falhar num
   *  ticket criado pelo disparo, solta para pendente sem dono — senão ele ficaria
   *  aberto com quem disparou, contando no limite de atendimentos dele. */
  const applyTicketDestination = async (
    ticketId: number,
    updates: Record<string, unknown>,
    createdByDispatch: boolean
  ) => {
    try {
      await updateTicket(ticketId, updates);
    } catch {
      if (!createdByDispatch) return;
      const isAlreadyFallback =
        updates.status === "pending" && updates.userId === null && updates.queueId === undefined;
      if (isAlreadyFallback) return;
      await updateTicket(ticketId, { status: "pending", userId: null }).catch(() => {});
    }
  };

  const handleSend = async (isMarketing = false) => {
    // Camada 1c — guard sincrono: segundo clique enquanto o primeiro ainda esta
    // em voo retorna silenciosamente. Cobre janela ate setSending(true) propagar.
    if (sendingRef.current) return;
    if (!selectedConnection) { toast.error(t("selectConnection")); return; }
    if (!selectedTemplate) { toast.error(t("selectTemplate")); return; }
    // Header de mídia exige URL http(s) no campo — texto comum vira image.link e a Meta rejeita (#100).
    const mediaHeaderField = templateComponents.find(
      (c) => ["header_image", "header_video", "header_document"].includes(c.key)
    );
    if (mediaHeaderField && !isValidHttpUrl(mediaHeaderField.value)) {
      toast.error(tErrors("invalidMediaHeaderUrl"));
      return;
    }
    // Cobrança: valida a ficha ANTES de abrir o dispatch — payload inválido em
    // lote custaria N tickets órfãos com 400 em cada envio.
    if (isOrderDetailsSelected) {
      const orderError = validateOrderDetails(orderDetailsValue);
      if (orderError) {
        toast.warning(tOrder(orderError));
        return;
      }
    }
    if (loadingAllContacts || loadingTag || loadingKanban || loadingWallet) {
      toast.warning(t("loadingAllContacts"));
      return;
    }
    // Lista montada com outro filtro de endereço (ou filtro digitado sem "Aplicar"): nunca envia.
    if (
      (useTags || useKanban || useWallet || useAllContacts) &&
      selectedContacts.length > 0 &&
      (addressDraftPending || !sameAddressFilter(listAddressFilter, addressFilter))
    ) {
      if (addressDraftPending) setAddressOpen(true);
      toast.warning(tAddr("staleList"));
      return;
    }
    // Camada 1a — dedupe defensivo da lista de numeros do dispatch. CSV/colagem
    // pode ter duplicatas que dispararriam 2 tickets pro mesmo contato.
    const rawNumbers = getNumbers();
    const seenNumbers = new Set<string>();
    const numbers: string[] = [];
    for (const n of rawNumbers) {
      const key = (n || "").replace(/\D/g, "");
      if (!key || seenNumbers.has(key)) continue;
      seenNumbers.add(key);
      numbers.push(n);
    }
    if (numbers.length < rawNumbers.length) {
      logger.warn(`[massa/template] dedupe numbers original=${rawNumbers.length} kept=${numbers.length}`);
    }
    if (numbers.length === 0) { toast.error(t("noNumbersToSend")); return; }

    sendingRef.current = true;

    const minInt = minDelay ? parseInt(minDelay, 10) : 1;
    const maxInt = maxDelay ? parseInt(maxDelay, 10) : 3;

    setSending(true);
    setIsPaused(false);
    isPausedRef.current = false;
    setSentCount(0);
    setFailedCount(0);
    setSkippedCount(0);
    setTotalMessages(numbers.length);
    setSendErrorLog([]);
    setSendSuccessLog([]);
    setProgressModalOpen(true);
    setShowModal(false);
    let skippedTotal = 0;

    // Pré-check v3 (crossChannelTicketCheck): flag lida 1x por disparo. "disabled"
    // explícito => zero requests novos; ausente/ainda não carregada => chama mesmo
    // assim (o backend re-valida a flag — fail-safe, flag off vira no-op).
    const crossChannelCheckEnabled =
      useAuthStore.getState().getConfigValue("crossChannelTicketCheck") !== "disabled";
    // Números APROVADOS no pré-check, memoizados por família de variantes BR: o
    // próprio disparo cria tickets (pending/open quando não fecha), então re-checar
    // outra grafia do MESMO telefone bloquearia as linhas seguintes (auto-bloqueio).
    // Bloqueado NÃO memoiza: re-checa (reconcilia por linha e re-verifica).
    const approvedNumbers = new Set<string>();
    const senderUserId = useAuthStore.getState().user?.userId ?? null;

    // Cria registro de tracking
    let bulkDispatchId: number | null = null;
    try {
      const dr = await createDispatch({
        dispatchType: isMarketing ? "template_marketing" : "template",
        totalMessages: numbers.length,
        whatsappId: selectedConnection.id,
        templateName: selectedTemplate.name,
        minDelay: minInt,
        maxDelay: maxInt,
      });
      bulkDispatchId = dr.data?.id ?? null;
      bulkDispatchIdRef.current = bulkDispatchId;
    } catch {}

    // Monta components a partir dos valores preenchidos pelo usuário
    const buildComponents = () => {
      const comps: Record<string, unknown>[] = [];

      // HEADER (media URL)
      templateComponents.forEach((c) => {
        if (c.key.startsWith("header_") && !c.key.startsWith("header_variable_") && c.value) {
          let format = "";
          if (c.key === "header_video") format = "VIDEO";
          else if (c.key === "header_image") format = "IMAGE";
          else if (c.key === "header_document") format = "DOCUMENT";
          if (format) comps.push({ type: "HEADER", format, value: c.value });
        }
      });

      // HEADER (TEXT com {{N}})
      const headerNumberedVars = templateComponents.filter((c) => c.key.startsWith("header_variable_"));
      if (headerNumberedVars.length > 0) {
        const variables: string[] = [];
        headerNumberedVars.forEach((c) => {
          const idx = parseInt(c.key.replace("header_variable_", ""), 10) - 1;
          while (variables.length <= idx) variables.push("");
          variables[idx] = c.value || " ";
        });
        comps.push({ type: "HEADER", format: "TEXT", variables });
      }

      // BODY — numbered variables
      const numberedVars = templateComponents.filter((c) => c.key.startsWith("variable_") && !c.key.startsWith("header_"));
      if (numberedVars.length > 0) {
        const variables: string[] = [];
        numberedVars.forEach((c) => {
          const idx = parseInt(c.key.replace("variable_", ""), 10) - 1;
          while (variables.length <= idx) variables.push("");
          variables[idx] = c.value || " ";
        });
        comps.push({ type: "BODY", variables });
      }

      // BODY — named variables
      const namedVars = templateComponents.filter((c) => c.key.startsWith("named_variable_"));
      if (namedVars.length > 0) {
        const parameters = namedVars.map((c) => ({
          type: "text",
          // Meta rejeita parâmetro de texto vazio (131008) — fallback para espaço.
          text: c.value.trim() || " ",
          name: c.key.replace("named_variable_", ""),
        }));
        comps.push({ type: "BODY", parameters });
      }

      // BUTTONS
      // Suporta dois prefixos de key:
      //   button_${N}      -> QUICK_REPLY/COPY_CODE/FLOW/CATALOG (text/payload/coupon)
      //   button_url_${N}  -> URL dinamico (sub_type=url + text com a variavel)
      const buttonVars = templateComponents.filter(
        (c) => c.key.startsWith("button_") && !c.key.startsWith("button_url_")
      );
      const buttonUrlVars = templateComponents.filter((c) => c.key.startsWith("button_url_"));
      if ((buttonVars.length > 0 || buttonUrlVars.length > 0) && selectedTemplate) {
        const buttonsComp = selectedTemplate.components?.find((c) => c.type === "BUTTONS");
        if (buttonsComp?.buttons) {
          const buttons: Record<string, unknown>[] = [];
          buttonVars.forEach((c) => {
            const idx = parseInt(c.key.replace("button_", ""), 10) - 1;
            const srcBtn = buttonsComp.buttons![idx];
            if (!srcBtn) return;
            if (srcBtn.type === "URL" || srcBtn.type === "PHONE_NUMBER") return;
            const subType = srcBtn.type === "COPY_CODE" ? "copy_code"
              : srcBtn.type === "FLOW" ? "flow"
              : srcBtn.type === "CATALOG" ? "catalog"
              : "quick_reply";
            buttons.push({
              type: srcBtn.type,
              sub_type: subType,
              index: idx,
              parameters: subType === "flow" || subType === "catalog"
                ? []
                : [{ type: "text", text: c.value.trim() || " " }],
            });
          });
          buttonUrlVars.forEach((c) => {
            const idx = parseInt(c.key.replace("button_url_", ""), 10) - 1;
            const srcBtn = buttonsComp.buttons![idx];
            if (!srcBtn || srcBtn.type !== "URL") return;
            // Sem valor preenchido: nao emite component — Meta envia URL crua e nega
            // o template; deixar UI obrigar o input (regra ja existe via label).
            if (!c.value) return;
            buttons.push({
              type: "URL",
              sub_type: "url",
              index: idx,
              parameters: [{ type: "text", text: c.value }],
            });
          });
          if (buttons.length > 0) comps.push({ type: "BUTTONS", buttons });
        }
      }

      return comps;
    };

    // Cobrança vai como campo próprio: o backend monta, valida e injeta o
    // componente no BUTTONS. Sem cobrança o spread vira {} (no-op).
    const orderDetailsField = isOrderDetailsSelected
      ? { orderDetails: buildOrderDetailsPayload(orderDetailsValue) }
      : {};

    for (let i = 0; i < numbers.length; i++) {
      while (isPausedRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
      const number = numbers[i];
      const randomDelay = Math.floor(Math.random() * (maxInt - minInt + 1) + minInt) * 1000;

      // Pré-check v3: pular ANTES de criar contato/ticket — depois já é tarde (o
      // 409 same-channel reutilizaria o ticket ativo e o updateTicket pós-envio
      // fecharia/rebaixaria a conversa de outro atendente).
      const preCheckDigits = number.replace(/\D/g, "");
      if (crossChannelCheckEnabled && preCheckDigits && !approvedNumbers.has(preCheckDigits)) {
        let blockedByActiveTicket = false;
        try {
          const res = await filterBulkRecipients({
            numbers: [preCheckDigits],
            bulkDispatchId: bulkDispatchId ?? undefined,
            dispatchLabel: "Disparo de Template",
          });
          blockedByActiveTicket = (res.data?.skippedNumbers?.length ?? 0) > 0;
          if (!blockedByActiveTicket) {
            approvedNumbers.add(preCheckDigits);
            getBrPhoneVariants(preCheckDigits).forEach((v) => approvedNumbers.add(v));
          }
        } catch {
          // fail-open: pré-check nunca trava o disparo
        }
        if (blockedByActiveTicket) {
          skippedTotal += 1;
          setSkippedCount((c) => c + 1);
          setSendErrorLog((prev) => [...prev, { number, error: t("skippedLogLabel"), timestamp: new Date() }]);
          continue; // sem delay — nenhuma mensagem saiu
        }
      }

      let contactId: number;
      let ticketId: number;
      let ticketCreatedNow = false;
      try {
        contactId = await findOrCreateContactId(number);
        const ticketRef = await findOrCreateTicketId(contactId, selectedConnection.id, senderUserId);
        ticketId = ticketRef.id;
        ticketCreatedNow = ticketRef.created;
      } catch (err) {
        logger.error(`Erro de setup para ${number} (ignorado):`, err);
        setFailedCount((c) => c + 1);
        setSendErrorLog((prev) => [...prev, { number, error: formatBulkSendError(err), timestamp: new Date() }]);
        // Fecha a conta do dispatch (o backend só rastreia envios que chegam ao
        // controller; falha de setup só o front enxerga). Best-effort.
        if (bulkDispatchId) {
          incrementDispatch(bulkDispatchId, {
            success: false,
            error: { contact: number, error: formatBulkSendError(err), timestamp: new Date() },
          }).catch(() => {});
        }
        if (i < numbers.length - 1) await new Promise((r) => setTimeout(r, randomDelay));
        continue;
      }

      const components = buildComponents();
      const payload: Record<string, unknown> = {
        from: number,
        phone_number_id: selectedConnection.tokenAPI,
        ticketId,
        idFront: crypto.randomUUID(),
        language: selectedTemplate.language,
        templateName: selectedTemplate.name,
        components,
        read: 1,
        fromMe: true,
        mediaUrl: "",
        body: JSON.stringify(selectedTemplate.components),
        scheduleDate: null,
        quotedMsg: null,
        tokenApi: selectedConnection.tokenAPI,
        mediaType: "templates",
        sendType: "templates",
        dataJson: JSON.stringify(components),
        isBulkDispatch: true,
        bulkDispatchId,
        ...orderDetailsField,
      };

      try {
        // BSPs (Gupshup/Dialog360) usam endpoints próprios (não /wabametaTemplate*).
        // Backend já tem /gupshupSendTemplate e /dialog360/sendTemplate — só rotear.
        const channelType = (selectedConnection.type ?? "").toLowerCase();
        if (channelType === "gupshup") {
          const { sendGupshupTemplateMsg } = await import("@/services/gupshup-messages");
          await sendGupshupTemplateMsg({
            from: number,
            ticketId,
            whatsappId: selectedConnection.id,
            tokenApi: selectedConnection.tokenAPI,
            idFront: payload.idFront,
            fromMe: true,
            read: 1,
            name: selectedTemplate.name,
            language: selectedTemplate.language,
            components,
            isBulkDispatch: true,
            bulkDispatchId,
            ...orderDetailsField,
          });
        } else if (channelType === "dialog360") {
          const { sendDialog360Template } = await import("@/services/dialog360-messages");
          await sendDialog360Template({
            from: number,
            ticketId,
            whatsappId: selectedConnection.id,
            tokenApi: selectedConnection.tokenAPI,
            idFront: payload.idFront,
            fromMe: true,
            read: 1,
            templateName: selectedTemplate.name,
            templateLanguage: selectedTemplate.language,
            components,
            isBulkDispatch: true,
            bulkDispatchId,
            ...orderDetailsField,
          });
        } else if (isMarketing) {
          await sendWabaTemplateMarketingComponents(payload);
        } else {
          await sendWabaTemplateComponents(payload);
        }
        if (fecharTicket) {
          await updateTicket(ticketId, { status: "closed", userId: null, skipFarewell: true }).catch(() => {});
        } else {
          // Sem usuário atribuído → pending (fica na fila p/ alguém pegar);
          // só vai a "open" quando há userId, espelhando o fluxo de atendimento normal.
          const willAssignUser = assignUser && selectedAssignUserId;
          const updates: Record<string, unknown> = { status: willAssignUser ? "open" : "pending" };
          if (assignQueue && selectedAssignQueueId) updates.queueId = Number(selectedAssignQueueId);
          if (willAssignUser) {
            updates.userId = Number(selectedAssignUserId);
          } else if (ticketCreatedNow) {
            // Ticket deste disparo nasce com quem disparou como dono; o retorno a
            // pendente só solta o dono com forcePendingUser desligado. Ticket
            // reaproveitado (409) segue com o payload de sempre.
            updates.userId = null;
          }
          await applyTicketDestination(ticketId, updates, ticketCreatedNow);
        }
        setSentCount((c) => c + 1);
        setSendSuccessLog((prev) => [...prev, { number, timestamp: new Date() }]);
      } catch (err) {
        logger.error(`Erro ao enviar template para ${number}:`, err);
        setFailedCount((c) => c + 1);
        setSendErrorLog((prev) => [...prev, { number, error: formatBulkSendError(err), timestamp: new Date() }]);
        // Envio falhou: o ticket que ESTE disparo criou fecha sem despedida (mesmo
        // efeito de "Fechar ticket após envio") em vez de ficar aberto sem template.
        // Ticket reaproveitado (409) é de outra conversa e não é tocado.
        if (ticketCreatedNow) {
          await updateTicket(ticketId, { status: "closed", userId: null, skipFarewell: true }).catch(() => {});
        }
      }

      if (i < numbers.length - 1) {
        await new Promise((r) => setTimeout(r, randomDelay));
      }
    }

    setSending(false);
    sendingRef.current = false;
    bulkDispatchIdRef.current = null;
    setIsPaused(false);
    isPausedRef.current = false;
    toast.success(t("successSend"));
    if (skippedTotal > 0) {
      toast.info(t("skippedToastSummary", { count: skippedTotal }));
    }
    setShowModal(false);
  };

  const clearFields = () => {
    setNumberInput("");
    setMinDelay("");
    setMaxDelay("");
    setSelectedConnection(null);
    invalidateContactsLoad();
    setSelectedContacts([]);
    setListAddressFilter(null);
    setUseAllContacts(false);
    setAllContactsLoadedCount(0);
    setUseKanban(false);
    setSelectedKanban("");
    setAssignQueue(false);
    setSelectedAssignQueueId("");
    setAssignUser(false);
    setSelectedAssignUserId("");
    setContactSearch("");
    setContactResults([]);
    setShowContactDropdown(false);
    setSelectedTemplate(null);
    setTemplateComponents([]);
    setOrderDetailsValue(emptyOrderDetails());
    setSentCount(0);
    setFailedCount(0);
    setTotalMessages(0);
    setSendErrorLog([]);
    setSendSuccessLog([]);
    setProgressModalOpen(false);
    if (csvFileRef.current) csvFileRef.current.value = "";
    toast.warning(t("fieldsCleared"));
  };

  // Preview WhatsApp (Fase 5): corpo do template selecionado com {{n}} cruas +
  // header de mídia (URL preenchida no dialog, quando válida) + footer.
  const previewTplComps: WabaTemplateComponent[] = selectedTemplate?.components || [];
  const previewTplBody = previewTplComps.find((c) => c.type === "BODY")?.text || "";
  const previewTplFooter = previewTplComps.find((c) => c.type === "FOOTER")?.text || "";
  const previewTplHeader = previewTplComps.find((c) => c.type === "HEADER");
  const previewTplMediaType =
    previewTplHeader?.format && ["IMAGE", "VIDEO", "DOCUMENT"].includes(previewTplHeader.format)
      ? previewTplHeader.format.toLowerCase()
      : undefined;
  const previewTplHeaderUrlRaw = templateComponents
    .find((c) => ["header_image", "header_video", "header_document"].includes(c.key))
    ?.value?.trim();
  const previewTplHeaderUrl =
    previewTplHeaderUrlRaw && isValidHttpUrl(previewTplHeaderUrlRaw) ? previewTplHeaderUrlRaw : undefined;

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <CardTitle>{t("cardTitle")}</CardTitle>
            <PageHelp
              description={t("helpDesc")}
              sections={[
                { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
                { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Nota: verificação de conversas em outros canais pode pular contatos */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>{t("activeTicketSkipNote")}</AlertDescription>
          </Alert>

          {/* Connection + delays */}
          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{t("labelWhatsappId")}</Label>
              <Select
                value={selectedConnection ? String(selectedConnection.id) : ""}
                onValueChange={(val) => {
                  const c = connections.find((x) => String(x.id) === val) ?? null;
                  setSelectedConnection(c);
                  setSelectedTemplate(null);
                  setTemplates([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {loading ? (
                    <SelectItem value="loading" disabled>{t("loading")}</SelectItem>
                  ) : connections.length === 0 ? (
                    <SelectItem value="none" disabled>{t("noWabaConnections")}</SelectItem>
                  ) : (
                    connections.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedConnection && (selectedConnection.type ?? "").toLowerCase() === "waba" ? (
                <WabaConnectionQualityBadge
                  bmToken={selectedConnection.bmToken}
                  tokenAPI={selectedConnection.tokenAPI}
                  wabaId={selectedConnection.wabaId}
                  phoneHint={selectedConnection.number}
                  wabaVersion={selectedConnection.wabaVersion}
                  loadingLabel={t("qualityLoading")}
                  tooltipTitle={t("qualityTitle")}
                  tooltipBody={t("qualityBody")}
                />
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>{t("minSeconds")}</Label>
              <Input placeholder="Ex: 1" value={minDelay} onChange={(e) => setMinDelay(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("maxSeconds")}</Label>
              <Input placeholder="Ex: 3" value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} />
            </div>
          </div>

          {/* Pós-envio: fechar / atribuir fila / atribuir usuário (fechar é exclusivo; fila e user combináveis) */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="fecharTicket"
                checked={fecharTicket}
                onCheckedChange={(v) => {
                  setFecharTicket(v);
                  if (v) { setAssignQueue(false); setAssignUser(false); }
                }}
              />
              <Label htmlFor="fecharTicket">{t("closeTicket")}</Label>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="assignQueue"
                checked={assignQueue}
                onCheckedChange={(v) => {
                  setAssignQueue(v);
                  if (v) setFecharTicket(false);
                  else setSelectedAssignQueueId("");
                }}
              />
              <Label htmlFor="assignQueue">{t("assignQueue")}</Label>
            </div>
            {assignQueue && (
              <div className="space-y-2 min-w-[200px]">
                <Select value={selectedAssignQueueId} onValueChange={setSelectedAssignQueueId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectQueue")} />
                  </SelectTrigger>
                  <SelectContent>
                    {queues.map((q) => (
                      <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="assignUser"
                checked={assignUser}
                onCheckedChange={(v) => {
                  setAssignUser(v);
                  if (v) setFecharTicket(false);
                  else setSelectedAssignUserId("");
                }}
              />
              <Label htmlFor="assignUser">{t("assignUser")}</Label>
            </div>
            {assignUser && (
              <div className="space-y-2 min-w-[200px]">
                <Select value={selectedAssignUserId} onValueChange={setSelectedAssignUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectUser")} />
                  </SelectTrigger>
                  <SelectContent>
                    {assignUsers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Mode toggles */}
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="contatosImportar"
                checked={contatosImportar}
                onCheckedChange={(v) => { invalidateContactsLoad(); setContatosImportar(v); if (v) { setUseTags(false); setUseKanban(false); setUseWallet(false); setUseAllContacts(false); } }}
              />
              <Label htmlFor="contatosImportar">{t("importContacts")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="useTags"
                checked={useTags}
                onCheckedChange={(v) => { invalidateContactsLoad(); setUseTags(v); if (v) { setContatosImportar(false); setUseKanban(false); setUseWallet(false); setUseAllContacts(false); } }}
              />
              <Label htmlFor="useTags">{t("filterByTag")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="useKanban"
                checked={useKanban}
                onCheckedChange={(v) => { invalidateContactsLoad(); setUseKanban(v); if (v) { setContatosImportar(false); setUseTags(false); setUseWallet(false); setUseAllContacts(false); } }}
              />
              <Label htmlFor="useKanban">{t("kanban")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="useWallet"
                checked={useWallet}
                onCheckedChange={(v) => { invalidateContactsLoad(); setUseWallet(v); if (v) { setContatosImportar(false); setUseTags(false); setUseKanban(false); setUseAllContacts(false); } }}
              />
              <Label htmlFor="useWallet">{t("filterByWallet")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="useAllContacts"
                checked={useAllContacts}
                onCheckedChange={(v) => { invalidateContactsLoad(); setUseAllContacts(v); if (v) { setContatosImportar(false); setUseTags(false); setUseKanban(false); setUseWallet(false); } }}
              />
              <Label htmlFor="useAllContacts">{t("allContacts")}</Label>
            </div>
          </div>

          {/* Endereço: estreita etiqueta, kanban, carteira e todos (fora de importar e da lista manual) */}
          {(useTags || useKanban || useWallet || useAllContacts) && (
            <Collapsible open={addressOpen} onOpenChange={setAddressOpen} className="rounded-md border">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{tAddr("title")}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {!addressOpen && addressFilterActiveCount(addressFilter) > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {tAddr("activeCount", { count: addressFilterActiveCount(addressFilter) })}
                      </Badge>
                    )}
                    <ChevronDown className={cn("h-4 w-4 transition-transform", addressOpen && "rotate-180")} />
                  </span>
                </button>
              </CollapsibleTrigger>
              {/* Montado mesmo com o bloco fechado (só escondido): o Radix desmontaria os campos e o
                  filtro digitado sem "Aplicar" sumiria sem aviso. */}
              <div className={cn("space-y-3 border-t px-3 py-3", !addressOpen && "hidden")}>
                {addressUnsupported && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{tAddr("unsupported")}</AlertDescription>
                  </Alert>
                )}
                <AddressFilterFields
                  value={addressFilter}
                  onChange={handleAddressFilterChange}
                  mode="apply"
                  layout="row"
                  showHint
                  disabled={sending}
                  onPendingChange={setAddressDraftPending}
                />
              </div>
            </Collapsible>
          )}

          {/* Wallet selector */}
          {useWallet && (
            <div className="space-y-2">
              {loadingWallet && (
                <div className="text-xs text-muted-foreground animate-pulse">{t("loadingWalletContacts")}</div>
              )}
              <div className="flex gap-2">
                <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectWallet")} />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={filterContactsByWallet} disabled={!selectedWallet || loadingWallet}>
                  {t("selectAllFromWallet")}
                </Button>
              </div>
              {selectedContacts.length > 0 && (
                <p className="text-xs text-muted-foreground">{selectedContacts.length} {t("contacts")}</p>
              )}
            </div>
          )}

          {/* Tag selector */}
          {useTags && (
            <div className="space-y-2">
              {loadingTag && (
                <div className="text-xs text-muted-foreground animate-pulse">{t("loadingTagContacts")}</div>
              )}
              <Select value={selectedTag} onValueChange={setSelectedTag}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectTag")} />
                </SelectTrigger>
                <SelectContent>
                  {tags.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedContacts.length > 0 && (
                <p className="text-xs text-muted-foreground">{selectedContacts.length} {t("contacts")}</p>
              )}
            </div>
          )}

          {/* Kanban selector */}
          {useKanban && (
            <div className="space-y-2">
              {loadingKanban && (
                <div className="text-xs text-muted-foreground animate-pulse">{t("loadingKanbanContacts")}</div>
              )}
              <Select value={selectedKanban} onValueChange={setSelectedKanban}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectKanban")} />
                </SelectTrigger>
                <SelectContent>
                  {kanbans.map((k) => (
                    <SelectItem key={k.id} value={String(k.id)}>{k.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedContacts.length > 0 && (
                <p className="text-xs text-muted-foreground">{selectedContacts.length} {t("contacts")}</p>
              )}
            </div>
          )}

          {/* All contacts */}
          {useAllContacts && (
            <div className="space-y-1">
              {loadingAllContacts ? (
                <div className="text-xs text-muted-foreground animate-pulse">
                  {t("loadingAllContacts")} — {allContactsLoadedCount} {t("contacts")}
                </div>
              ) : selectedContacts.length > 0 ? (
                <p className="text-xs text-muted-foreground">{selectedContacts.length} {t("contacts")}</p>
              ) : null}
            </div>
          )}

          {/* Contact search (searchable, no full load) */}
          {contatosImportar && !useTags && !useKanban && (
            <div className="space-y-2">
              <div className="relative" ref={contactDropdownRef}>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => handleContactSearchChange(e.target.value)}
                  onFocus={() => contactSearch.length >= 2 && setShowContactDropdown(true)}
                  placeholder={t("contactSearchPlaceholder")}
                  autoComplete="off"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {showContactDropdown && (contactSearching || contactResults.length > 0) && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-[200px] overflow-y-auto">
                    {contactSearching ? (
                      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t("searching")}
                      </div>
                    ) : (
                      contactResults.map((c) => (
                        <div
                          key={c.value}
                          className="flex items-center gap-2 p-2 hover:bg-muted cursor-pointer text-sm"
                          onMouseDown={(e) => { e.preventDefault(); handleSelectContact(c); }}
                        >
                          <div className={cn("h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0", isLiveMode && "live-blur")}>
                            {c.label?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("font-medium truncate", isLiveMode && "live-blur-text")}>{c.label}</p>
                            <p className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>{c.value}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {contactSearch.length > 0 && contactSearch.length < 2 && (
                  <p className="text-xs text-muted-foreground mt-1">{t("typeAtLeast2Chars")}</p>
                )}
              </div>
              {selectedContacts.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-1">
                    {selectedContacts.map((c) => (
                      <Badge key={c.value} variant="secondary" className="flex items-center gap-1">
                        <span className={cn(isLiveMode && "live-blur-text")}>{c.label}</span>
                        <button onClick={() => setSelectedContacts((p) => p.filter((x) => x.value !== c.value))}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedContacts.length} {t("contacts")}</p>
                </>
              )}
            </div>
          )}

          {/* Manual number input + CSV */}
          {!contatosImportar && !useTags && !useKanban && !useWallet && !useAllContacts && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Label>{t("labelNumbers")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full hover:bg-muted p-0.5"
                        aria-label="info"
                      >
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 text-xs whitespace-pre-line" align="start">
                      {tWarn("behaviorInfo")}
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <input
                    ref={csvFileRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCSVUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => csvFileRef.current?.click()}
                    disabled={sending}
                  >
                    <Upload className="h-3 w-3" /> {t("importCsv")}
                  </Button>
                  <BulkCsvImportDialog
                    open={!!csvImport}
                    onOpenChange={(o) => {
                      if (!o) setCsvImport(null);
                    }}
                    fileName={csvImport?.fileName ?? ""}
                    content={csvImport?.content ?? ""}
                    mode="firstField"
                    onImport={({ text, count }) => {
                      setNumberInput(text);
                      toast.success(t("csvImported", { count }));
                      setCsvImport(null);
                    }}
                  />
                </div>
              </div>
              <Input
                placeholder="5511999999999, 5521888888888"
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value)}
              />

              {ambiguousLines.length > 0 && (
                <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium text-amber-700 dark:text-amber-500">
                      {tWarn("title")}{" "}
                      <span className="text-amber-600 dark:text-amber-500 font-normal">
                        ({ambiguousLines.length} {tWarn("count")})
                      </span>
                    </p>
                    <p className="text-muted-foreground">{tWarn("hint")}</p>
                    <ul className="space-y-1 max-h-40 overflow-y-auto pt-1">
                      {ambiguousLines.slice(0, 20).map((amb) => (
                        <li key={amb.lineNumber} className="font-mono text-[11px] break-all">
                          <span className="text-amber-700 dark:text-amber-500">#{amb.lineNumber}</span>{" "}
                          <span className="text-muted-foreground">
                            [{amb.reason === "fixed_has_9"
                              ? tWarn("reasonFixedHas9")
                              : amb.reason === "mobile_missing_9"
                                ? tWarn("reasonMobileMissing9")
                                : tWarn("reasonMobileHas9")}]
                          </span>{" "}
                          <span>{tWarn("lineFormat", { raw: amb.raw, normalized: amb.normalized })}</span>
                        </li>
                      ))}
                      {ambiguousLines.length > 20 && (
                        <li className="text-muted-foreground italic">
                          {tWarn("moreLines", { count: ambiguousLines.length - 20 })}
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {duplicateGroups.length > 0 && (
                <div className="flex gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-xs">
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-500" />
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium text-sky-700 dark:text-sky-500">
                      {tWarn("duplicatesTitle")}{" "}
                      <span className="text-sky-600 dark:text-sky-500 font-normal">
                        ({duplicateGroups.reduce((acc, g) => acc + g.lines.length - 1, 0)} {tWarn("duplicatesCount")})
                      </span>
                    </p>
                    <p className="text-muted-foreground">{tWarn("duplicatesHint")}</p>
                    <ul className="space-y-1 max-h-40 overflow-y-auto pt-1">
                      {duplicateGroups.slice(0, 20).map((dup) => (
                        <li key={dup.normalized} className="font-mono text-[11px] break-all">
                          <span>{tWarn("duplicateLineFormat", { normalized: dup.normalized, lines: dup.lines.join(", ") })}</span>
                        </li>
                      ))}
                      {duplicateGroups.length > 20 && (
                        <li className="text-muted-foreground italic">
                          {tWarn("moreLines", { count: duplicateGroups.length - 20 })}
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Selected template display */}
          {selectedTemplate && (
            <div className="rounded-md border p-3 bg-muted/40 space-y-1">
              <p className="text-sm font-medium">
                {t("selectedTemplate")}: <span className="text-primary">{selectedTemplate.name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                ID: {selectedTemplate.id} · Lang: {selectedTemplate.language}
              </p>
            </div>
          )}

          {/* Progress */}
          {sending && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground flex-1">
                  {isPaused ? (
                    <span className="text-yellow-600 font-medium">{t("dispatchPaused")} — </span>
                  ) : null}
                  {t("messagesSent")}: {sentCount} {t("of")} {totalMessages}
                  {failedCount > 0 && <span className="text-destructive ml-2">— {t("notifications.failed")}: {failedCount}</span>}
                  {skippedCount > 0 && <span className="text-amber-600 dark:text-amber-500 ml-2">— {t("skippedLabel")}: {skippedCount}</span>}
                </p>
                {!isPaused ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-yellow-600 border-yellow-500 hover:bg-yellow-50"
                    onClick={() => { isPausedRef.current = true; setIsPaused(true); }}
                  >
                    <Pause className="h-3 w-3" /> {t("pauseDispatch")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-green-600 border-green-500 hover:bg-green-50"
                    onClick={() => { isPausedRef.current = false; setIsPaused(false); }}
                  >
                    <PlayCircle className="h-3 w-3" /> {t("resumeDispatch")}
                  </Button>
                )}
              </div>
              <Progress value={totalMessages > 0 ? (sentCount / totalMessages) * 100 : 0} />
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={buscarTemplates} disabled={!selectedConnection || sending}>
              {t("selectTemplateBtn")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearFields}
              disabled={sending}
            >
              {t("clearForm")}
            </Button>
          </div>
        </CardContent>
      </Card>
      {/* Preview WhatsApp ao lado do formulário (xl+); abaixo do form em telas menores */}
      <div className="flex flex-col items-center gap-2 xl:sticky xl:top-6">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("preview")}
        </p>
        <WhatsAppPreview
          message={previewTplBody}
          mediaUrl={previewTplHeaderUrl}
          mediaType={previewTplMediaType}
          footer={previewTplFooter}
        />
      </div>
      </div>

      {/* Template selection dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: template selector + variable inputs */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("labelTemplate")}</Label>
                {/* W3-B: para canais nao-WABA (dialog360 | gupshup), usa picker
                    agnostico que carrega via getTemplatesForChannel. Para WABA,
                    mantem o Select inline original (zero regressao). */}
                {selectedConnection && (selectedConnection.type === "dialog360" || selectedConnection.type === "gupshup") ? (
                  <TemplatePickerByChannel
                    whatsapp={selectedConnection}
                    value={selectedTemplate?.id ?? ""}
                    onChange={(tmpl) => {
                      if (tmpl) handleTemplateSelection(tmpl as WabaTemplate);
                    }}
                    placeholderLoading={t("loading")}
                    placeholderSelect={t("chooseTemplate")}
                  />
                ) : (
                <div className="flex gap-2">
                  <TemplateCategorySelect
                    value={templateCategoryFilter}
                    onChange={setTemplateCategoryFilter}
                    className="w-40 shrink-0"
                  />
                  <Select
                    value={selectedTemplate?.id ?? ""}
                    onValueChange={(val) => {
                      const tmpl = templates.find((x) => x.id === val);
                      if (tmpl) handleTemplateSelection(tmpl);
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={loadingTemplates ? t("loading") : t("chooseTemplate")} />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.filter((tp) => matchTemplateCategory(tp, templateCategoryFilter)).map((tp) => (
                        <SelectItem key={tp.id} value={tp.id}>
                          {tp.name}
                          {tp.category && (
                            <span className="ml-1 text-[10px] text-muted-foreground uppercase">· {tp.category}</span>
                          )}
                          {tp.status && tp.status !== "APPROVED" && (
                            <span className="ml-1 text-xs text-muted-foreground">({tp.status})</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}
              </div>

              {/* Variable inputs with system var dropdown */}
              {templateComponents.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">{t("fillVariables")}</Label>
                  {templateComponents.map((comp, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{comp.label}</Label>
                      <div className="flex gap-2">
                        <Input
                          className="flex-1"
                          value={comp.value}
                          onChange={(e) => {
                            const updated = [...templateComponents];
                            updated[i] = { ...updated[i], value: e.target.value };
                            setTemplateComponents(updated);
                          }}
                          placeholder={t("variableValuePlaceholder", { n: i + 1 })}
                        />
                        {comp.key.startsWith("header_") && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title={t("pickFromGallery")}
                            onClick={() => openTplGallery(i)}
                          >
                            <Images className="h-4 w-4" />
                          </Button>
                        )}
                        {!comp.key.startsWith("header_") && (
                          <SystemVarDropdown
                            t={t}
                            onSelect={(sv) => {
                              const updated = [...templateComponents];
                              updated[i] = { ...updated[i], value: (updated[i].value + sv).trim() };
                              setTemplateComponents(updated);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Cobrança — só existe em template ORDER_DETAILS. Template comum
                  nunca renderiza este bloco. */}
              {isOrderDetailsSelected && selectedTemplate && (
                <div className="space-y-2 border-t pt-3">
                  <Label className="text-sm font-medium">{tOrder("sectionTitle")}</Label>
                  <p className="text-xs text-muted-foreground">{tOrder("sectionHint")}</p>
                  <OrderDetailsFields
                    key={`${selectedTemplate.name}-${selectedTemplate.language}`}
                    value={orderDetailsValue}
                    onChange={setOrderDetailsValue}
                    compact
                    bulkWarning
                  />
                </div>
              )}
            </div>

            {/* Right: preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("preview")}</Label>
              {selectedTemplate ? (
                <WabaTemplateMobilePreview template={buildPreviewTemplate(selectedTemplate, templateComponents)} />
              ) : (
                <div className="flex items-center justify-center h-32 rounded-xl bg-[#e5ddd5] text-xs text-gray-400">
                  {t("selectTemplateToPreview")}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button disabled={!selectedTemplate || sending} onClick={() => handleSend(false)}>
              {sending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {t("send")}
            </Button>
            <Button variant="secondary" disabled={!selectedTemplate || sending} onClick={() => handleSend(true)}>
              {t("sendMarketing")}
            </Button>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gallery picker for header media URL */}
      {(() => {
        const headerKey = tplGalleryTarget !== null ? templateComponents[tplGalleryTarget]?.key : undefined;
        const { galleryFileType, uploadAccept } = wabaHeaderFormatToGalleryParams(
          headerKey === "header_image" ? "IMAGE" : headerKey === "header_video" ? "VIDEO" : headerKey === "header_document" ? "DOCUMENT" : undefined,
        );
        return (
          <GalleryPickerWithUploadDialog
            open={tplGalleryOpen}
            onOpenChange={setTplGalleryOpen}
            onPick={pickTplGalleryItem}
            galleryFileType={galleryFileType}
            uploadAccept={uploadAccept}
          />
        );
      })()}

      <SendProgressModal
        open={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        sending={sending}
        sentCount={sentCount}
        totalMessages={totalMessages}
        errors={failedCount + skippedCount}
        errorLog={sendErrorLog}
        successLog={sendSuccessLog}
        detailLine={
          skippedCount > 0
            ? [selectedTemplate?.name, t("skippedSummary", { sent: sentCount, failed: failedCount, skipped: skippedCount })]
                .filter(Boolean)
                .join(" — ")
            : selectedTemplate?.name
        }
        isPaused={isPaused}
        onPause={() => { isPausedRef.current = true; setIsPaused(true); }}
        onResume={() => { isPausedRef.current = false; setIsPaused(false); }}
      />
    </>
  );
}
