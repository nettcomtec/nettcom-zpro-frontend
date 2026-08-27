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
import { Switch } from "@/components/ui/switch";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Plus, MoreVertical, Pencil, Trash2, Package, Search, RefreshCw, ImageIcon, Upload, X, Check, Store } from "lucide-react";
import { toast } from "sonner";
import {
  fetchWooProducts, createWooProduct, updateWooProduct, deleteWooProduct,
  fetchWooStores,
  WooProduct, WooProductPayload, WooStoreSummary
} from "@/services/woocommerceProdutosService";
import { fetchGallery, getGalleryPreviewUrl, uploadGalleryFiles, GalleryItem } from "@/services/gallery";

const EMPTY_FORM: WooProductPayload = {
  name: "",
  type: "simple",
  status: "publish",
  regular_price: "",
  sale_price: "",
  sku: "",
  description: "",
  short_description: "",
  manage_stock: false,
  stock_quantity: null,
  stock_status: "instock",
  weight: "",
  images: []
};

function formatPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(2);
}

function statusBadge(status: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    publish: "bg-green-500/15 text-green-400 border-green-500/30",
    draft: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    private: "bg-blue-500/15 text-blue-400 border-blue-500/30"
  };
  return (
    <Badge className={`text-xs border ${map[status] ?? map.draft}`}>
      {t(`status_${status}`) || status}
    </Badge>
  );
}

function stockBadge(stockStatus: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    instock: "bg-green-500/15 text-green-400 border-green-500/30",
    outofstock: "bg-red-500/15 text-red-400 border-red-500/30",
    onbackorder: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
  };
  return (
    <Badge className={`text-xs border ${map[stockStatus] ?? map.outofstock}`}>
      {t(`stock_${stockStatus}`) || stockStatus}
    </Badge>
  );
}

