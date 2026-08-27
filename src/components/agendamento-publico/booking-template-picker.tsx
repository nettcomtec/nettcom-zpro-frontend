"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Images, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { InputWithVars } from "@/components/shared/variable-picker";
import { WabaTemplateMobilePreview } from "@/components/meta/waba-template-mobile-preview";
import {
  GalleryPickerWithUploadDialog,
  wabaHeaderFormatToGalleryParams,
} from "@/components/gallery/gallery-picker-with-upload-dialog";
import type { GalleryItem } from "@/services/gallery";
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import {
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
} from "@/lib/order-details";
import {
  type TemplateVarEntry,
  type TemplateBuilderTFunc,
  type OrderDetailsValue,
  extractTemplateVars,
  buildTemplateFriendlyComponents,
  buildTemplateFallbackMessage,
  buildTemplatePreviewComponents,
  isOrderDetailsTemplateLike,
  orderDetailsFromPayload,
} from "@/utils/template-builder";

// Picker de template HSM para a confirmação de booking em canais BSP
// (WABA/Gupshup/Dialog360). Espelha o farewell-template-manager: reusa os
// helpers compartilhados de @/utils/template-builder (extração de variáveis,
// components amigáveis, preview) e o mock estilo WhatsApp WabaTemplateMobilePreview
// — o mesmo usado em massa/template, configuracoes/meta e despedida.
//
// As VARIÁVEIS recebem expressões pupa ({{primeiroNome}}, {{data}}, {{hora}}...) —
// substituídas no envio (SendBookingTemplateService + substituteTemplateComponents).
// O JSON salvo mantém { templateName, language, components } que o backend já lê.

interface ChannelInfo { id: number; type: string; tokenAPI?: string }

interface Props {
  channel: ChannelInfo;
  value: string | null | undefined;
  onChange: (json: string | null) => void;
}

