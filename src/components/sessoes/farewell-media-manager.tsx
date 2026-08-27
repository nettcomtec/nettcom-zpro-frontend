"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, FileText, Images, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GalleryPickerWithUploadDialog } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { uploadGalleryFile, type GalleryItem } from "@/services/gallery";

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|3gp|mov|webm|mkv|avi)(\?.*)?$/i;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const UPLOAD_ACCEPT = "image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

function fileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.substring(pathname.lastIndexOf("/") + 1)) || url;
  } catch {
    return url;
  }
}

type Props = {
  urls: string[] | undefined | null;
  onChange: (urls: string[]) => void;
};

export function FarewellMediaManager({ urls, onChange }: Props) {
  const t = useTranslations("sessoesPage");
  const tChat = useTranslations("atendimentoChat");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = Array.isArray(urls) ? urls : [];

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(list.filter((_, i) => i !== index));
  };

  // Upload do computador: sobe para a galeria e adiciona a URL retornada à lista
  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (files.some(f => f.size > MAX_UPLOAD_SIZE)) {
      toast.error(tChat("galleryFileTooLarge"));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const added: string[] = [];
      for (const file of files) {
        const res = await uploadGalleryFile(file);
        const g = res?.data?.galleries?.[0];
        const url = g?.mediaUrl || g?.url || "";
        if (url) added.push(url);
      }
      if (added.length) {
        onChange([...list, ...added]);
        toast.success(tChat("galleryUploadSuccess"));
      } else {
        toast.error(tChat("galleryUploadError"));
      }
    } catch {
      toast.error(tChat("galleryUploadError"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="text-sm font-medium">{t("farewellMediaTitle")}</div>
      <p className="text-xs text-muted-foreground">{t("farewellMediaHint")}</p>
      {list.length > 0 && (
        <ul className="min-w-0 space-y-1.5">
          {list.map((url, index) => {
            const name = fileNameFromUrl(url);
            return (
              <li
                key={`${url}-${index}`}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 overflow-hidden rounded-md border bg-card px-2 py-1.5"
              >
                {IMAGE_EXT.test(url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                ) : VIDEO_EXT.test(url) ? (
                  <video src={url} className="h-9 w-9 rounded object-cover shrink-0" muted />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded bg-muted shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 truncate text-xs" title={name}>{name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  title={t("farewellMediaMoveUp")}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  disabled={index === list.length - 1}
                  onClick={() => move(index, 1)}
                  title={t("farewellMediaMoveDown")}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive"
                  onClick={() => remove(index)}
                  title={t("farewellMediaRemove")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)} disabled={uploading}>
          <Images className="mr-1 h-3.5 w-3.5" />
          {t("farewellMediaAdd")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          {t("farewellMediaUpload")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          multiple
          className="hidden"
          onChange={handleFiles}
        />
      </div>
      <GalleryPickerWithUploadDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(item: GalleryItem) => {
          if (item?.url) onChange([...list, item.url]);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

// Canais com envio de mídia suportado pelo helper SendFarewellMediaZPRO do backend
export const FAREWELL_MEDIA_TYPES = [
  "whatsapp",
  "baileys",
  "zapo",
  "meow",
  "evo",
  "evogo",
  "zapi",
  "uazapi",
  "waba",
  "dialog360",
  "gupshup",
  "instagram",
  "messenger",
  "webchat",
  "telegram",
];
