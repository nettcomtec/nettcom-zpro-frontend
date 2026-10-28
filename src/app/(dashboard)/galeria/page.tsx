"use client";

import { formatDate as formatDateIntl } from "@/lib/format";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/layout/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Image, Upload, Search, FileIcon, Trash2, Film, FileText,
  Download, Eye, Music, Archive, File, Folder, FolderInput, ListChecks, MoreVertical, X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  fetchGallery, fetchGalleryUsage, uploadGalleryFiles, deleteGalleryItem, isGalleryFolderMissingError,
  type GalleryItem, type GalleryUsage, type GalleryFolder, type GalleryFolderFilterValue,
} from "@/services/gallery";
import { usePageAccess } from "@/hooks/use-page-access";
import { useGalleryFolders } from "@/hooks/use-gallery-folders";
import { AccessDenied } from "@/components/layout/access-denied";
import { GalleryFolderFilter } from "@/components/gallery/gallery-folder-filter";
import { DeleteFolderDialog, FolderNameDialog, MoveToDialog } from "@/components/gallery/gallery-folder-dialogs";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { isNativeApp } from "@/lib/native";
import { cn } from "@/lib/utils";

// All file type categories matching the legacy backend slugs
type MediaFilter = "all" | "image" | "video" | "audio" | "pdf" | "document" | "archive" | "other";

/** Exclusão em lote (D16): quantos pedidos ao mesmo tempo. */
const BULK_DELETE_CONCURRENCY = 3;

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

/** Status HTTP do erro nos dois formatos que chegam do interceptor (response na raiz ou AxiosError). */
function getErrorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null | undefined;
  return e?.status ?? e?.response?.status;
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
  // O gate fica numa casca própria (regra dos hooks): o acesso pode mudar no meio da sessão
  // (o refresh de 30 s relê as permissões) e os hooks da tela não podem rodar pela metade.
  const allowed = usePageAccess("galeria", { allowIfNotSet: true });
  if (!allowed) return <AccessDenied />;
  return <GaleriaContent />;
}

