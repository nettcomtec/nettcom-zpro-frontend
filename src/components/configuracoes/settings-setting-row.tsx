"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Linha de configuração de /configuracoes/geral, extraída do corpo da página.
 *
 * IMPORTANTE — `checked` chega PRONTO por prop, de propósito. O cálculo do estado
 * ligado/desligado mora no `isEnabled` da página, que tem defaults especiais: sem
 * registro no banco, `hidePaymentsFromUsers` e `youtubeCommentsCreateTickets` valem
 * TRUE (conformidade LGPD desde o primeiro acesso). Reimplementar ou copiar essa
 * regra aqui criaria uma segunda fonte de verdade que sairia de sincronia em
 * silêncio — o toggle apareceria desligado e pagamentos vazariam para o usuário
 * comum. Este módulo não conhece chaves de setting: só renderiza o que recebe.
 */

/**
 * Contexto com o que é AMBIENTE da página (como calcular o estado ligado, como
 * alternar, qual chave está destacada, se está em modo compacto).
 *
 * Existe para que os ~61 call-sites continuem escritos exatamente como antes
 * (`<SettingRow settingKey="x" label=... description=... />`), sem precisar
 * repetir `checked`/`onCheckedChange`/`highlighted` em cada um — reescrever 61
 * chamadas à mão seria a via mais provável de introduzir uma regressão silenciosa.
 *
 * `isEnabled` continua sendo a função da PÁGINA, passada aqui por referência.
 * Este módulo nunca reimplementa a regra (ver nota de LGPD acima).
 */
export interface SettingRowContextValue {
  isEnabled: (settingKey: string) => boolean;
  onToggle: (settingKey: string, checked: boolean) => void;
  highlightedKey: string | null;
  compact: boolean;
}

const SettingRowContext = React.createContext<SettingRowContextValue | null>(null);
export const SettingRowProvider = SettingRowContext.Provider;

export interface SettingToggleProps {
  settingKey: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (settingKey: string, checked: boolean) => void;
}

export interface SettingRowProps {
  settingKey?: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** obrigatório quando settingKey existe e children não é passado */
  checked?: boolean;
  highlighted?: boolean;
  onCheckedChange?: (settingKey: string, checked: boolean) => void;
  /** modo compacto: esconde a description. Default false = comportamento de hoje. */
  compact?: boolean;
  /** nota contextual renderizada DENTRO da linha, abaixo da description */
  hint?: React.ReactNode;
  /** chips de tema renderizados ao lado do label */
  tags?: React.ReactNode;
  children?: React.ReactNode;
}

const SettingToggleBase = ({
  settingKey,
  checked,
  disabled,
  onCheckedChange,
}: SettingToggleProps) => {
  // A chave volta junto no callback para o pai reaproveitar o handleToggle(key, checked).
  const handleCheckedChange = React.useCallback(
    (next: boolean) => onCheckedChange(settingKey, next),
    [settingKey, onCheckedChange]
  );

  return (
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={handleCheckedChange}
    />
  );
};

export const SettingToggle = React.memo(SettingToggleBase);
SettingToggle.displayName = "SettingToggle";

const ROW_CLASS =
  "flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0 rounded-sm transition-colors duration-500";
const ROW_HIGHLIGHT_CLASS = "bg-yellow-100/70 dark:bg-yellow-800/25";

/** Fallback estável: mantém o switch visível mesmo sem handler, sem quebrar o memo. */
const noop = (): void => {};

const SettingRowBase = ({
  settingKey,
  label,
  description,
  disabled,
  checked,
  highlighted,
  onCheckedChange,
  compact,
  hint,
  tags,
  children,
}: SettingRowProps) => {
  // Mesma regra do markup original: linha com chave e sem children é linha de switch.
  const showToggle = Boolean(settingKey) && children === undefined;

  // Props explícitas sempre vencem o contexto; o contexto é só o preenchimento
  // automático para os call-sites que não passam nada.
  const ctx = React.useContext(SettingRowContext);
  const resolvedChecked =
    checked ?? (settingKey && ctx ? ctx.isEnabled(settingKey) : false);
  const resolvedHighlighted =
    highlighted ?? (settingKey && ctx ? ctx.highlightedKey === settingKey : false);
  const resolvedCompact = compact ?? ctx?.compact ?? false;
  const resolvedOnCheckedChange = onCheckedChange ?? ctx?.onToggle ?? noop;

  return (
    <div
      id={settingKey ? `row-${settingKey}` : undefined}
      className={cn(ROW_CLASS, resolvedHighlighted === true && ROW_HIGHLIGHT_CLASS)}
    >
      <div className="flex-1 min-w-0 pr-2 sm:pr-4">
        <Label className="text-sm font-medium break-words">{label}</Label>
        {tags ? (
          <span className="inline-flex flex-wrap gap-1 ml-2 align-middle">{tags}</span>
        ) : null}
        {!resolvedCompact && description ? (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">{description}</p>
        ) : null}
        {hint ? (
          <div className="text-xs text-muted-foreground mt-1.5 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50 whitespace-pre-line">
            {hint}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">
        {showToggle && settingKey ? (
          <SettingToggle
            settingKey={settingKey}
            checked={resolvedChecked}
            disabled={disabled}
            onCheckedChange={resolvedOnCheckedChange}
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export const SettingRow = React.memo(SettingRowBase);
SettingRow.displayName = "SettingRow";
