"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EmailAlign } from "@/lib/email-design";
import { useLatest } from "./editor-shared";

/**
 * Campos do painel de propriedades. Regra comum: o design só recebe valor que o schema
 * aceita (cor hex, inteiro na faixa, link com esquema) — o rascunho do que está sendo
 * digitado fica no campo. Assim o projeto salvo/exportado/rascunhado nunca fica inválido.
 */

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

interface IconActionProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  /** Botão de alternância (negrito, alinhamento…) */
  active?: boolean;
  className?: string;
}

export function IconAction({ label, onClick, children, disabled, active, className }: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon-xs"
          aria-label={label}
          aria-pressed={active === undefined ? undefined : active}
          disabled={disabled}
          onClick={onClick}
          className={className}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function AlignButtons({ value, onChange }: { value: EmailAlign; onChange: (align: EmailAlign) => void }) {
  const tm = useTranslations("emailMarketingPage");
  const options: Array<{ align: EmailAlign; label: string; icon: ReactNode }> = [
    { align: "left", label: tm("editorAlignLeft"), icon: <AlignLeft aria-hidden /> },
    { align: "center", label: tm("editorAlignCenter"), icon: <AlignCenter aria-hidden /> },
    { align: "right", label: tm("editorAlignRight"), icon: <AlignRight aria-hidden /> },
  ];
  return (
    <div className="flex items-center gap-0.5" role="group">
      {options.map(option => (
        <IconAction
          key={option.align}
          label={option.label}
          active={value === option.align}
          onClick={() => {
            if (value !== option.align) onChange(option.align);
          }}
        >
          {option.icon}
        </IconAction>
      ))}
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (draft.trim().toLowerCase() !== value.toLowerCase()) setDraft(value);
  }

  const apply = (raw: string) => {
    setDraft(raw);
    const next = raw.trim().toLowerCase();
    if (HEX_COLOR.test(next) && next !== value.toLowerCase()) onChange(next);
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={label}
          value={HEX_COLOR.test(value) ? value.toLowerCase() : "#000000"}
          onChange={e => apply(e.target.value)}
          className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
        />
        <Input
          id={id}
          value={draft}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          onChange={e => apply(e.target.value)}
          onBlur={() => {
            if (!HEX_COLOR.test(draft.trim())) setDraft(value);
          }}
          className="h-8 min-w-0 px-2 font-mono text-xs"
        />
      </div>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export function NumberField({ label, value, min, max, step = 1, onChange }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (Number(draft) !== value || draft.trim() === "") setDraft(String(value));
  }

  const parse = (raw: string): number | null => {
    const text = raw.trim();
    if (!/^\d{1,4}$/.test(text)) return null;
    const parsed = Number(text);
    return parsed >= min && parsed <= max ? parsed : null;
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={e => {
          setDraft(e.target.value);
          const parsed = parse(e.target.value);
          if (parsed !== null && parsed !== value) onChange(parsed);
        }}
        onBlur={() => {
          if (parse(draft) !== null) return;
          const raw = Number(draft);
          if (draft.trim() === "" || !Number.isFinite(raw)) {
            setDraft(String(value));
            return;
          }
          // Fora da faixa: prende no limite em vez de descartar o que foi digitado
          const clamped = Math.min(max, Math.max(min, Math.round(raw)));
          setDraft(String(clamped));
          if (clamped !== value) onChange(clamped);
        }}
        className="h-8"
      />
    </div>
  );
}

interface ValidatedTextFieldProps {
  label: string;
  /** Valor gravado no design: vazio ou válido */
  value: string;
  isValid: (candidate: string) => boolean;
  /** Recebe o valor válido (aparado) ou "" enquanto o que foi digitado não vale */
  onChange: (committed: string) => void;
  errorText?: string;
  placeholder?: string;
  maxLength?: number;
  /** Ao sair do campo, "site.com.br" vira "https://site.com.br" */
  autoPrefixHttps?: boolean;
  /** Registra o campo como alvo do menu de variáveis */
  onFieldFocus?: (el: HTMLInputElement, apply: (next: string) => void) => void;
}

/**
 * Link/endereço de imagem. Enquanto o texto não é um link válido o design fica com ""
 * (o bloco aparece como pendente e o salvar bloqueia) — nunca com o link antigo, que
 * seria salvo em silêncio no lugar do que está na tela.
 */
export function ValidatedTextField({
  label,
  value,
  isValid,
  onChange,
  errorText,
  placeholder,
  maxLength = 2048,
  autoPrefixHttps,
  onFieldFocus,
}: ValidatedTextFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);

  const committedFor = (raw: string): string => {
    const text = raw.trim();
    return text && isValid(text) ? text : "";
  };

  if (prevValue !== value) {
    setPrevValue(value);
    if (committedFor(draft) !== value) setDraft(value);
  }

  const apply = (raw: string) => {
    setDraft(raw);
    const next = committedFor(raw);
    if (next !== value) onChange(next);
  };
  const applyRef = useLatest(apply);

  const invalid = draft.trim() !== "" && committedFor(draft) === "";

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={e => apply(e.target.value)}
        onFocus={e => onFieldFocus?.(e.currentTarget, next => applyRef.current(next))}
        onBlur={() => {
          if (!autoPrefixHttps || !invalid) return;
          const text = draft.trim();
          if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return;
          const candidate = `https://${text}`;
          if (isValid(candidate)) apply(candidate);
        }}
        className={cn("h-8 text-sm", invalid && "border-destructive focus-visible:border-destructive")}
      />
      {invalid && errorText ? <p className="text-xs text-destructive">{errorText}</p> : null}
    </div>
  );
}
