"use client";

import { useState } from "react";
import { Film, Image as ImageIcon, LayoutGrid } from "lucide-react";
import type { InstagramMedia } from "@/services/instagram";

type Candidate = { kind: "img" | "video"; src: string };

export const looksLikeVideoUrl = (url: string) => {
  try {
    return /\.(mp4|mov)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

// Miniatura de uma publicação do Instagram. Vídeo usa a capa (thumbnail_url): a Meta
// omite o media_url de Reel com música (direitos autorais), e o <video> sem src deixava
// o card em branco. Ordem: capa → vídeo (só os metadados) → ícone. Álbum: o media_url é
// o do 1º item, que pode ser vídeo — aí vai direto ao <video>. Link vencido (403 do CDN)
// cai no ícone.
export function InstagramMediaThumb({
  media,
  className = "h-full w-full object-cover",
  iconClassName = "h-6 w-6",
}: {
  media: Pick<InstagramMedia, "media_type" | "media_url" | "thumbnail_url">;
  className?: string;
  iconClassName?: string;
}) {
  const isVideo = media.media_type === "VIDEO" || media.media_type === "REELS";
  const isAlbum = media.media_type === "CAROUSEL_ALBUM";
  const candidates: Candidate[] = [];
  if (isVideo) {
    if (media.thumbnail_url) candidates.push({ kind: "img", src: media.thumbnail_url });
    if (media.media_url) candidates.push({ kind: "video", src: media.media_url });
  } else if (media.media_url) {
    candidates.push({ kind: isAlbum && looksLikeVideoUrl(media.media_url) ? "video" : "img", src: media.media_url });
  }

  // Falhas valem só para o mesmo conjunto de endereços (a lista recarregada traz URLs novas)
  const signature = candidates.map((c) => c.src).join("|");
  const [failed, setFailed] = useState<{ signature: string; count: number }>({ signature, count: 0 });
  const failedCount = failed.signature === signature ? failed.count : 0;
  const current = candidates[failedCount];
  const onError = () => setFailed({ signature, count: failedCount + 1 });

  if (current?.kind === "img") {
    return <img key={current.src} src={current.src} alt="" loading="lazy" className={className} onError={onError} />;
  }
  if (current?.kind === "video") {
    return (
      <video key={current.src} src={current.src} preload="metadata" muted playsInline className={className} onError={onError} />
    );
  }
  const Icon = isVideo ? Film : isAlbum ? LayoutGrid : ImageIcon;
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      <Icon className={iconClassName} />
    </div>
  );
}
