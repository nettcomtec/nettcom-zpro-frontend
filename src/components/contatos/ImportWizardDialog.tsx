"use client";

import React, { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Plus,
  Tag as TagIcon,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  importPreview,
  smartImportContacts,
  type ColumnMapping,
  type SmartImportConfig,
  type SmartImportResult,
  type UpdateBehavior,
} from "@/services/contacts";
import type { Tag } from "@/services/tags";
import type { User } from "@/services/users";
import type { Queue } from "@/services/queues";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE_MB = 30;
const ACCEPTED_EXTS = [".csv", ".xls", ".xlsx", ".txt"];

type SystemField =
  | "ignore"
  | "name"
  | "number"
  | "email"
  | "firstName"
  | "lastName"
  | "businessName"
  | "cpf"
  | "birthdayDate"
  | string; // custom:FieldName

interface MappingRow {
  columnIndex: number;
  headerLabel: string;
  field: SystemField;
  updateBehavior: UpdateBehavior;
  newCustomFieldName?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: Tag[];
  users: User[];
  queues?: Queue[];
  onImported: () => void;
}

export function ImportWizardDialog({
  open,
  onOpenChange,
  tags,
  users,
  queues,
  onImported,
}: Props) {
  const t = useTranslations("contatosPage.importWizard");
  const tCsv = useTranslations("bulkCsvImport");
  const { isLiveMode } = useLiveMode();

  const [step, setStep] = useState(1);

  // Step 1
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [previewLoading, setPreviewLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  // Divisor CSV/TXT: "auto" delega ao backend; token explícito força o parse
  const [delimiter, setDelimiter] = useState("auto");
  const [detectedDelimiter, setDetectedDelimiter] = useState<string | null>(null);

  // Step 3
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [defaultCountryCode, setDefaultCountryCode] = useState("55");
  const [defaultAreaCode, setDefaultAreaCode] = useState("");
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [walletId, setWalletId] = useState<number | null>(null);
  const [queueId, setQueueId] = useState<number | null>(null);
  const [addTags, setAddTags] = useState(false);
  const [validateContact, setValidateContact] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<SmartImportResult | null>(
    null
  );

  const reset = () => {
    setStep(1);
    setFile(null);
    setHeaders([]);
    setSampleRows([]);
    setTotalRows(0);
    setDelimiter("auto");
    setDetectedDelimiter(null);
    setMappings([]);
    setDefaultCountryCode("55");
    setDefaultAreaCode("");
    setTagIds([]);
    setTagSearch("");
    setWalletId(null);
    setQueueId(null);
    setAddTags(false);
    setImporting(false);
    setImportResult(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  // ── Step 1 helpers ────────────────────────────────────────────────────────

  const validateFile = (f: File): string | null => {
    const sizeMb = f.size / 1024 / 1024;
    if (sizeMb > MAX_FILE_SIZE_MB)
      return t("errorFileSize", { max: MAX_FILE_SIZE_MB });
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) return t("errorFileType");
    return null;
  };

  const handleFileSelect = (f: File) => {
    const err = validateFile(f);
    if (err) {
      toast.error(err);
      return;
    }
    setFile(f);
    setDelimiter("auto");
    setDetectedDelimiter(null);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    },
    []
  );

  // ── Step 2: load preview ──────────────────────────────────────────────────

  const loadPreview = async (delimiterOverride?: string) => {
    if (!file) return;
    setPreviewLoading(true);
    try {
      const result = await importPreview(file, delimiterOverride ?? delimiter);
      setHeaders(result.headers);
      setSampleRows(result.sampleRows);
      setTotalRows(result.totalRows);
      setDetectedDelimiter(result.delimiter ?? null);

      const autoMappings: MappingRow[] = result.headers.map((h, i) => ({
        columnIndex: i,
        headerLabel: h,
        field: autoDetectField(h),
        updateBehavior: "always",
      }));
      setMappings(autoMappings);
      setStep(2);
    } catch {
      toast.error(t("errorPreview"));
    } finally {
      setPreviewLoading(false);
    }
  };

  const isDelimitedFile = !!file && /\.(csv|txt)$/i.test(file.name);

  const delimiterName = (token: string) =>
    token === "comma"
      ? tCsv("delimiterComma")
      : token === "semicolon"
      ? tCsv("delimiterSemicolon")
      : token === "tab"
      ? tCsv("delimiterTab")
      : tCsv("delimiterPipe");

  const autoDetectField = (header: string): SystemField => {
    const h = header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (h.includes("nome") && !h.includes("primeiro") && !h.includes("ultimo") && !h.includes("empresa"))
      return "name";
    if (h === "name") return "name";
    if (h.includes("numero") || h.includes("number") || h.includes("telefone") || h.includes("phone") || h.includes("whatsapp"))
      return "number";
    if (h.includes("email") || h.includes("e-mail")) return "email";
    if (h.includes("primeiro") || h.includes("firstname") || h.includes("first")) return "firstName";
    if (h.includes("ultimo") || h.includes("sobrenome") || h.includes("lastname") || h.includes("last")) return "lastName";
    if (h.includes("empresa") || h.includes("business") || h.includes("company")) return "businessName";
    if (h.includes("cpf")) return "cpf";
    if (h.includes("nascimento") || h.includes("aniversario") || h.includes("birthday") || h.includes("birth")) return "birthdayDate";
    return "ignore";
  };

  // ── Step 3: mapping helpers ───────────────────────────────────────────────

  const SYSTEM_FIELDS: { value: SystemField; label: string }[] = [
    { value: "ignore", label: t("fieldIgnore") },
    { value: "name", label: t("fieldName") },
    { value: "number", label: t("fieldNumber") },
    { value: "email", label: t("fieldEmail") },
    { value: "firstName", label: t("fieldFirstName") },
    { value: "lastName", label: t("fieldLastName") },
    { value: "businessName", label: t("fieldBusinessName") },
    { value: "cpf", label: t("fieldCpf") },
    { value: "birthdayDate", label: t("fieldBirthday") },
  ];

  const UPDATE_BEHAVIORS: { value: UpdateBehavior; label: string }[] = [
    { value: "always", label: t("behaviorAlways") },
    { value: "never", label: t("behaviorNever") },
    { value: "never_if_empty_file", label: t("behaviorNeverIfEmptyFile") },
    { value: "only_if_empty_system", label: t("behaviorOnlyIfEmptySystem") },
  ];

  const usedFields = new Set(
    mappings
      .filter((m) => m.field !== "ignore" && m.field !== "__new_custom__")
      .map((m) => m.field)
  );

  const customFields = Array.from(
    new Set(
      mappings.filter((m) => m.field.startsWith("custom:")).map((m) => m.field)
    )
  );

  const updateMapping = (index: number, changes: Partial<MappingRow>) => {
    setMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...changes } : m))
    );
  };

  const confirmNewCustomField = (index: number) => {
    const m = mappings[index];
    const name = m.newCustomFieldName?.trim();
    if (!name) return;

    const duplicated = mappings.some(
      (x, i) =>
        i !== index &&
        x.field.startsWith("custom:") &&
        x.field.replace(/^custom:/, "").toLowerCase() === name.toLowerCase()
    );
    if (duplicated) {
      toast.error(t("errorDuplicateCustomField", { name }));
      return;
    }

    updateMapping(index, {
      field: `custom:${name}`,
      newCustomFieldName: undefined,
    });
  };

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!file) return;

    const hasNumber = mappings.some((m) => m.field === "number");
    const hasName = mappings.some((m) => m.field === "name");
    if (!hasNumber && !hasName) {
      toast.error(t("errorNoRequiredField"));
      return;
    }

    const columnMappings: ColumnMapping[] = mappings
      .filter((m) => m.field !== "ignore" && m.field !== "__new_custom__")
      .map((m) => ({
        columnIndex: m.columnIndex,
        field: m.field,
        updateBehavior: m.updateBehavior,
      }));

    const config: SmartImportConfig = {
      columnMappings,
      defaultCountryCode: defaultCountryCode || undefined,
      defaultAreaCode: defaultAreaCode || undefined,
      tagIds: tagIds.length ? tagIds : undefined,
      walletId: walletId ?? undefined,
      queueId: queueId ?? undefined,
      addTags,
      validateContact,
      hasHeader: true,
      // Mesmo divisor do preview no import (o arquivo é reenviado): explícito
      // vence; em auto, manda o token que o backend detectou no preview
      delimiter:
        delimiter !== "auto" ? delimiter : detectedDelimiter ?? undefined,
    };

    setImporting(true);
    try {
      const result = await smartImportContacts(file, config);
      setImportResult(result);
      onImported();
    } catch {
      toast.error(t("errorImport"));
    } finally {
      setImporting(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const stepLabels = [t("stepOrigem"), t("stepEstrutura"), t("stepIdentificacao")];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-2xl sm:max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{t("title")}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto pb-1">
          {stepLabels.map((label, i) => {
            const num = i + 1;
            const active = step === num;
            const done = step > num;
            return (
              <React.Fragment key={num}>
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                        ? "bg-green-500 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {num}
                  </div>
                  <span
                    className={`text-xs sm:text-sm whitespace-nowrap ${
                      active ? "font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < 2 && (
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── STEP 1: ORIGEM ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-6 sm:p-10 text-center transition-colors cursor-pointer ${
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/30 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTS.join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-12 w-12 text-green-500" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  >
                    <X className="h-4 w-4 mr-1" /> {t("removeFile")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-12 w-12 text-muted-foreground" />
                  <p className="font-medium">{t("dropzone")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("acceptedFormats")} · {t("maxSize", { max: MAX_FILE_SIZE_MB })}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: ESTRUTURA ── */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span>{file?.name}</span>
              <Badge variant="secondary">{t("rowCount", { count: totalRows })}</Badge>
            </div>

            {isDelimitedFile && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                <Label className="text-xs shrink-0">{tCsv("delimiterLabel")}</Label>
                <Select
                  value={delimiter}
                  onValueChange={(v) => {
                    setDelimiter(v);
                    loadPreview(v);
                  }}
                  disabled={previewLoading}
                >
                  <SelectTrigger className="h-8 text-xs w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="text-xs">
                      {detectedDelimiter
                        ? tCsv("delimiterAuto", { name: delimiterName(detectedDelimiter) })
                        : tCsv("delimiterAutoPlain")}
                    </SelectItem>
                    <SelectItem value="comma" className="text-xs">{tCsv("delimiterComma")}</SelectItem>
                    <SelectItem value="semicolon" className="text-xs">{tCsv("delimiterSemicolon")}</SelectItem>
                    <SelectItem value="tab" className="text-xs">{tCsv("delimiterTab")}</SelectItem>
                    <SelectItem value="pipe" className="text-xs">{tCsv("delimiterPipe")}</SelectItem>
                  </SelectContent>
                </Select>
                {previewLoading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                )}
              </div>
            )}

            {sampleRows.length > 0 && (
              <div className="overflow-auto max-h-64 border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-left font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.map((row, ri) => (
                      <tr key={ri} className="border-t">
                        {headers.map((_, ci) => (
                          <td key={ci} className={cn("px-2 py-1 whitespace-nowrap max-w-[150px] truncate", isLiveMode && "live-blur-text")}>
                            {row[ci] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("previewHint")}</p>
          </div>
        )}

        {/* ── STEP 3: IDENTIFICAÇÃO ── */}
        {step === 3 && !importResult && (
          <div className="space-y-5">
            {/* Column mapping */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t("mappingTitle")}</h3>
                <Badge variant="secondary" className="shrink-0 text-[11px] font-normal">
                  {t("columnsDetected", { count: mappings.length })}
                </Badge>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {mappings.map((m, i) => {
                  const isCustomPending = m.field === "__new_custom__";
                  return (
                    <div
                      key={m.columnIndex}
                      className="flex flex-col sm:grid sm:grid-cols-[1fr_1fr_1fr] gap-1.5 sm:gap-2 p-2 sm:p-0 rounded-md sm:rounded-none bg-muted/40 sm:bg-transparent"
                    >
                      <span className="text-xs sm:text-sm font-medium truncate px-1 sm:px-0">{m.headerLabel}</span>

                      {isCustomPending ? (
                        <div className="flex gap-1 sm:col-span-2">
                          <Input
                            autoFocus
                            placeholder={t("customFieldName")}
                            value={m.newCustomFieldName ?? ""}
                            onChange={(e) =>
                              updateMapping(i, { newCustomFieldName: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmNewCustomField(i);
                              if (e.key === "Escape")
                                updateMapping(i, { field: "ignore", newCustomFieldName: undefined });
                            }}
                            className="h-8 text-xs"
                          />
                          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => confirmNewCustomField(i)}>
                            <CheckCircle2 className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 shrink-0" onClick={() => updateMapping(i, { field: "ignore", newCustomFieldName: undefined })}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1 min-w-0">
                            <Select
                              value={m.field}
                              onValueChange={(v) => {
                                if (v === "__new_custom__") {
                                  updateMapping(i, { field: "__new_custom__", newCustomFieldName: "", updateBehavior: "always" });
                                } else {
                                  updateMapping(i, { field: v as SystemField });
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SYSTEM_FIELDS.filter(
                                  (sf) => sf.value === "ignore" || sf.value === m.field || !usedFields.has(sf.value)
                                ).map((sf) => (
                                  <SelectItem key={sf.value} value={sf.value} className="text-xs">{sf.label}</SelectItem>
                                ))}
                                {customFields
                                  .filter((cf) => cf === m.field || !usedFields.has(cf))
                                  .map((cf) => (
                                    <SelectItem key={cf} value={cf} className="text-xs">
                                      <TagIcon className="h-3 w-3 inline mr-1 text-primary" />
                                      {cf.replace(/^custom:/, "")}
                                    </SelectItem>
                                  ))}
                                <SelectItem value="__new_custom__" className="text-xs text-primary">
                                  <Plus className="h-3 w-3 inline mr-1" />
                                  {t("newCustomField")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {m.field.startsWith("custom:") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 shrink-0"
                                title={t("removeCustomField")}
                                aria-label={t("removeCustomField")}
                                onClick={() => updateMapping(i, { field: "ignore" })}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>

                          {m.field !== "ignore" ? (
                            <Select
                              value={m.updateBehavior}
                              onValueChange={(v) => updateMapping(i, { updateBehavior: v as UpdateBehavior })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {UPDATE_BEHAVIORS.map((b) => (
                                  <SelectItem key={b.value} value={b.value} className="text-xs">{b.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="hidden sm:block" />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Phone defaults */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("defaultCountryCode")}</Label>
                <Input
                  value={defaultCountryCode}
                  onChange={(e) => setDefaultCountryCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="55"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("defaultAreaCode")}</Label>
                <Input
                  value={defaultAreaCode}
                  onChange={(e) => setDefaultAreaCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="11"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
              {t("phoneDefaultHint")}
            </p>

            {/* Tags */}
            <div className="space-y-1">
              <Label className="text-xs">{t("tagsLabel")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs w-full justify-start">
                    {tagIds.length ? `${tagIds.length} ${t("tagsSelected")}` : t("tagsPlaceholder")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 p-0"
                  align="start"
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="sticky top-0 bg-popover p-2 border-b">
                    <Input
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      placeholder={t("tagsSearchPlaceholder")}
                      className="h-7 text-xs"
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto py-1">
                    {tags
                      .filter((tag) => tag.isActive !== false)
                      .filter((tag) =>
                        tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase())
                      )
                      .map((tag) => (
                        <DropdownMenuCheckboxItem
                          key={tag.id}
                          checked={tagIds.includes(tag.id)}
                          onSelect={(e) => e.preventDefault()}
                          onCheckedChange={(checked) =>
                            setTagIds((prev) =>
                              checked ? [...prev, tag.id] : prev.filter((id) => id !== tag.id)
                            )
                          }
                        >
                          {tag.name}
                        </DropdownMenuCheckboxItem>
                      ))}
                    {tags.filter((tag) => tag.isActive !== false).filter((tag) =>
                      tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase())
                    ).length === 0 && (
                      <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                        {t("tagsEmpty")}
                      </div>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {tagIds.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wiz-addtags"
                  checked={addTags}
                  onCheckedChange={(v) => setAddTags(!!v)}
                />
                <Label htmlFor="wiz-addtags" className="text-xs cursor-pointer">
                  {t("addTagsLabel")}
                </Label>
              </div>
            )}

            {/* Wallet */}
            <div className="space-y-1">
              <Label className="text-xs">{t("walletLabel")}</Label>
              <Select
                value={walletId != null ? String(walletId) : "none"}
                onValueChange={(v) => setWalletId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">{t("walletNone")}</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Queue */}
            <div className="space-y-1">
              <Label className="text-xs">{t("queueLabel")}</Label>
              <Select
                value={queueId != null ? String(queueId) : "none"}
                onValueChange={(v) => setQueueId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">{t("queueNone")}</SelectItem>
                  {(queues ?? []).map((q) => (
                    <SelectItem key={q.id} value={String(q.id)} className="text-xs">
                      {q.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t("queueRoutingNote")}</p>
            </div>

            {/* Validate Contact */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wiz-validate"
                  checked={validateContact}
                  onCheckedChange={(v) => setValidateContact(!!v)}
                />
                <Label htmlFor="wiz-validate" className="text-xs cursor-pointer">
                  {t("validateContactLabel")}
                </Label>
              </div>
              {validateContact && (
                <div className="flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{t("validateContactWarning")}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {importResult && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h3 className="font-semibold text-lg">{t("resultTitle")}</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="border rounded-lg p-3">
                <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                <p className="text-xs text-muted-foreground">{t("resultImported")}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                <p className="text-xs text-muted-foreground">{t("resultUpdated")}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-2xl font-bold text-red-500">{importResult.failed}</p>
                <p className="text-xs text-muted-foreground">{t("resultFailed")}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("resultTotal", { count: importResult.total })}
            </p>
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2">
          {!importResult && (
            <>
              {step > 1 && (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={previewLoading || importing}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> {t("back")}
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => handleClose(false)}
                disabled={importing}
              >
                {t("cancel")}
              </Button>
              {step === 1 && (
                <Button className="w-full sm:w-auto" onClick={() => loadPreview()} disabled={!file || previewLoading}>
                  {previewLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                  {t("next")}
                </Button>
              )}
              {step === 2 && (
                <Button className="w-full sm:w-auto" onClick={() => setStep(3)}>
                  <ChevronRight className="h-4 w-4 mr-1" /> {t("next")}
                </Button>
              )}
              {step === 3 && (
                <Button className="w-full sm:w-auto" onClick={handleImport} disabled={importing}>
                  {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  {importing ? t("importing") : t("import")}
                </Button>
              )}
            </>
          )}
          {importResult && (
            <Button className="w-full sm:w-auto" onClick={() => handleClose(false)}>{t("close")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
