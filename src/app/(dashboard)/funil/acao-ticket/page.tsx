"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { isValidHttpUrl } from "@/lib/utils";
import {
  isOrderDetailsTemplate,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  type OrderDetailsValue,
} from "@/lib/order-details";
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/layout/empty-state";
import { Plus, Pencil, Trash2, Ticket, Loader2, Images, FileText, Video, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { GalleryPickerWithUploadDialog } from "@/components/gallery/gallery-picker-with-upload-dialog";
import type { GalleryItem } from "@/services/gallery";
import {
  fetchTicketActions,
  createTicketAction,
  updateTicketAction,
  deleteTicketAction,
  toggleTicketAction,
  type TicketAction,
} from "@/services/ticket-action";
import { fetchWhatsapps, type WABATemplate } from "@/services/whatsapp";
import { fetchTags } from "@/services/tags";
import { fetchAllUsers } from "@/services/users";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

type ActionTypeValue = "message" | "media" | "add_tag" | "add_wallet" | "flow" | "waba_template";

// Channels that support WhatsApp messaging
const WA_CHANNEL_TYPES = ["waba", "waba_oauth", "whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "wuzapi"];
// Channels that support WABA templates
// BSPs (gupshup, dialog360) também suportam templates — incluídos no select.
const WABA_ONLY_TYPES = ["waba", "waba_oauth", "gupshup", "dialog360"];
// Canais de sessao que entregam midia (MediaField) de forma confiavel fora de janela.
// WABA/BSP ficam de fora: midia so dentro de 24h (acoes disparam apos horas, normalmente >24h).
const MEDIA_CHANNEL_TYPES = ["whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi"];

interface WhatsappOption {
  id: number;
  name: string;
  type: string;
  tokenAPI?: string;
}

interface TemplateVarField {
  key: string;
  label: string;
}

/** Extract variable input fields from a WABA template */
function buildVariableFields(
  template: WABATemplate | null,
  varPrefix: string,
  urlBtnPrefix: string
): TemplateVarField[] {
  if (!template?.components) return [];
  const fields: TemplateVarField[] = [];
  for (const _comp of template.components) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = _comp as any;
    if (comp.type === "HEADER") {
      if (["VIDEO", "IMAGE", "DOCUMENT"].includes(comp.format || "")) {
        fields.push({ key: `header_${String(comp.format).toLowerCase()}`, label: `URL Header (${comp.format})` });
      } else if (comp.format === "TEXT") {
        const vars = (String(comp.text || "")).match(/{{\d+}}/g) || [];
        vars.forEach((v) => {
          const n = v.replace(/{{|}}/g, "");
          const k = `header_variable_${n}`;
          if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `Header {{${n}}}` });
        });
      }
    } else if (comp.type === "BODY") {
      const vars = (String(comp.text || "")).match(/{{\d+}}/g) || [];
      vars.forEach((v) => {
        const n = v.replace(/{{|}}/g, "");
        const k = `variable_${n}`;
        if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `${varPrefix} {{${n}}}` });
      });
    } else if (comp.type === "BUTTONS" && Array.isArray(comp.buttons)) {
      (comp.buttons as Array<{ type: string; url?: string }>).forEach((btn, i) => {
        if (btn.type === "URL" && (btn.url || "").includes("{{1}}")) {
          const k = `button_url_${i + 1}`;
          if (!fields.some((f) => f.key === k)) fields.push({ key: k, label: `${urlBtnPrefix} ${i + 1}` });
        }
      });
    }
  }
  return fields;
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

