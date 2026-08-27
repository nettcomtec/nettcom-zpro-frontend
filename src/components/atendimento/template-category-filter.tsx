"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const TEMPLATE_CATEGORIES = ["all", "MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type TemplateCategoryFilter = typeof TEMPLATE_CATEGORIES[number];

interface MinimalCategorized {
  category?: string | null;
}

export function matchTemplateCategory(
  t: MinimalCategorized,
  filter: TemplateCategoryFilter
): boolean {
  if (filter === "all") return true;
  return String(t.category || "").toUpperCase() === filter;
}

interface Props {
  value: TemplateCategoryFilter;
  onChange: (v: TemplateCategoryFilter) => void;
  className?: string;
  size?: "sm" | "default";
}

export function TemplateCategorySelect({ value, onChange, className, size = "default" }: Props) {
  const t = useTranslations("templateCategory");
  const heightClass = size === "sm" ? "h-8 text-xs" : "";
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TemplateCategoryFilter)}>
      <SelectTrigger className={`${heightClass} ${className || ""}`}>
        <SelectValue placeholder={t("categoryAll")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("categoryAll")}</SelectItem>
        <SelectItem value="MARKETING">{t("categoryMarketing")}</SelectItem>
        <SelectItem value="UTILITY">{t("categoryUtility")}</SelectItem>
        <SelectItem value="AUTHENTICATION">{t("categoryAuthentication")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
