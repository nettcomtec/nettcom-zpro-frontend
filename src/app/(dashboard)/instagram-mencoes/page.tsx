"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { MessageCircle, RefreshCw, Reply, Instagram, Tag, AtSign } from "lucide-react";
import { toast } from "sonner";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import api from "@/lib/api";

type ActiveTab = "tags" | "mentions";

interface TaggedMedia {
  id: string;
  media_type?: string;
  media_url?: string;
  timestamp: string;
  caption?: string;
  permalink?: string;
}

interface MentionComment {
  id: string;
  text: string;
  timestamp: string;
  username?: string;
  media_id?: string;
}

interface ReplyTarget {
  id: string;
  mediaId: string;
  text: string;
  username?: string;
}

export default function InstagramMencoesPage() {
  const allowed = usePageAccess("instagramMencoes", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;

  const [activeTab, setActiveTab] = useState<ActiveTab>("tags");
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Whatsapp[]>([]);
  const [selectedConnection, setSelectedConnection] = useState("");

  // Tags tab
  const [taggedMediaList, setTaggedMediaList] = useState<TaggedMedia[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  // Mentions tab
  const [mentionList, setMentionList] = useState<MentionComment[]>([]);
  const [loadingMentions, setLoadingMentions] = useState(false);

  // Reply dialog
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetchWhatsapps();
      const all = Array.isArray(res.data) ? res.data : [];
      setConnections(all.filter((c) => c.type === "instagram"));
    } catch {
      toast.error("Erro ao carregar conexoes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const handleLoadTags = useCallback(async (connId: string) => {
    if (!connId) return;
    setLoadingTags(true);
    setTaggedMediaList([]);
    try {
      const res = await api.get(`/instagramTags/${connId}`);
      const raw = res.data;
      const list: TaggedMedia[] = Array.isArray(raw) ? raw : (raw as { data?: TaggedMedia[] })?.data ?? [];
      setTaggedMediaList(list);
    } catch {
      toast.error("Erro ao carregar midias tagueadas");
    } finally {
      setLoadingTags(false);
    }
  }, []);

  const handleLoadMentions = useCallback(async (connId: string) => {
    if (!connId) return;
    setLoadingMentions(true);
    setMentionList([]);
    try {
      const res = await api.get(`/instagramMentions/${connId}`);
      const raw = res.data;
      const list: MentionComment[] = Array.isArray(raw) ? raw : (raw as { data?: MentionComment[] })?.data ?? [];
      setMentionList(list);
    } catch {
      toast.error("Erro ao carregar mencoes");
    } finally {
      setLoadingMentions(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedConnection) return;
    if (activeTab === "tags") handleLoadTags(selectedConnection);
    else handleLoadMentions(selectedConnection);
  }, [selectedConnection, activeTab, handleLoadTags, handleLoadMentions]);

  const handleReply = async () => {
    if (!replyingTo || !replyText.trim()) {
      toast.error("Informe o texto da resposta");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/instagramReplyMention", {
        whatsappId: Number(selectedConnection),
        mediaId: replyingTo.mediaId,
        commentId: replyingTo.id,
        message: replyText,
      });
      toast.success("Resposta enviada com sucesso");
      setReplyDialogOpen(false);
      setReplyText("");
      setReplyingTo(null);
    } catch {
      toast.error("Erro ao enviar resposta");
    } finally {
      setSubmitting(false);
    }
  };

  const openReply = (target: ReplyTarget) => {
    setReplyingTo(target);
    setReplyDialogOpen(true);
  };

  if (loading && connections.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Instagram Mencoes"
          description="Gerencie midias tagueadas e mencoes em comentarios no Instagram"
        />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instagram Mencoes"
        description="Gerencie midias tagueadas e mencoes em comentarios no Instagram"
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Conexao</Label>
              <SearchableSelect
                options={connections.map((c) => ({ value: String(c.id), label: `${c.name} — ${c.status}` }))}
                value={selectedConnection}
                onValueChange={setSelectedConnection}
                placeholder="Selecione a conexao Instagram..."
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (activeTab === "tags") handleLoadTags(selectedConnection);
                  else handleLoadMentions(selectedConnection);
                }}
                disabled={(loadingTags || loadingMentions) || !selectedConnection}
              >
                {loadingTags || loadingMentions ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Instagram className="mr-2 h-4 w-4" />
                )}
                Atualizar
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b">
            <button
              type="button"
              onClick={() => setActiveTab("tags")}
              className={
                "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
                (activeTab === "tags"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              <Tag className="h-4 w-4" />
              Midias Tagueadas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mentions")}
              className={
                "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
                (activeTab === "mentions"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              <AtSign className="h-4 w-4" />
              Mencoes em Comentarios
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tags Tab */}
      {activeTab === "tags" && (
        loadingTags ? (
          <Skeleton className="h-[300px]" />
        ) : taggedMediaList.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Tag className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhuma midia tagueada encontrada</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Selecione uma conexao para ver as midias onde voce foi marcado
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Midia</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Legenda</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="w-[100px]">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taggedMediaList.map((media) => (
                    <TableRow key={media.id}>
                      <TableCell>
                        {media.media_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={media.media_url}
                            alt=""
                            className="w-12 h-12 rounded object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">{media.id}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{media.media_type || "—"}</TableCell>
                      <TableCell className="max-w-xs text-sm">
                        {media.caption ? media.caption.substring(0, 80) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDateTime(new Date(media.timestamp))}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Responder"
                          onClick={() => openReply({ id: media.id, mediaId: media.id, text: media.caption || media.id })}
                        >
                          <Reply className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      )}

      {/* Mentions Tab */}
      {activeTab === "mentions" && (
        loadingMentions ? (
          <Skeleton className="h-[300px]" />
        ) : mentionList.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AtSign className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhuma mencao encontrada</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Selecione uma conexao para ver os comentarios com mencoes
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Comentario</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="w-[100px]">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mentionList.map((mention) => (
                    <TableRow key={mention.id}>
                      <TableCell className="font-medium">
                        {mention.username ? `@${mention.username}` : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs text-sm">{mention.text}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDateTime(new Date(mention.timestamp))}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Responder"
                          onClick={() => openReply({
                            id: mention.id,
                            mediaId: mention.media_id || mention.id,
                            text: mention.text,
                            username: mention.username,
                          })}
                        >
                          <Reply className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      )}

      {/* Reply Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responder Mencao</DialogTitle>
            <DialogDescription>
              {replyingTo?.username ? `Respondendo a @${replyingTo.username}` : "Respondendo a mencao"}
            </DialogDescription>
          </DialogHeader>
          {replyingTo && (
            <div className="rounded-md bg-muted p-3 text-sm line-clamp-3">
              {replyingTo.text}
            </div>
          )}
          <div className="grid gap-2">
            <Label>Resposta</Label>
            <Textarea
              placeholder="Digite sua resposta..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleReply} disabled={submitting}>
              {submitting ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Reply className="mr-2 h-4 w-4" />
              )}
              {submitting ? "Enviando..." : "Responder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
