"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, X, MessageSquare, ArrowRightLeft, BellRing, Tag as TagIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  SpyMessagesPanel, useSpyMessages,
} from "@/components/atendimento/spy-contact-messages-dialog";
import { sendMessage, sendTextWaba, sendTextInstagramMeta, sendTextMessengerMeta } from "@/services/messages";
import { fetchTicket, updateTicket } from "@/services/tickets";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchAllUsers } from "@/services/users";
import { sendPrivateMessage } from "@/services/private-chat";
import { fetchContact, updateContactTags } from "@/services/contacts";
import { fetchTags, type Tag } from "@/services/tags";
import { useAuthStore } from "@/stores/auth-store";

export interface ConversationContact {
  id: number;
  name: string;
  number?: string;
  profilePicUrl?: string;
}

interface TicketInfo {
  id: number;
  status?: string;
  channel?: string;
  whatsapp?: { tokenAPI?: string };
}

interface ContactTag {
  id: number;
  name?: string;
  tag?: string;
  color?: string;
}

interface ContactConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ConversationContact | null;
  /** Chamado após transferência ou mudança de etiquetas para o caller recarregar */
  onChanged?: () => void;
}

export function ContactConversationDialog({
  open,
  onOpenChange,
  contact,
  onChanged,
}: ContactConversationDialogProps) {
  const t = useTranslations("contactConversationDialog");
  const { user } = useAuthStore();

  const handleError = useCallback(() => {
    // Mantém o dialog aberto: as abas de etiquetas/notificação funcionam sem histórico
  }, []);

  const { messages, loading, loadingMore, hasMore, loadPrevious, lastTicket, appendMessage } = useSpyMessages(
    open,
    contact?.id ?? null,
    handleError
  );

  // Ticket completo (canal + tokenAPI) para envio em canais Meta
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  useEffect(() => {
    if (!open || !lastTicket?.id) {
      setTicketInfo(null);
      return;
    }
    let cancelled = false;
    fetchTicket(lastTicket.id)
      .then((res) => {
        if (!cancelled) setTicketInfo(res.data as TicketInfo);
      })
      .catch(() => {
        if (!cancelled) setTicketInfo(null);
      });
    return () => { cancelled = true; };
  }, [open, lastTicket?.id]);

  // ── Responder ──────────────────────────────────────────────────────────────
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendReply = async () => {
    const body = replyText.trim();
    if (!body || sending) return;
    if (!lastTicket?.id) {
      toast.error(t("noTicketToReply"));
      return;
    }
    setSending(true);
    try {
      const ch = (ticketInfo?.channel || lastTicket.channel || "").toLowerCase();
      const idFront = `crm-${lastTicket.id}-${Date.now()}`;
      if (ch === "waba" || ch === "instagram" || ch === "messenger") {
        const metaPayload = {
          read: 1, fromMe: true, mediaUrl: "", body,
          scheduleDate: null, quotedMsg: null,
          from: contact?.number, tokenApi: ticketInfo?.whatsapp?.tokenAPI, ticketId: lastTicket.id,
          idFront,
        };
        if (ch === "waba") await sendTextWaba(metaPayload);
        else if (ch === "instagram") await sendTextInstagramMeta(metaPayload);
        else await sendTextMessengerMeta(metaPayload);
      } else {
        await sendMessage(
          lastTicket.id,
          { body, read: 1, fromMe: true, mediaUrl: "", scheduleDate: null, quotedMsg: null, idFront },
          { channel: ch }
        );
      }
      appendMessage({ body, fromMe: true, createdAt: new Date().toISOString(), ticketId: lastTicket.id });
      setReplyText("");
      toast.success(t("sentSuccess"));
    } catch {
      toast.error(t("sendError"));
    } finally {
      setSending(false);
    }
  };

  // ── Transferir / Notificar: listas ─────────────────────────────────────────
  const [queues, setQueues] = useState<Queue[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string; queues?: { id: number }[] }[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchQueues()
      .then((res) => { if (!cancelled) setQueues((res.data as Queue[]) || []); })
      .catch(() => {});
    fetchAllUsers()
      .then((res) => {
        if (cancelled) return;
        const list = (res.data as { users?: { id: number; name: string; queues?: { id: number }[] }[] })?.users || [];
        setUsers(list);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  // ── Transferir ─────────────────────────────────────────────────────────────
  const [transferQueueSel, setTransferQueueSel] = useState("");
  const [transferUserSel, setTransferUserSel] = useState("");
  const [transferring, setTransferring] = useState(false);

  const handleTransfer = async () => {
    if (!lastTicket?.id || (!transferQueueSel && !transferUserSel) || transferring) return;
    setTransferring(true);
    try {
      const payload: Record<string, unknown> = {
        queueId: transferQueueSel ? parseInt(transferQueueSel) : null,
        isTransference: 1,
      };
      if (transferUserSel) {
        payload.userId = parseInt(transferUserSel);
      } else {
        payload.userId = null;
        payload.status = "pending";
      }
      await updateTicket(lastTicket.id, payload);
      toast.success(t("transferSuccess"));
      setTransferQueueSel("");
      setTransferUserSel("");
      onChanged?.();
    } catch {
      toast.error(t("transferError"));
    } finally {
      setTransferring(false);
    }
  };

  // ── Notificar ──────────────────────────────────────────────────────────────
  const [notifyUserSel, setNotifyUserSel] = useState("");
  const [notifyText, setNotifyText] = useState("");
  const [notifying, setNotifying] = useState(false);

  const handleNotify = async () => {
    const text = notifyText.trim();
    if (!notifyUserSel || !text || notifying) return;
    setNotifying(true);
    try {
      const context = contact
        ? `\n\n[${contact.name}${contact.number ? ` • ${contact.number}` : ""}${lastTicket?.id ? ` • #${lastTicket.id}` : ""}]`
        : "";
      await sendPrivateMessage({
        text: `${text}${context}`,
        receiverId: parseInt(notifyUserSel),
        timestamp: Date.now(),
      });
      toast.success(t("notifySuccess"));
      setNotifyText("");
      setNotifyUserSel("");
    } catch {
      toast.error(t("notifyError"));
    } finally {
      setNotifying(false);
    }
  };

  // ── Etiquetas ──────────────────────────────────────────────────────────────
  const [contactTags, setContactTags] = useState<ContactTag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagsBusy, setTagsBusy] = useState(false);

  useEffect(() => {
    if (!open || !contact?.id) {
      setContactTags([]);
      return;
    }
    let cancelled = false;
    fetchContact(contact.id)
      .then((res) => {
        if (cancelled) return;
        const data = res.data as { tags?: ContactTag[] };
        setContactTags(data?.tags || []);
      })
      .catch(() => {});
    fetchTags()
      .then((res) => { if (!cancelled) setAllTags(res.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, contact?.id]);

  const applyTags = async (next: ContactTag[]) => {
    if (!contact?.id || tagsBusy) return;
    const prev = contactTags;
    setContactTags(next);
    setTagsBusy(true);
    try {
      await updateContactTags(contact.id, next.map((tg) => tg.id));
      onChanged?.();
    } catch {
      setContactTags(prev);
      toast.error(t("tagsError"));
    } finally {
      setTagsBusy(false);
    }
  };

  const handleRemoveTag = (tagId: number) => {
    void applyTags(contactTags.filter((tg) => tg.id !== tagId));
  };

  const handleAddTag = (tagIdStr: string) => {
    const tagId = parseInt(tagIdStr);
    if (!tagId || contactTags.some((tg) => tg.id === tagId)) return;
    const tag = allTags.find((tg) => tg.id === tagId);
    if (!tag) return;
    void applyTags([...contactTags, { id: tag.id, name: tag.name, color: tag.color }]);
  };

  const eligibleUsers = users.filter((u) => u.id !== user?.userId);
  const transferUsers = transferQueueSel
    ? users.filter((u) => (u.queues || []).some((q) => q.id === parseInt(transferQueueSel)))
    : users;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl flex flex-col p-0 gap-0 overflow-hidden" style={{ height: "min(80vh, 720px)" }}>
        <DialogHeader className="sr-only">
          <DialogTitle>{contact?.name ?? ""}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="conversa" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-3 mt-3 grid grid-cols-4 shrink-0">
            <TabsTrigger value="conversa" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("tabConversation")}</span>
            </TabsTrigger>
            <TabsTrigger value="transferir" className="gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("tabTransfer")}</span>
            </TabsTrigger>
            <TabsTrigger value="notificar" className="gap-1.5">
              <BellRing className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("tabNotify")}</span>
            </TabsTrigger>
            <TabsTrigger value="etiquetas" className="gap-1.5">
              <TagIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("tabTags")}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="conversa" className="flex flex-col flex-1 min-h-0 mt-0 p-3 pt-2 data-[state=inactive]:hidden">
            <SpyMessagesPanel
              contactName={contact?.name}
              messages={messages}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadPrevious={loadPrevious}
              compact
            />
            <div className="flex items-end gap-2 pt-2 border-t mt-2 shrink-0">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendReply();
                  }
                }}
                placeholder={lastTicket ? t("replyPlaceholder") : t("noTicketToReply")}
                rows={1}
                disabled={!lastTicket || sending}
                className="resize-none min-h-[38px] max-h-28"
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSendReply} disabled={!lastTicket || sending || !replyText.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="transferir" className="mt-0 p-4 space-y-4 data-[state=inactive]:hidden">
            {!lastTicket ? (
              <p className="text-sm text-muted-foreground">{t("noTicketToReply")}</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t("transferQueueLabel")}</Label>
                  <Select value={transferQueueSel} onValueChange={(v) => { setTransferQueueSel(v); setTransferUserSel(""); }}>
                    <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {queues.filter((q) => q.isActive !== false).map((q) => (
                        <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("transferUserLabel")}</Label>
                  <Select value={transferUserSel} onValueChange={setTransferUserSel}>
                    <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {transferUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleTransfer} disabled={transferring || (!transferQueueSel && !transferUserSel)}>
                  {transferring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("transferSubmit")}
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="notificar" className="mt-0 p-4 space-y-4 data-[state=inactive]:hidden">
            <div className="space-y-2">
              <Label>{t("notifyUserLabel")}</Label>
              <Select value={notifyUserSel} onValueChange={setNotifyUserSel}>
                <SelectTrigger><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {eligibleUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("notifyMessageLabel")}</Label>
              <Textarea
                value={notifyText}
                onChange={(e) => setNotifyText(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <Button onClick={handleNotify} disabled={notifying || !notifyUserSel || !notifyText.trim()}>
              {notifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("notifySubmit")}
            </Button>
          </TabsContent>

          <TabsContent value="etiquetas" className="mt-0 p-4 space-y-4 data-[state=inactive]:hidden">
            <div className="space-y-2">
              <Label>{t("tagsCurrentLabel")}</Label>
              {contactTags.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noTags")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contactTags.map((tg) => (
                    <Badge
                      key={tg.id}
                      variant="outline"
                      className="gap-1 pr-1"
                      style={tg.color ? { borderColor: tg.color, color: tg.color, backgroundColor: `${tg.color}18` } : undefined}
                    >
                      {tg.name ?? tg.tag}
                      <button
                        type="button"
                        className="rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5"
                        onClick={() => handleRemoveTag(tg.id)}
                        disabled={tagsBusy}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("tagsAddLabel")}</Label>
              <Select value="" onValueChange={handleAddTag}>
                <SelectTrigger><SelectValue placeholder={t("tagsAddPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {allTags
                    .filter((tg) => tg.isActive !== false && !contactTags.some((c) => c.id === tg.id))
                    .map((tg) => (
                      <SelectItem key={tg.id} value={String(tg.id)}>{tg.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
