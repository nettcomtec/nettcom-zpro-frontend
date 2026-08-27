"use client";

import { ArrowRight, CircleAlert, Loader2, RotateCcw, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface PendingChangeEntry {
  key: string;
  /** rotulo traduzido da configuracao */
  label: string;
  /** valor anterior ja formatado para exibicao */
  from: string;
  /** valor novo ja formatado para exibicao */
  to: string;
}

export interface SettingsPendingBarProps {
  entries: PendingChangeEntry[];
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** strings ja traduzidas */
  labels: {
    /** ex.: "7 alteracoes nao salvas" — ja interpolado pelo pai */
    count: string;
    review: string;
    discard: string;
    save: string;
    saving: string;
    /** cabecalhos da tabela do popover */
    settingColumn: string;
    fromColumn: string;
    toColumn: string;
  };
}

export function SettingsPendingBar({
  entries,
  saving,
  onSave,
  onDiscard,
  labels,
}: SettingsPendingBarProps) {
  // Sem pendencias a barra nao ocupa espaco nenhum no fluxo da pagina.
  if (entries.length === 0) return null;

  const saveLabel = saving ? labels.saving : labels.save;

  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between gap-2 rounded-lg border border-border p-2 shadow-sm sm:gap-3 sm:px-3",
        // Fundo solido: a barra flutua por cima das linhas de configuracao ao rolar.
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <CircleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="truncate text-sm font-medium" title={labels.count}>
          {labels.count}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" title={labels.review}>
              <CircleAlert className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{labels.review}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-80 max-w-[calc(100vw-2rem)] p-3"
          >
            <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                {labels.settingColumn}
              </span>
              <Badge variant="secondary" className="shrink-0 px-2 py-0 text-[10px] tabular-nums">
                {entries.length}
              </Badge>
            </div>

            <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="min-w-0 flex-1 truncate" title={labels.fromColumn}>
                {labels.fromColumn}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate" title={labels.toColumn}>
                {labels.toColumn}
              </span>
            </div>

            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {entries.map((entry) => (
                <li key={entry.key} className="rounded-md px-1 py-1.5 hover:bg-muted/50">
                  <p
                    className="truncate text-xs font-medium text-foreground"
                    title={entry.label}
                  >
                    {entry.label}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                    <span
                      className="min-w-0 flex-1 truncate text-muted-foreground line-through"
                      title={entry.from}
                    >
                      {entry.from}
                    </span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span
                      className="min-w-0 flex-1 truncate font-medium text-foreground"
                      title={entry.to}
                    >
                      {entry.to}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          disabled={saving}
          title={labels.discard}
        >
          <RotateCcw className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">{labels.discard}</span>
        </Button>

        <Button size="sm" onClick={onSave} disabled={saving} title={saveLabel}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
          ) : (
            <Save className="h-4 w-4 sm:mr-2" />
          )}
          <span className="hidden sm:inline">{saveLabel}</span>
        </Button>
      </div>
    </div>
  );
}

export default SettingsPendingBar;
