"use client";

// Configuração do template HSM de despedida (farewell) para canais BSP
// (waba / dialog360 / gupshup). Espelha a seleção de template do builder do
// chatbot (flow-builder/node-form TemplateInteractionFields): lista por
// name|language (templates WABA não têm id estável), extrai variáveis e monta
// os components amigáveis via @/utils/template-builder. O resultado é salvo em
// whatsapp.farewellTemplate e enviado pelo backend (SendFarewellTemplateZPRO)
// reusando o caminho TemplateField de cada canal — funciona fora da janela 24h.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Images, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InputWithVars } from "@/components/shared/variable-picker";
import { WabaTemplateMobilePreview } from "@/components/meta/waba-template-mobile-preview";
import {
  GalleryPickerWithUploadDialog,
  wabaHeaderFormatToGalleryParams,
} from "@/components/gallery/gallery-picker-with-upload-dialog";
import type { GalleryItem } from "@/services/gallery";
import { getTemplatesForChannel } from "@/services/channel-templates";
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

export type FarewellTemplateValue = {
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
  templateVars?: TemplateVarEntry[];
  components?: unknown[];
  message?: string;
  /** Ficha de cobrança (payload amigável) — só existe em template ORDER_DETAILS. */
  orderDetails?: unknown;
} | null;

type ChannelInput =
  | {
      id?: number | string;
      type?: string;
      tokenAPI?: string;
      appId?: string;
    }
  | null
  | undefined;

type Props = {
  whatsapp: ChannelInput;
  value: FarewellTemplateValue;
  onChange: (next: FarewellTemplateValue) => void;
};

// Canais BSP que suportam template HSM na despedida (espelha SendFarewellTemplateZPRO).
export const FAREWELL_TEMPLATE_TYPES = ["waba", "dialog360", "gupshup"];

