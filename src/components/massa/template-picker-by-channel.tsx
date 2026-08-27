"use client";

// Sub-componente "agnostico" que decide qual lista de templates carregar
// conforme o tipo do canal (whatsapp.type) e renderiza um Select uniforme.
//
// - waba       -> fetchWabaTemplates (services/bulk.ts) ou getWabaTemplates
// - dialog360  -> getTemplatesForChannel({ type: "dialog360", id })
// - gupshup    -> getTemplatesForChannel({ type: "gupshup", id, appId })
//
// O caller passa `whatsapp` (objeto Whatsapp ou subset minimo) + `value` +
// `onChange` (recebe o objeto template selecionado) + `placeholderLoading` /
// `placeholderEmpty` opcionais.
//
// O componente NUNCA toca a UI das paginas existentes (massa/template,
// massa/template-variavel, header). Quando o canal e waba o caller pode
// continuar usando `fetchWabaTemplates` direto — este picker e um
// _add-on opcional_ para os ramos Dialog360/Gupshup que nao tinham UI
// dedicada.

import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getTemplatesForChannel,
  type ChannelTemplatesInput,
} from "@/services/channel-templates";
import {
  TemplateCategorySelect,
  type TemplateCategoryFilter,
  matchTemplateCategory,
} from "@/components/atendimento/template-category-filter";

export interface MinimalTemplate {
  id: string | number;
  name: string;
  language?: string;
  status?: string;
  category?: string;
  components?: unknown[];
}

export interface TemplatePickerByChannelProps {
  whatsapp:
    | (ChannelTemplatesInput & {
        id?: number | string;
        type?: string;
        tokenAPI?: string;
        appId?: string;
      })
    | null
    | undefined;
  value?: string | number | null;
  onChange?: (template: MinimalTemplate | null) => void;
  disabled?: boolean;
  placeholderLoading?: string;
  placeholderSelect?: string;
  className?: string;
}

/**
 * Renderiza um <Select> com a lista de templates do canal apontado por
 * `whatsapp`. Despacha internamente para o service correto via
 * `getTemplatesForChannel` (services/channel-templates.ts), que cobre
 * WABA, Dialog360 e Gupshup.
 *
 * Para WABA: usa whatsapp.tokenAPI (padrao do servico legado).
 * Para Dialog360: usa whatsapp.id.
 * Para Gupshup: usa whatsapp.id (preferencial) ou whatsapp.appId.
 */
export function TemplatePickerByChannel({
  whatsapp,
  value,
  onChange,
  disabled,
  placeholderLoading = "Carregando...",
  placeholderSelect = "Selecione um template",
  className,
}: TemplatePickerByChannelProps) {
  const [templates, setTemplates] = useState<MinimalTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategoryFilter>("all");

  const filteredTemplates = useMemo(
    () => templates.filter((t) => matchTemplateCategory(t, categoryFilter)),
    [templates, categoryFilter]
  );

  useEffect(() => {
    if (!whatsapp) {
      setTemplates([]);
      return;
    }
    // Para WABA, tokenAPI e obrigatorio; para Dialog360/Gupshup, id (ou appId
    // em gupshup). Se nada estiver presente o helper joga erro — silenciamos
    // para nao quebrar a UI.
    const type = whatsapp.type;
    const hasIdentifier =
      (type === "dialog360" && whatsapp.id !== undefined && whatsapp.id !== null) ||
      (type === "gupshup" && (whatsapp.id !== undefined || whatsapp.appId)) ||
      (!type || type === "waba" ? !!whatsapp.tokenAPI : false);

    if (!hasIdentifier) {
      setTemplates([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getTemplatesForChannel(whatsapp)
      .then((res) => {
        if (cancelled) return;
        // Cada BSP devolve um shape ligeiramente diferente:
        //   waba       -> array direto OU axios-like { data: [...] }
        //   dialog360  -> axios-like { data: [...] }
        //   gupshup    -> axios-like { data: [...] }
        let list: MinimalTemplate[] = [];
        if (Array.isArray(res)) {
          list = res as MinimalTemplate[];
        } else if (res && typeof res === "object") {
          const maybeData = (res as { data?: unknown }).data;
          if (Array.isArray(maybeData)) list = maybeData as MinimalTemplate[];
        }
        // Ordenacao alfabetica defensiva.
        list = [...list].sort((a, b) =>
          (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()),
        );
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
  }, [whatsapp?.id, whatsapp?.type, whatsapp?.tokenAPI, whatsapp?.appId]);

  const stringValue = value !== undefined && value !== null ? String(value) : "";

  return (
    <div className="flex gap-2">
      <TemplateCategorySelect
        value={categoryFilter}
        onChange={setCategoryFilter}
        className="w-40 shrink-0"
        size="default"
      />
      <Select
        value={stringValue}
        onValueChange={(v) => {
          const t = templates.find((x) => String(x.id) === v) || null;
          onChange?.(t);
        }}
        disabled={disabled || loading}
      >
        <SelectTrigger className={className}>
          <SelectValue
            placeholder={loading ? placeholderLoading : placeholderSelect}
          />
        </SelectTrigger>
        <SelectContent>
          {filteredTemplates.map((tpl) => (
            <SelectItem key={String(tpl.id)} value={String(tpl.id)}>
              {tpl.name}
              {tpl.category ? (
                <span className="ml-1 text-[10px] text-muted-foreground uppercase">
                  · {tpl.category}
                </span>
              ) : null}
              {tpl.status && tpl.status !== "APPROVED" ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({tpl.status})
                </span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default TemplatePickerByChannel;