export function WooCommerceProdutosView({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations("woocommerceProdutosPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [stores, setStores] = useState<WooStoreSummary[]>([]);
  const initialStoreId = useMemo(() => {
    const raw = searchParams.get("store");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);
  const [storeId, setStoreId] = useState<number | null>(initialStoreId);

  const [products, setProducts] = useState<WooProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WooProduct | null>(null);
  const [form, setForm] = useState<WooProductPayload>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<WooProduct | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const setField = (key: keyof WooProductPayload, val: any) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const openGallery = async () => {
    setGalleryOpen(true);
    if (galleryItems.length === 0) {
      setGalleryLoading(true);
      try {
        const result = await fetchGallery({ fileType: "image" });
        setGalleryItems(result.data.filter(i => i.type.startsWith("image")));
      } catch {
        toast.error(t("errorLoadGallery"));
      } finally {
        setGalleryLoading(false);
      }
    }
  };

  const handlePickGallery = (item: GalleryItem) => {
    setField("images", [{ src: item.url, alt: item.name }]);
    setGalleryOpen(false);
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      await uploadGalleryFiles(files);
      const result = await fetchGallery({ fileType: "image" });
      const images = result.data.filter(i => i.type.startsWith("image"));
      setGalleryItems(images);
      if (images.length > 0) {
        setField("images", [{ src: images[0].url, alt: images[0].name }]);
      }
      toast.success(t("imageUploaded"));
      setGalleryOpen(false);
    } catch {
      toast.error(t("errorUpload"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const load = useCallback(async (q = "") => {
    try {
      const { data } = await fetchWooProducts(q, storeId);
      setProducts(data);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }, [t, storeId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetchWooStores()
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
    const params = new URLSearchParams(searchParams.toString());
    params.set("store", String(next));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleSearch = () => {
    setSearching(true);
    load(search);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (p: WooProduct) => {
    setEditing(p);
    setForm({
      name: p.name,
      type: p.type,
      status: p.status,
      regular_price: formatPrice(p.regular_price),
      sale_price: formatPrice(p.sale_price),
      sku: p.sku,
      description: p.description,
      short_description: p.short_description,
      manage_stock: p.manage_stock,
      stock_quantity: p.stock_quantity,
      stock_status: p.stock_status,
      weight: p.weight,
      images: p.images?.map(img => ({ src: img.src, alt: img.alt })) ?? []
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      toast.error(t("requiredName"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { data } = await updateWooProduct(editing.id, form, storeId);
        setProducts(prev => prev.map(p => p.id === data.id ? data : p));
        toast.success(t("updated"));
      } else {
        const { data } = await createWooProduct(form, storeId);
        setProducts(prev => [data, ...prev]);
        toast.success(t("created"));
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWooProduct(deleteTarget.id, storeId);
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
      toast.success(t("deleted"));
      setDeleteTarget(null);
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={embedded ? "flex flex-col gap-4" : "flex flex-col gap-6 p-4 md:p-6"}>
      {!embedded && (
        <PageHeader
          title={t("title")}
          description={t("description")}
          help={{
            description: t("helpDesc"),
            sections: [
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
              { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
            ],
          }}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <div className="flex gap-2 flex-1 sm:max-w-sm">
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
              disabled={searching}
              className="border-border shrink-0"
              aria-label={t("searchAria")}
            >
              {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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

        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          {t("newProduct")}
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground w-16">{t("colImage")}</TableHead>
              <TableHead className="text-muted-foreground">{t("colName")}</TableHead>
              <TableHead className="text-muted-foreground hidden sm:table-cell">{t("colSku")}</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">{t("colPrice")}</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">{t("colStock")}</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">{t("colStatus")}</TableHead>
              <TableHead className="text-muted-foreground w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-10 w-10 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : products.length === 0 ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={7}>
                  <EmptyState
                    icon={Package}
                    title={t("emptyTitle")}
                    description={t("emptyDescription")}
                  />
                </TableCell>
              </TableRow>
            ) : products.map(p => (
              <TableRow key={p.id} className="border-border hover:bg-muted/40">
                <TableCell>
                  {p.images?.[0]?.src ? (
                    <img
                      src={p.images[0].src}
                      alt={p.images[0].alt || p.name}
                      className="h-10 w-10 rounded object-cover border border-border"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted border border-border flex items-center justify-center">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground truncate max-w-[180px]">{p.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.type}</div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm font-mono">
                  {p.sku || "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell text-foreground text-sm">
                  {p.regular_price ? `R$ ${formatPrice(p.regular_price)}` : "—"}
                  {p.sale_price && p.sale_price !== p.regular_price && (
                    <div className="text-xs text-green-400">R$ {formatPrice(p.sale_price)}</div>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {stockBadge(p.stock_status, t)}
                  {p.manage_stock && p.stock_quantity !== null && (
                    <div className="text-xs text-muted-foreground mt-0.5">{p.stock_quantity} un</div>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {statusBadge(p.status, t)}
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
                        onClick={() => openEdit(p)}
                        className="gap-2 cursor-pointer hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" /> {t("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(p)}
                        className="gap-2 cursor-pointer text-red-400 hover:text-red-400 hover:bg-muted"
                      >
                        <Trash2 className="h-4 w-4" /> {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-popover border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editing ? t("editTitle") : t("newTitle")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-foreground">{t("fieldName")} *</Label>
              <Input
                value={form.name}
                onChange={e => setField("name", e.target.value)}
                placeholder={t("fieldNamePlaceholder")}
                className="bg-muted border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-foreground">{t("fieldType")}</Label>
                <Select value={form.type} onValueChange={v => setField("type", v)}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="simple">{t("typeSimple")}</SelectItem>
                    <SelectItem value="variable">{t("typeVariable")}</SelectItem>
                    <SelectItem value="grouped">{t("typeGrouped")}</SelectItem>
                    <SelectItem value="external">{t("typeExternal")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-foreground">{t("fieldStatus")}</Label>
                <Select value={form.status} onValueChange={v => setField("status", v)}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="publish">{t("status_publish")}</SelectItem>
                    <SelectItem value="draft">{t("status_draft")}</SelectItem>
                    <SelectItem value="pending">{t("status_pending")}</SelectItem>
                    <SelectItem value="private">{t("status_private")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-foreground">{t("fieldRegularPrice")}</Label>
                <Input
                  value={form.regular_price}
                  onChange={e => setField("regular_price", e.target.value)}
                  placeholder="0.00"
                  className="bg-muted border-border"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-foreground">{t("fieldSalePrice")}</Label>
                <Input
                  value={form.sale_price}
                  onChange={e => setField("sale_price", e.target.value)}
                  placeholder="0.00"
                  className="bg-muted border-border"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-foreground">{t("fieldSku")}</Label>
              <Input
                value={form.sku}
                onChange={e => setField("sku", e.target.value)}
                placeholder={t("fieldSkuPlaceholder")}
                className="bg-muted border-border font-mono"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-foreground">{t("fieldShortDescription")}</Label>
              <Textarea
                value={form.short_description}
                onChange={e => setField("short_description", e.target.value)}
                placeholder={t("fieldShortDescriptionPlaceholder")}
                className="bg-muted border-border resize-none"
                rows={2}
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-foreground">{t("fieldDescription")}</Label>
              <Textarea
                value={form.description}
                onChange={e => setField("description", e.target.value)}
                placeholder={t("fieldDescriptionPlaceholder")}
                className="bg-muted border-border resize-none"
                rows={3}
              />
            </div>

            <div className="grid gap-3 p-3 rounded-lg border border-border bg-muted/50">
              <div className="flex items-center justify-between">
                <Label className="text-foreground">{t("fieldManageStock")}</Label>
                <Switch
                  checked={form.manage_stock}
                  onCheckedChange={v => setField("manage_stock", v)}
                />
              </div>
              {form.manage_stock ? (
                <div className="grid gap-1.5">
                  <Label className="text-foreground">{t("fieldStockQuantity")}</Label>
                  <Input
                    type="number"
                    value={form.stock_quantity ?? ""}
                    onChange={e => setField("stock_quantity", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="0"
                    className="bg-muted border-border"
                  />
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label className="text-foreground">{t("fieldStockStatus")}</Label>
                  <Select value={form.stock_status} onValueChange={v => setField("stock_status", v)}>
                    <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="instock">{t("stock_instock")}</SelectItem>
                      <SelectItem value="outofstock">{t("stock_outofstock")}</SelectItem>
                      <SelectItem value="onbackorder">{t("stock_onbackorder")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label className="text-foreground">{t("fieldWeight")}</Label>
              <Input
                value={form.weight}
                onChange={e => setField("weight", e.target.value)}
                placeholder="kg"
                className="bg-muted border-border w-40"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-foreground">{t("fieldImage")}</Label>
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  {form.images?.[0]?.src ? (
                    <div className="relative group">
                      <img
                        src={form.images[0].src}
                        alt="preview"
                        className="h-20 w-20 rounded-lg object-cover border border-border"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <button
                        type="button"
                        onClick={() => setField("images", [])}
                        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-20 w-20 rounded-lg bg-muted border border-border border-dashed flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openGallery}
                      className="border-border gap-1.5 text-xs"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      {t("chooseGallery")}
                    </Button>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadImage}
                        disabled={uploading}
                      />
                      <span className={`inline-flex items-center gap-1.5 text-xs rounded-md border border-border bg-transparent px-3 py-1.5 font-medium hover:bg-muted transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                        <Upload className="h-3.5 w-3.5" />
                        {uploading ? t("uploading") : t("uploadPC")}
                      </span>
                    </label>
                  </div>
                  <Input
                    value={form.images?.[0]?.src ?? ""}
                    onChange={e => setField("images", e.target.value ? [{ src: e.target.value, alt: form.name }] : [])}
                    placeholder="https://..."
                    className="bg-muted border-border text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border">
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("saving") : editing ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="bg-popover border-border max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("galleryTitle")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">{t("galleryDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
            {galleryLoading ? (
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            ) : galleryItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <ImageIcon className="h-10 w-10" />
                <p className="text-sm">{t("galleryEmpty")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3 py-2">
                {galleryItems.map(item => {
                  const selected = form.images?.[0]?.src === item.url;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handlePickGallery(item)}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-square ${selected ? "border-blue-500" : "border-transparent hover:border-muted-foreground"}`}
                    >
                      <img
                        src={getGalleryPreviewUrl(item)}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                        onError={e => {
                          const p = (e.target as HTMLImageElement).parentElement;
                          if (p) p.style.display = "none";
                        }}
                      />
                      {selected && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                          <Check className="h-6 w-6 text-blue-400" />
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5">
                        <p className="text-[10px] text-white truncate">{item.name}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border pt-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadImage}
                disabled={uploading}
              />
              <span className={`inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium hover:bg-accent transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                <Upload className="h-4 w-4" />
                {uploading ? t("uploading") : t("uploadPC")}
              </span>
            </label>
            <Button variant="outline" onClick={() => setGalleryOpen(false)} className="border-border">
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="bg-popover border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("deleteConfirmDesc", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="border-border"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
