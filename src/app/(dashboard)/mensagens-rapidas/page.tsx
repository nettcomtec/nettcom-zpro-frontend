"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Send, Plus, Search, Pencil, Trash2, RefreshCw, Paperclip, Mic, X, ChevronDown,
  Download, Square, Loader2, Info, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchFastReplies,
  createFastReply,
  updateFastReply,
  deleteFastReply,
  parseFastReplyMedias,
  canManagePublicQuickReplies,
  type FastReply,
} from "@/services/fast-reply";
import { convertWebmBlobToMp3 } from "@/lib/audio-webm-to-mp3";
import { WABA_LIMITS } from "@/lib/waba-text-limits";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { useAuthStore } from "@/stores/auth-store";
import { useSortable } from "@/hooks/use-sortable";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  LocationPickerFields,
  locationValueFrom,
  locationValueToPoint,
  type LocationPickerValue,
} from "@/components/atendimento/location-picker-fields";
import { buildQuickReplyLocationMessage, formatCoord, parseQuickReplyLocationMessage } from "@/lib/location-message";
import { fetchWebchatInviteAvailability } from "@/services/webchat";

const API_BASE_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) ||
  "http://localhost:3101";

function resolveMediaUrls(item: FastReply): string[] {
  const filenames = parseFastReplyMedias(item);
  return filenames.map(
    (f) => `${API_BASE_URL}/public/${item.tenantId}/fastreply/${f}`
  );
}

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif"];
const AUDIO_EXTENSIONS = ["mp3", "ogg", "wav", "m4a", "aac", "opus", "flac", "oga"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "avi", "mkv", "ogv"];

function getFileType(url: string): "image" | "audio" | "video" | "pdf" | "other" {
  const cleanUrl = url.split("?")[0].toLowerCase();
  const ext = cleanUrl.split(".").pop() ?? "";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "other";
}

const VARIABLES: { label: string; value: string; descKey?: string }[] = [
  { label: "{{name}}", value: "{{name}}" },
  { label: "{{greeting}}", value: "{{greeting}}" },
  { label: "{{protocol}}", value: "{{protocol}}" },
  { label: "{{email}}", value: "{{email}}" },
  { label: "{{phoneNumber}}", value: "{{phoneNumber}}" },
  { label: "{{kanban}}", value: "{{kanban}}" },
  { label: "{{user}}", value: "{{user}}" },
  { label: "{{userEmail}}", value: "{{userEmail}}" },
  { label: "{{firstName}}", value: "{{firstName}}" },
  { label: "{{lastName}}", value: "{{lastName}}" },
  { label: "{{businessName}}", value: "{{businessName}}" },
  // Link de avaliação do Google configurado em Avaliações (vazio sem link configurado).
  { label: "{{linkAvaliacaoGoogle}}", value: "{{linkAvaliacaoGoogle}}", descKey: "varLinkAvaliacaoGoogleDesc" },
];

// Link de convite do WebChat (PLANO_WEBCHAT_LINK_CONVITE D9): só entra na lista quando o
// servidor entende a variável (backend antigo = some).
const WEBCHAT_INVITE_VARIABLE = { label: "{{linkWebchat}}", value: "{{linkWebchat}}", descKey: "varLinkWebchatDesc" };

const MAX_FILES = 5;

