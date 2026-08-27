"use client";

import React from "react";
import { TableHead } from "@/components/ui/table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/hooks/use-sortable";

interface SortableTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: string;
  currentSortKey: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
  children: React.ReactNode;
}

export function SortableTableHead({
  sortKey,
  currentSortKey,
  sortDir,
  onSort,
  children,
  className,
  ...props
}: SortableTableHeadProps) {
  const isActive = currentSortKey === sortKey;

  return (
    <TableHead
      aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("cursor-pointer select-none group whitespace-nowrap", className)}
      {...props}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex w-full items-center gap-1 bg-transparent p-0"
      >
        <span>{children}</span>
        <span className="transition-colors text-muted-foreground/40 group-hover:text-muted-foreground/80">
          {isActive && sortDir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5 text-foreground" />
          ) : isActive && sortDir === "desc" ? (
            <ChevronDown className="h-3.5 w-3.5 text-foreground" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
    </TableHead>
  );
}
