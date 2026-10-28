"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, MapPin, Send, Sparkles, Star, Trash2, User } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import api, { BACKGROUND_REQUEST } from "@/lib/api";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useLiveMode } from "@/hooks/use-live-mode";
import {
  GOOGLE_REVIEW_REPLY_MAX_BYTES,
  deleteGoogleReviewReply,
  replyGoogleReview,
  suggestGoogleReviewReply,
  utf8ByteLength,
  type GoogleReviewDTO,
  type GoogleReviewReplyState,
} from "@/services/google-business";
import { GoogleInfoTip, formatGoogleDateTime, googleBusinessErrorText } from "./google-connection-card";

// ─── Peças visuais compartilhadas com a lista ──────────────────────

export function GoogleStars({ rating, className }: { rating: number; className?: string }) {
  const t = useTranslations("googleReviews");
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return (
    <span
      role="img"
      aria-label={r > 0 ? t("starsAria", { count: r }) : t("starsNone")}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn("h-3.5 w-3.5", i < r ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}

/** Nome exibido do autor: anônimo quando o Google esconde a pessoa. */
export function googleReviewerName(t: ReturnType<typeof useTranslations>, review: GoogleReviewDTO): string {
  if (review.isAnonymous) return t("reviewAnonymous");
  return (review.reviewerName || "").trim() || t("reviewAnonymous");
}

export function GoogleReviewerAvatar({ review, className }: { review: GoogleReviewDTO; className?: string }) {
  const { isLiveMode } = useLiveMode();
  const name = review.isAnonymous ? "" : (review.reviewerName || "").trim();
  const photo =
    !review.isAnonymous && !isLiveMode && review.reviewerPhotoUrl && /^https:\/\//i.test(review.reviewerPhotoUrl)
      ? review.reviewerPhotoUrl
      : null;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <Avatar className={cn("h-9 w-9", className)}>
      {photo && <AvatarImage src={photo} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="text-xs">
        {initials && !isLiveMode ? initials : <User className="h-4 w-4 text-muted-foreground" />}
      </AvatarFallback>
    </Avatar>
  );
}

export function GoogleReplyStateBadge({ state }: { state: GoogleReviewReplyState }) {
  const t = useTranslations("googleReviews");
  if (state === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1">
        <Badge variant="warning-soft" className="font-normal">{t("replyStatePending")}</Badge>
        <GoogleInfoTip text={t("replyStatePendingTip")} label={t("infoLabel")} />
      </span>
    );
  }
  if (state === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1">
        <Badge variant="destructive-soft" className="font-normal">{t("replyStateRejected")}</Badge>
        <GoogleInfoTip text={t("replyStateRejectedTip")} label={t("infoLabel")} />
      </span>
    );
  }
  return null;
}

// ─── Copiloto disponível? (mesma leitura do campo de mensagem do atendimento) ──
let copilotCache: { at: number; available: boolean } | null = null;
const COPILOT_CACHE_MS = 60_000;

async function resolveCopilotAvailable(): Promise<boolean> {
  if (copilotCache && Date.now() - copilotCache.at < COPILOT_CACHE_MS) return copilotCache.available;
  let available = false;
  try {
    const { data } = await api.get<{ sources?: { copilot?: { available?: boolean } } }>("/copilot/resolve", BACKGROUND_REQUEST);
    // Só a fonte "copilot" vale aqui: a sugestão nunca usa a chave de um canal.
    available = data?.sources?.copilot?.available === true;
  } catch {
    available = false;
  }
  copilotCache = { at: Date.now(), available };
  return available;
}

function reviewFromError(err: unknown): GoogleReviewDTO | null {
  const e = err as { data?: { review?: unknown }; response?: { data?: { review?: unknown } } } | null;
  const r = e?.data?.review ?? e?.response?.data?.review;
  if (r && typeof r === "object" && typeof (r as { id?: unknown }).id === "number") return r as GoogleReviewDTO;
  return null;
}

function isReviewDTO(value: unknown): value is GoogleReviewDTO {
  return !!value && typeof value === "object" && typeof (value as { id?: unknown }).id === "number";
}

