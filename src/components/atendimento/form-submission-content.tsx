"use client";

// Cartão "Formulário recebido" no atendimento (docs/PLANO_FORMULARIOS_ATENDIMENTO.md D4,
// §5.10). O backend grava a Message com mediaType "form_submission", fromMe false, o texto
// legível no body ("Formulário: <nome>" + linhas "*Rótulo:* valor") e as respostas em
// dataJson ({ kind: "form_submission", v: 1, formId, formName, submissionId,
// fields: [{ label, type, value }] }). Só a equipe vê: na bolha ele é de sistema (sem
// responder, reagir, encaminhar, fixar, estrelar nem apagar).
//
// O socket tira o dataJson acima de 16 KB do chat:create (SocketEmitZPRO,
// DATAJSON_EMIT_LIMIT) e o REST o devolve inteiro: sem ele, ou com JSON ilegível, as
// respostas saem do body, linha a linha. Só quando nem o body tem esse formato aparece o
// aviso, com o texto como veio.

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ClipboardList, HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLiveMode } from "@/hooks/use-live-mode";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Message } from "@/stores/ticket-store";

type FieldValue = string | number | boolean | string[] | null;

interface CardField {
  label: string;
  type: string;
  value: FieldValue;
}

interface CardView {
  name: string;
  fields: CardField[];
}

// Teto de exibição (o formulário aceita até 50 campos).
const MAX_FIELDS = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Linha do body: "*Rótulo:* valor" (FormRulesZPRO.buildFormAnswersText). Linha que não
// começa assim é continuação do valor anterior (texto longo com quebra de linha).
const BODY_FIELD_LINE = /^\*(.+?):\*(?: (.*))?$/;
const EMPTY = "—";

function toFieldValue(value: unknown): FieldValue {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string" || typeof item === "number")
      .map((item) => String(item));
  }
  return null;
}

function readFromDataJson(dataJson: unknown): CardView | null {
  let parsed: unknown = dataJson;
  if (typeof dataJson === "string") {
    const text = dataJson.trim();
    // Atalho barato antes do JSON.parse.
    if (!text.startsWith("{") || !text.includes("form_submission")) return null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;
  const list = data.fields;
  if (data.kind !== "form_submission" || !Array.isArray(list)) return null;
  const fields: CardField[] = [];
  for (const entry of list.slice(0, MAX_FIELDS)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const field = entry as Record<string, unknown>;
    fields.push({
      label: typeof field.label === "string" ? field.label.trim() : "",
      type: typeof field.type === "string" ? field.type : "",
      value: toFieldValue(field.value),
    });
  }
  return { name: typeof data.formName === "string" ? data.formName.trim() : "", fields };
}

function readFromBody(body: string | null | undefined): CardView | null {
  const lines = String(body || "").split("\n");
  if (lines.length < 2) return null;
  const head = lines[0];
  const separator = head.indexOf(": ");
  const fields: CardField[] = [];
  for (const line of lines.slice(1)) {
    const match = BODY_FIELD_LINE.exec(line);
    if (match) {
      if (fields.length >= MAX_FIELDS) break;
      fields.push({ label: match[1].trim(), type: "", value: match[2] ?? "" });
    } else if (fields.length > 0) {
      const last = fields[fields.length - 1];
      last.value = `${typeof last.value === "string" ? last.value : ""}\n${line}`;
    } else {
      return null;
    }
  }
  if (fields.length === 0) return null;
  return { name: separator > 0 ? head.slice(separator + 2).trim() : "", fields };
}

function formatFieldValue(field: CardField, yes: string, no: string): string {
  const { value } = field;
  if (typeof value === "boolean") return value ? yes : no;
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean).join(", ");
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (field.type === "date" && DATE_RE.test(text)) {
    // Meio-dia local: a data pura não pode escorregar um dia pelo fuso.
    const date = new Date(`${text}T12:00:00`);
    if (!Number.isNaN(date.getTime())) return formatDate(date);
  }
  return text;
}

// Popover e não Tooltip: o Tooltip não abre com toque (celular/PWA).
function FormSubmissionHelp() {
  const t = useTranslations("messageBubble");
  const text = t("formSubmission.help");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className="-my-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-violet-500/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="max-w-xs text-xs leading-relaxed">
        {text}
      </PopoverContent>
    </Popover>
  );
}

export function FormSubmissionContent({ msg }: { msg: Message }) {
  const t = useTranslations("messageBubble");
  const { isLiveMode } = useLiveMode();
  const view = useMemo(
    () => readFromDataJson(msg.dataJson) ?? readFromBody(msg.body),
    [msg.dataJson, msg.body]
  );

  const createdAt = msg.createdAt ? new Date(msg.createdAt) : null;
  const created = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null;
  const timeLabel = created ? formatTime(created, { hour: "2-digit", minute: "2-digit" }) : "";
  const dateLabel = created ? formatDate(created, { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const yes = t("formSubmission.yes");
  const no = t("formSubmission.no");

  return (
    <div className="w-96 max-w-full rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-left">
      <div className="flex items-start gap-1.5">
        <ClipboardList aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" />
        <p className="min-w-0 flex-1 text-xs font-medium text-violet-700 [overflow-wrap:anywhere] dark:text-violet-200">
          {view ? t("formSubmission.title", { name: view.name || EMPTY }) : t("formSubmission.invalid")}
        </p>
        {timeLabel && (
          <span
            className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground"
            title={dateLabel ? `${dateLabel} ${timeLabel}` : timeLabel}
          >
            {timeLabel}
          </span>
        )}
        <FormSubmissionHelp />
      </div>

      {view ? (
        view.fields.length > 0 ? (
          <dl className="mt-2 space-y-1.5">
            {view.fields.map((field, index) => {
              const value = formatFieldValue(field, yes, no);
              return (
                <div key={index} className="min-w-0">
                  <dt className="text-[11px] font-medium text-muted-foreground [overflow-wrap:anywhere]">
                    {field.label || EMPTY}
                  </dt>
                  <dd
                    className={cn(
                      "text-sm whitespace-pre-wrap [overflow-wrap:anywhere]",
                      !value && "text-muted-foreground",
                      isLiveMode && value && "live-blur-text"
                    )}
                  >
                    {value || EMPTY}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{EMPTY}</p>
        )
      ) : (
        msg.body && (
          <p
            className={cn(
              "mt-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]",
              isLiveMode && "live-blur-text"
            )}
          >
            {msg.body}
          </p>
        )
      )}
    </div>
  );
}

export default FormSubmissionContent;