function GaleriaContent() {
  const t = useTranslations("galeriaPage");
  // Enviar, Nova pasta, Selecionar, Mover e Excluir: mesma regra do backend
  // (requirePermission("gallery_manage") só restringe o perfil personalizado).
  const canManage = useAuthStore((s) => s.hasPermission("gallery_manage"));
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

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
  // O campo de busca e o termo aplicado são estados separados: o termo só muda 300 ms
  // depois da última tecla (antes era 1 pedido por tecla).
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState<MediaFilter>("all");
  // D8: abre em "Todos os arquivos", como antes das pastas.
  const [folderFilter, setFolderFilter] = useState<GalleryFolderFilterValue>("all");
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [deleteId, setDeleteId]     = useState<number | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null);
  const [usage, setUsage] = useState<GalleryUsage | null>(null);

  // Diálogos de pasta: o "open" é separado do conteúdo para o texto não trocar na animação de saída.
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameDialogMode, setNameDialogMode] = useState<"create" | "rename">("create");
  const [nameDialogFolder, setNameDialogFolder] = useState<GalleryFolder | null>(null);
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<GalleryFolder | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveState, setMoveState] = useState<{
    ids: number[];
    currentFolderId?: number | null;
    fromSelection: boolean;
  }>({ ids: [], fromSelection: false });

  // Modo de seleção (D16): "Mover (N)" e "Excluir (N)".
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef  = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  // D17: a contagem das pastas segue a aba de tipo (o mesmo valor mandado ao /gallery).
  const typeParam = typeFilter !== "all" ? typeFilter : undefined;
  const folders = useGalleryFolders({ enabled: true, fileType: typeParam });
  const foldersOn = folders.available;
  const selectionActive = selecting && canManage;
  const selectedCount = selectedIds.size;

  // Valores ATUAIS para os handlers assíncronos (upload, lote, diálogos): eles terminam depois
  // de o usuário talvez ter trocado de aba/pasta, e recarregar com o valor da hora do clique
  // mostraria a lista errada.
  const filtersRef = useRef({ search, typeFilter, folderFilter });
  filtersRef.current = { search, typeFilter, folderFilter };
  const foldersRefreshRef = useRef(folders.refresh);
  foldersRefreshRef.current = folders.refresh;

  /** Pasta excluída em outra aba/por outro usuário (ou instalação sem pastas): aviso, pastas recarregadas e volta a "Todos". */
  const handleFolderMissing = (showToast = true, refreshFolders = true) => {
    // id fixo: dois avisos do mesmo episódio (grade + lista de pastas) viram um só.
    if (showToast) toast.error(t("folderMissing"), { id: "gallery-folder-missing" });
    if (refreshFolders) void foldersRefreshRef.current();
    setFolderFilter("all");
  };
  const folderMissingRef = useRef(handleFolderMissing);
  folderMissingRef.current = handleFolderMissing;

  // Load gallery from API, passing fileType, searchParam and folderId as query params
  const loadGallery = useCallback(async (
    searchVal: string,
    typeVal: MediaFilter,
    folderVal: GalleryFolderFilterValue,
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
        // Só vai quando não é "Todos": backend sem pastas nunca recebe o parâmetro.
        folderId:    folderVal !== "all" ? folderVal : undefined,
      });
      if (reqId !== requestIdRef.current) return;
      setData((prev) => (append ? [...prev, ...result.data] : result.data));
      setHasMore(result.hasMore);
      setTotalCount(result.count);
      setPageNumber(page);
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      if (folderVal !== "all" && isGalleryFolderMissingError(err)) folderMissingRef.current();
      else toast.error(t("errorLoad"));
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [t]);

  const reloadFirstPage = useCallback(() => {
    const f = filtersRef.current;
    return loadGallery(f.search, f.typeFilter, f.folderFilter, 1, false);
  }, [loadGallery]);

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

  // Busca com espera de 300 ms depois da última tecla.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return;
    const timer = window.setTimeout(() => setSearch(next), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  // Re-fetch whenever search, type or folder filter changes (reset to page 1); a seleção é limpa.
  useEffect(() => {
    setSelectedIds((prev) => (prev.size ? new Set() : prev));
    loadGallery(search, typeFilter, folderFilter, 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, folderFilter]);

  // A pasta selecionada sumiu da lista (excluída em outra aba/por outro usuário): volta a "Todos".
  // Pastas indisponíveis depois de uma leitura (a barra de pastas some): volta a "Todos" sem aviso,
  // senão a grade ficaria presa num filtro que não aparece mais na tela.
  useEffect(() => {
    if (folders.loading || folderFilter === "all") return;
    if (!folders.available) {
      setFolderFilter("all");
      return;
    }
    if (typeof folderFilter !== "number") return;
    if (folders.folders.some((folder) => folder.id === folderFilter)) return;
    // A lista acabou de chegar: não precisa reler as pastas.
    folderMissingRef.current(true, false);
  }, [folders.available, folders.loading, folders.folders, folderFilter]);

  // Infinite scroll: observe sentinel and load next page when it enters the viewport
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadGallery(search, typeFilter, folderFilter, pageNumber + 1, true);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, pageNumber, search, typeFilter, folderFilter, loadGallery]);

  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value as MediaFilter);
  };

  // Enter aplica na hora (sem esperar os 300 ms); com o mesmo termo, recarrega.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const next = searchInput.trim();
    if (next === search) void reloadFirstPage();
    else setSearch(next);
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
    // Com uma pasta selecionada os arquivos entram nela; em "Todos" e "Sem pasta" ficam sem pasta.
    const targetFolderId = folders.available && typeof folderFilter === "number" ? folderFilter : null;
    setUploading(true);
    setUploadProgress({ done: 0, total: fileArr.length });
    try {
      const { success, failed } = await uploadGalleryFiles(fileArr, (p) => {
        setUploadProgress({ done: p.index, total: p.total });
      }, { folderId: targetFolderId });
      if (success > 0) toast.success(t("uploadSuccess", { count: success }));
      if (failed.length > 0) {
        const reasonLabel = (code: string) => {
          switch (code) {
            case "too_large":      return t("uploadReasonTooLarge");
            case "unsupported":    return t("uploadReasonUnsupported");
            case "unauthorized":   return t("uploadReasonUnauthorized");
            case "quota":          return t("uploadReasonQuota");
            case "server_error":   return t("uploadReasonServerError");
            case "timeout":        return t("uploadReasonTimeout");
            case "network":        return t("uploadReasonNetwork");
            case "folder_missing": return t("uploadReasonFolderMissing");
            default:               return t("uploadReasonUnknown");
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
      if (failed.some((f) => f.code === "folder_missing")) {
        // A pasta de destino foi excluída no meio do lote: o serviço já parou no 1º arquivo
        // recusado. A volta a "Todos" recarrega a grade; se já estava em "Todos", recarrega aqui.
        const filterWillChange = filtersRef.current.folderFilter !== "all";
        folderMissingRef.current();
        if (success > 0 && !filterWillChange) await reloadFirstPage();
      } else {
        if (success > 0) await reloadFirstPage();
        void foldersRefreshRef.current();
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
      void foldersRefreshRef.current();
      toast.success(t("deleteSuccess"));
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  // ─── Seleção ──────────────────────────────────────────────────────────────

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelection = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    setBulkProgress({ done: 0, total: ids.length });
    const deleted = new Set<number>();
    const failedIds = new Set<number>();
    let next = 0;
    let done = 0;
    let stopped = false;
    // 3 pedidos em paralelo; 401/403 para o lote (sessão vencida ou sem permissão: os
    // próximos falhariam igual).
    const worker = async () => {
      while (!stopped && next < ids.length) {
        const id = ids[next++];
        try {
          await deleteGalleryItem(id);
          deleted.add(id);
        } catch (err) {
          failedIds.add(id);
          const status = getErrorStatus(err);
          if (status === 401 || status === 403) stopped = true;
        }
        done += 1;
        setBulkProgress({ done, total: ids.length });
      }
    };
    try {
      await Promise.all(
        Array.from({ length: Math.min(BULK_DELETE_CONCURRENCY, ids.length) }, () => worker()),
      );
    } finally {
      const ok = deleted.size;
      // Não tentados (lote parado) contam como falha.
      const fail = ids.length - ok;
      const summary = t("deleteSelectedResult", { ok, fail });
      if (fail === 0) toast.success(summary);
      else toast.error(summary);
      // Os que falharam continuam selecionados, para tentar de novo.
      const remaining = new Set(ids.filter((id) => !deleted.has(id)));
      setSelectedIds(remaining);
      if (remaining.size === 0) setSelecting(false);
      setBulkDeleting(false);
      setBulkProgress(null);
      setBulkDeleteOpen(false);
      if (ok > 0) {
        // No fim, 1 leitura de cada: pastas (contagem), grade e cota.
        void foldersRefreshRef.current();
        void reloadFirstPage();
        loadUsage();
      }
    }
  };

  // ─── Mover ────────────────────────────────────────────────────────────────

  const openMoveForItem = (item: GalleryItem) => {
    setMoveState({ ids: [item.id], currentFolderId: item.folderId ?? null, fromSelection: false });
    setMoveOpen(true);
  };

  const openMoveForSelection = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    // Pasta comum a todos (para desabilitar o destino que não muda nada); mistura = nenhuma.
    const byId = new Map(data.map((item) => [item.id, item] as const));
    const current = ids.map((id) => {
      const item = byId.get(id);
      return item ? item.folderId ?? null : undefined;
    });
    const first = current[0];
    const same = first !== undefined && current.every((f) => f === first);
    setMoveState({ ids, currentFolderId: same ? first : undefined, fromSelection: true });
    setMoveOpen(true);
  };

  const handleMoved = ({ moved, folderId, ids }: { moved: number; folderId: number | null; ids: number[] }) => {
    const movedSet = new Set(ids);
    const current = filtersRef.current.folderFilter;
    const staysInView =
      current === "all" || current === folderId || (current === "none" && folderId === null);
    // Continua na visão atual: só troca a pasta no cartão (a rolagem não se perde).
    // Saiu da visão atual, ou nem todos foram movidos (excluídos por outra pessoa no meio):
    // recarrega a 1ª página, nunca etiqueta um cartão que não mudou.
    if (staysInView && moved === ids.length) {
      setData((prev) => prev.map((item) => (movedSet.has(item.id) ? { ...item, folderId } : item)));
    } else {
      void reloadFirstPage();
    }
    if (moveState.fromSelection) exitSelection();
    void foldersRefreshRef.current();
  };

  const handleMoveFailed = () => {
    // Num lote grande parte pode ter sido movida antes da falha: relê a grade e a contagem.
    void reloadFirstPage();
    void foldersRefreshRef.current();
  };

  // ─── Pastas ───────────────────────────────────────────────────────────────

  const openCreateFolder = () => {
    setNameDialogMode("create");
    setNameDialogFolder(null);
    setNameDialogOpen(true);
  };

  const openRenameFolder = (folder: GalleryFolder) => {
    setNameDialogMode("rename");
    setNameDialogFolder(folder);
    setNameDialogOpen(true);
  };

  const openDeleteFolder = (folder: GalleryFolder) => {
    setDeleteFolderTarget(folder);
    setDeleteFolderOpen(true);
  };

  const handleFolderDeleted = (folder: GalleryFolder) => {
    const current = filtersRef.current.folderFilter;
    if (current === folder.id) {
      setFolderFilter("all");
    } else if (current === "none") {
      // Os arquivos da pasta excluída entram em "Sem pasta".
      void reloadFirstPage();
    } else if (current === "all") {
      setData((prev) => prev.map((item) => (item.folderId === folder.id ? { ...item, folderId: null } : item)));
    }
    void foldersRefreshRef.current();
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

  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
      // Só com pastas disponíveis (backend antigo ou sem a migration não tem pastas).
      ...(foldersOn
        ? [
            {
              title: t("helpS2T"),
              // A regra do destino do envio também aqui: o tooltip do Enviar não abre no toque.
              items: [t("helpS2I0"), t("uploadToFolderHint"), t("helpS2I1"), t("helpS2I2")],
            },
          ]
        : []),
    ],
  };

  const folderFilterProps = {
    value: folderFilter,
    onChange: (value: GalleryFolderFilterValue) => setFolderFilter(value),
    available: foldersOn,
    folders: folders.folders,
    unfiledCount: folders.unfiledCount,
    totalCount: folders.totalCount,
    canManage,
    onCreateFolder: openCreateFolder,
    onRenameFolder: openRenameFolder,
    onDeleteFolder: openDeleteFolder,
  };

  // Com a barra de pastas ao lado a grade fica mais estreita no computador: menos colunas.
  const gridClassName = foldersOn
    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
    : "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4";

  const openFilePicker = () => fileInputRef.current?.click();

  const uploadButton = (
    <Button disabled={uploading || quotaFull} onClick={openFilePicker}>
      <Upload className="mr-2 h-4 w-4" />
      {uploading
        ? uploadProgress
          ? t("uploadingProgress", { done: uploadProgress.done, total: uploadProgress.total })
          : t("uploading")
        : t("uploadButton")}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={pageHelp}
      >
        {/* P-A: Selecionar e Enviar só para quem gerencia a galeria (sem os dois, nada aqui). */}
        {canManage && (
          <>
            <Button
              variant={selectionActive ? "secondary" : "outline"}
              disabled={!selectionActive && data.length === 0}
              onClick={() => (selectionActive ? exitSelection() : setSelecting(true))}
            >
              {selectionActive ? <X className="mr-2 h-4 w-4" /> : <ListChecks className="mr-2 h-4 w-4" />}
              {selectionActive ? t("cancelSelection") : t("select")}
            </Button>
            {foldersOn ? (
              <Tooltip>
                <TooltipTrigger asChild>{uploadButton}</TooltipTrigger>
                <TooltipContent className="max-w-[260px]">{t("uploadToFolderHint")}</TooltipContent>
              </Tooltip>
            ) : uploadButton}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
              accept=".mkv,.ofx,.cdr,.key,.ai,.eps,.csv,.rar,.kml,.psd,.txt,.xml,.jpg,.png,.pdf,.doc,.docx,.mp4,.xls,.xlsx,.jpeg,.zip,.ppt,.ogg,.mp3,.pptx,.mpeg,.pfx,.p2k,image/*"
            />
          </>
        )}
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

      {/* Pastas: barra lateral no computador, chips acima da busca no celular/tablet. */}
      <div className={cn(foldersOn && "lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-6")}>
        {foldersOn && (
          <aside className="hidden lg:block lg:sticky lg:top-0 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
            <GalleryFolderFilter orientation="vertical" {...folderFilterProps} />
          </aside>
        )}

        <div className="min-w-0 space-y-4">
          {foldersOn && (
            <GalleryFolderFilter orientation="horizontal" className="lg:hidden" {...folderFilterProps} />
          )}

          {/* Search + type filter bar */}
          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md sm:flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                // 16 px no celular: abaixo disso o iOS dá zoom ao focar o campo.
                className="pl-9 w-full text-base md:text-sm"
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
              <div className={gridClassName}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            </div>
          ) : data.length === 0 ? (
            <EmptyState
              icon={Image}
              title={t("emptyTitle")}
              description={canManage ? t("emptyDescription") : undefined}
            >
              {canManage && (
                <Button disabled={uploading || quotaFull} onClick={openFilePicker}>
                  <Upload className="mr-2 h-4 w-4" /> {t("uploadButton")}
                </Button>
              )}
            </EmptyState>
          ) : (
            <>
            <div className={gridClassName}>
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
                const isSelected = selectionActive && selectedIds.has(item.id);
                // D15: nome da pasta no cartão só em "Todos os arquivos" (vem da lista de pastas).
                const folderName =
                  folderFilter === "all" && item.folderId != null ? folders.nameById[item.folderId] : undefined;

                return (
                  <Card
                    key={item.id}
                    className={cn(
                      "group relative overflow-hidden",
                      selectionActive && "cursor-pointer select-none",
                      isSelected && "ring-2 ring-primary",
                    )}
                    onClick={selectionActive ? () => toggleSelected(item.id) : undefined}
                  >
                    <CardContent className="p-0">
                      {/* Clique na miniatura abre a prévia; no modo de seleção, marca o cartão. */}
                      <button
                        type="button"
                        className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                        onClick={selectionActive ? undefined : () => setPreviewItem(item)}
                        aria-label={item.name}
                        title={item.name}
                      >
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
                      </button>
                      <div className="p-2">
                        <p className="text-xs font-medium truncate" title={item.name}>{item.name}</p>
                        <div className="flex min-w-0 items-center gap-1 mt-1">
                          <span
                            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${FILE_TYPE_BADGE_COLORS[cat]}`}
                          >
                            {FILE_TYPE_LABELS[cat]}
                          </span>
                          {folderName && (
                            <span
                              className="inline-flex min-w-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              title={folderName}
                            >
                              <Folder className="h-2.5 w-2.5 shrink-0" aria-hidden />
                              <span className="truncate">{folderName}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatFileSize(item.size)} · {formatDate(item.createdAt)}
                        </p>
                      </div>
                      {selectionActive ? (
                        <div
                          className="absolute left-2 top-2 z-10 rounded-sm bg-background/90 p-0.5 shadow-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelected(item.id)}
                            aria-label={item.name}
                            className="h-5 w-5"
                          />
                        </div>
                      ) : (
                        // P-A: o menu fica visível no toque (sem hover) e no hover/foco com mouse.
                        <div className="absolute right-1.5 top-1.5 z-10">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="secondary"
                                aria-label={item.name}
                                className="bg-background/90 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                              >
                                <MoreVertical />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[10rem]">
                              <DropdownMenuItem onSelect={() => setPreviewItem(item)}>
                                <Eye /> {t("viewButton")}
                              </DropdownMenuItem>
                              {canManage && foldersOn && (
                                <DropdownMenuItem onSelect={() => openMoveForItem(item)}>
                                  <FolderInput /> {t("moveTo")}
                                </DropdownMenuItem>
                              )}
                              {canManage && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => setDeleteId(item.id)}
                                  >
                                    <Trash2 /> {t("delete")}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {hasMore && (
              <div ref={sentinelRef} className="flex items-center justify-center py-6">
                {loadingMore ? (
                  <div className={cn(gridClassName, "w-full")}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-square rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => loadGallery(search, typeFilter, folderFilter, pageNumber + 1, true)}>
                    {t("loadMore")}
                  </Button>
                )}
              </div>
            )}
            </>
          )}

          {/* Espaço para a barra de seleção fixa não cobrir a última linha de cartões. */}
          {selectionActive && <div aria-hidden className="h-20" />}
        </div>
      </div>

      {/* Barra de seleção (D16): fixa no rodapé, ao lado do menu lateral (nunca por cima dele). */}
      {selectionActive && (
        <div
          role="toolbar"
          aria-label={t("selectedCount", { count: selectedCount })}
          className={cn(
            "fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur supports-[backdrop-filter]:bg-card/85",
            sidebarCollapsed ? "md:left-[68px]" : "md:left-64",
          )}
        >
          <div className="flex flex-wrap items-center gap-2 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:px-6">
            <span className="mr-auto text-sm font-medium tabular-nums">
              {t("selectedCount", { count: selectedCount })}
            </span>
            {foldersOn && (
              <Button
                size="sm"
                variant="outline"
                disabled={selectedCount === 0 || bulkDeleting}
                onClick={openMoveForSelection}
              >
                <FolderInput className="h-4 w-4" />
                {t("moveSelected", { count: selectedCount })}
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              disabled={selectedCount === 0 || bulkDeleting}
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              {t("deleteSelected", { count: selectedCount })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkDeleting}
              onClick={exitSelection}
              aria-label={t("cancelSelection")}
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">{t("cancelSelection")}</span>
            </Button>
          </div>
        </div>
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

      {/* Excluir em lote (D16): confirmação com a quantidade e progresso N/M. */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!bulkDeleting) setBulkDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteSelectedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteSelectedConfirm", { count: selectedCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkProgress && (
            <div className="space-y-1.5" aria-live="polite">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-destructive transition-all"
                  style={{ width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("deleteProgress", { done: bulkProgress.done, total: bulkProgress.total })}
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>{t("cancel")}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              loading={bulkDeleting}
              disabled={selectedCount === 0}
              onClick={handleBulkDelete}
            >
              {bulkDeleting && bulkProgress
                ? t("deleteProgress", { done: bulkProgress.done, total: bulkProgress.total })
                : t("deleteSelected", { count: selectedCount })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            {/* D18: no app o link de download não baixa (WebView); fica só no navegador. */}
            {previewItem?.url && !isNativeApp() && (
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

      {/* Pastas: criar/renomear, excluir e mover. */}
      <FolderNameDialog
        open={nameDialogOpen}
        onOpenChange={setNameDialogOpen}
        mode={nameDialogMode}
        folder={nameDialogFolder}
        onSaved={() => void foldersRefreshRef.current()}
        onFolderMissing={() => handleFolderMissing(false)}
      />
      <DeleteFolderDialog
        open={deleteFolderOpen}
        onOpenChange={setDeleteFolderOpen}
        folder={deleteFolderTarget}
        countIsTotal={typeFilter === "all"}
        onDeleted={handleFolderDeleted}
        onFolderMissing={() => handleFolderMissing(false)}
      />
      <MoveToDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        itemIds={moveState.ids}
        folders={folders.folders}
        currentFolderId={moveState.currentFolderId}
        onMoved={handleMoved}
        onFolderMissing={() => handleFolderMissing(false)}
        onFailed={handleMoveFailed}
      />
    </div>
    </TooltipProvider>
  );
}
