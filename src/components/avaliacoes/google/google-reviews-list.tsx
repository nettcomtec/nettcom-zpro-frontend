"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, MapPin, MessageSquareReply, Pencil, RefreshCw, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { cn } from "@/lib/utils";
import { useLiveMode } from "@/hooks/use-live-mode";
import {
  fetchGoogleReviews,
  type GoogleReviewDTO,
  type GoogleReviewListResponse,
} from "@/services/google-business";
import { GoogleInfoTip, formatGoogleDateTime, googleBusinessErrorText } from "./google-connection-card";
import {
  GoogleReplyStateBadge,
  GoogleReviewReplyDialog,
  GoogleReviewerAvatar,
  GoogleStars,
  googleReviewerName,
} from "./google-review-reply-dialog";

/** Tamanho de página do backend (`GET /google-reviews`). */
const PAGE_SIZE = 20;

interface GoogleReviewsListProps {
  locationId?: number;
  /** AAAA-MM-DD */
  from?: string;
  /** AAAA-MM-DD */
  to?: string;
  /** Mostrar o nome da ficha em cada avaliação (empresa com mais de uma ficha). */
  showLocation: boolean;
  /** Muda quando a lista precisa ser relida (leitura nova, conexão mudou). */
  reloadKey: number;
  /** Chamado a cada carga concluída com sucesso. */
  onLoaded?: () => void;
}

const editedAfterCreate = (review: GoogleReviewDTO): boolean => {
  if (!review.createTime || !review.updateTime) return false;
  const c = new Date(review.createTime).getTime();
  const u = new Date(review.updateTime).getTime();
  return Number.isFinite(c) && Number.isFinite(u) && u - c > 60_000;
};

