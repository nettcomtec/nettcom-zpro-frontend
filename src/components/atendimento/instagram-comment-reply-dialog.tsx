"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, Info, Loader2, MessageCircle, Send } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { replyInstagramCommentFromTicket } from "@/services/messages";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import {
  INSTAGRAM_COMMENT_REPLY_MAX,
  INSTAGRAM_DM_TEXT_MAX,
  type InstagramCommentReplyKind,
  hasPrivateReplyFor,
  instagramCommentPermalink,
  instagramCommentText,
  isInstagramCommentDmExpired,
} from "@/lib/instagram-comment";
import type { Message } from "@/stores/ticket-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: number | string;
  comment: Message | null;
  /** Mensagens carregadas do atendimento: decide se o Direct deste comentário já foi usado. */
  messages: Message[];
}

// Código do backend → chave de texto. O que não está aqui vira o erro genérico.
const ERROR_KEYS: Record<string, string> = {
  ERR_IG_COMMENT_NOT_FOUND: "errNotFound",
  ERR_IG_COMMENT_UNAVAILABLE: "errUnavailable",
  ERR_IG_COMMENT_CHANNEL_NOT_FOUND: "errChannel",
  ERR_WHATSAPP_DISCONNECTED: "errDisconnected",
  ERR_WABA_ID_NOT_FOUND: "errToken",
  ERR_IG_COMMENT_DM_EXPIRED: "privateExpired",
  ERR_IG_COMMENT_DM_ALREADY_SENT: "privateAlreadySent",
  ERR_IG_COMMENT_REPLY_REJECTED: "errRejectedPublic",
  ERR_IG_COMMENT_DM_REJECTED: "errRejectedPrivate",
  ERR_IG_COMMENT_REPLY_UNCONFIRMED: "errUnconfirmed",
  ERR_IG_COMMENT_REPLY_NOT_RECORDED: "errNotRecorded",
  ERR_IG_COMMENT_REPLY_TOKEN: "errToken",
  ERR_IG_COMMENT_REPLY_RATE_LIMIT: "errRateLimit",
  ERR_META_APP_NO_PERMISSION: "errPermission",
  ERR_IG_COMMENT_REPLY_TOO_LONG: "errTooLong",
};

export function InstagramCommentReplyDialog({ open, onOpenChange, ticketId, comment, messages }: Props) {
  const t = useTranslations("igCommentReply");
  const [kind, setKind] = useState<InstagramCommentReplyKind>("public");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const privateBlocked = useMemo(() => {
    if (!comment) return null;
    if (hasPrivateReplyFor(messages, comment.messageId)) return "privateAlreadySent";
    if (isInstagramCommentDmExpired(comment)) return "privateExpired";
    return null;
  }, [comment, messages]);

  // Nova abertura começa limpa e em público.
  useEffect(() => {
    if (open) {
      setKind("public");
      setText("");
    }
  }, [open, comment?.id]);

  useEffect(() => {
    if (kind === "private" && privateBlocked) setKind("public");
  }, [kind, privateBlocked]);

  if (!comment) return null;

  const max = kind === "private" ? INSTAGRAM_DM_TEXT_MAX : INSTAGRAM_COMMENT_REPLY_MAX;
  const trimmed = text.trim();
  const permalink = instagramCommentPermalink(comment.body);

  const handleSend = async () => {
    if (!trimmed || trimmed.length > max || sending) return;
    setSending(true);
    try {
      await replyInstagramCommentFromTicket(ticketId, { commentMessageId: comment.id, kind, body: trimmed });
      toast.success(kind === "private" ? t("sentPrivate") : t("sentPublic"));
      onOpenChange(false);
    } catch (err) {
      const key = ERROR_KEYS[getBackendErrorCode(err)] || "errGeneric";
      toast.error(t(key));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!sending) onOpenChange(o); }}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          <div className="rounded-md bg-muted p-3 space-y-1.5 min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5 shrink-0" />
              {t("commentLabel")}
            </p>
            <p className="text-sm whitespace-pre-wrap break-words">{instagramCommentText(comment.body)}</p>
            {permalink && (
              <a
                href={permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("openPost")}
              </a>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("kindLabel")}</Label>
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as InstagramCommentReplyKind)} className="gap-2">
              <label htmlFor="igc-public" className="flex items-start gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-accent/50">
                <RadioGroupItem value="public" id="igc-public" className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t("kindPublic")}</span>
                  <span className="block text-xs text-muted-foreground">{t("kindPublicHint")}</span>
                </span>
              </label>
              <label
                htmlFor="igc-private"
                className={`flex items-start gap-2 rounded-md border p-2.5 ${privateBlocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-accent/50"}`}
              >
                <RadioGroupItem value="private" id="igc-private" className="mt-0.5" disabled={!!privateBlocked} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t("kindPrivate")}</span>
                  <span className="block text-xs text-muted-foreground">{t("kindPrivateHint")}</span>
                  {privateBlocked && (
                    <span className="mt-1 flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
                      {t(privateBlocked)}
                    </span>
                  )}
                </span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="igc-text">{t("messageLabel")}</Label>
            <Textarea
              id="igc-text"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={kind === "private" ? t("placeholderPrivate") : t("placeholderPublic")}
              disabled={sending}
            />
            <p className={`text-right text-[11px] ${trimmed.length > max ? "text-destructive" : "text-muted-foreground"}`}>
              {t("counter", { count: trimmed.length, max })}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSend} disabled={sending || !trimmed || trimmed.length > max}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {sending ? t("sending") : t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
