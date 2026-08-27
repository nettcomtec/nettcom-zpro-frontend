"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import {
  Smartphone,
  MessageCircle,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
} from "lucide-react";

/**
 * Mockup de celular com bolha estilo WhatsApp, compartilhado entre a tela de
 * campanhas e as telas de envio em massa. Extraído de campanhas/page.tsx
 * (Fase 5 do PLANO_SALTO_UX_UI_FRONTEND) com correção do vazamento de
 * objectURL apontado na auditoria v2: a URL agora é criada uma única vez por
 * arquivo (useEffect) e revogada na troca de arquivo e no unmount.
 */

export interface WhatsAppPreviewProps {
  /** Texto da mensagem — variáveis cruas ({{name}}, {{var1}}, {{1}}) são exibidas como estão */
  message?: string;
  /** Arquivo local (imagem/vídeo/áudio/documento). Tem prioridade sobre mediaUrl */
  mediaFile?: File | null;
  /** URL remota da mídia (usada quando não há mediaFile) */
  mediaUrl?: string;
  /**
   * Dica explícita do tipo de mídia: "image" | "video" | "audio" | "document".
   * Quando informada sem mediaFile/mediaUrl, exibe um placeholder do tipo
   * (ex.: header de mídia de template WABA ainda sem URL preenchida).
   */
  mediaType?: string;
  /** Rodapé exibido em cinza dentro da bolha (ex.: FOOTER de template WABA) */
  footer?: string;
}

export function WhatsAppPreview({ message, mediaFile, mediaUrl, mediaType, footer }: WhatsAppPreviewProps) {
  const t = useTranslations("campanhasPage");
  const body = message || "";

  // Fix do leak: antes era URL.createObjectURL(mediaFile) a cada render, sem
  // revoke. Aqui o efeito cria 1 URL por arquivo e o cleanup revoga na troca
  // de arquivo e no unmount (StrictMode-safe: re-run recria a URL).
  const [mediaObjectUrl, setMediaObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!mediaFile) {
      setMediaObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setMediaObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [mediaFile]);

  const displayMedia = mediaFile ? mediaObjectUrl : mediaUrl || null;
  const typeHint = (mediaType || "").toLowerCase();

  const isImage = typeHint
    ? typeHint === "image"
    : Boolean(
        mediaFile?.type?.startsWith("image/") ||
          (mediaUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(mediaUrl))
      );
  const isVideo = typeHint
    ? typeHint === "video"
    : Boolean(
        mediaFile?.type?.startsWith("video/") ||
          (mediaUrl && /\.(mp4|ogg|webm)$/i.test(mediaUrl))
      );
  const isAudio = typeHint
    ? typeHint === "audio"
    : Boolean(
        mediaFile?.type?.startsWith("audio/") ||
          (mediaUrl && /\.(mp3|ogg|wav)$/i.test(mediaUrl))
      );

  // Placeholder quando o tipo é conhecido mas ainda não há arquivo/URL
  const showMediaPlaceholder =
    !displayMedia && ["image", "video", "audio", "document"].includes(typeHint);
  const hasMediaBubble = Boolean(displayMedia) || showMediaPlaceholder;
  const hasTextBubble = Boolean(body.trim() || footer?.trim());

  return (
    <div className="flex flex-col items-center select-none">
      {/* Phone frame */}
      <div
        className="relative rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-800 shadow-2xl"
        style={{ width: 220, height: 420 }}
      >
        {/* Screen */}
        <div className="absolute inset-0 rounded-[2rem] overflow-hidden bg-[#e5ddd5]">
          {/* Chat header */}
          <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-gray-600" />
            </div>
            <span className="text-white text-xs font-medium">{t("contactLabel")}</span>
          </div>
          {/* Messages area */}
          <div
            className="flex flex-col gap-2 p-2 overflow-y-auto"
            style={{ maxHeight: 340, backgroundImage: "url(\"data:image/svg+xml,%3Csvg...%3E\")" }}
          >
            {hasMediaBubble && (
              <div className="self-end max-w-[80%]">
                <div className="bg-[#dcf8c6] rounded-lg overflow-hidden shadow-sm p-1">
                  {isImage && displayMedia && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayMedia} alt="mídia" className="rounded max-w-full max-h-24 object-cover" />
                  )}
                  {isImage && !displayMedia && (
                    <div className="w-32 h-16 bg-black/5 rounded flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  {isVideo && displayMedia && (
                    <video src={displayMedia} className="rounded max-w-full max-h-24" controls={false} />
                  )}
                  {isVideo && !displayMedia && (
                    <div className="w-32 h-16 bg-black/5 rounded flex items-center justify-center">
                      <VideoIcon className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  {isAudio && (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <MessageCircle className="w-3 h-3 text-gray-500" />
                      <span className="text-xs text-gray-600">{t("audioLabel")}</span>
                    </div>
                  )}
                  {!isImage && !isVideo && !isAudio && (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <FileText className="w-3 h-3 text-gray-500" />
                      <span className="text-xs text-gray-600">
                        {mediaFile?.name || t("fileLabel")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {hasTextBubble && (
              <div className="self-end max-w-[80%]">
                <div className="bg-[#dcf8c6] rounded-lg shadow-sm px-2 py-1.5 relative">
                  {/* Tail */}
                  <div
                    className="absolute right-[-6px] top-2 w-0 h-0"
                    style={{
                      borderTop: "6px solid transparent",
                      borderBottom: "6px solid transparent",
                      borderLeft: "6px solid #dcf8c6",
                    }}
                  />
                  {body.trim() && (
                    <p className="text-[11px] text-gray-800 whitespace-pre-wrap break-words leading-tight">
                      {body}
                    </p>
                  )}
                  {footer?.trim() && (
                    <p className="text-[10px] text-gray-500 mt-0.5 whitespace-pre-wrap break-words leading-tight">
                      {footer}
                    </p>
                  )}
                  <div className="flex justify-end items-center gap-1 mt-0.5">
                    <span className="text-[9px] text-gray-500">
                      {format(new Date(), "HH:mm")}
                    </span>
                    <svg className="w-3 h-3 text-[#4fc3f7]" viewBox="0 0 16 11" fill="currentColor">
                      <path d="M11.071.653a.75.75 0 0 1 .205 1.04l-5.5 8a.75.75 0 0 1-1.152.112l-3-3a.75.75 0 1 1 1.06-1.06l2.39 2.389 4.956-7.206a.75.75 0 0 1 1.04-.275z" />
                    </svg>
                  </div>
                </div>
              </div>
            )}
            {!hasTextBubble && !hasMediaBubble && (
              <div className="flex items-center justify-center h-20 text-center">
                <p className="text-xs text-gray-400">{t("previewMsgLabel")}</p>
              </div>
            )}
          </div>
        </div>
        {/* Notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-gray-900 rounded-full z-10" />
      </div>
    </div>
  );
}
