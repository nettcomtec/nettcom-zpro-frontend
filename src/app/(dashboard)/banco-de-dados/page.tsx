"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, DatabaseZap, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import type { PageHelpProps } from "@/components/layout/page-help";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/format";
import {
  browseDbConsole,
  clearDbConsoleToken,
  countDbConsole,
  fetchDbConsoleTableInfo,
  fetchDbConsoleTables,
  getDbConsoleStatus,
  hasDbConsoleToken,
  isDbConsoleApiError,
  setDbConsoleLockedHandler,
} from "@/services/db-console";
import type {
  DbConsoleBrowseFilter,
  DbConsoleBrowseResponse,
  DbConsoleBrowseSort,
  DbConsoleStatus,
  DbConsoleTableInfo,
  DbConsoleTableSummary,
} from "@/types/db-console";
import { DataGrid } from "@/components/banco-de-dados/data-grid";
import { ExportButton } from "@/components/banco-de-dados/export-button";
import { FilterBar } from "@/components/banco-de-dados/filter-bar";
import { HistoryTab } from "@/components/banco-de-dados/history-tab";
import { QueryEditor } from "@/components/banco-de-dados/query-editor";
import { RowEditDialog } from "@/components/banco-de-dados/row-edit-dialog";
import { TableBrowser } from "@/components/banco-de-dados/table-browser";
import { UnlockDialog, type UnlockNotice } from "@/components/banco-de-dados/unlock-dialog";
import { GRID_PAGE_SIZES, describeDbConsoleError } from "@/components/banco-de-dados/helpers";

const REASON_KEY: Record<string, string> = {
  unsupported: "reasonUnsupported",
  disabled: "reasonDisabled",
  migration_pending: "reasonMigrationPending",
  no_role_privilege: "reasonNoRolePrivilege",
  auth_failed_maybe_pooler: "reasonAuthFailedPooler",
  connect_failed: "reasonConnectFailed",
  // sessão anterior à marca de chave mestra: o backend recusa já no status.
  relogin: "relogin",
};

