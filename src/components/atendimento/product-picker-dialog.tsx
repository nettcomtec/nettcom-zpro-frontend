"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Search, RefreshCw, Image as ImageIcon, Store } from "lucide-react";
import {
  pickWooProducts,
  fetchWooStores,
  type WooProduct
} from "@/services/woocommerceProdutosService";
import {
  pickNuvemshopProducts,
  fetchNuvemshopStores
} from "@/services/nuvemshopProdutosService";
import {
  pickInternalProducts,
  fetchInternalStores,
  sendInternalProduct
} from "@/services/internalProdutosService";
import { toast } from "sonner";

type Format = "text" | "link";
type Mode = "insert" | "send";
type Source = "woocommerce" | "nuvemshop" | "internal";

// Ambas as fontes normalizam para o mesmo shape (WooProduct). Loja minima comum.
type PickerProduct = WooProduct;
interface PickerStore {
  id: number;
  description: string | null;
  storeUrl: string | null;
  whatsappId: number | null;
}

// Internal é rotulado via i18n no render (whitelabel — sem marca).
const SOURCE_LABEL: Record<Source, string> = {
  woocommerce: "WooCommerce",
  nuvemshop: "Nuvemshop",
  internal: ""
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onInsert: (text: string) => void;
  /** whatsappId do ticket atual — usado para auto-selecionar a loja vinculada ao canal. */
  whatsappId?: number | null;
  /** ticketId — necessário para o modo "Enviar" do catálogo interno. */
  ticketId?: number | null;
  /** Estagia imagem+legenda no compositor (catálogo interno, modo Inserir). */
  onStageMedia?: (imageUrl: string, caption: string) => void;
}

function formatPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function buildPayload(p: PickerProduct, format: Format): string {
  const price = formatPrice(p.price || p.regular_price);
  const link = p.permalink || "";
  if (format === "link") return link || `${p.name}${p.sku ? " (SKU: " + p.sku + ")" : ""}`;
  const lines: string[] = [`📦 *${p.name}*`];
  if (p.sku) lines.push(`SKU: \`${p.sku}\``);
  if (price) lines.push(`Preço: ${price}`);
  if (link) lines.push(link);
  return lines.join("\n");
}

// Ficha textual do produto interno (sem marca). Usada na legenda da imagem (Inserir)
// e como fallback de texto. Espelha o buildProductCaption do backend.
function buildInternalCaption(p: PickerProduct): string {
  const d: any = (p as any)._internal || {};
  const original = d.priceOriginal ? formatPrice(d.priceOriginal) : "";
  const promo = d.pricePromo ? formatPrice(d.pricePromo) : "";
  const lines: string[] = [`🛍️ *${p.name}*`];
  if (promo && original && promo !== original) lines.push(`~De ${original}~ por *${promo}*`);
  else if (promo) lines.push(`💰 *${promo}*`);
  else if (original) lines.push(`💰 *${original}*`);
  if (p.description) { lines.push(""); lines.push(p.description); }
  const vars: any[] = Array.isArray(d.variations) ? d.variations : [];
  const vl = vars
    .filter((v) => v && v.name && Array.isArray(v.options) && v.options.length)
    .map((v) => `${v.name}: ${v.options.join(", ")}`);
  if (vl.length) { lines.push(""); lines.push(...vl); }
  if (d.hasFreight) lines.push("🚚 Frete disponível");
  if (d.videoUrl) lines.push(`▶️ ${d.videoUrl}`);
  return lines.join("\n");
}

