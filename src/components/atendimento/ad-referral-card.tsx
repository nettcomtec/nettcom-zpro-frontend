"use client";

// Anúncio (ou link) de onde o contato veio, na 1ª mensagem dele no Instagram/Messenger
// (docs/PLANO_ANUNCIO_ORIGEM_CONVERSA.md). Tudo vai como texto. A imagem é a da CDN da
// Meta (host conferido em `readAdReferral`) e some quando o link assinado vence; título
// e ID continuam.

import { useState, type MouseEvent } from "react";
import { HelpCircle, Link2, Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AdReferralIdCopy } from "@/components/atendimento/ad-referral-id-copy";
import type { AdReferralView } from "@/lib/ad-referral";

// Clique e duplo clique no card não chegam às ações da bolha (o duplo clique responde).
const stopBubble = (event: MouseEvent) => event.stopPropagation();

// Popover e não Tooltip: o Tooltip não abre com toque (celular/PWA).
function AdReferralHelp() {
  const t = useTranslations("messageBubble");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stopBubble}
          onDoubleClick={stopBubble}
          aria-label={t("adReferralHelpTitle")}
          title={t("adReferralHelpTitle")}
          className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-amber-500/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="max-w-xs text-xs leading-relaxed"
        onClick={stopBubble}
        onDoubleClick={stopBubble}
      >
        <p className="mb-1 font-semibold">{t("adReferralHelpTitle")}</p>
        <p>{t("adReferralHelp")}</p>
      </PopoverContent>
    </Popover>
  );
}

export function AdReferralCard({ adReferral }: { adReferral: AdReferralView }) {
  const t = useTranslations("messageBubble");
  // `video_url` da Meta é a miniatura do vídeo, então também serve de imagem.
  const imageSrc = adReferral.photoUrl || adReferral.videoUrl;
  // A falha vale só para o endereço que falhou (outro endereço tenta de novo).
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const visibleSrc = imageSrc && failedSrc !== imageSrc ? imageSrc : null;
  const isAd = adReferral.kind === "ad";
  const HeaderIcon = isAd ? Megaphone : Link2;

  return (
    <div className="mb-1 max-w-[280px] rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
      <div className="flex items-center gap-1.5">
        <HeaderIcon className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <span className="min-w-0 flex-1 text-xs font-medium uppercase text-amber-700 dark:text-amber-400">
          {t(isAd ? "adReferralFromAd" : "adReferralFromLink")}
        </span>
        <AdReferralHelp />
      </div>
      {isAd ? (
        <>
          {adReferral.adTitle && (
            <p className="mt-1 line-clamp-2 break-words text-sm font-medium">{adReferral.adTitle}</p>
          )}
          {visibleSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={visibleSrc}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFailedSrc(visibleSrc)}
              className="mt-1.5 max-h-[120px] w-full rounded object-cover"
            />
          )}
          {adReferral.adId && <AdReferralIdCopy adId={adReferral.adId} className="mt-1" />}
        </>
      ) : (
        adReferral.ref && (
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {t("adReferralLinkRef", { ref: adReferral.ref })}
          </p>
        )
      )}
    </div>
  );
}
