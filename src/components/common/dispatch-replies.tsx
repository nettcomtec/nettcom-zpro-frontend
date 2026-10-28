"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * "Respondeu?" dos relatórios de envio em massa e de campanha. O servidor conta
 * como resposta a 1ª mensagem do contato pelo MESMO canal em até `windowDays` dias
 * depois do envio (ligação, formulário e reação não contam) e devolve só a hora e o
 * atendimento: o texto fica no atendimento, que confere quem pode abri-lo.
 */

/** Explicação que abre no toque/clique (o Tooltip do Radix não abre no celular). */
export function DispatchRepliesHint({ windowDays, className }: { windowDays: number; className?: string }) {
  const t = useTranslations("dispatchReplies");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("moreInfo")}
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            className
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-3 text-xs leading-relaxed text-muted-foreground">
        {t("note", { days: windowDays })}
      </PopoverContent>
    </Popover>
  );
}

/** Abre o atendimento em que a resposta chegou. Sem hooks: vai em listas longas. */
export function DispatchReplyTicketLink({ ticketId, label }: { ticketId: number; label: string }) {
  return (
    <Link
      href={`/atendimento?ticketId=${ticketId}`}
      prefetch={false}
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

/** "37%" dos contatos conferidos; sem contato conferido, nada. */
export function replyRatePercent(count: number, checked: number): number | null {
  if (!Number.isFinite(count) || !Number.isFinite(checked) || checked <= 0) return null;
  return Math.round((count / checked) * 100);
}
