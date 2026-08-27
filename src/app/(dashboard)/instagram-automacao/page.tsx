"use client";

import React, { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TextareaWithVars } from "@/components/shared/variable-picker";
import {
  Plus, Pencil, Trash2, X, Check, ChevronRight, Film, Instagram, Zap, History,
  ShieldCheck, Loader2, Minus, RefreshCw, CalendarClock, FileText, Send, LayoutGrid, Upload, Info, Cloud, Home,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { listMedia, type InstagramMedia } from "@/services/instagram";
import { fetchChatFlows } from "@/services/chatflow";
import {
  listInstagramAutomations, createInstagramAutomation, updateInstagramAutomation,
  toggleInstagramAutomation, deleteInstagramAutomation, listInstagramAutomationLogs,
  diagnoseInstagramAutomationChannel, getInstagramWebhookSetupAuthUrl,
  type InstagramAutomation, type InstagramAutomationLog, type InstagramDiagnosticCheck,
} from "@/services/instagram-automation";
import {
  listInstagramScheduledPosts, createInstagramScheduledPost, updateInstagramScheduledPost,
  deleteInstagramScheduledPost, publishInstagramScheduledPostNow,
  type InstagramScheduledPost, type ScheduledGalleryFile,
} from "@/services/instagram-scheduled";
import { fetchGallery, getGalleryPreviewUrl, type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { checkIgImageFile, checkIgImageUrl } from "@/lib/ig-image-validation";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

type MediaItem = InstagramMedia & { thumbnail_url?: string };
type TriggerType = InstagramAutomation["triggerType"];
type KeywordMatch = InstagramAutomation["keywordMatch"];
type ScheduleWindow = { weekdays: number[]; startTime: string; endTime: string };

const TRIGGER_TYPES: TriggerType[] = [
  "comment", "live_comment", "story_mention", "story_reply", "dm_media_share",
];
const MATCH_OPTIONS: { value: KeywordMatch; key: string }[] = [
  { value: "contains", key: "matchContains" },
  { value: "equals", key: "matchEquals" },
  { value: "startsWith", key: "matchStartsWith" },
  { value: "regex", key: "matchRegex" },
];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

interface FormState {
  name: string;
  triggerType: TriggerType;
  priority: number;
  mediaAll: boolean;
  mediaIds: string[];
  keywords: string[];
  keywordMatch: KeywordMatch;
  excludeKeywords: string[];
  oncePerContactHours: number;
  scheduleEnabled: boolean;
  scheduleWindows: ScheduleWindow[];
  replyPublicEnabled: boolean;
  replyPublicTexts: string[];
  replyDmEnabled: boolean;
  replyDmText: string;
  replyDmMediaUrl: string;
  chatFlowId: number | null;
  followUpEnabled: boolean;
  followUpMinutes: number;
  followUpText: string;
}

const defaultForm = (): FormState => ({
  name: "",
  triggerType: "comment",
  priority: 0,
  mediaAll: true,
  mediaIds: [],
  keywords: [],
  keywordMatch: "contains",
  excludeKeywords: [],
  oncePerContactHours: 24,
  scheduleEnabled: false,
  scheduleWindows: [],
  replyPublicEnabled: false,
  replyPublicTexts: [],
  replyDmEnabled: false,
  replyDmText: "",
  replyDmMediaUrl: "",
  chatFlowId: null,
  followUpEnabled: false,
  followUpMinutes: 60,
  followUpText: "",
});

function ChipList({ items, onRemove }: { items: string[]; onRemove: (idx: number) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, idx) => (
        <Badge key={`${item}-${idx}`} variant="secondary" className="gap-1 max-w-full">
          <span className="truncate">{item}</span>
          <button type="button" onClick={() => onRemove(idx)} className="hover:text-destructive shrink-0">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

const isOAuthChannel = (c?: Whatsapp) => c?.webhookOrigin === "zdg_oauth";

const ChannelAppIcon = ({ conn, ownLabel, oauthLabel }: { conn?: Whatsapp; ownLabel: string; oauthLabel: string }) => {
  if (!conn) return null;
  const oauth = isOAuthChannel(conn);
  const Icon = oauth ? Cloud : Home;
  return (
    <span
      title={oauth ? oauthLabel : ownLabel}
      className={`inline-flex shrink-0 ${oauth ? "text-violet-500 dark:text-violet-400" : "text-sky-500 dark:text-sky-400"}`}
    >
      <Icon className="h-3.5 w-3.5 opacity-80" />
    </span>
  );
};

export default function InstagramAutomacaoPage() {
  const t = useTranslations("instagramAutomacaoPage");
  const tBadge = useTranslations("channelAppType");
  const allowed = usePageAccess("instagramAutomacao", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;

  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Whatsapp[]>([]);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [activeTab, setActiveTab] = useState<"automations" | "history" | "posts">("automations");

  const [automations, setAutomations] = useState<InstagramAutomation[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(false);
  const [logs, setLogs] = useState<InstagramAutomationLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InstagramAutomation | null>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [chatFlows, setChatFlows] = useState<{ id: number; name: string }[]>([]);

  const [keywordInput, setKeywordInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [replyPublicInput, setReplyPublicInput] = useState("");
  const [dmMediaPickerOpen, setDmMediaPickerOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<InstagramAutomation | null>(null);

  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagChecks, setDiagChecks] = useState<InstagramDiagnosticCheck[] | null>(null);

  const runDiagnostic = async () => {
    if (!selectedConnection) return;
    setDiagOpen(true);
    setDiagLoading(true);
    setDiagChecks(null);
    try {
      const res = await diagnoseInstagramAutomationChannel(Number(selectedConnection));
      setDiagChecks(res.data?.checks || []);
    } catch {
      toast.error(t("toastError"));
      setDiagOpen(false);
    } finally {
      setDiagLoading(false);
    }
  };

  // ── Posts agendados/rascunhos (aba) ────────────────────────────────────────
  const [scheduledPosts, setScheduledPosts] = useState<InstagramScheduledPost[]>([]);
  const [loadingScheduledPosts, setLoadingScheduledPosts] = useState(false);
  const [publishingNowIds, setPublishingNowIds] = useState<Set<number>>(new Set());
  const [deleteScheduledTarget, setDeleteScheduledTarget] = useState<InstagramScheduledPost | null>(null);
  const [editScheduledPost, setEditScheduledPost] = useState<InstagramScheduledPost | null>(null);
  const [editScheduledCaption, setEditScheduledCaption] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [savingScheduled, setSavingScheduled] = useState(false);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [newPostType, setNewPostType] = useState<"photo" | "reel" | "carousel">("photo");
  const [newPostFiles, setNewPostFiles] = useState<File[]>([]);
  const [newPostCaption, setNewPostCaption] = useState("");
  const [newPostShareToFeed, setNewPostShareToFeed] = useState(true);
  const [newPostScheduleAt, setNewPostScheduleAt] = useState("");
  const [creatingScheduled, setCreatingScheduled] = useState(false);
  // Picker da galeria (além do upload local)
  const [newPostGalleryFiles, setNewPostGalleryFiles] = useState<ScheduledGalleryFile[]>([]);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [gallerySelection, setGallerySelection] = useState<Set<number>>(new Set());

  const openGalleryPicker = async () => {
    setGalleryPickerOpen(true);
    setGallerySelection(new Set());
    setLoadingGallery(true);
    try {
      const res = await fetchGallery({
        fileType: newPostType === "photo" ? "image" : newPostType === "reel" ? "video" : undefined,
      });
      // Só imagem/vídeo servem para post IG
      setGalleryItems(res.data.filter((g) => g.type.startsWith("image/") || g.type.startsWith("video/")));
    } catch {
      toast.error(t("toastError"));
      setGalleryPickerOpen(false);
    } finally {
      setLoadingGallery(false);
    }
  };

  const confirmGallerySelection = async () => {
    const candidates = galleryItems
      .filter((g) => gallerySelection.has(g.id))
      .map((g) => ({ url: g.url, isVideo: g.type.startsWith("video/"), originalName: g.name }));
    // Valida proporção/largura mínima do feed IG nas imagens da galeria (o backend revalida)
    const picked: typeof candidates = [];
    for (const c of candidates) {
      if (!c.isVideo) {
        const check = await checkIgImageUrl(c.url);
        if (!check.ok) {
          toast.error(
            t(check.reason === "aspect" ? "igImageAspectError" : "igImageTooSmallError", {
              name: c.originalName || c.url,
              width: check.width,
              height: check.height,
            })
          );
          continue;
        }
      }
      picked.push(c);
    }
    const maxTotal = newPostType === "carousel" ? 10 : 1;
    setNewPostGalleryFiles((prev) => {
      const merged = [...prev, ...picked];
      const room = Math.max(0, maxTotal - newPostFiles.length);
      return merged.slice(0, room);
    });
    setGalleryPickerOpen(false);
  };

  const toLocalInputValue = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const loadScheduledPosts = useCallback(async (connId: string) => {
    if (!connId) return;
    setLoadingScheduledPosts(true);
    try {
      const res = await listInstagramScheduledPosts(Number(connId));
      setScheduledPosts(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error(t("errorLoadScheduled"));
    } finally {
      setLoadingScheduledPosts(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "posts" && selectedConnection) loadScheduledPosts(selectedConnection);
  }, [activeTab, selectedConnection, loadScheduledPosts]);

  const resetNewPost = () => {
    setNewPostType("photo");
    setNewPostFiles([]);
    setNewPostGalleryFiles([]);
    setNewPostCaption("");
    setNewPostShareToFeed(true);
    setNewPostScheduleAt("");
  };

  const handleNewPostFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    if (selected.length === 0) return;
    // Valida proporção/largura mínima do feed IG já na seleção (o backend revalida)
    const files: File[] = [];
    for (const f of selected) {
      const check = await checkIgImageFile(f);
      if (!check.ok) {
        toast.error(
          t(check.reason === "aspect" ? "igImageAspectError" : "igImageTooSmallError", {
            name: f.name,
            width: check.width,
            height: check.height,
          })
        );
        continue;
      }
      files.push(f);
    }
    if (files.length === 0) return;
    if (newPostType === "photo" || newPostType === "reel") setNewPostFiles([files[0]]);
    else setNewPostFiles((prev) => [...prev, ...files].slice(0, 10));
  };

  const validateNewPost = (): string | null => {
    const localVideo = newPostFiles.some((f) => f.type.startsWith("video/"));
    const localImage = newPostFiles.some((f) => f.type.startsWith("image/"));
    const galleryVideo = newPostGalleryFiles.some((g) => g.isVideo);
    const galleryImage = newPostGalleryFiles.some((g) => !g.isVideo);
    const total = newPostFiles.length + newPostGalleryFiles.length;
    if (total === 0) return t("validationFiles");
    if (newPostType === "photo" && (total !== 1 || localVideo || galleryVideo)) return t("validationFiles");
    if (newPostType === "reel" && (total !== 1 || localImage || galleryImage)) return t("validationFiles");
    if (newPostType === "carousel" && (total < 2 || total > 10)) return t("validationFiles");
    return null;
  };

  const handleCreateScheduled = async (status: "draft" | "scheduled") => {
    if (!selectedConnection) return;
    const err = validateNewPost();
    if (err) { toast.error(err); return; }
    if (status === "scheduled" && !newPostScheduleAt) { toast.error(t("scheduleAtRequired")); return; }
    setCreatingScheduled(true);
    try {
      await createInstagramScheduledPost({
        whatsappId: Number(selectedConnection),
        mediaType: newPostType,
        caption: newPostCaption || undefined,
        shareToFeed: newPostType === "reel" ? newPostShareToFeed : undefined,
        status,
        scheduledAt: newPostScheduleAt ? new Date(newPostScheduleAt).toISOString() : undefined,
        files: newPostFiles,
        galleryFiles: newPostGalleryFiles,
      });
      toast.success(status === "draft" ? t("draftSaved") : t("postScheduled"));
      setNewPostOpen(false);
      resetNewPost();
      loadScheduledPosts(selectedConnection);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message;
      toast.error(msg || t("toastError"));
    } finally {
      setCreatingScheduled(false);
    }
  };

  const handlePublishScheduledNow = async (post: InstagramScheduledPost) => {
    setPublishingNowIds((prev) => new Set([...prev, post.id]));
    try {
      const res = await publishInstagramScheduledPostNow(post.id);
      toast.success(t("publishNowSuccess", { id: res.data.mediaId }));
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message;
      toast.error(msg || t("toastError"));
    } finally {
      setPublishingNowIds((prev) => { const next = new Set(prev); next.delete(post.id); return next; });
      loadScheduledPosts(selectedConnection);
    }
  };

  const confirmDeleteScheduled = async () => {
    const post = deleteScheduledTarget;
    if (!post) return;
    setDeleteScheduledTarget(null);
    try {
      await deleteInstagramScheduledPost(post.id);
      toast.success(t("scheduledDeleted"));
      setScheduledPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message;
      toast.error(msg || t("toastError"));
    }
  };

  const openEditScheduled = (post: InstagramScheduledPost) => {
    setEditScheduledPost(post);
    setEditScheduledCaption(post.caption || "");
    setEditScheduledAt(toLocalInputValue(post.scheduledAt));
  };

  const handleSaveScheduledEdit = async (status: "draft" | "scheduled") => {
    if (!editScheduledPost) return;
    if (status === "scheduled" && !editScheduledAt) { toast.error(t("scheduleAtRequired")); return; }
    setSavingScheduled(true);
    try {
      await updateInstagramScheduledPost(editScheduledPost.id, {
        caption: editScheduledCaption,
        scheduledAt: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
        status,
      });
      toast.success(t("scheduledUpdated"));
      setEditScheduledPost(null);
      loadScheduledPosts(selectedConnection);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message;
      toast.error(msg || t("toastError"));
    } finally {
      setSavingScheduled(false);
    }
  };

  // Popup OAuth de revalidação do webhook — mesma UX do /sessoes
  const revalidateWebhook = async () => {
    if (!selectedConnection) return;
    try {
      const { data } = await getInstagramWebhookSetupAuthUrl(Number(selectedConnection));
      if (data?.authUrl) {
        window.open(data.authUrl, "instagram_webhook_setup", "width=560,height=480,scrollbars=yes,resizable=yes");
      } else {
        toast.error(t("toastError"));
      }
    } catch {
      toast.error(t("toastError"));
    }
  };

  // Quando o popup de revalidação conclui (postMessage do proxy), re-testa sozinho
  useEffect(() => {
    function handleWebhookSetup(event: MessageEvent) {
      if (event.data?.type === "instagram:webhook:setup:success" && diagOpen) {
        runDiagnostic();
      }
    }
    window.addEventListener("message", handleWebhookSetup);
    return () => window.removeEventListener("message", handleWebhookSetup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagOpen, selectedConnection]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const selectedConn = connections.find((c) => String(c.id) === selectedConnection);
  // Banner só faz sentido para canal via OAuth (Tech Provider). App próprio já tem as permissões.
  const showOauthLimit = !selectedConn || isOAuthChannel(selectedConn);

  const needsMediaStep = form.triggerType === "comment" || form.triggerType === "live_comment";
  const allowsPublicReply = needsMediaStep;
  const allowsDm = form.triggerType !== "live_comment";
  const stepIds = needsMediaStep ? [1, 2, 3, 4] : [1, 3, 4];
  const stepLabels: Record<number, string> = {
    1: t("stepTrigger"),
    2: t("stepMedia"),
    3: t("stepConditions"),
    4: t("stepActions"),
  };
  const stepIndex = stepIds.indexOf(step);
  const isLastStep = stepIndex === stepIds.length - 1;

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetchWhatsapps();
      const all = Array.isArray(res.data) ? res.data : [];
      const igs = all.filter((c) => c.type === "instagram");
      setConnections(igs);
      if (igs.length > 0) setSelectedConnection((prev) => prev || String(igs[0].id));
    } catch {
      toast.error(t("toastError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const loadAutomations = useCallback(async (connId: string) => {
    if (!connId) return;
    setLoadingAutomations(true);
    try {
      const res = await listInstagramAutomations(Number(connId));
      setAutomations(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error(t("toastError"));
    } finally {
      setLoadingAutomations(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConnection) loadAutomations(selectedConnection);
  }, [selectedConnection, loadAutomations]);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await listInstagramAutomationLogs("all", 200);
      setLogs(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error(t("toastError"));
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "history") loadLogs();
  }, [activeTab, loadLogs]);

  const loadChatFlows = useCallback(async () => {
    try {
      const res = await fetchChatFlows();
      const data = res.data as any;
      const list = Array.isArray(data) ? data : data?.chatFlow ?? [];
      setChatFlows(list.map((f: any) => ({ id: f.id, name: f.name })));
    } catch {
      setChatFlows([]);
    }
  }, []);

  const loadMediaList = useCallback(async (connId: string) => {
    if (!connId) return;
    setLoadingMedia(true);
    try {
      const res = await listMedia(Number(connId));
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw as { data?: MediaItem[] })?.data ?? [];
      setMediaList(list as MediaItem[]);
    } catch {
      setMediaList([]);
    } finally {
      setLoadingMedia(false);
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm());
    setKeywordInput("");
    setExcludeInput("");
    setReplyPublicInput("");
    setStep(1);
    setDialogOpen(true);
    loadChatFlows();
    loadMediaList(selectedConnection);
  };

  const openEdit = (a: InstagramAutomation) => {
    setEditing(a);
    setForm({
      name: a.name,
      triggerType: a.triggerType,
      priority: a.priority ?? 0,
      mediaAll: (a.mediaIds || []).length === 0,
      mediaIds: a.mediaIds || [],
      keywords: a.keywords || [],
      keywordMatch: a.keywordMatch || "contains",
      excludeKeywords: a.excludeKeywords || [],
      oncePerContactHours: a.oncePerContactHours ?? 24,
      scheduleEnabled: !!a.scheduleEnabled,
      scheduleWindows: a.scheduleWindows || [],
      replyPublicEnabled: !!a.replyPublicEnabled,
      replyPublicTexts: a.replyPublicTexts || [],
      replyDmEnabled: !!a.replyDmEnabled,
      replyDmText: a.replyDmText || "",
      replyDmMediaUrl: a.replyDmMediaUrl || "",
      chatFlowId: a.chatFlowId ?? null,
      followUpEnabled: !!a.followUpEnabled,
      followUpMinutes: a.followUpMinutes ?? 60,
      followUpText: a.followUpText || "",
    });
    setKeywordInput("");
    setExcludeInput("");
    setReplyPublicInput("");
    setStep(1);
    setDialogOpen(true);
    loadChatFlows();
    loadMediaList(String(a.whatsappId));
  };

  const handleToggle = async (a: InstagramAutomation) => {
    try {
      await toggleInstagramAutomation(a.id);
      setAutomations((prev) => prev.map((it) => it.id === a.id ? { ...it, isActive: !it.isActive } : it));
      toast.success(t("toastSaved"));
    } catch {
      toast.error(t("toastError"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteInstagramAutomation(deleteTarget.id);
      setAutomations((prev) => prev.filter((it) => it.id !== deleteTarget.id));
      toast.success(t("toastDeleted"));
    } catch {
      toast.error(t("toastError"));
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t("toastError"));
      setStep(1);
      return;
    }
    setSaving(true);
    const payload: Partial<InstagramAutomation> = {
      whatsappId: Number(selectedConnection),
      name: form.name.trim(),
      triggerType: form.triggerType,
      priority: form.priority,
      mediaIds: needsMediaStep && !form.mediaAll ? form.mediaIds : [],
      keywords: form.keywords,
      keywordMatch: form.keywordMatch,
      excludeKeywords: form.excludeKeywords,
      oncePerContactHours: form.oncePerContactHours,
      scheduleEnabled: form.scheduleEnabled,
      scheduleWindows: form.scheduleWindows,
      replyPublicEnabled: allowsPublicReply ? form.replyPublicEnabled : false,
      replyPublicTexts: allowsPublicReply ? form.replyPublicTexts : [],
      replyDmEnabled: allowsDm ? form.replyDmEnabled : false,
      replyDmText: allowsDm && form.replyDmText.trim() ? form.replyDmText : null,
      replyDmMediaUrl: allowsDm && form.replyDmMediaUrl.trim() ? form.replyDmMediaUrl.trim() : null,
      chatFlowId: form.chatFlowId,
      followUpEnabled: form.followUpEnabled,
      followUpMinutes: form.followUpMinutes,
      followUpText: form.followUpText.trim() ? form.followUpText : null,
    };
    try {
      if (editing) {
        await updateInstagramAutomation(editing.id, payload);
      } else {
        await createInstagramAutomation(payload);
      }
      toast.success(t("toastSaved"));
      setDialogOpen(false);
      loadAutomations(selectedConnection);
    } catch {
      toast.error(t("toastError"));
    } finally {
      setSaving(false);
    }
  };

  const addChip = (value: string, field: "keywords" | "excludeKeywords" | "replyPublicTexts") => {
    const v = value.trim();
    if (!v) return;
    if (form[field].includes(v)) return;
    update({ [field]: [...form[field], v] } as Partial<FormState>);
  };

  const toggleMediaSelection = (mediaId: string) => {
    update({
      mediaIds: form.mediaIds.includes(mediaId)
        ? form.mediaIds.filter((id) => id !== mediaId)
        : [...form.mediaIds, mediaId],
    });
  };

  const addWindow = () => {
    update({
      scheduleWindows: [...form.scheduleWindows, { weekdays: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "18:00" }],
    });
  };

  const removeWindow = (idx: number) => {
    update({ scheduleWindows: form.scheduleWindows.filter((_, i) => i !== idx) });
  };

  const updateWindow = (idx: number, patch: Partial<ScheduleWindow>) => {
    update({
      scheduleWindows: form.scheduleWindows.map((w, i) => (i === idx ? { ...w, ...patch } : w)),
    });
  };

  const toggleWindowWeekday = (idx: number, d: number) => {
    const w = form.scheduleWindows[idx];
    const weekdays = (w.weekdays || []).includes(d)
      ? w.weekdays.filter((x) => x !== d)
      : [...w.weekdays, d].sort((a, b) => a - b);
    updateWindow(idx, { weekdays });
  };

  const actionBadges = (log: InstagramAutomationLog) => {
    const a = log.actionsTaken || {};
    return (
      <div className="flex flex-wrap gap-1">
        {a.replyPublic && <Badge variant="secondary" className="text-[10px]">Reply</Badge>}
        {(a.replyDm || a.replyDmMedia) && <Badge variant="secondary" className="text-[10px]">DM</Badge>}
        {a.chatFlowId && <Badge variant="info-soft" className="text-[10px]">Flow</Badge>}
        {a.errors && a.errors.length > 0 && (
          <Badge variant="destructive" className="text-[10px]" title={a.errors.join("; ")}>
            {a.errors.length}
          </Badge>
        )}
        {log.followUpStatus && <Badge variant="outline" className="text-[10px]">{log.followUpStatus}</Badge>}
      </div>
    );
  };

  const triggerLabel = (type: string) => {
    return TRIGGER_TYPES.includes(type as TriggerType) ? t(`trigger_${type}`) : type;
  };

  if (loading && connections.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("subtitle")} help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }} />
        <div className="space-y-4"><Skeleton className="h-10 w-full max-w-md" /><Skeleton className="h-[400px]" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <PageHeader title={t("title")} description={t("subtitle")} help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
          { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
        ],
      }} />

      {showOauthLimit && (
        <Alert variant="warning">
          <Info className="h-4 w-4" />
          <AlertTitle>{t("oauthLimitTitle")}</AlertTitle>
          <AlertDescription>{t("oauthLimitDescription")}</AlertDescription>
        </Alert>
      )}

      {connections.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Instagram className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">{t("noChannels")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-2 w-full max-w-md">
                  <Label>{t("channelLabel")}</Label>
                  <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("channelPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {connections.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)} textValue={c.name}>
                          <span className="flex items-center gap-2">
                            <ChannelAppIcon conn={c} ownLabel={tBadge("own")} oauthLabel={tBadge("oauth")} />
                            {c.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedConn && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ChannelAppIcon conn={selectedConn} ownLabel={tBadge("own")} oauthLabel={tBadge("oauth")} />
                      {isOAuthChannel(selectedConn) ? tBadge("oauth") : tBadge("own")}
                    </span>
                  )}
                </div>
                <Button variant="outline" onClick={runDiagnostic} disabled={!selectedConnection || diagLoading}>
                  {diagLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  {t("validatePermissions")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "automations" | "history" | "posts")} className="space-y-4">
            <TabsList className="grid w-full max-w-lg grid-cols-3">
              <TabsTrigger value="automations" className="gap-2">
                <Zap className="h-4 w-4" />{t("tabAutomations")}
              </TabsTrigger>
              <TabsTrigger value="posts" className="gap-2">
                <CalendarClock className="h-4 w-4" />{t("tabScheduledPosts")}
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" />{t("tabHistory")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="automations" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={openCreate} disabled={!selectedConnection}>
                  <Plus className="mr-2 h-4 w-4" />{t("newAutomation")}
                </Button>
              </div>

              {loadingAutomations ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-md" />)}
                </div>
              ) : automations.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Zap className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">{t("emptyList")}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {automations.map((a) => (
                    <Card key={a.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-sm truncate">{a.name}</span>
                              <Badge variant="secondary">{triggerLabel(a.triggerType)}</Badge>
                              <Badge variant={a.isActive ? "success-soft" : "outline"}>
                                {a.isActive ? t("active") : t("inactive")}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                {(a.mediaIds || []).length === 0
                                  ? t("cardTargetsAll")
                                  : t("cardTargets", { count: a.mediaIds.length })}
                              </span>
                              <span>{t("cardTriggerCount", { count: a.triggerCount || 0 })}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch checked={a.isActive} onCheckedChange={() => handleToggle(a)} />
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(a)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="posts" className="space-y-4">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => loadScheduledPosts(selectedConnection)} disabled={loadingScheduledPosts || !selectedConnection}>
                  <RefreshCw className={loadingScheduledPosts ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                  {t("tabScheduledPosts")}
                </Button>
                <Button onClick={() => { resetNewPost(); setNewPostOpen(true); }} disabled={!selectedConnection}>
                  <Plus className="mr-2 h-4 w-4" />{t("newScheduledPost")}
                </Button>
              </div>

              {loadingScheduledPosts ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-md" />)}
                </div>
              ) : scheduledPosts.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <CalendarClock className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">{t("scheduledEmpty")}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {scheduledPosts.map((p) => {
                    const statusLabel: Record<string, string> = {
                      draft: t("statusDraft"),
                      scheduled: t("statusScheduled"),
                      publishing: t("statusPublishing"),
                      published: t("statusPublished"),
                      failed: t("statusFailed"),
                    };
                    const statusClass =
                      p.status === "published" ? "bg-emerald-500/15 text-emerald-600" :
                      p.status === "failed" ? "bg-destructive/15 text-destructive" :
                      p.status === "publishing" ? "bg-blue-500/15 text-blue-600" :
                      p.status === "scheduled" ? "bg-amber-500/15 text-amber-600" :
                      "bg-muted text-muted-foreground";
                    const isBusy = publishingNowIds.has(p.id) || p.status === "publishing";
                    return (
                      <Card key={p.id}>
                        <CardContent className="flex flex-wrap items-center gap-3 p-4">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                            {p.mediaType === "reel" ? <Film className="h-4 w-4" /> : p.mediaType === "carousel" ? <LayoutGrid className="h-4 w-4" /> : <Instagram className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{p.caption || <span className="italic text-muted-foreground">—</span>}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {t("filesCount", { count: p.files?.length || 0 })}
                              {p.scheduledAt ? ` · ${t("scheduledFor", { date: new Date(p.scheduledAt).toLocaleString() })}` : ""}
                              {p.status === "failed" ? ` · ${t("attemptsLabel", { count: p.attempts })}` : ""}
                            </p>
                            {p.status === "failed" && p.errorMessage && (
                              <p className="truncate text-[11px] text-destructive" title={p.errorMessage}>{p.errorMessage}</p>
                            )}
                          </div>
                          <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${statusClass}`}>
                            {statusLabel[p.status] || p.status}
                          </span>
                          {p.status !== "published" && (
                            <div className="flex shrink-0 items-center gap-1">
                              <Button variant="ghost" size="sm" title={t("publishNow")} disabled={isBusy} onClick={() => handlePublishScheduledNow(p)}>
                                {isBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              </Button>
                              <Button variant="ghost" size="sm" title={t("editScheduledTitle")} disabled={isBusy} onClick={() => openEditScheduled(p)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => setDeleteScheduledTarget(p)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {loadingLogs ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
                </div>
              ) : logs.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <History className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("colDate")}</TableHead>
                          <TableHead>{t("colAutomation")}</TableHead>
                          <TableHead>{t("colTrigger")}</TableHead>
                          <TableHead>{t("colContact")}</TableHead>
                          <TableHead>{t("colText")}</TableHead>
                          <TableHead>{t("colActions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap text-xs">
                              {new Date(log.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs max-w-[160px] truncate">
                              {log.automation?.name || `#${log.automationId}`}
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="secondary" className="text-[10px]">{triggerLabel(log.triggerType)}</Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono max-w-[140px] truncate">{log.contactIgsid}</TableCell>
                            <TableCell className="text-xs max-w-[220px] truncate" title={log.triggerText || ""}>
                              {log.triggerText || "—"}
                            </TableCell>
                            <TableCell>{actionBadges(log)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saving) setDialogOpen(o); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editing ? form.name || t("newAutomation") : t("newAutomation")}</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 overflow-x-auto pb-1">
            {stepIds.map((id, i) => {
              const active = step === id;
              const done = stepIndex > i;
              return (
                <React.Fragment key={id}>
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
                      {i + 1}
                    </div>
                    <span className={`text-xs sm:text-sm whitespace-nowrap ${active ? "font-medium" : "text-muted-foreground"}`}>
                      {stepLabels[id]}
                    </span>
                  </div>
                  {i < stepIds.length - 1 && (
                    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>{t("nameLabel")}</Label>
                <Input
                  placeholder={t("namePlaceholder")}
                  value={form.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("triggerTypeLabel")}</Label>
                <Select value={form.triggerType} onValueChange={(v) => update({ triggerType: v as TriggerType })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{t(`trigger_${type}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t("priorityLabel")}</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => update({ priority: Number(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">{t("priorityHint")}</p>
              </div>
            </div>
          )}

          {step === 2 && needsMediaStep && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
                <Label htmlFor="ia-media-all" className="cursor-pointer">{t("mediaAll")}</Label>
                <Switch
                  id="ia-media-all"
                  checked={form.mediaAll}
                  onCheckedChange={(checked) => update({ mediaAll: checked, ...(checked ? { mediaIds: [] } : {}) })}
                />
              </div>

              {!form.mediaAll && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t("mediaPickerHint")}</p>
                  {loadingMedia ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{t("loadingMedia")}</p>
                  ) : mediaList.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{t("noMedia")}</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {mediaList.map((m) => {
                        const selected = form.mediaIds.includes(m.id);
                        const isVideo = m.media_type === "VIDEO" || m.media_type === "REELS";
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleMediaSelection(m.id)}
                            className={`group relative aspect-square overflow-hidden rounded-md border-2 bg-muted text-left transition-colors ${
                              selected ? "border-primary ring-2 ring-primary/40" : "border-transparent hover:border-muted-foreground/40"
                            }`}
                          >
                            {isVideo ? (
                              m.thumbnail_url ? (
                                <img src={m.thumbnail_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <video src={m.media_url} className="h-full w-full object-cover" muted />
                              )
                            ) : (
                              <img src={m.media_url} alt="" className="h-full w-full object-cover" />
                            )}
                            {selected && (
                              <div className="absolute top-1 right-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                                <Check className="h-3 w-3" />
                              </div>
                            )}
                            <div className="absolute top-1 left-1">
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5">
                                {isVideo && <Film className="h-2.5 w-2.5" />}
                                {m.media_type}
                              </Badge>
                            </div>
                            {m.caption && (
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1 text-[9px] text-white line-clamp-2">
                                {m.caption}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>{t("keywordsLabel")}</Label>
                <Input
                  placeholder={t("keywordsPlaceholder")}
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChip(keywordInput, "keywords");
                      setKeywordInput("");
                    }
                  }}
                />
                <ChipList items={form.keywords} onRemove={(idx) => update({ keywords: form.keywords.filter((_, i) => i !== idx) })} />
                <p className="text-xs text-muted-foreground">{t("keywordsHint")}</p>
              </div>

              <div className="grid gap-2">
                <Label>{t("keywordMatchLabel")}</Label>
                <Select value={form.keywordMatch} onValueChange={(v) => update({ keywordMatch: v as KeywordMatch })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATCH_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{t(opt.key)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>{t("excludeKeywordsLabel")}</Label>
                <Input
                  placeholder={t("keywordsPlaceholder")}
                  value={excludeInput}
                  onChange={(e) => setExcludeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChip(excludeInput, "excludeKeywords");
                      setExcludeInput("");
                    }
                  }}
                />
                <ChipList items={form.excludeKeywords} onRemove={(idx) => update({ excludeKeywords: form.excludeKeywords.filter((_, i) => i !== idx) })} />
              </div>

              <div className="grid gap-2">
                <Label>{t("cooldownLabel")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.oncePerContactHours}
                  onChange={(e) => update({ oncePerContactHours: Number(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">{t("cooldownHint")}</p>
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
                  <Label htmlFor="ia-schedule-switch" className="cursor-pointer">{t("scheduleToggle")}</Label>
                  <Switch
                    id="ia-schedule-switch"
                    checked={form.scheduleEnabled}
                    onCheckedChange={(checked) => update({ scheduleEnabled: checked })}
                  />
                </div>

                {form.scheduleEnabled && (
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addWindow}>
                        + {t("scheduleAddWindow")}
                      </Button>
                    </div>

                    {form.scheduleWindows.map((w, idx) => (
                      <div key={idx} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">#{idx + 1}</span>
                          <button type="button" onClick={() => removeWindow(idx)} className="text-destructive hover:opacity-70">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAYS.map((d) => {
                            const selected = (w.weekdays || []).includes(d);
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => toggleWindowWeekday(idx, d)}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                                  selected
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background text-muted-foreground border-input hover:bg-muted"
                                }`}
                              >
                                {t(`wd${d}`)}
                              </button>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">{t("scheduleFrom")}</Label>
                            <Input
                              type="time"
                              value={w.startTime || "00:00"}
                              onChange={(e) => updateWindow(idx, { startTime: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("scheduleTo")}</Label>
                            <Input
                              type="time"
                              value={w.endTime || "00:00"}
                              onChange={(e) => updateWindow(idx, { endTime: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {allowsPublicReply && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="ia-reply-public" className="cursor-pointer">{t("replyPublicToggle")}</Label>
                      <p className="text-xs text-muted-foreground">{t("replyPublicHint")}</p>
                    </div>
                    <Switch
                      id="ia-reply-public"
                      checked={form.replyPublicEnabled}
                      onCheckedChange={(checked) => update({ replyPublicEnabled: checked })}
                    />
                  </div>
                  {form.replyPublicEnabled && (
                    <div className="space-y-2">
                      <Input
                        placeholder={t("replyPublicPlaceholder")}
                        value={replyPublicInput}
                        onChange={(e) => setReplyPublicInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addChip(replyPublicInput, "replyPublicTexts");
                            setReplyPublicInput("");
                          }
                        }}
                      />
                      {form.replyPublicTexts.length > 0 && (
                        <div className="space-y-1">
                          {form.replyPublicTexts.map((text, idx) => (
                            <div key={idx} className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                              <span className="flex-1 break-words min-w-0">{text}</span>
                              <button
                                type="button"
                                onClick={() => update({ replyPublicTexts: form.replyPublicTexts.filter((_, i) => i !== idx) })}
                                className="text-muted-foreground hover:text-destructive shrink-0"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {allowsDm && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <Label htmlFor="ia-reply-dm" className="cursor-pointer">{t("replyDmToggle")}</Label>
                    <Switch
                      id="ia-reply-dm"
                      checked={form.replyDmEnabled}
                      onCheckedChange={(checked) => update({ replyDmEnabled: checked })}
                    />
                  </div>
                  {form.replyDmEnabled && (
                    <div className="space-y-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">{t("replyDmTextLabel")}</Label>
                        <TextareaWithVars
                          value={form.replyDmText}
                          onChange={(val) => update({ replyDmText: val })}
                          rows={3}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">{t("replyDmMediaUrlLabel")}</Label>
                        {form.replyDmMediaUrl ? (
                          <div className="flex items-center gap-2 rounded-md border p-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={form.replyDmMediaUrl} alt="" className="h-12 w-12 shrink-0 rounded bg-muted object-cover" />
                            <span className="flex-1 truncate text-xs text-muted-foreground">{form.replyDmMediaUrl}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => update({ replyDmMediaUrl: "" })}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button type="button" variant="outline" size="sm" onClick={() => setDmMediaPickerOpen(true)}>
                            <LayoutGrid className="mr-2 h-4 w-4" />{t("replyDmMediaPick")}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-2">
                <Label>{t("chatFlowLabel")}</Label>
                <Select
                  value={form.chatFlowId ? String(form.chatFlowId) : "none"}
                  onValueChange={(v) => update({ chatFlowId: v === "none" ? null : Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("chatFlowNone")}</SelectItem>
                    {chatFlows.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="ia-follow-up" className="cursor-pointer">{t("followUpToggle")}</Label>
                    <p className="text-xs text-muted-foreground">{t("followUpHint")}</p>
                  </div>
                  <Switch
                    id="ia-follow-up"
                    checked={form.followUpEnabled}
                    onCheckedChange={(checked) => update({ followUpEnabled: checked })}
                  />
                </div>
                {form.followUpEnabled && (
                  <div className="space-y-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("followUpMinutesLabel")}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={form.followUpMinutes}
                        onChange={(e) => update({ followUpMinutes: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("followUpTextLabel")}</Label>
                      <TextareaWithVars
                        value={form.followUpText}
                        onChange={(val) => update({ followUpText: val })}
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" onClick={() => setStep(stepIds[stepIndex - 1])} disabled={saving}>
                {t("back")}
              </Button>
            )}
            {!isLastStep ? (
              <Button onClick={() => setStep(stepIds[stepIndex + 1])} disabled={!form.name.trim()}>
                {t("next")}
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {t("save")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirm")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground break-words">{deleteTarget?.name}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("back")}</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />{t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newPostOpen} onOpenChange={(o) => { if (!creatingScheduled) setNewPostOpen(o); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("newScheduledPost")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>{t("typeLabel")}</Label>
            <Select value={newPostType} onValueChange={(v) => {
              setNewPostType(v as "photo" | "reel" | "carousel");
              if (v !== "carousel") setNewPostFiles((prev) => prev.slice(0, 1));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="photo">{t("typePhoto")}</SelectItem>
                <SelectItem value="reel">{t("typeReel")}</SelectItem>
                <SelectItem value="carousel">{t("typeCarousel")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>{t("selectFilesLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:bg-accent">
                <Upload className="h-4 w-4" />
                {t("selectFilesLabel")}
                <input
                  type="file"
                  className="hidden"
                  accept={newPostType === "reel" ? "video/*" : newPostType === "photo" ? "image/*" : "image/*,video/*"}
                  multiple={newPostType === "carousel"}
                  onChange={handleNewPostFiles}
                  disabled={creatingScheduled}
                />
              </label>
              <button
                type="button"
                onClick={openGalleryPicker}
                disabled={creatingScheduled}
                className="flex items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:bg-accent"
              >
                <LayoutGrid className="h-4 w-4" />
                {t("galleryPick")}
              </button>
            </div>
            {(newPostFiles.length > 0 || newPostGalleryFiles.length > 0) && (
              <div className="space-y-1">
                {newPostFiles.map((f, idx) => (
                  <div key={`local-${idx}`} className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                    <Upload className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <button type="button" onClick={() => setNewPostFiles((prev) => prev.filter((_, i) => i !== idx))} disabled={creatingScheduled} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {newPostGalleryFiles.map((g, idx) => (
                  <div key={`gal-${idx}`} className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                    <LayoutGrid className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{g.originalName || g.url}</span>
                    <button type="button" onClick={() => setNewPostGalleryFiles((prev) => prev.filter((_, i) => i !== idx))} disabled={creatingScheduled} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label>{t("captionLabel")}</Label>
            <Textarea rows={3} value={newPostCaption} onChange={(e) => setNewPostCaption(e.target.value)} disabled={creatingScheduled} />
          </div>
          {newPostType === "reel" && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label className="text-sm font-normal">{t("shareToFeedLabel")}</Label>
              <Switch checked={newPostShareToFeed} onCheckedChange={setNewPostShareToFeed} disabled={creatingScheduled} />
            </div>
          )}
          <div className="grid gap-2">
            <Label>{t("scheduleAtLabel")}</Label>
            <Input type="datetime-local" value={newPostScheduleAt} onChange={(e) => setNewPostScheduleAt(e.target.value)} disabled={creatingScheduled} />
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setNewPostOpen(false)} disabled={creatingScheduled}>{t("cancel")}</Button>
            <Button variant="outline" onClick={() => handleCreateScheduled("draft")} disabled={creatingScheduled || newPostFiles.length + newPostGalleryFiles.length === 0}>
              {creatingScheduled ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              {t("saveDraft")}
            </Button>
            <Button onClick={() => handleCreateScheduled("scheduled")} disabled={creatingScheduled || newPostFiles.length + newPostGalleryFiles.length === 0 || !newPostScheduleAt}>
              {creatingScheduled ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
              {t("schedulePost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={galleryPickerOpen} onOpenChange={setGalleryPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("galleryPickTitle")}</DialogTitle>
          </DialogHeader>
          {loadingGallery ? (
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="aspect-square rounded-md" />)}
            </div>
          ) : galleryItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("galleryEmpty")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {galleryItems.map((g) => {
                const selected = gallerySelection.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGallerySelection((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                      return next;
                    })}
                    className={`group relative aspect-square overflow-hidden rounded-md border bg-muted ${selected ? "ring-2 ring-primary" : ""}`}
                    title={g.name}
                  >
                    {g.type.startsWith("video/") ? (
                      <video src={g.url} className="h-full w-full object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={getGalleryPreviewUrl(g)} alt="" className="h-full w-full object-cover" />
                    )}
                    {selected && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/70 to-transparent p-1 text-[10px] text-white">
                      {g.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGalleryPickerOpen(false)}>{t("cancel")}</Button>
            <Button onClick={confirmGallerySelection} disabled={gallerySelection.size === 0}>
              <Check className="mr-2 h-4 w-4" />{t("galleryConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editScheduledPost} onOpenChange={(o) => { if (!o && !savingScheduled) setEditScheduledPost(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editScheduledTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>{t("captionLabel")}</Label>
            <Textarea rows={3} value={editScheduledCaption} onChange={(e) => setEditScheduledCaption(e.target.value)} disabled={savingScheduled} />
          </div>
          <div className="grid gap-2">
            <Label>{t("scheduleAtLabel")}</Label>
            <Input type="datetime-local" value={editScheduledAt} onChange={(e) => setEditScheduledAt(e.target.value)} disabled={savingScheduled} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={savingScheduled} onClick={() => handleSaveScheduledEdit("draft")}>
              <FileText className="mr-2 h-4 w-4" />{t("saveDraft")}
            </Button>
            <Button disabled={savingScheduled || !editScheduledAt} onClick={() => handleSaveScheduledEdit("scheduled")}>
              <CalendarClock className="mr-2 h-4 w-4" />{t("schedulePost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteScheduledTarget} onOpenChange={(o) => { if (!o) setDeleteScheduledTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("scheduledDeleteConfirm")}</DialogTitle>
          </DialogHeader>
          <p className="truncate text-sm text-muted-foreground">{deleteScheduledTarget?.caption || ""}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteScheduledTarget(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={confirmDeleteScheduled}>
              <Trash2 className="mr-2 h-4 w-4" />{t("deletePost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />{t("validateTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("validateHint")}</p>
          {diagLoading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />{t("validating")}
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {(diagChecks || []).map((check) => {
                const labels: Record<string, string> = {
                  token: t("checkToken"),
                  media: t("checkMedia"),
                  comments: t("checkComments"),
                  messaging: t("checkMessaging"),
                  webhookComments: t("checkWebhookComments"),
                  webhookLive: t("checkWebhookLive"),
                  webhookMessages: t("checkWebhookMessages"),
                  webhook: t("checkWebhook"),
                };
                return (
                  <div key={check.key} className="flex items-start gap-2 rounded-md border px-3 py-2">
                    {check.skipped ? (
                      <Minus className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : check.ok ? (
                      <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                    ) : (
                      <X className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm">{labels[check.key] || check.key}</p>
                      {check.skipped ? (
                        <p className="text-[11px] text-muted-foreground">{t("checkSkipped")}</p>
                      ) : check.detail ? (
                        <p className="text-[11px] text-muted-foreground break-words">{check.detail}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!diagLoading && diagChecks && (
            <DialogFooter className="gap-2">
              {diagChecks.some((c) => !c.ok && !c.skipped) && (
                <Button variant="outline" onClick={revalidateWebhook}>
                  <RefreshCw className="mr-2 h-4 w-4" />{t("revalidateWebhook")}
                </Button>
              )}
              <Button variant="outline" onClick={runDiagnostic}>
                <ShieldCheck className="mr-2 h-4 w-4" />{t("retest")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <GalleryPickerWithUploadDialog
        open={dmMediaPickerOpen}
        onOpenChange={setDmMediaPickerOpen}
        galleryFileType="image"
        uploadAccept="image/*"
        onPick={(item) => update({ replyDmMediaUrl: item.url })}
      />
    </div>
  );
}
