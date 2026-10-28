"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PanelAppRef } from "@/lib/panel-apps";

/**
 * Seleção múltipla com busca e chips (aplicativos personalizados — usuários,
 * equipes, perfis personalizados, empresas e planos).
 *
 * A lista de escolha abre EMBAIXO do campo, dentro do próprio formulário (sem
 * portal): dentro de um Dialog a rolagem e o foco funcionam sem truque, e no
 * celular a lista não fica por cima do teclado.
 */

/** Chips mostrados antes do "+N" (lista longa de empresas não empurra o formulário). */
const CHIPS_COLLAPSED = 12;
/** Itens desenhados na lista de escolha; o resto pede busca. */
const LIST_RENDER_MAX = 100;

const normalizeText = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export interface PanelAppMultiSelectProps {
  /** Opções disponíveis (`{id, name}`). Selecionado fora da lista aparece como `#id`. */
  options: PanelAppRef[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  loading?: boolean;
  /** Teto de itens (espelho do backend). */
  max?: number;
  /** Nome do campo, para leitores de tela. */
  label: string;
  /** Texto quando não há nenhuma opção cadastrada. */
  emptyText?: string;
}

export function PanelAppMultiSelect({
  options,
  value,
  onChange,
  disabled,
  loading,
  max,
  label,
  emptyText,
}: PanelAppMultiSelectProps) {
  const t = useTranslations("panelAppForm");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const selectedSet = useMemo(() => new Set(value), [value]);
  const selected = useMemo(
    () => value.map((id) => byId.get(id) ?? { id, name: `#${id}` }),
    [value, byId]
  );
  const atMax = typeof max === "number" && value.length >= max;

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    if (!q) return options;
    return options.filter((o) => normalizeText(o.name).includes(q));
  }, [options, search]);
  const shown = filtered.slice(0, LIST_RENDER_MAX);
  const hiddenCount = filtered.length - shown.length;

  const visibleChips = expanded ? selected : selected.slice(0, CHIPS_COLLAPSED);
  const extraChips = selected.length - visibleChips.length;

  const toggle = (id: number) => {
    if (disabled) return;
    if (selectedSet.has(id)) onChange(value.filter((v) => v !== id));
    else if (!atMax) onChange([...value, id]);
  };

  const remove = (id: number) => {
    if (disabled) return;
    onChange(value.filter((v) => v !== id));
  };

  const togglePanel = () => {
    if (disabled) return;
    const next = !open;
    setOpen(next);
    if (next) setTimeout(() => searchRef.current?.focus(), 30);
    else setSearch("");
  };

  return (
    <div className="space-y-2" role="group" aria-label={label}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleChips.map((item) => (
            <span
              key={item.id}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/60 py-0.5 pl-2.5 pr-1 text-xs",
                disabled && "opacity-60"
              )}
            >
              <span className="truncate max-w-[12rem]">{item.name}</span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={disabled}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground disabled:pointer-events-none"
                aria-label={t("removeItem", { name: item.name })}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {extraChips > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {t("showMoreChips", { count: extraChips })}
            </button>
          )}
          {expanded && selected.length > CHIPS_COLLAPSED && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {t("showLessChips")}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={togglePanel}
          disabled={disabled}
          aria-expanded={open}
          aria-controls={listId}
          className="gap-1.5"
        >
          {open ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {open ? t("done") : t("add")}
        </Button>
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("loadingOptions")}
          </span>
        )}
        {atMax && <span className="text-xs text-muted-foreground">{t("limitItems", { max: max ?? 0 })}</span>}
      </div>

      {open && !disabled && (
        <div className="space-y-2 rounded-md border bg-background p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Enter marca/desmarca o 1º resultado (busca + Enter = escolha rápida)
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown.length > 0) toggle(shown[0].id);
                }
              }}
              placeholder={t("search")}
              aria-label={t("searchIn", { field: label })}
              aria-controls={listId}
              className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            className="max-h-48 overflow-y-auto overscroll-contain"
          >
            {options.length === 0 && !loading ? (
              <p className="py-3 text-center text-xs text-muted-foreground">{emptyText ?? t("noOptions")}</p>
            ) : shown.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">{t("noResults")}</p>
            ) : (
              shown.map((o) => {
                const isSelected = selectedSet.has(o.id);
                const blocked = !isSelected && atMax;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={blocked}
                    onClick={() => toggle(o.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      "disabled:pointer-events-none disabled:opacity-50",
                      isSelected && "font-medium"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                        isSelected && "bg-primary text-primary-foreground"
                      )}
                      aria-hidden
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  </button>
                );
              })
            )}
            {hiddenCount > 0 && (
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{t("moreResults", { count: hiddenCount })}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
