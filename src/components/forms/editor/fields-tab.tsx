"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown, ArrowUp, ChevronDown, CircleCheck, GripVertical, Info, Plus, Trash2, TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  FORM_FIELD_TYPES,
  FORM_LIMITS,
  generateFieldKey,
  generateOptionId,
  type FormContactRule,
  type FormDestinationMode,
  type FormFieldType,
} from "@/lib/forms";
import { FieldProperties } from "./field-properties";
import {
  FORM_FIELD_TYPE_ICONS,
  FieldNote,
  NoticeBox,
  makeFieldUid,
  type EditorField,
  type FormNamedOption,
} from "./form-editor-shared";

export interface FieldsTabProps {
  fields: EditorField[];
  onChange: (next: EditorField[]) => void;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  /** Chaves que já existem no servidor (não mudam mais). */
  savedKeys: ReadonlySet<string>;
  contactRule: FormContactRule;
  hasChannel: boolean;
  queues: FormNamedOption[];
  tags: FormNamedOption[];
  destinationMode: FormDestinationMode;
  /** Erros por campo (uid → motivo), da conferência da tela ou do servidor. */
  fieldErrors: Record<string, string>;
}

const isPhoneIdentity = (f: EditorField) => f.mapTo.kind === "contact" && f.mapTo.field === "number";
const isEmailIdentity = (f: EditorField) => f.mapTo.kind === "contact" && f.mapTo.field === "email";

interface FieldRowProps {
  field: EditorField;
  index: number;
  total: number;
  expanded: boolean;
  hasError: boolean;
  onToggle: (uid: string) => void;
  onMove: (uid: string, delta: -1 | 1) => void;
  onRemove: (uid: string) => void;
  children?: ReactNode;
}

const FieldRow = memo(function FieldRow({
  field,
  index,
  total,
  expanded,
  hasError,
  onToggle,
  onMove,
  onRemove,
  children,
}: FieldRowProps) {
  const t = useTranslations("formsPage");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: field._uid,
  });
  const Icon = FORM_FIELD_TYPE_ICONS[field.type];
  const label = field.label.trim() || t("fields.untitled");

  const saveToBadge =
    field.mapTo.kind === "contact"
      ? field.mapTo.field === "number"
        ? t("fields.badgePhoneIdentity")
        : field.mapTo.field === "email"
          ? t("fields.badgeEmailIdentity")
          : t("fields.badgeContact", { field: t(`fields.contactField.${field.mapTo.field}`) })
      : field.mapTo.kind === "custom"
        ? t("fields.badgeCustom")
        : null;
  const isIdentity = isPhoneIdentity(field) || isEmailIdentity(field);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className={cn(
        "relative rounded-lg border bg-card",
        expanded && "ring-1 ring-primary/40",
        hasError && "border-destructive/60",
        isDragging && "opacity-70 shadow-lg"
      )}
    >
      <div className="flex items-center gap-1 p-1.5 sm:gap-1.5 sm:p-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("fields.dragHandle")}
          title={t("fields.dragHandle")}
          className="inline-flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onToggle(field._uid)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm font-medium", !field.label.trim() && "italic text-muted-foreground")}>
              {label}
              {field.required && field.type !== "hidden" && <span className="ml-0.5 text-destructive">*</span>}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">{t(`fields.types.${field.type}`)}</span>
              <code className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">{field.key}</code>
              {saveToBadge && (
                <Badge variant={isIdentity ? "info-soft" : "secondary"} className="px-1.5 py-0 text-[10px] font-medium">
                  {saveToBadge}
                </Badge>
              )}
              {hasError && (
                <Badge variant="destructive-soft" className="gap-1 px-1.5 py-0 text-[10px] font-medium">
                  <TriangleAlert className="h-2.5 w-2.5" />
                  {t("fields.badgeError")}
                </Badge>
              )}
            </span>
          </span>
          <ChevronDown
            className={cn("mt-1.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
        </button>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onMove(field._uid, -1)}
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
            onClick={() => onMove(field._uid, 1)}
            disabled={index === total - 1}
            aria-label={t("fields.moveDown")}
            title={t("fields.moveDown")}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-destructive hover:text-destructive"
            onClick={() => onRemove(field._uid)}
            aria-label={t("fields.remove")}
            title={t("fields.remove")}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {expanded && !isDragging && <div className="border-t p-3 sm:p-4">{children}</div>}
    </li>
  );
});

