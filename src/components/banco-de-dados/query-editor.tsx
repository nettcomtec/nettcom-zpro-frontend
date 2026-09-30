"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Play } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/format";
import { runDbConsoleQuery, isDbConsoleApiError } from "@/services/db-console";
import type { DbConsoleQueryResponse } from "@/types/db-console";
import { DataGrid } from "./data-grid";
import { ExportButton } from "./export-button";
import {
  QUERY_DRAFT_STORAGE_KEY,
  QUERY_MAX_ROWS,
  describeDbConsoleError,
  quoteIdent,
} from "./helpers";

const readDraft = (): string => {
  try {
    return window.sessionStorage.getItem(QUERY_DRAFT_STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

const writeDraft = (value: string): void => {
  try {
    window.sessionStorage.setItem(QUERY_DRAFT_STORAGE_KEY, value);
  } catch {
    // aba anônima ou storage bloqueado: o rascunho simplesmente não sobrevive.
  }
};

export function QueryEditor() {
  const t = useTranslations("bancoDadosPage");
  const [sql, setSql] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DbConsoleQueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowedColumns, setAllowedColumns] = useState<string[] | null>(null);
  const [lastRunSql, setLastRunSql] = useState("");

  // o painel recarrega sozinho depois de 2 h sem interação: o rascunho precisa
  // sobreviver fora do React.
  useEffect(() => {
    setSql(readDraft());
  }, []);

  useEffect(() => {
    writeDraft(sql);
  }, [sql]);

  async function execute() {
    const text = sql.trim();
    if (!text || running) return;
    setRunning(true);
    setError(null);
    setAllowedColumns(null);
    try {
      const data = await runDbConsoleQuery(text);
      setResult(data);
      setLastRunSql(text);
    } catch (err) {
      setResult(null);
      setError(describeDbConsoleError(err, t, t("errSql")));
      if (isDbConsoleApiError(err) && err.code === "ERR_DB_CONSOLE_PROTECTED") {
        const columns = err.details?.allowedColumns;
        if (Array.isArray(columns) && columns.length) setAllowedColumns(columns.map(String));
      }
      if (isDbConsoleApiError(err) && err.code === "ERR_DB_CONSOLE_SQL") {
        const position = Number(err.details?.position);
        if (Number.isFinite(position) && position > 0) {
          setError(prev => `${prev} ${t("errPosition", { position })}`);
        }
      }
    } finally {
      setRunning(false);
    }
  }

  function insertAllowedColumns() {
    if (!allowedColumns?.length) return;
    const list = allowedColumns.map(quoteIdent).join(", ");
    setSql(prev => (prev.includes("*") ? prev.replace("*", list) : `${prev} /* ${list} */`));
    setAllowedColumns(null);
  }

  const exportRequest = useMemo(
    () => ({ source: "query" as const, sql: lastRunSql }),
    [lastRunSql]
  );

  return (
    <div className="space-y-4">
      <Textarea
        value={sql}
        onChange={event => setSql(event.target.value)}
        onKeyDown={event => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void execute();
          }
        }}
        placeholder={t("queryPlaceholder")}
        spellCheck={false}
        rows={7}
        /* fonte >= 16px no mobile: abaixo disso o iOS dá zoom ao focar. */
        className="font-mono text-base leading-relaxed md:text-sm"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={execute} disabled={running || !sql.trim()}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          {t("runQuery")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("runHint")}</span>
        {result && lastRunSql && result.kind === "select" && (
          <div className="ml-auto">
            <ExportButton request={exportRequest} />
          </div>
        )}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t("readOnlyNote")}</p>
        <p>{t("explainShowNote")}</p>
        <p>{t("rowsLimitNote", { max: formatNumber(QUERY_MAX_ROWS) })}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="space-y-2">
            <span className="block break-words">{error}</span>
            {allowedColumns?.length ? (
              <Button variant="outline" size="sm" onClick={insertAllowedColumns}>
                {t("insertAllowedColumns")}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{t("countResult", { count: formatNumber(result.rowCount) })}</span>
            <span>{t("historyDuration")}: {formatNumber(result.durationMs)} ms</span>
            {result.hasMore && <span>{t("rowsLimitNote", { max: formatNumber(QUERY_MAX_ROWS) })}</span>}
          </div>
          <DataGrid
            columns={result.columns}
            rows={result.rows}
            truncatedCells={result.truncatedCells}
            enableCellViewer
          />
          {!result.rows.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("emptyResult")}</p>
          )}
        </div>
      )}
    </div>
  );
}