interface GoogleReviewReplyDialogProps {
  review: GoogleReviewDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Versão nova da avaliação (publicou, apagou ou o Google mudou a resposta). */
  onUpdated: (review: GoogleReviewDTO) => void;
  /** A avaliação não existe mais no Google. */
  onRemoved?: (reviewId: number) => void;
}

export function GoogleReviewReplyDialog({ review, open, onOpenChange, onUpdated, onRemoved }: GoogleReviewReplyDialogProps) {
  const t = useTranslations("googleReviews");
  const { isLiveMode } = useLiveMode();
  const aiFeature = useAuthStore((s) => s.hasFeature("aiIntegrations"));
  const [current, setCurrent] = useState<GoogleReviewDTO | null>(review);
  const [text, setText] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState<"publish" | "delete" | "suggest" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copilotAvailable, setCopilotAvailable] = useState(false);
  const openedIdRef = useRef<number | null>(null);

  // Ao abrir (ou trocar de avaliação), começa do que está gravado.
  useEffect(() => {
    if (!open || !review) {
      openedIdRef.current = null;
      return;
    }
    if (openedIdRef.current === review.id) return;
    openedIdRef.current = review.id;
    setCurrent(review);
    setText(review.reply?.comment ?? "");
    setConflict(false);
    setDeleteOpen(false);
  }, [open, review]);

  useEffect(() => {
    if (!open || !aiFeature) {
      setCopilotAvailable(false);
      return;
    }
    let cancelled = false;
    resolveCopilotAvailable().then((ok) => {
      if (!cancelled) setCopilotAvailable(ok);
    });
    return () => { cancelled = true; };
  }, [open, aiFeature]);

  const comment = text.trim();
  const bytes = utf8ByteLength(comment);
  const tooLong = bytes > GOOGLE_REVIEW_REPLY_MAX_BYTES;
  const currentReply = current?.reply ?? null;
  const unchanged = comment === (currentReply?.comment ?? "").trim();
  const canPublish = !!current && comment.length > 0 && !tooLong && !unchanged && busy === null;

  const handleError = (err: unknown) => {
    const code = getBackendErrorCode(err);
    if (code === "ERR_GOOGLE_REVIEW_REPLY_CHANGED") {
      const fresh = reviewFromError(err);
      if (fresh) {
        setCurrent(fresh);
        onUpdated(fresh);
      }
      setConflict(true);
      toast.warning(t("errReplyChanged"));
      return;
    }
    if (code === "ERR_GOOGLE_REVIEW_NOT_FOUND" && current) {
      toast.error(t("errReviewNotFound"));
      onRemoved?.(current.id);
      onOpenChange(false);
      return;
    }
    const msg = googleBusinessErrorText(t, err);
    if (msg) toast.error(msg);
  };

  const handlePublish = async () => {
    if (!current || !canPublish) return;
    setBusy("publish");
    try {
      const { data } = await replyGoogleReview(current.id, comment, currentReply?.updateTime ?? null);
      if (isReviewDTO(data)) onUpdated(data);
      toast.success(isReviewDTO(data) && data.reply?.state === "PENDING" ? t("replyPublishedPending") : t("replyPublished"));
      onOpenChange(false);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!current || !currentReply) return;
    setBusy("delete");
    try {
      const { data } = await deleteGoogleReviewReply(current.id, currentReply.updateTime ?? null);
      if (isReviewDTO(data)) onUpdated(data);
      else onUpdated({ ...current, reply: null });
      toast.success(t("replyDeleted"));
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (err) {
      setDeleteOpen(false);
      handleError(err);
    } finally {
      setBusy(null);
    }
  };

  const handleSuggest = async () => {
    if (!current || busy !== null) return;
    setBusy("suggest");
    const previous = text;
    try {
      const { data } = await suggestGoogleReviewReply(current.id);
      const suggestion = typeof data?.suggestion === "string" ? data.suggestion.trim() : "";
      if (!suggestion) {
        toast.error(t("errGeneric"));
        return;
      }
      setText(suggestion);
      toast.success(t("replySuggestDone"), previous.trim()
        ? { action: { label: t("replySuggestUndo"), onClick: () => setText(previous) } }
        : undefined);
    } catch (err) {
      const msg = googleBusinessErrorText(t, err);
      if (msg) toast.error(msg);
      if (getBackendErrorCode(err) === "ERR_COPILOT_NO_API_KEY") {
        copilotCache = { at: Date.now(), available: false };
        setCopilotAvailable(false);
      }
    } finally {
      setBusy(null);
    }
  };

  const reviewer = current ? googleReviewerName(t, current) : "";
  const reviewDate = current ? formatGoogleDateTime(current.createTime) : "";
  const replyDate = currentReply ? formatGoogleDateTime(currentReply.updateTime) : "";

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o && busy !== null) return; onOpenChange(o); }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{currentReply ? t("editReplyDialogTitle") : t("replyDialogTitle")}</DialogTitle>
            <DialogDescription>{t("replyDialogDesc")}</DialogDescription>
          </DialogHeader>

          {current && (
            <div className="space-y-4">
              {/* A avaliação, para o atendente ter o contexto ao escrever */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <GoogleReviewerAvatar review={current} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium truncate", isLiveMode && "live-blur-text")}>{reviewer}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <GoogleStars rating={current.starRating} />
                      {reviewDate && <span>{reviewDate}</span>}
                    </div>
                    {current.locationTitle && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{current.locationTitle}</span>
                      </p>
                    )}
                  </div>
                </div>
                {current.comment ? (
                  <p className="max-h-40 overflow-y-auto whitespace-pre-line break-words text-sm">{current.comment}</p>
                ) : (
                  <p className="text-xs italic text-muted-foreground">{t("reviewNoComment")}</p>
                )}
              </div>

              {currentReply && (
                <div className={cn("rounded-lg border bg-muted/40 p-3 space-y-1.5", conflict && "border-warning/60")}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium">{t("replyCurrentLabel")}</span>
                    <GoogleReplyStateBadge state={currentReply.state} />
                    {replyDate && <span className="text-muted-foreground">{replyDate}</span>}
                  </div>
                  <p className="max-h-32 overflow-y-auto whitespace-pre-line break-words text-sm">{currentReply.comment}</p>
                  {currentReply.state === "REJECTED" && currentReply.policyViolation && (
                    <p className="text-xs text-destructive">{t("rejectedReason", { reason: currentReply.policyViolation })}</p>
                  )}
                </div>
              )}

              {conflict && (
                <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">{t("replyChangedNotice")}</p>
              )}

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="google-review-reply-text">{t("replyTextLabel")}</Label>
                  {copilotAvailable && (
                    <span className="inline-flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleSuggest}
                        disabled={busy !== null}
                      >
                        {busy === "suggest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {t("replySuggest")}
                      </Button>
                      <GoogleInfoTip text={t("replySuggestTip")} label={t("infoLabel")} />
                    </span>
                  )}
                </div>
                <Textarea
                  id="google-review-reply-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("replyPlaceholder")}
                  rows={6}
                  disabled={busy === "suggest"}
                  aria-invalid={tooLong}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
                    {tooLong ? t("replyTooLong") : null}
                  </p>
                  <span className="inline-flex items-center gap-1">
                    <span className={cn("text-xs tabular-nums", tooLong ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {t("replyCounter", { used: bytes, max: GOOGLE_REVIEW_REPLY_MAX_BYTES })}
                    </span>
                    <GoogleInfoTip text={t("replyCounterTip")} label={t("infoLabel")} />
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div>
              {currentReply && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive sm:w-auto"
                  onClick={() => setDeleteOpen(true)}
                  disabled={busy !== null}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("replyDelete")}
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={busy !== null}>
                {t("cancel")}
              </Button>
              <Button className="w-full sm:w-auto" onClick={handlePublish} disabled={!canPublish} loading={busy === "publish"}>
                {busy !== "publish" && <Send className="h-4 w-4" />}
                {currentReply ? t("replyUpdate") : t("replyPublish")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => { if (busy !== "delete") setDeleteOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("replyDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("replyDeleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>{t("cancel")}</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} loading={busy === "delete"}>
              {t("replyDeleteConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
