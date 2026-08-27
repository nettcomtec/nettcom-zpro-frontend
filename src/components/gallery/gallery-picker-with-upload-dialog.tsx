"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { FileText, Images, Loader2, Plus, Video } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchGallery, getGalleryPreviewUrl, uploadGalleryFiles, type GalleryItem } from "@/services/gallery";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

export type GalleryPickerWithUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: GalleryItem) => void;
  galleryFileType?: string; // "image" | "video" | "document" | undefined
  uploadAccept?: string;
};

/**
 * Mapeia o format de header WABA para parâmetros do dialog.
 */
export function wabaHeaderFormatToGalleryParams(format: string | undefined | null): {
  galleryFileType?: string;
  uploadAccept: string;
} {
  const f = (format || "").toUpperCase();
  if (f === "IMAGE") return { galleryFileType: "image", uploadAccept: "image/*" };
  if (f === "VIDEO") return { galleryFileType: "video", uploadAccept: "video/*" };
  if (f === "DOCUMENT") {
    // PDFs sao classificados como fileType "pdf" na galeria (categoria separada
    // de "document"); o header DOCUMENT do WhatsApp aceita PDF, entao liberamos
    // ambos os tipos no filtro ("document,pdf" => Op.in no backend).
    return {
      galleryFileType: "document,pdf",
      uploadAccept:
        ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }
  return {
    uploadAccept: "image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx",
  };
}

export function GalleryPickerWithUploadDialog({
  open,
  onOpenChange,
  onPick,
  galleryFileType,
  uploadAccept = "image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx",
}: GalleryPickerWithUploadDialogProps) {
  const t = useTranslations("atendimentoChat");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Busca SEMPRE a 1a pagina no servidor (com fileType + busca por nome/descricao),
  // garantindo que a galeria inteira seja alcancavel (paginada), nao so os 20 mais recentes.
  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchGallery({
        pageNumber: 1,
        fileType: galleryFileType,
        searchParam: search || undefined,
      });
      setItems(res.data);
      setHasMore(res.hasMore);
      setPage(1);
    } catch {
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [galleryFileType, search]);

  // Reset da busca ao (re)abrir.
  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  // Fetch da pagina 1 na abertura e a cada mudanca de busca/tipo (debounce server-side).
  useEffect(() => {
    if (!open) return;
    const delay = search ? 300 : 0;
    const tid = setTimeout(() => { loadFirstPage(); }, delay);
    return () => clearTimeout(tid);
  }, [open, search, loadFirstPage]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetchGallery({
        pageNumber: nextPage,
        fileType: galleryFileType,
        searchParam: search || undefined,
      });
      setItems((prev) => [...prev, ...res.data]);
      setHasMore(res.hasMore);
      setPage(nextPage);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const oversized = files.find((f) => f.size > MAX_UPLOAD_SIZE);
    if (oversized) {
      toast.error(t("galleryFileTooLarge") || "Arquivo muito grande");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      await uploadGalleryFiles(files);
      toast.success(t("galleryUploadSuccess") || "Upload concluído");
      await loadFirstPage();
    } catch {
      toast.error(t("galleryUploadError") || "Erro no upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="h-4 w-4" /> {t("galleryPickerTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex gap-2 shrink-0">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("gallerySearchPlaceholder")}
              className="h-8 text-sm"
            />
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={uploadAccept}
              onChange={onFileChange}
              className="hidden"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
              {t("galleryUploadBtn") || "Enviar"}
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("galleryLoadingText")}</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("galleryNoFiles")}</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      // Fecha no proximo frame (rAF) em vez de sincronamente no clique.
                      // Em touch, o DismissableLayer do Radix adia a deteccao de "clique-fora"
                      // para o evento click; se a galeria (Dialog filho) desmontar sincronamente
                      // nesse mesmo clique, o Dialog PAI vira a camada do topo e e fechado junto.
                      // Adiar mantem a galeria montada quando o check roda, protegendo o pai.
                      onClick={() => { requestAnimationFrame(() => { onPick(item); onOpenChange(false); }); }}
                      className="group relative rounded-lg border overflow-hidden hover:border-primary transition-colors bg-muted"
                      title={item.name}
                    >
                      {item.type.startsWith("image/") ? (
                        <img src={getGalleryPreviewUrl(item)} alt={item.name} loading="lazy" decoding="async" className="w-full h-20 object-cover" />
                      ) : item.type.startsWith("video/") ? (
                        <div className="w-full h-20 flex flex-col items-center justify-center gap-1">
                          <Video className="h-6 w-6 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground px-1 truncate w-full text-center">{item.name}</span>
                        </div>
                      ) : (
                        <div className="w-full h-20 flex flex-col items-center justify-center gap-1">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground px-1 truncate w-full text-center">{item.name}</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {hasMore && (
                  <div className="flex justify-center pt-3 pb-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                      {t("loadMore")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
