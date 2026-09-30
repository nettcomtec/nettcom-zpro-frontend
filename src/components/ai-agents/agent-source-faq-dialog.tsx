"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Braces, FileText, ListChecks, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import { detectBulkDelimiter, parseDelimitedRows } from "@/lib/bulk-csv-parser";
import { createAiAgentFaqSource, type AiAgentFaqItem } from "@/services/ai-agents";
import { aiAgentErrorKey } from "./agent-error";

interface AgentSourceFaqDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: number;
  onCreated: () => void;
}

// Teto do servidor: mais que isso é recusado — cortar aqui e avisar quantas
// linhas entram, em vez de deixar o envio falhar inteiro
const MAX_FAQ_ITEMS = 1000;
const PREVIEW_LIMIT = 10;

// Cabeçalho provável: 1ª linha cujas duas primeiras células são rótulos
// conhecidos (nunca conteúdo real de pergunta/resposta)
const HEADER_WORDS =
  /^(pergunta|perguntas|question|questions|q|p|resposta|respostas|answer|answers|a|r)$/i;

// Teto SÓ para JSON (arquivo .json ou colagem com cara de JSON) — o mesmo
// dos documentos da base. CSV/TXT seguem sem teto na tela, como sempre foram
// (o servidor aceita FAQ bem maior): um teto aqui recusaria export de
// helpdesk que hoje importa.
const MAX_FAQ_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_FAQ_INPUT_LABEL = "10MB";
const TOO_LARGE_TOAST_ID = "ai-agent-faq-too-large";