/** Build components array from variable values for save/backend */
function buildComponentsForSave(template: WABATemplate | null, vars: Record<string, string>): unknown[] {
  if (!template?.components) return [];
  const components: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comps = template.components as any[];

  const headerComp = comps.find((c) => c.type === "HEADER");
  if (headerComp) {
    if (["VIDEO", "IMAGE", "DOCUMENT"].includes(headerComp.format || "")) {
      const key = `header_${String(headerComp.format).toLowerCase()}`;
      if (vars[key]) components.push({ type: "HEADER", format: headerComp.format, value: vars[key] });
    } else if (headerComp.format === "TEXT") {
      const matches = (String(headerComp.text || "")).match(/{{\d+}}/g) || [];
      if (matches.length > 0) {
        const variables = matches.map((v) => vars[`header_variable_${v.replace(/{{|}}/g, "")}`] || "");
        // `text` junto dos valores: os senders leem só `variables`/`value` e ignoram
        // este campo, mas é dele que a bolha do disparo monta o header real.
        components.push({ type: "HEADER", format: "TEXT", text: headerComp.text, variables });
      } else if (headerComp.text) {
        components.push({ type: "HEADER", format: "TEXT", text: headerComp.text });
      }
    }
  }

  const bodyComp = comps.find((c) => c.type === "BODY");
  if (bodyComp) {
    const matches = (String(bodyComp.text || "")).match(/{{\d+}}/g) || [];
    if (matches.length > 0) {
      const variables = matches.map((v) => vars[`variable_${v.replace(/{{|}}/g, "")}`] || "");
      // Idem: sem o `text` a bolha mostraria o NOME do template no lugar do corpo.
      components.push({ type: "BODY", text: bodyComp.text, variables });
    } else if (bodyComp.text) {
      // Template sem variáveis: componente só para a bolha (o sender pula BODY sem
      // `parameters`/`variables`).
      components.push({ type: "BODY", text: bodyComp.text });
    }
  }

  const footerComp = comps.find((c) => c.type === "FOOTER");
  // Tipo que os senders não conhecem e ignoram no loop — só a bolha usa.
  if (footerComp?.text) components.push({ type: "FOOTER", text: footerComp.text });

  const btnComp = comps.find((c) => c.type === "BUTTONS");
  if (btnComp?.buttons?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasUrlVar = (btnComp.buttons as any[]).some((b: any, i: number) =>
      b.type === "URL" && (b.url || "").includes("{{1}}") && vars[`button_url_${i + 1}`]
    );
    if (hasUrlVar) {
      components.push({
        type: "BUTTONS",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        buttons: (btnComp.buttons as any[]).map((btn: any, i: number) => {
          const subType = btn.type === "URL" ? "url" : btn.type === "COPY_CODE" ? "copy_code" : "quick_reply";
          if (btn.type === "URL" && vars[`button_url_${i + 1}`]) {
            return { type: btn.type, sub_type: subType, index: i, parameters: [{ type: "text", text: vars[`button_url_${i + 1}`] }] };
          }
          return { type: btn.type, sub_type: subType, index: i, parameters: [{ type: "text", text: btn.text || "" }] };
        }),
      });
    }
  }

  return components;
}

export default function FunilAcaoTicketPage() {
  // Gate isolado num wrapper: sair com `return` no meio dos hooks do conteúdo
  // quebrava o React ("Rendered fewer hooks than expected") quando a permissão
  // caía com a página montada — o teto do tenant chega após o 1º render.
  const allowed = usePageAccess("funil", { alsoAccept: ["kanban"] });
  if (!allowed) return <AccessDenied />;
  return <FunilAcaoTicketPageContent />;
}

