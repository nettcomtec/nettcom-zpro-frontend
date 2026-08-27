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
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  MoreVertical, Eye, RefreshCw, Search, Receipt, MessageCircle, Send,
  CircleCheck, CirclePlay, CircleX, Package, ChevronLeft, ChevronRight, StickyNote, Store
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchNuvemshopOrders, fetchNuvemshopOrderById, updateNuvemshopOrder,
  fetchNuvemshopOrderNotes, setNuvemshopOwnerNote, findNuvemshopOrderTicket,
  fetchNuvemshopOrderStores,
  NuvemshopOrder, NuvemshopStoreSummary
} from "@/services/nuvemshopPedidosService";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";
import { NewConversationDialog } from "@/components/layout/header";

// Status (open/closed/cancelled) — filtravel
const STATUS_VALUES = ["open", "closed", "cancelled"] as const;
const PAYMENT_VALUES = ["pending", "authorized", "paid", "voided", "refunded", "abandoned"] as const;

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  closed: "bg-green-500/15 text-green-400 border-green-500/30",
  cancelled: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30"
};
const PAYMENT_COLORS: Record<string, string> = {
  paid: "bg-green-500/15 text-green-400 border-green-500/30",
  authorized: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  refunded: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  voided: "bg-red-500/15 text-red-400 border-red-500/30",
  abandoned: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30"
};
const SHIPPING_COLORS: Record<string, string> = {
  fulfilled: "bg-green-500/15 text-green-400 border-green-500/30",
  shipped: "bg-green-500/15 text-green-400 border-green-500/30",
  delivered: "bg-green-500/15 text-green-400 border-green-500/30",
  unfulfilled: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  unpacked: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  unshipped: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
};

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
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function customerName(o: NuvemshopOrder): string {
  return (
    o.customer?.name ||
    o.contact_name ||
    o.shipping_address?.name ||
    o.contact_email ||
    "—"
  );
}

function orderPhone(o: NuvemshopOrder): string | undefined {
  return o.contact_phone || o.customer?.phone || o.shipping_address?.phone || undefined;
}
function orderEmail(o: NuvemshopOrder): string | undefined {
  return o.contact_email || o.customer?.email || undefined;
}

