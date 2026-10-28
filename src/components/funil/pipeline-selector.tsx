"use client";

// Seletor do funil do quadro de oportunidades (PLANO_FUNIL_OPORTUNIDADES_KOMMO D4):
// um funil por vez, com busca, sempre visível no topo. Quem lembra o último
// escolhido é a página (chave por usuário no navegador).

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import { HelpCircle } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Pipeline } from "@/components/funil/opportunity-shared";

export interface PipelineSelectorProps {
  pipelines: Pipeline[];
  value: number | null;
  onChange: (id: number) => void;
  className?: string;
}

export function PipelineSelector({ pipelines, value, onChange, className }: PipelineSelectorProps) {
  const t = useTranslations("funilKanbanPage");

  const options = useMemo(
    () => pipelines.map((p) => ({ value: String(p.id), label: p.name })),
    [pipelines]
  );

  function handleChange(v: string) {
    const id = Number(v);
    if (!v || !Number.isFinite(id) || id <= 0) return;
    if (value != null && Number(value) === id) return;
    onChange(id);
  }

  return (
    <div className={cn("flex items-center gap-1.5 min-w-0", className)}>
      <span className="text-xs font-medium text-muted-foreground shrink-0">{t("filterPipeline")}</span>
      <SearchableSelect
        options={options}
        value={value != null ? String(value) : ""}
        onValueChange={handleChange}
        placeholder={t("filterPipeline")}
        searchPlaceholder={t("pipelineSearchPlaceholder")}
        triggerClassName="h-8 text-xs w-44 sm:w-56"
      />
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("pipelineSelectorHint")}
              className="text-muted-foreground/70 hover:text-foreground transition-colors shrink-0"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs font-normal">
            {t("pipelineSelectorHint")}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