// FAQ em JSON é só daqui: o servidor recebe os mesmos pares do CSV. Chaves
// sem diferenciar maiúsculas/minúsculas; a ordem é a prioridade quando o item
// traz mais de uma
const JSON_QUESTION_KEYS = ["question", "pergunta", "q", "pregunta"];
const JSON_ANSWER_KEYS = ["answer", "resposta", "a", "respuesta"];
const JSON_LIST_KEYS = ["items", "faq"];
// Cara de JSON para o aviso de erro: "[" ou "{" sozinhos não bastam, porque
// CSV colado começando com "[Promo] ..." segue sendo CSV
const LOOKS_LIKE_JSON = /^(\[\s*\{|\{\s*")/;

type FaqInputParse =
  | { mode: "json"; items: AiAgentFaqItem[] }
  // Arquivo .json, ou texto com CARA de JSON, que não rendeu nenhum par: erro,
  // sem cair no CSV
  | { mode: "jsonInvalid" }
  | { mode: "csv"; rows: string[][]; looksLikeJson: boolean };

// Chave aparada e minúscula → valor. Map (e não objeto) para "__proto__" e
// afins serem só mais uma chave
const lowerCaseKeys = (value: object): Map<string, unknown> => {
  const map = new Map<string, unknown>();
  for (const [key, field] of Object.entries(value)) {
    const lower = key.trim().toLowerCase();
    if (!map.has(lower)) map.set(lower, field);
  }
  return map;
};

// String aparada ou número; objeto, array, booleano e null nunca viram
// pergunta nem resposta
const jsonText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const pickJsonText = (fields: Map<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const text = jsonText(fields.get(key));
    if (text) return text;
  }
  return "";
};

// Array de objetos, {items:[…]} ou {faq:[…]}. null = não é FAQ em JSON
// (sintaxe ou forma); item sem pergunta E resposta é descartado
const parseFaqJson = (text: string): AiAgentFaqItem[] | null => {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  let entries: unknown = root;
  if (root && typeof root === "object" && !Array.isArray(root)) {
    const wrapper = lowerCaseKeys(root);
    entries = JSON_LIST_KEYS.map(key => wrapper.get(key)).find(value => Array.isArray(value));
  }
  if (!Array.isArray(entries)) return null;
  const items: AiAgentFaqItem[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const fields = lowerCaseKeys(entry);
    const question = pickJsonText(fields, JSON_QUESTION_KEYS);
    const answer = pickJsonText(fields, JSON_ANSWER_KEYS);
    if (question && answer) items.push({ question, answer });
  }
  return items.length > 0 ? items : null;
};

// Um parse por mudança de texto (arquivo ou colado). JSON antes do CSV quando
// o texto começa com "[" ou "{" (ou o arquivo é .json); sem FAQ no JSON, segue
// o CSV de sempre, exceto no .json e no texto com cara de JSON ("[{" / "{\""),
// que viram erro — JSON quebrado de UMA linha (vírgula sobrando, objeto sem a
// lista) caía no CSV e virava 1 item sem sentido com o botão ativo. "[Promo] …"
// não casa com a cara de JSON e continua CSV.
const parseFaqInput = (raw: string, fileName?: string): FaqInputParse => {
  const text = raw.trim();
  const isJsonFile = /\.json$/i.test(fileName || "");
  if (isJsonFile || text.startsWith("[") || text.startsWith("{")) {
    const items = text ? parseFaqJson(text) : null;
    if (items) return { mode: "json", items };
    if (isJsonFile || LOOKS_LIKE_JSON.test(text)) return { mode: "jsonInvalid" };
  }
  if (!text) return { mode: "csv", rows: [], looksLikeJson: false };
  return {
    mode: "csv",
    rows: parseDelimitedRows(raw, detectBulkDelimiter(raw)),
    looksLikeJson: LOOKS_LIKE_JSON.test(text),
  };
};

export function AgentSourceFaqDialog({
  open,
  onOpenChange,
  agentId,
  onCreated,
}: AgentSourceFaqDialogProps) {
  const t = useTranslations("aiAgents");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [headerChecked, setHeaderChecked] = useState(false);
  const [headerTouched, setHeaderTouched] = useState(false);
  const [faqName, setFaqName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFileName("");
    setRawText("");
    setHeaderChecked(false);
    setHeaderTouched(false);
    setFaqName("");
    setSaving(false);
  }, [open]);

  const parsed = useMemo(() => parseFaqInput(rawText, fileName), [rawText, fileName]);
  const isJsonMode = parsed.mode === "json";

  const headerAuto = useMemo(() => {
    if (parsed.mode !== "csv" || parsed.rows.length < 2) return false;
    const first = parsed.rows[0] || [];
    return HEADER_WORDS.test(first[0] || "") || HEADER_WORDS.test(first[1] || "");
  }, [parsed]);

  useEffect(() => {
    if (!headerTouched) setHeaderChecked(headerAuto);
  }, [headerAuto, headerTouched]);

  // CSV: convenção fixa coluna 1 = pergunta, coluna 2 = resposta. JSON: os
  // pares já vêm prontos e o cabeçalho não se aplica
  const allItems = useMemo<AiAgentFaqItem[]>(() => {
    if (parsed.mode === "json") return parsed.items;
    if (parsed.mode !== "csv") return [];
    const dataRows = headerChecked ? parsed.rows.slice(1) : parsed.rows;
    return dataRows
      .map(fields => ({
        question: (fields[0] || "").trim(),
        answer: (fields[1] || "").trim(),
      }))
      .filter(item => item.question && item.answer);
  }, [parsed, headerChecked]);

  const items = useMemo(() => allItems.slice(0, MAX_FAQ_ITEMS), [allItems]);
  const truncated = allItems.length > items.length;
  // Aviso de JSON inválido só com arquivo .json, ou quando o CSV não rendeu
  // nada e o texto tem cara de JSON
  const jsonInvalid =
    parsed.mode === "jsonInvalid" ||
    (parsed.mode === "csv" && parsed.looksLikeJson && allItems.length === 0);

  const notifyTooLarge = () => {
    toast.error(t("faqTooLarge", { max: MAX_FAQ_INPUT_LABEL }), { id: TOO_LARGE_TOAST_ID });
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (/\.json$/i.test(file.name) && file.size > MAX_FAQ_INPUT_BYTES) {
      notifyTooLarge();
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      setFileName(file.name);
      setHeaderTouched(false);
      setRawText(String(ev.target?.result ?? ""));
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleImport = async () => {
    if (items.length === 0) return;
    setSaving(true);
    try {
      await createAiAgentFaqSource(agentId, {
        name: faqName.trim() || null,
        items,
      });
      toast.success(t("sourceAdded"));
      onOpenChange(false);
      onCreated();
    } catch (err: unknown) {
      const key = aiAgentErrorKey(err);
      toast.error(key ? t(key) : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const previewItems = items.slice(0, PREVIEW_LIMIT);

  return (
    <Dialog open={open} onOpenChange={o => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            {t("faqDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("faqColumnsNote")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.json"
              className="hidden"
              onChange={handleFile}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5"
              >
                <Upload className="h-4 w-4" />
                {t("faqChooseFile")}
              </Button>
              {fileName && (
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{fileName}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("faqFileHint")}</p>
            <p className="text-xs text-muted-foreground">{t("faqJsonHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-agent-faq-paste">{t("faqOrPaste")}</Label>
            <Textarea
              id="ai-agent-faq-paste"
              rows={4}
              value={rawText}
              onPaste={e => {
                // JSON grande demais é recusado antes de o navegador inserir
                // (dezenas de MB no campo já travariam a aba). CSV colado segue
                // como sempre foi.
                const pasted = e.clipboardData.getData("text");
                if (
                  pasted.length > MAX_FAQ_INPUT_BYTES &&
                  LOOKS_LIKE_JSON.test(pasted.trimStart())
                ) {
                  e.preventDefault();
                  notifyTooLarge();
                }
              }}
              onChange={e => {
                if (
                  e.target.value.length > MAX_FAQ_INPUT_BYTES &&
                  LOOKS_LIKE_JSON.test(e.target.value.trimStart())
                ) {
                  notifyTooLarge();
                  return;
                }
                setFileName("");
                setRawText(e.target.value);
              }}
              placeholder={t("faqPastePlaceholder")}
              className="font-mono text-xs"
            />
          </div>

          {isJsonMode ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Braces className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("faqJsonDetected")}</span>
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-agent-faq-header"
                checked={headerChecked}
                onCheckedChange={v => { setHeaderTouched(true); setHeaderChecked(v === true); }}
              />
              <Label htmlFor="ai-agent-faq-header" className="text-sm font-normal">
                {t("faqHeaderRow")}
              </Label>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ai-agent-faq-name">{t("faqNameField")}</Label>
            <Input
              id="ai-agent-faq-name"
              value={faqName}
              onChange={e => setFaqName(e.target.value)}
              placeholder={t("faqNamePlaceholder")}
              maxLength={255}
            />
          </div>

          {truncated && (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <p className="text-amber-700 dark:text-amber-400">
                {t("faqTruncatedWarning", { shown: items.length, total: allItems.length })}
              </p>
            </div>
          )}

          {jsonInvalid ? (
            <p className="text-sm text-destructive">{t("faqJsonInvalid")}</p>
          ) : rawText.trim() && items.length === 0 ? (
            <p className="text-sm text-destructive">{t("faqEmpty")}</p>
          ) : items.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("faqPreviewHint")}</p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted/60 text-muted-foreground">
                      <th className="border px-2 py-1 text-left font-medium">{t("faqQuestion")}</th>
                      <th className="border px-2 py-1 text-left font-medium">{t("faqAnswer")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="max-w-[220px] truncate border px-2 py-1 align-top">
                          {item.question}
                        </td>
                        <td className="max-w-[320px] truncate border px-2 py-1 align-top">
                          {item.answer}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleImport}
            disabled={saving || items.length === 0}
            className="gap-1.5"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("faqImportCount", { count: items.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
