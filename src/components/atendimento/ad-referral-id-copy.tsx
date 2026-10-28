"use client";

// ID do anúncio com botão copiar — card da bolha e Popover do selo do atendimento
// (docs/PLANO_ANUNCIO_ORIGEM_CONVERSA.md). Um só jogo de chaves em `messageBubble`.
// Sem link para o Gerenciador de Anúncios: a URL exige o id da conta de anúncios, que
// não vem no webhook — o ID serve para colar na busca do Gerenciador.

import type { MouseEvent } from "react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AdReferralIdCopyProps {
  adId: string;
  className?: string;
}

export function AdReferralIdCopy({ adId, className }: AdReferralIdCopyProps) {
  const t = useTranslations("messageBubble");

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(adId);
      toast.success(t("adReferralIdCopied"));
    } catch {
      toast.error(t("adReferralCopyFailed"));
    }
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground", className)}>
      <span className="min-w-0 truncate">{t("adReferralAdId", { id: adId })}</span>
      <button
        type="button"
        onClick={handleCopy}
        onDoubleClick={(event) => event.stopPropagation()}
        aria-label={t("adReferralCopyId")}
        title={t("adReferralCopyId")}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}
