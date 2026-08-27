"use client";

import { formatDate } from "@/lib/format";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useSortable } from "@/hooks/use-sortable";
import { CreditCard, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { fetchTenantsAllPaymentsV2 } from "@/services/superadmin";

interface Payment {
  id: string;
  status: string;
  dueDate?: string;
  value?: number;
  paymentUrl?: string;
  gateway: string;
}

interface TenantGroup {
  tenantId: number;
  tenantName: string;
  gateway: string;
  payments: Payment[];
}

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  paid: "success", received: "success", confirmed: "success", active: "success",
  overdue: "destructive", cancelled: "secondary", refunded: "secondary",
  pending: "warning", authorized: "warning",
};

const GATEWAY_LABEL: Record<string, string> = {
  asaas: "Asaas",
  stripe: "Stripe",
  pagarme: "Pagar.me",
  mercadopago: "Mercado Pago",
};

const GATEWAY_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  asaas: "default",
  stripe: "secondary",
  pagarme: "outline",
  mercadopago: "secondary",
};

function PaymentsTable({ payments, tenantId, t, fmt, fmtVal }: { payments: Payment[]; tenantId: number; t: ReturnType<typeof useTranslations>; fmt: (d?: string) => string; fmtVal: (v?: number) => string }) {
  const { sortKey, sortDir, handleSort, sortedData } = useSortable(payments, "dueDate");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>ID</SortableTableHead>
          <SortableTableHead sortKey="status" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colStatus")}</SortableTableHead>
          <SortableTableHead sortKey="dueDate" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDueDate")}</SortableTableHead>
          <SortableTableHead sortKey="value" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colValue")}</SortableTableHead>
          <TableHead>{t("colLink")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedData.map((p, idx) => (
          <TableRow key={p.id ?? `${tenantId}-${idx}`}>
            <TableCell className="font-mono text-xs">{p.id}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[p.status?.toLowerCase()] ?? "secondary"}>{p.status}</Badge>
            </TableCell>
            <TableCell>{fmt(p.dueDate)}</TableCell>
            <TableCell>{fmtVal(p.value)}</TableCell>
            <TableCell>
              {p.paymentUrl ? (
                <a href={p.paymentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline text-sm">
                  Link <ExternalLink className="h-3 w-3" />
                </a>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function PagamentosTenantsPage() {
  const t = useTranslations("pagamentosTenantsPage");
  const [groups, setGroups] = useState<TenantGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetchTenantsAllPaymentsV2()
      .then(({ data }) => {
        const raw: TenantGroup[] = Array.isArray(data) ? data : data?.data || [];
        setGroups(raw);
      })
      .catch(() => toast.error(t("errorLoading")))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (tid: number) => setExpanded((p) => ({ ...p, [tid]: !p[tid] }));
  const fmt = (d?: string) => d ? formatDate(new Date(d)) : "—";
  const fmtVal = (v?: number) => v != null ? `R$ ${v.toFixed(2)}` : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      />

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : groups.length === 0 ? (
        <EmptyState icon={CreditCard} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.tenantId}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    <span>{g.tenantName || `Tenant ${g.tenantId}`}</span>
                    <span className="text-sm font-normal text-muted-foreground">#{g.tenantId}</span>
                    <Badge variant={GATEWAY_VARIANT[g.gateway] ?? "secondary"}>
                      {GATEWAY_LABEL[g.gateway] ?? g.gateway}
                    </Badge>
                    <Badge variant="secondary">{g.payments.length} {t("payments")}</Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => toggle(g.tenantId)}>
                    {expanded[g.tenantId] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
              {expanded[g.tenantId] && (
                <CardContent className="p-0 overflow-x-auto">
                  <PaymentsTable payments={g.payments} tenantId={g.tenantId} t={t} fmt={fmt} fmtVal={fmtVal} />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
