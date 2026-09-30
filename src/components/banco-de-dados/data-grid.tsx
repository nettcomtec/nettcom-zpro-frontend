"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown, Lock, Scissors } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DbConsoleBrowseSort, DbConsoleResultColumn } from "@/types/db-console";
import { buildCellSet, cellKey, prettyJson } from "./helpers";

/** A grade mostra só o começo do valor; o valor inteiro abre na linha (ou no visualizador). */
const DISPLAY_CHARS = 160;

export interface DataGridProps {
  columns: DbConsoleResultColumn[];
  rows: (string | null)[][];
  truncatedCells?: [number, number][];
  maskedCells?: [number, number][];
  protectedColumns?: string[];
  loading?: boolean;
  /** recorte de linhas a desenhar (índices ABSOLUTOS — os de `truncatedCells` continuam valendo). */
  rowStart?: number;
  rowEnd?: number;
  sort?: DbConsoleBrowseSort | null;
  sortableColumns?: string[];
  onSortChange?: (sort: DbConsoleBrowseSort) => void;
  /** por linha (índice absoluto): pode abrir o registro. */
  clickableRows?: boolean[];
  onRowClick?: (rowIndex: number) => void;
  /** sem clique de linha (resultado de consulta): clicar na célula abre o valor inteiro. */
  enableCellViewer?: boolean;
}

interface ViewerState {
  column: string;
  value: string;
  truncated: boolean;
}

