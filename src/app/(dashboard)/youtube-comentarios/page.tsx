"use client";

import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  MessageCircle, Search, RefreshCw, Reply, Trash2, ExternalLink,
  ThumbsUp, Youtube, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import {
  listYouTubeVideos, getYouTubeComments, replyYouTubeComment, deleteYouTubeComment, editYouTubeComment,
  type YouTubeVideo, type YouTubeComment,
} from "@/services/youtube";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

export default function YouTubeComentariosPage() {
  const t = useTranslations("youtubeComentariosPage");
  const allowed = usePageAccess("youtubeComentarios", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;

  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Whatsapp[]>([]);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [videoList, setVideoList] = useState<YouTubeVideo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [comments, setComments] = useState<YouTubeComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<YouTubeComment | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<{ reply: YouTubeComment; parentId: string } | null>(null);
  const [editText, setEditText] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Channel ID do canal autenticado — usado para decidir se a reply pode ser
  // editada (YT API so permite editar comentarios do proprio canal).
  const ownChannelId = (connections.find((c) => String(c.id) === selectedConnection) as any)?.wabaId || "";

  const selectedVideo = videoList.find((v) => v.id === selectedVideoId);
  const connectionName = connections.find((c) => String(c.id) === selectedConnection)?.name || "";

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetchWhatsapps();
      const all = Array.isArray(res.data) ? res.data : [];
      setConnections(all.filter((c) => c.type === "youtube"));
    } catch {
      toast.error(t("errorLoadConnections"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const handleLoadVideos = useCallback(async (connId: string) => {
    if (!connId) return;
    setLoading(true);
    setVideoList([]);
    setComments([]);
    setSelectedVideoId("");
    try {
      const res = await listYouTubeVideos(Number(connId));
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw as { items?: YouTubeVideo[] })?.items ?? [];
      const unique = Array.from(new Map(list.map((v) => [v.id, v])).values());
      setVideoList(unique);
    } catch {
      toast.error(t("errorLoadVideos"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConnection) handleLoadVideos(selectedConnection);
  }, [selectedConnection, handleLoadVideos]);

  const handleLoadComments = async (videoId?: string) => {
    const id = videoId || selectedVideoId;
    if (!id) { toast.error(t("validationVideoId")); return; }
    setLoadingComments(true);
    try {
      const res = await getYouTubeComments(id, Number(selectedConnection));
      // Backend retorna { data: [...] } (envelope) ou { data: [], reason: "commentsDisabled" }
      // (caso especial). Tambem aceita { items: [...] } ou array direto, por defesa.
      const raw = res.data;
      const data = raw?.data ?? raw?.items ?? raw;
      setComments(Array.isArray(data) ? data : []);
      if (videoId) setSelectedVideoId(videoId);
      if (raw?.reason === "commentsDisabled") {
        toast.info(t("commentsDisabled"));
      }
    } catch (err: any) {
      const reason = err?.response?.data?.reason;
      if (reason === "commentsDisabled") {
        setComments([]);
        if (videoId) setSelectedVideoId(videoId);
        toast.info(t("commentsDisabled"));
      } else {
        toast.error(t("errorLoadComments"));
      }
    } finally {
      setLoadingComments(false);
    }
  };

  const handleReply = async () => {
    if (!replyingTo || !replyText.trim()) { toast.error(t("validationReply")); return; }
    setSubmitting(true);
    try {
      const res = await replyYouTubeComment({ parentId: replyingTo.id, message: replyText, whatsappId: Number(selectedConnection) });
      toast.success(t("replySent"));

      // Optimistic update: injeta a reply na UI imediatamente. YT API tem
      // eventual consistency — o reply nao aparece em commentThreads.list por
      // alguns segundos. Sem otimismo, o user vê o reply "sumir" e ter que
      // recarregar. Refetch em background ~3s para sincronizar.
      const ownConn = connections.find((c) => String(c.id) === selectedConnection);
      const newReplyId = String((res as any)?.data?.id || `tmp-${Date.now()}`);
      const newReply: YouTubeComment = {
        id: newReplyId,
        authorDisplayName: ownConn?.name || "Channel",
        authorChannelId: ownChannelId || undefined,
        textDisplay: replyText,
        publishedAt: new Date().toISOString(),
        likeCount: 0,
      };
      const parentId = replyingTo.id;
      setComments((prev) =>
        prev.map((c) =>
          c.id === parentId
            ? {
                ...c,
                replies: [...(c.replies || []), newReply],
                totalReplyCount: (c.totalReplyCount ?? 0) + 1,
              }
            : c
        )
      );
      setReplyDialogOpen(false);
      setReplyText("");
      setReplyingTo(null);
      // Refetch silencioso para confirmar o ID definitivo do YT
      window.setTimeout(() => handleLoadComments(), 3000);
    } catch {
      toast.error(t("errorSendReply"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string, isReply = false) => {
    const confirmKey = isReply ? "deleteReplyConfirm" : "deleteReplyConfirm";
    if (isReply && !confirm(t(confirmKey))) return;
    try {
      await deleteYouTubeComment({ commentId, whatsappId: Number(selectedConnection) });
      toast.success(isReply ? t("replyDeleted") : t("commentRemoved"));
      // Optimistic remove
      setComments((prev) =>
        prev
          .map((c) => ({
            ...c,
            replies: (c.replies || []).filter((r) => r.id !== commentId),
            totalReplyCount: (c.replies || []).some((r) => r.id === commentId)
              ? Math.max(0, (c.totalReplyCount ?? 1) - 1)
              : c.totalReplyCount,
          }))
          .filter((c) => c.id !== commentId)
      );
      window.setTimeout(() => handleLoadComments(), 2000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message;
      toast.error(detail || (isReply ? t("errorDeleteReply") : t("errorRemoveComment")));
    }
  };

  function openEditReply(reply: YouTubeComment, parentId: string) {
    setEditingReply({ reply, parentId });
    setEditText(reply.textDisplay || "");
    setEditDialogOpen(true);
  }

  const handleSaveEdit = async () => {
    if (!editingReply || !editText.trim()) return;
    setEditSubmitting(true);
    try {
      await editYouTubeComment({
        commentId: editingReply.reply.id,
        text: editText,
        whatsappId: Number(selectedConnection),
      });
      toast.success(t("replyEdited"));
      // Optimistic update
      setComments((prev) =>
        prev.map((c) =>
          c.id === editingReply.parentId
            ? {
                ...c,
                replies: (c.replies || []).map((r) =>
                  r.id === editingReply.reply.id ? { ...r, textDisplay: editText } : r
                ),
              }
            : c
        )
      );
      setEditDialogOpen(false);
      setEditingReply(null);
      setEditText("");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message;
      toast.error(detail || t("errorEditReply"));
    } finally {
      setEditSubmitting(false);
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

  /* ── Preview card (estilo YouTube) ─────────────────────────────────────── */
  const videoPreview = selectedVideo ? (
    <Card>
      <CardContent className="p-0">
        {/* Thumbnail */}
        {selectedVideo.thumbnailUrl && (
          <div className="relative">
            <img src={selectedVideo.thumbnailUrl} alt="" className="w-full aspect-video object-cover rounded-t-lg" />
          </div>
        )}
        <div className="p-3 space-y-2">
          {/* Titulo */}
          <p className="font-semibold text-sm line-clamp-2">{selectedVideo.title}</p>
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-6 w-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                <Youtube className="h-3 w-3 text-white" />
              </div>
              <span className="font-medium text-foreground truncate">{connectionName}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {selectedVideo.viewCount != null && (
              <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNumber(Number(selectedVideo.viewCount))}</span>
            )}
            {selectedVideo.publishedAt && (
              <span>{formatDate(new Date(selectedVideo.publishedAt))}</span>
            )}
          </div>
          {selectedVideo.description && (
            <p className="text-xs text-muted-foreground line-clamp-3">{selectedVideo.description}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
            <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
              <MessageCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">{selectedVideo.commentCount != null ? formatNumber(Number(selectedVideo.commentCount)) : comments.length} {t("commentsCount")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={`https://www.youtube.com/watch?v=${selectedVideo.id}`} target="_blank" rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground shrink-0"><ExternalLink className="h-4 w-4" /></a>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleLoadComments()} disabled={loadingComments} title={t("refresh")}>
                <RefreshCw className={`h-3 w-3 sm:mr-1 ${loadingComments ? "animate-spin" : ""}`} /><span className="hidden sm:inline">{t("refresh")}</span>
              </Button>
            </div>
          </div>
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
      <CardContent className="p-4 space-y-4">
        {comments.map((comment) => (
          <div key={comment.id} className="space-y-3">
            <div className="flex gap-3 group">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
                {(comment.authorDisplayName || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold break-words">{comment.authorDisplayName}</span>
                  <span className="text-[11px] text-muted-foreground">{formatDateTime(new Date(comment.publishedAt))}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{comment.textDisplay}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  {(comment.likeCount ?? 0) > 0 && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <ThumbsUp className="h-3 w-3" />{comment.likeCount}
                    </span>
                  )}
                  <button className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setReplyingTo(comment); setReplyDialogOpen(true); }}>{t("reply")}</button>
                  <button className="text-[11px] text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    onClick={() => handleDelete(comment.id)}><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            </div>
            {comment.replies && comment.replies.length > 0 && (
              <div className="ml-11 space-y-3 border-l-2 border-border/40 pl-3">
                {comment.replies.map((reply) => {
                  const canEdit = !!ownChannelId && reply.authorChannelId === ownChannelId;
                  return (
                    <div key={reply.id} className="flex gap-3 group">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-[11px] font-semibold text-muted-foreground">
                        {(reply.authorDisplayName || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-xs font-semibold break-words">{reply.authorDisplayName}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDateTime(new Date(reply.publishedAt))}</span>
                        </div>
                        <p className="text-xs whitespace-pre-wrap break-words mt-0.5">{reply.textDisplay}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          {(reply.likeCount ?? 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <ThumbsUp className="h-2.5 w-2.5" />{reply.likeCount}
                            </span>
                          )}
                          {canEdit && (
                            <button
                              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => openEditReply(reply, comment.id)}
                            >
                              {t("editReply")}
                            </button>
                          )}
                          <button
                            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                            onClick={() => handleDelete(reply.id, true)}
                            title={t("deleteReply")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(comment.totalReplyCount ?? 0) > comment.replies.length && (
                  <p className="text-[10px] text-muted-foreground italic">
                    {t("moreRepliesNotShown", { count: (comment.totalReplyCount ?? 0) - comment.replies.length })}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
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

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>{t("labelConnection")}</Label>
              <SearchableSelect
                options={connections.map((c) => ({ value: String(c.id), label: `${c.name} — ${c.status}` }))}
                value={selectedConnection}
                onValueChange={setSelectedConnection}
                placeholder={t("selectConnectionPlaceholder")}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => handleLoadVideos(selectedConnection)} disabled={loading || !selectedConnection}>
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Youtube className="mr-2 h-4 w-4" />}
                {t("loadVideos")}
              </Button>
            </div>
          </div>
          {videoList.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2 min-w-0">
                <Label>{t("labelVideo")}</Label>
                <div className="min-w-0 overflow-hidden">
                  <SearchableSelect
                    options={videoList.map((v) => ({ value: v.id, label: v.title || v.id }))}
                    value={selectedVideoId}
                    onValueChange={(v) => { setSelectedVideoId(v); handleLoadComments(v); }}
                    placeholder={t("selectVideoPlaceholder")}
                    className="w-full max-w-full"
                  />
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-2 flex-1 min-w-0 w-full sm:w-auto max-w-md">
              <Label>{t("labelSearchById")}</Label>
              <Input placeholder={t("videoIdPlaceholder")} value={selectedVideoId} onChange={(e) => setSelectedVideoId(e.target.value)} />
            </div>
            <Button onClick={() => handleLoadComments()} disabled={loadingComments} className="w-full sm:w-auto">
              {loadingComments ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              {t("searchComments")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[400px,1fr]">
        <div className="lg:hidden">{videoPreview}</div>
        <div className="hidden lg:block">
          <div className="sticky top-6">{videoPreview}</div>
        </div>
        <div className="min-w-0">{commentsList}</div>
      </div>

      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("replyDialogTitle")}</DialogTitle>
            <DialogDescription>{t("replyingTo")} {replyingTo?.authorDisplayName}</DialogDescription>
          </DialogHeader>
          {replyingTo && (
            <div className="flex gap-3 rounded-lg bg-muted p-3">
              <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                {(replyingTo.authorDisplayName || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{replyingTo.authorDisplayName}</p>
                <p className="text-sm text-muted-foreground">{replyingTo.textDisplay}</p>
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

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editReplyDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>{t("labelEditReply")}</Label>
            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveEdit} disabled={editSubmitting || !editText.trim()}>
              {editSubmitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editSubmitting ? t("sending") : t("saveEdit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
