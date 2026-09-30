"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, AlertTriangle, RefreshCw, ShieldOff, ShieldCheck, ExternalLink, Info, Trash2, Unlock, Lock, BookOpen } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { classifyWabaPhoneStatus, isWabaPhoneStatusProblem, wabaPhoneStatusI18nKey } from "@/lib/waba-phone-quality";
import { DeleteBannedChannelDialog } from "./delete-banned-channel-dialog";
import { CourtesyUnblockDialog } from "./courtesy-unblock-dialog";

interface PhoneInfo {
  phoneNumberId: string;
  displayPhoneNumber?: string | null;
  qualityRating?: string | null;
  messagingLimitTier?: string | null;
  phoneStatus?: string | null;
  lastScanAt?: string | null;
}

interface MetaHealthData {
  licenseCode: string;
  /**
   * Aditivo (backend novo): quando true, `phones` traz apenas os numeros DESTA
   * instalacao, enquanto `counts` continua sendo da licenca inteira. Ausente em
   * backend antigo — nesse caso a tela se comporta exatamente como antes.
   */
  phonesFilteredToInstall?: boolean;
  score: number;
  tier: "healthy" | "watch" | "warn" | "critical";
  blockSeverity: "none" | "yellow_accum" | "red" | "restricted" | "banned" | "rejected";
  trump?: string | null;
  counts: {
    phonesTotal: number;
    phonesGreen: number;
    phonesYellow: number;
    phonesRed: number;
    phonesRestricted: number;
    phonesBanned?: number;
    phonesDisassociated: number;
    phonesUnclassified?: number;
  };
  oauthBlocked: boolean;
  oauthBlockedAt?: string | null;
  oauthBlockedReason?: string | null;
  oauthUnblockEligibleAt?: string | null;
  // Add-on "Score Ilimitado" (aditivo — backend/proxy antigo nao envia): isencao ativa
  // e ate quando. Quando true, o card mostra "isento ate {data}" no lugar da contagem.
  scoreExempt?: boolean;
  scoreExemptUntil?: string | null;
  lastTier?: string | null;
  lastCriticalSince?: string | null;
  lastScoreChangeAt?: string | null;
  lastComputedAt?: string | null;
  courtesy?: {
    available: boolean;
    // "manual_block": bloqueio feito pela equipe — a cortesia não se aplica.
    reason: "ok" | "not_blocked" | "blocking_numbers_present" | "cooldown" | "manual_block";
    nextEligibleAt?: string | null;
    lastCourtesyUnblockAt?: string | null;
    liveBlockSeverity?: string;
    blockingPhones?: Array<{
      phoneNumberId: string;
      displayPhoneNumber?: string | null;
      kind: "banned" | "restricted" | "rejected" | "red" | "yellow";
    }>;
  };
  phones: PhoneInfo[];
}

const POLL_MS = 5 * 60 * 1000;

const SCORE_HELP_URL = "https://ajuda.zdg.com.br/configuracao-superadmin/tenants-e-licenca/gerenciar-licenca-z-pro/score-do-app-tech-provider";

function tierBadgeVariant(tier: string): "success" | "secondary" | "warning" | "destructive" {
  if (tier === "healthy") return "success";
  if (tier === "watch") return "secondary";
  if (tier === "warn") return "warning";
  return "destructive";
}

function tierColorBar(tier: string): string {
  if (tier === "healthy") return "bg-green-500";
  if (tier === "watch") return "bg-yellow-400";
  if (tier === "warn") return "bg-orange-500";
  return "bg-red-500";
}

function formatDate(s?: string | null): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("pt-BR"); } catch { return s; }
}

function daysBetween(a?: string | null, b?: Date): number | null {
  if (!a) return null;
  const d = new Date(a).getTime();
  const now = (b || new Date()).getTime();
  return Math.max(0, Math.floor((now - d) / (24 * 60 * 60 * 1000)));
}

const BLOCK_DAYS_BY_SEVERITY: Record<string, number> = {
  yellow_accum: 3, red: 3, restricted: 1, banned: 1, rejected: 1,
};

