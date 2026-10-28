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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  fetchGallery, getGalleryPreviewUrl, isGalleryFolderMissingError, uploadGalleryFiles,
  type GalleryFolderFilterValue, type GalleryItem, type UploadFailureCode,
} from "@/services/gallery";
import { useGalleryFolders } from "@/hooks/use-gallery-folders";
import { GalleryFolderFilter } from "@/components/gallery/gallery-folder-filter";
import { openPickedFileFallback, preparePickedFiles } from "@/lib/picked-file";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

/** Filtros com que a lista na tela foi carregada (o "Carregar mais" continua a MESMA lista). */
type GalleryListParams = Omit<NonNullable<Parameters<typeof fetchGallery>[0]>, "pageNumber">;

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
  const tGal = useTranslations("galeriaPage");
  // Aviso de arquivo ilegível (mesmas chaves do campo de mensagem).
  const tPick = useTranslations("messageInput");
  // Arquivo que o aparelho não deixou ler: aviso DENTRO do diálogo (modal).
  const [pickUnreadable, setPickUnreadable] = useState(false);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Pastas (PLANO_GALERIA_PASTAS): "all" = todos, "none" = sem pasta, número = a pasta.
  const [folderFilter, setFolderFilter] = useState<GalleryFolderFilterValue>("all");
  // Valor atual para quem termina depois de um await (upload).
  const folderFilterRef = useRef(folderFilter);
  folderFilterRef.current = folderFilter;
  // Só busca as pastas com o seletor aberto (ele fica montado fechado no header e no
  // atendimento); a contagem segue o mesmo filtro de tipo da lista (D17).
  const folders = useGalleryFolders({ enabled: open, fileType: galleryFileType });
  const { refresh: refreshFolders } = folders;
  // Geração da lista: toda página 1 cria uma nova, e a resposta (página 1 ou "Carregar mais")
  // de busca/pasta/tipo anterior é descartada — nunca substitui nem é anexada à lista atual
  // (o atendente poderia escolher o arquivo de outra pasta).
  const requestIdRef = useRef(0);
  // Filtros da página 1 que está na tela: durante o debounce da busca o campo já tem o texto
  // novo, e o "Carregar mais" não pode trazer a página 2 de outra busca para esta lista.
  const listParamsRef = useRef<GalleryListParams | null>(null);

  // Troca de pasta: invalida na hora a resposta em voo da pasta anterior e esconde a lista
  // antiga até a página 1 da nova chegar (o efeito de busca refaz a página 1).
  const changeFolderFilter = (value: GalleryFolderFilterValue) => {
    if (value === folderFilter) return;
    requestIdRef.current++;
    setLoadingMore(false);
    setLoading(true);
    setFolderFilter(value);
  };

  // Ações com o estado MAIS RECENTE para as respostas assíncronas (página 1, "Carregar mais",
  // upload): a pasta/busca pode mudar enquanto a requisição está no ar. Por ref para não entrar
  // nas dependências do loadFirstPage (atualizada pelo efeito logo depois dele).
  const latestRef = useRef<{ onFolderMissing: () => void; reloadAfterUpload: () => Promise<void> }>({
    onFolderMissing: () => undefined,
    reloadAfterUpload: async () => undefined,
  });

  // Busca SEMPRE a 1a pagina no servidor (com fileType + busca por nome/descricao),
  // garantindo que a galeria inteira seja alcancavel (paginada), nao so os 20 mais recentes.
  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadingMore(false);
    // A pasta só vai na requisição fora de "Todos" (backend sem pastas nunca a recebe).
    const params: GalleryListParams = {
      fileType: galleryFileType,
      searchParam: search || undefined,
      ...(folderFilter !== "all" ? { folderId: folderFilter } : {}),
    };
    try {
      const res = await fetchGallery({ pageNumber: 1, ...params });
      if (requestId !== requestIdRef.current) return;
      listParamsRef.current = params;
      setItems(res.data);
      setHasMore(res.hasMore);
      setPage(1);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      listParamsRef.current = null;
      setItems([]);
      setHasMore(false);
      if (isGalleryFolderMissingError(err)) latestRef.current.onFolderMissing();
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [galleryFileType, search, folderFilter]);

  useEffect(() => {
    latestRef.current = {
      // Pasta excluída por outro usuário/aba (filtro ou upload): avisa, recarrega as pastas e
      // volta para "Todos". Com o seletor fechado, as pastas são recarregadas ao reabrir.
      onFolderMissing: () => {
        toast.warning(tGal("folderMissing"));
        if (open) void refreshFolders();
        changeFolderFilter("all");
      },
      // Depois de um upload: a contagem das pastas mudou e a lista atual ganha os arquivos.
      reloadAfterUpload: async () => {
        if (open) void refreshFolders();
        await loadFirstPage();
      },
    };
  });

  // Reset da busca e da pasta ao (re)abrir.
  useEffect(() => {
    if (open) {
      setSearch("");
      setFolderFilter("all");
      setPickUnreadable(false);
    }
  }, [open]);

  // As pastas sumiram (backend sem pastas ou falha ao carregar): o filtro não pode ficar preso
  // numa pasta que não aparece mais na tela.
  useEffect(() => {
    if (!folders.loading && !folders.available && folderFilter !== "all") setFolderFilter("all");
  }, [folders.loading, folders.available, folderFilter]);

  // Fetch da pagina 1 na abertura e a cada mudanca de busca/tipo/pasta (debounce server-side).
  useEffect(() => {
    if (!open) return;
    const delay = search ? 300 : 0;
    const tid = setTimeout(() => { loadFirstPage(); }, delay);
    return () => clearTimeout(tid);
  }, [open, search, loadFirstPage]);

  const loadMore = async () => {
    const params = listParamsRef.current;
    if (loadingMore || !hasMore || !params) return;
    // Mesma geração da página 1 que está na tela: se a busca/pasta mudar no meio, a resposta
    // é descartada (nunca anexa a página 2 de outra pasta à lista atual).
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetchGallery({ pageNumber: nextPage, ...params });
      if (requestId !== requestIdRef.current) return;
      setItems((prev) => [...prev, ...res.data]);
      setHasMore(res.hasMore);
      setPage(nextPage);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (isGalleryFolderMissingError(err)) latestRef.current.onFolderMissing();
    } finally {
      if (requestId === requestIdRef.current) setLoadingMore(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    const oversized = picked.find((f) => f.size > MAX_UPLOAD_SIZE);
    if (oversized) {
      toast.error(t("galleryFileTooLarge") || "Arquivo muito grande");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    setPickUnreadable(false);
    try {
      // Android: imagem/vídeo do seletor de mídia pode chegar ilegível (vide lib/picked-file);
      // o ilegível fica de fora e o aviso aparece no diálogo.
      const { ready: files, unreadable } = await preparePickedFiles(picked, undefined, { preparingMessage: tPick("pickedFilePreparing") });
      if (unreadable > 0) setPickUnreadable(true);
      if (files.length === 0) return;
      // Pasta selecionada = destino do upload; em "Todos" e "Sem pasta" o arquivo fica sem pasta.
      const targetFolderId = typeof folderFilter === "number" ? folderFilter : null;
      // uploadGalleryFiles não lança por arquivo: devolve quem subiu e quem falhou (com o
      // motivo). Antes o retorno era ignorado e o toast de sucesso saía mesmo com tudo recusado.
      const { success, failed } = await uploadGalleryFiles(files, undefined, { folderId: targetFolderId });
      if (success > 0) toast.success(t("galleryUploadSuccess") || "Upload concluído");
      // A pasta de destino foi excluída no meio (o lote para no 1º recusado).
      const folderMissing = failed.some((f) => f.code === "folder_missing");
      if (failed.length > 0) {
        const reasonLabel = (code: UploadFailureCode) => {
          switch (code) {
            case "too_large":    return tGal("uploadReasonTooLarge");
            case "unsupported":  return tGal("uploadReasonUnsupported");
            case "unauthorized": return tGal("uploadReasonUnauthorized");
            case "quota":        return tGal("uploadReasonQuota");
            case "server_error": return tGal("uploadReasonServerError");
            case "timeout":      return tGal("uploadReasonTimeout");
            case "network":      return tGal("uploadReasonNetwork");
            case "folder_missing": return tGal("uploadReasonFolderMissing");
            default:             return tGal("uploadReasonUnknown");
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
        toast.error(tGal("uploadPartialError", { count: failed.length }), { description });
      }
      if (folderMissing) {
        // Recarrega as pastas e volta para "Todos" (que refaz a página 1). Se o filtro já estava
        // em "Todos" (trocado durante o envio), nada refaz a página 1: os arquivos salvos antes
        // da exclusão (agora sem pasta) são lidos aqui.
        const alreadyAll = folderFilterRef.current === "all";
        latestRef.current.onFolderMissing();
        if (alreadyAll && success > 0) await latestRef.current.reloadAfterUpload();
      } else if (success > 0) {
        // Pelo ref: a pasta/busca pode ter mudado durante o upload.
        await latestRef.current.reloadAfterUpload();
      }
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
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                {/* Com pastas: explica para onde vai o arquivo enviado. */}
                {folders.available && (
                  <TooltipContent side="bottom" className="max-w-[260px]">
                    {tGal("uploadToFolderHint")}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>

          {pickUnreadable && (
            <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
              <span className="min-w-0 flex-1">{tPick("pickedFileUnreadable")}</span>
              <Button type="button" variant="outline" size="sm" className="h-7 shrink-0" disabled={uploading} onClick={() => openPickedFileFallback(fileRef.current)}>
                {tPick("pickedFileOpenFiles")}
              </Button>
            </div>
          )}

          <GalleryFolderFilter
            orientation="horizontal"
            value={folderFilter}
            onChange={changeFolderFilter}
            available={folders.available}
            folders={folders.folders}
            unfiledCount={folders.unfiledCount}
            totalCount={folders.totalCount}
            className="shrink-0"
          />

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
