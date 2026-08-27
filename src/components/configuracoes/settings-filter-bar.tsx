"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SettingTag } from "@/lib/settings-catalog";

export interface SettingsSearchResult {
  id: string;
  label: string;
  section: string;
}

export type SettingsStatusFilter = "all" | "enabled" | "changed";

export interface SettingsFilterBarProps {
  // ── busca ──
  query: string;
  onQueryChange: (q: string) => void;
  results: SettingsSearchResult[];
  onSelectResult: (id: string) => void;

  // ── filtro de status ──
  statusFilter: SettingsStatusFilter;
  onStatusFilterChange: (f: SettingsStatusFilter) => void;
  /** quantidade que cada filtro retornaria, para exibir no chip */
  statusCounts: Record<SettingsStatusFilter, number>;

  // ── filtro por tema (tags) ──
  /** tags disponiveis, na ordem de exibicao */
  tags: { tag: SettingTag; label: string; count: number }[];
  activeTags: SettingTag[];
  onToggleTag: (tag: SettingTag) => void;

  // ── modo compacto ──
  compact: boolean;
  onCompactChange: (compact: boolean) => void;

  hasActiveFilters: boolean;
  onClearFilters: () => void;

  /** strings ja traduzidas */
  labels: {
    searchPlaceholder: string;
    noResults: string;
    filterAll: string;
    filterEnabled: string;
    filterChanged: string;
    filterByTheme: string;
    clearFilters: string;
    compactMode: string;
    searchHint: string;
  };
}

const STATUS_FILTERS: SettingsStatusFilter[] = ["all", "enabled", "changed"];

const COMPACT_SWITCH_ID = "settings-compact-mode";
const THEME_LABEL_ID = "settings-theme-filter-label";

export function SettingsFilterBar({
  query,
  onQueryChange,
  results,
  onSelectResult,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  tags,
  activeTags,
  onToggleTag,
  compact,
  onCompactChange,
  hasActiveFilters,
  onClearFilters,
  labels,
}: SettingsFilterBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const statusLabels: Record<SettingsStatusFilter, string> = {
    all: labels.filterAll,
    enabled: labels.filterEnabled,
    changed: labels.filterChanged,
  };

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  // Atalho "/" foca a busca. NAO registramos Ctrl/Cmd+K: essa combinacao ja
  // pertence ao CommandPalette global (components/layout/command-palette.tsx) e
  // duplicar o listener roubaria o atalho dele.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      // Shift nao entra aqui de proposito: em alguns layouts a "/" so sai com ele,
      // e o event.key ja garante que o caractere resultante e a barra.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }

      // Sem preventDefault a "/" seria digitada no input recem-focado.
      event.preventDefault();
      inputRef.current?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectResult = useCallback(
    (id: string) => {
      setShowResults(false);
      onSelectResult(id);
    },
    [onSelectResult]
  );

  const showHint = !query && !focused;

  return (
    <div className="space-y-3">
      {/* Linha 1 — busca */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            className="pl-9 pr-9"
            placeholder={labels.searchPlaceholder}
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => {
              setFocused(true);
              setShowResults(true);
            }}
            onBlur={() => {
              setFocused(false);
              // Atraso para o clique num resultado acontecer antes do fechamento.
              if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
              blurTimerRef.current = setTimeout(() => setShowResults(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowResults(false);
                inputRef.current?.blur();
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => onQueryChange("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {showHint && (
            <div className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 select-none items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
              <span>{labels.searchHint}</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                /
              </kbd>
            </div>
          )}
        </div>
        {showResults && query.trim() && (
          <div className="absolute top-full mt-1 w-full z-50 bg-popover border border-border rounded-md shadow-md overflow-hidden">
            {results.length > 0 ? (
              results.map((item) => (
                // onMouseDown (e nao onClick) de proposito: o onBlur do input fecha
                // o dropdown em 150ms e o click chegaria depois do desmonte.
                <button
                  key={item.id}
                  type="button"
                  className="w-full text-left px-4 py-2.5 hover:bg-accent flex items-center justify-between gap-3 text-sm border-b border-border/30 last:border-0 min-w-0"
                  onMouseDown={() => handleSelectResult(item.id)}
                >
                  <span className="font-medium truncate min-w-0">{item.label}</span>
                  <span className="text-xs text-muted-foreground truncate shrink-0 max-w-[40%]">{item.section}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-muted-foreground">{labels.noResults}</div>
            )}
          </div>
        )}
      </div>

      {/* Linha 2 — status (exclusivo) + limpar + modo compacto */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => {
          const active = statusFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={active}
              onClick={() => onStatusFilterChange(filter)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {statusLabels[filter]}
              <Badge
                variant="secondary"
                className={cn(
                  "px-1.5 py-0 text-[10px] tabular-nums",
                  active && "bg-primary-foreground/20 text-primary-foreground"
                )}
              >
                {statusCounts[filter]}
              </Badge>
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              {labels.clearFilters}
            </Button>
          )}
          <Label htmlFor={COMPACT_SWITCH_ID} className="cursor-pointer text-xs text-muted-foreground">
            {labels.compactMode}
          </Label>
          <Switch id={COMPACT_SWITCH_ID} checked={compact} onCheckedChange={onCompactChange} />
        </div>
      </div>

      {/* Linha 3 — tema (multi-selecao) */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={THEME_LABEL_ID}>
          <span id={THEME_LABEL_ID} className="text-xs font-medium text-muted-foreground">
            {labels.filterByTheme}
          </span>
          {tags.map(({ tag, label, count }) => {
            const active = activeTags.includes(tag);
            const disabled = count === 0;
            return (
              <button
                key={tag}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => {
                  if (disabled) return;
                  onToggleTag(tag);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  disabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground"
                )}
              >
                {label}
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    active ? "text-primary/80" : "text-muted-foreground/70"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SettingsFilterBar;
