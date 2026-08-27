"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  MoreVertical, Eye, RefreshCw, Search, Receipt, MessageCircle, Send,
  CircleCheck, CirclePause, CircleX, Package, ChevronLeft, ChevronRight, StickyNote
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchWooOrders, fetchWooOrderById, updateWooOrder,
  fetchWooOrderNotes, addWooOrderNote, findWooOrderTicket,
  fetchWooOrderStores,
  WooOrder, WooOrderNote, WooStoreSummary
} from "@/services/woocommercePedidosService";
import { Store } from "lucide-react";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";
import { NewConversationDialog } from "@/components/layout/header";

const ORDER_STATUSES = [
  "pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"
] as const;

function formatPrice(value: string | number | null | undefined, currency = "BRL"): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const symbol = currency === "BRL" ? "R$ " : `${currency} `;
  return `${symbol}${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function statusBadge(status: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    processing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    "on-hold": "bg-orange-500/15 text-orange-400 border-orange-500/30",
    completed: "bg-green-500/15 text-green-400 border-green-500/30",
    cancelled: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
    refunded: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    failed: "bg-red-500/15 text-red-400 border-red-500/30"
  };
  return (
    <Badge className={`text-xs border ${map[status] ?? map.pending}`}>
      {t(`status_${status}`)}
    </Badge>
  );
}

function customerName(o: WooOrder): string {
  const b = o.billing || ({} as any);
  return [b.first_name, b.last_name].filter(Boolean).join(" ") || b.email || "—";
}

export function WooCommercePedidosView({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations("woocommercePedidosPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { isLiveMode } = useLiveMode();

  const [stores, setStores] = useState<WooStoreSummary[]>([]);
  const initialStoreId = useMemo(() => {
    const raw = searchParams.get("store");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);
  const [storeId, setStoreId] = useState<number | null>(initialStoreId);

  const [orders, setOrders] = useState<WooOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("any");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<WooOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string>("");

  const [linkedTicketId, setLinkedTicketId] = useState<number | null>(null);

  const [notes, setNotes] = useState<WooOrderNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteCustomer, setNoteCustomer] = useState(false);
  const [addingNote, setAddingNote] = useState(false);

  const [messageOpen, setMessageOpen] = useState(false);
  const [messageOrder, setMessageOrder] = useState<WooOrder | null>(null);

  const openSendMessage = (o: WooOrder) => {
    setMessageOrder(o);
    setMessageOpen(true);
  };

  const load = useCallback(async () => {
    try {
      const params: any = { page, per_page: perPage };
      if (statusFilter && statusFilter !== "any") params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      if (after) params.after = `${after}T00:00:00`;
      if (before) params.before = `${before}T23:59:59`;
      if (storeId) params.storeId = storeId;
      const { data } = await fetchWooOrders(params);
      setOrders(data.data);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("errorLoad"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, perPage, statusFilter, search, after, before, storeId, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetchWooOrderStores()
      .then(({ data }) => {
        if (cancelled) return;
        setStores(data);
        if (data.length > 0 && (storeId === null || !data.some((s) => s.id === storeId))) {
          setStoreId(data[0].id);
        }
      })
      .catch(() => {
        // silencioso — sem lojas configuradas; fallback resolve no backend
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStoreChange = (next: number) => {
    setStoreId(next);
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("store", String(next));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleSearch = () => {
    setRefreshing(true);
    setPage(1);
    load();
  };

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openDetail = async (o: WooOrder) => {
    setDetailOpen(true);
    setDetail(o);
    setPendingStatus(o.status);
    setLinkedTicketId(null);
    setNotes([]);
    setNoteText("");
    setNoteCustomer(false);

    setDetailLoading(true);
    try {
      const { data: full } = await fetchWooOrderById(o.id, storeId);
      setDetail(full);
      setPendingStatus(full.status);
    } catch {
      // mantem objeto basico
    } finally {
      setDetailLoading(false);
    }

    // ticket vinculado
    try {
      const billing = o.billing || ({} as any);
      const { data } = await findWooOrderTicket(o.id, {
        email: billing.email,
        phone: billing.phone
      });
      setLinkedTicketId(data.ticketId);
    } catch {
      // silencioso
    }

    // notas
    setNotesLoading(true);
    try {
      const { data: list } = await fetchWooOrderNotes(o.id, storeId);
      setNotes(list);
    } catch {
      // silencioso
    } finally {
      setNotesLoading(false);
    }
  };

  const handleQuickStatus = async (orderId: number, newStatus: string) => {
    setSavingStatus(true);
    try {
      const { data } = await updateWooOrder(orderId, { status: newStatus }, storeId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: data.status } : o));
      if (detail?.id === orderId) setDetail({ ...detail, status: data.status });
      toast.success(t("statusUpdated"));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("errorUpdate"));
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSaveDetailStatus = async () => {
    if (!detail || pendingStatus === detail.status) return;
    await handleQuickStatus(detail.id, pendingStatus);
  };

  const handleAddNote = async () => {
    if (!detail || !noteText.trim()) return;
    setAddingNote(true);
    try {
      const { data } = await addWooOrderNote(detail.id, noteText.trim(), noteCustomer, storeId);
      setNotes(prev => [data, ...prev]);
      setNoteText("");
      setNoteCustomer(false);
      toast.success(t("noteAdded"));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("errorAddNote"));
    } finally {
      setAddingNote(false);
    }
  };

  const handleOpenChat = () => {
    if (!linkedTicketId) return;
    router.push(`/atendimento?ticketId=${linkedTicketId}`);
  };

  return (
    <div className={embedded ? "flex flex-col gap-4" : "flex flex-col gap-6 p-4 md:p-6"}>
      {!embedded && <PageHeader title={t("title")} description={t("description")} />}

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        {/* Linha 1: busca + lupa + seletor de loja */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-2 flex-1 sm:max-w-md">
            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="bg-popover border-border flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleSearch}
              disabled={refreshing}
              className="border-border shrink-0"
              aria-label={t("searchAria")}
            >
              {refreshing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {stores.length > 1 && (
            <Select
              value={storeId ? String(storeId) : ""}
              onValueChange={v => handleStoreChange(Number(v))}
            >
              <SelectTrigger className="bg-popover border-border w-full sm:w-64">
                <Store className="h-4 w-4 mr-1 text-muted-foreground" />
                <SelectValue placeholder={t("storeSelectorPlaceholder")} />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {stores.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.description || s.storeUrl.replace(/^https?:\/\//, "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Linha 2: filtros + atualizar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:flex-wrap">
          <div className="grid gap-1.5 flex-1 sm:flex-initial sm:w-44">
            <Label className="text-xs text-muted-foreground">{t("filterStatus")}</Label>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="bg-popover border-border w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="any">{t("status_any")}</SelectItem>
                {ORDER_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{t(`status_${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 flex-1 sm:flex-initial sm:w-40">
            <Label className="text-xs text-muted-foreground">{t("filterDateAfter")}</Label>
            <Input
              type="date"
              value={after}
              onChange={e => setAfter(e.target.value)}
              className="bg-popover border-border"
            />
          </div>

          <div className="grid gap-1.5 flex-1 sm:flex-initial sm:w-40">
            <Label className="text-xs text-muted-foreground">{t("filterDateBefore")}</Label>
            <Input
              type="date"
              value={before}
              onChange={e => setBefore(e.target.value)}
              className="bg-popover border-border"
            />
          </div>

          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="border-border gap-2 sm:ml-auto"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground w-20">{t("colNumber")}</TableHead>
              <TableHead className="text-muted-foreground">{t("colCustomer")}</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">{t("colDate")}</TableHead>
              <TableHead className="text-muted-foreground">{t("colStatus")}</TableHead>
              <TableHead className="text-muted-foreground hidden sm:table-cell">{t("colItems")}</TableHead>
              <TableHead className="text-muted-foreground">{t("colTotal")}</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">{t("colPayment")}</TableHead>
              <TableHead className="text-muted-foreground w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : orders.length === 0 ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={8}>
                  <EmptyState
                    icon={Receipt}
                    title={t("emptyTitle")}
                    description={t("emptyDescription")}
                  />
                </TableCell>
              </TableRow>
            ) : orders.map(o => (
              <TableRow key={o.id} className="border-border hover:bg-muted/40">
                <TableCell className="font-mono text-foreground">#{o.number || o.id}</TableCell>
                <TableCell>
                  <div className={cn("font-medium text-foreground truncate max-w-[180px]", isLiveMode && "live-blur-text")}>
                    {customerName(o)}
                  </div>
                  {o.billing?.email && (
                    <div className={cn("text-xs text-muted-foreground truncate max-w-[180px]", isLiveMode && "live-blur-text")}>
                      {o.billing.email}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                  {formatDate(o.date_created)}
                </TableCell>
                <TableCell>{statusBadge(o.status, t)}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {o.line_items?.length ?? 0}
                </TableCell>
                <TableCell className="text-foreground text-sm font-medium">
                  {formatPrice(o.total, o.currency)}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                  {o.payment_method_title || "—"}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover border-border">
                      <DropdownMenuItem
                        onClick={() => openDetail(o)}
                        className="gap-2 cursor-pointer hover:bg-muted"
                      >
                        <Eye className="h-4 w-4" /> {t("actionView")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openSendMessage(o)}
                        disabled={!o.billing?.phone && !o.billing?.email}
                        className="gap-2 cursor-pointer hover:bg-muted"
                      >
                        <Send className="h-4 w-4" /> {t("actionSendMessage")}
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="gap-2 cursor-pointer hover:bg-muted">
                          <CircleCheck className="h-4 w-4" /> {t("actionChangeStatus")}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="bg-popover border-border">
                          {ORDER_STATUSES.map(s => (
                            <DropdownMenuItem
                              key={s}
                              disabled={savingStatus || s === o.status}
                              onClick={() => handleQuickStatus(o.id, s)}
                              className="gap-2 cursor-pointer hover:bg-muted"
                            >
                              {t(`status_${s}`)}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {!loading && orders.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {t("pagination")} {page} {t("paginationOf")} {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || refreshing}
              onClick={() => { setPage(p => Math.max(1, p - 1)); setRefreshing(true); }}
              className="border-border gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> {t("paginationPrev")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || refreshing}
              onClick={() => { setPage(p => p + 1); setRefreshing(true); }}
              className="border-border gap-1"
            >
              {t("paginationNext")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detalhe */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="bg-popover border-border w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-3 flex-wrap">
              <Receipt className="h-5 w-5" />
              {t("detailTitle")} #{detail?.number || detail?.id}
              {detail && statusBadge(detail.status, t)}
              {detail && (
                <span className="text-xs text-muted-foreground font-normal">
                  {formatDate(detail.date_created)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailLoading || !detail ? (
            <div className="grid gap-3 py-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="grid gap-5 py-2">
              {/* Itens */}
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Package className="h-4 w-4" /> {t("tabItems")}
                </h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">{t("itemsHeader")}</TableHead>
                        <TableHead className="text-muted-foreground w-16 text-center">{t("itemQty")}</TableHead>
                        <TableHead className="text-muted-foreground w-28 text-right">{t("itemTotal")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.line_items.map(li => (
                        <TableRow key={li.id} className="border-border">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {li.image?.src && (
                                <img
                                  src={li.image.src}
                                  alt={li.name}
                                  className="h-8 w-8 rounded object-cover border border-border"
                                />
                              )}
                              <div>
                                <div className="text-sm text-foreground">{li.name}</div>
                                {li.sku && (
                                  <div className="text-xs text-muted-foreground font-mono">{li.sku}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-foreground text-sm">{li.quantity}</TableCell>
                          <TableCell className="text-right text-foreground text-sm">
                            {formatPrice(li.total, detail.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>

              {/* Cliente + Pagamento */}
              <div className="grid gap-4 sm:grid-cols-2">
                <section className="grid gap-2 p-3 rounded-lg border border-border bg-muted/30">
                  <h3 className="text-sm font-semibold text-foreground">{t("tabCustomer")}</h3>
                  <div className={cn("text-sm text-foreground", isLiveMode && "live-blur-text")}>{customerName(detail)}</div>
                  {detail.billing?.email && (
                    <div className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>📧 {detail.billing.email}</div>
                  )}
                  {detail.billing?.phone && (
                    <div className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>📱 {detail.billing.phone}</div>
                  )}
                  {linkedTicketId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleOpenChat}
                      className="border-border gap-2 w-fit mt-1"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {t("openChat")}
                    </Button>
                  )}
                </section>

                <section className="grid gap-1 p-3 rounded-lg border border-border bg-muted/30">
                  <h3 className="text-sm font-semibold text-foreground">{t("tabPayment")}</h3>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("paymentMethod")}</span>
                    <span>{detail.payment_method_title || "—"}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("paymentShipping")}</span>
                    <span>{formatPrice(detail.shipping_total, detail.currency)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("paymentTax")}</span>
                    <span>{formatPrice(detail.total_tax, detail.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-foreground font-medium pt-1 border-t border-border mt-1">
                    <span>{t("paymentTotal")}</span>
                    <span>{formatPrice(detail.total, detail.currency)}</span>
                  </div>
                </section>
              </div>

              {/* Endereços */}
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="p-3 rounded-lg border border-border bg-muted/30">
                  <h3 className="text-sm font-semibold text-foreground mb-1">{t("billingAddress")}</h3>
                  <AddressBlock addr={detail.billing} />
                </div>
                <div className="p-3 rounded-lg border border-border bg-muted/30">
                  <h3 className="text-sm font-semibold text-foreground mb-1">{t("shippingAddress")}</h3>
                  <AddressBlock addr={detail.shipping} />
                </div>
              </section>

              {/* Notas */}
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <StickyNote className="h-4 w-4" /> {t("tabNotes")}
                </h3>

                <div className="grid gap-2">
                  <Textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder={t("notePlaceholder")}
                    className="bg-muted border-border resize-none"
                    rows={2}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={noteCustomer}
                        onCheckedChange={v => setNoteCustomer(!!v)}
                      />
                      {t("noteCustomerCheckbox")}
                    </label>
                    <Button
                      size="sm"
                      onClick={handleAddNote}
                      disabled={addingNote || !noteText.trim()}
                    >
                      {addingNote ? t("noteAdding") : t("noteAdd")}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {notesLoading ? (
                    <Skeleton className="h-12 w-full" />
                  ) : notes.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">{t("notesEmpty")}</div>
                  ) : notes.map(n => (
                    <div
                      key={n.id}
                      className={`p-2 rounded-md border text-xs ${
                        n.customer_note
                          ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                          : "bg-muted/40 border-border text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium">{n.author || "—"}</span>
                        <span className="opacity-70">{formatDate(n.date_created)}</span>
                      </div>
                      <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: n.note }} />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          <DialogFooter className="gap-2 flex-col sm:flex-row sm:items-center sm:justify-between border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground shrink-0">{t("actionChangeStatus")}</Label>
              <Select value={pendingStatus} onValueChange={setPendingStatus} disabled={!detail || savingStatus}>
                <SelectTrigger className="bg-muted border-border w-full sm:w-44 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {ORDER_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{t(`status_${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleSaveDetailStatus}
                disabled={!detail || savingStatus || pendingStatus === detail?.status}
                className="w-full sm:w-auto shrink-0"
              >
                {savingStatus ? t("statusUpdating") : t("save")}
              </Button>
            </div>
            <Button variant="outline" onClick={() => setDetailOpen(false)} className="border-border w-full sm:w-auto shrink-0">
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewConversationDialog
        open={messageOpen}
        onOpenChange={(o) => { setMessageOpen(o); if (!o) setMessageOrder(null); }}
        prefilledNumber={messageOrder?.billing?.phone || undefined}
        prefilledContactName={messageOrder ? customerName(messageOrder) : undefined}
        prefilledContactEmail={messageOrder?.billing?.email || undefined}
      />
    </div>
  );
}


function AddressBlock({ addr }: { addr: any }) {
  const { isLiveMode } = useLiveMode();
  if (!addr || (!addr.address_1 && !addr.city)) {
    return <div className="text-xs text-muted-foreground italic">—</div>;
  }
  const fullName = [addr.first_name, addr.last_name].filter(Boolean).join(" ");
  return (
    <div className="text-xs text-muted-foreground space-y-0.5">
      {fullName && <div className={cn("text-foreground", isLiveMode && "live-blur-text")}>{fullName}</div>}
      {addr.address_1 && <div className={cn(isLiveMode && "live-blur-text")}>{addr.address_1}</div>}
      {addr.address_2 && <div className={cn(isLiveMode && "live-blur-text")}>{addr.address_2}</div>}
      {(addr.city || addr.state) && <div className={cn(isLiveMode && "live-blur-text")}>{[addr.city, addr.state].filter(Boolean).join(" / ")}</div>}
      {addr.postcode && <div className={cn(isLiveMode && "live-blur-text")}>{addr.postcode}</div>}
      {addr.country && <div>{addr.country}</div>}
    </div>
  );
}
