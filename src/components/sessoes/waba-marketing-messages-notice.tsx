"use client";

// Selo dos termos da Marketing Messages API por canal WABA
// (docs/PLANO_MARKETING_MESSAGES_API_WABA.md, D5/D13): linha compacta no card de
// /sessoes ("card") e bloco na "Info Conexão" das Integrações Meta ("panel"). Só
// aparece quando a conta PODE aceitar os termos (status "eligible"); aceitos, outro
// valor da Meta ou consulta sem resposta não mostram nada. Componente e rota próprios
// de propósito: um tipo novo no aviso de pagamento faria o front antigo esconder aquele aviso.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, HelpCircle, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { WHATSAPP_MANAGER_URL, useCanResolveMetaSendHealth } from "@/lib/meta-send-health";
import {
  getMarketingMessagesStatus,
  type MarketingMessagesChannelStatus,
} from "@/services/meta-marketing-messages";

/**
 * Status dos termos por canal (chave = id do canal), lido 1× por carga da tela.
 * Só consulta quando a empresa tem canal WABA (`hasWabaChannel`) e o usuário é quem
 * resolve o aviso de pagamento (admin, superadmin, personalizado com sessions_manage —
 * o mesmo corte do backend). null = não consultado / sem acesso / backend antigo.
 */
export function useWabaMarketingMessagesStatuses(
  hasWabaChannel: boolean
): Map<number, MarketingMessagesChannelStatus> | null {
  const canResolve = useCanResolveMetaSendHealth();
  const [statuses, setStatuses] = useState<Map<number, MarketingMessagesChannelStatus> | null>(null);
  const requestedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hasWabaChannel || !canResolve || requestedRef.current) return;
    requestedRef.current = true;
    void getMarketingMessagesStatus().then((list) => {
      if (!mountedRef.current) return;
      setStatuses(new Map(list.map((s) => [s.whatsappId, s])));
    });
  }, [hasWabaChannel, canResolve]);

  return canResolve ? statuses : null;
}

type Props = {
  /** Status do canal (de `useWabaMarketingMessagesStatuses`); sem status não renderiza. */
  status: MarketingMessagesChannelStatus | null | undefined;
  variant: "card" | "panel";
  className?: string;
};

const LINK_TONE = "text-sky-700 dark:text-sky-400";

export function WabaMarketingMessagesNotice({ status, variant, className }: Props) {
  const t = useTranslations("wabaMarketingMessages");
  if (!status || status.status !== "eligible") return null;

  // Popover (e não Tooltip): abre no toque do celular.
  const explanation = (
    <PopoverContent
      align="start"
      className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-3 text-xs leading-relaxed"
    >
      <p className="[overflow-wrap:anywhere]">{t("noticeText")}</p>
      <p className="whitespace-pre-line [overflow-wrap:anywhere]">{t("noticeHowTo")}</p>
      <p className="whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{t("noticeTooltip")}</p>
    </PopoverContent>
  );

  if (variant === "card") {
    return (
      <div className={cn("mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs", className)}>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex min-w-0 items-center gap-1 rounded-sm text-left font-medium cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                LINK_TONE
              )}
            >
              <Megaphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="[overflow-wrap:anywhere]">{t("noticeTitle")}</span>
              <HelpCircle className="w-3 h-3 shrink-0 opacity-70" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          {explanation}
        </Popover>
        <a
          href={WHATSAPP_MANAGER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("inline-flex items-center gap-0.5 underline underline-offset-2 hover:opacity-80", LINK_TONE)}
        >
          {t("openManager")}
          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        "rounded-md border p-3 text-sm flex items-start gap-2 border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200",
        className
      )}
    >
      <Megaphone className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="space-y-0.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex max-w-full items-start gap-1 rounded-sm text-left font-semibold leading-tight cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">{t("noticeTitle")}</span>
                <HelpCircle className="w-3.5 h-3.5 mt-px shrink-0 opacity-70" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            {explanation}
          </Popover>
          <p className="text-xs opacity-90 [overflow-wrap:anywhere]">{t("noticeText")}</p>
          <p className="text-xs opacity-90 whitespace-pre-line [overflow-wrap:anywhere]">{t("noticeHowTo")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs [&_svg]:size-3.5">
            <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              {t("openManager")}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
