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

// Link de avaliação do Google (configurado em Avaliações). Fica FORA da lista fixa e
// entra só por opção (`withGoogleReviewLink`), nos campos em que o backend resolve a
// variável (funil e fluxo). Nos seletores de template do agendamento, da automação do
// Instagram e da despedida ela não é resolvida — o parâmetro sairia vazio e a Meta
// recusaria o template.
export const GOOGLE_REVIEW_LINK_VARIABLE = {
  labelKey: "varGoogleReviewLink",
  hintKey: "varGoogleReviewLinkHint",
  value: "{{linkAvaliacaoGoogle}}",
} as const;

// Link de convite do WebChat (PLANO_WEBCHAT_LINK_CONVITE D9). Também fica FORA da lista fixa:
// entra só por opção (`withWebchatInviteLink`), no fluxo, e só quando o servidor entende a
// variável (availability) — senão o texto sairia com `{{linkWebchat}}` cru ou vazio.
export const WEBCHAT_INVITE_LINK_VARIABLE = {
  labelKey: "varWebchatInviteLink",
  value: "{{linkWebchat}}",
} as const;

export function VariablePickerButton({
  onInsert,
  className,
  withGoogleReviewLink,
  withWebchatInviteLink,
}: {
  onInsert: (v: string) => void;
  className?: string;
  withGoogleReviewLink?: boolean;
  withWebchatInviteLink?: boolean;
}) {
  const t = useTranslations("flowBuilderNodeForm");
  // Aviso curto do convite: o texto do alerta da tela do WebChat (mesma regra, D6).
  const tWebchat = useTranslations("webchatPage");
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
        {withGoogleReviewLink && (
          <>
            <div className="my-1 border-t" />
            <button
              type="button"
              className="w-full flex flex-col items-start gap-0.5 px-2 py-1.5 rounded text-xs text-left hover:bg-muted transition-colors"
              onClick={() => onInsert(GOOGLE_REVIEW_LINK_VARIABLE.value)}
            >
              <span>{t(GOOGLE_REVIEW_LINK_VARIABLE.labelKey)}</span>
              <code className="text-[10px] text-muted-foreground font-mono break-all">{GOOGLE_REVIEW_LINK_VARIABLE.value}</code>
              <span className="text-[10px] text-muted-foreground leading-snug">{t(GOOGLE_REVIEW_LINK_VARIABLE.hintKey)}</span>
            </button>
          </>
        )}
        {withWebchatInviteLink && (
          <>
            <div className="my-1 border-t" />
            <button
              type="button"
              className="w-full flex flex-col items-start gap-0.5 px-2 py-1.5 rounded text-xs text-left hover:bg-muted transition-colors"
              onClick={() => onInsert(WEBCHAT_INVITE_LINK_VARIABLE.value)}
            >
              <span>{t(WEBCHAT_INVITE_LINK_VARIABLE.labelKey)}</span>
              <code className="text-[10px] text-muted-foreground font-mono break-all">{WEBCHAT_INVITE_LINK_VARIABLE.value}</code>
              <span className="text-[10px] text-muted-foreground leading-snug">{tWebchat("inviteLinkAlertCloseFlow")}</span>
            </button>
          </>
        )}
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
  withGoogleReviewLink,
  withWebchatInviteLink,
}: {
  value: string;
  onChange: (val: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  /** Oferece também {{linkAvaliacaoGoogle}} (só onde o backend resolve: funil e fluxo). */
  withGoogleReviewLink?: boolean;
  /** Oferece também {{linkWebchat}} (só no fluxo e com o recurso disponível no servidor). */
  withWebchatInviteLink?: boolean;
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
      <VariablePickerButton
        onInsert={handleInsert}
        className="absolute right-1 top-1"
        withGoogleReviewLink={withGoogleReviewLink}
        withWebchatInviteLink={withWebchatInviteLink}
      />
    </div>
  );
}

export function InputWithVars({
  value,
  onChange,
  placeholder,
  maxLength,
  withGoogleReviewLink,
  withWebchatInviteLink,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
  /** Oferece também {{linkAvaliacaoGoogle}} (só onde o backend resolve: funil e fluxo). */
  withGoogleReviewLink?: boolean;
  /** Oferece também {{linkWebchat}} (só no fluxo e com o recurso disponível no servidor). */
  withWebchatInviteLink?: boolean;
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
      <VariablePickerButton
        onInsert={handleInsert}
        withGoogleReviewLink={withGoogleReviewLink}
        withWebchatInviteLink={withWebchatInviteLink}
      />
    </div>
  );
}
