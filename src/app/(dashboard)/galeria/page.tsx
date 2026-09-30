"use client";

import { formatDate as formatDateIntl } from "@/lib/format";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Image, Upload, Search, FileIcon, Trash2, Film, FileText,
  Download, Eye, Music, Archive, File,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchGallery, fetchGalleryUsage, uploadGalleryFiles, deleteGalleryItem, type GalleryItem, type GalleryUsage } from "@/services/gallery";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

// All file type categories matching the legacy backend slugs
type MediaFilter = "all" | "image" | "video" | "audio" | "pdf" | "document" | "archive" | "other";

function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Igual ao formatFileSize, mas 0 vira "0 B" (uso da quota, não célula vazia). */
function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  return formatFileSize(bytes);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return formatDateIntl(new Date(dateStr), {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Resolve the category slug from the normalized GalleryItem.type field.
 *  The backend may return a slug ("image", "pdf", "audio" …) or a MIME type
 * ("image/jpeg", "video/mp4" …). We normalise both to the legacy slug set. */
function resolveCategory(type: string): MediaFilter {
  if (!type) return "other";
  const t = type.toLowerCase();
  if (t === "image"    || t.startsWith("image/"))    return "image";
  if (t === "video"    || t.startsWith("video/"))    return "video";
  if (t === "audio"    || t.startsWith("audio/"))    return "audio";
  if (t === "pdf"      || t === "application/pdf")   return "pdf";
  if (t === "document" || t.includes("word") || t.includes("spreadsheet") || t.includes("presentation") || t.includes("excel") || t.includes("text/")) return "document";
  if (t === "archive"  || t.includes("zip") || t.includes("rar") || t.includes("tar") || t.includes("7z")) return "archive";
  return "other";
}

function getMediaIcon(type: string): React.ElementType {
  const cat = resolveCategory(type);
  if (cat === "image")    return Image;
  if (cat === "video")    return Film;
  if (cat === "audio")    return Music;
  if (cat === "pdf")      return FileText;
  if (cat === "archive")  return Archive;
  if (cat === "document") return FileText;
  return FileIcon;
}

const FILE_TYPE_BADGE_COLORS: Record<MediaFilter, string> = {
  all:      "bg-muted text-muted-foreground",
  image:    "bg-info/10 text-info",
  video:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  audio:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  pdf:      "bg-destructive/10 text-destructive",
  document: "bg-success/10 text-success",
  archive:  "bg-muted text-muted-foreground",
  other:    "bg-muted text-muted-foreground",
};

export default function GaleriaPage() {
  const t = useTranslations("galeriaPage");
  const allowed = usePageAccess("galeria", { allowIfNotSet: true });
  if (!allowed) return <AccessDenied />;

  const FILE_TYPE_TABS: { value: MediaFilter; label: string; Icon: React.ElementType }[] = [
    { value: "all",      label: t("filterAll"),       Icon: File },
    { value: "image",    label: t("filterImages"),    Icon: Image },
    { value: "video",    label: t("filterVideos"),    Icon: Film },
    { value: "audio",    label: t("filterAudios"),    Icon: Music },
    { value: "pdf",      label: "PDF",                Icon: FileText },
    { value: "document", label: t("filterDocuments"), Icon: FileText },
    { value: "archive",  label: t("filterArchives"),  Icon: Archive },
    { value: "other",    label: t("filterOther"),     Icon: FileIcon },
  ];

  const FILE_TYPE_LABELS: Record<MediaFilter, string> = {
    all:      t("filterAll"),
    image:    t("labelImage"),
    video:    t("labelVideo"),
    audio:    t("labelAudio"),
    pdf:      "PDF",
    document: t("labelDocument"),
    archive:  t("labelArchive"),
    other:    t("labelOther"),
  };

  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [data, setData]             = useState<GalleryItem[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore]       = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState<MediaFilter>("all");
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [deleteId, setDeleteId]     = useState<number | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null);
  const [usage, setUsage] = useState<GalleryUsage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef  = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  // Load gallery from API, passing fileType and searchParam as query params
  const loadGallery = useCallback(async (
    searchVal: string,
    typeVal: MediaFilter,
    page: number,
    append: boolean,
  ) => {
    const reqId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const result = await fetchGallery({
        pageNumber:  page,
        searchParam: searchVal || undefined,
        fileType:    typeVal !== "all" ? typeVal : undefined,
      });
      if (reqId !== requestIdRef.current) return;
      setData((prev) => (append ? [...prev, ...result.data] : result.data));
      setHasMore(result.hasMore);
      setTotalCount(result.count);
      setPageNumber(page);
    } catch {
      if (reqId === requestIdRef.current) toast.error(t("errorLoad"));
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await fetchGalleryUsage());
    } catch {
      // best-effort: sem uso, a página segue funcionando sem a barra
    }
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  // Re-fetch whenever search or type filter changes (reset to page 1)
  useEffect(() => {
    loadGallery(search, typeFilter, 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter]);

  // Infinite scroll: observe sentinel and load next page when it enters the viewport
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadGallery(search, typeFilter, pageNumber + 1, true);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, pageNumber, search, typeFilter, loadGallery]);

  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value as MediaFilter);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      loadGallery(search, typeFilter, 1, false);
    }
  };

  const MAX_UPLOAD_SIZE = Math.floor(1.9 * 1024 * 1024 * 1024);
  const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/", "application/", "text/"];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const fileArr = Array.from(files);
    // Preflight de quota (o backend revalida e é a fonte da verdade)
    if (usage?.quotaBytes != null) {
      const incoming = fileArr.reduce((acc, f) => acc + f.size, 0);
      if (usage.usedBytes + incoming > usage.quotaBytes) {
        toast.error(t("quotaExceededError", {
          used: formatBytes(usage.usedBytes),
          quota: formatBytes(usage.quotaBytes),
        }));
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }
    for (const file of fileArr) {
      if (file.size > MAX_UPLOAD_SIZE) {
        toast.error(t("fileSizeError", { fileName: file.name, maxMB: "1.9GB" }));
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const mimeOk = ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix));
      if (!mimeOk) {
        toast.error(t("invalidMimeType", { fileName: file.name }));
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }
    setUploading(true);
    setUploadProgress({ done: 0, total: fileArr.length });
    try {
      const { success, failed } = await uploadGalleryFiles(fileArr, (p) => {
        setUploadProgress({ done: p.index, total: p.total });
      });
      if (success > 0) toast.success(t("uploadSuccess", { count: success }));
      if (failed.length > 0) {
        const reasonLabel = (code: string) => {
          switch (code) {
            case "too_large":    return t("uploadReasonTooLarge");
            case "unsupported":  return t("uploadReasonUnsupported");
            case "unauthorized": return t("uploadReasonUnauthorized");
            case "quota":        return t("uploadReasonQuota");
            case "server_error": return t("uploadReasonServerError");
            case "timeout":      return t("uploadReasonTimeout");
            case "network":      return t("uploadReasonNetwork");
            default:             return t("uploadReasonUnknown");
          }
        };
        const grouped = failed.reduce<Record<string, number>>((acc, f) => {
          const label = reasonLabel(f.code);
          acc[label] = (acc[label] || 0) + 1;
          return acc;
        }, {});
        const description = Object.entries(grouped)
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => (count > 1 ? `${count}x ${label}` : label))
          .join("\n");
        toast.error(t("uploadPartialError", { count: failed.length }), { description });
      }
      if (success > 0) {
        await loadGallery(search, typeFilter, 1, false);
      }
      loadUsage();
    } catch {
      toast.error(t("errorUpload"));
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await deleteGalleryItem(deleteId);
      setData((prev) => prev.filter((item) => item.id !== deleteId));
      setTotalCount((prev) => Math.max(0, prev - 1));
      loadUsage();
      toast.success(t("deleteSuccess"));
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  // Total count for the currently active filter comes from the server (paginated).
  // Per-tab counts cannot be known without loading every page, so we only show
  // a badge on the active tab.
  const activeTabCount = totalCount;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101";

  const usagePct = usage?.quotaBytes
    ? Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100)
    : 0;
  const quotaFull = usage?.quotaBytes != null && usage.usedBytes >= usage.quotaBytes;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
          ],
        }}
      >
        <Button disabled={uploading || quotaFull} onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />
          {uploading
            ? uploadProgress
              ? t("uploadingProgress", { done: uploadProgress.done, total: uploadProgress.total })
              : t("uploading")
            : t("uploadButton")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleUpload}
          accept=".mkv,.ofx,.cdr,.key,.ai,.eps,.csv,.rar,.kml,.psd,.txt,.xml,.jpg,.png,.pdf,.doc,.docx,.mp4,.xls,.xlsx,.jpeg,.zip,.ppt,.ogg,.mp3,.pptx,.mpeg,.pfx,.p2k,image/*"
        />
      </PageHeader>

      {/* Uso de espaço da galeria (quota por tenant) */}
      {usage && (
        <div className="rounded-lg border p-3 sm:max-w-md space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">{t("usageLabel")}</span>
            <span className={quotaFull ? "font-semibold text-destructive" : "font-medium"}>
              {usage.quotaBytes != null
                ? t("usageOf", { used: formatBytes(usage.usedBytes), quota: formatBytes(usage.quotaBytes) })
                : t("usageUnlimited", { used: formatBytes(usage.usedBytes) })}
            </span>
          </div>
          {usage.quotaBytes != null && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePct >= 100 ? "bg-destructive" : usagePct >= 90 ? "bg-warning" : "bg-primary"
                }`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
          )}
          {quotaFull && (
            <p className="text-xs text-destructive">{t("quotaFullHint")}</p>
          )}
        </div>
      )}

      {/* Search + type filter bar */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
        <div className="relative w-full sm:max-w-md sm:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="pl-9 w-full"
          />
        </div>

 {/* File type tabs — all 8 categories matching the legacy front */}
        <div className="w-full overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        <Tabs value={typeFilter} onValueChange={handleTypeFilterChange}>
          <TabsList className="h-9 w-max sm:w-auto sm:flex-wrap">
            {FILE_TYPE_TABS.map(({ value, label, Icon }) => (
              <TabsTrigger key={value} value={value} className="text-xs whitespace-nowrap shrink-0">
                {value !== "all" && <Icon className="h-3 w-3 mr-1" />}
                {label}
                {value === typeFilter && (
                  <span className="ml-1 text-[10px] opacity-70">({activeTabCount})</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={Image}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        >
          <Button disabled={uploading || quotaFull} onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> {t("uploadButton")}
          </Button>
        </EmptyState>
      ) : (
        <>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {data.map((item) => {
            const IconComp = getMediaIcon(item.type);
            const cat = resolveCategory(item.type);
            const isImage = cat === "image";
            const isVideo = cat === "video";
            const fullUrl = item.url?.startsWith("http") ? item.url : `${apiBase}/${item.url}`;
            // Preview leve: usa thumbnail webp gerado pelo backend quando disponivel.
            const previewSrc = item.thumbUrl || fullUrl;
            // #t=0.1 força o browser a buscar e exibir o frame em 0.1s — sem isso
            // alguns browsers mostram quadro preto até receberem play.
            const videoSrc = isVideo && fullUrl ? `${fullUrl}#t=0.1` : "";

            return (
              <Card key={item.id} className="group relative overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
                    {isImage && item.url ? (
                      <img
                        src={previewSrc}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : isVideo && item.url ? (
                      <video
                        src={videoSrc}
                        className="h-full w-full object-cover"
                        preload="metadata"
                        muted
                        playsInline
                      />
                    ) : (
                      <IconComp className="h-8 w-8 text-muted-foreground" />
                    )}
                    {isVideo && item.url && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="rounded-full bg-black/50 p-2">
                          <Film className="h-5 w-5 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium truncate" title={item.name}>{item.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${FILE_TYPE_BADGE_COLORS[cat]}`}
                      >
                        {FILE_TYPE_LABELS[cat]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatFileSize(item.size)} · {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setPreviewItem(item)}>
                      <Eye className="h-3 w-3 mr-1" /> {t("viewButton")}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteId(item.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6">
            {loadingMore ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 w-full">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            ) : (
              <Button variant="outline" onClick={() => loadGallery(search, typeFilter, pageNumber + 1, true)}>
                {t("loadMore")}
              </Button>
            )}
          </div>
        )}
        </>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteId != null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewItem != null} onOpenChange={() => setPreviewItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewItem?.name}</DialogTitle>
            <DialogDescription>
              {formatFileSize(previewItem?.size)} · {previewItem ? formatDate(previewItem.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>
          {previewItem && (() => {
            const cat = resolveCategory(previewItem.type);
            const src = previewItem.url?.startsWith("http")
              ? previewItem.url
              : `${apiBase}/${previewItem.url}`;
            return (
              <div className="flex items-center justify-center min-h-[300px] bg-muted rounded-lg overflow-hidden">
                {cat === "image" ? (
                  <img src={src} alt={previewItem.name} className="max-h-[500px] object-contain" />
                ) : cat === "video" ? (
                  <video src={src} controls className="max-h-[500px] w-full" />
                ) : cat === "audio" ? (
                  <div className="flex flex-col items-center gap-4 p-8 w-full">
                    <Music className="h-16 w-16 text-muted-foreground" />
                    <audio src={src} controls className="w-full" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 p-8">
                    <FileIcon className="h-16 w-16 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{previewItem.name}</p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            {previewItem?.url && (
              <Button asChild variant="outline">
                <a
                  href={
                    previewItem.url?.startsWith("http")
                      ? previewItem.url
                      : `${apiBase}/${previewItem.url}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Download className="h-4 w-4 mr-2" /> {t("downloadButton")}
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