export default function BancoDeDadosPage() {
  const t = useTranslations("bancoDadosPage");
  const tErrors = useTranslations("errors");
  const router = useRouter();

  const pageHelp: PageHelpProps = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")] },
    ],
  };

  const [status, setStatus] = useState<DbConsoleStatus | null>(null);
  const [probing, setProbing] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [notice, setNotice] = useState<UnlockNotice>(null);

  const [tables, setTables] = useState<DbConsoleTableSummary[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [info, setInfo] = useState<DbConsoleTableInfo | null>(null);
  const [filters, setFilters] = useState<DbConsoleBrowseFilter[]>([]);
  const [sort, setSort] = useState<DbConsoleBrowseSort | null>(null);
  const [pageSize, setPageSize] = useState<number>(GRID_PAGE_SIZES[0]);
  const [offset, setOffset] = useState(0);
  const [cursors, setCursors] = useState<(Record<string, string> | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [result, setResult] = useState<DbConsoleBrowseResponse | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const [exactCount, setExactCount] = useState<number | null>(null);
  const [editing, setEditing] = useState<Record<string, string> | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 423 em qualquer chamada volta para o pedido de senha sem perder o estado das abas.
  useEffect(() => {
    setDbConsoleLockedHandler(() => {
      if (!mounted.current) return;
      setUnlocked(false);
      setNotice("expired");
    });
    return () => {
      setDbConsoleLockedHandler(null);
      clearDbConsoleToken();
    };
  }, []);

  const probe = useCallback(async () => {
    setProbing(true);
    try {
      const data = await getDbConsoleStatus();
      setStatus(data);
      if (!data.available) {
        setUnlocked(false);
        clearDbConsoleToken();
      } else if (hasDbConsoleToken()) {
        setUnlocked(true);
      }
    } catch (err) {
      const code = isDbConsoleApiError(err) ? err.code : "";
      setStatus({
        enabled: true,
        available: false,
        reason: code === "ERR_DB_CONSOLE_RELOGIN" ? "relogin" : "connect_failed",
        viaMasterKey: false,
      } as DbConsoleStatus);
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      setTables(await fetchDbConsoleTables());
    } catch (err) {
      setGridError(describeDbConsoleError(err, t, tErrors("loadFailed")));
    } finally {
      setTablesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (unlocked) void loadTables();
  }, [unlocked, loadTables]);

  const runBrowse = useCallback(
    async (targetInfo: DbConsoleTableInfo, opts: { offset?: number; after?: Record<string, string> | null }) => {
      setGridLoading(true);
      setGridError(null);
      try {
        const data = await browseDbConsole({
          table: targetInfo.name,
          filters,
          sort,
          pageSize,
          ...(targetInfo.isLarge ? { after: opts.after ?? null } : { offset: opts.offset ?? 0 }),
        });
        setResult(data);
      } catch (err) {
        setResult(null);
        setGridError(describeDbConsoleError(err, t, tErrors("loadFailed")));
      } finally {
        setGridLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, sort, pageSize]
  );

  async function selectTable(name: string) {
    setSelected(name);
    setInfo(null);
    setResult(null);
    setFilters([]);
    setSort(null);
    setOffset(0);
    setPageIndex(0);
    setCursors([null]);
    setExactCount(null);
    setGridError(null);
    setGridLoading(true);
    try {
      const data = await fetchDbConsoleTableInfo(name);
      setInfo(data);
      await runBrowse(data, { offset: 0, after: null });
    } catch (err) {
      setGridError(describeDbConsoleError(err, t, tErrors("loadFailed")));
      setGridLoading(false);
    }
  }

  function applyFilters() {
    if (!info) return;
    setOffset(0);
    setPageIndex(0);
    setCursors([null]);
    setExactCount(null);
    void runBrowse(info, { offset: 0, after: null });
  }

  function changeSort(next: DbConsoleBrowseSort) {
    if (!info) return;
    setSort(next);
    setOffset(0);
    setPageIndex(0);
    setCursors([null]);
  }

  useEffect(() => {
    if (info) void runBrowse(info, { offset: 0, after: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, pageSize]);

  function goNext() {
    if (!info || !result?.hasMore) return;
    if (info.isLarge) {
      const next = result.nextAfter ?? null;
      setCursors(prev => [...prev.slice(0, pageIndex + 1), next]);
      setPageIndex(i => i + 1);
      void runBrowse(info, { after: next });
    } else {
      const next = result.nextOffset ?? offset + pageSize;
      setOffset(next);
      setPageIndex(i => i + 1);
      void runBrowse(info, { offset: next });
    }
  }

  function goPrev() {
    if (!info || pageIndex <= 0) return;
    const target = pageIndex - 1;
    setPageIndex(target);
    if (info.isLarge) {
      void runBrowse(info, { after: cursors[target] ?? null });
    } else {
      const next = Math.max(0, offset - pageSize);
      setOffset(next);
      void runBrowse(info, { offset: next });
    }
  }

  async function countExact() {
    if (!info) return;
    try {
      setExactCount(await countDbConsole({ table: info.name, filters }));
    } catch (err) {
      setGridError(describeDbConsoleError(err, t, tErrors("loadFailed")));
    }
  }

  const clickableRows = useMemo(() => {
    if (!result || !info?.identity?.length) return undefined;
    return result.identities.map(identity => !!identity && Object.keys(identity).length > 0);
  }, [result, info]);

  const exportRequest = useMemo(
    () => ({ source: "browse" as const, table: selected || "", filters, sort }),
    [selected, filters, sort]
  );

  /* ------------------------------------------------------------------ telas */

  if (probing) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("unavailableTitle")}</span>
        </div>
      </div>
    );
  }

  if (!status?.available) {
    const key = REASON_KEY[status?.reason || "connect_failed"] || "reasonConnectFailed";
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <Card>
          <CardContent className="space-y-4 py-8 text-center">
            <DatabaseZap className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{t("unavailableTitle")}</p>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground">{t(key)}</p>
            <Button variant="outline" size="sm" onClick={probe}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("retry")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} help={pageHelp} />

      <UnlockDialog
        open={!unlocked}
        onOpenChange={open => {
          // sem saída o botão Cancelar ficaria inerte (o modal não fecha por fora nem por Esc).
          if (!open) router.back();
        }}
        viaMasterKey={status.viaMasterKey}
        notice={notice}
        onUnlocked={() => {
          setNotice(null);
          setUnlocked(true);
        }}
        onUnavailable={reason =>
          setStatus(prev => ({
            enabled: reason !== "disabled",
            available: false,
            reason: reason as DbConsoleStatus["reason"],
            viaMasterKey: prev?.viaMasterKey ?? false,
          }))
        }
      />

      {unlocked && (
        <Tabs defaultValue="tables" className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("validityNote")}</p>
          <TabsList>
            <TabsTrigger value="tables">{t("tabTables")}</TabsTrigger>
            <TabsTrigger value="query">{t("tabQuery")}</TabsTrigger>
            <TabsTrigger value="history">{t("tabHistory")}</TabsTrigger>
          </TabsList>

          <TabsContent value="tables" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <TableBrowser
                tables={tables}
                loading={tablesLoading}
                selected={selected}
                onSelect={selectTable}
              />

              <div className="space-y-4">
                {info ? (
                  <>
                    <FilterBar
                      info={info}
                      filters={filters}
                      onFiltersChange={setFilters}
                      pageSize={pageSize}
                      onPageSizeChange={setPageSize}
                      onApply={applyFilters}
                      disabled={gridLoading}
                    />

                    {result?.warnings?.includes("contains_slow") && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{t("containsSlowWarning")}</AlertDescription>
                      </Alert>
                    )}
                    {result?.warnings?.includes("sort_restricted") && (
                      <p className="text-xs text-muted-foreground">{t("sortRestrictedNote")}</p>
                    )}
                    {result?.warnings?.includes("kv_value_unavailable") && (
                      <p className="text-xs text-muted-foreground">{t("kvValueUnavailable")}</p>
                    )}
                    {gridError && <p className="text-sm text-destructive">{gridError}</p>}

                    <Card>
                      <CardContent className="p-0">
                        <DataGrid
                          columns={result?.columns || []}
                          rows={result?.rows || []}
                          truncatedCells={result?.truncatedCells}
                          maskedCells={result?.maskedCells}
                          protectedColumns={result?.protectedColumns}
                          loading={gridLoading}
                          sort={sort}
                          sortableColumns={info.sortableColumns}
                          onSortChange={changeSort}
                          clickableRows={clickableRows}
                          onRowClick={index => setEditing(result?.identities?.[index] || null)}
                        />
                      </CardContent>
                    </Card>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={goPrev} disabled={pageIndex <= 0 || gridLoading}>
                        {t("prev")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goNext}
                        /* teto de OFFSET: com hasMore e nextOffset nulo, a próxima página
                           seria recusada pelo servidor — o botão precisa travar antes. */
                        disabled={
                          !result?.hasMore ||
                          gridLoading ||
                          (!info.isLarge && result?.nextOffset === null) ||
                          (info.isLarge && result?.nextAfter === null)
                        }
                      >
                        {t("next")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={countExact} disabled={gridLoading}>
                        {t("countExact")}
                      </Button>
                      {exactCount !== null && (
                        <span className="text-xs text-muted-foreground">
                          {t("countResult", { count: formatNumber(exactCount) })}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {t("exportLimitNote", { max: formatNumber(50000) })}
                        </span>
                        <ExportButton request={exportRequest} disabled={gridLoading} />
                      </div>
                    </div>

                    {!gridLoading && !result?.rows.length && (
                      <p className="py-8 text-center text-sm text-muted-foreground">{t("emptyResult")}</p>
                    )}
                  </>
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">{t("searchTable")}</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="query">
            <QueryEditor />
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab />
          </TabsContent>
        </Tabs>
      )}

      {info && (
        <RowEditDialog
          open={!!editing}
          onOpenChange={open => !open && setEditing(null)}
          info={info}
          identity={editing}
          onSaved={() => {
            setEditing(null);
            if (info) void runBrowse(info, { offset, after: cursors[pageIndex] ?? null });
          }}
        />
      )}
    </div>
  );
}
