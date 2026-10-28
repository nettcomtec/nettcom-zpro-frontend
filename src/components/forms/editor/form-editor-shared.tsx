"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  AlignLeft, CalendarDays, EyeOff, Hash, Info, List, ListChecks, Mail, Phone, SquareCheck, Type,
  type LucideIcon,
} from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PageHelpProps } from "@/components/layout/page-help";
import { CHANNEL_TYPES } from "@/lib/channel-types";
import { cn } from "@/lib/utils";
import {
  FORM_ERROR_CODES,
  type FormAnswer,
  type FormField,
  type FormFieldType,
  type PublicFormField,
} from "@/lib/forms";

// Peças comuns da tela de gestão dos formulários (lista, editor, compartilhar e respostas).

// ── Opções carregadas pela tela ──────────────────────────────────────────────
export interface FormChannelOption {
  id: number;
  name: string;
  type: string;
  status: string;
  tokenAPI?: string;
}

export interface FormNamedOption {
  id: number;
  name: string;
}

export interface FormFlowOption extends FormNamedOption {
  isActive: boolean;
}

export interface FormStageOption extends FormNamedOption {
  pipelineId: number;
}

// ── Campo em edição: id estável na tela (a chave pode mudar antes do 1º salvamento) ──
export type EditorField = FormField & { _uid: string };

let uidSeq = 0;
export const makeFieldUid = (): string => {
  uidSeq += 1;
  return `u${Date.now().toString(36)}${uidSeq.toString(36)}`;
};

export const toEditorFields = (fields: FormField[]): EditorField[] =>
  fields.map((field) => ({ ...field, _uid: makeFieldUid() }));

export const fromEditorFields = (fields: EditorField[]): FormField[] =>
  fields.map((field) => {
    const copy: Partial<EditorField> = { ...field };
    delete copy._uid;
    return copy as FormField;
  });

// Mesmo recorte do toPublicFields do backend (sem fila/etiquetas das opções e sem o nome
// do campo personalizado). Rótulo vazio aparece com o texto de "sem rótulo" só na prévia.
export const toPreviewFields = (
  fields: FormField[],
  labels: { untitled: string; optionUntitled: string }
): PublicFormField[] =>
  fields.map((field) => {
    const view: PublicFormField = {
      key: field.key,
      type: field.type,
      label: field.label.trim() || labels.untitled,
      required: field.type === "hidden" ? false : field.required,
    };
    if (field.placeholder && field.type !== "hidden" && field.type !== "checkbox") view.placeholder = field.placeholder;
    if (field.helpText && field.type !== "hidden") view.helpText = field.helpText;
    if (field.width === "half") view.width = "half";
    if ((field.type === "select" || field.type === "multiselect") && field.options) {
      view.options = field.options.map((option) => ({
        id: option.id,
        label: option.label.trim() || labels.optionUntitled,
      }));
    }
    if (field.type === "number") {
      if (typeof field.min === "number") view.min = field.min;
      if (typeof field.max === "number") view.max = field.max;
    }
    if ((field.type === "text" || field.type === "textarea") && field.maxLength) view.maxLength = field.maxLength;
    if (field.type === "checkbox" && field.checkboxText) view.checkboxText = field.checkboxText;
    if (field.type === "hidden") {
      if (field.hiddenParam) view.hiddenParam = field.hiddenParam;
      if (field.hiddenDefault) view.hiddenDefault = field.hiddenDefault;
    }
    if (field.mapTo.kind === "contact" && field.mapTo.field === "number") view.identity = "phone";
    if (field.mapTo.kind === "contact" && field.mapTo.field === "email") view.identity = "email";
    return view;
  });

// ── Tipos de campo ───────────────────────────────────────────────────────────
export const FORM_FIELD_TYPE_ICONS: Record<FormFieldType, LucideIcon> = {
  text: Type,
  textarea: AlignLeft,
  email: Mail,
  phone: Phone,
  number: Hash,
  date: CalendarDays,
  select: List,
  multiselect: ListChecks,
  checkbox: SquareCheck,
  hidden: EyeOff,
};

// ── Validações simples da tela (o backend repete) ────────────────────────────
export const FIELD_KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;
export const HIDDEN_PARAM_RE = /^[A-Za-z0-9_]{1,40}$/;

export const isHexColor = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

export const isHttpsUrl = (value: string): boolean => {
  const raw = value.trim();
  if (!raw) return false;
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
};

