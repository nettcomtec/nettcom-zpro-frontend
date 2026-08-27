"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MessageCircle, Search, RefreshCw, Reply, Trash2, ExternalLink,
  Instagram, Image, Film, LayoutGrid, Info, Plus, Send, Upload, X,
  Grid3x3, MessagesSquare, Pencil, CalendarClock, FileText, Cloud, Home,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import {
  listMedia, getMediaComments, getCommentReplies, replyComment, deleteComment, commentOnMedia,
  publishMedia, editInstagramMedia,
  type InstagramMedia, type InstagramComment, type InstagramCommentReply,
} from "@/services/instagram";
import { createInstagramScheduledPost } from "@/services/instagram-scheduled";
import { checkIgImageFile } from "@/lib/ig-image-validation";
import { isMetaAppPermissionError } from "@/lib/meta-app-permission-error";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

const mediaTypeIcon = (type: string) => {
  switch (type) {
    case "VIDEO": return <Film className="h-4 w-4" />;
    case "CAROUSEL_ALBUM": return <LayoutGrid className="h-4 w-4" />;
    default: return <Image className="h-4 w-4" />;
  }
};

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

export default function InstagramComentariosPage() {
  const t = useTranslations("instagramComentariosPage");
  const tBadge = useTranslations("channelAppType");
  const allowed = usePageAccess("instagramComentarios", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;

  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Whatsapp[]>([]);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [mediaList, setMediaList] = useState<InstagramMedia[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [comments, setComments] = useState<InstagramComment[]>([]);
  const [commentsNextUrl, setCommentsNextUrl] = useState<string | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<InstagramComment | InstagramCommentReply | null>(null);
  const [replyingToParentId, setReplyingToParentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [repliesMap, setRepliesMap] = useState<Record<string, InstagramCommentReply[]>>({});
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [newCommentDialogOpen, setNewCommentDialogOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [submittingNewComment, setSubmittingNewComment] = useState(false);
  const [activeTab, setActiveTab] = useState<"comments" | "posts">("comments");
  const [newPostDialogOpen, setNewPostDialogOpen] = useState(false);
  const [newPostType, setNewPostType] = useState<"photo" | "reel" | "carousel">("photo");
  const [newPostFiles, setNewPostFiles] = useState<File[]>([]);
  const [newPostCaption, setNewPostCaption] = useState("");
  const [newPostShareToFeed, setNewPostShareToFeed] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [editMediaDialogOpen, setEditMediaDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<InstagramMedia | null>(null);
  const [editMediaCaption, setEditMediaCaption] = useState("");
  const [savingMediaEdit, setSavingMediaEdit] = useState(false);
  // Agendar/Rascunho (criação no composer; a gestão fica em /instagram-automacao)
  const [newPostScheduleAt, setNewPostScheduleAt] = useState("");

  const selectedMedia = mediaList.find((m) => m.id === selectedMediaId);
  const selectedConn = connections.find((c) => String(c.id) === selectedConnection);
  const connectionName = selectedConn?.name || "";
  // Banner só faz sentido para canal via OAuth (Tech Provider). App próprio já tem as permissões.
  const showOauthLimit = !selectedConn || isOAuthChannel(selectedConn);

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetchWhatsapps();
      const all = Array.isArray(res.data) ? res.data : [];
      setConnections(all.filter((c) => c.type === "instagram"));
    } catch {
      toast.error(t("errorLoadConnections"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const handleLoadMedia = useCallback(async (connId: string) => {
    if (!connId) return;
    setLoading(true);
    setMediaList([]);
    setComments([]);
    setSelectedMediaId("");
    try {
      const res = await listMedia(Number(connId));
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw as { data?: InstagramMedia[] })?.data ?? [];
      setMediaList(list);
    } catch {
      toast.error(t("errorLoadMedia"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConnection) handleLoadMedia(selectedConnection);
  }, [selectedConnection, handleLoadMedia]);

  const handleLoadComments = async (mediaId?: string) => {
    const id = mediaId || selectedMediaId;
    if (!id) { toast.error(t("validationMediaId")); return; }
    setLoadingComments(true);
    setCommentsNextUrl(null);
    try {
      const res = await getMediaComments(id, Number(selectedConnection));
      const data = res.data?.data || [];
      setComments(Array.isArray(data) ? data : []);
      setCommentsNextUrl(res.data?.paging?.next ?? null);
      if (mediaId) setSelectedMediaId(mediaId);
    } catch {
      toast.error(t("errorLoadComments"));
    } finally {
      setLoadingComments(false);
    }
  };

  const handleLoadMore = async () => {
    if (!commentsNextUrl) return;
    setLoadingMore(true);
    try {
      const res = await getMediaComments(selectedMediaId, Number(selectedConnection), commentsNextUrl);
      const data = res.data?.data || [];
      setComments((prev) => [...prev, ...(Array.isArray(data) ? data : [])]);
      setCommentsNextUrl(res.data?.paging?.next ?? null);
    } catch {
      toast.error(t("errorLoadComments"));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleReply = async () => {
    if (!replyingTo || !replyText.trim()) { toast.error(t("validationReply")); return; }
    setSubmitting(true);
    const parentId = replyingToParentId;
    try {
      await replyComment({ commentId: replyingTo.id, message: replyText, whatsappId: Number(selectedConnection) });
      toast.success(t("replySent"));
      setReplyDialogOpen(false);
      setReplyText("");
      setReplyingTo(null);
      setReplyingToParentId(null);
      if (parentId) {
        setRepliesMap((prev) => { const next = { ...prev }; delete next[parentId]; return next; });
        setExpandedReplies((prev) => new Set([...prev, parentId]));
      }
      handleLoadComments();
    } catch (err: any) {
      if (isMetaAppPermissionError(err)) {
        toast.error(t("errorAppNoPermission"));
      } else if (err?.response?.status === 503) {
        toast.error(t("featureDisabled"));
      } else {
        toast.error(t("errorSendReply"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    // detecta se é reply antes de qualquer setState
    let parentId: string | null = null;
    for (const [pid, replies] of Object.entries(repliesMap)) {
      if (replies.some((r) => r.id === commentId)) { parentId = pid; break; }
    }

    setDeletingIds((prev) => new Set([...prev, commentId]));
    try {
      await deleteComment({ commentId, whatsappId: Number(selectedConnection) });
      toast.success(t("commentRemoved"));

      if (parentId) {
        // é reply: remove do repliesMap e remove o ID de replies.data no comentário pai
        setRepliesMap((prev) => ({ ...prev, [parentId!]: prev[parentId!].filter((r) => r.id !== commentId) }));
        setComments((prev) => prev.map((c) =>
          c.id === parentId
            ? { ...c, replies: { data: (c.replies?.data ?? []).filter((r) => r.id !== commentId) } }
            : c
        ));
      } else {
        // é comentário top-level
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch (err: any) {
      if (isMetaAppPermissionError(err)) {
        toast.error(t("errorAppNoPermission"));
      } else if (err?.response?.status === 503) {
        toast.error(t("featureDisabled"));
      } else {
        toast.error(t("errorRemoveComment"));
      }
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(commentId); return next; });
    }
  };

  const handleCreateNewComment = async () => {
    if (!selectedMediaId) { toast.error(t("validationMediaId")); return; }
    if (!newCommentText.trim()) { toast.error(t("validationNewComment")); return; }
    setSubmittingNewComment(true);
    try {
      await commentOnMedia({ mediaId: selectedMediaId, message: newCommentText, whatsappId: Number(selectedConnection) });
      toast.success(t("newCommentSent"));
      setNewCommentDialogOpen(false);
      setNewCommentText("");
      handleLoadComments();
    } catch (err: any) {
      if (isMetaAppPermissionError(err)) {
        toast.error(t("errorAppNoPermission"));
      } else if (err?.response?.status === 503) {
        toast.error(t("featureDisabled"));
      } else {
        toast.error(t("errorSendComment"));
      }
    } finally {
      setSubmittingNewComment(false);
    }
  };

  const resetNewPostForm = () => {
    setNewPostType("photo");
    setNewPostFiles([]);
    setNewPostCaption("");
    setNewPostShareToFeed(true);
    setNewPostScheduleAt("");
    setUploadProgress(0);
  };

  // Salvar rascunho / agendar (mesmo dialog do novo post)
  const handleSaveScheduled = async (status: "draft" | "scheduled") => {
    if (!selectedConnection) { toast.error(t("validationConnection")); return; }
    const err = validatePostFiles();
    if (err) { toast.error(err); return; }
    if (status === "scheduled" && !newPostScheduleAt) { toast.error(t("scheduleAtRequired")); return; }

    setPublishing(true);
    setUploadProgress(0);
    try {
      await createInstagramScheduledPost({
        whatsappId: Number(selectedConnection),
        mediaType: newPostType,
        caption: newPostCaption || undefined,
        shareToFeed: newPostType === "reel" ? newPostShareToFeed : undefined,
        status,
        scheduledAt: newPostScheduleAt ? new Date(newPostScheduleAt).toISOString() : undefined,
        files: newPostFiles,
        onUploadProgress: (ev) => {
          if (ev.total) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        },
      });
      toast.success(status === "draft" ? t("draftSaved") : t("postScheduled"));
      setNewPostDialogOpen(false);
      resetNewPostForm();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message;
      toast.error(msg ? `${t("publishError")}: ${msg}` : t("publishError"));
    } finally {
      setPublishing(false);
      setUploadProgress(0);
    }
  };

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    if (newPostType === "photo" || newPostType === "reel") {
      setNewPostFiles([files[0]]);
    } else {
      setNewPostFiles((prev) => [...prev, ...files].slice(0, 10));
    }
  };

  const handleRemoveFile = (idx: number) => {
    setNewPostFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePostTypeChange = (val: "photo" | "reel" | "carousel") => {
    setNewPostType(val);
    if (val === "photo" || val === "reel") {
      setNewPostFiles((prev) => prev.slice(0, 1));
    }
  };

  const validatePostFiles = (): string | null => {
    if (newPostFiles.length === 0) return t("validationPostFiles");
    if (newPostType === "photo") {
      if (newPostFiles.length !== 1) return t("validationPhotoFile");
      if (!newPostFiles[0].type.startsWith("image/")) return t("validationPhotoMime");
    }
    if (newPostType === "reel") {
      if (newPostFiles.length !== 1) return t("validationReelFile");
      if (!newPostFiles[0].type.startsWith("video/")) return t("validationReelMime");
    }
    if (newPostType === "carousel") {
      if (newPostFiles.length < 2 || newPostFiles.length > 10) return t("validationCarouselCount");
    }
    return null;
  };

  const handleSaveMediaEdit = async () => {
    if (!editingMedia) return;
    setSavingMediaEdit(true);
    try {
      await editInstagramMedia({ mediaId: editingMedia.id, caption: editMediaCaption, whatsappId: Number(selectedConnection) });
      toast.success(t("mediaEdited"));
      setMediaList((prev) => prev.map((m) => m.id === editingMedia.id ? { ...m, caption: editMediaCaption } : m));
      setEditMediaDialogOpen(false);
      setEditingMedia(null);
      setEditMediaCaption("");
    } catch (err: any) {
      if (isMetaAppPermissionError(err)) { toast.error(t("errorAppNoPermission")); return; }
      const msg = err?.response?.data?.error || err?.message;
      toast.error(msg ? `${t("errorEditMedia")}: ${msg}` : t("errorEditMedia"));
    } finally {
      setSavingMediaEdit(false);
    }
  };

  const handlePublishPost = async () => {
    if (!selectedConnection) { toast.error(t("validationConnection")); return; }
    const err = validatePostFiles();
    if (err) { toast.error(err); return; }

    setPublishing(true);
    setUploadProgress(0);
    try {
      const res = await publishMedia({
        whatsappId: Number(selectedConnection),
        mediaType: newPostType,
        caption: newPostCaption || undefined,
        shareToFeed: newPostType === "reel" ? newPostShareToFeed : undefined,
        files: newPostFiles,
        onUploadProgress: (ev) => {
          if (ev.total) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        },
      });
      toast.success(t("publishSuccess", { id: res.data.mediaId }));
      setNewPostDialogOpen(false);
      resetNewPostForm();
      handleLoadMedia(selectedConnection);
    } catch (err: any) {
      if (isMetaAppPermissionError(err)) { toast.error(t("errorAppNoPermission")); return; }
      const msg = err?.response?.data?.error || err?.response?.data?.details || err?.message;
      toast.error(msg ? `${t("publishError")}: ${msg}` : t("publishError"));
    } finally {
      setPublishing(false);
      setUploadProgress(0);
    }
  };

  const handleToggleReplies = async (commentId: string) => {
    if (expandedReplies.has(commentId)) {
      setExpandedReplies((prev) => { const next = new Set(prev); next.delete(commentId); return next; });
      return;
    }
    setExpandedReplies((prev) => new Set([...prev, commentId]));
    if (repliesMap[commentId]) return;
    setLoadingReplies((prev) => new Set([...prev, commentId]));
    try {
      const res = await getCommentReplies(commentId, Number(selectedConnection));
      setRepliesMap((prev) => ({ ...prev, [commentId]: res.data?.data || [] }));
    } catch {
      toast.error(t("errorLoadComments"));
    } finally {
      setLoadingReplies((prev) => { const next = new Set(prev); next.delete(commentId); return next; });
    }
  };

  if (loading && connections.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={{
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

  /* ── Preview card (estilo Instagram) ───────────────────────────────────── */
  const mediaPreview = selectedMedia ? (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-[2px]">
            <div className="h-full w-full rounded-full bg-background flex items-center justify-center">
              <Instagram className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{connectionName}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              {mediaTypeIcon(selectedMedia.media_type)}<span className="truncate">{selectedMedia.media_type}</span>
            </span>
            {selectedMedia.permalink && (
              <a href={selectedMedia.permalink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
        {selectedMedia.media_url && (
          <div className="border-t border-b">
            {selectedMedia.media_type === "VIDEO" ? (
              <video src={selectedMedia.media_url} controls className="w-full max-h-[500px] object-contain bg-black" />
            ) : (
              <img src={selectedMedia.media_url} alt="" className="w-full max-h-[500px] object-contain bg-black" />
            )}
          </div>
        )}
        <div className="p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
              <MessageCircle className="h-4 w-4 shrink-0" /><span className="truncate">{comments.length} {t("commentsCount")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setNewCommentText(""); setNewCommentDialogOpen(true); }} title={t("newComment")}>
                <Plus className="h-3 w-3 sm:mr-1" /><span className="hidden sm:inline">{t("newComment")}</span>
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleLoadComments()} disabled={loadingComments} title={t("refresh")}>
                <RefreshCw className={`h-3 w-3 sm:mr-1 ${loadingComments ? "animate-spin" : ""}`} /><span className="hidden sm:inline">{t("refresh")}</span>
              </Button>
            </div>
          </div>
          {selectedMedia.caption && (
            <p className="text-sm"><span className="font-semibold mr-1">{connectionName}</span>{selectedMedia.caption}</p>
          )}
          <p className="text-[11px] text-muted-foreground uppercase">{formatDateTime(new Date(selectedMedia.timestamp))}</p>
        </div>
      </CardContent>
    </Card>
  ) : null;

  /* ── Lista de comentarios ──────────────────────────────────────────────── */
  const commentsList = loadingComments ? (
    <Card>
      <CardContent className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-full" /></div>
          </div>
        ))}
      </CardContent>
    </Card>
  ) : comments.length === 0 ? (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("noComments")}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t("noCommentsHint")}</p>
        </div>
      </CardContent>
    </Card>
  ) : (
    <Card>
      <CardContent className="p-4 space-y-1">
        {comments.map((comment) => {
          const hasReplies = (comment.replies?.data?.length ?? 0) > 0;
          const isExpanded = expandedReplies.has(comment.id);
          const isLoadingReply = loadingReplies.has(comment.id);
          const replyList = repliesMap[comment.id] ?? [];
          return (
            <div key={comment.id} className="py-2">
              <div className="flex gap-3 group">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
                  {(comment.username || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm break-words">
                    <span className="font-semibold mr-1">@{comment.username}</span>
                    <span className="break-words">{comment.text}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <span className="text-[11px] text-muted-foreground">{formatDateTime(new Date(comment.timestamp))}</span>
                    <button className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => { setReplyingTo(comment); setReplyingToParentId(comment.id); setReplyDialogOpen(true); }}>{t("reply")}</button>
                    <button className="text-[11px] text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      onClick={() => handleDelete(comment.id)}
                      disabled={deletingIds.has(comment.id)}>
                      {deletingIds.has(comment.id) ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                  {hasReplies && (
                    <button
                      className="flex items-center gap-1 mt-1 text-[11px] font-semibold text-pink-600 hover:text-pink-700 transition-colors"
                      onClick={() => handleToggleReplies(comment.id)}
                      disabled={isLoadingReply}
                    >
                      {isLoadingReply
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : <Reply className="h-3 w-3" />}
                      {isExpanded
                        ? t("hideReplies")
                        : t("viewReplies", { count: comment.replies?.data?.length ?? 0 })}
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && isLoadingReply && (
                <div className="ml-11 mt-2 space-y-2 border-l-2 border-muted pl-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex gap-2">
                      <Skeleton className="h-7 w-7 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-1"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-full" /></div>
                    </div>
                  ))}
                </div>
              )}
              {isExpanded && !isLoadingReply && replyList.length > 0 && (
                <div className="ml-11 mt-2 space-y-2 border-l-2 border-muted pl-3">
                  {replyList.map((reply) => (
                    <div key={reply.id} className="flex gap-3 group">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-muted-foreground">
                        {(reply.username || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs break-words">
                          <span className="font-semibold mr-1">@{reply.username}</span>
                          <span className="break-words">{reply.text}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {reply.timestamp ? formatDateTime(new Date(reply.timestamp)) : ""}
                          </span>
                          <button className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => { setReplyingTo(reply); setReplyingToParentId(comment.id); setReplyDialogOpen(true); }}>
                            {t("reply")}
                          </button>
                          <button className="text-[10px] text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                            onClick={() => handleDelete(reply.id)}
                            disabled={deletingIds.has(reply.id)}>
                            {deletingIds.has(reply.id) ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <PageHeader title={t("title")} description={t("description")} help={{
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

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>{t("labelConnection")}</Label>
              <SearchableSelect
                options={connections.map((c) => ({ value: String(c.id), label: `${c.name} — ${c.status}` }))}
                value={selectedConnection}
                onValueChange={setSelectedConnection}
                placeholder={t("selectConnectionPlaceholder")}
                renderOption={(opt) => (
                  <span className="flex flex-1 items-center gap-2 min-w-0 text-left">
                    <ChannelAppIcon conn={connections.find((c) => String(c.id) === opt.value)} ownLabel={tBadge("own")} oauthLabel={tBadge("oauth")} />
                    <span className="truncate">{opt.label}</span>
                  </span>
                )}
              />
              {selectedConn && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ChannelAppIcon conn={selectedConn} ownLabel={tBadge("own")} oauthLabel={tBadge("oauth")} />
                  {isOAuthChannel(selectedConn) ? tBadge("oauth") : tBadge("own")}
                </span>
              )}
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => handleLoadMedia(selectedConnection)} disabled={loading || !selectedConnection}>
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Instagram className="mr-2 h-4 w-4" />}
                {t("loadMedia")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "comments" | "posts")} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="comments" className="gap-2">
            <MessagesSquare className="h-4 w-4" />{t("tabComments")}
          </TabsTrigger>
          <TabsTrigger value="posts" className="gap-2">
            <Grid3x3 className="h-4 w-4" />{t("tabPosts")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comments" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {mediaList.length > 0 && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2 min-w-0">
                    <Label>{t("labelMedia")}</Label>
                    <div className="min-w-0 overflow-hidden">
                      <SearchableSelect
                        options={mediaList.map((m) => ({ value: m.id, label: `${m.caption ? m.caption.substring(0, 50) : m.id} (${m.media_type})` }))}
                        value={selectedMediaId}
                        onValueChange={(v) => { setSelectedMediaId(v); handleLoadComments(v); }}
                        placeholder={t("selectMediaPlaceholder")}
                        className="w-full max-w-full"
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-2 flex-1 min-w-0 w-full sm:w-auto max-w-md">
                  <Label>{t("labelSearchById")}</Label>
                  <Input placeholder={t("mediaIdPlaceholder")} value={selectedMediaId} onChange={(e) => setSelectedMediaId(e.target.value)} />
                </div>
                <Button onClick={() => handleLoadComments()} disabled={loadingComments} className="w-full sm:w-auto">
                  {loadingComments ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  {t("searchComments")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Layout split: preview esquerda, comentarios direita */}
          <div className="grid gap-6 lg:grid-cols-[400px,1fr]">
            <div className="lg:hidden">{mediaPreview}</div>
            <div className="hidden lg:block">
              <div className="sticky top-6">{mediaPreview}</div>
            </div>
            <div className="min-w-0 space-y-3">
              {commentsList}
              {commentsNextUrl && !loadingComments && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                    {t("loadMore")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="posts" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">{t("postsListTitle")}</h3>
                  <p className="text-xs text-muted-foreground">{t("postsListHint")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleLoadMedia(selectedConnection)} disabled={loading || !selectedConnection}>
                    {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {t("refresh")}
                  </Button>
                  <Button onClick={() => { resetNewPostForm(); setNewPostDialogOpen(true); }} disabled={!selectedConnection}>
                    <Plus className="mr-2 h-4 w-4" />{t("newPost")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {!selectedConnection ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                {t("selectConnectionFirst")}
              </CardContent>
            </Card>
          ) : loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-md" />
              ))}
            </div>
          ) : mediaList.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Instagram className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="text-base font-medium">{t("noPostsYet")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("noPostsYetHint")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {mediaList.map((m) => (
                <div key={m.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                  {m.media_type === "VIDEO" ? (
                    <video src={m.media_url} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={m.media_url} alt="" className="h-full w-full object-cover" />
                  )}
                  <div className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white">
                    {mediaTypeIcon(m.media_type)}
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <Button size="sm" variant="secondary" className="h-7" onClick={() => { setActiveTab("comments"); setSelectedMediaId(m.id); handleLoadComments(m.id); }} title={t("viewComments")}>
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="secondary" className="h-7" onClick={() => { setEditingMedia(m); setEditMediaCaption(m.caption || ""); setEditMediaDialogOpen(true); }} title={t("editMedia")}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {m.permalink && (
                        <Button asChild size="sm" variant="outline" className="h-7" title={t("openOnInstagram")}>
                          <a href={m.permalink} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                        </Button>
                      )}
                    </div>
                  </div>
                  {m.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[10px] text-white line-clamp-2">
                      {m.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={newCommentDialogOpen} onOpenChange={setNewCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newCommentDialogTitle")}</DialogTitle>
            <DialogDescription>{t("newCommentDialogDescription")}</DialogDescription>
          </DialogHeader>
          {selectedMedia && (
            <div className="flex gap-3 rounded-lg bg-muted p-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-[2px] flex-shrink-0">
                <div className="h-full w-full rounded-full bg-background flex items-center justify-center">
                  <Instagram className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{connectionName}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{selectedMedia.caption || "—"}</p>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label>{t("newCommentLabel")}</Label>
            <Textarea placeholder={t("newCommentPlaceholder")} value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCommentDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleCreateNewComment} disabled={submittingNewComment || !newCommentText.trim() || !selectedMediaId}>
              {submittingNewComment ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {submittingNewComment ? t("sending") : t("post")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("replyDialogTitle")}</DialogTitle>
            <DialogDescription>{t("replyingTo")} @{replyingTo?.username}</DialogDescription>
          </DialogHeader>
          {replyingTo && (
            <div className="flex gap-3 rounded-lg bg-muted p-3">
              <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                {(replyingTo.username || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">@{replyingTo.username}</p>
                <p className="text-sm text-muted-foreground">{replyingTo.text}</p>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label>{t("labelReply")}</Label>
            <Textarea placeholder={t("replyPlaceholder")} value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleReply} disabled={submitting}>
              {submitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Reply className="mr-2 h-4 w-4" />}
              {submitting ? t("sending") : t("reply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editMediaDialogOpen} onOpenChange={(o) => { if (!savingMediaEdit) setEditMediaDialogOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editMediaDialogTitle")}</DialogTitle>
            <DialogDescription>{t("editMediaDialogDescription")}</DialogDescription>
          </DialogHeader>
          {editingMedia?.media_url && (
            <div className="rounded-md overflow-hidden border max-h-48">
              {editingMedia.media_type === "VIDEO" ? (
                <video src={editingMedia.media_url} className="w-full object-cover" muted />
              ) : (
                <img src={editingMedia.media_url} alt="" className="w-full object-cover" />
              )}
            </div>
          )}
          <div className="grid gap-2">
            <Label>{t("labelEditCaption")}</Label>
            <Textarea placeholder={t("editCaptionPlaceholder")} value={editMediaCaption} onChange={(e) => setEditMediaCaption(e.target.value)} rows={5} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMediaDialogOpen(false)} disabled={savingMediaEdit}>{t("cancel")}</Button>
            <Button onClick={handleSaveMediaEdit} disabled={savingMediaEdit}>
              {savingMediaEdit ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
              {savingMediaEdit ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newPostDialogOpen} onOpenChange={(open) => { if (!publishing) setNewPostDialogOpen(open); }}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("newPostDialogTitle")}</DialogTitle>
            <DialogDescription>{t("newPostDialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 min-w-0">
            <Label>{t("labelMediaType")}</Label>
            <RadioGroup
              value={newPostType}
              onValueChange={(v) => handlePostTypeChange(v as "photo" | "reel" | "carousel")}
              className="grid grid-cols-3 gap-2"
            >
              <label htmlFor="np-photo" className="flex items-center gap-1.5 rounded-md border p-2 cursor-pointer hover:bg-muted min-w-0">
                <RadioGroupItem value="photo" id="np-photo" />
                <Image className="h-4 w-4 shrink-0" />
                <span className="text-sm truncate">{t("mediaTypePhoto")}</span>
              </label>
              <label htmlFor="np-reel" className="flex items-center gap-1.5 rounded-md border p-2 cursor-pointer hover:bg-muted min-w-0">
                <RadioGroupItem value="reel" id="np-reel" />
                <Film className="h-4 w-4 shrink-0" />
                <span className="text-sm truncate">{t("mediaTypeReel")}</span>
              </label>
              <label htmlFor="np-carousel" className="flex items-center gap-1.5 rounded-md border p-2 cursor-pointer hover:bg-muted min-w-0">
                <RadioGroupItem value="carousel" id="np-carousel" />
                <LayoutGrid className="h-4 w-4 shrink-0" />
                <span className="text-sm truncate">{t("mediaTypeCarousel")}</span>
              </label>
            </RadioGroup>
            <p className="text-[11px] text-muted-foreground">{t("mediaTypeNotice")}</p>
          </div>

          <div className="grid gap-2 min-w-0">
            <Label>{t("labelFiles")}</Label>
            <label className="flex flex-col items-center justify-center rounded-md border-2 border-dashed p-4 cursor-pointer hover:bg-muted/50 text-center">
              <Upload className="h-5 w-5 text-muted-foreground mb-1" />
              <span className="text-sm text-muted-foreground">
                {newPostType === "carousel" ? t("selectFilesCarousel") : t("selectFile")}
              </span>
              <input
                type="file"
                className="hidden"
                accept={newPostType === "reel" ? "video/*" : newPostType === "photo" ? "image/*" : "image/*,video/*"}
                multiple={newPostType === "carousel"}
                onChange={handleSelectFiles}
                disabled={publishing}
              />
            </label>
            {newPostFiles.length > 0 && (
              <div className="space-y-1 min-w-0">
                {newPostFiles.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs min-w-0">
                    <span className="flex-1 truncate min-w-0">{f.name}</span>
                    <span className="text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => handleRemoveFile(idx)} disabled={publishing} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  {t("selectedFilesCount", { count: newPostFiles.length })}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>{t("labelCaption")}</Label>
            <Textarea
              placeholder={t("captionPlaceholder")}
              value={newPostCaption}
              onChange={(e) => setNewPostCaption(e.target.value)}
              rows={3}
              disabled={publishing}
            />
          </div>

          {newPostType === "reel" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="np-share-feed"
                checked={newPostShareToFeed}
                onCheckedChange={(v) => setNewPostShareToFeed(v === true)}
                disabled={publishing}
              />
              <Label htmlFor="np-share-feed" className="text-sm font-normal cursor-pointer">
                {t("shareToFeed")}
              </Label>
            </div>
          )}

          <div className="grid gap-2">
            <Label>{t("scheduleAtLabel")}</Label>
            <Input
              type="datetime-local"
              value={newPostScheduleAt}
              onChange={(e) => setNewPostScheduleAt(e.target.value)}
              disabled={publishing}
            />
          </div>

          {publishing && uploadProgress > 0 && uploadProgress < 100 && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-pink-500 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground">{t("uploading", { percent: uploadProgress })}</p>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setNewPostDialogOpen(false)} disabled={publishing}>
              {t("cancel")}
            </Button>
            <Button variant="outline" onClick={() => handleSaveScheduled("draft")} disabled={publishing || newPostFiles.length === 0}>
              <FileText className="mr-2 h-4 w-4" />{t("saveDraft")}
            </Button>
            <Button variant="secondary" onClick={() => handleSaveScheduled("scheduled")} disabled={publishing || newPostFiles.length === 0 || !newPostScheduleAt}>
              <CalendarClock className="mr-2 h-4 w-4" />{t("schedulePost")}
            </Button>
            <Button onClick={handlePublishPost} disabled={publishing || newPostFiles.length === 0}>
              {publishing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {publishing ? t("publishing") : t("publishPost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