export function GoogleReviewsList({ locationId, from, to, showLocation, reloadKey, onLoaded }: GoogleReviewsListProps) {
  const t = useTranslations("googleReviews");
  const { isLiveMode } = useLiveMode();
  const [stars, setStars] = useState<number[]>([]);
  const [unanswered, setUnanswered] = useState(false);
  const filterKey = `${locationId ?? ""}|${from ?? ""}|${to ?? ""}|${stars.join(",")}|${unanswered ? 1 : 0}`;
  // Página guardada junto com os filtros: filtro novo volta à página 1 sem buscar 2 vezes.
  const [pageState, setPageState] = useState<{ key: string; page: number }>({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const [retryKey, setRetryKey] = useState(0);
  const [data, setData] = useState<GoogleReviewListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [replying, setReplying] = useState<GoogleReviewDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const seqRef = useRef(0);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    const seq = ++seqRef.current;
    setLoading(true);
    setErrorText(null);
    fetchGoogleReviews({ locationId, from, to, stars, unanswered, page })
      .then(({ data: res }) => {
        if (seq !== seqRef.current) return;
        setData({
          reviews: Array.isArray(res?.reviews) ? res.reviews : [],
          count: Number(res?.count) || 0,
          hasMore: res?.hasMore === true,
        });
        onLoadedRef.current?.();
      })
      .catch((err) => {
        if (seq !== seqRef.current) return;
        setErrorText(googleBusinessErrorText(t, err) ?? t("errorLoadList"));
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
    // `filterKey` resume locationId/from/to/stars/unanswered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, reloadKey, retryKey]);

  const setPage = (next: number) => setPageState({ key: filterKey, page: Math.max(1, next) });

  const toggleStar = (n: number) => {
    setStars((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
  };

  const handleUpdated = (review: GoogleReviewDTO) => {
    setData((prev) => prev ? { ...prev, reviews: prev.reviews.map((r) => (r.id === review.id ? review : r)) } : prev);
    setReplying((prev) => (prev && prev.id === review.id ? review : prev));
  };

  const handleRemoved = (reviewId: number) => {
    setData((prev) => prev
      ? { ...prev, reviews: prev.reviews.filter((r) => r.id !== reviewId), count: Math.max(0, prev.count - 1) }
      : prev);
  };

  const openReply = (review: GoogleReviewDTO) => {
    setReplying(review);
    setDialogOpen(true);
  };

  const reviews = data?.reviews ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasFilters = stars.length > 0 || unanswered;
  const firstLoad = loading && !data;

  return (
    <div className="space-y-3">
      {/* Filtros próprios da lista (ficha e período ficam no topo da aba) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("filterStarsLabel")}>
          <span className="text-xs text-muted-foreground">{t("filterStarsLabel")}</span>
          <button
            type="button"
            aria-pressed={stars.length === 0}
            onClick={() => setStars([])}
            className={cn(
              "h-8 rounded-md border px-2.5 text-xs transition-colors",
              stars.length === 0 ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-muted",
            )}
          >
            {t("filterStarsAll")}
          </button>
          {[5, 4, 3, 2, 1].map((n) => {
            const active = stars.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={active}
                aria-label={t("starsAria", { count: n })}
                onClick={() => toggleStar(n)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs tabular-nums transition-colors",
                  active ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-muted",
                )}
              >
                {n}
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" aria-hidden />
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="google-reviews-unanswered" checked={unanswered} onCheckedChange={setUnanswered} />
          <Label htmlFor="google-reviews-unanswered" className="text-sm">{t("filterUnanswered")}</Label>
          <GoogleInfoTip text={t("filterUnansweredTip")} label={t("infoLabel")} />
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          className="ml-auto"
          onClick={() => setRetryKey((k) => k + 1)}
          disabled={loading}
          aria-label={t("reloadList")}
          title={t("reloadList")}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {firstLoad ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : errorText && !data ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">{errorText}</p>
            <Button variant="outline" size="sm" onClick={() => setRetryKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4" />
              {t("retry")}
            </Button>
          </CardContent>
        </Card>
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title={t("listEmptyTitle")}
          description={hasFilters || locationId || from || to ? t("listEmptyFilteredDesc") : t("listEmptyDesc")}
        />
      ) : (
        <div className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
          {errorText && <p className="text-xs text-destructive">{errorText}</p>}
          {reviews.map((review) => {
            const name = googleReviewerName(t, review);
            const date = formatGoogleDateTime(review.createTime);
            const edited = editedAfterCreate(review) ? formatGoogleDateTime(review.updateTime) : "";
            const reply = review.reply;
            const replyDate = reply ? formatGoogleDateTime(reply.updateTime) : "";
            return (
              <Card key={review.id} className={cn(review.isNew && "border-primary/40")}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <GoogleReviewerAvatar review={review} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={cn("text-sm font-medium break-words", isLiveMode && "live-blur-text")}>{name}</span>
                        {review.isNew && (
                          <span className="inline-flex items-center gap-1">
                            <Badge variant="info-soft" className="font-normal">{t("badgeNew")}</Badge>
                            <GoogleInfoTip text={t("badgeNewTip")} label={t("infoLabel")} />
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <GoogleStars rating={review.starRating} />
                        {date && <span>{date}</span>}
                        {edited && <span>({t("reviewEdited", { date: edited })})</span>}
                      </div>
                      {showLocation && review.locationTitle && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{review.locationTitle}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {review.comment ? (
                    <p className="whitespace-pre-line break-words text-sm">{review.comment}</p>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">{t("reviewNoComment")}</p>
                  )}

                  {reply && (
                    <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium">{t("replyFromCompany")}</span>
                        <GoogleReplyStateBadge state={reply.state} />
                        {replyDate && <span className="text-muted-foreground">{replyDate}</span>}
                      </div>
                      <p className="whitespace-pre-line break-words text-sm">{reply.comment}</p>
                      {reply.state === "REJECTED" && reply.policyViolation && (
                        <p className="text-xs text-destructive">{t("rejectedReason", { reason: reply.policyViolation })}</p>
                      )}
                      {reply.repliedByName && (
                        <p className="text-[11px] text-muted-foreground">{t("repliedBy", { name: reply.repliedByName })}</p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant={reply ? "outline" : "default"}
                      className="w-full sm:w-auto"
                      onClick={() => openReply(review)}
                    >
                      {reply ? <Pencil className="h-4 w-4" /> : <MessageSquareReply className="h-4 w-4" />}
                      {reply ? t("editReply") : t("reply")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("listCount", { count })}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
                aria-label={t("prevPage")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm tabular-nums">{t("pageOf", { page, total: Math.max(totalPages, page) })}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data?.hasMore || loading}
                onClick={() => setPage(page + 1)}
                aria-label={t("nextPage")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <GoogleReviewReplyDialog
        review={replying}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setReplying(null);
        }}
        onUpdated={handleUpdated}
        onRemoved={handleRemoved}
      />
    </div>
  );
}
