import { useState, useEffect } from "react";

export type TableDensity = "compact" | "comfortable" | "spacious";

const STORAGE_KEY = "tableDensity";

export function useTableDensity(defaultDensity: TableDensity = "comfortable") {
  const [density, setDensity] = useState<TableDensity>(defaultDensity);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as TableDensity | null;
      if (stored && ["compact", "comfortable", "spacious"].includes(stored)) {
        setDensity(stored);
      }
    } catch {}
  }, []);

  const updateDensity = (d: TableDensity) => {
    setDensity(d);
    try { localStorage.setItem(STORAGE_KEY, d); } catch {}
  };

  const rowClassName = {
    compact: "py-1 text-xs",
    comfortable: "py-2 text-sm",
    spacious: "py-3 text-sm",
  }[density];

  const cellClassName = {
    compact: "px-2 py-1 text-xs",
    comfortable: "px-4 py-2 text-sm",
    spacious: "px-4 py-3 text-sm",
  }[density];

  return { density, updateDensity, rowClassName, cellClassName };
}
