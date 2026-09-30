"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AlertCircle, Info } from "lucide-react";
import { parseBulkCsv, type BulkInvalidLine } from "@/lib/bulk-csv-parser";
import { detectBrPhoneAmbiguity, normalizeBrPhone } from "@/lib/phone-utils";
import { isValidHttpUrl } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, RefreshCw, Pause, PlayCircle, Images, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { toast } from "sonner";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { filterWhatsappsForCurrentUser } from "@/lib/whatsapp-user-access";
import {
  fetchWabaTemplates,
  createDispatch,
  filterBulkRecipients,
  incrementDispatch,
  BULK_WABA_CHANNEL_TYPE,
  type WabaTemplate,
  type WabaTemplateComponent,
} from "@/services/bulk";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuthStore } from "@/stores/auth-store";
import { fetchContacts, createContact } from "@/services/contacts";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchWallets } from "@/services/wallets";
import { createTicket, fetchTicket, updateTicket } from "@/services/tickets";
import { sendWabaTemplateComponents, sendWabaTemplateMarketingComponents } from "@/services/messages";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { formatBulkSendError } from "@/lib/bulk-send-error-format";
import { getBrPhoneVariants } from "@/lib/phone-utils";
import { SendProgressModal } from "@/components/massa/send-progress-modal";
import { BulkCsvImportDialog } from "@/components/massa/bulk-csv-import-dialog";
import { WhatsAppPreview } from "@/components/massa/whatsapp-preview";
// W3-B: picker agnostico de BSP (waba | dialog360 | gupshup). Para WABA o
// caller mantem o Select inline atual (zero regressao); este componente
// e renderizado em paralelo apenas quando o canal e nao-WABA.
import { TemplatePickerByChannel } from "@/components/massa/template-picker-by-channel";
import {
  TemplateCategorySelect,
  type TemplateCategoryFilter,
  matchTemplateCategory,
} from "@/components/atendimento/template-category-filter";
import { WabaConnectionQualityBadge } from "@/components/atendimento/waba-connection-quality-badge";
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

function extractTemplateVariables(template: WabaTemplate): string[] {
  const vars: string[] = [];
  // Aceita numbered (`{{1}}`) e named (`{{nome}}`). Named so e valido em BODY
  // (Meta — parameter_format=NAMED); header texto e URL de botao sempre usam numbered.
  const collect = (source: string | undefined, allowNamed = false) => {
    if (!source) return;
    const re = allowNamed ? /\{\{([\w]+)\}\}/g : /\{\{(\d+)\}\}/g;
    const matches = source.match(re) || [];
    matches.forEach((m) => { if (!vars.includes(m)) vars.push(m); });
  };
  // Detecta NAMED pelo parameter_format OU pela presença de body_text_named_params
  // OU pela presença de {{nome}} (não-numérico) no próprio body. Cobre o caso
  // em que a Meta não devolve parameter_format no list (bug 132000 observado).
  const bodyComp = (template.components || []).find((c) => c.type === "BODY");
  const hasNamedExample = !!bodyComp?.example?.body_text_named_params?.length;
  const hasNamedTextMatch = !!bodyComp?.text && /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/.test(bodyComp.text);
  const isNamed =
    (template as unknown as { parameter_format?: string }).parameter_format === "NAMED" ||
    hasNamedExample ||
    hasNamedTextMatch;
  (template.components || []).forEach((comp) => {
    if (comp.type === "HEADER" && comp.format === "TEXT") collect(comp.text);
    if (comp.type === "BODY") collect(comp.text, isNamed);
    if (comp.type === "BUTTONS") {
      (comp.buttons || []).forEach((b) => {
        if (b.type === "URL") collect(b.url);
      });
    }
  });
  return vars;
}

/** Info das variáveis do BODY (numbered ou named), compartilhada entre a validação
 *  (expectedVarCount) e a montagem do payload (buildComponentsFromVars) para que as
 *  duas nunca divirjam. NAMED é detectado pelo parameter_format, pelo example OU
 *  pelos placeholders não-numéricos no texto (Meta nem sempre devolve example). */
function getBodyVarInfo(template: WabaTemplate | null): { isNamed: boolean; names: string[]; count: number } {
  const comps: WabaTemplateComponent[] = template?.components || [];
  const bodyComp = comps.find((c) => c.type === "BODY");
  const example = (bodyComp as unknown as { example?: { body_text_named_params?: { param_name: string }[] } })?.example;
  const namedParams = example?.body_text_named_params || [];
  const textNamed = bodyComp?.text
    ? Array.from(bodyComp.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)).map((m) => m[1])
    : [];
  const isNamed =
    (template as unknown as { parameter_format?: string })?.parameter_format === "NAMED" ||
    namedParams.length > 0 ||
    textNamed.length > 0;
  if (isNamed) {
    // União texto + example sem duplicar; ordem do texto primeiro (é a ordem que o
    // usuário vê no preview e, portanto, a ordem esperada das colunas do CSV).
    const names: string[] = [];
    textNamed.forEach((n) => { if (!names.includes(n)) names.push(n); });
    namedParams.forEach((p) => { if (p?.param_name && !names.includes(p.param_name)) names.push(p.param_name); });
    return { isNamed: true, names, count: names.length };
  }
  const count = bodyComp?.text ? (bodyComp.text.match(/\{\{\d+\}\}/g) || []).length : 0;
  return { isNamed: false, names: [], count };
}