// Imagem da galeria pode vir com endereço relativo; a página pública (outra origem)
// precisa do endereço completo (mesma regra do Agendamento Público).
export function toAbsoluteUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

// Variável do template sem valor vira parâmetro vazio, e a Meta recusa o envio inteiro.
export function hasEmptyTemplateVar(json: string | null): boolean {
  if (!json) return false;
  try {
    const parsed = JSON.parse(json);
    const vars = Array.isArray(parsed?.templateVars) ? parsed.templateVars : [];
    return vars.some((v: { value?: unknown }) => !String(v?.value ?? "").trim());
  } catch {
    return false;
  }
}

export function randomSlugSuffix(size = 6): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(size);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < size; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < size; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// ── Erros do backend ─────────────────────────────────────────────────────────
const KNOWN_ERRORS = new Set<string>(FORM_ERROR_CODES);

export const isKnownFormError = (code: string): boolean => KNOWN_ERRORS.has(code);

/** Chave i18n (namespace formsPage) do erro; código desconhecido = genérico. */
export const formErrorKey = (code: string): string =>
  KNOWN_ERRORS.has(code) ? `errors.${code}` : "errors.generic";

// ── Respostas ────────────────────────────────────────────────────────────────
export const formatAnswerValue = (answer: FormAnswer, yes: string, no: string): string => {
  if (typeof answer.v === "boolean") return answer.v ? yes : no;
  if (Array.isArray(answer.v)) return answer.v.join(", ");
  return String(answer.v ?? "");
};

// ── Área de transferência ────────────────────────────────────────────────────
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // cai no modo antigo abaixo
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Copia e marca "copiado" por 2 s no item `id` (troca o ícone do botão). */
export function useCopyFeedback() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );
  const copy = useCallback(async (id: string, text: string): Promise<boolean> => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedId(id);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedId(null), 2000);
    }
    return ok;
  }, []);
  return { copiedId, copy };
}

// ── Explicação curta (abre no toque/clique: tooltip do Radix não abre no celular) ──
export function InfoHint({ text, className }: { text: string; className?: string }) {
  const t = useTranslations("formsPage");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("moreInfo")}
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            className
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-3 text-xs leading-relaxed text-muted-foreground">
        {text}
      </PopoverContent>
    </Popover>
  );
}

/** Nota curta embaixo de uma opção. `tone` muda a cor (aviso/erro). */
export function FieldNote({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "warning" | "error";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs leading-snug",
        tone === "muted" && "text-muted-foreground",
        tone === "warning" && "text-amber-700 dark:text-amber-400",
        tone === "error" && "text-destructive",
        className
      )}
    >
      {children}
    </p>
  );
}

/** Caixa de aviso (amarela) ou informação (azul) com ícone. */
export function NoticeBox({
  icon: Icon,
  tone = "info",
  children,
  className,
}: {
  icon: LucideIcon;
  tone?: "info" | "warning" | "error";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-xs leading-relaxed",
        tone === "info" && "border-info/30 bg-info/10 text-foreground",
        tone === "warning" && "border-amber-500/40 bg-amber-500/10 text-foreground",
        tone === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
        className
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "info" && "text-info",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "error" && "text-destructive"
        )}
      />
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
    </div>
  );
}

// ── Nome do tipo de canal (rótulos já traduzidos no namespace tenantsPage) ──────
export function useChannelTypeLabel() {
  const tTenants = useTranslations("tenantsPage");
  return useCallback(
    (type: string): string => {
      const value = String(type || "").trim().toLowerCase();
      const entry = CHANNEL_TYPES.find((c) => c.value === value);
      return entry ? tTenants(entry.labelKey) : value;
    },
    [tTenants]
  );
}

// ── Ajuda da página (a mesma na lista e no editor, em todos os estados) ───────
export function useFormsPageHelp(): PageHelpProps {
  const t = useTranslations("formsPage");
  return {
    description: t("help.description"),
    sections: [
      { title: t("help.whatTitle"), items: [t("help.what1"), t("help.what2"), t("help.what3")] },
      { title: t("help.publishTitle"), items: [t("help.publish1"), t("help.publish2"), t("help.publish3")] },
      {
        title: t("help.submitTitle"),
        items: [t("help.submit1"), t("help.submit2"), t("help.submit3"), t("help.submit4")],
      },
      { title: t("help.careTitle"), items: [t("help.care1"), t("help.care2"), t("help.care3"), t("help.care4")] },
    ],
  };
}