export function BookingTemplatePicker({ channel, value, onChange }: Props) {
  const t = useTranslations("bookingConfig");
  // Labels das variáveis reusam as chaves do builder do chatbot (já em todos os locales).
  const tNode = useTranslations("flowBuilderNodeForm");
  const tOrder = useTranslations("orderDetails");
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // Estado da seleção vive no `value` (JSON controlado pelo formulário do serviço).
  const parsed = useMemo(() => {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }, [value]);

  const selectedName: string = parsed?.templateName || "";
  const selectedLang: string = parsed?.language || "";
  const selectedKey = selectedName ? `${selectedName}|${selectedLang}` : "";
  const templateVars: TemplateVarEntry[] = Array.isArray(parsed?.templateVars) ? parsed.templateVars : [];
  const tplComponents: any[] = Array.isArray(parsed?.templateComponents) ? parsed.templateComponents : [];

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // getTemplatesForChannel resolve tokenAPI/id do canal e auto-cura pos-login
        // (sessao pode chegar sem tokenAPI logo apos o login). Cobre WABA e BSP.
        const { getTemplatesForChannel } = await import("@/services/channel-templates");
        const res: any = await getTemplatesForChannel({ id: channel.id, type: channel.type, tokenAPI: channel.tokenAPI });
        if (!alive) return;
        const list: any[] = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
        const sorted = [...list].sort((a, b) =>
          String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase()));
        setTemplates(sorted);
      } catch { if (alive) setTemplates([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, channel.type, channel.tokenAPI]);

  // Dedup por name|language (templates WABA repetem entre idiomas).
  const templateOptions = templates.filter(
    (tpl: any, idx: number, arr: any[]) =>
      arr.findIndex(
        (o: any) => o?.name === tpl?.name && String(o?.language || "") === String(tpl?.language || "")
      ) === idx
  );

  // ── Cobrança (ORDER_DETAILS) ──────────────────────────────────────────────
  // Confirmação de booking é disparo automático: a ficha só aparece quando o
  // template escolhido é de cobrança e viaja no MESMO JSON já salvo em
  // confirmationTemplate (coluna TEXT), sob a chave `orderDetails`. Template
  // comum continua emitindo exatamente as chaves de hoje.
  const isOrderDetails = isOrderDetailsTemplateLike(tplComponents);
  const orderKey = `${channel.id}|${selectedName}|${selectedLang}`;
  const [orderValue, setOrderValue] = useState<OrderDetailsValue>(
    () => orderDetailsFromPayload(parsed?.orderDetails) || emptyOrderDetails()
  );

  useEffect(() => {
    setOrderValue(orderDetailsFromPayload(parsed?.orderDetails) || emptyOrderDetails());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const orderError = useMemo(
    () => (isOrderDetails ? validateOrderDetails(orderValue) : null),
    [isOrderDetails, orderValue]
  );

  const emit = (
    name: string,
    language: string,
    components: any[],
    vars: TemplateVarEntry[],
    order: OrderDetailsValue | null = orderValue
  ) => {
    if (!name) { onChange(null); return; }
    const withOrder = !!order && isOrderDetailsTemplateLike(components);
    onChange(JSON.stringify({
      templateName: name,
      language: language || "pt_BR",
      templateComponents: components,
      templateVars: vars,
      components: buildTemplateFriendlyComponents(components, vars),
      message: buildTemplateFallbackMessage(components, vars),
      ...(withOrder ? { orderDetails: buildOrderDetailsPayload(order!) } : {}),
    }));
  };

  const updateOrder = (next: OrderDetailsValue) => {
    setOrderValue(next);
    emit(selectedName, selectedLang, tplComponents, templateVars, next);
  };

  const onSelectTemplate = (val: string) => {
    const sep = val.lastIndexOf("|");
    const name = val.slice(0, sep);
    const language = val.slice(sep + 1);
    const tpl = templateOptions.find(
      (tp: any) => tp?.name === name && String(tp?.language || "") === language
    );
    if (!tpl) return;
    const vars = extractTemplateVars(tpl.components || [], tNode as TemplateBuilderTFunc);
    // Ficha zerada a cada troca de template — cobrança nunca herda de outro template.
    setOrderValue(emptyOrderDetails());
    emit(tpl.name, tpl.language || "pt_BR", tpl.components || [], vars, null);
  };

  const updateVar = (key: string, v: string) => {
    const next = templateVars.map((x) => (x.key === key ? { ...x, value: v } : x));
    emit(selectedName, selectedLang, tplComponents, next);
  };

  const clear = () => onChange(null);

  // Header de mídia (IMAGE/VIDEO/DOCUMENT) → variável header_link selecionável via galeria.
  const headerComp = tplComponents.find((c: any) => c?.type === "HEADER");
  const headerMediaFormat: string | undefined =
    headerComp?.format && !["TEXT", "NONE"].includes(headerComp.format) ? headerComp.format : undefined;

  return (
    <div className="grid gap-2 rounded-md border p-3 bg-muted/30 min-w-0">
      <Label className="text-xs">{t("confirmationTemplateLabel")}</Label>
      <p className="text-[11px] text-muted-foreground">{t("confirmationTemplateHint")}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
          <Loader2 className="h-4 w-4 animate-spin" />{t("templateLoading")}
        </div>
      ) : templateOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-1">{t("noTemplates")}</p>
      ) : (
        <div className="flex items-center gap-2">
          <Select value={selectedKey} onValueChange={onSelectTemplate}>
            <SelectTrigger className="min-w-0"><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
            <SelectContent>
              {templateOptions.map((tpl: any) => (
                <SelectItem key={`${tpl.name}|${tpl.language || ""}`} value={`${tpl.name}|${tpl.language || ""}`}>
                  {tpl.name} ({tpl.language || "?"})
                  {tpl.status && tpl.status !== "APPROVED" ? ` · ${tpl.status}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedKey && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-destructive"
              onClick={clear}
              title={t("templateRemove")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {templateVars.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] text-muted-foreground">{t("templateVarsHint")}</p>
          {templateVars.map((v) =>
            v.key === "header_link" ? (
              <div key={v.key} className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">{v.label}</span>
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1 h-8"
                    value={v.value}
                    onChange={(e) => updateVar(v.key, e.target.value)}
                    placeholder={v.label}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-8 w-8"
                    onClick={() => setGalleryOpen(true)}
                  >
                    <Images className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div key={v.key} className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">{v.label}</span>
                <InputWithVars
                  value={v.value}
                  onChange={(val) => updateVar(v.key, val)}
                  placeholder={v.label}
                />
              </div>
            )
          )}
        </div>
      )}

      {isOrderDetails && (
        <div className="space-y-1.5 rounded-md border bg-background p-2 pt-1.5">
          <Label className="text-xs">{tOrder("sectionTitle")}</Label>
          <p className="text-[11px] text-muted-foreground">{tOrder("sectionHint")}</p>
          <OrderDetailsFields
            key={orderKey}
            value={orderValue}
            onChange={updateOrder}
            compact
          />
          {orderError && (
            <p className="text-[11px] text-destructive">{tOrder(orderError)}</p>
          )}
        </div>
      )}

      {selectedName && tplComponents.length > 0 && (
        <div className="space-y-1 pt-1">
          <span className="text-[11px] text-muted-foreground">{t("templatePreview")}</span>
          <WabaTemplateMobilePreview
            template={{
              components: buildTemplatePreviewComponents(tplComponents, templateVars),
              language: selectedLang,
            }}
          />
        </div>
      )}

      {headerMediaFormat && (
        <GalleryPickerWithUploadDialog
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          onPick={(item: GalleryItem) => {
            if (item?.url) updateVar("header_link", item.url);
            setGalleryOpen(false);
          }}
          {...wabaHeaderFormatToGalleryParams(headerMediaFormat)}
        />
      )}
    </div>
  );
}
