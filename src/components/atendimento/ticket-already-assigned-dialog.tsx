"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { fetchOnlineUsers, sendPrivateMessage } from "@/services/private-chat";
import { Send, ArrowRight, Loader2, UserCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getInitials } from "@/lib/utils";

export interface TicketAssignedInfo {
  ticketId: number;
  contactName: string;
  assignedUserId?: number | null;
  assignedUserName?: string | null;
  assignedUserProfilePicture?: string | null;
}

interface UserOption {
  id: number;
  name: string;
  profile: string;
  isOnline?: boolean;
  profilePicture?: string | null;
}

export function TicketAlreadyAssignedDialog({
  open,
  onOpenChange,
  info,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: TicketAssignedInfo | null;
}) {
  const t = useTranslations("ticketAlreadyAssigned");
  const router = useRouter();
  const [view, setView] = useState<"info" | "transfer">("info");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [recipientId, setRecipientId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [messageEdited, setMessageEdited] = useState(false);

  useEffect(() => {
    if (!open) {
      setView("info");
      setRecipientId(null);
      setMessage("");
      setMessageEdited(false);
    }
  }, [open]);

  useEffect(() => {
    if (view !== "transfer" || users.length > 0) return;
    let cancelled = false;
    setLoading(true);
    fetchOnlineUsers()
      .then(({ data }) => {
        if (cancelled) return;
        const list = (data?.users || []) as UserOption[];
        setUsers(list);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadUsersError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [view, users.length, t]);

  const eligibleRecipients = useMemo<UserOption[]>(() => {
    if (!users.length) return [];
    const list = users.filter((u) => {
      if (u.profile === "superadmin") return false;
      if (u.profile === "admin" || u.profile === "super") return true;
      if (info?.assignedUserId && u.id === info.assignedUserId) return true;
      return false;
    });
    const order = (p: string) => (p === "admin" ? 0 : p === "super" ? 1 : 2);
    return list.sort(
      (a, b) => order(a.profile) - order(b.profile) || a.name.localeCompare(b.name)
    );
  }, [users, info?.assignedUserId]);

  useEffect(() => {
    if (view !== "transfer" || !info) return;
    if (recipientId === null && eligibleRecipients.length > 0) {
      const owner = info.assignedUserId
        ? eligibleRecipients.find((u) => u.id === info.assignedUserId)
        : null;
      setRecipientId(owner ? owner.id : eligibleRecipients[0].id);
    }
    if (!messageEdited) {
      setMessage(
        t("defaultMessage", {
          contact: info.contactName,
          ticketId: info.ticketId,
          operator: info.assignedUserName || t("unknownOperator"),
        })
      );
    }
  }, [view, info, eligibleRecipients, recipientId, messageEdited, t]);

  const profileLabel = (profile: string): string => {
    if (profile === "admin") return t("profileAdmin");
    if (profile === "super") return t("profileSuper");
    return t("profileUser");
  };

  const handleSendTransferRequest = async () => {
    if (!recipientId || !message.trim()) return;
    setSending(true);
    try {
      await sendPrivateMessage({
        receiverId: recipientId,
        text: message.trim(),
        timestamp: Date.now(),
        isGroup: false,
      });
      toast.success(t("requestSent"), {
        action: {
          label: t("openChat"),
          onClick: () => router.push(`/chat-privado?contactId=${recipientId}`),
        },
      });
      onOpenChange(false);
    } catch {
      toast.error(t("requestError"));
    } finally {
      setSending(false);
    }
  };

  if (!info) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {view === "info" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>
                {t("subtitle", { contact: info.contactName })}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/40 p-4 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {info.assignedUserProfilePicture ? (
                  <AvatarImage
                    src={info.assignedUserProfilePicture}
                    alt={info.assignedUserName || ""}
                  />
                ) : null}
                <AvatarFallback>
                  {info.assignedUserName ? getInitials(info.assignedUserName) : <UserCircle2 className="h-5 w-5" />}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {info.assignedUserName || t("unknownOperator")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("ticketIdLabel", { id: info.ticketId })}
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={() => setView("transfer")}>
                <ArrowRight className="h-4 w-4 mr-1.5" />
                {t("requestTransfer")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("transferTitle")}</DialogTitle>
              <DialogDescription>{t("transferSubtitle")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="transfer-recipient">{t("recipient")}</Label>
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("loadingUsers")}
                  </div>
                ) : eligibleRecipients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noRecipients")}</p>
                ) : (
                  <Select
                    value={recipientId ? String(recipientId) : undefined}
                    onValueChange={(v) => setRecipientId(Number(v))}
                  >
                    <SelectTrigger id="transfer-recipient">
                      <SelectValue placeholder={t("selectRecipient")} />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleRecipients.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              {u.profilePicture ? (
                                <AvatarImage src={u.profilePicture} alt={u.name} />
                              ) : null}
                              <AvatarFallback className="text-[9px]">
                                {getInitials(u.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span>{u.name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {profileLabel(u.profile)}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-message">{t("message")}</Label>
                <Textarea
                  id="transfer-message"
                  rows={5}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setMessageEdited(true);
                  }}
                  placeholder={t("messagePlaceholder")}
                />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
              <Button
                variant="outline"
                onClick={() => setView("info")}
                disabled={sending}
              >
                {t("back")}
              </Button>
              <Button
                onClick={handleSendTransferRequest}
                disabled={!recipientId || !message.trim() || sending}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1.5" />
                )}
                {t("send")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
