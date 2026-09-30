"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { estadosBR } from "@/lib/constants";
import {
  type AddressFilter,
  EMPTY_ADDRESS_FILTER,
  addressFilterActiveCount,
  isAddressFilterActive,
  normalizeAddressFilter,
  sameAddressFilter,
} from "@/lib/address-filter";

// Campos do filtro por endereço (bairro, cidade, UF do cadastro) — PLANO_ENDERECO_COMPLETO_CONTATO.
// mode "live": aplica sozinho 400 ms depois de digitar (/contatos).
// mode "apply": rascunho + botão Aplicar (massa e campanhas: digitar nunca recarrega a lista).
interface AddressFilterFieldsProps {
  value: AddressFilter;
  onChange: (next: AddressFilter) => void;
  mode: "live" | "apply";
  // "stack" = uma coluna (dentro de popover); "row" = 3 colunas a partir de sm.
  layout?: "stack" | "row";
  disabled?: boolean;
  className?: string;
  showTitle?: boolean;
  showHint?: boolean;
  // Modo "apply": avisa quando há rascunho digitado e ainda não aplicado (a página bloqueia o
  // envio — senão "Enviar" sem "Aplicar" iria para a lista montada com o filtro anterior).
  onPendingChange?: (pending: boolean) => void;
}

export function AddressFilterFields({
  value,
  onChange,
  mode,
  layout = "row",
  disabled,
  className,
  showTitle = false,
  showHint = false,
  onPendingChange,
}: AddressFilterFieldsProps) {
  const t = useTranslations("addressFilter");
  const baseId = useId();
  const [draft, setDraft] = useState<AddressFilter>(() => normalizeAddressFilter(value));
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const draftRef = useRef(draft);
  const modeRef = useRef(mode);
  valueRef.current = value;
  onChangeRef.current = onChange;
  draftRef.current = draft;
  modeRef.current = mode;

  // Modo live dentro de popover: fechar antes dos 400 ms desmonta o componente com o timer
  // pendente — aplica o rascunho na saída para o que foi digitado/marcado não se perder.
  useEffect(
    () => () => {
      if (modeRef.current === "live" && !sameAddressFilter(draftRef.current, valueRef.current)) {
        onChangeRef.current(normalizeAddressFilter(draftRef.current));
      }
    },
    []
  );

  // Valor de fora mudou (ex.: a página limpou o filtro): o rascunho acompanha. Comparação
  // normalizada, para o espaço que o atendente acabou de digitar não sumir no meio da palavra.
  useEffect(() => {
    setDraft((current) => (sameAddressFilter(current, value) ? current : normalizeAddressFilter(value)));
  }, [value]);

  useEffect(() => {
    if (mode !== "live") return undefined;
    const handle = setTimeout(() => {
      if (!sameAddressFilter(draft, valueRef.current)) onChangeRef.current(normalizeAddressFilter(draft));
    }, 400);
    return () => clearTimeout(handle);
  }, [draft, mode]);

  const pending = mode === "apply" && !sameAddressFilter(draft, value);
  const onPendingChangeRef = useRef(onPendingChange);
  onPendingChangeRef.current = onPendingChange;
  useEffect(() => {
    onPendingChangeRef.current?.(pending);
  }, [pending]);
  // Recolher o bloco descarta o rascunho junto: deixa de haver pendência.
  useEffect(() => () => onPendingChangeRef.current?.(false), []);
  const appliedCount = addressFilterActiveCount(value);
  const canClear = isAddressFilterActive(draft) || isAddressFilterActive(value);

  const apply = () => {
    if (!sameAddressFilter(draft, value)) onChange(normalizeAddressFilter(draft));
  };

  const clear = () => {
    setDraft(EMPTY_ADDRESS_FILTER);
    if (isAddressFilterActive(value)) onChange(EMPTY_ADDRESS_FILTER);
  };

  const onTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Nunca submeter o formulário em volta; no modo "apply" o Enter aplica.
      e.preventDefault();
      if (mode === "apply") apply();
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {(showTitle || appliedCount > 0) && (
        <div className="flex items-center justify-between gap-2">
          {showTitle ? <p className="text-sm font-medium">{t("title")}</p> : <span />}
          {appliedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {t("activeCount", { count: appliedCount })}
            </Badge>
          )}
        </div>
      )}

      <div className={cn("grid grid-cols-1 gap-3", layout === "row" && "sm:grid-cols-3")}>
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-bairro`} className="text-xs">{t("bairro")}</Label>
          <Input
            id={`${baseId}-bairro`}
            value={draft.bairro}
            maxLength={100}
            placeholder={t("bairroPlaceholder")}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, bairro: e.target.value }))}
            onKeyDown={onTextKeyDown}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-cidade`} className="text-xs">{t("cidade")}</Label>
          <Input
            id={`${baseId}-cidade`}
            value={draft.cidade}
            maxLength={100}
            placeholder={t("cidadePlaceholder")}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, cidade: e.target.value }))}
            onKeyDown={onTextKeyDown}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-uf`} className="text-xs">{t("uf")}</Label>
          <UfMultiSelect
            id={`${baseId}-uf`}
            value={draft.ufs}
            disabled={disabled}
            placeholder={t("ufPlaceholder")}
            clearLabel={t("clear")}
            onChange={(ufs) => setDraft((d) => ({ ...d, ufs }))}
          />
        </div>
      </div>

      {showHint && <p className="text-xs text-muted-foreground">{t("hint")}</p>}
      {pending && <p className="text-xs text-amber-600 dark:text-amber-400">{t("staleList")}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || !canClear}>
          <X className="mr-1 h-3.5 w-3.5" />
          {t("clear")}
        </Button>
        {mode === "apply" && (
          <Button type="button" size="sm" onClick={apply} disabled={disabled || !pending}>
            {t("apply")}
          </Button>
        )}
      </div>
    </div>
  );
}

interface UfMultiSelectProps {
  id: string;
  value: string[];
  onChange: (ufs: string[]) => void;
  disabled?: boolean;
  placeholder: string;
  clearLabel: string;
}

function UfMultiSelect({ id, value, onChange, disabled, placeholder, clearLabel }: UfMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (sigla: string) => {
    onChange(selected.has(sigla) ? value.filter((uf) => uf !== sigla) : [...value, sigla]);
  };

  const label =
    value.length === 0
      ? placeholder
      : value.length <= 4
        ? [...value].sort().join(", ")
        : `${[...value].sort().slice(0, 3).join(", ")} +${value.length - 3}`;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={`${id}-listbox`}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
            "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
            "disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent/20 transition-colors",
            value.length === 0 && "text-muted-foreground"
          )}
        >
          <span className="block flex-1 min-w-0 truncate text-left">{label}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[min(240px,calc(100vw-2rem))] flex flex-col"
        style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-multiselectable="true"
          className="flex-1 min-h-0 max-h-64 overflow-y-auto overscroll-contain p-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {estadosBR.map((estado) => {
            const checked = selected.has(estado.sigla);
            return (
              <button
                type="button"
                key={estado.sigla}
                role="option"
                aria-selected={checked}
                onClick={() => toggle(estado.sigla)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left transition-colors",
                  "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:bg-accent",
                  checked && "font-medium"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary shadow",
                    checked && "bg-primary text-primary-foreground"
                  )}
                >
                  {checked && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="w-7 shrink-0 font-mono text-xs">{estado.sigla}</span>
                <span className="flex-1 min-w-0 truncate text-muted-foreground">{estado.nome}</span>
              </button>
            );
          })}
        </div>
        {value.length > 0 && (
          <div className="border-t p-2">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {clearLabel}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
