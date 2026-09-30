"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Search, Table2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { DbConsoleTableSummary } from "@/types/db-console";
import { formatBytes } from "./helpers";

interface TableBrowserProps {
  tables: DbConsoleTableSummary[];
  loading?: boolean;
  selected: string | null;
  onSelect: (table: string) => void;
}

export function TableBrowser({ tables, loading, selected, onSelect }: TableBrowserProps) {
  const t = useTranslations("bancoDadosPage");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tables;
    return tables.filter(table => table.name.toLowerCase().includes(term));
  }, [tables, search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder={t("searchTable")}
          className="pl-8"
          aria-label={t("searchTable")}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto rounded-lg border divide-y">
          {filtered.map(table => (
            <button
              key={table.name}
              type="button"
              onClick={() => onSelect(table.name)}
              className={cn(
                "flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-muted/60",
                selected === table.name && "bg-muted"
              )}
            >
              <span className="flex items-center gap-2 font-mono text-sm break-all">
                <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {table.name}
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {table.estimatedRows === null
                    ? t("estimatedUnknown")
                    : t("estimatedRows", { count: formatNumber(table.estimatedRows) })}
                </span>
                <span>{t("tableSize", { size: formatBytes(table.sizeBytes) })}</span>
                {table.readOnly && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t("badgeReadOnly")}
                  </Badge>
                )}
                {table.hasProtectedColumns && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Lock className="h-3 w-3" />
                    {t("badgeProtectedCols")}
                  </Badge>
                )}
              </span>
            </button>
          ))}
          {!filtered.length && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("emptyResult")}</p>
          )}
        </div>
      )}
    </div>
  );
}