export function FarewellTemplateManager({ whatsapp, value, onChange }: Props) {
  const t = useTranslations("sessoesPage");
  // Labels das variáveis reusam as chaves do builder do chatbot (já em todos os locales).
  const tNode = useTranslations("flowBuilderNodeForm");
  const tOrder = useTranslations("orderDetails");
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const channelId = whatsapp?.id;
  const channelType = whatsapp?.type;
  const tokenAPI = whatsapp?.tokenAPI;
  const appId = whatsapp?.appId;

  useEffect(() => {
    if (!whatsapp) {
      setTemplates([]);
      return;
    }
    const type = channelType;
    const hasIdentifier =
      (type === "dialog360" && channelId !== undefined && channelId !== null) ||
      (type === "gupshup" && (channelId !== undefined || !!appId)) ||
      (type === "waba" ? !!tokenAPI : false);
    if (!hasIdentifier) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getTemplatesForChannel(whatsapp as any)
      .then((res: any) => {
        if (cancelled) return;
        let list: any[] = [];
        if (Array.isArray(res)) list = res;
        else if (res && typeof res === "object" && Array.isArray(res.data)) list = res.data;
        setTemplates(list);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, channelType, tokenAPI, appId]);

  // Dedup por name|language (templates WABA repetem entre idiomas).
  const templateOptions = templates.filter(
    (tpl: any, idx: number, arr: any[]) =>
      arr.findIndex(
        (o: any) => o?.name === tpl?.name && String(o?.language || "") === String(tpl?.language || "")
      ) === idx
  );

  const selectedKey = value?.templateName
    ? `${value.templateName}|${value.templateLanguage || ""}`
    : "";
  const templateVars: TemplateVarEntry[] = Array.isArray(value?.templateVars)
    ? (value!.templateVars as TemplateVarEntry[])
    : [];
  const tplComponents: any[] = Array.isArray(value?.templateComponents)
    ? (value!.templateComponents as any[])
    : [];

  // Header de mídia (IMAGE/VIDEO/DOCUMENT) → variável header_link selecionável via galeria.
  const headerComp = tplComponents.find((c: any) => c?.type === "HEADER");
  const headerMediaFormat: string | undefined =
    headerComp?.format && !["TEXT", "NONE"].includes(headerComp.format)
      ? headerComp.format
      : undefined;

  // ── Cobrança (ORDER_DETAILS) ──────────────────────────────────────────────
  // A despedida é disparo AUTOMÁTICO no fechamento do ticket: a ficha só aparece
  // quando o template escolhido é de cobrança (D2 — nunca por herança acidental
  // de template comum) e vai persistida em farewellTemplate.orderDetails (JSONB,
  // sem coluna nova). O aviso de baixa manual mora dentro do OrderDetailsFields.
  const isOrderDetails = isOrderDetailsTemplateLike(tplComponents);
  // Identidade da seleção: troca de canal ou de template re-hidrata a ficha (e
  // remonta o formulário, cujos campos de valor são não-controlados).
  const orderKey = `${channelId ?? ""}|${value?.templateName || ""}|${value?.templateLanguage || ""}`;
  const [orderValue, setOrderValue] = useState<OrderDetailsValue>(
    () => orderDetailsFromPayload(value?.orderDetails) || emptyOrderDetails()
  );

  useEffect(() => {
    setOrderValue(orderDetailsFromPayload(value?.orderDetails) || emptyOrderDetails());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const orderError = useMemo(
    () => (isOrderDetails ? validateOrderDetails(orderValue) : null),
    [isOrderDetails, orderValue]
  );

  const updateOrder = (next: OrderDetailsValue) => {
    setOrderValue(next);
    onChange({ ...(value || {}), orderDetails: buildOrderDetailsPayload(next) });
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
    setOrderValue(emptyOrderDetails());
    onChange({
      templateName: tpl.name,
      templateLanguage: tpl.language || "pt_BR",
      templateComponents: tpl.components || [],
      templateVars: vars,
      components: buildTemplateFriendlyComponents(tpl.components || [], vars),
      message: buildTemplateFallbackMessage(tpl.components || [], vars),
    });
  };

  const updateVar = (key: string, v: string) => {
    const next = templateVars.map((x) => (x.key === key ? { ...x, value: v } : x));
    onChange({
      ...(value || {}),
      templateVars: next,
      components: buildTemplateFriendlyComponents(tplComponents, next),
      message: buildTemplateFallbackMessage(tplComponents, next),
    });
  };

  const clear = () => onChange(null);

  return (
    <div className="min-w-0 space-y-2">
      <div className="text-sm font-medium">{t("farewellTemplateTitle")}</div>
      <p className="text-xs text-muted-foreground">{t("farewellTemplateHint")}</p>

      {loading ? (
        <p className="text-xs text-muted-foreground">{t("farewellTemplateLoading")}</p>
      ) : templateOptions.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("farewellTemplateNoTemplates")}</p>
      ) : (
        <div className="flex items-center gap-2">
          <Select value={selectedKey} onValueChange={onSelectTemplate}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={t("farewellTemplateSelectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {templateOptions.map((tpl: any) => (
                <SelectItem
                  key={`${tpl.name}|${tpl.language || ""}`}
                  value={`${tpl.name}|${tpl.language || ""}`}
                >
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
              title={t("farewellTemplateRemove")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {templateVars.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">{t("farewellTemplateVarsLabel")}</Label>
          {templateVars.map((v) =>
            v.key === "header_link" ? (
              <div key={v.key} className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">{v.label}</span>
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    value={v.value}
                    onChange={(e) => updateVar(v.key, e.target.value)}
                    placeholder={v.label}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    title={t("farewellMediaAdd")}
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
        <div className="space-y-1.5 rounded-md border p-2 pt-1.5">
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

      {value?.templateName && tplComponents.length > 0 && (
        <div className="space-y-1 pt-1">
          <span className="text-[11px] text-muted-foreground">{t("farewellTemplatePreview")}</span>
          <WabaTemplateMobilePreview
            template={{
              components: buildTemplatePreviewComponents(tplComponents, templateVars),
              language: value.templateLanguage,
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

export default FarewellTemplateManager;
