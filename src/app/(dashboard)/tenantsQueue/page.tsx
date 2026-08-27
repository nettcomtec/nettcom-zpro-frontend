"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useSortable } from "@/hooks/use-sortable";
import { RefreshCw, RotateCcw, ListOrdered, Play, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { fetchQueues, restartQueue, reprocessQueue } from "@/services/superadmin";

interface Queue {
  name?: string;
  queueName?: string;
  failed?: number;
  active?: number;
  waiting?: number;
}

export default function TenantsQueuePage() {
  const t = useTranslations("tenantsQueuePage");
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const { data } = await fetchQueues();
      setQueues(Array.isArray(data) ? data : data?.queues || []);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }

  const { sortKey, sortDir, handleSort, sortedData: sortedQueues } = useSortable(queues, "name");

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 10000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function handleRestart() {
    if (!confirm("Reiniciar todas as filas?")) return;
    setRestarting(true);
    try { await restartQueue(); toast.success("Filas reiniciadas"); load(); }
    catch { toast.error("Erro ao reiniciar"); }
    finally { setRestarting(false); }
  }

  async function handleReprocess(name: string) {
    try { await reprocessQueue(name); toast.success(`Fila "${name}" reprocessada`); load(); }
    catch { toast.error("Erro ao reprocessar"); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }}>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
          <Button variant="outline" size="sm" onClick={() => window.open("/bull-board", "_blank")}>
            <ExternalLink className="mr-2 h-4 w-4" />Bull Board
          </Button>
          <Button variant="destructive" size="sm" disabled={restarting} onClick={handleRestart}>
            <RotateCcw className="mr-2 h-4 w-4" />{restarting ? "Reiniciando..." : "Reiniciar"}
          </Button>
        </div>
      </PageHeader>

      {loading ? <Skeleton className="h-64 w-full" /> : queues.length === 0 ? (
        <EmptyState icon={ListOrdered} title="Nenhuma fila" description="Nenhuma fila Bull encontrada" />
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Nome da Fila</SortableTableHead>
              <SortableTableHead sortKey="failed" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Falhas</SortableTableHead>
              <SortableTableHead sortKey="active" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Ativas</SortableTableHead>
              <SortableTableHead sortKey="waiting" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Aguardando</SortableTableHead>
              <TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {sortedQueues.map((q, i) => {
                const name = q.name || q.queueName || `fila-${i}`;
                return (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell><Badge variant={(q.failed ?? 0) > 0 ? "destructive" : "secondary"}>{q.failed ?? 0}</Badge></TableCell>
                    <TableCell><Badge variant={(q.active ?? 0) > 0 ? "success" : "secondary"}>{q.active ?? 0}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{q.waiting ?? 0}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleReprocess(name)}>
                        <Play className="mr-1 h-3 w-3" />Reprocessar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}
