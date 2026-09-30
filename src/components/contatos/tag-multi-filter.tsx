"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type TagMatch = "any" | "all";

export interface TagFilterOption {
  id: number;
  name: string;
  color?: string;
  isActive?: boolean;
}

interface TagMultiFilterProps {
  tags: TagFilterOption[];
  value: number[];
  onValueChange: (ids: number[]) => void;
  match: TagMatch;
  onMatchChange: (match: TagMatch) => void;
  className?: string;
  disabled?: boolean;
}

// Filtro de várias etiquetas com a regra "qualquer uma" / "todas". A regra só
// aparece com 2+ marcadas — com uma etiqueta as duas dão o mesmo resultado.
export function TagMultiFilter({
  tags,
  value,
  onValueChange,
  match,
  onMatchChange,
  className,
  disabled,
}: TagMultiFilterProps) {
  const t = useTranslations("tagMultiFilter");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearch("");
  }, [open]);

  // Etiqueta inativa some da lista, a não ser que já esteja marcada.
  const options = useMemo(
    () =>
      tags
        .filter((tag) => tag.isActive !== false || value.includes(tag.id))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })),
    [tags, value]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    return options.filter((tag) => (tag.name ?? "").toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (id: number) => {
    onValueChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  const clear = () => onValueChange([]);

  const triggerLabel =
    value.length === 0
      ? t("placeholder")
      : value.length === 1
        ? tags.find((tag) => tag.id === value[0])?.name ?? t("placeholder")
        : t(match === "all" ? "selectedAll" : "selectedAny", { count: value.length });

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={t("ariaLabel")}
          title={value.length > 0 ? triggerLabel : undefined}
          disabled={disabled}
          className={cn(
            "flex h-9 min-w-0 max-w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
            "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
            "disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent/20 transition-colors",
            value.length === 0 && "text-muted-foreground",
            className
          )}
        >
          <span className="block flex-1 min-w-0 truncate text-left">{triggerLabel}</span>
          <span className="flex items-center gap-1 ml-2 shrink-0">
            {value.length > 0 && (
              // span role="button": o trigger já é <button> e aninhar button é HTML inválido.
              <span
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={t("clear")}
                onClick={(e) => {
                  e.stopPropagation();
                  clear();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    clear();
                  }
                }}
                className="cursor-pointer rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 w-[min(280px,calc(100vw-2rem))] flex flex-col"
        style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-base sm:text-sm outline-none placeholder:text-muted-foreground min-w-0"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length === 1) {
                e.preventDefault();
                toggle(filtered[0].id);
              }
              if (e.key === "Escape") setOpen(false);
            }}
          />
          {search && (
            <X
              className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground shrink-0"
              onClick={() => setSearch("")}
            />
          )}
        </div>

        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={t("ariaLabel")}
          className="flex-1 min-h-0 max-h-64 overflow-y-auto overscroll-contain p-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            filtered.map((tag) => {
              const checked = value.includes(tag.id);
              return (
                <button
                  type="button"
                  key={tag.id}
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(tag.id)}
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
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border"
                    style={tag.color ? { backgroundColor: tag.color, borderColor: tag.color } : undefined}
                  />
                  <span className="flex-1 min-w-0 truncate">{tag.name}</span>
                </button>
              );
            })
          )}
        </div>

        {value.length > 0 && (
          <div className="border-t p-2 space-y-2">
            {value.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t("matchLabel")}</p>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5" role="radiogroup" aria-label={t("matchLabel")}>
                  {(["any", "all"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={match === option}
                      onClick={() => onMatchChange(option)}
                      className={cn(
                        "rounded px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        match === option
                          ? "bg-background text-foreground font-medium shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t(option === "all" ? "matchAll" : "matchAny")}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t(match === "all" ? "matchAllHint" : "matchAnyHint")}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={clear}
              className="w-full rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {t("clear")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
