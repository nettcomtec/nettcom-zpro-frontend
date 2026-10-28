"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Variable } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  panelAppVariablesForScope,
  type PanelAppScope,
  type PanelAppUrlVariableGroup,
  type PanelAppUrlVariableName,
} from "@/lib/panel-apps";

/**
 * Seletor de variáveis do ENDEREÇO de um aplicativo personalizado (fase 2,
 * docs/PLANO_APLICATIVOS_PERSONALIZADOS_FASE2.md §5.9 e D9). Lista própria, filtrada pelo
 * escopo (D4: app global só com quem abre, a empresa e a ficha); o `variable-picker.tsx`
 * compartilhado é o do fluxo e não muda (lá `{{user}}` é o DONO do atendimento).
 *
 * - A lista abre EMBAIXO do campo, dentro do formulário (sem portal), como a seleção
 *   múltipla: dentro do Dialog a rolagem e o foco funcionam sem truque e, no celular, a
 *   lista não fica por cima do teclado.
 * - Cada variável diz se pode ir no caminho do endereço ou só depois do primeiro `?`/`#`
 *   (`pathSafe`, a mesma regra do servidor — regra (b) do `checkPanelAppTemplate`).
 * - Quem insere no cursor do campo é o diálogo (`onInsert`); a lista continua aberta para
 *   inserir mais de uma.
 */

const GROUP_ORDER: readonly PanelAppUrlVariableGroup[] = ["contact", "ticket", "user", "tenant", "token"];

/** Texto que entra no endereço para a variável (nunca traduzido). */
export const panelAppVariableText = (name: PanelAppUrlVariableName): string => `{{${name}}}`;

export interface PanelAppVariablePickerProps {
  scope: PanelAppScope;
  onInsert: (name: PanelAppUrlVariableName) => void;
  disabled?: boolean;
}

export function PanelAppVariablePicker({ scope, onInsert, disabled }: PanelAppVariablePickerProps) {
  const t = useTranslations("panelAppForm");
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const groups = useMemo(() => {
    const vars = panelAppVariablesForScope(scope);
    return GROUP_ORDER.map((group) => ({ group, items: vars.filter((v) => v.group === group) })).filter(
      (g) => g.items.length > 0
    );
  }, [scope]);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open && !disabled}
        aria-controls={panelId}
      >
        {open && !disabled ? <Check className="h-3.5 w-3.5" /> : <Variable className="h-3.5 w-3.5" />}
        {open && !disabled ? t("done") : t("varsToggle")}
      </Button>

      {open && !disabled && (
        <div id={panelId} className="space-y-2.5 rounded-md border bg-background p-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t("varsIntro")}</p>
          {scope === "global" && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t("varsGlobalOnly")}</p>
          )}

          <div className="max-h-72 space-y-3 overflow-y-auto overscroll-contain pr-1">
            {groups.map(({ group, items }) => {
              const headingId = `${panelId}-${group}`;
              return (
                <div key={group} role="group" aria-labelledby={headingId} className="space-y-1.5">
                  <div className="space-y-0.5">
                    <p id={headingId} className="text-xs font-semibold">
                      {t(`varGroups.${group}`)}
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{t(`varGroupHints.${group}`)}</p>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {items.map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        onClick={() => onInsert(v.name)}
                        className={cn(
                          "flex min-w-0 flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                          "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        )}
                      >
                        <span className="w-full truncate text-xs font-medium">{t(`vars.${v.name}`)}</span>
                        <code className="w-full break-all font-mono text-[10px] text-muted-foreground">
                          {panelAppVariableText(v.name)}
                        </code>
                        <span
                          className={cn(
                            "text-[10px] leading-snug",
                            v.pathSafe ? "text-muted-foreground" : "text-warning"
                          )}
                        >
                          {v.pathSafe ? t("varsWhereAnywhere") : t("varsWhereQueryOnly")}
                        </span>
                        {v.name === "token" && (
                          <span className="text-[10px] leading-snug text-muted-foreground">{t("varTokenHint")}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
