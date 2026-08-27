"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { PauseCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchPauseReport, type PauseReport } from "@/services/user-pause";
import { DateRangePresets } from "@/components/ui/date-range-presets";

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fmtDur(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return "—"; }
}

export default function RelatorioPausasPage() {
  const t = useTranslations("pauseReportPage");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });

  const [start, setStart] = useState(todayStr());
  const [end, setEnd] = useState(todayStr());
  const [data, setData] = useState<PauseReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: string = start, e: string = end) => {
    setLoading(true);
    try {
      const res = await fetchPauseReport({ startDate: s, endDate: e });
      setData(res.data);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  useEffect(() => {
    if (allowed) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!allowed) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t("filterStart")}</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("filterEnd")}</Label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" />
        </div>
        <DateRangePresets onSelect={(s, e) => { setStart(s); setEnd(e); load(s, e); }} />
        <Button onClick={() => load()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> {t("refresh")}
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.sessions.length === 0 ? (
        <EmptyState icon={PauseCircle} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("summaryTitle")}</h3>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colUser")}</TableHead>
                    <TableHead className="w-24 text-right">{t("colCount")}</TableHead>
                    <TableHead className="w-32 text-right">{t("colTotalTime")}</TableHead>
                    <TableHead className="w-28 text-right">{t("colOverflows")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byUser.map((u) => (
                    <React.Fragment key={u.userId}>
                      <TableRow className="font-medium">
                        <TableCell>{u.userName}</TableCell>
                        <TableCell className="text-right">{u.totalSessions}</TableCell>
                        <TableCell className="text-right font-mono">{fmtDur(u.totalDurationSeconds)}</TableCell>
                        <TableCell className="text-right">
                          {u.overflowCount > 0
                            ? <Badge variant="destructive" className="text-[10px]">{u.overflowCount}</Badge>
                            : "0"}
                        </TableCell>
                      </TableRow>
                      {u.reasons.map((r) => (
                        <TableRow key={`${u.userId}-${r.reasonId}`} className="text-xs text-muted-foreground">
                          <TableCell className="pl-8">
                            <span className="flex items-center gap-2">
                              {r.reasonColor && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.reasonColor }} />}
                              {r.reasonName || t("noReason")}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{r.count}</TableCell>
                          <TableCell className="text-right font-mono">{fmtDur(r.durationSeconds)}</TableCell>
                          <TableCell className="text-right">{r.overflowCount || 0}</TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("detailTitle")}</h3>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colUser")}</TableHead>
                    <TableHead>{t("colReason")}</TableHead>
                    <TableHead className="w-44">{t("colStart")}</TableHead>
                    <TableHead className="w-44">{t("colEnd")}</TableHead>
                    <TableHead className="w-28 text-right">{t("colDuration")}</TableHead>
                    <TableHead className="w-24">{t("colOverflow")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.userName}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {s.reasonColor && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.reasonColor }} />}
                          {s.reasonName || t("noReason")}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{fmtTime(s.startedAt)}</TableCell>
                      <TableCell className="text-xs">
                        {s.active
                          ? <Badge variant="secondary" className="text-[10px]">{t("inProgress")}</Badge>
                          : fmtTime(s.endedAt)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtDur(s.durationSeconds)}</TableCell>
                      <TableCell>
                        {s.overflowed
                          ? <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle className="h-3 w-3" />{t("overflowYes")}</Badge>
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
