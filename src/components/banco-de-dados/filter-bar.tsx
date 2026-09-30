"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  DbConsoleBrowseFilter, DbConsoleBrowseOp, DbConsoleTableInfo,
} from "@/types/db-console";
import { GRID_PAGE_SIZES } from "./helpers";

const OPS: DbConsoleBrowseOp[] = [
  "eq", "ne", "contains", "starts", "gt", "gte", "lt", "lte", "isnull", "notnull",
];

const OP_LABEL_KEY: Record<DbConsoleBrowseOp, string> = {
  eq: "opEq",
  ne: "opNe",
  contains: "opContains",
  starts: "opStarts",
  gt: "opGt",
  gte: "opGte",
  lt: "opLt",
  lte: "opLte",
  isnull: "opIsNull",
  notnull: "opNotNull",
};

const VALUELESS = new Set<DbConsoleBrowseOp>(["isnull", "notnull"]);

interface FilterBarProps {
  info: DbConsoleTableInfo;
  filters: DbConsoleBrowseFilter[];
  onFiltersChange: (filters: DbConsoleBrowseFilter[]) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onApply: () => void;
  disabled?: boolean;
}

export function FilterBar({
  info,
  filters,
  onFiltersChange,
  pageSize,
  onPageSizeChange,
  onApply,
  disabled,
}: FilterBarProps) {
  const t = useTranslations("bancoDadosPage");

  // a coluna mediada (valor das tabelas de configuração) não aceita filtro: filtrar
  // por ela transformaria a grade num oráculo do valor mascarado.
  const filterable = info.columns.filter(column => column.readable && !column.mediated);
  const hasMediated = info.columns.some(column => column.mediated);

  function update(index: number, patch: Partial<DbConsoleBrowseFilter>) {
    onFiltersChange(filters.map((filter, i) => (i === index ? { ...filter, ...patch } : filter)));
  }

  function add() {
    const first = filterable[0];
    if (!first) return;
    onFiltersChange([...filters, { column: first.name, op: "eq", value: "" }]);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {filters.map((filter, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Select value={filter.column} onValueChange={value => update(index, { column: value })}>
              <SelectTrigger className="h-9 w-full sm:w-52">
                <SelectValue placeholder={t("filterColumn")} />
              </SelectTrigger>
              <SelectContent>
                {filterable.map(column => (
                  <SelectItem key={column.name} value={column.name}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filter.op}
              onValueChange={value => update(index, { op: value as DbConsoleBrowseOp })}
            >
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue placeholder={t("filterOp")} />
              </SelectTrigger>
              <SelectContent>
                {OPS.map(op => (
                  <SelectItem key={op} value={op}>
                    {t(OP_LABEL_KEY[op])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!VALUELESS.has(filter.op) && (
              <Input
                value={filter.value ?? ""}
                onChange={event => update(index, { value: event.target.value })}
                placeholder={t("filterValue")}
                className="h-9 w-full text-base sm:w-56 sm:text-sm"
                onKeyDown={event => {
                  if (event.key === "Enter") onApply();
                }}
              />
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => onFiltersChange(filters.filter((_, i) => i !== index))}
              aria-label={t("clearFilters")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={add} disabled={disabled || !filterable.length}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addFilter")}
        </Button>
        {filters.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onFiltersChange([])} disabled={disabled}>
            {t("clearFilters")}
          </Button>
        )}
        <Button size="sm" onClick={onApply} disabled={disabled}>
          {t("runQuery")}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("pageSize")}</span>
          <Select value={String(pageSize)} onValueChange={value => onPageSizeChange(Number(value))}>
            <SelectTrigger className="h-9 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRID_PAGE_SIZES.map(size => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasMediated && (
        <p className="text-xs text-muted-foreground">{t("kvValueFilterUnavailable")}</p>
      )}
    </div>
  );
}
