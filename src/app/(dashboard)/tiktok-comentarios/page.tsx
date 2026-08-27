"use client";

import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  MessageCircle, Search, RefreshCw, ExternalLink, Music2, Info,
  Heart, Eye, Share2, ThumbsUp, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import {
  listTikTokVideos, getTikTokComments,
  getTikTokBusinessCredentials, setTikTokBusinessCredentials, getTikTokBusinessAuthUrl, replyTikTokComment,
  type TikTokVideo, type TikTokComment,
} from "@/services/tiktok";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

export default function TikTokComentariosPage() {
  const t = useTranslations("tiktokComentariosPage");
  const allowed = usePageAccess("tiktokComentarios", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;

  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Whatsapp[]>([]);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [videoList, setVideoList] = useState<TikTokVideo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [comments, setComments] = useState<TikTokComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  // F2 — configuracao manual da TikTok API for Business (Modo B) por conexao.
  const [businessOpen, setBusinessOpen] = useState(false);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessMode, setBusinessMode] = useState("loginkit");
  const [businessForm, setBusinessForm] = useState({ advertiserId: "", accessToken: "", refreshToken: "" });
  // F3 — resposta direta a comentarios de anuncio (Modo B).
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);

  const selectedVideo = videoList.find((v) => v.id === selectedVideoId);
  const connectionName = connections.find((c) => String(c.id) === selectedConnection)?.name || "";
  const connectionUsername = connections.find((c) => String(c.id) === selectedConnection)?.number || "";

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetchWhatsapps();
      const all = Array.isArray(res.data) ? res.data : [];
      setConnections(all.filter((c) => c.type === "tiktok"));
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
      const res = await listTikTokVideos(Number(connId));
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw as { videos?: TikTokVideo[] })?.videos ?? [];
      setVideoList(list);
    } catch {
      toast.error(t("errorLoadVideos"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConnection) handleLoadVideos(selectedConnection);
  }, [selectedConnection, handleLoadVideos]);

  // Le o modo atual da conexao selecionada (para o badge / prefill do dialog).
  useEffect(() => {
    if (!selectedConnection) { setBusinessMode("loginkit"); return; }
    (async () => {
      try {
        const res = await getTikTokBusinessCredentials(Number(selectedConnection));
        setBusinessMode(res.data?.mode || "loginkit");
      } catch { /* silencioso */ }
    })();
  }, [selectedConnection]);

  const handleLoadComments = async (videoId?: string) => {
    const id = videoId || selectedVideoId;
    if (!id) { toast.error(t("validationVideoId")); return; }
    setLoadingComments(true);
    try {
      const res = await getTikTokComments(id, Number(selectedConnection));
      const data = res.data?.comments || res.data;
      setComments(Array.isArray(data) ? data : []);
      if (videoId) setSelectedVideoId(videoId);
    } catch {
      toast.error(t("errorLoadComments"));
    } finally {
      setLoadingComments(false);
    }
  };

  const openOnTikTok = (videoId: string) => {
    const url = connectionUsername
      ? `https://www.tiktok.com/@${connectionUsername}/video/${videoId}`
      : `https://www.tiktok.com/video/${videoId}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openBusinessDialog = async () => {
    if (!selectedConnection) { toast.error(t("businessSelectConnection")); return; }
    try {
      const res = await getTikTokBusinessCredentials(Number(selectedConnection));
      setBusinessMode(res.data?.mode || "loginkit");
      setBusinessForm({ advertiserId: res.data?.advertiserId || "", accessToken: "", refreshToken: "" });
    } catch {
      setBusinessForm({ advertiserId: "", accessToken: "", refreshToken: "" });
    }
    setBusinessOpen(true);
  };

  const saveBusiness = async () => {
    if (!businessForm.advertiserId.trim() || !businessForm.accessToken.trim()) {
      toast.error(t("businessRequired"));
      return;
    }
    setBusinessSaving(true);
    try {
      await setTikTokBusinessCredentials(Number(selectedConnection), {
        mode: "business",
        advertiserId: businessForm.advertiserId.trim(),
        accessToken: businessForm.accessToken.trim(),
        refreshToken: businessForm.refreshToken.trim() || undefined,
      });
      setBusinessMode("business");
      toast.success(t("businessSaved"));
      setBusinessOpen(false);
      loadConnections();
    } catch {
      toast.error(t("businessSaveError"));
    } finally {
      setBusinessSaving(false);
    }
  };

  const revertBusiness = async () => {
    setBusinessSaving(true);
    try {
      await setTikTokBusinessCredentials(Number(selectedConnection), { mode: "loginkit" });
      setBusinessMode("loginkit");
      toast.success(t("businessReverted"));
      setBusinessOpen(false);
      loadConnections();
    } catch {
      toast.error(t("businessSaveError"));
    } finally {
      setBusinessSaving(false);
    }
  };

  const connectBusinessOAuth = async () => {
    if (!selectedConnection) { toast.error(t("businessSelectConnection")); return; }
    try {
      const res = await getTikTokBusinessAuthUrl(Number(selectedConnection));
      const url = res.data?.authUrl;
      if (!url) { toast.error(t("businessSaveError")); return; }
      const popup = window.open(url, "tiktok-business-oauth", "width=600,height=720");
      const onMsg = (ev: MessageEvent) => {
        if (ev.data?.type === "tiktok-business-oauth-success") {
          window.removeEventListener("message", onMsg);
          try { popup?.close(); } catch { /* noop */ }
          setBusinessMode("business");
          toast.success(t("businessSaved"));
          setBusinessOpen(false);
          loadConnections();
        }
      };
      window.addEventListener("message", onMsg);
    } catch {
      toast.error(t("businessSaveError"));
    }
  };

  const sendReply = async (comment: TikTokComment) => {
    const text = (replyDrafts[comment.id] || "").trim();
    if (!text || !comment.replyContext) return;
    setReplyingId(comment.id);
    try {
      await replyTikTokComment(Number(selectedConnection), comment.replyContext, text);
      toast.success(t("businessReplySent"));
      setReplyDrafts((p) => ({ ...p, [comment.id]: "" }));
    } catch {
      toast.error(t("businessSaveError"));
    } finally {
      setReplyingId(null);
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

  /* ── Preview card (estilo TikTok) ──────────────────────────────────────── */
  const videoPreview = selectedVideo ? (
    <Card>
      <CardContent className="p-0">
        {/* Cover image */}
        {selectedVideo.cover_image_url && (
          <div className="relative">
            <img src={selectedVideo.cover_image_url} alt="" className="w-full aspect-[9/16] max-h-[400px] object-cover rounded-t-lg" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-t-lg" />
            <div className="absolute bottom-3 left-3 right-3">
              <p className="text-white text-sm font-medium line-clamp-2">{selectedVideo.title || t("noTitle")}</p>
            </div>
          </div>
        )}
        {!selectedVideo.cover_image_url && selectedVideo.title && (
          <div className="p-4 pb-2">
            <p className="font-semibold text-sm">{selectedVideo.title}</p>
          </div>
        )}
        <div className="p-3 space-y-3">
          {/* Autor */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-black flex items-center justify-center flex-shrink-0">
              <Music2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">{connectionName}</p>
              {connectionUsername && <p className="text-xs text-muted-foreground">@{connectionUsername}</p>}
            </div>
          </div>
          {/* Stats */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {selectedVideo.view_count != null && (
              <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNumber(Number(selectedVideo.view_count))}</span>
            )}
            {selectedVideo.like_count != null && (
              <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{formatNumber(Number(selectedVideo.like_count))}</span>
            )}
            {selectedVideo.share_count != null && (
              <span className="flex items-center gap-1"><Share2 className="h-3 w-3" />{formatNumber(Number(selectedVideo.share_count))}</span>
            )}
            {selectedVideo.create_time && (
              <span>{formatDate(new Date(selectedVideo.create_time * 1000))}</span>
            )}
          </div>
          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
            <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
              <MessageCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">{selectedVideo.comment_count != null ? formatNumber(Number(selectedVideo.comment_count)) : comments.length} {t("commentsCount")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => openOnTikTok(selectedVideo.id)} className="text-muted-foreground hover:text-foreground" title={t("commentsCount")}>
                <ExternalLink className="h-4 w-4" />
              </button>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleLoadComments()} disabled={loadingComments} title={t("refresh")}>
                <RefreshCw className={`h-3 w-3 sm:mr-1 ${loadingComments ? "animate-spin" : ""}`} /><span className="hidden sm:inline">{t("refresh")}</span>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  ) : null;

  /* ── Lista de comentarios (somente leitura — TikTok API nao permite reply) */
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
      <CardContent className="p-4 space-y-3">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
              {(comment.owner?.display_name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold break-words">{comment.owner?.display_name || "---"}</span>
                <span className="text-[11px] text-muted-foreground">{formatDateTime(new Date(comment.create_time * 1000))}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{comment.text}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                {(comment.like_count ?? 0) > 0 && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <ThumbsUp className="h-3 w-3" />{comment.like_count}
                  </span>
                )}
                {(comment.reply_count ?? 0) > 0 && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />{comment.reply_count}
                  </span>
                )}
              </div>
              {businessMode === "business" && comment.replyContext && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    value={replyDrafts[comment.id] || ""}
                    onChange={(e) => setReplyDrafts((p) => ({ ...p, [comment.id]: e.target.value }))}
                    placeholder={t("businessReplyPlaceholder")}
                    className="h-8 text-xs"
                    onKeyDown={(e) => { if (e.key === "Enter") sendReply(comment); }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={replyingId === comment.id || !(replyDrafts[comment.id] || "").trim()}
                    onClick={() => sendReply(comment)}
                  >
                    {t("businessReplySend")}
                  </Button>
                </div>
              )}
            </div>
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

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>{t("phase1Banner")}</AlertDescription>
      </Alert>

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
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Music2 className="mr-2 h-4 w-4" />}
                {t("loadVideos")}
              </Button>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <Button variant="outline" onClick={openBusinessDialog} disabled={!selectedConnection}>
                <Settings2 className="mr-2 h-4 w-4" />
                {t("businessConfig")}
              </Button>
              {businessMode === "business" && (
                <Badge variant="success" className="self-center">{t("businessModeBadge")}</Badge>
              )}
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

      <Dialog open={businessOpen} onOpenChange={setBusinessOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> TikTok API for Business</DialogTitle>
            <DialogDescription>{t("businessConfigDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Button variant="outline" className="w-full" onClick={connectBusinessOAuth} disabled={businessSaving}>
              <Settings2 className="mr-2 h-4 w-4" /> {t("businessOAuth")}
            </Button>
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">{t("businessOrPaste")}</span></div>
            </div>
            <div className="grid gap-1.5">
              <Label>Advertiser ID</Label>
              <Input value={businessForm.advertiserId} onChange={(e) => setBusinessForm((p) => ({ ...p, advertiserId: e.target.value }))} placeholder="7xxxxxxxxxxxxxxxxxx" className="font-mono text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label>Access Token</Label>
              <Input type="password" value={businessForm.accessToken} onChange={(e) => setBusinessForm((p) => ({ ...p, accessToken: e.target.value }))} placeholder="..." className="font-mono text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("businessRefreshLabel")}</Label>
              <Input type="password" value={businessForm.refreshToken} onChange={(e) => setBusinessForm((p) => ({ ...p, refreshToken: e.target.value }))} placeholder="..." className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            {businessMode === "business" && (
              <Button variant="outline" className="w-full sm:w-auto sm:mr-auto" onClick={revertBusiness} disabled={businessSaving}>{t("businessRevert")}</Button>
            )}
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setBusinessOpen(false)} disabled={businessSaving}>{t("businessCancel")}</Button>
            <Button className="w-full sm:w-auto" onClick={saveBusiness} disabled={businessSaving}>{t("businessSave")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