function TemplatePreview({ template, t }: { template: WabaTemplate; t: (key: string) => string }) {
  const comps: WabaTemplateComponent[] = template.components || [];
  const header = comps.find((c) => c.type === "HEADER");
  const body = comps.find((c) => c.type === "BODY");
  const footer = comps.find((c) => c.type === "FOOTER");
  const buttons = comps.find((c) => c.type === "BUTTONS");

  return (
    <div className="flex flex-col items-center bg-[#e5ddd5] rounded-xl p-4">
      <div className="w-full max-w-xs">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {header && (
            <div className="bg-gray-100 px-3 pt-3 pb-2">
              {header.format === "IMAGE" ? (
                <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">{t("imagePreview")}</div>
              ) : header.format === "VIDEO" ? (
                <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">{t("videoPreview")}</div>
              ) : header.format === "DOCUMENT" ? (
                <div className="w-full h-10 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">{t("documentPreview")}</div>
              ) : header.text ? (
                <p className="text-sm font-semibold text-gray-800">{header.text}</p>
              ) : null}
            </div>
          )}
          {body?.text && (
            <div className="px-3 py-2">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{body.text}</p>
            </div>
          )}
          {footer?.text && (
            <div className="px-3 pb-2">
              <p className="text-xs text-gray-400">{footer.text}</p>
            </div>
          )}
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

export default function MassaTemplateVariavelPage() {
  const t = useTranslations("massaTemplateVariavelPage");
  const tWarn = useTranslations("bulkPhoneWarnings");
  const tCsv = useTranslations("bulkCsvImport");
  const tOrder = useTranslations("orderDetails");
  const allowed = usePageAccess("massa");
  if (!allowed) return <AccessDenied />;
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
  const [fecharTicket, setFecharTicket] = useState(true);
  const [assignQueue, setAssignQueue] = useState(false);
  const [assignUser, setAssignUser] = useState(false);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedAssignQueueId, setSelectedAssignQueueId] = useState<string>("");
  const [assignUsers, setAssignUsers] = useState<{ id: number; name: string }[]>([]);
  const [selectedAssignUserId, setSelectedAssignUserId] = useState<string>("");

  const [templates, setTemplates] = useState<WabaTemplate[]>([]);
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<TemplateCategoryFilter>("all");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WabaTemplate | null>(null);
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);
  // Ficha de cobrança única do disparo — não vem do CSV: o mesmo código de
  // pagamento vale para todas as linhas (reference_id por destinatário é backend).
  const [orderDetailsValue, setOrderDetailsValue] = useState<OrderDetailsValue>(() => emptyOrderDetails());

  const [defaultHeaderUrl, setDefaultHeaderUrl] = useState("");
  const [tplGalleryOpen, setTplGalleryOpen] = useState(false);

  const [numberInput, setNumberInput] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [csvImport, setCsvImport] = useState<{ fileName: string; content: string } | null>(null);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWhatsapps();
      const raw: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
      // Restringe ao whatsappAllowed do usuário (espelha o Atendimento).
      const all = filterWhatsappsForCurrentUser(raw);
      // Massa template-variavel aceita WABA + BSPs (gupshup, dialog360).
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

  const loadTemplates = useCallback(async (whatsapp: Whatsapp) => {
    setLoadingTemplates(true);
    setTemplates([]);
    setSelectedTemplate(null);
    setTemplateVariables([]);
    try {
      const res = await fetchWabaTemplates(whatsapp.id);
      const sorted = (Array.isArray(res.data) ? res.data : []).sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      );
      setTemplates(sorted);
    } catch {
      toast.error(t("errorLoadTemplates"));
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

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

  useEffect(() => { if (assignQueue && queues.length === 0) loadAssignQueues(); }, [assignQueue, queues.length, loadAssignQueues]);
  useEffect(() => { if (assignUser && assignUsers.length === 0) loadAssignUsers(); }, [assignUser, assignUsers.length, loadAssignUsers]);

  const handleConnectionChange = (val: string) => {
    const conn = connections.find((c) => String(c.id) === val) ?? null;
    setSelectedConnection(conn);
    if (conn) loadTemplates(conn);
    else { setTemplates([]); setSelectedTemplate(null); setTemplateVariables([]); }
  };

  const handleTemplateSelection = (templateId: string) => {
    const t = templates.find((x) => x.id === templateId) ?? null;
    setSelectedTemplate(t);
    if (t) setTemplateVariables(extractTemplateVariables(t));
    else setTemplateVariables([]);
    setDefaultHeaderUrl("");
    // Zera a ficha de cobrança ao trocar de template — o valor antigo não
    // pertence ao template novo (ORDER_DETAILS não ocupa coluna do CSV).
    setOrderDetailsValue(emptyOrderDetails());
  };

  // Template de cobrança (sub_category / display_format / botão ORDER_DETAILS):
  // liga o formulário de pagamento e o campo `orderDetails` no payload.
  const isOrderDetailsSelected = useMemo(
    () => isOrderDetailsTemplate(selectedTemplate),
    [selectedTemplate]
  );

  const pickTplGalleryItem = (item: GalleryItem) => {
    setDefaultHeaderUrl(item.url);
    setTplGalleryOpen(false);
  };

  const expectedVarCount = useMemo(() => {
    if (!selectedTemplate) return undefined;
    const comps: WabaTemplateComponent[] = selectedTemplate.components || [];
    const header = comps.find((c) => c.type === "HEADER");
    const hasMediaHeader =
      header && (header.format === "IMAGE" || header.format === "VIDEO" || header.format === "DOCUMENT");
    const hasTextHeader = header && header.format === "TEXT";
    const headerTextVarCount = hasTextHeader && header?.text
      ? (header.text.match(/\{\{\d+\}\}/g) || []).length
      : 0;
    // NAMED-aware: templates com {{nome}} também ocupam colunas no CSV.
    const bodyVarCount = getBodyVarInfo(selectedTemplate).count;
    const buttonsComp = comps.find((c) => c.type === "BUTTONS");
    const btnVarCount = (buttonsComp?.buttons || []).reduce((acc, b) => {
      if (b.type === "COPY_CODE") return acc + 1;
      if (b.type === "URL" && b.url && /\{\{\d+\}\}/.test(b.url)) return acc + 1;
      return acc;
    }, 0);
    const mediaSlot = hasMediaHeader && !defaultHeaderUrl.trim() ? 1 : 0;
    return mediaSlot + headerTextVarCount + bodyVarCount + btnVarCount;
  }, [selectedTemplate, defaultHeaderUrl]);

  const parsedBulk = useMemo(() => {
    if (!numberInput.trim()) return { valid: [], invalid: [] as BulkInvalidLine[] };
    return parseBulkCsv(numberInput, { expectedVarCount });
  }, [numberInput, expectedVarCount]);

  const ambiguousLines = useMemo(() => {
    const out: { lineNumber: number; raw: string; normalized: string; reason: string }[] = [];
    for (const line of parsedBulk.valid) {
      const a = detectBrPhoneAmbiguity(line.number);
      if (a) out.push({ lineNumber: line.lineNumber, raw: a.raw, normalized: a.normalized, reason: a.reason });
    }
    return out;
  }, [parsedBulk.valid]);

  const duplicateGroups = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const line of parsedBulk.valid) {
      const norm = normalizeBrPhone(line.number) || line.number;
      if (!map.has(norm)) map.set(norm, []);
      map.get(norm)!.push(line.lineNumber);
    }
    return Array.from(map.entries())
      .filter(([, lines]) => lines.length > 1)
      .map(([normalized, lines]) => ({ normalized, lines }));
  }, [parsedBulk.valid]);

  // Fail-fast: template com header de mídia exige que a 1ª coluna de cada linha
  // seja uma URL http(s) (quando não há URL padrão). Sem isso o valor vai parar
  // em template.components.parameters.image.link e a Meta rejeita com (#100).
  const headerUrlInvalidLines = useMemo(() => {
    if (!selectedTemplate) return [] as { lineNumber: number; value: string }[];
    const header = (selectedTemplate.components || []).find((c) => c.type === "HEADER");
    const hasMediaHeader = header && ["IMAGE", "VIDEO", "DOCUMENT"].includes(header.format || "");
    if (!hasMediaHeader || defaultHeaderUrl.trim()) return [];
    return parsedBulk.valid
      .filter((line) => !isValidHttpUrl(line.vars[0]))
      .map((line) => ({ lineNumber: line.lineNumber, value: line.vars[0]?.trim() || "" }));
  }, [selectedTemplate, defaultHeaderUrl, parsedBulk.valid]);

  const defaultHeaderUrlInvalid = !!defaultHeaderUrl.trim() && !isValidHttpUrl(defaultHeaderUrl);

  const getLineCount = () => parsedBulk.valid.length;

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
        // Sufixo: tolera presença/ausência do 9 em celulares BR
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
      // Interceptor rejeita com o response direto: { status, data: { error } }
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

  /** Monta o array de components para o payload WABA a partir das variáveis da linha */
  const buildComponentsFromVars = (lineVars: string[]): Record<string, unknown>[] => {
    const comps: WabaTemplateComponent[] = selectedTemplate?.components || [];
    const result: Record<string, unknown>[] = [];

    const header = comps.find((c) => c.type === "HEADER");
    const buttonsComp = comps.find((c) => c.type === "BUTTONS");
    const bodyInfo = getBodyVarInfo(selectedTemplate);

    const hasMediaHeader = header && (header.format === "IMAGE" || header.format === "VIDEO" || header.format === "DOCUMENT");
    const hasTextHeader = header && header.format === "TEXT";
    const headerTextVarCount = hasTextHeader && header?.text
      ? (header.text.match(/\{\{\d+\}\}/g) || []).length
      : 0;
    // A coluna de mídia só existe no CSV quando NÃO há URL padrão definida —
    // exatamente o mesmo critério do expectedVarCount (mediaSlot). Antes daqui,
    // lineVars[0] era sempre consumido como URL e ainda ganhava da URL padrão,
    // o que mandava a variável do corpo para image.link (erro Meta #100).
    const mediaConsumesVar = !!hasMediaHeader && !defaultHeaderUrl.trim();
    const mediaOffset = mediaConsumesVar ? 1 : 0;
    const offset = mediaOffset + headerTextVarCount;

    if (hasMediaHeader) {
      const headerUrl = defaultHeaderUrl.trim() || (lineVars[0]?.trim() ?? "");
      if (headerUrl) {
        result.push({ type: "HEADER", format: header!.format, value: headerUrl });
      }
    }

    if (hasTextHeader && headerTextVarCount > 0) {
      const headerVals = lineVars
        .slice(mediaOffset, mediaOffset + headerTextVarCount)
        .map((v) => v?.trim() || " ");
      result.push({ type: "HEADER", format: "TEXT", variables: headerVals });
    }

    // BODY pode ser numbered (`{{1}}`) ou named (`{{nome}}` via parameter_format=NAMED).
    const bodyVarCount = bodyInfo.count;
    if (bodyInfo.isNamed && bodyVarCount > 0) {
      // `name` (não parameter_name): é o campo que o backend lê para montar o
      // parameter_name na chamada à Meta.
      const parameters = bodyInfo.names.map((name, i) => ({
        type: "text",
        text: (lineVars[offset + i]?.trim() || " "),
        name,
      }));
      result.push({ type: "BODY", parameters });
    } else if (bodyVarCount > 0) {
      const bodyVals = lineVars.slice(offset, offset + bodyVarCount).map((v) => v?.trim() || " ");
      result.push({ type: "BODY", variables: bodyVals });
    }

    if (buttonsComp?.buttons) {
      const btnStart = offset + bodyVarCount;
      const btnItems: Record<string, unknown>[] = [];
      let btnVarIdx = 0;

      buttonsComp.buttons.forEach((btn, origIdx) => {
        const isDynamicUrl = btn.type === "URL" && !!btn.url && /\{\{\d+\}\}/.test(btn.url);
        const isCopyCode = btn.type === "COPY_CODE";
        if (!isDynamicUrl && !isCopyCode) return;

        const varVal = lineVars[btnStart + btnVarIdx] || "";
        btnVarIdx++;

        const subType = isCopyCode ? "copy_code" : "url";
        btnItems.push({ type: btn.type, sub_type: subType, index: origIdx, parameters: [{ type: "text", text: varVal || btn.text || " " }] });
      });

      if (btnItems.length > 0) result.push({ type: "BUTTONS", buttons: btnItems });
    }

    return result;
  };

  const handleSend = async (isMarketing = false) => {
    // Camada 1c — guard sincrono: segundo clique enquanto o primeiro ainda esta
    // em voo retorna silenciosamente. Cobre janela ate setSending(true) propagar.
    if (sendingRef.current) return;
    if (!selectedConnection) { toast.error(t("selectConnection")); return; }
    if (!selectedTemplate) { toast.error(t("selectTemplate")); return; }
    if (!numberInput.trim()) { toast.error(t("provideNumbersAndVars")); return; }
    if (parsedBulk.invalid.length > 0) { toast.error(t("fixInvalidLinesFirst")); return; }
    if (parsedBulk.valid.length === 0) { toast.error(t("noValidLines")); return; }
    if (defaultHeaderUrlInvalid || headerUrlInvalidLines.length > 0) { toast.error(t("headerUrlInvalidTitle")); return; }
    // Cobrança: valida a ficha ANTES de abrir o dispatch — payload inválido em
    // lote custaria N tickets órfãos com 400 em cada envio.
    if (isOrderDetailsSelected) {
      const orderError = validateOrderDetails(orderDetailsValue);
      if (orderError) { toast.warning(tOrder(orderError)); return; }
    }

    sendingRef.current = true;

    // Nota: nao dedupamos `lines` pelo numero, pois cada linha pode trazer
    // variaveis diferentes para o mesmo destinatario (uso intencional). A
    // protecao por (contact, whatsapp) cai no backend via FindOrCreate bulk-safe.
    const lines = parsedBulk.valid;
    const minInt = minDelay ? parseInt(minDelay, 10) : 1;
    const maxInt = maxDelay ? parseInt(maxDelay, 10) : 3;

    setSending(true);
    setIsPaused(false);
    isPausedRef.current = false;
    setSentCount(0);
    setFailedCount(0);
    setSkippedCount(0);
    setTotalMessages(lines.length);
    setSendErrorLog([]);
    setSendSuccessLog([]);
    setProgressModalOpen(true);
    let skippedTotal = 0;

    // Pré-check v3 (crossChannelTicketCheck): flag lida 1x por disparo. "disabled"
    // explícito => zero requests novos; ausente/ainda não carregada => chama mesmo
    // assim (o backend re-valida a flag — fail-safe, flag off vira no-op).
    const crossChannelCheckEnabled =
      useAuthStore.getState().getConfigValue("crossChannelTicketCheck") !== "disabled";
    // Números APROVADOS no pré-check, memoizados por família de variantes BR: esta
    // tela repete o MESMO número em várias linhas (variáveis diferentes, uso
    // intencional) e o próprio disparo cria tickets — re-checar a linha 2 depois do
    // envio da linha 1 seria auto-bloqueio. Bloqueado NÃO memoiza: re-checa a cada
    // linha (cada chamada reconcilia 1 falha no dispatch e re-verifica o ticket).
    const approvedNumbers = new Set<string>();
    const senderUserId = useAuthStore.getState().user?.userId ?? null;
    // Mesmo número em várias linhas: a linha seguinte reaproveita (409) o ticket da
    // anterior. Aplicar o destino (pendente/fila/usuário) já na 1ª linha tiraria o
    // ticket de quem dispara, e a trava de acesso barraria as seguintes (403). Com
    // "Fechar ticket" desligado, o destino de ticket criado pelo disparo só é
    // aplicado depois da ÚLTIMA linha do número; o que sobrar adiado (última linha
    // pulada ou com erro de setup) é aplicado no fim do disparo.
    const phoneKey = (n: string) => getBrPhoneVariants(n).sort()[0] || n.replace(/\D/g, "");
    const lastLineByPhone = new Map<string, number>();
    lines.forEach((l, idx) => lastLineByPhone.set(phoneKey(l.number), idx));
    const ticketsCreatedInRun = new Set<number>();
    const deferredDestinations = new Map<number, Record<string, unknown>>();
    // Destino adiado só vale se o ticket AINDA está aberto com quem disparou: se um
    // colega assumiu ou fechou no meio do disparo, aplicar agora desfaria a ação dele.
    const applyDeferredDestination = async (deferredTicketId: number, deferredUpdates: Record<string, unknown>) => {
      try {
        const { data } = await fetchTicket(deferredTicketId);
        const current = data as { status?: string; userId?: number | null };
        if (current?.status !== "open" || Number(current?.userId) !== Number(senderUserId)) return;
      } catch {
        return;
      }
      await applyTicketDestination(deferredTicketId, deferredUpdates, true);
    };

    // Cria registro de tracking
    let bulkDispatchId: number | null = null;
    try {
      const dr = await createDispatch({
        dispatchType: isMarketing ? "template_variable_marketing" : "template_variable",
        totalMessages: lines.length,
        whatsappId: selectedConnection.id,
        templateName: selectedTemplate.name,
        minDelay: minInt,
        maxDelay: maxInt,
      });
      bulkDispatchId = dr.data?.id ?? null;
      bulkDispatchIdRef.current = bulkDispatchId;
    } catch {}

    // Cobrança vai como campo próprio: o backend monta, valida e injeta o
    // componente no BUTTONS. Sem cobrança o spread vira {} (no-op).
    const orderDetailsField = isOrderDetailsSelected
      ? { orderDetails: buildOrderDetailsPayload(orderDetailsValue) }
      : {};

    for (let i = 0; i < lines.length; i++) {
      while (isPausedRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
      const number = lines[i].number;
      const lineVars = lines[i].vars;
      const randomDelay = Math.floor(Math.random() * (maxInt - minInt + 1) + minInt) * 1000;

      // Pré-check v3: pular ANTES de criar contato/ticket — depois já é tarde (o
      // 409 same-channel reutilizaria o ticket ativo e o updateTicket pós-envio
      // fecharia/rebaixaria a conversa de outro atendente). Contagem por LINHA:
      // número bloqueado com N linhas gera N pulados (fecha sent+failed+skipped
      // === totalMessages no dispatch).
      const preCheckDigits = number.replace(/\D/g, "");
      if (crossChannelCheckEnabled && preCheckDigits && !approvedNumbers.has(preCheckDigits)) {
        let blockedByActiveTicket = false;
        try {
          const res = await filterBulkRecipients({
            numbers: [preCheckDigits],
            bulkDispatchId: bulkDispatchId ?? undefined,
            dispatchLabel: "Disparo de Template com Variáveis",
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
        if (i < lines.length - 1) await new Promise((r) => setTimeout(r, randomDelay));
        continue;
      }
      if (ticketCreatedNow) ticketsCreatedInRun.add(ticketId);
      const createdByDispatch = ticketsCreatedInRun.has(ticketId);
      const hasLaterLine = (lastLineByPhone.get(phoneKey(number)) ?? i) > i;

      const components = buildComponentsFromVars(lineVars);
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
        // BSPs (Gupshup/Dialog360) usam endpoints próprios.
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
          } else if (createdByDispatch) {
            // Ticket deste disparo nasce com quem disparou como dono; o retorno a
            // pendente só solta o dono com forcePendingUser desligado. Ticket
            // reaproveitado de fora do disparo (409) segue com o payload de sempre.
            updates.userId = null;
          }
          if (createdByDispatch && hasLaterLine && senderUserId) {
            deferredDestinations.set(ticketId, updates);
          } else {
            deferredDestinations.delete(ticketId);
            await applyTicketDestination(ticketId, updates, createdByDispatch);
          }
        }
        setSentCount((c) => c + 1);
        setSendSuccessLog((prev) => [...prev, { number, timestamp: new Date() }]);
      } catch (err) {
        logger.error(`Erro ao enviar template variável para ${number}:`, err);
        setFailedCount((c) => c + 1);
        setSendErrorLog((prev) => [...prev, { number, error: formatBulkSendError(err), timestamp: new Date() }]);
        // Envio falhou: o ticket que ESTA linha criou fecha sem despedida (mesmo
        // efeito de "Fechar ticket após envio") em vez de ficar aberto sem template.
        // Ticket reaproveitado (409) já tem conversa e não é fechado.
        if (ticketCreatedNow) {
          await updateTicket(ticketId, { status: "closed", userId: null, skipFarewell: true }).catch(() => {});
        }
      }

      // Última linha do número falhou no envio: aplica o destino que ficou adiado
      // pelas linhas anteriores (que chegaram a enviar).
      const deferredUpdates = hasLaterLine ? undefined : deferredDestinations.get(ticketId);
      if (deferredUpdates) {
        deferredDestinations.delete(ticketId);
        await applyDeferredDestination(ticketId, deferredUpdates);
      }

      if (i < lines.length - 1) {
        await new Promise((r) => setTimeout(r, randomDelay));
      }
    }

    for (const [deferredTicketId, deferredUpdates] of Array.from(deferredDestinations.entries())) {
      await applyDeferredDestination(deferredTicketId, deferredUpdates);
    }
    deferredDestinations.clear();

    setSending(false);
    sendingRef.current = false;
    bulkDispatchIdRef.current = null;
    setIsPaused(false);
    isPausedRef.current = false;
    toast.success(t("successSend"));
    if (skippedTotal > 0) {
      toast.info(t("skippedToastSummary", { count: skippedTotal }));
    }
  };

  const clearFields = () => {
    setNumberInput("");
    setMinDelay("");
    setMaxDelay("");
    setSelectedConnection(null);
    setSelectedTemplate(null);
    setTemplateVariables([]);
    setTemplates([]);
    setDefaultHeaderUrl("");
    setOrderDetailsValue(emptyOrderDetails());
    setAssignQueue(false);
    setSelectedAssignQueueId("");
    setAssignUser(false);
    setSelectedAssignUserId("");
    setSentCount(0);
    setFailedCount(0);
    setTotalMessages(0);
    setSendErrorLog([]);
    setSendSuccessLog([]);
    setProgressModalOpen(false);
    if (csvFileRef.current) csvFileRef.current.value = "";
    toast.warning(t("fieldsCleared"));
  };

  const lineCount = getLineCount();

  // Preview WhatsApp (Fase 5): corpo do template selecionado com {{n}} cruas +
  // header de mídia (URL padrão, quando válida — as URLs por linha vêm do CSV) + footer.
  const previewTplComps: WabaTemplateComponent[] = selectedTemplate?.components || [];
  const previewTplBody = previewTplComps.find((c) => c.type === "BODY")?.text || "";
  const previewTplFooter = previewTplComps.find((c) => c.type === "FOOTER")?.text || "";
  const previewTplHeader = previewTplComps.find((c) => c.type === "HEADER");
  const previewTplMediaType =
    previewTplHeader?.format && ["IMAGE", "VIDEO", "DOCUMENT"].includes(previewTplHeader.format)
      ? previewTplHeader.format.toLowerCase()
      : undefined;
  const previewTplHeaderUrl =
    defaultHeaderUrl.trim() && isValidHttpUrl(defaultHeaderUrl.trim())
      ? defaultHeaderUrl.trim()
      : undefined;

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

        {/* Connection + delay */}
        <div className="grid gap-2 md:grid-cols-3">
          <div className="space-y-2">
            <Label>{t("labelWhatsappId")}</Label>
            <Select
              value={selectedConnection ? String(selectedConnection.id) : ""}
              onValueChange={handleConnectionChange}
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

        {/* Template selector */}
        <div className="space-y-2">
          <Label>{t("labelTemplate")}</Label>
          {/* W3-B: para canais nao-WABA usa picker agnostico; para WABA o
              Select inline original e preservado (zero regressao). */}
          {selectedConnection && (selectedConnection.type === "dialog360" || selectedConnection.type === "gupshup") ? (
            <TemplatePickerByChannel
              whatsapp={selectedConnection}
              value={selectedTemplate?.id ?? ""}
              onChange={(tmpl) => {
                if (tmpl) handleTemplateSelection(String(tmpl.id));
              }}
              placeholderLoading={t("loadingTemplates")}
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
              onValueChange={handleTemplateSelection}
              disabled={!selectedConnection || loadingTemplates}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={loadingTemplates ? t("loadingTemplates") : t("chooseTemplate")} />
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

        {/* Template preview + variables info side by side */}
        {selectedTemplate && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("templatePreview")}</Label>
              <TemplatePreview template={selectedTemplate} t={t} />
            </div>

            {/* Variables info + system vars dropdown */}
            <div className="space-y-3">
              {templateVariables.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("templateVariables")}</Label>
                  <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {t("expectedFormat")}:
                    </p>
                    <p className="font-mono text-xs bg-background rounded p-1">
                      número,{templateVariables.join(",")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("example")}:
                    </p>
                    <p className="font-mono text-xs bg-background rounded p-1">
                      5511999999999,João,Produto A
                    </p>
                  </div>
                </div>
              )}

              {/* System vars reference — read-only popover (not column placeholders) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("systemVarsAvailable")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("systemVarsHint")}
                </p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs w-full justify-between"
                    >
                      <span className="flex items-center gap-1">
                        <Info className="h-3 w-3" /> {t("viewSystemVars")}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <div className="p-3 border-b">
                      <p className="text-xs font-medium">{t("systemVarsTooltipTitle")}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {t("systemVarsTooltipBody")}
                      </p>
                    </div>
                    <ul className="max-h-64 overflow-y-auto divide-y">
                      {getSystemVars(t).map((sv) => (
                        <li key={sv.value} className="px-3 py-1.5 text-xs flex items-center justify-between gap-2">
                          <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">{sv.value}</code>
                          <span className="text-muted-foreground text-right truncate">{sv.label}</span>
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        )}

        {/* Default header URL for media templates */}
        {selectedTemplate && (() => {
          const hdr = selectedTemplate.components?.find((c) => c.type === "HEADER");
          const hasMedia = hdr && ["IMAGE", "VIDEO", "DOCUMENT"].includes(hdr.format || "");
          if (!hasMedia) return null;
          return (
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("defaultHeaderUrl")}</Label>
              <p className="text-xs text-muted-foreground">{t("defaultHeaderUrlHint")}</p>
              <div className="flex gap-2">
                <Input
                  value={defaultHeaderUrl}
                  onChange={(e) => setDefaultHeaderUrl(e.target.value)}
                  placeholder={`URL ${hdr.format?.toLowerCase()}`}
                  className="flex-1 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title={t("pickFromGallery")}
                  onClick={() => setTplGalleryOpen(true)}
                >
                  <Images className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })()}

        {/* Cobrança — só existe em template ORDER_DETAILS. Template comum nunca
            renderiza este bloco e segue usando apenas as colunas do CSV. */}
        {isOrderDetailsSelected && selectedTemplate && (
          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-sm font-medium">{tOrder("sectionTitle")}</Label>
            <p className="text-xs text-muted-foreground">{tOrder("sectionHint")}</p>
            <OrderDetailsFields
              key={`${selectedTemplate.name}-${selectedTemplate.language}`}
              value={orderDetailsValue}
              onChange={setOrderDetailsValue}
              bulkWarning
            />
          </div>
        )}

        {/* Number + variable input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Label>
                {t("labelNumbersAndVars")}{" "}
                <span className="text-muted-foreground text-xs">
                  ({t("onePerLine")})
                </span>
              </Label>
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
                onChange={handleCsvUpload}
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
                mode="fullRows"
                onImport={({ text }) => {
                  setNumberInput(text);
                  toast.success(t("csvImported"));
                  setCsvImport(null);
                }}
              />
            </div>
          </div>

          {/* Instruction box — always visible, explains format + escape rules */}
          <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">{t("formatInstructionsTitle")}</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>{t("formatInstruction1")}</li>
                <li>
                  {t("formatInstruction2")}{" "}
                  <code className="rounded bg-blue-100 px-1 dark:bg-blue-900/40">
                    5511999999999,&quot;Olá, João&quot;,Produto A
                  </code>
                </li>
                <li>{t("formatInstruction3")}</li>
              </ul>
            </div>
          </div>

          <Textarea
            placeholder={"5511999999999,João,Produto A\n5521888888888,Maria,Produto B"}
            value={numberInput}
            onChange={(e) => setNumberInput(e.target.value)}
            rows={8}
            className="font-mono text-xs"
          />

          {/* Counts + invalid lines panel */}
          {numberInput.trim() && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {parsedBulk.valid.length} {t("validLines")}
                {parsedBulk.invalid.length > 0 && (
                  <span className="text-destructive ml-2">
                    — {parsedBulk.invalid.length} {t("invalidLines")}
                  </span>
                )}
                {ambiguousLines.length > 0 && (
                  <span className="text-amber-600 dark:text-amber-500 ml-2">
                    — {ambiguousLines.length} {tWarn("count")}
                  </span>
                )}
                {duplicateGroups.length > 0 && (
                  <span className="text-sky-600 dark:text-sky-500 ml-2">
                    — {duplicateGroups.reduce((acc, g) => acc + g.lines.length - 1, 0)} {tWarn("duplicatesCount")}
                  </span>
                )}
              </p>

              {parsedBulk.invalid.length > 0 && (
                <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium text-destructive">{t("invalidLinesTitle")}</p>
                    {parsedBulk.invalid.some(
                      (e) => e.reason === "wrong_var_count" && (e.got ?? 0) > (e.expected ?? 0),
                    ) && (
                      <p className="text-[11px] text-muted-foreground">{t("csvCommaWarning")}</p>
                    )}
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {parsedBulk.invalid.slice(0, 20).map((err) => (
                        <li key={err.lineNumber} className="font-mono text-[11px] break-all">
                          <span className="text-destructive">#{err.lineNumber}</span>{" "}
                          <span className="text-muted-foreground">
                            [{err.reason === "no_number"
                              ? t("errorNoNumber")
                              : err.reason === "wrong_var_count"
                                ? t("errorWrongVarCount", { expected: err.expected ?? 0, got: err.got ?? 0 })
                                : t("errorEmpty")}]
                          </span>{" "}
                          <span>{err.raw.slice(0, 80)}{err.raw.length > 80 ? "…" : ""}</span>
                        </li>
                      ))}
                      {parsedBulk.invalid.length > 20 && (
                        <li className="text-muted-foreground italic">
                          {t("invalidLinesMore", { count: parsedBulk.invalid.length - 20 })}
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {(headerUrlInvalidLines.length > 0 || defaultHeaderUrlInvalid) && (
                <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium text-destructive">{t("headerUrlInvalidTitle")}</p>
                    <p className="text-muted-foreground">{t("headerUrlInvalidHint")}</p>
                    {headerUrlInvalidLines.length > 0 && (
                      <ul className="space-y-1 max-h-40 overflow-y-auto">
                        {headerUrlInvalidLines.slice(0, 20).map((err) => (
                          <li key={err.lineNumber} className="font-mono text-[11px] break-all">
                            <span className="text-destructive">#{err.lineNumber}</span>{" "}
                            <span>{err.value.slice(0, 80) || "—"}</span>
                          </li>
                        ))}
                        {headerUrlInvalidLines.length > 20 && (
                          <li className="text-muted-foreground italic">
                            {t("invalidLinesMore", { count: headerUrlInvalidLines.length - 20 })}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {ambiguousLines.length > 0 && (
                <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium text-amber-700 dark:text-amber-500">{tWarn("title")}</p>
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
                    <p className="font-medium text-sky-700 dark:text-sky-500">{tWarn("duplicatesTitle")}</p>
                    <p className="text-muted-foreground">{tWarn("duplicatesHintMultiSend")}</p>
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
        </div>

        {/* Progress */}
        {sending && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                {isPaused ? (
                  <span className="text-yellow-600 font-medium">{t("dispatchPaused")} — </span>
                ) : null}
                {t("messagesSent")}: {sentCount} {t("of")} {lineCount}
                {failedCount > 0 && <span className="text-destructive ml-2">— {t("failedLabel")}: {failedCount}</span>}
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
            <Progress value={lineCount > 0 ? (sentCount / lineCount) * 100 : 0} />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            disabled={!selectedTemplate || sending || parsedBulk.invalid.length > 0 || parsedBulk.valid.length === 0}
            onClick={() => handleSend(false)}
          >
            {sending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {t("send")}
          </Button>
          <Button
            variant="secondary"
            disabled={!selectedTemplate || sending || parsedBulk.invalid.length > 0 || parsedBulk.valid.length === 0}
            onClick={() => handleSend(true)}
          >
            {t("sendMarketing")}
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
        {t("templatePreview")}
      </p>
      <WhatsAppPreview
        message={previewTplBody}
        mediaUrl={previewTplHeaderUrl}
        mediaType={previewTplMediaType}
        footer={previewTplFooter}
      />
    </div>
    </div>

    {/* Gallery picker for header media URL */}
    <GalleryPickerWithUploadDialog
      open={tplGalleryOpen}
      onOpenChange={setTplGalleryOpen}
      onPick={pickTplGalleryItem}
      {...wabaHeaderFormatToGalleryParams(
        selectedTemplate?.components?.find((c) => c.type === "HEADER")?.format
      )}
    />
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
