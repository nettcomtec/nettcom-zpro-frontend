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
import {
  MessageCircle, Search, RefreshCw, Reply, Trash2, ExternalLink,
  ThumbsUp, Facebook, Pencil, Info, Plus, Send, Upload, X,
  Grid3x3, MessagesSquare, Image as ImageIcon, Film, LayoutGrid, FileText, Link as LinkIcon, Cloud, Home,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import {
  listPagePosts, getPostComments, getCommentReplies, replyFacebookComment, deleteFacebookComment, editFacebookComment,
  commentOnFacebookPost, publishFacebookPost, editFacebookPost, deleteFacebookPost,
  type FacebookPost, type FacebookComment, type FacebookCommentReply,
} from "@/services/facebook";
import { isMetaAppPermissionError } from "@/lib/meta-app-permission-error";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

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

export default function FacebookComentariosPage() {
  const t = useTranslations("facebookComentariosPage");
  const tBadge = useTranslations("channelAppType");
  const allowed = usePageAccess("facebookComentarios", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;

  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Whatsapp[]>([]);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [comments, setComments] = useState<FacebookComment[]>([]);
  const [commentsNextUrl, setCommentsNextUrl] = useState<string | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<FacebookComment | FacebookCommentReply | null>(null);
  const [replyingToParentId, setReplyingToParentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [repliesMap, setRepliesMap] = useState<Record<string, FacebookCommentReply[]>>({});
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FacebookComment | FacebookCommentReply | null>(null);
  const [editingParentId, setEditingParentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [newCommentDialogOpen, setNewCommentDialogOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [submittingNewComment, setSubmittingNewComment] = useState(false);
  const [activeTab, setActiveTab] = useState<"comments" | "posts">("comments");
  const [newPostDialogOpen, setNewPostDialogOpen] = useState(false);
  const [newPostType, setNewPostType] = useState<"status" | "photo" | "video" | "album">("status");
  const [newPostFiles, setNewPostFiles] = useState<File[]>([]);
  const [newPostMessage, setNewPostMessage] = useState("");
  const [newPostLink, setNewPostLink] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [editPostDialogOpen, setEditPostDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<FacebookPost | null>(null);
  const [editPostText, setEditPostText] = useState("");
  const [savingPostEdit, setSavingPostEdit] = useState(false);
  const [deletingPostIds, setDeletingPostIds] = useState<Set<string>>(new Set());

  const selectedPost = posts.find((p) => p.id === selectedPostId);
  const selectedConn = connections.find((c) => String(c.id) === selectedConnection);
  const connectionName = selectedConn?.name || "";
  const pageOwnerId = selectedConn?.fbPageId || selectedConn?.wabaId || "";
  // Banner só faz sentido para canal via OAuth (Tech Provider). App próprio já tem as permissões.
  const showOauthLimit = !selectedConn || isOAuthChannel(selectedConn);

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetchWhatsapps();
      const all = Array.isArray(res.data) ? res.data : [];
      setConnections(all.filter((c) => c.type === "messenger"));
    } catch {
      toast.error(t("errorLoadConnections"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const handleLoadPosts = useCallback(async (connId: string) => {
    if (!connId) return;
    setLoading(true);
    setPosts([]);
    setComments([]);
    setSelectedPostId("");
    try {
      const res = await listPagePosts(Number(connId));
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw as { data?: FacebookPost[] })?.data ?? [];
      setPosts(list);
    } catch {
      toast.error(t("errorLoadPosts"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConnection) handleLoadPosts(selectedConnection);
  }, [selectedConnection, handleLoadPosts]);

  const handleLoadComments = async (postId?: string) => {
    const id = postId || selectedPostId;
    if (!id) { toast.error(t("validationPostId")); return; }
    setLoadingComments(true);
    setCommentsNextUrl(null);
    try {
      const res = await getPostComments(id, Number(selectedConnection));
      const data = res.data?.data || [];
      setComments(Array.isArray(data) ? data : []);
      setCommentsNextUrl(res.data?.paging?.next ?? null);
      if (postId) setSelectedPostId(postId);
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
      const res = await getPostComments(selectedPostId, Number(selectedConnection), commentsNextUrl);
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
      await replyFacebookComment({ commentId: replyingTo.id, message: replyText, whatsappId: Number(selectedConnection) });
      toast.success(t("replySent"));
      setReplyDialogOpen(false);
      setReplyText("");
      setReplyingTo(null);
      setReplyingToParentId(null);
      if (parentId) {
        // invalida cache e re-abre para buscar a nova reply
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
      await deleteFacebookComment({ commentId, whatsappId: Number(selectedConnection) });
      toast.success(t("commentRemoved"));

      if (parentId) {
        // é reply: remove do repliesMap e decrementa comment_count no comentário pai
        setRepliesMap((prev) => ({ ...prev, [parentId!]: prev[parentId!].filter((r) => r.id !== commentId) }));
        setComments((prev) => prev.map((c) =>
          c.id === parentId
            ? { ...c, comment_count: Math.max(0, (c.comment_count ?? 1) - 1) }
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

  const handleEdit = async () => {
    if (!editingItem || !editText.trim()) return;
    setSubmittingEdit(true);
    const parentId = editingParentId;
    try {
      await editFacebookComment({ commentId: editingItem.id, message: editText, whatsappId: Number(selectedConnection) });
      toast.success(t("editSaved"));
      setEditDialogOpen(false);
      setEditingItem(null);
      setEditingParentId(null);
      setEditText("");
      if (parentId) {
        setRepliesMap((prev) => ({
          ...prev,
          [parentId]: prev[parentId]?.map((r) =>
            r.id === editingItem.id ? { ...r, message: editText.trim() } : r
          ) ?? [],
        }));
      } else {
        setComments((prev) =>
          prev.map((c) => c.id === editingItem.id ? { ...c, message: editText.trim() } : c)
        );
      }
    } catch (err: any) {
      if (isMetaAppPermissionError(err)) {
        toast.error(t("errorAppNoPermission"));
      } else if (err?.response?.status === 503) {
        toast.error(t("featureDisabled"));
      } else {
        toast.error(t("errorEditComment"));
      }
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleCreateNewComment = async () => {
    if (!selectedPostId) { toast.error(t("validationPostId")); return; }
    if (!newCommentText.trim()) { toast.error(t("validationNewComment")); return; }
    setSubmittingNewComment(true);
    try {
      await commentOnFacebookPost({ postId: selectedPostId, message: newCommentText, whatsappId: Number(selectedConnection) });
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

  const openEditDialog = (item: FacebookComment | FacebookCommentReply, parentId: string | null) => {
    setEditingItem(item);
    setEditingParentId(parentId);
    setEditText(item.message || "");
    setEditDialogOpen(true);
  };

  const handleToggleReplies = async (commentId: string) => {
    if (expandedReplies.has(commentId)) {
      setExpandedReplies((prev) => { const next = new Set(prev); next.delete(commentId); return next; });
      return;
    }
    setExpandedReplies((prev) => new Set([...prev, commentId]));
    if (repliesMap[commentId]) return; // já carregado
    setLoadingReplies((prev) => new Set([...prev, commentId]));
    try {
      const res = await getCommentReplies(commentId, Number(selectedConnection));
      const data = res.data?.data || [];
      setRepliesMap((prev) => ({ ...prev, [commentId]: data }));
    } catch {
      toast.error(t("errorLoadComments"));
    } finally {
      setLoadingReplies((prev) => { const next = new Set(prev); next.delete(commentId); return next; });
    }
  };

  const resetNewPostForm = () => {
    setNewPostType("status");
    setNewPostFiles([]);
    setNewPostMessage("");
    setNewPostLink("");
    setUploadProgress(0);
  };

  const handleSelectPostFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (newPostType === "photo" || newPostType === "video") {
      setNewPostFiles([files[0]]);
    } else if (newPostType === "album") {
      setNewPostFiles((prev) => [...prev, ...files].slice(0, 10));
    }
    e.target.value = "";
  };

  const handleRemovePostFile = (idx: number) => {
    setNewPostFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePostTypeChange = (val: "status" | "photo" | "video" | "album") => {
    setNewPostType(val);
    if (val === "status") setNewPostFiles([]);
    else if (val === "photo" || val === "video") setNewPostFiles((prev) => prev.slice(0, 1));
  };

  const validateNewPost = (): string | null => {
    if (newPostType === "status") {
      if (!newPostMessage.trim()) return t("validationStatusMessage");
    }
    if (newPostType === "photo") {
      if (newPostFiles.length !== 1) return t("validationPhotoFile");
      if (!newPostFiles[0].type.startsWith("image/")) return t("validationPhotoMime");
    }
    if (newPostType === "video") {
      if (newPostFiles.length !== 1) return t("validationVideoFile");
      if (!newPostFiles[0].type.startsWith("video/")) return t("validationVideoMime");
    }
    if (newPostType === "album") {
      if (newPostFiles.length < 2 || newPostFiles.length > 10) return t("validationAlbumCount");
      if (newPostFiles.some((f) => !f.type.startsWith("image/"))) return t("validationAlbumMime");
    }
    return null;
  };

  const handleSavePostEdit = async () => {
    if (!editingPost || !editPostText.trim()) return;
    setSavingPostEdit(true);
    try {
      await editFacebookPost({ postId: editingPost.id, message: editPostText.trim(), whatsappId: Number(selectedConnection) });
      toast.success(t("postEdited"));
      setPosts((prev) => prev.map((p) => p.id === editingPost.id ? { ...p, message: editPostText.trim() } : p));
      setEditPostDialogOpen(false);
      setEditingPost(null);
      setEditPostText("");
    } catch (err: any) {
      if (isMetaAppPermissionError(err)) { toast.error(t("errorAppNoPermission")); return; }
      const msg = err?.response?.data?.error || err?.message;
      toast.error(msg ? `${t("errorEditPost")}: ${msg}` : t("errorEditPost"));
    } finally {
      setSavingPostEdit(false);
    }
  };

  const handleDeletePost = async (post: FacebookPost) => {
    if (!confirm(t("deletePostConfirm"))) return;
    setDeletingPostIds((prev) => new Set([...prev, post.id]));
    try {
      await deleteFacebookPost({ postId: post.id, whatsappId: Number(selectedConnection) });
      toast.success(t("postDeleted"));
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      if (selectedPostId === post.id) {
        setSelectedPostId("");
        setComments([]);
      }
    } catch (err: any) {
      if (isMetaAppPermissionError(err)) { toast.error(t("errorAppNoPermission")); return; }
      const msg = err?.response?.data?.error || err?.message;
      toast.error(msg ? `${t("errorDeletePost")}: ${msg}` : t("errorDeletePost"));
    } finally {
      setDeletingPostIds((prev) => { const next = new Set(prev); next.delete(post.id); return next; });
    }
  };

  const handlePublishPost = async () => {
    if (!selectedConnection) { toast.error(t("validationConnection")); return; }
    const err = validateNewPost();
    if (err) { toast.error(err); return; }

    setPublishing(true);
    setUploadProgress(0);
    try {
      const res = await publishFacebookPost({
        whatsappId: Number(selectedConnection),
        postType: newPostType,
        message: newPostMessage || undefined,
        link: newPostType === "status" && newPostLink ? newPostLink : undefined,
        files: newPostType === "status" ? undefined : newPostFiles,
        onUploadProgress: (ev) => {
          if (ev.total) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        },
      });
      toast.success(t("publishSuccess", { id: res.data.postId }));
      setNewPostDialogOpen(false);
      resetNewPostForm();
      handleLoadPosts(selectedConnection);
    } catch (err: any) {
      if (isMetaAppPermissionError(err)) { toast.error(t("errorAppNoPermission")); return; }
      const msg = err?.response?.data?.error || err?.response?.data?.details || err?.message;
      toast.error(msg ? `${t("publishError")}: ${msg}` : t("publishError"));
    } finally {
      setPublishing(false);
      setUploadProgress(0);
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
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  /* ── Preview card (estilo Facebook) ────────────────────────────────────── */
  const postPreview = selectedPost ? (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-4 pb-3">
          <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Facebook className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{connectionName}</p>
            <p className="text-xs text-muted-foreground">
              {selectedPost.created_time ? formatDateTime(new Date(selectedPost.created_time)) : ""}
            </p>
          </div>
          {selectedPost.permalink_url && (
            <a href={selectedPost.permalink_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
        {(selectedPost.message || selectedPost.story) && (
          <div className="px-4 pb-3">
            <p className="text-sm whitespace-pre-wrap">{selectedPost.message || selectedPost.story}</p>
          </div>
        )}
        {selectedPost.full_picture && (
          <div className="border-t border-b">
            <img src={selectedPost.full_picture} alt="" className="w-full max-h-[400px] object-cover" />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t">
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            <MessageCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">{comments.length} {t("commentsCount")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setNewCommentText(""); setNewCommentDialogOpen(true); }} title={t("newComment")}>
              <Plus className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">{t("newComment")}</span>
            </Button>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleLoadComments()} disabled={loadingComments} title={t("refresh")}>
              <RefreshCw className={`h-3 w-3 sm:mr-1 ${loadingComments ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </Button>
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
      <CardContent className="p-4 space-y-1">
        {comments.map((comment) => {
          const hasReplies = (comment.comment_count ?? 0) > 0;
          const isExpanded = expandedReplies.has(comment.id);
          const isLoadingReply = loadingReplies.has(comment.id);
          const replyList = repliesMap[comment.id] ?? [];
          return (
            <div key={comment.id} className="py-2">
              {/* Comentário principal */}
              <div className="flex gap-3 group">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
                  {(comment.from?.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="bg-muted rounded-2xl px-3 py-2 inline-block max-w-full">
                    <p className="text-sm font-semibold leading-tight break-words">{comment.from?.name || comment.from?.id || "—"}</p>
                    <p className="text-sm whitespace-pre-wrap break-words">{comment.message || "—"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 ml-1">
                    <span className="text-[11px] text-muted-foreground">
                      {comment.created_time ? formatDateTime(new Date(comment.created_time)) : ""}
                    </span>
                    {(comment.like_count ?? 0) > 0 && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />{comment.like_count}
                      </span>
                    )}
                    <button className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => { setReplyingTo(comment); setReplyingToParentId(comment.id); setReplyDialogOpen(true); }}>
                      {t("reply")}
                    </button>
                    {pageOwnerId && comment.from?.id === pageOwnerId && (
                      <button className="text-[11px] text-muted-foreground hover:text-blue-500 transition-colors disabled:opacity-50"
                        onClick={() => openEditDialog(comment, null)}
                        title={t("edit")}>
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    <button className="text-[11px] text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      onClick={() => handleDelete(comment.id)}
                      disabled={deletingIds.has(comment.id)}>
                      {deletingIds.has(comment.id) ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                  {/* Botão expandir replies */}
                  {hasReplies && (
                    <button
                      className="flex items-center gap-1 mt-1 ml-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                      onClick={() => handleToggleReplies(comment.id)}
                      disabled={isLoadingReply}
                    >
                      {isLoadingReply
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : <Reply className="h-3 w-3" />}
                      {isExpanded
                        ? t("hideReplies")
                        : t("viewReplies", { count: comment.comment_count ?? 0 })}
                    </button>
                  )}
                </div>
              </div>
              {/* Replies expandidas */}
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
                        {(reply.from?.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="bg-muted/70 rounded-2xl px-3 py-2 inline-block max-w-full">
                          <p className="text-xs font-semibold leading-tight break-words">{reply.from?.name || reply.from?.id || "—"}</p>
                          <p className="text-xs whitespace-pre-wrap break-words">{reply.message || "—"}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 ml-1">
                          <span className="text-[10px] text-muted-foreground">
                            {reply.created_time ? formatDateTime(new Date(reply.created_time)) : ""}
                          </span>
                          {(reply.like_count ?? 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <ThumbsUp className="h-3 w-3" />{reply.like_count}
                            </span>
                          )}
                          <button className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => { setReplyingTo(reply); setReplyingToParentId(comment.id); setReplyDialogOpen(true); }}>
                            {t("reply")}
                          </button>
                          {pageOwnerId && reply.from?.id === pageOwnerId && (
                            <button className="text-[10px] text-muted-foreground hover:text-blue-500 transition-colors disabled:opacity-50"
                              onClick={() => openEditDialog(reply, comment.id)}
                              title={t("edit")}>
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
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

      {/* Filtros (conexao apenas) */}
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
              <Button variant="outline" onClick={() => handleLoadPosts(selectedConnection)} disabled={loading || !selectedConnection}>
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Facebook className="mr-2 h-4 w-4" />}
                {t("loadPosts")}
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
              {posts.length > 0 && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2 min-w-0">
                    <Label>{t("labelPost")}</Label>
                    <div className="min-w-0 overflow-hidden">
                      <SearchableSelect
                        options={posts.map((p) => ({ value: p.id, label: p.message ? p.message.substring(0, 60) : p.story ? p.story.substring(0, 60) : p.id }))}
                        value={selectedPostId}
                        onValueChange={(v) => { setSelectedPostId(v); handleLoadComments(v); }}
                        placeholder={t("selectPostPlaceholder")}
                        className="w-full max-w-full"
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-2 flex-1 min-w-0 w-full sm:w-auto max-w-md">
                  <Label>{t("labelSearchById")}</Label>
                  <Input placeholder={t("postIdPlaceholder")} value={selectedPostId} onChange={(e) => setSelectedPostId(e.target.value)} />
                </div>
                <Button onClick={() => handleLoadComments()} disabled={loadingComments} className="w-full sm:w-auto">
                  {loadingComments ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  {t("searchComments")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[400px,1fr]">
            <div className="lg:hidden">{postPreview}</div>
            <div className="hidden lg:block">
              <div className="sticky top-6">{postPreview}</div>
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
                  <Button variant="outline" size="sm" onClick={() => handleLoadPosts(selectedConnection)} disabled={loading || !selectedConnection}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t("selectConnectionFirst")}</CardContent></Card>
          ) : loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48 w-full rounded-md" />)}
            </div>
          ) : posts.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Facebook className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="text-base font-medium">{t("noPostsYet")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("noPostsYetHint")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {posts.map((p) => (
                <Card key={p.id} className="group overflow-hidden">
                  {p.full_picture && (
                    <div className="relative aspect-video overflow-hidden bg-muted">
                      <img src={p.full_picture} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <CardContent className="p-3 space-y-2">
                    {(p.message || p.story) && (
                      <p className="text-sm line-clamp-3">{p.message || p.story}</p>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] text-muted-foreground">
                        {p.created_time ? formatDateTime(new Date(p.created_time)) : ""}
                      </p>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setActiveTab("comments"); setSelectedPostId(p.id); handleLoadComments(p.id); }} title={t("viewComments")}>
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditingPost(p); setEditPostText(p.message || p.story || ""); setEditPostDialogOpen(true); }} title={t("editPost")}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => handleDeletePost(p)} disabled={deletingPostIds.has(p.id)} title={t("deletePost")}>
                          {deletingPostIds.has(p.id) ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                        {p.permalink_url && (
                          <Button asChild size="sm" variant="ghost" className="h-7" title={t("openOnFacebook")}>
                            <a href={p.permalink_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog editar */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editDialogTitle")}</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="flex gap-3 rounded-lg bg-muted p-3">
              <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                {(editingItem.from?.name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{editingItem.from?.name || editingItem.from?.id}</p>
                <p className="text-sm text-muted-foreground line-through">{editingItem.message}</p>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label>{t("labelEditText")}</Label>
            <Textarea placeholder={t("editPlaceholder")} value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleEdit} disabled={submittingEdit || !editText.trim()}>
              {submittingEdit ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
              {submittingEdit ? t("saving") : t("edit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog novo comentário */}
      <Dialog open={newCommentDialogOpen} onOpenChange={setNewCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newCommentDialogTitle")}</DialogTitle>
            <DialogDescription>{t("newCommentDialogDescription")}</DialogDescription>
          </DialogHeader>
          {selectedPost && (
            <div className="flex gap-3 rounded-lg bg-muted p-3">
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <Facebook className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{connectionName}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{selectedPost.message || selectedPost.story || "—"}</p>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label>{t("newCommentLabel")}</Label>
            <Textarea placeholder={t("newCommentPlaceholder")} value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCommentDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleCreateNewComment} disabled={submittingNewComment || !newCommentText.trim() || !selectedPostId}>
              {submittingNewComment ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {submittingNewComment ? t("sending") : t("post")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar post */}
      <Dialog open={editPostDialogOpen} onOpenChange={(o) => { if (!savingPostEdit) setEditPostDialogOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editPostDialogTitle")}</DialogTitle>
            <DialogDescription>{t("editPostDialogDescription")}</DialogDescription>
          </DialogHeader>
          {editingPost?.full_picture && (
            <div className="rounded-md overflow-hidden border max-h-48"><img src={editingPost.full_picture} alt="" className="w-full object-cover" /></div>
          )}
          <div className="grid gap-2">
            <Label>{t("labelEditPostText")}</Label>
            <Textarea placeholder={t("editPostPlaceholder")} value={editPostText} onChange={(e) => setEditPostText(e.target.value)} rows={5} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPostDialogOpen(false)} disabled={savingPostEdit}>{t("cancel")}</Button>
            <Button onClick={handleSavePostEdit} disabled={savingPostEdit || !editPostText.trim()}>
              {savingPostEdit ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
              {savingPostEdit ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog novo post */}
      <Dialog open={newPostDialogOpen} onOpenChange={(o) => { if (!publishing) setNewPostDialogOpen(o); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("newPostDialogTitle")}</DialogTitle>
            <DialogDescription>{t("newPostDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("postType")}</Label>
              <RadioGroup value={newPostType} onValueChange={(v) => handlePostTypeChange(v as any)} className="grid grid-cols-2 gap-2">
                <Label htmlFor="pt-status" className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="status" id="pt-status" />
                  <FileText className="h-4 w-4" />{t("postTypeStatus")}
                </Label>
                <Label htmlFor="pt-photo" className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="photo" id="pt-photo" />
                  <ImageIcon className="h-4 w-4" />{t("postTypePhoto")}
                </Label>
                <Label htmlFor="pt-video" className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="video" id="pt-video" />
                  <Film className="h-4 w-4" />{t("postTypeVideo")}
                </Label>
                <Label htmlFor="pt-album" className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="album" id="pt-album" />
                  <LayoutGrid className="h-4 w-4" />{t("postTypeAlbum")}
                </Label>
              </RadioGroup>
            </div>

            {newPostType !== "status" && (
              <div className="grid gap-2">
                <Label>{newPostType === "album" ? t("postFilesAlbum") : t("postFile")}</Label>
                <div className="flex flex-wrap gap-2">
                  {newPostFiles.map((f, i) => (
                    <div key={i} className="relative h-20 w-20 rounded-md border bg-muted overflow-hidden">
                      {f.type.startsWith("image/") ? (
                        <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center"><Film className="h-6 w-6 text-muted-foreground" /></div>
                      )}
                      <button type="button" onClick={() => handleRemovePostFile(i)} className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {(newPostType === "album" || newPostFiles.length === 0) && (
                    <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed hover:bg-accent">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <input
                        type="file"
                        className="hidden"
                        accept={newPostType === "video" ? "video/*" : "image/*"}
                        multiple={newPostType === "album"}
                        onChange={handleSelectPostFiles}
                      />
                    </label>
                  )}
                </div>
                {newPostType === "album" && (
                  <p className="text-xs text-muted-foreground">{t("postFilesAlbumHint")} ({newPostFiles.length}/10)</p>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <Label>{newPostType === "status" ? t("postMessage") : t("postCaption")}</Label>
              <Textarea
                placeholder={newPostType === "status" ? t("postMessagePlaceholder") : t("postCaptionPlaceholder")}
                value={newPostMessage}
                onChange={(e) => setNewPostMessage(e.target.value)}
                rows={4}
              />
            </div>

            {newPostType === "status" && (
              <div className="grid gap-2">
                <Label className="flex items-center gap-1"><LinkIcon className="h-3.5 w-3.5" />{t("postLink")}</Label>
                <Input placeholder="https://..." value={newPostLink} onChange={(e) => setNewPostLink(e.target.value)} />
              </div>
            )}

            {publishing && uploadProgress > 0 && (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground text-center">{uploadProgress}%</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPostDialogOpen(false)} disabled={publishing}>{t("cancel")}</Button>
            <Button onClick={handlePublishPost} disabled={publishing}>
              {publishing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {publishing ? t("publishing") : t("publish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog resposta */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("replyDialogTitle")}</DialogTitle>
            <DialogDescription>{t("replyingTo")} {replyingTo?.from?.name || replyingTo?.from?.id}</DialogDescription>
          </DialogHeader>
          {replyingTo && (
            <div className="flex gap-3 rounded-lg bg-muted p-3">
              <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                {(replyingTo.from?.name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{replyingTo.from?.name || replyingTo.from?.id}</p>
                <p className="text-sm text-muted-foreground">{replyingTo.message}</p>
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
    </div>
  );
}
