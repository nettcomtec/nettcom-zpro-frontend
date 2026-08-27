"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  clearable?: boolean;
  /** Show search even if few options. Default: shows search when options > 6 */
  alwaysShowSearch?: boolean;
  /** Custom render for each option */
  renderOption?: (option: SearchableSelectOption) => React.ReactNode;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  className,
  triggerClassName,
  disabled,
  clearable,
  alwaysShowSearch,
  renderOption,
}: SearchableSelectProps) {
  const t = useTranslations("searchableSelect");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Navegacao por teclado (padrao ui/command.tsx): indice do item destacado
  // dentro da ordem VISUAL das opcoes (flatOptions). -1 = nenhum.
  const listboxId = React.useId();
  const [highlighted, setHighlighted] = useState(-1);

  const _placeholder = placeholder ?? t("placeholder");
  const _searchPlaceholder = searchPlaceholder ?? t("searchPlaceholder");
  const _emptyText = emptyText ?? t("empty");
  const showSearch = alwaysShowSearch !== false;

  // Filter options
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q)
    );
  }, [options, search]);

  // Group options if any have a group
  const hasGroups = options.some((o) => o.group);
  const groupedOptions = useMemo(() => {
    if (!hasGroups) return null;
    const groups: Record<string, SearchableSelectOption[]> = {};
    for (const opt of filtered) {
      const g = opt.group ?? t("groupOther");
      if (!groups[g]) groups[g] = [];
      groups[g].push(opt);
    }
    return groups;
  }, [filtered, hasGroups, t]);

  // Ordem VISUAL das opcoes (agrupadas ou nao) — referencia unica para o
  // highlight de teclado e para os ids usados em aria-activedescendant.
  const flatOptions = useMemo(
    () => (hasGroups && groupedOptions ? Object.values(groupedOptions).flat() : filtered),
    [hasGroups, groupedOptions, filtered]
  );

  const selectedLabel = options.find((o) => o.value === value)?.label;

  const handleSelect = (val: string) => {
    onValueChange?.(val);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange?.("");
  };

  // Proximo indice habilitado a partir de `from`, andando na direcao `dir` (sem wrap).
  const findEnabled = (from: number, dir: 1 | -1): number => {
    for (let i = from; i >= 0 && i < flatOptions.length; i += dir) {
      if (!flatOptions[i].disabled) return i;
    }
    return -1;
  };

  // Teclado estilo Command (ui/command.tsx): setas movem o highlight pelos itens
  // filtrados, Enter seleciona o destacado, Home/End vao aos extremos. Handler
  // compartilhado entre o input de busca, o trigger (busca oculta / foco ainda no
  // trigger) e o PopoverContent (fallback).
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const key = e.key;
      setHighlighted((prev) => {
        let next = -1;
        if (key === "ArrowDown") next = findEnabled(prev < 0 ? 0 : prev + 1, 1);
        else if (key === "ArrowUp") next = prev < 0 ? findEnabled(flatOptions.length - 1, -1) : findEnabled(prev - 1, -1);
        else if (key === "Home") next = findEnabled(0, 1);
        else next = findEnabled(flatOptions.length - 1, -1);
        return next >= 0 ? next : prev;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = flatOptions[highlighted];
      if (opt && !opt.disabled) { handleSelect(opt.value); return; }
      // Fallback legado: um unico resultado filtrado seleciona direto
      if (filtered.length === 1 && !filtered[0].disabled) handleSelect(filtered[0].value);
      return;
    }
    if (e.key === "Escape") setOpen(false);
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  // Reposiciona o highlight ao abrir/filtrar: item selecionado, senao 1o habilitado.
  useEffect(() => {
    if (!open) { setHighlighted(-1); return; }
    const selIdx = flatOptions.findIndex((o) => o.value === value && !o.disabled);
    setHighlighted(selIdx >= 0 ? selIdx : flatOptions.findIndex((o) => !o.disabled));
  }, [open, flatOptions, value]);

  // Mantem o item destacado visivel dentro do scroller nativo.
  useEffect(() => {
    if (!open || highlighted < 0) return;
    document.getElementById(`${listboxId}-opt-${highlighted}`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted, listboxId]);

  const renderOptionItem = (option: SearchableSelectOption) => {
    const flatIndex = flatOptions.indexOf(option);
    const isHighlighted = flatIndex >= 0 && flatIndex === highlighted;
    return (
    <button
      type="button"
      key={option.value}
      id={flatIndex >= 0 ? `${listboxId}-opt-${flatIndex}` : undefined}
      role="option"
      aria-selected={value === option.value}
      disabled={option.disabled}
      onClick={() => handleSelect(option.value)}
      onMouseEnter={() => { if (!option.disabled && flatIndex >= 0) setHighlighted(flatIndex); }}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        value === option.value && "bg-accent/50 font-medium",
        isHighlighted && "bg-accent text-accent-foreground"
      )}
    >
      {renderOption ? (
        renderOption(option)
      ) : (
        <div className="flex-1 min-w-0 text-left">
          <div className="truncate">{option.label}</div>
          {option.description && (
            <div className="text-[11px] text-muted-foreground truncate">{option.description}</div>
          )}
        </div>
      )}
      {value === option.value && (
        <Check className="absolute right-2 h-3.5 w-3.5 text-primary shrink-0" />
      )}
    </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={`${listboxId}-listbox`}
          disabled={disabled}
          onKeyDown={(e) => {
            if (!open) {
              // Padrao combobox: setas abrem a lista sem precisar de Enter/clique
              if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); }
              return;
            }
            // Popover aberto com foco ainda no trigger (busca oculta ou antes do
            // autofocus do input): navega a lista daqui mesmo.
            handleListKeyDown(e);
          }}
          className={cn(
            "flex h-9 w-full min-w-0 max-w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "hover:bg-accent/20 transition-colors",
            !selectedLabel && "text-muted-foreground",
            triggerClassName
          )}
        >
          <span className={cn("flex flex-1 items-center min-w-0 text-left overflow-hidden", className)}>
            <span className="block truncate w-full">{selectedLabel || _placeholder}</span>
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {clearable && value && (
              // span role="button" (nao <button>): o trigger ja e um <button> e
              // aninhar button em button e HTML invalido. Focavel via Tab e
              // acionavel por Enter/Espaco, com stopPropagation p/ nao abrir o popover.
              <span
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={t("clear")}
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onValueChange?.("");
                  }
                }}
                className="cursor-pointer rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[180px] max-w-[480px] flex flex-col"
        style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // Fallback p/ teclado quando o foco esta dentro do popover fora do input
          // (ex.: busca oculta). Teclas ja tratadas pelo input chegam aqui com
          // defaultPrevented=true e sao ignoradas (evita mover 2x).
          if (e.defaultPrevented) return;
          handleListKeyDown(e);
        }}
      >
        {/* Search input */}
        {showSearch && (
          <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
              placeholder={_searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleListKeyDown}
              aria-controls={`${listboxId}-listbox`}
              aria-activedescendant={highlighted >= 0 ? `${listboxId}-opt-${highlighted}` : undefined}
            />
            {search && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground shrink-0"
                onClick={() => setSearch("")}
              />
            )}
          </div>
        )}

        {/* Lista de opcoes: scroll nativo. flex-1 + min-h-0 garante que o
            scroller respeite a altura disponivel do PopoverContent (clampada
            pelo var --radix-popover-content-available-height), evitando que o
            popover passe do viewport sem barra de rolagem quando aberto dentro
            de Dialogs. */}
        <div
          id={`${listboxId}-listbox`}
          role="listbox"
          aria-label={_placeholder}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          onWheel={(e) => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{_emptyText}</p>
          ) : hasGroups && groupedOptions ? (
            <div className="p-1">
              {Object.entries(groupedOptions).map(([group, items]) => (
                <div key={group}>
                  <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group}
                  </p>
                  {items.map(renderOptionItem)}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-1">{filtered.map(renderOptionItem)}</div>
          )}
        </div>

        {/* Footer with count when many options */}
        {options.length > 10 && (
          <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground text-center">
            {t("resultsCount", { filtered: filtered.length, total: options.length })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
