"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fetchDbConsoleRow, updateDbConsoleRow } from "@/services/db-console";
import type {
  DbConsoleColumnInfo, DbConsoleRowCell, DbConsoleRowDetail, DbConsoleTableInfo,
} from "@/types/db-console";
import { describeDbConsoleError, prettyJsonForEdit } from "./helpers";

const JSON_TYPES = new Set(["json", "jsonb"]);
const BOOL_TYPES = new Set(["boolean"]);
const LONG_TYPES = new Set(["text", "json", "jsonb", "xml"]);
const DATE_HINT = /timestamp|timestamptz|date|time/i;

interface RowEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: DbConsoleTableInfo;
  identity: Record<string, string> | null;
  onSaved: () => void;
}

interface DraftValue {
  value: string;
  isNull: boolean;
}

export function RowEditDialog({ open, onOpenChange, info, identity, onSaved }: RowEditDialogProps) {
  const t = useTranslations("bancoDadosPage");
  const tCommon = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<DbConsoleRowDetail | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const columnByName = useMemo(() => {
    const map = new Map<string, DbConsoleColumnInfo>();
    info.columns.forEach(column => map.set(column.name, column));
    return map;
  }, [info]);

  async function load() {
    if (!identity) return;
    setLoading(true);
    setError(null);
    setReviewing(false);
    try {
      const row = await fetchDbConsoleRow(info.name, identity);
      setDetail(row);
      const next: Record<string, DraftValue> = {};
      row.cells.forEach(cell => {
        next[cell.column] = { value: cell.value ?? "", isNull: cell.value === null };
      });
      setDraft(next);
    } catch (err) {
      setDetail(null);
      setError(describeDbConsoleError(err, t, t("errRowChanged")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
    else {
      setDetail(null);
      setDraft({});
      setError(null);
      setReviewing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, identity, info.name]);

  const changed = useMemo(() => {
    if (!detail) return [] as { cell: DbConsoleRowCell; before: string | null; after: string | null }[];
    return detail.cells
      .filter(cell => cell.editable)
      .map(cell => {
        const current = draft[cell.column];
        if (!current) return null;
        const after = current.isNull ? null : current.value;
        const before = cell.value;
        return after === before ? null : { cell, before, after };
      })
      .filter(Boolean) as { cell: DbConsoleRowCell; before: string | null; after: string | null }[];
  }, [detail, draft]);

  function setValue(column: string, patch: Partial<DraftValue>) {
    setDraft(prev => ({ ...prev, [column]: { ...prev[column], ...patch } }));
  }

  function validate(): string | null {
    for (const item of changed) {
      const column = columnByName.get(item.cell.column);
      if (column && JSON_TYPES.has(column.castType) && item.after !== null) {
        try {
          JSON.parse(item.after);
        } catch {
          return `${column.name}: ${t("fieldJsonInvalid")}`;
        }
      }
    }
    return null;
  }

  async function save() {
    if (!identity || !changed.length || saving) return;
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateDbConsoleRow(
        info.name,
        identity,
        changed.map(item => ({
          column: item.cell.column,
          value: item.after,
          isNull: item.after === null,
          prevMd5: item.cell.md5,
        }))
      );
      toast.success(t("saved"));
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(describeDbConsoleError(err, t, t("errInvalidValue")));
      setReviewing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function renderEditor(cell: DbConsoleRowCell) {
    const column = columnByName.get(cell.column);
    const current = draft[cell.column] || { value: "", isNull: true };
    const disabled = !cell.editable || cell.masked || cell.tooLarge || current.isNull;

    if (cell.masked) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          {t("protectedCell")}
        </div>
      );
    }
    if (cell.tooLarge) {
      return <p className="text-sm text-muted-foreground">{t("fieldTooLargeToEdit")}</p>;
    }

    if (column?.enumValues?.length) {
      return (
        <Select
          value={current.value}
          onValueChange={value => setValue(cell.column, { value, isNull: false })}
          disabled={disabled}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {column.enumValues.map(option => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (column && BOOL_TYPES.has(column.castType)) {
      return (
        <Select
          value={current.value}
          onValueChange={value => setValue(cell.column, { value, isNull: false })}
          disabled={disabled}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">true</SelectItem>
            <SelectItem value="false">false</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (column && LONG_TYPES.has(column.castType)) {
      return (
        <Textarea
          value={current.value}
          onChange={event => setValue(cell.column, { value: event.target.value, isNull: false })}
          disabled={disabled}
          rows={JSON_TYPES.has(column.castType) ? 6 : 3}
          spellCheck={false}
          className="font-mono text-base md:text-sm"
        />
      );
    }

    return (
      <Input
        value={current.value}
        onChange={event => setValue(cell.column, { value: event.target.value, isNull: false })}
        disabled={disabled}
        className="h-9 font-mono text-base md:text-sm"
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reviewing ? t("reviewTitle") : t("editTitle")}</DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">
            {info.name}
            {identity ? ` · ${Object.entries(identity).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : reviewing ? (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t("directEditWarning")}</AlertDescription>
            </Alert>
            <div className="space-y-3">
              {changed.map(item => (
                <div key={item.cell.column} className="rounded-lg border p-3 space-y-2">
                  <p className="font-mono text-sm">{item.cell.column}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{t("before")}</p>
                      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                        {item.before === null ? t("nullValue") : item.before}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{t("after")}</p>
                      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                        {item.after === null ? t("nullValue") : item.after}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {info.readOnly && (
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>{t("badgeReadOnly")}</AlertDescription>
              </Alert>
            )}
            {detail?.cells.map(cell => {
              const column = columnByName.get(cell.column);
              const current = draft[cell.column];
              const pretty =
                column && JSON_TYPES.has(column.castType) && cell.value
                  ? prettyJsonForEdit(cell.value)
                  : null;
              return (
                <div key={cell.column} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="font-mono text-xs">{cell.column}</Label>
                    <span className="text-[10px] text-muted-foreground">{column?.type}</span>
                    {cell.column && info.identity?.includes(cell.column) && (
                      <Badge variant="secondary" className="text-[10px]">PK</Badge>
                    )}
                    {!cell.editable && !cell.masked && !cell.tooLarge && (
                      <span className="text-[10px] text-muted-foreground">{t("fieldNotEditable")}</span>
                    )}
                    {column && DATE_HINT.test(column.castType) && (
                      <span className="text-[10px] text-muted-foreground">{t("fieldUtcNote")}</span>
                    )}
                    {cell.editable && column?.nullable && (
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{t("fieldNull")}</span>
                        <Switch
                          checked={current?.isNull ?? false}
                          onCheckedChange={value => setValue(cell.column, { isNull: value })}
                        />
                      </span>
                    )}
                  </div>
                  {pretty && !cell.editable ? (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                      {pretty}
                    </pre>
                  ) : (
                    renderEditor(cell)
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="break-words">{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => (reviewing ? setReviewing(false) : onOpenChange(false))}>
            {tCommon("cancel")}
          </Button>
          {reviewing ? (
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("confirmSave")}
            </Button>
          ) : (
            <Button onClick={() => setReviewing(true)} disabled={loading || !changed.length}>
              {changed.length ? t("editRow") : t("noChanges")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