export function DataGrid({
  columns,
  rows,
  truncatedCells,
  maskedCells,
  protectedColumns,
  loading = false,
  rowStart,
  rowEnd,
  sort,
  sortableColumns,
  onSortChange,
  clickableRows,
  onRowClick,
  enableCellViewer = false,
}: DataGridProps) {
  const t = useTranslations("bancoDadosPage");
  const [viewer, setViewer] = useState<ViewerState | null>(null);

  const truncatedSet = useMemo(() => buildCellSet(truncatedCells), [truncatedCells]);
  const maskedSet = useMemo(() => buildCellSet(maskedCells), [maskedCells]);
  const protectedSet = useMemo(() => new Set(protectedColumns ?? []), [protectedColumns]);
  const sortableSet = useMemo(() => new Set(sortableColumns ?? []), [sortableColumns]);

  // Coluna protegida pode vir dentro de `columns` (sem valor) ou só na lista à parte.
  const extraProtected = useMemo(() => {
    const present = new Set(columns.map((column) => column.name));
    return (protectedColumns ?? []).filter((name) => !present.has(name));
  }, [columns, protectedColumns]);

  const start = Math.max(0, rowStart ?? 0);
  const end = Math.min(rows.length, rowEnd ?? rows.length);
  const totalColumns = columns.length + extraProtected.length;
  const rowsAreClickable = !!onRowClick;

  const protectedSeal = useMemo(
    () => (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Lock className="h-3 w-3 shrink-0" />
        {t("protectedCell")}
      </span>
    ),
    [t]
  );

  const body = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let r = start; r < end; r += 1) {
      const row = rows[r] ?? [];
      const clickable = rowsAreClickable && clickableRows?.[r] === true;
      out.push(
        <TableRow
          key={r}
          data-r={r}
          tabIndex={clickable ? 0 : undefined}
          title={clickable ? t("openRow") : undefined}
          className={cn("text-xs", clickable && "cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none")}
        >
          {columns.map((column, c) => {
            const value = row[c] ?? null;
            if (protectedSet.has(column.name) || maskedSet.has(cellKey(r, c))) {
              return (
                <TableCell key={c} className="whitespace-nowrap py-1.5">
                  {protectedSeal}
                </TableCell>
              );
            }
            if (value === null) {
              return (
                <TableCell key={c} className="whitespace-nowrap py-1.5">
                  <span className="rounded border border-dashed px-1 text-[10px] italic text-muted-foreground/70">
                    {t("nullValue")}
                  </span>
                </TableCell>
              );
            }
            const truncated = truncatedSet.has(cellKey(r, c));
            const long = value.length > DISPLAY_CHARS;
            return (
              <TableCell
                key={c}
                data-c={c}
                className={cn(
                  "max-w-[22rem] whitespace-nowrap py-1.5 font-mono",
                  enableCellViewer && (long || truncated) && "cursor-pointer"
                )}
              >
                <span className="flex items-center gap-1">
                  <span className="truncate">{long ? `${value.slice(0, DISPLAY_CHARS)}…` : value}</span>
                  {truncated && (
                    <span title={t("truncatedCell")} className="shrink-0 text-warning">
                      <Scissors className="h-3 w-3" aria-label={t("truncatedCell")} />
                    </span>
                  )}
                </span>
              </TableCell>
            );
          })}
          {extraProtected.map((name) => (
            <TableCell key={`p:${name}`} className="whitespace-nowrap py-1.5">
              {protectedSeal}
            </TableCell>
          ))}
        </TableRow>
      );
    }
    return out;
  }, [
    start, end, rows, columns, extraProtected, clickableRows, rowsAreClickable,
    protectedSet, maskedSet, truncatedSet, protectedSeal, enableCellViewer, t,
  ]);

  // Um ouvinte só no corpo da tabela: a grade pode ter dezenas de milhares de células.
  function rowIndexFrom(target: EventTarget | null): number | null {
    const element = (target as HTMLElement | null)?.closest?.("tr[data-r]") as HTMLElement | null;
    const index = Number(element?.dataset?.r);
    return element && Number.isInteger(index) ? index : null;
  }

  function handleBodyClick(event: React.MouseEvent<HTMLTableSectionElement>) {
    const r = rowIndexFrom(event.target);
    if (r === null) return;
    if (onRowClick) {
      if (clickableRows?.[r] === true) onRowClick(r);
      return;
    }
    if (!enableCellViewer) return;
    const cell = (event.target as HTMLElement).closest("td[data-c]") as HTMLElement | null;
    const c = Number(cell?.dataset?.c);
    if (!cell || !Number.isInteger(c)) return;
    const value = rows[r]?.[c];
    if (typeof value !== "string") return;
    const truncated = truncatedSet.has(cellKey(r, c));
    if (value.length <= DISPLAY_CHARS && !truncated) return;
    setViewer({ column: columns[c]?.name ?? "", value, truncated });
  }

  function handleBodyKeyDown(event: React.KeyboardEvent<HTMLTableSectionElement>) {
    if (!onRowClick || (event.key !== "Enter" && event.key !== " ")) return;
    const element = event.target as HTMLElement;
    if (element.tagName !== "TR") return;
    const r = rowIndexFrom(element);
    if (r === null || clickableRows?.[r] !== true) return;
    event.preventDefault();
    onRowClick(r);
  }

  const showSkeleton = loading && end - start === 0;

  return (
    <>
      {/* Só ESTE contêiner rola na horizontal — a página nunca. */}
      <div className="w-full max-w-full overflow-x-auto rounded-md border">
        <Table className={cn(loading && !showSkeleton && "opacity-60 transition-opacity")}>
          <TableHeader>
            <TableRow>
              {columns.map((column) => {
                const isProtected = protectedSet.has(column.name);
                const sortable = !!onSortChange && !isProtected && sortableSet.has(column.name);
                const active = sort?.column === column.name ? sort.dir : null;
                const nextDir: "asc" | "desc" = active === "asc" ? "desc" : "asc";
                return (
                  <TableHead
                    key={column.name}
                    className="h-9 whitespace-nowrap text-xs"
                    aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {isProtected && <Lock className="h-3 w-3 shrink-0" />}
                      {sortable ? (
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 font-mono hover:text-foreground",
                            active && "text-foreground"
                          )}
                          title={nextDir === "asc" ? t("sortAsc") : t("sortDesc")}
                          onClick={() => onSortChange?.({ column: column.name, dir: nextDir })}
                        >
                          {column.name}
                          {active === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : active === "desc" ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        <span className="font-mono">{column.name}</span>
                      )}
                      {column.type && (
                        <span className="text-[10px] font-normal text-muted-foreground/70">{column.type}</span>
                      )}
                    </span>
                  </TableHead>
                );
              })}
              {extraProtected.map((name) => (
                <TableHead key={`p:${name}`} className="h-9 whitespace-nowrap text-xs">
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Lock className="h-3 w-3 shrink-0" />
                    {name}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody onClick={handleBodyClick} onKeyDown={handleBodyKeyDown}>
            {showSkeleton ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`s:${i}`}>
                  <TableCell colSpan={Math.max(1, totalColumns)}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : end - start === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={Math.max(1, totalColumns)}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {t("emptyResult")}
                </TableCell>
              </TableRow>
            ) : (
              body
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!viewer} onOpenChange={(open) => !open && setViewer(null)}>
        <DialogContent className="w-full max-w-2xl">
          <DialogHeader>
            <DialogTitle className="break-all font-mono text-sm">{viewer?.column}</DialogTitle>
            {viewer?.truncated && <DialogDescription>{t("truncatedCell")}</DialogDescription>}
          </DialogHeader>
          {viewer && (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 font-mono text-[11px]">
              {(viewer.truncated ? null : prettyJson(viewer.value)) ?? viewer.value}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
