"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Lock, Mail, Phone, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  FORM_CONTACT_FIELDS,
  FORM_FIELD_TYPES,
  FORM_LIMITS,
  FORM_RESERVED_FIELD_KEYS,
  generateOptionId,
  isContactFieldAllowedForType,
  isReservedHiddenParam,
  type FormDestinationMode,
  type FormFieldType,
  type FormMapTo,
} from "@/lib/forms";
import { FieldOptionsEditor } from "./field-options-editor";
import {
  FIELD_KEY_RE,
  FORM_FIELD_TYPE_ICONS,
  FieldNote,
  InfoHint,
  NoticeBox,
  useCopyFeedback,
  type EditorField,
  type FormNamedOption,
} from "./form-editor-shared";

const PLACEHOLDER_TYPES: FormFieldType[] = ["text", "textarea", "email", "phone", "number", "select"];

type OptionalFieldKey =
  | "placeholder"
  | "helpText"
  | "width"
  | "min"
  | "max"
  | "maxLength"
  | "checkboxText"
  | "hiddenParam"
  | "hiddenDefault";

/** Troca o tipo levando o que ainda faz sentido (opções, destino no contato, limites). */
export function changeFieldType(field: EditorField, type: FormFieldType): EditorField {
  const next: EditorField = {
    _uid: field._uid,
    key: field.key,
    type,
    label: field.label,
    required: type === "hidden" ? false : field.required,
    mapTo: field.mapTo,
  };
  if (field.placeholder && PLACEHOLDER_TYPES.includes(type)) next.placeholder = field.placeholder;
  if (field.helpText && type !== "hidden") next.helpText = field.helpText;
  if (field.width === "half" && type !== "hidden") next.width = "half";
  if (type === "select" || type === "multiselect") {
    next.options =
      field.options && field.options.length > 0 ? field.options : [{ id: generateOptionId([]), label: "" }];
  }
  if (type === "number") {
    if (typeof field.min === "number") next.min = field.min;
    if (typeof field.max === "number") next.max = field.max;
  }
  if ((type === "text" || type === "textarea") && field.maxLength) {
    const limit = type === "text" ? FORM_LIMITS.textMax : FORM_LIMITS.textareaMax;
    next.maxLength = Math.min(field.maxLength, limit);
  }
  if (type === "checkbox" && field.checkboxText) next.checkboxText = field.checkboxText;
  if (type === "hidden") {
    if (field.hiddenParam) next.hiddenParam = field.hiddenParam;
    if (field.hiddenDefault) next.hiddenDefault = field.hiddenDefault;
  }
  if (field.mapTo.kind === "contact" && !isContactFieldAllowedForType(field.mapTo.field, type)) {
    next.mapTo = { kind: "none" };
  }
  return next;
}

const sanitizeKeyTyping = (raw: string): string =>
  raw.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);

const sanitizeParamTyping = (raw: string): string => raw.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40);

