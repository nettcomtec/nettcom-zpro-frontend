"use client";

import React, { useRef } from "react";
import { useTranslations } from "next-intl";
import { Variable } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Variaveis dinamicas substituidas no backend (pupa). Lista unica compartilhada
// entre o ChatFlow (flow-builder) e as acoes do funil, para manter os dois em
// sincronia. Labels via namespace i18n "flowBuilderNodeForm" (ja traduzido em
// todos os locales).
export const FLOW_VARIABLES = [
  { labelKey: "varName",         value: "{{name}}" },
  { labelKey: "varGreeting",     value: "{{greeting}}" },
  { labelKey: "varProtocol",     value: "{{protocol}}" },
  { labelKey: "varEmail",        value: "{{email}}" },
  { labelKey: "varPhoneNumber",  value: "{{phoneNumber}}" },
  { labelKey: "varKanban",       value: "{{kanban}}" },
  { labelKey: "varUser",         value: "{{user}}" },
  { labelKey: "varUserEmail",    value: "{{userEmail}}" },
  { labelKey: "varFirstName",    value: "{{firstName}}" },
  { labelKey: "varLastName",     value: "{{lastName}}" },
  { labelKey: "varBusinessName", value: "{{businessName}}" },
] as const;

export function VariablePickerButton({
  onInsert,
  className,
}: {
  onInsert: (v: string) => void;
  className?: string;
}) {
  const t = useTranslations("flowBuilderNodeForm");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("insertVariable")}
          className={`rounded p-1 hover:bg-muted text-muted-foreground transition-colors${className ? ` ${className}` : ""}`}
        >
          <Variable className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" side="top" align="end">
        <p className="text-xs font-medium text-muted-foreground px-2 py-1">{t("insertVariable")}</p>
        {FLOW_VARIABLES.map((v) => (
          <button
            key={v.value}
            type="button"
            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors"
            onClick={() => onInsert(v.value)}
          >
            <span>{t(v.labelKey)}</span>
            <code className="text-[10px] text-muted-foreground font-mono">{v.value}</code>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function TextareaWithVars({
  value,
  onChange,
  rows,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (val: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorRef = useRef<number>(0);

  const saveCursor = () => {
    if (textareaRef.current) cursorRef.current = textareaRef.current.selectionStart ?? value.length;
  };

  const handleInsert = (variable: string) => {
    const pos = cursorRef.current;
    const newValue = value.slice(0, pos) + variable + value.slice(pos);
    onChange(newValue);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos + variable.length, pos + variable.length);
      cursorRef.current = pos + variable.length;
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        className="w-full rounded-md border bg-background p-2 text-sm resize-y pr-8"
        rows={rows ?? 3}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSelect={saveCursor}
        onBlur={saveCursor}
        onKeyUp={saveCursor}
        onClick={saveCursor}
      />
      <VariablePickerButton onInsert={handleInsert} className="absolute right-1 top-1" />
    </div>
  );
}

export function InputWithVars({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number>(0);

  const saveCursor = () => {
    if (inputRef.current) cursorRef.current = inputRef.current.selectionStart ?? value.length;
  };

  const handleInsert = (variable: string) => {
    const pos = cursorRef.current;
    const newValue = value.slice(0, pos) + variable + value.slice(pos);
    onChange(newValue);
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(pos + variable.length, pos + variable.length);
      cursorRef.current = pos + variable.length;
    });
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="flex-1"
        onSelect={saveCursor}
        onBlur={saveCursor}
        onKeyUp={saveCursor}
        onClick={saveCursor}
      />
      <VariablePickerButton onInsert={handleInsert} />
    </div>
  );
}