export function NuvemshopPedidosView({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations("nuvemshopPedidosPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { isLiveMode } = useLiveMode();

  // label de enum via i18n com fallback p/ valor cru (chaves adicionadas na F6)
  const lbl = (ns: string, v: string) => {
    const key = `${ns}.${v}`;
    return (t as any).has?.(key) ? t(key) : v;
  };

  const [stores, setStores] = useState<NuvemshopStoreSummary[]>([]);
  const initialStoreId = useMemo(() => {
    const raw = searchParams.get("store");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);
  const [storeId, setStoreId] = useState<number | null>(initialStoreId);

  const [orders, setOrders] = useState<NuvemshopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("any");
  const [paymentFilter, setPaymentFilter] = useState<string>("any");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<NuvemshopOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingAction, setSavingAction] = useState(false);

  const [linkedTicketId, setLinkedTicketId] = useState<number | null>(null);

  const [ownerNoteText, setOwnerNoteText] = useState("");
  const [buyerNote, setBuyerNote] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const [messageOpen, setMessageOpen] = useState(false);
  const [messageOrder, setMessageOrder] = useState<NuvemshopOrder | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const openSendMessage = (o: NuvemshopOrder) => {
    setMessageOrder(o);
    setMessageOpen(true);
  };

  const load = useCallback(async () => {
    try {
      const params: any = { page, per_page: perPage };
      if (statusFilter && statusFilter !== "any") params.status = statusFilter;
      if (paymentFilter && paymentFilter !== "any") params.payment_status = paymentFilter;
      if (search.trim()) params.q = search.trim();
      if (after) params.created_at_min = `${after}T00:00:00`;
      if (before) params.created_at_max = `${before}T23:59:59`;
      if (storeId) params.storeId = storeId;
      const { data } = await fetchNuvemshopOrders(params);
      setOrders(data.data);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("errorLoad"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, perPage, statusFilter, paymentFilter, search, after, before, storeId, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetchNuvemshopOrderStores()
      .then(({ data }) => {
        if (cancelled) return;
        setStores(data);
        if (data.length > 0 && (storeId === null || !data.some((s) => s.id === storeId))) {
          setStoreId(data[0].id);
        }
      })
      .catch(() => { /* sem lojas — fallback no backend */ });
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

  const handleSearch = () => { setRefreshing(true); setPage(1); load(); };
  const handleRefresh = () => { setRefreshing(true); load(); };

  const openDetail = async (o: NuvemshopOrder) => {
    setDetailOpen(true);
    setDetail(o);
    setLinkedTicketId(null);
    setOwnerNoteText("");
    setBuyerNote("");

    setDetailLoading(true);
    try {
      const { data: full } = await fetchNuvemshopOrderById(o.id, storeId);
      setDetail(full);
    } catch { /* mantem basico */ } finally {
      setDetailLoading(false);
    }

    try {
      const { data } = await findNuvemshopOrderTicket(o.id, { email: orderEmail(o), phone: orderPhone(o) });
      setLinkedTicketId(data.ticketId);
    } catch { /* silencioso */ }

    setNotesLoading(true);
    try {
      const { data } = await fetchNuvemshopOrderNotes(o.id, storeId);
      setOwnerNoteText(data.owner_note || "");
      setBuyerNote(data.note || "");
    } catch { /* silencioso */ } finally {
      setNotesLoading(false);
    }
  };

  const applyAction = async (orderId: number, action: "close" | "open" | "cancel", reason?: string) => {
    setSavingAction(true);
    try {
      const { data } = await updateNuvemshopOrder(orderId, { action, reason }, storeId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: data.status } : o));
      if (detail?.id === orderId) setDetail(prev => prev ? { ...prev, status: data.status } : prev);
      toast.success(t("statusUpdated"));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("errorUpdate"));
    } finally {
      setSavingAction(false);
    }
  };

  const openCancel = (orderId: number) => {
    setCancelOrderId(orderId);
    setCancelReason("");
    setCancelOpen(true);
  };
  const confirmCancel = async () => {
    if (cancelOrderId == null) return;
    await applyAction(cancelOrderId, "cancel", cancelReason.trim() || undefined);
    setCancelOpen(false);
    setCancelOrderId(null);
  };

  const handleSaveOwnerNote = async () => {
    if (!detail) return;
    setSavingNote(true);
    try {
      await setNuvemshopOwnerNote(detail.id, ownerNoteText, storeId);
      toast.success(t("ownerNoteSaved"));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("errorOwnerNote"));
    } finally {
      setSavingNote(false);
    }
  };

  const handleOpenChat = () => {
    if (!linkedTicketId) return;
    router.push(`/atendimento?ticketId=${linkedTicketId}`);
  };

  const ActionItems = ({ o }: { o: NuvemshopOrder }) => (
    <>
      {o.status !== "closed" && o.status !== "cancelled" && (
        <DropdownMenuItem disabled={savingAction} onClick={() => applyAction(o.id, "close")} className="gap-2 cursor-pointer hover:bg-muted">
          <CircleCheck className="h-4 w-4" /> {t("actionClose")}
        </DropdownMenuItem>
      )}
      {o.status === "closed" && (
        <DropdownMenuItem disabled={savingAction} onClick={() => applyAction(o.id, "open")} className="gap-2 cursor-pointer hover:bg-muted">
          <CirclePlay className="h-4 w-4" /> {t("actionOpen")}
        </DropdownMenuItem>
      )}
      {o.status !== "cancelled" && (
        <DropdownMenuItem disabled={savingAction} onClick={() => openCancel(o.id)} className="gap-2 cursor-pointer hover:bg-muted text-red-400">
          <CircleX className="h-4 w-4" /> {t("actionCancel")}
        </DropdownMenuItem>
      )}
    </>
  );

  return (
    <div className={embedded ? "flex flex-col gap-4" : "flex flex-col gap-6 p-4 md:p-6"}>
      {!embedded && <PageHeader title={t("title")} description={t("description")} />}

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-2 flex-1 sm:max-w-md">
            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="bg-popover border-border flex-1"
            />
            <Button variant="outline" size="icon" onClick={handleSearch} disabled={refreshing} className="border-border shrink-0" aria-label={t("searchAria")}>
              {refreshing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {stores.length > 1 && (
            <Select value={storeId ? String(storeId) : ""} onValueChange={v => handleStoreChange(Number(v))}>
              <SelectTrigger className="bg-popover border-border w-full sm:w-64">
                <Store className="h-4 w-4 mr-1 text-muted-foreground" />
                <SelectValue placeholder={t("storeSelectorPlaceholder")} />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {stores.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.description || (s.storeUrl ? s.storeUrl.replace(/^https?:\/\//, "") : `#${s.id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:flex-wrap">
          <div className="grid gap-1.5 flex-1 sm:flex-initial sm:w-40">
            <Label className="text-xs text-muted-foreground">{t("filterStatus")}</Label>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="bg-popover border-border w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="any">{t("status_any")}</SelectItem>
                {STATUS_VALUES.map(s => <SelectItem key={s} value={s}>{lbl("statusVal", s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 flex-1 sm:flex-initial sm:w-40">
            <Label className="text-xs text-muted-foreground">{t("filterPaymentStatus")}</Label>
            <Select value={paymentFilter} onValueChange={v => { setPaymentFilter(v); setPage(1); }}>
              <SelectTrigger className="bg-popover border-border w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="any">{t("status_any")}</SelectItem>
                {PAYMENT_VALUES.map(s => <SelectItem key={s} value={s}>{lbl("paymentVal", s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 flex-1 sm:flex-initial sm:w-40">
            <Label className="text-xs text-muted-foreground">{t("filterDateAfter")}</Label>
            <Input type="date" value={after} onChange={e => setAfter(e.target.value)} className="bg-popover border-border" />
          </div>
          <div className="grid gap-1.5 flex-1 sm:flex-initial sm:w-40">
            <Label className="text-xs text-muted-foreground">{t("filterDateBefore")}</Label>
            <Input type="date" value={before} onChange={e => setBefore(e.target.value)} className="bg-popover border-border" />
          </div>

          <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="border-border gap-2 sm:ml-auto">
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
              <TableHead className="text-muted-foreground hidden lg:table-cell">{t("colPayment")}</TableHead>
              <TableHead className="text-muted-foreground hidden sm:table-cell">{t("colItems")}</TableHead>
              <TableHead className="text-muted-foreground">{t("colTotal")}</TableHead>
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
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : orders.length === 0 ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={8}>
                  <EmptyState icon={Receipt} title={t("emptyTitle")} description={t("emptyDescription")} />
                </TableCell>
              </TableRow>
            ) : orders.map(o => (
              <TableRow key={o.id} className="border-border hover:bg-muted/40">
                <TableCell className="font-mono text-foreground">#{o.number || o.id}</TableCell>
                <TableCell>
                  <div className={cn("font-medium text-foreground truncate max-w-[180px]", isLiveMode && "live-blur-text")}>
                    {customerName(o)}
                  </div>
                  {orderEmail(o) && (
                    <div className={cn("text-xs text-muted-foreground truncate max-w-[180px]", isLiveMode && "live-blur-text")}>
                      {orderEmail(o)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{formatDate(o.created_at)}</TableCell>
                <TableCell>
                  <Badge className={`text-xs border ${STATUS_COLORS[o.status] ?? STATUS_COLORS.open}`}>{lbl("statusVal", o.status)}</Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Badge className={`text-xs border ${PAYMENT_COLORS[o.payment_status] ?? PAYMENT_COLORS.pending}`}>{lbl("paymentVal", o.payment_status)}</Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">{o.products?.length ?? 0}</TableCell>
                <TableCell className="text-foreground text-sm font-medium">{formatPrice(o.total, o.currency)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover border-border">
                      <DropdownMenuItem onClick={() => openDetail(o)} className="gap-2 cursor-pointer hover:bg-muted">
                        <Eye className="h-4 w-4" /> {t("actionView")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openSendMessage(o)} disabled={!orderPhone(o) && !orderEmail(o)} className="gap-2 cursor-pointer hover:bg-muted">
                        <Send className="h-4 w-4" /> {t("actionSendMessage")}
                      </DropdownMenuItem>
                      <ActionItems o={o} />
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
          <span className="text-sm text-muted-foreground">{t("pagination")} {page} {t("paginationOf")} {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || refreshing} onClick={() => { setPage(p => Math.max(1, p - 1)); setRefreshing(true); }} className="border-border gap-1">
              <ChevronLeft className="h-4 w-4" /> {t("paginationPrev")}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || refreshing} onClick={() => { setPage(p => p + 1); setRefreshing(true); }} className="border-border gap-1">
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
              {detail && <Badge className={`text-xs border ${STATUS_COLORS[detail.status] ?? STATUS_COLORS.open}`}>{lbl("statusVal", detail.status)}</Badge>}
              {detail && <Badge className={`text-xs border ${PAYMENT_COLORS[detail.payment_status] ?? PAYMENT_COLORS.pending}`}>{lbl("paymentVal", detail.payment_status)}</Badge>}
              {detail && <Badge className={`text-xs border ${SHIPPING_COLORS[detail.shipping_status] ?? "bg-muted/40 border-border text-muted-foreground"}`}>{lbl("shippingVal", detail.shipping_status)}</Badge>}
            </DialogTitle>
          </DialogHeader>

          {detailLoading || !detail ? (
            <div className="grid gap-3 py-4">
              <Skeleton className="h-20 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="grid gap-5 py-2">
              {/* Itens */}
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Package className="h-4 w-4" /> {t("tabItems")}</h3>
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
                      {(detail.products || []).map((li, idx) => (
                        <TableRow key={li.id ?? idx} className="border-border">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {li.image?.src && <img src={li.image.src} alt={li.name} className="h-8 w-8 rounded object-cover border border-border" />}
                              <div>
                                <div className="text-sm text-foreground">{li.name}</div>
                                {li.sku && <div className="text-xs text-muted-foreground font-mono">{li.sku}</div>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-foreground text-sm">{li.quantity}</TableCell>
                          <TableCell className="text-right text-foreground text-sm">{formatPrice(Number(li.price) * (li.quantity || 1), detail.currency)}</TableCell>
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
                  {orderEmail(detail) && <div className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>📧 {orderEmail(detail)}</div>}
                  {orderPhone(detail) && <div className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>📱 {orderPhone(detail)}</div>}
                  {linkedTicketId && (
                    <Button size="sm" variant="outline" onClick={handleOpenChat} className="border-border gap-2 w-fit mt-1">
                      <MessageCircle className="h-4 w-4" /> {t("openChat")}
                    </Button>
                  )}
                </section>

                <section className="grid gap-1 p-3 rounded-lg border border-border bg-muted/30">
                  <h3 className="text-sm font-semibold text-foreground">{t("tabPayment")}</h3>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>{t("paymentStatus")}</span><span>{lbl("paymentVal", detail.payment_status)}</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>{t("shippingStatus")}</span><span>{lbl("shippingVal", detail.shipping_status)}</span></div>
                  <div className="flex justify-between text-sm text-foreground font-medium pt-1 border-t border-border mt-1"><span>{t("paymentTotal")}</span><span>{formatPrice(detail.total, detail.currency)}</span></div>
                </section>
              </div>

              {/* Endereço */}
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="p-3 rounded-lg border border-border bg-muted/30">
                  <h3 className="text-sm font-semibold text-foreground mb-1">{t("shippingAddress")}</h3>
                  <AddressBlock addr={detail.shipping_address} />
                </div>
                <div className="p-3 rounded-lg border border-border bg-muted/30">
                  <h3 className="text-sm font-semibold text-foreground mb-1">{t("billingAddress")}</h3>
                  <AddressBlock addr={detail.billing_address} />
                </div>
              </section>

              {/* Nota interna (owner_note) — campo unico que substitui */}
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><StickyNote className="h-4 w-4" /> {t("tabOwnerNote")}</h3>
                {buyerNote && (
                  <div className="p-2 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs">
                    <div className="font-medium mb-0.5">{t("buyerNote")}</div>
                    <div className="whitespace-pre-wrap">{buyerNote}</div>
                  </div>
                )}
                <Textarea
                  value={ownerNoteText}
                  onChange={e => setOwnerNoteText(e.target.value)}
                  placeholder={t("ownerNotePlaceholder")}
                  className="bg-muted border-border resize-none"
                  rows={3}
                  disabled={notesLoading}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{t("ownerNoteHint")}</span>
                  <Button size="sm" onClick={handleSaveOwnerNote} disabled={savingNote || notesLoading}>
                    {savingNote ? t("saving") : t("save")}
                  </Button>
                </div>
              </section>
            </div>
          )}

          <DialogFooter className="gap-2 flex-col sm:flex-row sm:items-center sm:justify-between border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              {detail && detail.status !== "closed" && detail.status !== "cancelled" && (
                <Button size="sm" variant="outline" className="border-border gap-2" disabled={savingAction} onClick={() => applyAction(detail.id, "close")}>
                  <CircleCheck className="h-4 w-4" /> {t("actionClose")}
                </Button>
              )}
              {detail && detail.status === "closed" && (
                <Button size="sm" variant="outline" className="border-border gap-2" disabled={savingAction} onClick={() => applyAction(detail.id, "open")}>
                  <CirclePlay className="h-4 w-4" /> {t("actionOpen")}
                </Button>
              )}
              {detail && detail.status !== "cancelled" && (
                <Button size="sm" variant="outline" className="border-border gap-2 text-red-400" disabled={savingAction} onClick={() => openCancel(detail.id)}>
                  <CircleX className="h-4 w-4" /> {t("actionCancel")}
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={() => setDetailOpen(false)} className="border-border w-full sm:w-auto shrink-0">{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar com motivo */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="bg-popover border-border max-w-md">
          <DialogHeader><DialogTitle className="text-foreground">{t("cancelTitle")}</DialogTitle></DialogHeader>
          <div className="grid gap-2 py-2">
            <Label className="text-xs text-muted-foreground">{t("cancelReasonLabel")}</Label>
            <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder={t("cancelReasonPlaceholder")} className="bg-muted border-border resize-none" rows={3} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} className="border-border">{t("close")}</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={savingAction}>{savingAction ? t("saving") : t("actionCancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewConversationDialog
        open={messageOpen}
        onOpenChange={(o) => { setMessageOpen(o); if (!o) setMessageOrder(null); }}
        prefilledNumber={messageOrder ? orderPhone(messageOrder) : undefined}
        prefilledContactName={messageOrder ? customerName(messageOrder) : undefined}
        prefilledContactEmail={messageOrder ? orderEmail(messageOrder) : undefined}
      />
    </div>
  );
}

function AddressBlock({ addr }: { addr: any }) {
  const { isLiveMode } = useLiveMode();
  if (!addr || (!addr.address && !addr.city)) {
    return <div className="text-xs text-muted-foreground italic">—</div>;
  }
  const line1 = [addr.address, addr.number, addr.floor].filter(Boolean).join(", ");
  return (
    <div className="text-xs text-muted-foreground space-y-0.5">
      {addr.name && <div className={cn("text-foreground", isLiveMode && "live-blur-text")}>{addr.name}</div>}
      {line1 && <div className={cn(isLiveMode && "live-blur-text")}>{line1}</div>}
      {(addr.locality || addr.city || addr.province) && <div className={cn(isLiveMode && "live-blur-text")}>{[addr.locality, addr.city, addr.province].filter(Boolean).join(" / ")}</div>}
      {addr.zipcode && <div className={cn(isLiveMode && "live-blur-text")}>{addr.zipcode}</div>}
      {addr.country && <div>{addr.country}</div>}
    </div>
  );
}
