"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Package, Plus, Search, Pencil, Trash2, RefreshCw, ImageIcon, X, Upload, Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchProducts, createProduct, updateProduct, deleteProduct, type Product,
} from "@/services/catalogo";
import { fetchGallery, uploadGalleryFiles, getGalleryPreviewUrl, type GalleryItem } from "@/services/gallery";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

const API_BASE_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) ||
  "http://localhost:3101";

function resolveImg(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("blob:") || url.startsWith("data:")) return url;
  return `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" tabIndex={-1} aria-label="?" className="inline-flex align-middle text-muted-foreground hover:text-foreground">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[16rem] text-xs leading-snug">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

interface VariationForm {
  name: string;
  optionsText: string;
}

export default function CatalogoPage() {
  const t = useTranslations("catalogoPage");
  const allowed = usePageAccess("catalogo", { adminSuperOnly: true });

  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriceOriginal, setFormPriceOriginal] = useState("");
  const [formPricePromo, setFormPricePromo] = useState("");
  const [formMainImage, setFormMainImage] = useState("");
  const [formExtraImages, setFormExtraImages] = useState<string[]>([]);
  const [formVideoUrl, setFormVideoUrl] = useState("");
  const [formVariations, setFormVariations] = useState<VariationForm[]>([]);
  const [formHasFreight, setFormHasFreight] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formSku, setFormSku] = useState("");
  const [formCategory, setFormCategory] = useState("");

  // Gallery picker state
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryTarget, setGalleryTarget] = useState<"main" | "extra">("main");
  const galleryFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchProducts({ pageNumber: 1, searchParam: search.trim() || undefined });
      setItems(result.data);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [search, t]);

  useEffect(() => {
    const id = setTimeout(load, 300);
    return () => clearTimeout(id);
  }, [load]);

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormPriceOriginal("");
    setFormPricePromo("");
    setFormMainImage("");
    setFormExtraImages([]);
    setFormVideoUrl("");
    setFormVariations([]);
    setFormHasFreight(false);
    setFormIsActive(true);
    setFormSku("");
    setFormCategory("");
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setFormName(p.name || "");
    setFormDescription(p.description || "");
    setFormPriceOriginal(p.priceOriginal != null ? String(p.priceOriginal) : "");
    setFormPricePromo(p.pricePromo != null ? String(p.pricePromo) : "");
    setFormMainImage(p.mainImageUrl || "");
    setFormExtraImages(
      Array.isArray(p.imagesJson)
        ? p.imagesJson.map((i) => (typeof i === "string" ? i : i?.url)).filter(Boolean)
        : []
    );
    setFormVideoUrl(p.videoUrl || "");
    setFormVariations(
      Array.isArray(p.variationsJson)
        ? p.variationsJson.map((v) => ({ name: v.name || "", optionsText: (v.options || []).join(", ") }))
        : []
    );
    setFormHasFreight(!!p.hasFreight);
    setFormIsActive(p.isActive !== false);
    setFormSku(p.sku || "");
    setFormCategory(p.category || "");
    setDialogOpen(true);
  };

  const onSubmit = async () => {
    if (!formName.trim()) {
      toast.error(t("errorName"));
      return;
    }
    const payload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      priceOriginal: formPriceOriginal ? Number(formPriceOriginal.replace(",", ".")) : null,
      pricePromo: formPricePromo ? Number(formPricePromo.replace(",", ".")) : null,
      mainImageUrl: formMainImage || null,
      imagesJson: formExtraImages.map((url) => ({ url })),
      videoUrl: formVideoUrl.trim() || null,
      variationsJson: formVariations
        .map((v) => ({
          name: v.name.trim(),
          options: v.optionsText.split(",").map((o) => o.trim()).filter(Boolean),
        }))
        .filter((v) => v.name && v.options.length > 0),
      hasFreight: formHasFreight,
      isActive: formIsActive,
      sku: formSku.trim() || null,
      category: formCategory.trim() || null,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateProduct(editing.id, payload);
        toast.success(t("successUpdate"));
      } else {
        await createProduct(payload);
        toast.success(t("successCreate"));
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error(editing ? t("errorUpdate") : t("errorCreate"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await deleteProduct(deleting.id);
      toast.success(t("successDelete"));
      setDeleting(null);
      load();
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setSaving(false);
    }
  };

  // Variations editor
  const addVariation = () => setFormVariations((p) => [...p, { name: "", optionsText: "" }]);
  const updateVariation = (i: number, field: "name" | "optionsText", value: string) =>
    setFormVariations((p) => p.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)));
  const removeVariation = (i: number) =>
    setFormVariations((p) => p.filter((_, idx) => idx !== i));

  // Gallery picker
  const openGallery = async (target: "main" | "extra") => {
    setGalleryTarget(target);
    setGalleryOpen(true);
    if (galleryItems.length > 0) return;
    setGalleryLoading(true);
    try {
      const result = await fetchGallery({ pageNumber: 1, fileType: "image" });
      setGalleryItems(result.data);
    } catch {
      toast.error(t("errorLoadGallery"));
    } finally {
      setGalleryLoading(false);
    }
  };

  const pickGalleryImage = (item: GalleryItem) => {
    if (galleryTarget === "main") {
      // Fecha a galeria no proximo frame (rAF) em vez de sincronamente no clique.
      // A galeria e um Dialog filho aberto por cima do Dialog do formulario do produto.
      // Em touch, o DismissableLayer do Radix adia a deteccao de "clique-fora" para o
      // evento click; se a galeria desmontar sincronamente nesse mesmo clique, o Dialog
      // PAI (formulario) vira a camada do topo e e fechado junto. Adiar mantem a galeria
      // montada quando o check roda, protegendo o pai. (mesmo fix de GalleryPickerWithUploadDialog)
      requestAnimationFrame(() => {
        setFormMainImage(item.url);
        setGalleryOpen(false);
      });
    } else {
      setFormExtraImages((p) => (p.includes(item.url) ? p : [...p, item.url]));
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setGalleryUploading(true);
    try {
      await uploadGalleryFiles(files);
      const result = await fetchGallery({ pageNumber: 1, fileType: "image" });
      setGalleryItems(result.data);
      toast.success(t("uploadOk"));
    } catch {
      toast.error(t("errorLoadGallery"));
    } finally {
      setGalleryUploading(false);
      if (galleryFileRef.current) galleryFileRef.current.value = "";
    }
  };

  if (!allowed) return <AccessDenied />;

  return (
    <div className="space-y-4">
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
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
          </Button>
        </div>
      </PageHeader>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Package} title={t("emptyTitle")} description={t("emptyDescription")}>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
          </Button>
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t("colImage")}</TableHead>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colPrice")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => {
                  const img = resolveImg(p.mainImageUrl);
                  const promo = formatPrice(p.pricePromo);
                  const original = formatPrice(p.priceOriginal);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt={p.name} className="h-10 w-10 rounded object-cover border border-border" />
                        ) : (
                          <div className="h-10 w-10 rounded border border-border bg-muted flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {p.name}
                        {p.sku && <span className="ml-2 text-xs font-mono text-muted-foreground">{p.sku}</span>}
                      </TableCell>
                      <TableCell>
                        {promo ? (
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-green-600">{promo}</span>
                            {original && <span className="text-xs text-muted-foreground line-through">{original}</span>}
                          </span>
                        ) : (
                          <span>{original || "-"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.isActive !== false ? (
                          <Badge variant="secondary">{t("active")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("inactive")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title={t("edit")}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(p)} title={t("delete")}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("createTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">{t("labelName")}</Label>
              <Input id="p-name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t("placeholderName")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-desc">{t("labelDescription")}</Label>
              <Textarea id="p-desc" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-po">{t("labelPriceOriginal")}</Label>
                <Input id="p-po" value={formPriceOriginal} onChange={(e) => setFormPriceOriginal(e.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-pp">{t("labelPricePromo")}</Label>
                <Input id="p-pp" value={formPricePromo} onChange={(e) => setFormPricePromo(e.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
            </div>

            {/* Main image */}
            <div className="space-y-1.5">
              <Label>{t("labelMainImage")}</Label>
              <div className="flex items-center gap-3">
                {formMainImage ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveImg(formMainImage)} alt="" className="h-16 w-16 rounded object-cover border border-border" />
                    <button
                      type="button"
                      onClick={() => setFormMainImage("")}
                      className="absolute -top-2 -right-2 bg-destructive text-white rounded-full h-5 w-5 flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded border border-dashed border-border bg-muted flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => openGallery("main")}>
                  <ImageIcon className="mr-2 h-4 w-4" /> {t("pickFromGallery")}
                </Button>
              </div>
            </div>

            {/* Extra images */}
            <div className="space-y-1.5">
              <Label className="inline-flex items-center gap-1.5">
                {t("labelExtraImages")}
                <InfoTip text={t("extraImagesTip")} />
              </Label>
              <p className="text-xs text-muted-foreground">{t("extraImagesHint")}</p>
              <div className="flex flex-wrap gap-2">
                {formExtraImages.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveImg(url)} alt="" className="h-14 w-14 rounded object-cover border border-border" />
                    <button
                      type="button"
                      onClick={() => setFormExtraImages((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute -top-2 -right-2 bg-destructive text-white rounded-full h-5 w-5 flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="icon" className="h-14 w-14" onClick={() => openGallery("extra")}>
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-video">{t("labelVideoUrl")}</Label>
              <Input id="p-video" value={formVideoUrl} onChange={(e) => setFormVideoUrl(e.target.value)} placeholder="https://..." />
            </div>

            {/* Variations */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("labelVariations")}</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addVariation}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> {t("addVariation")}
                </Button>
              </div>
              {formVariations.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("variationsHint")}</p>
              )}
              {formVariations.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={v.name}
                    onChange={(e) => updateVariation(i, "name", e.target.value)}
                    placeholder={t("placeholderVariationName")}
                    className="w-1/3"
                  />
                  <Input
                    value={v.optionsText}
                    onChange={(e) => updateVariation(i, "optionsText", e.target.value)}
                    placeholder={t("placeholderVariationOptions")}
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeVariation(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-sku">{t("labelSku")}</Label>
                <Input id="p-sku" value={formSku} onChange={(e) => setFormSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-cat">{t("labelCategory")}</Label>
                <Input id="p-cat" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label>{t("labelFreight")}</Label>
                <p className="text-xs text-muted-foreground">{t("freightHint")}</p>
              </div>
              <Switch checked={formHasFreight} onCheckedChange={setFormHasFreight} />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label>{t("labelActive")}</Label>
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={onSubmit} disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gallery picker dialog */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("galleryTitle")}</DialogTitle>
            <DialogDescription>{t("galleryDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <input ref={galleryFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} />
            <Button variant="outline" size="sm" onClick={() => galleryFileRef.current?.click()} disabled={galleryUploading}>
              <Upload className={`mr-2 h-4 w-4 ${galleryUploading ? "animate-pulse" : ""}`} /> {t("uploadImage")}
            </Button>
          </div>
          <ScrollArea className="h-[50vh] rounded-md border border-border">
            {galleryLoading ? (
              <div className="grid grid-cols-3 gap-2 p-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square w-full rounded" />
                ))}
              </div>
            ) : galleryItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                <ImageIcon className="h-8 w-8 opacity-40" />
                <p className="text-sm">{t("galleryEmpty")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 p-2">
                {galleryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pickGalleryImage(item)}
                    className="group relative aspect-square rounded overflow-hidden border border-border hover:ring-2 hover:ring-primary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveImg(getGalleryPreviewUrl(item))} alt={item.name} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGalleryOpen(false)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteConfirm", { name: deleting?.name || "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
