"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  detectBulkDelimiter,
  extractDigits,
  parseDelimitedRows,
  toCanonicalCsv,
  type BulkDelimiter,
} from "@/lib/bulk-csv-parser";

/**
 * Modo de extração por página:
 *  - firstField: telefone é a 1ª coluna, demais colunas ignoradas (massa texto/template)
 *  - allFields: todo campo que parece telefone entra (SMS, ações em grupos)
 *  - fullRows: linha inteira número+variáveis vai para o textarea (textovariavel/template-variavel)
 */
export type BulkCsvExtractMode = "firstField" | "allFields" | "fullRows";

export interface BulkCsvImportResult {
  text: string;
  count: number;
}

interface BulkCsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  content: string;
  mode: BulkCsvExtractMode;
  /** Faixa de dígitos aceita como telefone (SMS/grupos usam 8-20 p/ manter o comportamento atual) */
  minDigits?: number;
  maxDigits?: number;
  onImport: (result: BulkCsvImportResult) => void;
}

type DelimiterToken = "comma" | "semicolon" | "tab" | "pipe" | "space" | "hyphen";

const TOKEN_TO_CHAR: Record<DelimiterToken, BulkDelimiter> = {
  comma: ",",
  semicolon: ";",
  tab: "\t",
  pipe: "|",
  space: " ",
  hyphen: "-",
};

const CHAR_TO_TOKEN: Record<BulkDelimiter, DelimiterToken> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
  "|": "pipe",
  " ": "space",
  "-": "hyphen",
};

// Mesmo formato aceito hoje pelo SMS/grupos: dígitos + formatação comum de telefone
const PHONE_CHARS_RE = /^[\d\s\-+()]+$/;

type ParsedRow = {
  fields: string[];
  /** números extraídos da linha (modos número) */
  numbers: string[];
  valid: boolean;
};

const PREVIEW_LIMIT = 10;
const MAX_PREVIEW_COLS = 6;