export function MetaHealthCard() {
  const t = useTranslations("metaHealth");
  const [data, setData] = useState<MetaHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forcing, setForcing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PhoneInfo | null>(null);
  const [courtesyOpen, setCourtesyOpen] = useState(false);
  const [helpArticleOpen, setHelpArticleOpen] = useState(false);
  // O site de ajuda (GitBook em ajuda.zdg.com.br) envia CSP `frame-ancestors https:`,
  // então o iframe só funciona quando o painel roda sob HTTPS (mesmo padrão do
  // accept-terms-modal). Em http caímos num fallback "abrir em nova aba".
  const [canEmbed, setCanEmbed] = useState(true);
  useEffect(() => {
    setCanEmbed(typeof window !== "undefined" && window.location.protocol === "https:");
  }, []);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const resp = await api.get("/license/health");
      setData(resp.data);
      setError(null);
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === "LICENSE_NOT_OBSERVED_YET") setError("not_observed");
      else if (code === "LICENSE_NOT_CONFIGURED") setError("not_configured");
      else if (code === "OAUTH_PROXY_UNREACHABLE") setError("unreachable");
      else setError("generic");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(id);
  }, []);

  async function handleForceRefresh() {
    setForcing(true);
    try {
      const resp = await api.post("/meta/phone-health/force-refresh");
      const r = resp.data;
      // pull = { wabas: N }; report = { ok, totalPhones, reason? }
      const reportTotal = r?.report?.totalPhones ?? 0;
      const reason = r?.report?.reason;
      // pequena pausa pra dar tempo do proxy registrar o report antes de reler
      await new Promise(res => setTimeout(res, 1500));
      await load(true);
      if (reason === "no_license") {
        toast.warning(t("error.not_configured"));
      } else if (reason === "all_endpoints_failed") {
        toast.error(t("forceError"));
      } else if (reportTotal === 0) {
        toast.info(t("forceNoData"));
      } else {
        toast.success(t("forceSuccess"));
      }
    } catch (err: any) {
      if (err?.response?.status === 403) toast.error(t("forceForbidden"));
      else toast.error(t("forceError"));
    } finally {
      setForcing(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">{t("title")}</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  if (error) {
    // not_configured = sem licença → force-refresh não tem o que observar; demais
    // estados (not_observed/unreachable/generic) se resolvem com pull + report manual.
    const canForce = error !== "not_configured";
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t(`error.${error}`)}</p>
          {canForce && (
            <div className="space-y-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={forcing}
                onClick={handleForceRefresh}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${forcing ? "animate-spin" : ""}`} />
                {forcing ? t("forcingNow") : t("forceRefreshNow")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("forceObservedHint")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const blockDays = BLOCK_DAYS_BY_SEVERITY[data.blockSeverity] || null;
  const daysInCritical = daysBetween(data.lastCriticalSince);
  const daysUntilBlock = blockDays !== null && daysInCritical !== null ? Math.max(0, blockDays - daysInCritical) : null;

  // Conta de banidos: prefere a do proxy (phonesBanned); se o proxy ainda não tiver
  // atualizado, deriva da lista de phones (phoneStatus literal do snapshot da Meta).
  const bannedCount = data.counts.phonesBanned ?? data.phones.filter(p => classifyWabaPhoneStatus(p.phoneStatus) === "banned").length;
  const hasAffected =
    data.counts.phonesRed > 0 || data.counts.phonesYellow > 0 || data.counts.phonesRestricted > 0 || bannedCount > 0;

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-2 flex-1 min-w-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Activity className="h-4 w-4" />
            {t("title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground leading-snug">{t("subtitle")}</p>
          <div className="flex items-start gap-2 rounded-md border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 px-2.5 py-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <span className="text-xs leading-snug text-blue-900 dark:text-blue-200">{t("sharedNote")}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={forcing}
          onClick={handleForceRefresh}
          aria-label={t("forceRefreshNow")}
          title={t("forceRefreshNow")}
        >
          <RefreshCw className={`h-4 w-4 ${forcing ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{t("oauthStatus")}</span>
          <Badge variant={data.oauthBlocked ? "destructive" : "success"} className="gap-1">
            {data.oauthBlocked ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {data.oauthBlocked ? t("oauthBlocked") : t("oauthAllowed")}
          </Badge>
        </div>

        {/* Add-on "Score Ilimitado" ativo: a licenca nao passa pelo score. Substitui a
            contagem regressiva de bloqueio (abaixo, guardada por !data.scoreExempt). */}
        {data.scoreExempt && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              {t("scoreExempt.title")}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.scoreExemptUntil
                ? t("scoreExempt.activeUntil", { date: formatDate(data.scoreExemptUntil) })
                : t("scoreExempt.active")}
            </p>
          </div>
        )}

        {data.oauthBlocked && (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-400">
              <ShieldOff className="h-4 w-4" />
              {t("oauthBlocked")}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("blockedAt")}: {formatDate(data.oauthBlockedAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("blockedReason")}: <code className="font-mono">{data.oauthBlockedReason || "—"}</code>
            </p>
            {data.oauthUnblockEligibleAt && (
              <p className="text-xs text-muted-foreground">
                {t("unblockEligibleAt")}: {formatDate(data.oauthUnblockEligibleAt)}
              </p>
            )}
            <p className="text-xs mt-2">{t("blockedHint")}</p>

            {/* Desbloqueio de cortesia (self-service, 1x a cada 4 meses) */}
            <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-900/40 space-y-2">
              <Button
                variant={data.courtesy?.available ? "default" : "outline"}
                size="sm"
                disabled={!data.courtesy?.available}
                onClick={() => setCourtesyOpen(true)}
                className="w-full sm:w-auto"
              >
                {data.courtesy?.available ? (
                  <Unlock className="h-4 w-4 mr-2" />
                ) : (
                  <Lock className="h-4 w-4 mr-2" />
                )}
                {t("courtesy.button")}
              </Button>

              {data.courtesy?.available && (
                <p className="text-xs text-muted-foreground">{t("courtesy.available")}</p>
              )}

              {data.courtesy?.reason === "cooldown" && (
                <p className="text-xs text-muted-foreground">
                  {t("courtesy.cooldown", { date: formatDate(data.courtesy.nextEligibleAt) })}
                </p>
              )}

              {data.courtesy?.reason === "blocking_numbers_present" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {t("courtesy.blocking", { count: data.courtesy.blockingPhones?.length ?? 0 })}
                  </p>
                  <ul className="text-xs space-y-1">
                    {(data.courtesy.blockingPhones ?? []).map((bp) => {
                      const deletable = bp.kind !== "yellow";
                      return (
                        <li
                          key={bp.phoneNumberId}
                          className="flex items-center justify-between gap-2 border-b border-red-200/60 dark:border-red-900/30 pb-1"
                        >
                          <span className="font-mono">{bp.displayPhoneNumber || bp.phoneNumberId}</span>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={bp.kind === "yellow" ? "warning" : "destructive"}>
                              {t(`courtesy.kind.${bp.kind}`)}
                            </Badge>
                            {deletable && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-red-600 hover:text-red-700"
                                onClick={() =>
                                  setDeleteTarget({
                                    phoneNumberId: bp.phoneNumberId,
                                    displayPhoneNumber: bp.displayPhoneNumber,
                                  })
                                }
                                title={t("deleteBanned.buttonTooltip")}
                                aria-label={t("deleteBanned.buttonTooltip")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {(data.courtesy.blockingPhones ?? []).some((bp) => bp.kind === "yellow") && (
                    <p className="text-xs text-muted-foreground">{t("courtesy.yellowNote")}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {data.tier === "critical" && !data.oauthBlocked && !data.scoreExempt && daysUntilBlock !== null && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              {t("criticalWarning")}
            </div>
            <p className="text-xs">
              {t("blockIn", { days: daysUntilBlock })} ({t(`blockSeverity.${data.blockSeverity}`)})
            </p>
            <p className="text-xs text-muted-foreground">{t("criticalAdvice")}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground inline-flex items-center gap-2">
              {t("score")}
              <button
                type="button"
                onClick={() => setHelpArticleOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <BookOpen className="h-3 w-3" />
                {t("helpArticle.trigger")}
              </button>
            </span>
            <Badge variant={tierBadgeVariant(data.tier)}>{t(`tier.${data.tier}`)}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-semibold tabular-nums">{data.score}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${tierColorBar(data.tier)}`} style={{ width: `${data.score}%` }} />
            </div>
          </div>
          {data.lastTier && data.lastTier !== data.tier && (
            <p className="text-xs text-muted-foreground">
              {t("previousTier")}: <span className="font-medium">{t(`tier.${data.lastTier}`)}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border p-2 text-center">
            <div className="text-green-600 font-semibold">{data.counts.phonesGreen}</div>
            <div className="text-muted-foreground">{t("counts.green")}</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="text-yellow-600 font-semibold">{data.counts.phonesYellow}</div>
            <div className="text-muted-foreground">{t("counts.yellow")}</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="text-red-600 font-semibold">{data.counts.phonesRed}</div>
            <div className="text-muted-foreground">{t("counts.red")}</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="font-semibold">{data.counts.phonesRestricted}</div>
            <div className="text-muted-foreground">{t("counts.restricted")}</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className={`font-semibold ${bannedCount > 0 ? "text-red-600" : ""}`}>{bannedCount}</div>
            <div className="text-muted-foreground">{t("counts.banned")}</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="font-semibold">{data.counts.phonesDisassociated}</div>
            <div className="text-muted-foreground">{t("counts.disassociated")}</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="font-semibold">{data.counts.phonesUnclassified ?? 0}</div>
            <div className="text-muted-foreground">{t("counts.unclassified")}</div>
          </div>
          <div className="col-span-3 rounded border p-2 text-center">
            <div className="font-semibold">{data.counts.phonesTotal}</div>
            <div className="text-muted-foreground">{t("counts.total")}</div>
          </div>
        </div>

        {data.phones.length > 0 && hasAffected && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">{t("affectedPhones")}</p>
            {/* Lista = so desta instalacao; totais = licenca inteira. Sem esta nota
                o usuario acha que a contagem esta errada. So aparece no backend novo. */}
            {data.phonesFilteredToInstall && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                {t("phonesFromThisInstall")}
              </p>
            )}
            <ul className="text-xs space-y-1">
              {data.phones
                .filter(p => p.qualityRating === "RED" || p.qualityRating === "YELLOW" || isWabaPhoneStatusProblem(p.phoneStatus))
                .slice(0, 10)
                .map(p => {
                  const sev = classifyWabaPhoneStatus(p.phoneStatus);
                  const statusProblem = sev !== "ok" && sev !== "other";
                  const label = statusProblem ? t(`status.${wabaPhoneStatusI18nKey(p.phoneStatus)}`) : p.qualityRating;
                  const destructive = sev === "banned" || sev === "restricted" || p.qualityRating === "RED";
                  return (
                    <li key={p.phoneNumberId} className="flex items-center justify-between gap-2 border-b pb-1">
                      <span className="font-mono">{p.displayPhoneNumber || p.phoneNumberId}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={destructive ? "destructive" : "warning"}>
                          {label}
                        </Badge>
                        {destructive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-600 hover:text-red-700"
                            onClick={() => setDeleteTarget(p)}
                            title={t("deleteBanned.buttonTooltip")}
                            aria-label={t("deleteBanned.buttonTooltip")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}

        <div className="pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("lastUpdate")}: {formatDate(data.lastComputedAt)}</span>
          <a
            href="/app-waba"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {t("ownAppCta")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
    <DeleteBannedChannelDialog
      open={!!deleteTarget}
      onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
      phoneNumberId={deleteTarget?.phoneNumberId ?? null}
      displayPhoneNumber={deleteTarget?.displayPhoneNumber}
      onDeleted={() => load(true)}
    />
    <CourtesyUnblockDialog
      open={courtesyOpen}
      onOpenChange={setCourtesyOpen}
      onDone={() => load(true)}
    />
    <Dialog open={helpArticleOpen} onOpenChange={setHelpArticleOpen}>
      <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] h-[92vh] max-h-[92vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("helpArticle.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-end pb-1.5 shrink-0">
          <a
            href={SCORE_HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            {t("helpArticle.openNewTab")} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex-1 border rounded-md overflow-hidden bg-background min-h-0">
          {canEmbed ? (
            <iframe
              src={SCORE_HELP_URL}
              title={t("helpArticle.title")}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <ExternalLink className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-md">{t("helpArticle.httpFallback")}</p>
              <a
                href={SCORE_HELP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {t("helpArticle.openNewTab")} <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