const numberOrUndefined = (raw: string): number | undefined => {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

export interface FieldPropertiesProps {
  field: EditorField;
  allFields: EditorField[];
  /** A chave já foi salva: não muda mais (é o nome no envio externo e nas respostas). */
  keyLocked: boolean;
  queues: FormNamedOption[];
  tags: FormNamedOption[];
  destinationMode: FormDestinationMode;
  /** Este campo é a identidade exigida pelo canal e precisa ser obrigatório. */
  identityRequired: boolean;
  errorReason?: string | null;
  /** Campo recém-criado: o foco vai para o rótulo. */
  autoFocusLabel?: boolean;
  onChange: (next: EditorField) => void;
}

export function FieldProperties({
  field,
  allFields,
  keyLocked,
  queues,
  tags,
  destinationMode,
  identityRequired,
  errorReason,
  autoFocusLabel,
  onChange,
}: FieldPropertiesProps) {
  const t = useTranslations("formsPage");
  const { copiedId, copy } = useCopyFeedback();
  const ids = {
    type: useId(),
    label: useId(),
    key: useId(),
    placeholder: useId(),
    help: useId(),
    width: useId(),
    saveTo: useId(),
    custom: useId(),
    min: useId(),
    max: useId(),
    maxLength: useId(),
    checkboxText: useId(),
    hiddenParam: useId(),
    hiddenDefault: useId(),
    required: useId(),
  };

  const patch = (changes: Partial<EditorField>) => onChange({ ...field, ...changes });
  const setOptional = <K extends OptionalFieldKey>(key: K, value: EditorField[K] | undefined) => {
    const next: EditorField = { ...field };
    if (value === undefined || (typeof value === "string" && value === "")) delete next[key];
    else next[key] = value as EditorField[K];
    onChange(next);
  };

  const otherFields = allFields.filter((f) => f._uid !== field._uid);
  const keyTaken = otherFields.some((f) => f.key === field.key);
  const keyInvalid = !FIELD_KEY_RE.test(field.key);
  const keyReserved = !keyInvalid && FORM_RESERVED_FIELD_KEYS.includes(field.key);
  const labelMissing = !field.label.trim();
  const isHidden = field.type === "hidden";
  const isChoice = field.type === "select" || field.type === "multiselect";

  // "Guardar em": valor único do seletor (none | custom | contact:<campo>).
  const contactChoices = FORM_CONTACT_FIELDS.filter((name) => isContactFieldAllowedForType(name, field.type));
  const takenBy = (name: string): EditorField | undefined =>
    otherFields.find((f) => f.mapTo.kind === "contact" && f.mapTo.field === name);
  const saveToValue =
    field.mapTo.kind === "contact" ? `contact:${field.mapTo.field}` : field.mapTo.kind === "custom" ? "custom" : "none";
  const setSaveTo = (value: string) => {
    let mapTo: FormMapTo = { kind: "none" };
    if (value === "custom") {
      mapTo = { kind: "custom", name: field.mapTo.kind === "custom" ? field.mapTo.name : field.label.trim().slice(0, FORM_LIMITS.customNameMax) };
    } else if (value.startsWith("contact:")) {
      mapTo = { kind: "contact", field: value.slice("contact:".length) };
    }
    patch({ mapTo });
  };
  const customName = field.mapTo.kind === "custom" ? field.mapTo.name : "";
  const contactFieldName = field.mapTo.kind === "contact" ? field.mapTo.field : null;

  const rangeInvalid =
    typeof field.min === "number" && typeof field.max === "number" && field.min > field.max;
  const hiddenParamInvalid = !!field.hiddenParam && !/^[A-Za-z0-9_]{1,40}$/.test(field.hiddenParam);
  const hiddenParamReserved = !hiddenParamInvalid && !!field.hiddenParam && isReservedHiddenParam(field.hiddenParam);
  const maxLengthLimit = field.type === "textarea" ? FORM_LIMITS.textareaMax : FORM_LIMITS.textMax;

  const reasonText = (reason: string): string => {
    const known = [
      "key", "keyTaken", "keyReserved", "type", "label", "mapTo", "contactFieldTaken", "optionsRequired",
      "tooManyOptions", "optionId", "optionLabel", "range", "hiddenParam", "hiddenParamReserved", "customName",
      "optionQueue", "optionTags",
    ];
    return known.includes(reason) ? t(`fields.reasons.${reason}`) : t("fields.reasons.generic");
  };

  return (
    <div className="grid gap-4">
      {errorReason && (
        <NoticeBox icon={TriangleAlert} tone="error">
          <p>{reasonText(errorReason)}</p>
        </NoticeBox>
      )}

      {contactFieldName === "number" && (
        <NoticeBox icon={Phone} tone="info">
          <p>{t("fields.identityPhoneHere")}</p>
        </NoticeBox>
      )}
      {contactFieldName === "email" && (
        <NoticeBox icon={Mail} tone="info">
          <p>{t("fields.identityEmailHere")}</p>
        </NoticeBox>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={ids.type}>{t("fields.type")}</Label>
          <Select value={field.type} onValueChange={(v) => onChange(changeFieldType(field, v as FormFieldType))}>
            <SelectTrigger id={ids.type} className="min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORM_FIELD_TYPES.map((type) => {
                const Icon = FORM_FIELD_TYPE_ICONS[type];
                return (
                  <SelectItem key={type} value={type}>
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {t(`fields.types.${type}`)}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {keyLocked && <FieldNote>{t("fields.typeChangeHint")}</FieldNote>}
        </div>

        <div className="grid min-w-0 gap-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor={ids.key}>{t("fields.key")}</Label>
            <InfoHint text={t("fields.keyHint")} />
          </div>
          {keyLocked ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <code
                id={ids.key}
                className="flex h-9 min-w-0 flex-1 items-center gap-1.5 truncate rounded-md border bg-muted/40 px-3 font-mono text-sm"
              >
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{field.key}</span>
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => void copy("key", field.key)}
                aria-label={t("fields.copyKey")}
                title={t("fields.copyKey")}
              >
                {copiedId === "key" ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
          ) : (
            <Input
              id={ids.key}
              value={field.key}
              onChange={(e) => patch({ key: sanitizeKeyTyping(e.target.value) })}
              className={cn("font-mono", (keyInvalid || keyTaken || keyReserved) && "border-destructive")}
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
            />
          )}
          {!keyLocked && keyInvalid && <FieldNote tone="error">{t("fields.reasons.key")}</FieldNote>}
          {!keyLocked && !keyInvalid && keyReserved && (
            <FieldNote tone="error">{t("fields.reasons.keyReserved")}</FieldNote>
          )}
          {!keyLocked && !keyInvalid && !keyReserved && keyTaken && (
            <FieldNote tone="error">{t("fields.reasons.keyTaken")}</FieldNote>
          )}
          {!keyLocked && !keyInvalid && !keyReserved && !keyTaken && <FieldNote>{t("fields.keyEditableHint")}</FieldNote>}
        </div>
      </div>

      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={ids.label}>{t("fields.label")}</Label>
        <Input
          id={ids.label}
          value={field.label}
          maxLength={FORM_LIMITS.labelMax}
          onChange={(e) => patch({ label: e.target.value })}
          placeholder={t("fields.labelPlaceholder")}
          autoFocus={autoFocusLabel}
          className={cn(labelMissing && errorReason === "label" && "border-destructive")}
        />
        {isHidden && <FieldNote>{t("fields.hiddenLabelHint")}</FieldNote>}
      </div>

      {!isHidden && (
        <div className="flex items-start justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor={ids.required}>{t("fields.required")}</Label>
            <FieldNote>{field.type === "checkbox" ? t("fields.requiredCheckboxHint") : t("fields.requiredHint")}</FieldNote>
            {identityRequired && !field.required && (
              <FieldNote tone="warning">{t("fields.identityMustBeRequired")}</FieldNote>
            )}
          </div>
          <Switch id={ids.required} checked={field.required} onCheckedChange={(v) => patch({ required: v })} />
        </div>
      )}

      {(PLACEHOLDER_TYPES.includes(field.type) || !isHidden) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {PLACEHOLDER_TYPES.includes(field.type) && (
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor={ids.placeholder}>{t("fields.placeholder")}</Label>
              <Input
                id={ids.placeholder}
                value={field.placeholder ?? ""}
                maxLength={FORM_LIMITS.placeholderMax}
                onChange={(e) => setOptional("placeholder", e.target.value)}
                placeholder={t("fields.placeholderPlaceholder")}
              />
            </div>
          )}
          {!isHidden && (
            <div className="grid min-w-0 gap-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor={ids.width}>{t("fields.width")}</Label>
                <InfoHint text={t("fields.widthHint")} />
              </div>
              <Select
                value={field.width === "half" ? "half" : "full"}
                onValueChange={(v) => setOptional("width", v === "half" ? "half" : undefined)}
              >
                <SelectTrigger id={ids.width} className="min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">{t("fields.widthFull")}</SelectItem>
                  <SelectItem value="half">{t("fields.widthHalf")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {!isHidden && (
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={ids.help}>{t("fields.helpText")}</Label>
          <Input
            id={ids.help}
            value={field.helpText ?? ""}
            maxLength={FORM_LIMITS.helpTextMax}
            onChange={(e) => setOptional("helpText", e.target.value)}
            placeholder={t("fields.helpTextPlaceholder")}
          />
        </div>
      )}

      {isChoice && (
        <FieldOptionsEditor
          options={field.options ?? []}
          onChange={(options) => patch({ options })}
          queues={queues}
          tags={tags}
          destinationMode={destinationMode}
          errorReason={errorReason}
        />
      )}

      {field.type === "number" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={ids.min}>{t("fields.min")}</Label>
            <Input
              id={ids.min}
              type="number"
              step="any"
              inputMode="decimal"
              value={typeof field.min === "number" ? String(field.min) : ""}
              onChange={(e) => setOptional("min", numberOrUndefined(e.target.value))}
              className={cn(rangeInvalid && "border-destructive")}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={ids.max}>{t("fields.max")}</Label>
            <Input
              id={ids.max}
              type="number"
              step="any"
              inputMode="decimal"
              value={typeof field.max === "number" ? String(field.max) : ""}
              onChange={(e) => setOptional("max", numberOrUndefined(e.target.value))}
              className={cn(rangeInvalid && "border-destructive")}
            />
          </div>
          <FieldNote tone={rangeInvalid ? "error" : "muted"} className="sm:col-span-2">
            {rangeInvalid ? t("fields.reasons.range") : t("fields.minMaxHint")}
          </FieldNote>
        </div>
      )}

      {(field.type === "text" || field.type === "textarea") && (
        <div className="grid min-w-0 gap-1.5 sm:max-w-xs">
          <Label htmlFor={ids.maxLength}>{t("fields.maxLength")}</Label>
          <Input
            id={ids.maxLength}
            type="number"
            min={1}
            max={maxLengthLimit}
            inputMode="numeric"
            value={field.maxLength ? String(field.maxLength) : ""}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              setOptional("maxLength", e.target.value.trim() === "" || !Number.isFinite(n) || n < 1 ? undefined : Math.min(n, maxLengthLimit));
            }}
            placeholder={String(maxLengthLimit)}
          />
          <FieldNote>{t("fields.maxLengthHint", { max: maxLengthLimit })}</FieldNote>
        </div>
      )}

      {field.type === "checkbox" && (
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={ids.checkboxText}>{t("fields.checkboxText")}</Label>
          <Textarea
            id={ids.checkboxText}
            rows={2}
            value={field.checkboxText ?? ""}
            maxLength={FORM_LIMITS.checkboxTextMax}
            onChange={(e) => setOptional("checkboxText", e.target.value)}
            placeholder={t("fields.checkboxTextPlaceholder")}
          />
          <FieldNote>{t("fields.checkboxTextHint")}</FieldNote>
        </div>
      )}

      {isHidden && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor={ids.hiddenParam}>{t("fields.hiddenParam")}</Label>
              <InfoHint text={t("fields.hiddenParamHint")} />
            </div>
            <Input
              id={ids.hiddenParam}
              value={field.hiddenParam ?? ""}
              onChange={(e) => setOptional("hiddenParam", sanitizeParamTyping(e.target.value))}
              placeholder="utm_source"
              className={cn("font-mono", (hiddenParamInvalid || hiddenParamReserved) && "border-destructive")}
              autoComplete="off"
              spellCheck={false}
            />
            {hiddenParamReserved && <FieldNote tone="error">{t("fields.reasons.hiddenParamReserved")}</FieldNote>}
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={ids.hiddenDefault}>{t("fields.hiddenDefault")}</Label>
            <Input
              id={ids.hiddenDefault}
              value={field.hiddenDefault ?? ""}
              maxLength={FORM_LIMITS.hiddenMax}
              onChange={(e) => setOptional("hiddenDefault", e.target.value)}
            />
          </div>
          <FieldNote className="sm:col-span-2">{t("fields.hiddenHint")}</FieldNote>
        </div>
      )}

      <div className="grid min-w-0 gap-1.5">
        <div className="flex items-center gap-1">
          <Label htmlFor={ids.saveTo}>{t("fields.saveTo")}</Label>
          <InfoHint text={t("fields.saveToHint")} />
        </div>
        <Select value={saveToValue} onValueChange={setSaveTo}>
          <SelectTrigger id={ids.saveTo} className="min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("fields.saveToNone")}</SelectItem>
            <SelectItem value="custom">{t("fields.saveToCustom")}</SelectItem>
            {contactChoices.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>{t("fields.saveToContact")}</SelectLabel>
                  {contactChoices.map((name) => {
                    const owner = takenBy(name);
                    return (
                      <SelectItem key={name} value={`contact:${name}`} disabled={!!owner}>
                        {owner
                          ? t("fields.contactFieldInUse", {
                              field: t(`fields.contactField.${name}`),
                              label: owner.label.trim() || t("fields.untitled"),
                            })
                          : t(`fields.contactField.${name}`)}
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
        {saveToValue === "none" && <FieldNote>{t("fields.saveToNoneHint")}</FieldNote>}
        {field.mapTo.kind === "contact" && <FieldNote>{t("fields.saveToContactHint")}</FieldNote>}
        {contactChoices.length === 0 && <FieldNote>{t("fields.saveToNoContactForType")}</FieldNote>}
        {field.mapTo.kind === "custom" && (
          <div className="grid min-w-0 gap-1.5 pt-1">
            <Label htmlFor={ids.custom} className="text-xs">
              {t("fields.customName")}
            </Label>
            <Input
              id={ids.custom}
              value={customName}
              maxLength={FORM_LIMITS.customNameMax}
              onChange={(e) => patch({ mapTo: { kind: "custom", name: e.target.value } })}
              placeholder={t("fields.customNamePlaceholder")}
              className={cn(!customName.trim() && errorReason === "customName" && "border-destructive")}
            />
            <FieldNote>{t("fields.saveToCustomHint")}</FieldNote>
          </div>
        )}
      </div>
    </div>
  );
}
