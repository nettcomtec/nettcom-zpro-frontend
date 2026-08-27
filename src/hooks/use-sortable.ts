import { useState, useMemo } from "react";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string | null;
  dir: SortDir;
}

export function useSortable<T extends object>(
  data: T[],
  defaultKey?: string,
  defaultDir: SortDir = "asc"
) {
  const [sort, setSort] = useState<SortState>({
    key: defaultKey ?? null,
    dir: defaultDir,
  });

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  };

  const sortedData = useMemo(() => {
    if (!sort.key) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sort.key!];
      const bv = (b as Record<string, unknown>)[sort.key!];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data, sort]);

  return { sortKey: sort.key, sortDir: sort.dir, handleSort, sortedData };
}