export default function MensagensRapidasPage() {
  const t = useTranslations("mensagensRapidasPage");
  const tCommon = useTranslations("common");
  const tUnsaved = useTranslations("flowBuilderNodeForm");
  const tShare = useTranslations("locationShare");
  const tInput = useTranslations("messageInput");
  const allowed = usePageAccess("mensagens-rapidas", { allowIfNotSet: true });
  const { user, isAdmin, isSuporte, hasPermission } = useAuthStore();
  const canManagePublic = canManagePublicQuickReplies({ user, isAdmin, isSuporte, hasPermission });
  const [items, setItems] = useState<FastReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FastReply | null>(null);
  const [deleting, setDeleting] = useState<FastReply | null>(null);
  const [deletingReply, setDeletingReply] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMediaUrl, setViewMediaUrl] = useState<string | null>(null);

  // Form fields
  const [formKey, setFormKey] = useState("/");
  const [formMessage, setFormMessage] = useState("");
  const [formIsPublic, setFormIsPublic] = useState(false);
  const [formVoice, setFormVoice] = useState(false);
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [removeMedia, setRemoveMedia] = useState(false);

  // Structured message fields
  const [formMessageType, setFormMessageType] = useState<"text" | "buttons" | "list" | "template" | "location">("text");
  const [formButtons, setFormButtons] = useState({ title: "", footer: "", buttons: [{ id: "1", title: "" }] });
  const [formList, setFormList] = useState({ title: "", footer: "", buttonText: "", sections: [{ title: "", rows: [{ id: "1", title: "", description: "" }] }] });
  const [formTemplate, setFormTemplate] = useState({ name: "", language: "" });
  // Tipo Localização: os campos ficam aqui e só viram o `message` (texto + links) ao salvar.
  const [formLocation, setFormLocation] = useState<LocationPickerValue>(() => locationValueFrom(null));
  const [locationUnreadable, setLocationUnreadable] = useState(false);

  // Erros inline de validação do form (toast permanece como reforço)
  const [formErrors, setFormErrors] = useState<{ key?: string; message?: string; buttons?: string; list?: string; template?: string; location?: string }>({});
  // Snapshot do form no momento da abertura do dialog (dirty-guard)
  const dialogSnapshotRef = useRef<string>("");

  // Audio recording
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(items, "key");

  const isMensagemDoUsuario = (msg: FastReply) => {
    if (msg.isPublic) return true;
    const uid = user?.userId;
    if (uid == null) return true;
    if (msg.userId == null) return true;
    return String(msg.userId) === String(uid);
  };

  const podeGerenciar = (msg: FastReply) => {
    const uid = user?.userId;
    const isOwner = uid != null && msg.userId != null && String(msg.userId) === String(uid);
    if (isOwner) return true;
    if (msg.isPublic) return canManagePublic;
    return false;
  };

  // Lista: a de Localização mostra nome/endereço (ou as coordenadas) no lugar dos links do
  // `message`; ilegível = o texto salvo, como as outras.
  const describeLocationReply = (msg: FastReply): string | null => {
    if (msg.messageType !== "location") return null;
    const loc = parseQuickReplyLocationMessage(msg.message);
    if (!loc) return null;
    const label = [loc.name, loc.address].filter(Boolean).join(" - ");
    return label || `${formatCoord(loc.lat)}, ${formatCoord(loc.lng)}`;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchFastReplies();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [webchatInviteAvailable, setWebchatInviteAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchWebchatInviteAvailability().then((res) => {
      if (alive) setWebchatInviteAvailable(res.available);
    });
    return () => {
      alive = false;
    };
  }, []);
  const variableOptions = webchatInviteAvailable ? [...VARIABLES, WEBCHAT_INVITE_VARIABLE] : VARIABLES;

  // Estado relevante do form serializado — comparado contra o snapshot de abertura
  const buildFormSnapshot = () => JSON.stringify({
    formKey, formMessage, formIsPublic, formVoice, formMessageType,
    formButtons, formList, formTemplate, formLocation, removeMedia,
    files: formFiles.map((f) => `${f.name}:${f.size}`),
  });

  // Captura snapshot quando o dialog abre (dirty-guard de fechamento)
  useEffect(() => {
    if (dialogOpen) dialogSnapshotRef.current = buildFormSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  // --- Early return after all hooks ---
  if (!allowed) return <AccessDenied />;

  const filtered = sortedData.filter(
    (m) =>
      isMensagemDoUsuario(m) &&
      (m.key?.toLowerCase().includes(search.toLowerCase()) ||
        m.message?.toLowerCase().includes(search.toLowerCase()))
  );

  const resetForm = () => {
    setFormKey("/");
    setFormMessage("");
    setFormIsPublic(false);
    setFormVoice(false);
    setFormFiles([]);
    setRemoveMedia(false);
    setFormMessageType("text");
    setFormButtons({ title: "", footer: "", buttons: [{ id: "1", title: "" }] });
    setFormList({ title: "", footer: "", buttonText: "", sections: [{ title: "", rows: [{ id: "1", title: "", description: "" }] }] });
    setFormTemplate({ name: "", language: "" });
    setFormLocation(locationValueFrom(null));
    setLocationUnreadable(false);
    setFormErrors({});
    stopRecordingAndDiscard();
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (item: FastReply) => {
    setEditing(item);
    setFormKey(item.key.startsWith("/") ? item.key : `/${item.key}`);
    setFormMessage(item.message || "");
    setFormIsPublic(item.isPublic ?? false);
    setFormVoice(item.voice === "enabled");
    setFormFiles([]);
    setRemoveMedia(false);
    const mt = item.messageType ?? "text";
    setFormMessageType(mt);
    try { setFormButtons(item.buttonsJson ? { ...{ title: "", footer: "", buttons: [{ id: "1", title: "" }] }, ...JSON.parse(item.buttonsJson) } : { title: "", footer: "", buttons: [{ id: "1", title: "" }] }); } catch { setFormButtons({ title: "", footer: "", buttons: [{ id: "1", title: "" }] }); }
    try { setFormList(item.listJson ? { ...{ title: "", footer: "", buttonText: "", sections: [{ title: "", rows: [{ id: "1", title: "", description: "" }] }] }, ...JSON.parse(item.listJson) } : { title: "", footer: "", buttonText: "", sections: [{ title: "", rows: [{ id: "1", title: "", description: "" }] }] }); } catch { setFormList({ title: "", footer: "", buttonText: "", sections: [{ title: "", rows: [{ id: "1", title: "", description: "" }] }] }); }
    try { setFormTemplate(item.templateJson ? JSON.parse(item.templateJson) : { name: "", language: "" }); } catch { setFormTemplate({ name: "", language: "" }); }
    // Localização: os campos saem do próprio `message`; ilegível = campos vazios + aviso.
    const savedLocation = mt === "location" ? parseQuickReplyLocationMessage(item.message) : null;
    setFormLocation(locationValueFrom(savedLocation));
    setLocationUnreadable(mt === "location" && !savedLocation);
    setFormErrors({});
    stopRecordingAndDiscard();
    setDialogOpen(true);
  };

  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setFormMessage((prev) => prev + variable);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = formMessage.slice(0, start) + variable + formMessage.slice(end);
    setFormMessage(newValue);
    setTimeout(() => {
      textarea.selectionStart = start + variable.length;
      textarea.selectionEnd = start + variable.length;
      textarea.focus();
    }, 0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length === 0) return;
    e.target.value = "";
    setFormFiles((prev) => {
      const merged = [...prev, ...newFiles].slice(0, MAX_FILES);
      if (merged.length < prev.length + newFiles.length) {
        toast.warning(t("maxFilesReached"));
      }
      return merged;
    });
    setRemoveMedia(false);
    setFormErrors((p) => (p.message ? { ...p, message: undefined } : p));
  };

  const removeFormFile = (index: number) => {
    setFormFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveAllFiles = () => {
    setFormFiles([]);
    setRemoveMedia(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Audio recording ────────────────────────────────────────────────────
  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const startRecording = async () => {
    if (formFiles.length >= MAX_FILES) {
      toast.warning(t("maxFilesReached"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        try {
          const mp3Blob = await convertWebmBlobToMp3(blob);
          const file = new File([mp3Blob], `audio_${Date.now()}.mp3`, { type: "audio/mpeg" });
          setFormFiles((prev) => [...prev, file].slice(0, MAX_FILES));
          // Áudio gravado aqui vai como mensagem de voz por padrão (dá para desligar antes
          // de salvar). Arquivo escolhido pelo seletor não mexe na chave.
          setFormVoice(true);
          setFormErrors((p) => (p.message ? { ...p, message: undefined } : p));
          toast.success(t("audioRecordedAdded"));
        } catch {
          toast.error(t("micPermissionDenied"));
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
    } catch {
      toast.error(t("micPermissionDenied"));
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const stopRecordingAndDiscard = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      try {
        mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current.stop();
      } catch {}
    }
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ── Fechamento com dirty-guard (Esc, clique-fora, X ou Cancelar) ───────
  const attemptCloseDialog = () => {
    if (saving) return;
    if (buildFormSnapshot() !== dialogSnapshotRef.current && !window.confirm(tUnsaved("unsavedChangesDesc"))) return;
    stopRecordingAndDiscard();
    setDialogOpen(false);
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const onSubmit = async () => {
    // Validação inline: marca campos inválidos (borda + mensagem) e foca o primeiro;
    // toast permanece como reforço. Regras inalteradas.
    const errs: { key?: string; message?: string; buttons?: string; list?: string; template?: string; location?: string } = {};
    if (!formKey.trim() || !formKey.startsWith("/")) {
      errs.key = t("errorKeyRequired");
    }
    const existingMediaUrls = editing ? resolveMediaUrls(editing) : [];
    const hasExistingMedia = existingMediaUrls.length > 0 && !removeMedia && formFiles.length === 0;
    if (formMessageType === "text" && !formMessage.trim() && formFiles.length === 0 && !formVoice && !hasExistingMedia) {
      errs.message = t("errorMessageOrAttachment");
    }
    if (formMessageType === "buttons" && !formButtons.buttons.some((b) => b.title.trim())) {
      errs.buttons = t("errorButtonsRequired");
    }
    if (formMessageType === "list" && (!formList.buttonText.trim() || !formList.sections.some((s) => s.rows.some((r) => r.title.trim())))) {
      errs.list = t("errorListRequired");
    }
    if (formMessageType === "template" && !formTemplate.name.trim()) {
      errs.template = t("errorTemplateNameRequired");
    }
    const isLocationType = formMessageType === "location";
    const locationPoint = isLocationType ? locationValueToPoint(formLocation) : null;
    if (isLocationType && !locationPoint) {
      errs.location = tInput("invalidLatLng");
    }
    setFormErrors(errs);
    const firstInvalid = (["key", "message", "buttons", "list", "template", "location"] as const).find((k) => errs[k]);
    if (firstInvalid) {
      toast.error(errs[firstInvalid] as string);
      // Localização: o foco vai para a latitude (os campos são do LocationPickerFields).
      const el = document.getElementById(firstInvalid === "location" ? "fastreply-field-location-lat" : `fastreply-field-${firstInvalid}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement | null)?.focus?.({ preventScroll: true });
      return;
    }

    const structuredPayload = {
      messageType: formMessageType,
      buttonsJson: formMessageType === "buttons" ? formButtons : null,
      listJson: formMessageType === "list" ? formList : null,
      templateJson: formMessageType === "template" ? formTemplate : null,
    };
    // Localização: o `message` é montado dos campos (nome, endereço, Google Maps e Waze —
    // legível como texto nos canais sem localização e no app antigo) e nunca leva mídia nem voz.
    const messageToSave = isLocationType && locationPoint ? buildQuickReplyLocationMessage(locationPoint) : formMessage;

    setSaving(true);
    try {
      if (editing) {
        await updateFastReply(editing.id, {
          key: formKey,
          message: messageToSave,
          isPublic: formIsPublic,
          voice: isLocationType ? false : formVoice,
          mediaFiles: !isLocationType && formFiles.length > 0 ? formFiles : undefined,
          // Trocada para Localização: a mídia que ela tinha sai junto (sem isso o servidor a mantém).
          removeMedia: isLocationType ? true : formFiles.length === 0 ? removeMedia : false,
          ...structuredPayload,
        });
        toast.success(t("successUpdate"));
      } else {
        await createFastReply({
          key: formKey,
          message: messageToSave,
          isPublic: formIsPublic,
          voice: isLocationType ? false : formVoice,
          mediaFiles: !isLocationType && formFiles.length > 0 ? formFiles : undefined,
          ...structuredPayload,
        });
        toast.success(t("successCreate"));
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      if (getBackendErrorCode(err) === "ERR_FASTREPLY_KEY_TOO_LONG") toast.error(t("shortcutTooLong"));
      else toast.error(editing ? t("errorUpdate") : t("errorCreate"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting || deletingReply) return;
    setDeletingReply(true);
    try {
      await deleteFastReply(deleting.id);
      toast.success(t("successDelete"));
      setDeleting(null);
      load();
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setDeletingReply(false);
    }
  };

  const existingMediaUrls = editing ? resolveMediaUrls(editing) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {t("refresh")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
          </Button>
        </div>
      </PageHeader>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Send}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        >
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
          </Button>
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="key" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-40">{t("colShortcut")}</SortableTableHead>
                  <SortableTableHead sortKey="message" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colMessage")}</SortableTableHead>
                  <TableHead className="w-28">{t("colType")}</TableHead>
                  <TableHead className="w-36">{t("colAttachment")}</TableHead>
                  <TableHead className="w-36">{t("colVoice")}</TableHead>
                  <SortableTableHead sortKey="isPublic" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-28">{t("colVisibility")}</SortableTableHead>
                  <SortableTableHead sortKey="userId" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-28">{t("colUserId")}</SortableTableHead>
                  <TableHead className="w-24">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((msg) => {
                  const mediaUrls = resolveMediaUrls(msg);
                  return (
                    <TableRow key={msg.id}>
                      <TableCell>
                        <code className="rounded bg-muted px-2 py-1 text-sm font-semibold">
                          {msg.key}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate text-sm">{describeLocationReply(msg) ?? (msg.message || "—")}</p>
                      </TableCell>
                      <TableCell>
                        {(!msg.messageType || msg.messageType === "text") && <Badge variant="secondary" className="text-[10px]">{t("typeText")}</Badge>}
                        {msg.messageType === "buttons" && <Badge variant="outline" className="text-[10px] border-blue-400 text-blue-600">{t("typeButtons")}</Badge>}
                        {msg.messageType === "list" && <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-600">{t("typeList")}</Badge>}
                        {msg.messageType === "template" && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">{t("typeTemplate")}</Badge>}
                        {msg.messageType === "location" && <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-600" title={tShare("quickReplyTypeNote")}>{tShare("quickReplyBadge")}</Badge>}
                      </TableCell>
                      <TableCell>
                        {mediaUrls.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {mediaUrls.map((url, i) => (
                              <button
                                key={i}
                                onClick={() => setViewMediaUrl(url)}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline cursor-pointer"
                              >
                                <Paperclip className="h-3 w-3 flex-shrink-0" />
                                {mediaUrls.length > 1 ? `${t("openFile")} ${i + 1}` : t("openFile")}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("noFile")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {msg.voice === "enabled" ? (
                          <Badge variant="success" className="text-[10px]">
                            <Mic className="h-3 w-3 mr-1" />{t("voiceActive")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">{t("voiceInactive")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={msg.isPublic ? "success" : "secondary"}>
                          {msg.isPublic ? t("public") : t("private")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {msg.userId ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={tCommon("edit")}
                            disabled={!podeGerenciar(msg)}
                            onClick={() => openEdit(msg)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={tCommon("delete")}
                            disabled={!podeGerenciar(msg)}
                            onClick={() => setDeleting(msg)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (open) setDialogOpen(true); else attemptCloseDialog(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("newTitle")}</DialogTitle>
            <DialogDescription>
              {editing ? t("editDescription") : t("createDescription")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!saving && !recording) onSubmit(); }}>
          <div className="space-y-4 py-2 overflow-y-auto max-h-[70vh] pr-1">
            <div className="space-y-2">
              <Label>{t("shortcutLabel")}</Label>
              <Input
                id="fastreply-field-key"
                value={formKey}
                maxLength={255}
                aria-invalid={!!formErrors.key}
                className={formErrors.key ? "border-destructive focus-visible:ring-destructive" : undefined}
                onChange={(e) => { setFormKey(e.target.value); if (formErrors.key) setFormErrors((p) => ({ ...p, key: undefined })); }}
                placeholder="/saudacao"
              />
              {formErrors.key && <p className="text-xs text-destructive">{formErrors.key}</p>}
              <p className="text-xs text-muted-foreground">
                {t("shortcutHint")}
              </p>
            </div>

            {/* Localização: o texto é montado dos campos do local (sem mensagem nem variáveis) */}
            {formMessageType !== "location" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("messageLabel")}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      {t("variables")} <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-60 overflow-y-auto">
                    {variableOptions.map((v) => (
                      <DropdownMenuItem
                        key={v.value}
                        onClick={() => insertVariable(v.value)}
                        className={v.descKey ? "flex-col items-start gap-0.5" : undefined}
                      >
                        <code className="text-xs">{v.label}</code>
                        {v.descKey && (
                          <span className="max-w-[220px] text-[11px] leading-snug text-muted-foreground">{t(v.descKey)}</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea
                id="fastreply-field-message"
                ref={textareaRef}
                value={formMessage}
                aria-invalid={!!formErrors.message}
                className={formErrors.message ? "border-destructive focus-visible:ring-destructive" : undefined}
                onChange={(e) => { setFormMessage(e.target.value); if (formErrors.message) setFormErrors((p) => ({ ...p, message: undefined })); }}
                placeholder={t("messagePlaceholder")}
                rows={4}
              />
              {formErrors.message && <p className="text-xs text-destructive">{formErrors.message}</p>}
            </div>
            )}

            {/* Message type selector */}
            <div className="space-y-2">
              <Label>{t("msgType")}</Label>
              <div className="flex gap-1 flex-wrap">
                {(["text", "buttons", "list", "template", "location"] as const).map((type) => (
                  <Button key={type} type="button" size="sm"
                    variant={formMessageType === type ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => {
                      // Localização não tem anexo nem voz: a gravação em andamento é descartada
                      // (a barra some junto com os anexos e o microfone não fica ligado).
                      if (type === "location" && recording) stopRecordingAndDiscard();
                      setFormMessageType(type);
                      setFormErrors((p) => ({ key: p.key }));
                    }}>
                    {type === "location" ? tShare("quickReplyType") : t(`type${type.charAt(0).toUpperCase() + type.slice(1)}` as any)}
                  </Button>
                ))}
              </div>
              {(formMessageType === "buttons" || formMessageType === "list") && (
                <p className="text-xs text-muted-foreground">{t("buttonsListNote")}</p>
              )}
              {formMessageType === "template" && (
                <p className="text-xs text-amber-600">{t("wabaOnlyNote")}</p>
              )}
            </div>

            {/* Buttons builder */}
            {formMessageType === "buttons" && (
              <div className="space-y-3 rounded border p-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("buttonsTitle")}</Label>
                    <Input value={formButtons.title} maxLength={WABA_LIMITS.body} onChange={(e) => setFormButtons((p) => ({ ...p, title: e.target.value }))} placeholder={t("buttonsTitlePlaceholder")} className="h-8 text-sm" />
                    <p className="text-[10px] text-muted-foreground text-right">{formButtons.title.length}/{WABA_LIMITS.body}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("buttonsFooter")}</Label>
                    <Input value={formButtons.footer} maxLength={WABA_LIMITS.footer} onChange={(e) => setFormButtons((p) => ({ ...p, footer: e.target.value }))} placeholder={t("buttonsFooterPlaceholder")} className="h-8 text-sm" />
                    <p className="text-[10px] text-muted-foreground text-right">{formButtons.footer.length}/{WABA_LIMITS.footer}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {formErrors.buttons && <p className="text-xs text-destructive">{formErrors.buttons}</p>}
                  {formButtons.buttons.map((btn, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-14 shrink-0">{t("button")} {i + 1}</span>
                      <Input value={btn.title} maxLength={20}
                        id={i === 0 ? "fastreply-field-buttons" : undefined}
                        aria-invalid={!!formErrors.buttons}
                        onChange={(e) => { setFormButtons((p) => { const buttons = [...p.buttons]; buttons[i] = { ...buttons[i], title: e.target.value }; return { ...p, buttons }; }); if (formErrors.buttons) setFormErrors((p) => ({ ...p, buttons: undefined })); }}
                        placeholder={t("buttonPlaceholder")} className={`h-8 text-sm flex-1 ${formErrors.buttons ? "border-destructive focus-visible:ring-destructive" : ""}`} />
                      {formButtons.buttons.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          onClick={() => setFormButtons((p) => ({ ...p, buttons: p.buttons.filter((_, j) => j !== i) }))}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {formButtons.buttons.length < 3 && (
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => setFormButtons((p) => ({ ...p, buttons: [...p.buttons, { id: String(p.buttons.length + 1), title: "" }] }))}>
                    <Plus className="mr-1 h-3 w-3" /> {t("addButton")}
                  </Button>
                )}
              </div>
            )}

            {/* List builder */}
            {formMessageType === "list" && (
              <div className="space-y-3 rounded border p-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("listTitle")}</Label>
                    <Input value={formList.title} maxLength={WABA_LIMITS.headerText} onChange={(e) => setFormList((p) => ({ ...p, title: e.target.value }))} placeholder={t("listTitlePlaceholder")} className="h-8 text-sm" />
                    <p className="text-[10px] text-muted-foreground text-right">{formList.title.length}/{WABA_LIMITS.headerText}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("listButtonText")} *</Label>
                    <Input
                      id="fastreply-field-list"
                      value={formList.buttonText}
                      maxLength={WABA_LIMITS.listButton}
                      aria-invalid={!!formErrors.list}
                      onChange={(e) => { setFormList((p) => ({ ...p, buttonText: e.target.value })); if (formErrors.list) setFormErrors((p) => ({ ...p, list: undefined })); }}
                      placeholder={t("listButtonTextPlaceholder")}
                      className={`h-8 text-sm ${formErrors.list ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {formErrors.list && <p className="text-xs text-destructive">{formErrors.list}</p>}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("listFooter")}</Label>
                  <Input value={formList.footer} maxLength={WABA_LIMITS.footer} onChange={(e) => setFormList((p) => ({ ...p, footer: e.target.value }))} placeholder={t("listFooterPlaceholder")} className="h-8 text-sm" />
                  <p className="text-[10px] text-muted-foreground text-right">{formList.footer.length}/{WABA_LIMITS.footer}</p>
                </div>
                {formList.sections.map((section, si) => (
                  <div key={si} className="rounded border p-2 space-y-2 bg-background">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground shrink-0">{t("section")} {si + 1}</span>
                      <Input value={section.title} maxLength={WABA_LIMITS.sectionTitle}
                        onChange={(e) => setFormList((p) => { const sections = [...p.sections]; sections[si] = { ...sections[si], title: e.target.value }; return { ...p, sections }; })}
                        placeholder={t("sectionTitlePlaceholder")} className="h-7 text-xs flex-1" />
                      {formList.sections.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                          onClick={() => setFormList((p) => ({ ...p, sections: p.sections.filter((_, j) => j !== si) }))}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {section.rows.map((row, ri) => (
                      <div key={ri} className="flex items-start gap-2 pl-2">
                        <div className="flex-1 space-y-1">
                          <Input value={row.title} maxLength={WABA_LIMITS.rowTitle}
                            onChange={(e) => { setFormList((p) => { const sections = [...p.sections]; const rows = [...sections[si].rows]; rows[ri] = { ...rows[ri], title: e.target.value }; sections[si] = { ...sections[si], rows }; return { ...p, sections }; }); if (formErrors.list) setFormErrors((p) => ({ ...p, list: undefined })); }}
                            placeholder={t("rowTitlePlaceholder")} className="h-7 text-xs" />
                          <Input value={row.description} maxLength={WABA_LIMITS.rowDescription}
                            onChange={(e) => setFormList((p) => { const sections = [...p.sections]; const rows = [...sections[si].rows]; rows[ri] = { ...rows[ri], description: e.target.value }; sections[si] = { ...sections[si], rows }; return { ...p, sections }; })}
                            placeholder={t("rowDescriptionPlaceholder")} className="h-7 text-xs" />
                        </div>
                        {section.rows.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 mt-0.5"
                            onClick={() => setFormList((p) => { const sections = [...p.sections]; sections[si] = { ...sections[si], rows: sections[si].rows.filter((_, j) => j !== ri) }; return { ...p, sections }; })}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {formList.sections.reduce((n, s) => n + s.rows.length, 0) < WABA_LIMITS.maxRowsTotal && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs ml-2"
                        onClick={() => setFormList((p) => { const sections = [...p.sections]; sections[si] = { ...sections[si], rows: [...sections[si].rows, { id: String(sections[si].rows.length + 1), title: "", description: "" }] }; return { ...p, sections }; })}>
                        <Plus className="mr-1 h-3 w-3" /> {t("addRow")}
                      </Button>
                    )}
                  </div>
                ))}
                {formList.sections.length < WABA_LIMITS.maxSections && formList.sections.reduce((n, s) => n + s.rows.length, 0) < WABA_LIMITS.maxRowsTotal && (
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => setFormList((p) => ({ ...p, sections: [...p.sections, { title: "", rows: [{ id: "1", title: "", description: "" }] }] }))}>
                    <Plus className="mr-1 h-3 w-3" /> {t("addSection")}
                  </Button>
                )}
              </div>
            )}

            {/* Template form */}
            {formMessageType === "template" && (
              <div className="space-y-3 rounded border p-3 bg-amber-50/50 dark:bg-amber-950/20">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("templateName")} *</Label>
                    <Input
                      id="fastreply-field-template"
                      value={formTemplate.name}
                      aria-invalid={!!formErrors.template}
                      onChange={(e) => { setFormTemplate((p) => ({ ...p, name: e.target.value })); if (formErrors.template) setFormErrors((p) => ({ ...p, template: undefined })); }}
                      placeholder={t("templateNamePlaceholder")}
                      className={`h-8 text-sm ${formErrors.template ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {formErrors.template && <p className="text-xs text-destructive">{formErrors.template}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("templateLanguage")}</Label>
                    <Input value={formTemplate.language} onChange={(e) => setFormTemplate((p) => ({ ...p, language: e.target.value }))} placeholder={t("templateLanguagePlaceholder")} className="h-8 text-sm" />
                  </div>
                </div>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{t("templateHowItWorks")}</span>
                </p>
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{t("templateAlert")}</span>
                </p>
              </div>
            )}

            {/* Localização: colar link ou coordenadas, conferir no mapa, nome e endereço */}
            {formMessageType === "location" && (
              <div className="space-y-3 rounded border p-3 bg-muted/30">
                {locationUnreadable && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{tShare("quickReplyUnreadable")}</span>
                  </p>
                )}
                {formErrors.location && <p className="text-xs text-destructive">{formErrors.location}</p>}
                <LocationPickerFields
                  compact
                  idPrefix="fastreply-field-location"
                  value={formLocation}
                  onChange={(next) => {
                    setFormLocation(next);
                    if (formErrors.location) setFormErrors((p) => ({ ...p, location: undefined }));
                    // O aviso de "não consegui ler" sai quando o local volta a ser válido.
                    if (locationUnreadable && locationValueToPoint(next)) setLocationUnreadable(false);
                  }}
                />
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{tShare("quickReplyTypeNote")}</span>
                </p>
              </div>
            )}

            {/* Media attachments — up to 5 files + audio recording (Localização não leva anexo nem voz) */}
            {formMessageType !== "location" && (
            <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("attachmentLabel")}</Label>
                <p className="text-xs text-muted-foreground">{t("attachmentHint")}</p>
              </div>

              {/* Existing media (edit mode, not replaced yet) */}
              {editing && existingMediaUrls.length > 0 && !removeMedia && formFiles.length === 0 && (
                <div className="rounded border p-2 space-y-2">
                  {existingMediaUrls.map((url, i) => {
                    const type = getFileType(url);
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        {type === "image" ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={url}
                            alt={t("filePreviewAlt")}
                            className="max-h-16 w-auto rounded object-contain border bg-muted"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : type === "audio" ? (
                          <audio controls className="flex-1 h-8">
                            <source src={url} />
                          </audio>
                        ) : (
                          <span className="flex-1 truncate text-xs text-muted-foreground">{t("existingMedia")} {i + 1}</span>
                        )}
                      </div>
                    );
                  })}
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={handleRemoveAllFiles}>
                    <X className="mr-1 h-3 w-3" /> {t("removeFile")}
                  </Button>
                </div>
              )}

              {/* New files selected */}
              {formFiles.length > 0 && (
                <div className="rounded border p-2 space-y-1">
                  {formFiles.map((file, i) => {
                    const isAudio = file.type.startsWith("audio/");
                    const isImage = file.type.startsWith("image/");
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {isImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="h-10 w-10 rounded object-cover border bg-muted flex-shrink-0"
                          />
                        ) : isAudio ? (
                          <audio controls className="flex-1 h-8">
                            <source src={URL.createObjectURL(file)} type={file.type} />
                          </audio>
                        ) : (
                          <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        {!isAudio && (
                          <span className="flex-1 truncate text-xs text-muted-foreground">{file.name}</span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={() => removeFormFile(i)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Recording bar */}
              {recording && (
                <div className="flex items-center gap-3 rounded border px-3 py-2 bg-red-50 dark:bg-red-950/20">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-medium text-red-600">{t("recording")}</span>
                  <span className="text-sm font-mono tabular-nums text-muted-foreground ml-auto">{fmtTime(recordingTime)}</span>
                  <Button type="button" size="sm" variant="destructive" className="h-7 gap-1" onClick={stopRecording}>
                    <Square className="h-3 w-3" /> {t("stopRecording")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7" onClick={stopRecordingAndDiscard}>
                    {t("cancelRecording")}
                  </Button>
                </div>
              )}

              {/* Action buttons for adding files / recording */}
              {!recording && formFiles.length < MAX_FILES && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="mr-2 h-4 w-4" />
                    {t("addMoreFiles")}
                    {formFiles.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        {formFiles.length}/{MAX_FILES}
                      </Badge>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={startRecording}
                  >
                    <Mic className="mr-2 h-4 w-4" />
                    {t("recordAudio")}
                  </Button>
                </div>
              )}

              {formFiles.length === 0 && !recording && !(editing && existingMediaUrls.length > 0 && !removeMedia) && (
                <p className="text-xs text-muted-foreground">{t("noFiles")}</p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                multiple
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={formVoice}
                onCheckedChange={setFormVoice}
              />
              <div>
                <Label>{t("voiceLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("voiceHint")}
                </p>
              </div>
            </div>
            </>
            )}

            <div className="flex items-center gap-3">
              <Switch
                checked={formIsPublic}
                onCheckedChange={setFormIsPublic}
              />
              <div>
                <Label>{t("publicLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("publicHint")}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={attemptCloseDialog}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving || recording}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o && !deletingReply) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteCannotUndo")}</DialogDescription>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">
            {t("deleteConfirm")} <strong>{deleting?.key}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deletingReply}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingReply} className="gap-1">
              {deletingReply && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media Viewer Dialog */}
      <Dialog open={!!viewMediaUrl} onOpenChange={() => setViewMediaUrl(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("viewFileTitle")}</DialogTitle>
            <DialogDescription>{t("viewFileDescription")}</DialogDescription>
          </DialogHeader>
          <div className="py-2 flex flex-col items-center gap-4">
            {viewMediaUrl && (() => {
              const type = getFileType(viewMediaUrl);
              if (type === "image") return (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={viewMediaUrl}
                  alt={t("fileAlt")}
                  className="max-h-[70vh] w-auto rounded object-contain border bg-muted"
                />
              );
              if (type === "audio") return (
                <div className="w-full py-4">
                  <audio controls className="w-full">
                    <source src={viewMediaUrl} />
                    {t("audioNotSupported")}
                  </audio>
                </div>
              );
              if (type === "video") return (
                <video controls className="w-full max-h-[70vh] rounded">
                  <source src={viewMediaUrl} />
                  {t("videoNotSupported")}
                </video>
              );
              if (type === "pdf") return (
                <iframe
                  src={viewMediaUrl}
                  className="w-full h-[70vh] rounded border"
                  title="PDF"
                />
              );
              return (
                <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
                  <Paperclip className="h-12 w-12" />
                  <p className="text-sm">{t("fileNotPreviewable")}</p>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            {viewMediaUrl && (
              <a href={viewMediaUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  {tCommon("open")} / {tCommon("download")}
                </Button>
              </a>
            )}
            <Button onClick={() => setViewMediaUrl(null)}>{tCommon("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