function FunilAcaoTicketPageContent() {
  const t = useTranslations("funilAcaoTicketPage");
  const tErrors = useTranslations("errors");
  const tOrder = useTranslations("orderDetails");

  const ACTION_TYPES: { value: ActionTypeValue; label: string }[] = [
    { value: "message",       label: t("actionTypeMessage") },
    { value: "media",         label: t("actionTypeMedia") },
    { value: "waba_template", label: t("actionTypeWabaTemplate") },
    { value: "add_tag",       label: t("actionTypeAddTag") },
    { value: "add_wallet",    label: t("actionTypeAddWallet") },
    { value: "flow",          label: t("actionTypeFlow") },
  ];

  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<TicketAction[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TicketAction | null>(null);
  const [deleting, setDeleting] = useState<TicketAction | null>(null);
  const [whatsapps, setWhatsapps] = useState<WhatsappOption[]>([]);
  const [tags, setTags] = useState<{ id: number; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [templates, setTemplates] = useState<WABATemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WABATemplate | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    hoursWithoutResponse: 0,
    actionType: "message" as ActionTypeValue,
    actionContent: "",
    tagId: undefined as number | undefined,
    walletId: undefined as number | undefined,
    whatsappId: undefined as number | undefined,
    active: true,
    startedAt: "",
    templateVars: {} as Record<string, string>,
    // Ficha de cobranca (template ORDER_DETAILS). Paralela a templateVars: o botao
    // de cobranca nao gera variavel de template.
    orderDetails: emptyOrderDetails(),
    mediaUrl: "",
    mediaCaption: "",
    mediaType: "",
    mediaPtt: true,
  });

  // Channels filtered by type
  const waWhatsapps = whatsapps.filter(w => WA_CHANNEL_TYPES.includes(w.type));
  const wabaWhatsapps = whatsapps.filter(w => WABA_ONLY_TYPES.includes(w.type));
  const mediaWhatsapps = whatsapps.filter(w => MEDIA_CHANNEL_TYPES.includes(w.type));

  const isAudioMedia = (type: string, url: string) => {
    const fileName = (url.split("/").pop() || url).split("?")[0];
    return type.startsWith("audio/") || /\.(mp3|ogg|oga|opus|m4a|aac|wav|amr)$/i.test(fileName);
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

  const onMediaPick = (item: GalleryItem) => {
    setForm((f) => ({ ...f, mediaUrl: item.url, mediaType: item.type }));
  };

  // Variable fields derived from the selected template
  const varFields = buildVariableFields(selectedTemplate, t("templateVarPrefix"), t("urlButtonPrefix"));

  // Template de cobranca (ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md F6.
  // A acao e agendada: a ficha vai gravada em `orderDetails` dentro do actionContent
  // e o ExecuteTicketActionsJob monta, valida e injeta o componente no BUTTONS no
  // momento do disparo — com uma referencia por ticket. Template comum nao passa por
  // nada disto (D0).
  const isOrderDetailsSelected = React.useMemo(
    () => isOrderDetailsTemplate(selectedTemplate as { components?: any[] } | null),
    [selectedTemplate]
  );

  // Load WABA templates when a WABA channel is selected
  useEffect(() => {
    if (form.actionType !== "waba_template" || !form.whatsappId) {
      setTemplates([]);
      setSelectedTemplate(null);
      return;
    }
    const w = wabaWhatsapps.find(x => x.id === form.whatsappId);
    if (!w) {
      setTemplates([]);
      setSelectedTemplate(null);
      return;
    }
    setLoadingTemplates(true);
    setTemplates([]);
    setSelectedTemplate(null);
    const currentTplKey = form.actionContent;
    // getTemplatesForChannel resolve tokenAPI/id do canal e auto-cura pos-login
    // (sessao pode chegar sem tokenAPI logo apos o login). Cobre WABA e BSP.
    const fetchPromise = import("@/services/channel-templates").then(
      ({ getTemplatesForChannel }) =>
        getTemplatesForChannel({ id: w.id, type: w.type, tokenAPI: w.tokenAPI }),
    );
    fetchPromise
      .then((list: any) => {
        setTemplates([...list].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
        // Restore selected template when editing
        if (currentTplKey) {
          let found: WABATemplate | null = null;
          if (currentTplKey.includes("|")) {
            const [name, lang] = currentTplKey.split("|");
            found = list.find((tpl: any) => tpl.name === name && tpl.language === lang) ?? null;
          } else {
            // Legacy: plain name
            found = list.find((tpl: any) => tpl.name === currentTplKey) ?? null;
            if (found) {
              // Upgrade to composite key so Select shows the value
              setForm((f) => ({ ...f, actionContent: `${found!.name}|${found!.language}` }));
            }
          }
          if (found) setSelectedTemplate(found);
        }
      })
      .catch(() => { toast.error(tErrors("loadFailed")); })
      .finally(() => setLoadingTemplates(false));
  }, [form.actionType, form.whatsappId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchTicketActions({ limit: 200 });
      setActions(data);
    } catch {
      toast.error(t("errorLoadActions"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const [wRes, tRes, uRes] = await Promise.all([
        fetchWhatsapps(),
        fetchTags(),
        fetchAllUsers(),
      ]);
      const wData = Array.isArray((wRes as any)?.data) ? (wRes as any).data : ((wRes as any)?.data?.data ?? []);
      setWhatsapps(
        Array.isArray(wData)
          ? wData.map((x: { id: number; name?: string; type?: string; tokenAPI?: string }) => ({
              id: x.id,
              name: x.name ?? String(x.id),
              type: x.type ?? "",
              tokenAPI: x.tokenAPI,
            }))
          : []
      );
      const tData = tRes.data ?? [];
      setTags(Array.isArray(tData) ? tData.map((x: { id: number; name?: string; tag?: string }) => ({ id: x.id, name: (x.name ?? x.tag) ?? String(x.id) })) : []);
      const arr = uRes.data?.users ?? [];
      setUsers(arr.filter((u: { profile?: string }) => u.profile !== "superadmin").map((u: { id: number; name: string }) => ({ id: u.id, name: u.name })));
    } catch {
      // opcional
    }
  }, []);

  useEffect(() => {
    loadData();
    loadOptions();
  }, [loadData, loadOptions]);

  const openCreate = () => {
    setEditing(null);
    setTemplates([]);
    setSelectedTemplate(null);
    setForm({
      name: "",
      description: "",
      hoursWithoutResponse: 24,
      actionType: "message",
      actionContent: "",
      tagId: undefined,
      walletId: undefined,
      whatsappId: undefined,
      active: true,
      startedAt: "",
      templateVars: {},
      orderDetails: emptyOrderDetails(),
      mediaUrl: "",
      mediaCaption: "",
      mediaType: "",
      mediaPtt: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (a: TicketAction) => {
    setEditing(a);
    setTemplates([]);
    setSelectedTemplate(null);

    // Parse actionContent for waba_template (may be JSON with { templateName, language, vars, components })
    let actionContent = a.actionContent ?? "";
    let templateVars: Record<string, string> = {};
    // Cobranca gravada volta para o formulario; acao sem cobranca fica com a ficha vazia.
    let orderDetails: OrderDetailsValue = emptyOrderDetails();
    // Acao de midia guarda { mediaUrl, caption, mediaType, ptt } como JSON em actionContent.
    let mUrl = "", mCaption = "", mType = "";
    let mPtt = true;
    if (a.actionType === "media" && a.actionContent) {
      try { const p = JSON.parse(a.actionContent); mUrl = p.mediaUrl ?? ""; mCaption = p.caption ?? ""; mType = p.mediaType ?? ""; mPtt = p.ptt !== false; } catch { /* ignore */ }
    }
    if (a.actionType === "waba_template" && a.actionContent) {
      try {
        const parsed = JSON.parse(a.actionContent);
        if (parsed.templateName) {
          // Restore as composite "name|language" so Select displays correctly
          actionContent = parsed.language
            ? `${parsed.templateName}|${parsed.language}`
            : parsed.templateName;
          templateVars = parsed.vars || {};
          if (parsed.orderDetails) orderDetails = orderDetailsFromSaved(parsed.orderDetails);
        }
      } catch {
        // actionContent is plain template name (legacy)
      }
    }

    setForm({
      name: a.name ?? "",
      description: a.description ?? "",
      hoursWithoutResponse: a.hoursWithoutResponse ?? 24,
      actionType: (a.actionType as ActionTypeValue) ?? "message",
      actionContent,
      tagId: a.tagId,
      walletId: a.walletId,
      whatsappId: a.whatsappId,
      active: a.active ?? true,
      startedAt: a.startedAt ? new Date(a.startedAt).toISOString().slice(0, 16) : "",
      templateVars,
      orderDetails,
      mediaUrl: mUrl,
      mediaCaption: mCaption,
      mediaType: mType,
      mediaPtt: mPtt,
    });
    setDialogOpen(true);
  };

  const openDelete = (a: TicketAction) => {
    setDeleting(a);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error(t("validationNameRequired"));
      return;
    }
    if (form.hoursWithoutResponse < 0) {
      toast.error(t("validationHoursMin"));
      return;
    }
    if (form.actionType === "message" && (!form.actionContent?.trim() || !form.whatsappId)) {
      toast.error(t("validationMessageAndWhatsapp"));
      return;
    }
    if (form.actionType === "media" && (!form.mediaUrl?.trim() || !form.whatsappId)) {
      toast.error(t("validationMediaAndWhatsapp"));
      return;
    }
    if (form.actionType === "waba_template" && (!form.whatsappId || !form.actionContent?.trim())) {
      toast.error(t("validationWabaRequired"));
      return;
    }
    if (form.actionType === "waba_template") {
      // Header de mídia exige URL http(s) — texto comum vira image.link e a Meta
      // rejeita (#100) no disparo. Placeholder {{...}} é aceito (pupa em runtime).
      const tplHeader = (selectedTemplate?.components as { type?: string; format?: string }[] | undefined)?.find((c) => c.type === "HEADER");
      if (tplHeader && ["VIDEO", "IMAGE", "DOCUMENT"].includes(tplHeader.format || "")) {
        const urlVal = (form.templateVars[`header_${String(tplHeader.format).toLowerCase()}`] || "").trim();
        if (!isValidHttpUrl(urlVal) && !/\{\{.+\}\}/.test(urlVal)) {
          toast.error(tErrors("invalidMediaHeaderUrl"));
          return;
        }
      }
      // Cobranca invalida barrada aqui: o disparo e assincrono e um erro no job so
      // apareceria depois, no log da acao.
      if (isOrderDetailsSelected) {
        const orderError = validateOrderDetails(form.orderDetails);
        if (orderError) {
          toast.warning(tOrder(orderError));
          return;
        }
      }
    }
    if (form.actionType === "add_tag" && !form.tagId) {
      toast.error(t("validationTagRequired"));
      return;
    }
    if (form.actionType === "add_wallet" && !form.walletId) {
      toast.error(t("validationWalletRequired"));
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description?.trim() ?? "",
        hoursWithoutResponse: form.hoursWithoutResponse,
        actionType: form.actionType,
        active: form.active,
      };

      if (form.actionType === "message") {
        payload.actionContent = form.actionContent?.trim() ?? "";
        payload.whatsappId = form.whatsappId;
      } else if (form.actionType === "media") {
        payload.actionContent = JSON.stringify({ mediaUrl: form.mediaUrl.trim(), caption: form.mediaCaption.trim(), mediaType: form.mediaType, ptt: form.mediaPtt });
        payload.whatsappId = form.whatsappId;
      } else if (form.actionType === "waba_template") {
        const components = buildComponentsForSave(selectedTemplate, form.templateVars);
        // actionContent is stored as "name|language" composite; extract plain name for save
        const rawKey = form.actionContent.trim();
        const templateName = rawKey.includes("|") ? rawKey.split("|")[0] : rawKey;
        payload.actionContent = JSON.stringify({
          templateName,
          language: selectedTemplate?.language || "pt_BR",
          vars: form.templateVars,
          components,
          // Cobranca: campo extra so em template ORDER_DETAILS. O job monta e valida
          // no disparo; sem ele o actionContent fica identico ao de sempre.
          ...(isOrderDetailsSelected ? { orderDetails: buildOrderDetailsPayload(form.orderDetails) } : {}),
        });
        payload.whatsappId = form.whatsappId;
      } else if (form.actionType === "add_tag") {
        payload.actionContent = "";
        payload.tagId = form.tagId;
      } else if (form.actionType === "add_wallet") {
        payload.actionContent = "";
        payload.walletId = form.walletId;
      } else {
        payload.actionContent = form.actionContent?.trim() ?? "";
      }

      if (form.startedAt) {
        payload.startedAt = new Date(form.startedAt).toISOString();
      }

      if (editing) {
        await updateTicketAction(editing.id, payload);
        toast.success(t("actionUpdated"));
      } else {
        await createTicketAction(payload);
        toast.success(t("actionCreated"));
      }
      setDialogOpen(false);
      loadData();
    } catch {
      toast.error(editing ? t("errorUpdate") : t("errorCreate"));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTicketAction(deleting.id);
      toast.success(t("actionDeleted"));
      setDeleteDialogOpen(false);
      setDeleting(null);
      loadData();
    } catch {
      toast.error(t("errorDelete"));
    }
  };

  const handleToggle = async (a: TicketAction) => {
    try {
      await toggleTicketAction(a.id);
      toast.success(a.active ? t("actionDeactivated") : t("actionActivated"));
      loadData();
    } catch {
      toast.error(t("errorToggle"));
    }
  };

  const actionTypeLabel = (val: string) => ACTION_TYPES.find((x) => x.value === val)?.label ?? val;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("pageTitle")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      >
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t("newAction")}
        </Button>
      </PageHeader>

      {actions.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Ticket}
              title={t("noActions")}
              description={t("noActionsDesc")}
            >
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                {t("createActionTitle")}
              </Button>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colHours")}</TableHead>
                  <TableHead>{t("colType")}</TableHead>
                  <TableHead>{t("colActive")}</TableHead>
                  <TableHead className="w-[120px]">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((a) => {
                  // Referências que envelheceram (canal/etiqueta/carteira excluídos
                  // após configurar) — listas vivas já carregadas pela página;
                  // cobre também sub-ações de fluxos (actionContent JSON).
                  const broken: string[] = [];
                  const chkChannel = (id?: number | null) => { if (id && !whatsapps.some((w) => w.id === Number(id))) broken.push(t("brokenChannel", { id: Number(id) })); };
                  const chkTag = (id?: number | null) => { if (id && !tags.some((x) => x.id === Number(id))) broken.push(t("brokenTag", { id: Number(id) })); };
                  const chkWallet = (id?: number | null) => { if (id && !users.some((u) => u.id === Number(id))) broken.push(t("brokenWallet", { id: Number(id) })); };
                  chkChannel(a.whatsappId); chkTag(a.tagId); chkWallet(a.walletId);
                  if (a.actionType === "flow" && a.actionContent) {
                    try {
                      const flow = JSON.parse(a.actionContent) as { actions?: { whatsappId?: number | null; tagId?: number | null; walletId?: number | null }[] };
                      (flow.actions || []).forEach((sub) => { chkChannel(sub.whatsappId); chkTag(sub.tagId); chkWallet(sub.walletId); });
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
                    <TableCell>{a.hoursWithoutResponse}h</TableCell>
                    <TableCell>{actionTypeLabel(a.actionType)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={a.active}
                        onCheckedChange={() => handleToggle(a)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => openDelete(a)}
                        >
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? t("editAction") : t("newActionTitle")}</DialogTitle>
            <DialogDescription>
              {t("dialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto flex-1 pr-1">
            <div className="grid gap-2">
              <Label htmlFor="name">{t("nameLabel")}</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hours">{t("hoursLabel")}</Label>
              <Input
                id="hours"
                type="number"
                min={0}
                value={form.hoursWithoutResponse}
                onChange={(e) => setForm((f) => ({ ...f, hoursWithoutResponse: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("typeLabel")}</Label>
              <Select
                value={form.actionType}
                onValueChange={(v) => {
                  setSelectedTemplate(null);
                  setTemplates([]);
                  setForm((f) => ({ ...f, actionType: v as ActionTypeValue, actionContent: "", whatsappId: undefined, templateVars: {}, orderDetails: emptyOrderDetails() }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((at) => (
                    <SelectItem key={at.value} value={at.value}>
                      {at.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* message: text + WA channel (all WA types) */}
            {form.actionType === "message" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="content">{t("messageLabel")}</Label>
                  <Textarea
                    id="content"
                    value={form.actionContent}
                    onChange={(e) => setForm((f) => ({ ...f, actionContent: e.target.value }))}
                    placeholder={t("messagePlaceholder")}
                    rows={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("whatsappLabel")}</Label>
                  <Select
                    value={String(form.whatsappId ?? "")}
                    onValueChange={(v) => setForm((f) => ({ ...f, whatsappId: v ? Number(v) : undefined }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {waWhatsapps.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* media: gallery/upload + caption + WA channel + ptt toggle */}
            {form.actionType === "media" && (
              <>
                <div className="grid gap-2">
                  <Label>{t("mediaLabel")}</Label>
                  {mediaPreview(form.mediaUrl, form.mediaType)}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setMediaPickerOpen(true)}>
                      <Images className="mr-2 h-4 w-4" />{form.mediaUrl ? t("mediaChange") : t("mediaPickBtn")}
                    </Button>
                    {form.mediaUrl && (
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setForm((f) => ({ ...f, mediaUrl: "", mediaType: "" }))}>
                        {t("mediaRemove")}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>{t("captionLabel")}</Label>
                  <Textarea
                    value={form.mediaCaption}
                    onChange={(e) => setForm((f) => ({ ...f, mediaCaption: e.target.value }))}
                    placeholder={t("captionPlaceholder")}
                    rows={2}
                  />
                </div>
                {isAudioMedia(form.mediaType, form.mediaUrl) && (
                  <div className="flex items-center gap-2">
                    <Switch id="ta-media-ptt" checked={form.mediaPtt} onCheckedChange={(v) => setForm((f) => ({ ...f, mediaPtt: v }))} />
                    <Label htmlFor="ta-media-ptt">{t("labelSendAsVoice")}</Label>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>{t("whatsappLabel")}</Label>
                  <Select
                    value={String(form.whatsappId ?? "")}
                    onValueChange={(v) => setForm((f) => ({ ...f, whatsappId: v ? Number(v) : undefined }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {mediaWhatsapps.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">{t("mediaWindowNote")}</p>
              </>
            )}

            {/* waba_template: WABA channel + template picker + variable fields */}
            {form.actionType === "waba_template" && (
              <>
                <div className="grid gap-2">
                  <Label>{t("wabaChannelLabel")}</Label>
                  <Select
                    value={String(form.whatsappId ?? "")}
                    onValueChange={(v) => {
                      setSelectedTemplate(null);
                      setForm((f) => ({ ...f, whatsappId: v ? Number(v) : undefined, actionContent: "", templateVars: {}, orderDetails: emptyOrderDetails() }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {wabaWhatsapps.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.whatsappId && (
                  <div className="grid gap-2">
                    <Label>{t("templateLabel")}</Label>
                    {loadingTemplates ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("loadingTemplates")}
                      </div>
                    ) : templates.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">{t("noTemplates")}</p>
                    ) : (
                      <Select
                        value={form.actionContent}
                        onValueChange={(v) => {
                          // value format: "templateName|language"
                          const [tplName, tplLang] = v.split("|");
                          const found = templates.find((tpl) => tpl.name === tplName && tpl.language === tplLang) ?? null;
                          setSelectedTemplate(found);
                          // Ficha zerada ao trocar de template (cobranca de um template nao vale para outro).
                          setForm((f) => ({ ...f, actionContent: v, templateVars: {}, orderDetails: emptyOrderDetails() }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((tpl) => (
                            <SelectItem key={`${tpl.name}|${tpl.language}`} value={`${tpl.name}|${tpl.language}`}>
                              {tpl.name} ({tpl.language})
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
                      value={form.orderDetails}
                      onChange={(value) => setForm((f) => ({ ...f, orderDetails: value }))}
                      compact
                      bulkWarning
                    />
                  </div>
                )}

                {/* Variable fields for selected template */}
                {varFields.length > 0 && (
                  <div className="grid gap-3 rounded-md border p-3 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("templateVarsSection")}
                    </p>
                    {varFields.map((field) => (
                      <div key={field.key} className="grid gap-1">
                        <Label className="text-xs">{field.label}</Label>
                        <Input
                          value={form.templateVars[field.key] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              templateVars: { ...f.templateVars, [field.key]: e.target.value },
                            }))
                          }
                          placeholder={field.label}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {form.actionType === "add_tag" && (
              <div className="grid gap-2">
                <Label>{t("tagLabel")}</Label>
                <Select
                  value={String(form.tagId ?? "")}
                  onValueChange={(v) => setForm((f) => ({ ...f, tagId: v ? Number(v) : undefined }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {tags.map((tag) => (
                      <SelectItem key={tag.id} value={String(tag.id)}>
                        {tag.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.actionType === "add_wallet" && (
              <div className="grid gap-2">
                <Label>{t("walletLabel")}</Label>
                <Select
                  value={String(form.walletId ?? "")}
                  onValueChange={(v) => setForm((f) => ({ ...f, walletId: v ? Number(v) : undefined }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.actionType === "flow" && (
              <div className="grid gap-2">
                <Label htmlFor="flow-content">{t("flowContentLabel")}</Label>
                <Input
                  id="flow-content"
                  value={form.actionContent}
                  onChange={(e) => setForm((f) => ({ ...f, actionContent: e.target.value }))}
                  placeholder={t("flowContentPlaceholder")}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="startedAt">{t("startDateLabel")}</Label>
              <Input
                id="startedAt"
                type="datetime-local"
                value={form.startedAt}
                onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {t("startDateHint")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
              <Label>{t("colActive")}</Label>
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSubmit}>{editing ? t("save") : t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteAction")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm")} &quot;{deleting?.name}&quot;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media picker (galeria + upload) */}
      <GalleryPickerWithUploadDialog
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onPick={onMediaPick}
      />
    </div>
  );
}
