"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PanelAppMultiSelect } from "@/components/panel-apps/panel-app-multi-select";
import { cn } from "@/lib/utils";
import {
  FORM_LIMITS,
  generateOptionId,
  type FormDestinationMode,
  type FormFieldOption,
} from "@/lib/forms";
import { FieldNote, InfoHint, type FormNamedOption } from "./form-editor-shared";

export interface FieldOptionsEditorProps {
  options: FormFieldOption[];
  onChange: (next: FormFieldOption[]) => void;
  queues: FormNamedOption[];
  tags: FormNamedOption[];
  destinationMode: FormDestinationMode;
  /** Motivo devolvido pelo servidor (optionsRequired, optionLabel...). */
  errorReason?: string | null;
}

const hasRule = (option: FormFieldOption): boolean =>
  !!option.queueId || (Array.isArray(option.tagIds) && option.tagIds.length > 0);

/**
 * Opções de "lista" e "múltipla escolha". A regra por resposta (D6) é opcional: cada
 * opção pode escolher a fila do atendimento novo e somar etiquetas ao contato.
 */
export function FieldOptionsEditor({
  options,
  onChange,
  queues,
  tags,
  destinationMode,
  errorReason,
}: FieldOptionsEditorProps) {
  const t = useTranslations("formsPage");
  const [rulesOn, setRulesOn] = useState(() => options.some(hasRule));
  const [focusId, setFocusId] = useState<string | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    if (!focusId) return;
    const el = inputRefs.current.get(focusId);
    if (el) {
      el.focus();
      setFocusId(null);
    }
  }, [focusId, options]);

  const atMax = options.length >= FORM_LIMITS.maxOptions;

  const update = (id: string, patch: Partial<FormFieldOption>) =>
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const remove = (id: string) => onChange(options.filter((o) => o.id !== id));

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  const add = () => {
    if (atMax) return;
    const id = generateOptionId(options.map((o) => o.id));
    onChange([...options, { id, label: "" }]);
    setFocusId(id);
  };

  // Colar uma lista (uma opção por linha) cria as opções de uma vez.
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    const text = event.clipboardData.getData("text");
    if (!/[\r\n]/.test(text)) return;
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim().slice(0, FORM_LIMITS.optionLabelMax))
      .filter(Boolean);
    if (lines.length === 0) return;
    event.preventDefault();
    const next = [...options];
    next[index] = { ...next[index], label: lines[0] };
    const ids = next.map((o) => o.id);
    const room = FORM_LIMITS.maxOptions - next.length;
    const extra: FormFieldOption[] = [];
    lines.slice(1, 1 + Math.max(0, room)).forEach((label) => {
      const id = generateOptionId(ids);
      ids.push(id);
      extra.push({ id, label });
    });
    next.splice(index + 1, 0, ...extra);
    onChange(next);
  };

  const toggleRules = (on: boolean) => {
    setRulesOn(on);
    // Desligar apaga as regras: regra escondida que continua valendo confundiria.
    if (!on && options.some(hasRule)) {
      onChange(options.map((o) => ({ id: o.id, label: o.label })));
    }
  };

  const queueSelectValue = (option: FormFieldOption) => (option.queueId ? String(option.queueId) : "none");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Label>{t("fields.options")}</Label>
          <InfoHint text={t("fields.optionsHint")} />
        </div>
        <span className={cn("text-xs tabular-nums", atMax ? "text-warning" : "text-muted-foreground")}>
          {t("fields.optionsCount", { count: options.length, max: FORM_LIMITS.maxOptions })}
        </span>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-2.5">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1">
            <Label className="text-xs">{t("fields.optionRules")}</Label>
            <InfoHint text={t("fields.optionRuleHint")} />
          </div>
          <FieldNote>{t("fields.optionRulesDesc")}</FieldNote>
        </div>
        <Switch checked={rulesOn} onCheckedChange={toggleRules} aria-label={t("fields.optionRules")} />
      </div>
      {rulesOn && destinationMode !== "queue" && (
        <FieldNote tone="warning">{t("fields.optionQueueIgnored")}</FieldNote>
      )}

      {options.length === 0 ? (
        <FieldNote tone={errorReason === "optionsRequired" ? "error" : "muted"}>{t("fields.noOptions")}</FieldNote>
      ) : (
        <ol className="grid gap-2">
          {options.map((option, index) => {
            const labelMissing = !option.label.trim();
            return (
              <li key={option.id} className="grid gap-2 rounded-md border p-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  <Input
                    ref={(el) => {
                      if (el) inputRefs.current.set(option.id, el);
                      else inputRefs.current.delete(option.id);
                    }}
                    value={option.label}
                    maxLength={FORM_LIMITS.optionLabelMax}
                    onChange={(e) => update(option.id, { label: e.target.value })}
                    onPaste={(e) => handlePaste(e, index)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (index === options.length - 1) add();
                        else inputRefs.current.get(options[index + 1].id)?.focus();
                      }
                    }}
                    placeholder={t("fields.optionLabelPlaceholder", { n: index + 1 })}
                    aria-label={t("fields.optionLabel", { n: index + 1 })}
                    className={cn("h-8", labelMissing && errorReason === "optionLabel" && "border-destructive")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={t("fields.moveUp")}
                    title={t("fields.moveUp")}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0"
                    onClick={() => move(index, 1)}
                    disabled={index === options.length - 1}
                    aria-label={t("fields.moveDown")}
                    title={t("fields.moveDown")}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => remove(option.id)}
                    aria-label={t("fields.removeOption")}
                    title={t("fields.removeOption")}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {rulesOn && (
                  <div className="grid gap-2 sm:grid-cols-2 sm:pl-6">
                    <div className="grid min-w-0 gap-1">
                      <span className="text-[11px] text-muted-foreground">{t("fields.optionQueue")}</span>
                      <Select
                        value={queueSelectValue(option)}
                        onValueChange={(v) => update(option.id, { queueId: v === "none" ? null : Number(v) })}
                      >
                        <SelectTrigger className="h-8 min-w-0 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("fields.optionQueueNone")}</SelectItem>
                          {queues.map((q) => (
                            <SelectItem key={q.id} value={String(q.id)}>
                              {q.name}
                            </SelectItem>
                          ))}
                          {option.queueId && !queues.some((q) => q.id === option.queueId) && (
                            <SelectItem value={String(option.queueId)}>
                              {t("onSubmit.missingItem", { id: option.queueId })}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <span className="text-[11px] text-muted-foreground">{t("fields.optionTags")}</span>
                      <PanelAppMultiSelect
                        options={tags}
                        value={option.tagIds ?? []}
                        onChange={(ids) => update(option.id, { tagIds: ids })}
                        max={FORM_LIMITS.maxTagIds}
                        label={t("fields.optionTags")}
                        emptyText={t("onSubmit.noTags")}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={atMax} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("fields.addOption")}
        </Button>
        <FieldNote>{t("fields.pasteOptionsHint")}</FieldNote>
      </div>
    </div>
  );
}
