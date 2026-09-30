"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { fetchDbConsoleHistory } from "@/services/db-console";
import type { DbConsoleHistoryEntry, DbConsoleLogKind } from "@/types/db-console";
import { HISTORY_PAGE_SIZES, describeDbConsoleError } from "./helpers";

const KINDS: DbConsoleLogKind[] = [
  "unlock", "unlock_failed", "provision", "query", "browse", "count", "row", "row_update", "export", "terminal",
];

const KIND_KEY: Record<DbConsoleLogKind, string> = {
  unlock: "kindUnlock",
  unlock_failed: "kindUnlockFailed",
  provision: "kindProvision",
  query: "kindQuery",
  browse: "kindBrowse",
  count: "kindCount",
  row: "kindRow",
  row_update: "kindRowUpdate",
  export: "kindExport",
  terminal: "kindTerminal",
};

const STATUS_KEY: Record<string, string> = {
  started: "statusStarted",
  ok: "statusOk",
  error: "statusError",
  denied: "statusDenied",
  timeout: "statusTimeout",
  conflict: "statusConflict",
  too_large: "statusTooLarge",
};

const ALL = "__all__";

export function HistoryTab() {
  const t = useTranslations("bancoDadosPage");
  const tErrors = useTranslations("errors");
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<DbConsoleHistoryEntry[]>([]);
  const [authors, setAuthors] = useState<{ userId: number; userName: string | null }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(HISTORY_PAGE_SIZES[0]);
  const [kind, setKind] = useState<string>(ALL);
  const [author, setAuthor] = useState<string>(ALL);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DbConsoleHistoryEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDbConsoleHistory({
        page,
        pageSize,
        kind: kind === ALL ? null : (kind as DbConsoleLogKind),
        userId: author === ALL ? null : Number(author),
      });
      setEntries(data.logs || []);
      setAuthors(data.authors || []);
      setTotal(Number(data.total) || 0);
    } catch (err) {
      setEntries([]);
      setError(describeDbConsoleError(err, t, tErrors("loadFailed")));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, kind, author]);

  useEffect(() => {
    void load();
  }, [load]);

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={author}
          onValueChange={value => {
            setAuthor(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-56">
            <SelectValue placeholder={t("historyAuthor")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("historyAuthor")}</SelectItem>
            {authors.map(item => (
              <SelectItem key={item.userId} value={String(item.userId)}>
                {item.userName || `#${item.userId}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={kind}
          onValueChange={value => {
            setKind(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-52">
            <SelectValue placeholder={t("historyKind")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("historyKind")}</SelectItem>
            {KINDS.map(item => (
              <SelectItem key={item} value={item}>
                {t(KIND_KEY[item])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("pageSize")}</span>
          <Select
            value={String(pageSize)}
            onValueChange={value => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HISTORY_PAGE_SIZES.map(size => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap text-xs">{t("historyWhen")}</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">{t("historyAuthor")}</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">{t("historyKind")}</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">{t("historyStatus")}</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">{t("historyRows")}</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">{t("historyDuration")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer"
                    onClick={() => setDetail(entry)}
                  >
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {entry.userName || (entry.userId ? `#${entry.userId}` : "—")}
                      {entry.targetTable ? (
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                          {entry.targetTable}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{t(KIND_KEY[entry.kind])}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <Badge
                        variant={
                          entry.status === "ok"
                            ? "secondary"
                            : entry.status === "started"
                            ? "outline"
                            : "destructive"
                        }
                        className="text-[10px]"
                      >
                        {t(STATUS_KEY[entry.status] || "statusError")}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {entry.rowCount === null ? "—" : formatNumber(entry.rowCount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {entry.durationMs === null ? "—" : `${formatNumber(entry.durationMs)} ms`}
                    </TableCell>
                  </TableRow>
                ))}
                {!entries.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      {t("emptyResult")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
          {t("prev")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {page} / {lastPage}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => setPage(p => p + 1)}
        >
          {t("next")}
        </Button>
      </div>

      <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent className="w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("historyDetail")}</DialogTitle>
            <DialogDescription className="text-xs">
              {detail ? new Date(detail.createdAt).toLocaleString() : ""}
              {detail?.ip ? ` · ${detail.ip}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail?.statement && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">
              {detail.statement}
            </pre>
          )}
          {detail?.changes && (
            <div className="space-y-2">
              {Object.entries(detail.changes).map(([column, change]) => (
                <div key={column} className="rounded border p-2 text-xs">
                  <p className="font-mono">{column}</p>
                  <p className="text-muted-foreground">
                    {t("before")}: {change.before ?? t("nullValue")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("after")}: {change.after ?? t("nullValue")}
                  </p>
                </div>
              ))}
            </div>
          )}
          {detail?.errorMessage && (
            <p className="text-xs text-destructive break-words">{detail.errorMessage}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