export function FieldsTab({
  fields,
  onChange,
  selectedUid,
  onSelect,
  savedKeys,
  contactRule,
  hasChannel,
  queues,
  tags,
  destinationMode,
  fieldErrors,
}: FieldsTabProps) {
  const t = useTranslations("formsPage");
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [justAddedUid, setJustAddedUid] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EditorField | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const uids = useMemo(() => fields.map((f) => f._uid), [fields]);
  const atMax = fields.length >= FORM_LIMITS.maxFields;

  const phoneField = fields.find(isPhoneIdentity) ?? null;
  const emailField = fields.find(isEmailIdentity) ?? null;

  const labelOf = (field: EditorField | null): string =>
    field ? field.label.trim() || t("fields.untitled") : "";

  const labelById = (id: UniqueIdentifier): string => labelOf(fields.find((f) => f._uid === String(id)) ?? null);
  const positionOf = (id: UniqueIdentifier): number => fields.findIndex((f) => f._uid === String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => t("fields.dndPicked", { label: labelById(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t("fields.dndOver", { label: labelById(active.id), position: positionOf(over.id) }) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? t("fields.dndDropped", { label: labelById(active.id), position: positionOf(over.id) }) : undefined,
    onDragCancel: ({ active }) => t("fields.dndCancelled", { label: labelById(active.id) }),
  };

  const createField = (type: FormFieldType, overrides?: Partial<EditorField>): EditorField => {
    const field: EditorField = {
      _uid: makeFieldUid(),
      key: generateFieldKey(fields.map((f) => f.key).concat(Array.from(savedKeys))),
      type,
      label: "",
      required: false,
      mapTo: { kind: "none" },
    };
    if (type === "select" || type === "multiselect") {
      field.options = [{ id: generateOptionId([]), label: "" }];
    }
    // Primeiro campo de telefone/e-mail já nasce como a identidade do contato.
    if (type === "phone" && !phoneField) {
      field.mapTo = { kind: "contact", field: "number" };
      field.label = t("fields.defaultPhoneLabel");
      field.required = contactRule === "phone";
    }
    if (type === "email" && !emailField) {
      field.mapTo = { kind: "contact", field: "email" };
      field.label = t("fields.defaultEmailLabel");
      field.required = contactRule === "email";
    }
    return { ...field, ...overrides };
  };

  const addField = (type: FormFieldType, overrides?: Partial<EditorField>) => {
    if (atMax) return;
    const field = createField(type, overrides);
    onChange([...fields, field]);
    onSelect(field._uid);
    setJustAddedUid(field._uid);
  };

  const replaceField = (next: EditorField) => onChange(fields.map((f) => (f._uid === next._uid ? next : f)));

  const toggle = (uid: string) => onSelect(selectedUid === uid ? null : uid);

  const move = (uid: string, delta: -1 | 1) => {
    const from = fields.findIndex((f) => f._uid === uid);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= fields.length) return;
    onChange(arrayMove(fields, from, to));
  };

  const doRemove = (uid: string) => {
    onChange(fields.filter((f) => f._uid !== uid));
    if (selectedUid === uid) onSelect(null);
  };

  const requestRemove = (uid: string) => {
    const field = fields.find((f) => f._uid === uid);
    if (!field) return;
    // Campo que já recebeu respostas: confirma antes (as respostas antigas ficam guardadas).
    if (savedKeys.has(field.key)) setRemoveTarget(field);
    else doRemove(uid);
  };

  const handleDragStart = (event: DragStartEvent) => setDraggingUid(String(event.active.id));
  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingUid(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f._uid === String(active.id));
    const to = fields.findIndex((f) => f._uid === String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(fields, from, to));
  };

  const makeRequired = (uid: string) => onChange(fields.map((f) => (f._uid === uid ? { ...f, required: true } : f)));

  // ── Aviso da identidade exigida pelo canal ──────────────────────────────────
  const identityNotice = (() => {
    if (contactRule === "phone") {
      if (!phoneField) {
        return {
          tone: "warning" as const,
          text: t("fields.identityMissingPhone"),
          action: { label: t("fields.addPhoneField"), run: () => addField("phone", { required: true }) },
        };
      }
      if (!phoneField.required) {
        return {
          tone: "warning" as const,
          text: t("fields.identityPhoneNotRequired", { label: labelOf(phoneField) }),
          action: { label: t("fields.makeRequired"), run: () => makeRequired(phoneField._uid) },
        };
      }
      return { tone: "info" as const, text: t("fields.identityOkPhone", { label: labelOf(phoneField) }), action: null };
    }
    if (contactRule === "email") {
      if (!emailField) {
        return {
          tone: "warning" as const,
          text: t("fields.identityMissingEmail"),
          action: { label: t("fields.addEmailField"), run: () => addField("email", { required: true }) },
        };
      }
      if (!emailField.required) {
        return {
          tone: "warning" as const,
          text: t("fields.identityEmailNotRequired", { label: labelOf(emailField) }),
          action: { label: t("fields.makeRequired"), run: () => makeRequired(emailField._uid) },
        };
      }
      return { tone: "info" as const, text: t("fields.identityOkEmail", { label: labelOf(emailField) }), action: null };
    }
    if (!phoneField) {
      return {
        tone: "warning" as const,
        text: t("fields.identityMissingPhoneAny"),
        action: { label: t("fields.addPhoneField"), run: () => addField("phone") },
      };
    }
    if (!emailField) {
      return {
        tone: "warning" as const,
        text: t("fields.identityMissingEmailAny"),
        action: { label: t("fields.addEmailField"), run: () => addField("email") },
      };
    }
    return {
      tone: "info" as const,
      text: t("fields.identityOkAny", { phone: labelOf(phoneField), email: labelOf(emailField) }),
      action: null,
    };
  })();

  // Sem canal ainda não há exigência (o servidor também só confere com canal).
  const identityUid = !hasChannel
    ? null
    : contactRule === "phone"
      ? phoneField?._uid ?? null
      : contactRule === "email"
        ? emailField?._uid ?? null
        : null;

  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" className="gap-1.5" disabled={atMax}>
          <Plus className="h-4 w-4" />
          {t("fields.add")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-72 overflow-y-auto">
        <DropdownMenuLabel>{t("fields.addTitle")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORM_FIELD_TYPES.map((type) => {
          const Icon = FORM_FIELD_TYPE_ICONS[type];
          return (
            <DropdownMenuItem key={type} onSelect={() => addField(type)} className="items-start gap-2.5 py-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm">{t(`fields.types.${type}`)}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{t(`fields.typeDesc.${type}`)}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("fields.title")}</p>
          <p className={cn("text-xs tabular-nums", atMax ? "text-warning" : "text-muted-foreground")}>
            {t("fields.count", { count: fields.length, max: FORM_LIMITS.maxFields })}
          </p>
        </div>
        {addMenu}
      </div>

      {hasChannel ? (
        <NoticeBox icon={identityNotice.tone === "info" ? CircleCheck : TriangleAlert} tone={identityNotice.tone}>
          <p>{identityNotice.text}</p>
          {identityNotice.action && (
            <Button type="button" variant="outline" size="sm" className="mt-1 h-7 text-xs" onClick={identityNotice.action.run} disabled={atMax}>
              {identityNotice.action.label}
            </Button>
          )}
        </NoticeBox>
      ) : (
        <NoticeBox icon={Info} tone="info">
          <p>{t("fields.noChannelNote")}</p>
        </NoticeBox>
      )}

      {atMax && <FieldNote tone="warning">{t("fields.maxFields", { max: FORM_LIMITS.maxFields })}</FieldNote>}

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">{t("fields.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("fields.emptyBody")}</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggingUid(null)}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: t("fields.dndInstructions") },
          }}
        >
          <SortableContext items={uids} strategy={verticalListSortingStrategy}>
            <ol className="grid gap-2">
              {fields.map((field, index) => {
                const expanded = selectedUid === field._uid && draggingUid === null;
                return (
                  <FieldRow
                    key={field._uid}
                    field={field}
                    index={index}
                    total={fields.length}
                    expanded={expanded}
                    hasError={!!fieldErrors[field._uid]}
                    onToggle={toggle}
                    onMove={move}
                    onRemove={requestRemove}
                  >
                    {expanded && (
                      <FieldProperties
                        field={field}
                        allFields={fields}
                        keyLocked={savedKeys.has(field.key)}
                        queues={queues}
                        tags={tags}
                        destinationMode={destinationMode}
                        identityRequired={identityUid === field._uid}
                        errorReason={fieldErrors[field._uid] ?? null}
                        autoFocusLabel={justAddedUid === field._uid && !field.label}
                        onChange={replaceField}
                      />
                    )}
                  </FieldRow>
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {fields.length > 1 && <FieldNote>{t("fields.reorderHint")}</FieldNote>}

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fields.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("fields.removeBody", { label: labelOf(removeTarget) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removeTarget) doRemove(removeTarget._uid);
                setRemoveTarget(null);
              }}
            >
              {t("fields.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
