"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PANEL_APP_ICON_KEYS, PANEL_APP_ICONS } from "@/lib/panel-apps";

/**
 * Grade da lista curada de ícones (D19). Cada botão tem o nome do ícone traduzido
 * (`panelAppForm.icons.<chave>`) para leitores de tela e ao passar o mouse. Setas do
 * teclado andam pela grade (padrão de grupo de opções: só o escolhido recebe Tab).
 */

export interface PanelAppIconPickerProps {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  /** Nome do campo, para leitores de tela. */
  label: string;
}

export function PanelAppIconPicker({ value, onChange, disabled, label }: PanelAppIconPickerProps) {
  const t = useTranslations("panelAppForm");
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = PANEL_APP_ICON_KEYS.indexOf(value);
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const moveTo = (index: number) => {
    const total = PANEL_APP_ICON_KEYS.length;
    const next = (index + total) % total;
    onChange(PANEL_APP_ICON_KEYS[next]);
    buttonsRef.current[next]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      moveTo(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      moveTo(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      moveTo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      moveTo(PANEL_APP_ICON_KEYS.length - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1.5"
    >
      {PANEL_APP_ICON_KEYS.map((key, index) => {
        const Icon = PANEL_APP_ICONS[key];
        const selected = value === key;
        const iconLabel = t(`icons.${key}`);
        return (
          <button
            key={key}
            ref={(el) => {
              buttonsRef.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={iconLabel}
            title={iconLabel}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(key)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "flex h-9 w-full items-center justify-center rounded-md border text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              "disabled:pointer-events-none disabled:opacity-50",
              selected && "border-primary bg-primary/10 text-primary ring-1 ring-primary"
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
