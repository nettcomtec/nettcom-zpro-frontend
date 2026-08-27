"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Atalhos de período (Hoje / 7 / 30 / 90 dias) que populam os campos de data dos
// relatórios — mesmo padrão do /dashboard. onSelect recebe as datas em YYYY-MM-DD
// (formato do <input type="date">). "N dias" = de (hoje - N) até hoje.
function toYMD(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

interface DateRangePresetsProps {
  onSelect: (start: string, end: string) => void;
  className?: string;
}

export function DateRangePresets({ onSelect, className }: DateRangePresetsProps) {
  const t = useTranslations("dateRangePresets");

  const apply = (days: number) => {
    const end = new Date();
    const start = new Date();
    if (days > 0) start.setDate(start.getDate() - days);
    onSelect(toYMD(start), toYMD(end));
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => apply(0)}>
        {t("today")}
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => apply(7)}>
        {t("days7")}
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => apply(30)}>
        {t("days30")}
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => apply(90)}>
        {t("days90")}
      </Button>
    </div>
  );
}

export default DateRangePresets;
