"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Images, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GalleryPickerWithUploadDialog } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { fetchGalleryBlob, type GalleryItem } from "@/services/gallery";
import { uploadEmailAsset } from "@/services/email-marketing";
import { useAuthStore } from "@/stores/auth-store";
import { isInsecureImage, isValidEmailImageSrc, type EmailBlock, type EmailImageBlock } from "@/lib/email-design";
import { AlignButtons, NumberField, ValidatedTextField } from "./editor-fields";
import { EMAIL_IMAGE_ACCEPT, imageErrorKey, imageTooLarge, isAcceptedImageType, isGifFile } from "./editor-shared";

interface EditorImagePanelProps {
  block: EmailImageBlock;
  /** Já amarrado ao id do bloco: o envio termina no bloco certo mesmo se a seleção mudar */
  onPatch: (patch: Partial<EmailBlock>, group?: string) => void;
}

/**
 * Imagem do bloco: toda imagem enviada vira cópia própria do e-mail no servidor, com link
 * permanente que abre sem login no Gmail/Outlook (D5). A Galeria só aparece para quem
 * pode vê-la — sem a permissão, o seletor dispararia o aviso global de acesso negado.
 */
export function EditorImagePanel({ block, onPatch }: EditorImagePanelProps) {
  const t = useTranslations("emailVisualEditor");
  const canUseGallery = useAuthStore(state => state.hasPermission("gallery_view"));
  const uid = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const runUpload = async (getFile: () => Promise<File | null>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setUploading(true);
    try {
      const file = await getFile();
      if (!file) return;
      const { url } = await uploadEmailAsset(file);
      if (!isValidEmailImageSrc(url)) {
        toast.error(t("imageErrorServer"));
        return;
      }
      onPatch({ src: url });
    } catch (err) {
      toast.error(t(imageErrorKey(err)));
    } finally {
      busyRef.current = false;
      setUploading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (!file) return;
    if (!isAcceptedImageType(file.type, file.name)) {
      toast.error(t("imageErrorType"));
      return;
    }
    if (imageTooLarge(file.size, isGifFile(file.type, file.name))) {
      toast.error(t("imageErrorSize"));
      return;
    }
    void runUpload(async () => file);
  };

  const handleGalleryPick = (item: GalleryItem) => {
    void runUpload(async () => {
      const blob = await fetchGalleryBlob(item);
      const gif = isGifFile(item.type, item.name) || isGifFile(blob.type);
      if (imageTooLarge(blob.size, gif)) {
        toast.error(t("imageErrorSize"));
        return null;
      }
      return new File([blob], item.name || "imagem", { type: item.type || blob.type });
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start gap-2"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          {t("imageUpload")}
        </Button>
        {canUseGallery && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            disabled={uploading}
            onClick={() => setGalleryOpen(true)}
          >
            <Images aria-hidden />
            {t("imageFromGallery")}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={EMAIL_IMAGE_ACCEPT}
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={handleFileChange}
        />
      </div>

      {uploading ? (
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t("imageUploading")}
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">{t("imageFormatsHint")}</p>
      )}

      <ValidatedTextField
        label={t("imageUrl")}
        value={block.src}
        isValid={isValidEmailImageSrc}
        onChange={src => onPatch({ src }, "src")}
        placeholder="https://"
      />
      {isInsecureImage(block.src) && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t("imageInsecureWarning")}</p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-alt`} className="text-xs">
          {t("imageAlt")}
        </Label>
        <Input
          id={`${uid}-alt`}
          value={block.alt}
          maxLength={300}
          onChange={e => onPatch({ alt: e.target.value }, "alt")}
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">{t("imageAltHint")}</p>
      </div>

      <div className="grid grid-cols-2 items-end gap-3">
        <NumberField
          label={t("imageWidth")}
          value={block.widthPercent}
          min={10}
          max={100}
          step={5}
          onChange={widthPercent => onPatch({ widthPercent }, "widthPercent")}
        />
        <AlignButtons value={block.align} onChange={align => onPatch({ align })} />
      </div>

      {canUseGallery && (
        <GalleryPickerWithUploadDialog
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          onPick={handleGalleryPick}
          galleryFileType="image"
          uploadAccept={EMAIL_IMAGE_ACCEPT}
        />
      )}
    </div>
  );
}
