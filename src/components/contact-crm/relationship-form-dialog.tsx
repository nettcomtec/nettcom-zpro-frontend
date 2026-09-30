"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Paperclip, Plus, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isFeatureNotInPlanError } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  RELATIONSHIP_ACCEPT, RELATIONSHIP_MAX_FILE_BYTES, RELATIONSHIP_MAX_FILES,
  createRelationship, updateRelationship,
  RELATIONSHIP_TEXT_MAX_CHARS, type RelationshipAttachmentRef,
  type RelationshipFormValues, type RelationshipItem, type RelationshipType,
} from "@/services/relationship";
import { fetchAllUsers } from "@/services/users";
import { useAuthStore } from "@/stores/auth-store";

// PLANO_CRM_CONTATO — Fase 3 (§5.3-11, D18/D23). Criação e edição de um registro de
// relacionamento. Contrato em services/relationship.ts.

type Translate = ReturnType<typeof useTranslations>;

const ERROR_KEYS: Record<string, string> = {
  ERR_RELATIONSHIP_FORBIDDEN: "errForbidden",
  ERR_RELATIONSHIP_INVALID_TYPE: "errInvalidType",
  ERR_RELATIONSHIP_INVALID_DATE: "errInvalidDate",
  ERR_RELATIONSHIP_INVALID_USER: "errInvalidUser",
  ERR_RELATIONSHIP_INVALID_TICKET: "errInvalidTicket",
  ERR_RELATIONSHIP_TOO_MANY_FILES: "errTooManyFiles",
  ERR_RELATIONSHIP_FILE_TYPE: "errFileType",
  ERR_RELATIONSHIP_FILE_SIZE: "errFileSize",
  ERR_CONTACT_CRM_NO_ACCESS: "errNoAccess",
};

// Só o número: as mensagens já trazem a unidade depois de {size} ("MB", "Mo", "МБ"...).
export const RELATIONSHIP_MAX_SIZE_LABEL = Math.round(RELATIONSHIP_MAX_FILE_BYTES / (1024 * 1024));

const ALLOWED_EXTENSIONS = new Set(
  RELATIONSHIP_ACCEPT.split(",").map((ext) => ext.trim().toLowerCase()).filter(Boolean)
);

/** Código `ERR_…` do corpo do erro (o interceptor rejeita com o response ou com o próprio erro). */
export function relationshipErrorCode(err: unknown): string | null {
  const e = err as { data?: unknown; response?: { data?: unknown } } | null;
  const body = (e?.data ?? e?.response?.data) as { error?: unknown; code?: unknown } | null | undefined;
  const code = body && typeof body === "object" ? body.error ?? body.code : null;
  return typeof code === "string" ? code : null;
}

/** Mesma leitura, mas também quando o corpo veio como Blob (download com responseType blob). */
export async function relationshipErrorCodeAsync(err: unknown): Promise<string | null> {
  const e = err as { data?: unknown; response?: { data?: unknown } } | null;
  const body = e?.data ?? e?.response?.data;
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    try {
      const parsed = JSON.parse(await body.text()) as { error?: unknown; code?: unknown };
      const code = parsed?.error ?? parsed?.code;
      return typeof code === "string" ? code : null;
    } catch {
      return null;
    }
  }
  return relationshipErrorCode(err);
}

/** Mensagem traduzida do código de erro; código desconhecido cai na chave de reserva. */
export function relationshipErrorMessage(t: Translate, code: string | null, fallbackKey = "saveError"): string {
  const key = (code && ERROR_KEYS[code]) || fallbackKey;
  return t(key, { max: RELATIONSHIP_MAX_FILES, size: RELATIONSHIP_MAX_SIZE_LABEL });
}

/** Cor do tipo só quando é um valor de cor reconhecível (o campo é texto livre no banco). */
export function safeTypeColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const value = color.trim();
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return value;
  if (/^(rgb|hsl)a?\([\d\s.,%/+-]+\)$/i.test(value)) return value;
  return null;
}