export function BulkCsvImportDialog({
  open,
  onOpenChange,
  fileName,
  content,
  mode,
  minDigits = 10,
  maxDigits = 15,
  onImport,
}: BulkCsvImportDialogProps) {
  const t = useTranslations("bulkCsvImport");

  const [choice, setChoice] = useState<"auto" | DelimiterToken>("auto");
  const [headerChecked, setHeaderChecked] = useState(false);
  const [headerTouched, setHeaderTouched] = useState(false);

  const detected = useMemo(() => detectBulkDelimiter(content), [content]);
  const delimiter: BulkDelimiter = choice === "auto" ? detected : TOKEN_TO_CHAR[choice];

  const isFieldPhone = (raw: string): boolean => {
    if (!raw) return false;
    const digits = extractDigits(raw);
    if (digits.length < minDigits || digits.length > maxDigits) return false;
    // Nos modos de campo cru (SMS/grupos) o campo precisa ser SÓ telefone,
    // não texto com dígitos no meio (ex.: coluna de observação)
    return mode === "allFields" ? PHONE_CHARS_RE.test(raw) : true;
  };

  const parsed = useMemo<ParsedRow[]>(() => {
    const rows = parseDelimitedRows(content, delimiter);
    return rows.map((fields) => {
      if (mode === "allFields") {
        const numbers = fields.filter((f) => isFieldPhone(f));
        return { fields, numbers, valid: numbers.length > 0 };
      }
      const first = fields[0] ?? "";
      const digits = extractDigits(first);
      const valid = digits.length >= minDigits && digits.length <= maxDigits;
      return { fields, numbers: valid ? [digits] : [], valid };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, delimiter, mode, minDigits, maxDigits]);

  // Cabeçalho provável: 1ª linha sem nenhum número válido E com letras na
  // parte relevante (evita marcar como cabeçalho uma 1ª linha que é apenas
  // um número curto/com erro de digitação — essa deve aparecer como inválida)
  const headerAuto = useMemo(() => {
    const first = parsed[0];
    if (!first || parsed.length < 2 || first.valid) return false;
    const relevant = mode === "allFields" ? first.fields.join(" ") : first.fields[0] ?? "";
    return /[A-Za-z]/.test(relevant);
  }, [parsed, mode]);

  useEffect(() => {
    if (open) {
      setChoice("auto");
      setHeaderTouched(false);
    }
  }, [open, content]);

  useEffect(() => {
    if (!headerTouched) setHeaderChecked(headerAuto);
  }, [headerAuto, headerTouched]);

  const headerRow = headerChecked ? parsed[0] : undefined;
  const dataRows = headerChecked ? parsed.slice(1) : parsed;

  const validRows = dataRows.filter((r) => r.valid);
  const invalidCount = dataRows.length - validRows.length;
  const allNumbers = dataRows.flatMap((r) => r.numbers);

  const importCount = mode === "fullRows" ? dataRows.length : allNumbers.length;
  const canImport = mode === "fullRows" ? dataRows.length > 0 : allNumbers.length > 0;
  const dangerousDelimiter = delimiter === " " || delimiter === "-";

  const delimiterNames: Record<DelimiterToken, string> = {
    comma: t("delimiterComma"),
    semicolon: t("delimiterSemicolon"),
    tab: t("delimiterTab"),
    pipe: t("delimiterPipe"),
    space: t("delimiterSpace"),
    hyphen: t("delimiterHyphen"),
  };

  const handleImport = () => {
    if (!canImport) return;
    if (mode === "fullRows") {
      onImport({ text: toCanonicalCsv(dataRows.map((r) => r.fields)), count: dataRows.length });
      return;
    }
    if (mode === "allFields") {
      onImport({ text: allNumbers.join(","), count: allNumbers.length });
      return;
    }
    onImport({ text: allNumbers.join(", "), count: allNumbers.length });
  };

  const previewRows = dataRows.slice(0, PREVIEW_LIMIT);
  const previewCols = Math.min(
    MAX_PREVIEW_COLS,
    Math.max(1, ...previewRows.map((r) => r.fields.length), headerRow ? headerRow.fields.length : 1),
  );

  const renderCells = (row: ParsedRow) => {
    const cells = row.fields.slice(0, previewCols);
    while (cells.length < previewCols) cells.push("");
    return (
      <>
        {cells.map((f, i) => (
          <td key={i} className="border px-2 py-1 max-w-[180px] truncate align-top">
            {f}
          </td>
        ))}
        {row.fields.length > previewCols && (
          <td className="border px-2 py-1 text-muted-foreground align-top">
            +{row.fields.length - previewCols}
          </td>
        )}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{fileName}</span>
          </div>

          <div className="grid gap-2 sm:max-w-xs">
            <Label>{t("delimiterLabel")}</Label>
            <Select
              value={choice}
              onValueChange={(v) => setChoice(v as "auto" | DelimiterToken)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  {t("delimiterAuto", { name: delimiterNames[CHAR_TO_TOKEN[detected]] })}
                </SelectItem>
                {(Object.keys(TOKEN_TO_CHAR) as DelimiterToken[]).map((token) => (
                  <SelectItem key={token} value={token}>
                    {delimiterNames[token]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("delimiterHint")}</p>
          </div>

          {dangerousDelimiter && (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
              <p className="text-amber-700 dark:text-amber-400">{t("spaceHyphenWarning")}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="bulk-csv-header"
              checked={headerChecked}
              onCheckedChange={(v) => {
                setHeaderTouched(true);
                setHeaderChecked(v === true);
              }}
            />
            <Label htmlFor="bulk-csv-header" className="text-sm font-normal">
              {t("headerCheckbox")}
            </Label>
          </div>

          {parsed.length === 0 ? (
            <p className="text-sm text-destructive">{t("emptyFile")}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("previewLabel", {
                  shown: previewRows.length,
                  total: dataRows.length,
                })}
              </p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs font-mono border-collapse">
                  <tbody>
                    {headerRow && (
                      <tr className="bg-muted/60 text-muted-foreground line-through">
                        <td className="border px-2 py-1 whitespace-nowrap font-sans no-underline">
                          {t("headerIgnored")}
                        </td>
                        {renderCells(headerRow)}
                      </tr>
                    )}
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className={row.valid ? "" : "bg-destructive/10"}>
                        <td
                          className={`border px-2 py-1 whitespace-nowrap font-sans ${
                            row.valid ? "text-muted-foreground" : "text-destructive"
                          }`}
                        >
                          #{idx + 1}
                        </td>
                        {renderCells(row)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs">
                <span className="text-emerald-600 dark:text-emerald-500">
                  {mode === "fullRows"
                    ? t("validLinesCount", { count: validRows.length })
                    : t("validNumbersCount", { count: allNumbers.length })}
                </span>
                {invalidCount > 0 && (
                  <span className="text-destructive ml-2">
                    —{" "}
                    {mode === "fullRows"
                      ? t("invalidKeptCount", { count: invalidCount })
                      : t("invalidIgnoredCount", { count: invalidCount })}
                  </span>
                )}
              </p>
              {!canImport && <p className="text-xs text-destructive">{t("noValidLines")}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancelButton")}
          </Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {t("importButtonCount", { count: importCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