function storeLabel(s: PickerStore): string {
  return s.description?.trim() || (s.storeUrl ? s.storeUrl.replace(/^https?:\/\//, "") : `#${s.id}`);
}

export function ProductPickerDialog({ open, onOpenChange, onInsert, whatsappId, ticketId, onStageMedia }: Props) {
  const t = useTranslations("messageInput");
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [format, setFormat] = useState<Format>("text");
  const [mode, setMode] = useState<Mode>("insert");
  const [lastError, setLastError] = useState<string | null>(null);

  const [source, setSource] = useState<Source>("woocommerce");
  const [availableSources, setAvailableSources] = useState<Source[]>([]);
  const [storesBySource, setStoresBySource] = useState<Record<Source, PickerStore[]>>({
    woocommerce: [],
    nuvemshop: [],
    internal: []
  });
  const [loadingStores, setLoadingStores] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stores = storesBySource[source] || [];
  const showSourceSelect = availableSources.length > 1;
  const showStoreSelect = stores.length > 1;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("productPickerFormat");
    if (saved === "text" || saved === "link") setFormat(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("productPickerFormat", format);
    }
  }, [format]);

  const autoSelectStore = useCallback((src: Source, list: PickerStore[]) => {
    if (!list.length) { setSelectedStoreId(null); return; }
    // 1) loja vinculada ao canal atual
    const byChannel = whatsappId ? list.find((s) => Number(s.whatsappId) === Number(whatsappId)) : null;
    if (byChannel) { setSelectedStoreId(byChannel.id); return; }
    // 2) ultima loja escolhida manualmente (por fonte)
    const saved = typeof window !== "undefined" ? Number(localStorage.getItem(`productPickerStoreId_${src}`)) : NaN;
    const lastUsed = Number.isFinite(saved) ? list.find((s) => s.id === saved) : null;
    if (lastUsed) { setSelectedStoreId(lastUsed.id); return; }
    // 3) primeira disponivel
    setSelectedStoreId(list[0].id);
  }, [whatsappId]);

  // Carrega lojas de AMBAS as fontes ao abrir
  useEffect(() => {
    if (!open) return;
    setLoadingStores(true);
    Promise.allSettled([fetchWooStores(), fetchNuvemshopStores(), fetchInternalStores()])
      .then(([wooRes, nuvemRes, internalRes]) => {
        const woo: PickerStore[] = wooRes.status === "fulfilled"
          ? (wooRes.value.data || []).map((s) => ({ id: s.id, description: s.description, storeUrl: s.storeUrl, whatsappId: s.whatsappId }))
          : [];
        const nuvem: PickerStore[] = nuvemRes.status === "fulfilled"
          ? (nuvemRes.value.data || []).map((s) => ({ id: s.id, description: s.description, storeUrl: s.storeUrl, whatsappId: s.whatsappId }))
          : [];
        const internal: PickerStore[] = internalRes.status === "fulfilled"
          ? (internalRes.value.data || []).map((s) => ({ id: s.id, description: s.description, storeUrl: s.storeUrl, whatsappId: s.whatsappId }))
          : [];
        setStoresBySource({ woocommerce: woo, nuvemshop: nuvem, internal });

        const avail: Source[] = [];
        if (woo.length) avail.push("woocommerce");
        if (nuvem.length) avail.push("nuvemshop");
        if (internal.length) avail.push("internal");
        setAvailableSources(avail);

        // fonte inicial: lembrada -> que tem canal vinculado -> primeira disponivel
        const savedSource = (typeof window !== "undefined" ? localStorage.getItem("productPickerSource") : null) as Source | null;
        const channelSource: Source | null =
          whatsappId && woo.some((s) => Number(s.whatsappId) === Number(whatsappId)) ? "woocommerce"
          : whatsappId && nuvem.some((s) => Number(s.whatsappId) === Number(whatsappId)) ? "nuvemshop"
          : null;
        const initial: Source =
          channelSource && avail.includes(channelSource) ? channelSource
          : savedSource && avail.includes(savedSource) ? savedSource
          : avail[0] || "internal";
        setSource(initial);
        autoSelectStore(initial, initial === "woocommerce" ? woo : initial === "nuvemshop" ? nuvem : internal);
      })
      .finally(() => setLoadingStores(false));
  }, [open, whatsappId, autoSelectStore]);

  const handleSourceChange = (next: Source) => {
    setSource(next);
    if (typeof window !== "undefined") localStorage.setItem("productPickerSource", next);
    autoSelectStore(next, storesBySource[next] || []);
  };

  useEffect(() => {
    if (typeof window !== "undefined" && selectedStoreId) {
      localStorage.setItem(`productPickerStoreId_${source}`, String(selectedStoreId));
    }
  }, [selectedStoreId, source]);

  const load = async (search: string, force = false) => {
    if (force) setSyncing(true); else setLoading(true);
    setLastError(null);
    try {
      const picker =
        source === "internal" ? pickInternalProducts
        : source === "nuvemshop" ? pickNuvemshopProducts
        : pickWooProducts;
      const { data } = await picker(search, force, selectedStoreId, whatsappId || null);
      setProducts((data || []) as PickerProduct[]);
    } catch (err: any) {
      setProducts([]);
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.message;
      const detail = serverMsg || err?.message || "unknown";
      const msg = status
        ? `${t("productPickerError")} (HTTP ${status}: ${detail})`
        : `${t("productPickerError")}: ${detail}`;
      setLastError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (loadingStores) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(q), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, loadingStores, selectedStoreId, source]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setProducts([]);
    }
  }, [open]);

  const handlePick = async (p: PickerProduct) => {
    if (source === "internal") {
      const d: any = (p as any)._internal || {};
      const caption = buildInternalCaption(p);
      if (mode === "send") {
        if (!ticketId) { toast.error(t("productPickerNoTicket")); return; }
        try {
          await sendInternalProduct(Number(d.productId || p.id), Number(ticketId));
          toast.success(t("productSentToast"));
          onOpenChange(false);
        } catch (err: any) {
          const code = err?.response?.data?.message;
          toast.error(code === "ERR_OUTSIDE_24H_WINDOW" ? t("productPickerWindowClosed") : t("productSendError"));
        }
        return;
      }
      // modo Inserir: imagem (estagiada) + legenda no compositor
      const img = d.mainImageUrl || p.images?.[0]?.src || "";
      if (img && onStageMedia) onStageMedia(img, caption);
      else onInsert(caption);
      onOpenChange(false);
      toast.success(t("productInsertedToast"));
      return;
    }
    onInsert(buildPayload(p, format));
    onOpenChange(false);
    toast.success(t("productInsertedToast"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-xl max-h-[85vh] overflow-hidden p-4 sm:p-6 flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t("productPickerTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t("productPickerSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-2 min-h-0 flex-1">
          {showSourceSelect && (
            <div className="flex flex-wrap gap-1 items-center">
              {availableSources.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSourceChange(s)}
                  className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                    source === s
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {s === "internal" ? t("productPickerSourceInternal") : SOURCE_LABEL[s]}
                </button>
              ))}
            </div>
          )}

          {showStoreSelect && (
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">
                {t("productPickerStoreLabel")}:
              </span>
              <Select
                value={selectedStoreId ? String(selectedStoreId) : ""}
                onValueChange={(v) => setSelectedStoreId(Number(v))}
              >
                <SelectTrigger className="bg-popover border-border h-8 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {storeLabel(s)}
                      {s.whatsappId && <span className="text-muted-foreground ml-1">• 🔗</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder={t("productPickerSearch")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8 bg-popover border-border"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => load(q, true)}
              disabled={syncing}
              title={t("productPickerResync")}
              className="border-border shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {source === "internal" ? (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">{t("productPickerModeLabel")}:</span>
              {(["insert", "send"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                    mode === m
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {m === "insert" ? t("productPickerModeInsert") : t("productPickerModeSend")}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">{t("productPickerFormatLabel")}:</span>
              {(["text", "link"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                    format === f
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {f === "text" ? t("productPickerFormatText") : t("productPickerFormatLink")}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-md border border-border">
            {loading || loadingStores ? (
              <div className="p-2 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-10 w-10 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground px-4">
                <Package className="h-8 w-8 opacity-40" />
                <p className="text-sm">{t("productPickerEmpty")}</p>
                {lastError && (
                  <p className="text-xs text-red-500 text-center max-w-md break-words">
                    {lastError}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => load(q, true)}
                  disabled={syncing}
                  className="mt-2 border-border gap-2"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {t("productPickerResync")}
                </Button>
              </div>
            ) : (
              <div className="p-1">
                {products.map((p) => {
                  const img = p.images?.[0]?.src;
                  const price = formatPrice(p.price || p.regular_price);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePick(p)}
                      className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted text-left transition-colors"
                    >
                      {img ? (
                        <img
                          src={img}
                          alt={p.name}
                          className="h-10 w-10 rounded object-cover border border-border shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded border border-border bg-muted flex items-center justify-center shrink-0">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          {p.sku && <span className="font-mono">{p.sku}</span>}
                          {price && <span>{price}</span>}
                          {p.stock_status === "outofstock" && (
                            <span className="text-red-500">• {t("productPickerOutOfStock")}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