export function formatFileSize(bytes: number): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(n / 1024)))} KB`;
  return `${formatNumber(n / (1024 * 1024), { maximumFractionDigits: 1 })} MB`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Valor de `<input type="datetime-local">` no horário do navegador. */
function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoToLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : toLocalInputValue(d);
}

/** Constrói a data a partir dos números (sem depender do parser de string do navegador). */
function localInputToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export interface RelationshipFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number;
  ticketId?: number | null;
  /** Tipos ativos */
  types: RelationshipType[];
  /** Registro em edição; ausente = novo registro */
  record?: RelationshipItem | null;
  onSaved: (item: RelationshipItem) => void;
}

interface UserOption {
  id: number;
  name: string;
}

export function RelationshipFormDialog({
  open, onOpenChange, contactId, ticketId, types, record, onSaved,
}: RelationshipFormDialogProps) {
  const t = useTranslations("relationship");
  const currentUser = useAuthStore((s) => s.user);
  const isEdit = !!record;

  const [typeId, setTypeId] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [userId, setUserId] = useState("");
  const [removed, setRemoved] = useState<number[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const usersRequested = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Valores de abertura: na edição só vai ao backend o que mudou.
  const initial = useRef({ typeId: "", description: "", notes: "", occurredAt: "", userId: "" });

  useEffect(() => {
    if (!open) return;
    const values = record
      ? {
          typeId: record.type ? String(record.type.id) : "",
          description: record.description || "",
          notes: record.notes || "",
          occurredAt: isoToLocalInputValue(record.occurredAt),
          userId: record.user ? String(record.user.id) : "",
        }
      : {
          typeId: types.length === 1 ? String(types[0].id) : "",
          description: "",
          notes: "",
          occurredAt: toLocalInputValue(new Date()),
          userId: currentUser?.userId ? String(currentUser.userId) : "",
        };
    initial.current = values;
    setTypeId(values.typeId);
    setDescription(values.description);
    setNotes(values.notes);
    setOccurredAt(values.occurredAt);
    setUserId(values.userId);
    setRemoved([]);
    setFiles([]);
    setSaving(false);
    setAttempted(false);
    // Só ao abrir (ou trocar de registro): recarregar durante a edição apagaria o que foi digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id]);

  useEffect(() => {
    if (!open || usersRequested.current) return;
    usersRequested.current = true;
    fetchAllUsers()
      .then((res) => {
        const list = res.data?.users || [];
        setUsers(
          list
            .filter((u) => u && u.profile !== "superadmin" && !u.inactive)
            .map((u) => ({ id: Number(u.id), name: String(u.name || "") }))
        );
      })
      .catch(() => {
        // Sem a lista, o seletor fica com o usuário atual (e o responsável do registro).
        usersRequested.current = false;
      });
  }, [open]);

  const typeOptions = useMemo(() => {
    const list = [...types];
    if (record?.type && !list.some((type) => type.id === record.type?.id)) {
      list.push({
        id: record.type.id,
        name: record.type.name,
        color: record.type.color,
        isActive: record.type.isActive,
        order: Number.MAX_SAFE_INTEGER,
        inUse: true,
      });
    }
    return list;
  }, [types, record]);

  const userOptions = useMemo<SearchableSelectOption[]>(() => {
    const map = new Map<number, string>();
    users.forEach((u) => map.set(u.id, u.name));
    if (currentUser?.userId && !map.has(Number(currentUser.userId))) {
      map.set(Number(currentUser.userId), currentUser.username || "");
    }
    if (record?.user && !map.has(record.user.id)) map.set(record.user.id, record.user.name || "");
    return Array.from(map.entries()).map(([id, name]) => ({ value: String(id), label: name || `#${id}` }));
  }, [users, currentUser?.userId, currentUser?.username, record?.user]);

  const existingAttachments = record?.attachments || [];
  const keptCount = existingAttachments.filter((att) => !removed.includes(att.index)).length;
  const totalFiles = keptCount + files.length;

  const handleFilesSelected = (list: FileList | null) => {
    const selected = Array.from(list || []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (selected.length === 0) return;

    const accepted: File[] = [];
    let wrongType = false;
    let tooBig = false;
    for (const file of selected) {
      if (!ALLOWED_EXTENSIONS.has(extensionOf(file.name))) {
        wrongType = true;
        continue;
      }
      if (file.size > RELATIONSHIP_MAX_FILE_BYTES) {
        tooBig = true;
        continue;
      }
      accepted.push(file);
    }
    if (wrongType) toast.error(t("errFileType"));
    if (tooBig) toast.error(t("errFileSize", { size: RELATIONSHIP_MAX_SIZE_LABEL }));
    if (accepted.length === 0) return;
    if (totalFiles + accepted.length > RELATIONSHIP_MAX_FILES) {
      toast.error(t("errTooManyFiles", { max: RELATIONSHIP_MAX_FILES }));
      return;
    }
    setFiles((prev) => [...prev, ...accepted]);
  };

  const toggleRemoved = (index: number) => {
    if (removed.includes(index)) {
      // Desfazer a remoção não pode passar do limite com os arquivos novos já escolhidos.
      if (totalFiles + 1 > RELATIONSHIP_MAX_FILES) {
        toast.error(t("errTooManyFiles", { max: RELATIONSHIP_MAX_FILES }));
        return;
      }
      setRemoved((prev) => prev.filter((i) => i !== index));
      return;
    }
    setRemoved((prev) => (prev.includes(index) ? prev : [...prev, index]));
  };

  const occurredIso = localInputToIso(occurredAt);
  const missingType = !typeId;
  const missingDescription = description.trim() === "";
  const missingDate = !occurredIso;

  const handleSave = async () => {
    setAttempted(true);
    if (missingType || missingDescription || missingDate || !occurredIso) {
      toast.error(t("required"));
      return;
    }
    if (totalFiles > RELATIONSHIP_MAX_FILES) {
      toast.error(t("errTooManyFiles", { max: RELATIONSHIP_MAX_FILES }));
      return;
    }

    setSaving(true);
    try {
      let saved: RelationshipItem;
      if (record) {
        const changes: Partial<RelationshipFormValues> & { removeAttachments?: RelationshipAttachmentRef[] } = {};
        const base = initial.current;
        if (typeId !== base.typeId) changes.typeId = Number(typeId);
        if (description.trim() !== base.description.trim()) changes.description = description.trim();
        if (notes.trim() !== base.notes.trim()) changes.notes = notes.trim() === "" ? null : notes.trim();
        // Mesmo valor do campo = mantém a data gravada (inclusive os segundos).
        if (occurredAt !== base.occurredAt) changes.occurredAt = occurredIso;
        if (userId && userId !== base.userId) changes.userId = Number(userId);
        if (removed.length > 0) {
          // Índice + nome + tamanho: o backend só remove o anexo que ainda confere (edição simultânea).
          changes.removeAttachments = existingAttachments
            .filter((att) => removed.includes(att.index))
            .map((att) => ({ index: att.index, name: att.name, size: att.size }));
        }
        const { data } = await updateRelationship(record.id, changes, files, ticketId ?? null);
        saved = data;
      } else {
        const values: RelationshipFormValues = {
          typeId: Number(typeId),
          description: description.trim(),
          notes: notes.trim() === "" ? null : notes.trim(),
          occurredAt: occurredIso,
        };
        if (userId) values.userId = Number(userId);
        if (ticketId) values.ticketId = ticketId;
        const { data } = await createRelationship(contactId, values, files);
        saved = data;
      }
      setSaving(false);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setSaving(false);
      // 402 de plano já tem aviso global.
      if (isFeatureNotInPlanError(err)) return;
      toast.error(relationshipErrorMessage(t, relationshipErrorCode(err)));
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && saving) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("dialogEditTitle") : t("dialogNewTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="relationship-type">{t("fieldType")} *</Label>
            <Select value={typeId} onValueChange={setTypeId} disabled={saving}>
              <SelectTrigger
                id="relationship-type"
                aria-invalid={attempted && missingType}
                className={cn(attempted && missingType && "border-destructive")}
              >
                <SelectValue placeholder={t("fieldType")} />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((type) => {
                  const color = safeTypeColor(type.color);
                  return (
                    <SelectItem key={type.id} value={String(type.id)}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", !color && "bg-muted-foreground/40")}
                          style={color ? { backgroundColor: color } : undefined}
                        />
                        <span className="truncate">{type.name}</span>
                        {!type.isActive && (
                          <span className="shrink-0 text-xs text-muted-foreground">({t("inactiveType")})</span>
                        )}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="relationship-description">{t("fieldDescription")} *</Label>
            <Textarea
              id="relationship-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={RELATIONSHIP_TEXT_MAX_CHARS}
              disabled={saving}
              aria-invalid={attempted && missingDescription}
              className={cn(attempted && missingDescription && "border-destructive")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="relationship-notes">{t("fieldNotes")}</Label>
            <Textarea
              id="relationship-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={RELATIONSHIP_TEXT_MAX_CHARS}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="relationship-occurred-at">{t("fieldOccurredAt")} *</Label>
              <Input
                id="relationship-occurred-at"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                disabled={saving}
                aria-invalid={attempted && missingDate}
                className={cn(attempted && missingDate && "border-destructive")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fieldResponsible")}</Label>
              <SearchableSelect
                options={userOptions}
                value={userId}
                onValueChange={setUserId}
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("fieldAttachments")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("attachmentsHint", { max: RELATIONSHIP_MAX_FILES, size: RELATIONSHIP_MAX_SIZE_LABEL })}
            </p>

            {(existingAttachments.length > 0 || files.length > 0) && (
              <ul className="space-y-1.5">
                {existingAttachments.map((att) => {
                  const isRemoved = removed.includes(att.index);
                  return (
                    <li
                      key={`existing-${att.index}`}
                      className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className={cn("min-w-0 flex-1 truncate", isRemoved && "text-muted-foreground line-through")}>
                        {att.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(att.size)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => toggleRemoved(att.index)}
                        disabled={saving}
                        aria-pressed={isRemoved}
                        aria-label={`${t("removeFile")}: ${att.name}`}
                        title={t("removeFile")}
                      >
                        {isRemoved ? <Undo2 /> : <X />}
                      </Button>
                    </li>
                  );
                })}
                {files.map((file, index) => (
                  <li
                    key={`new-${index}-${file.name}`}
                    className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-sm"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      disabled={saving}
                      aria-label={`${t("removeFile")}: ${file.name}`}
                      title={t("removeFile")}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={RELATIONSHIP_ACCEPT}
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving || totalFiles >= RELATIONSHIP_MAX_FILES}
            >
              <Plus />
              {t("addFiles")}
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={handleSave} loading={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RelationshipFormDialog;
