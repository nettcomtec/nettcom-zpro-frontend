"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// PLANO_CRM_CONTATO — Fase 1 (D2). Estrelas somente leitura da conversão do cliente.
// O único componente de estrelas existente é local de /avaliacoes (não exportado).

export interface RatingStarsProps {
  /** Quantidade de estrelas cheias (arredondada e limitada a 0..max) */
  stars: number;
  max?: number;
  size?: "sm" | "md";
  /** Texto acessível (leitores de tela) */
  label?: string;
  className?: string;
}

export function RatingStars({ stars, max = 5, size = "md", label, className }: RatingStarsProps) {
  const total = Math.max(1, Math.round(max));
  const filled = Math.min(total, Math.max(0, Math.round(Number(stars) || 0)));
  const iconClass = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={label ?? `${filled}/${total}`}
      title={label}
    >
      {Array.from({ length: total }).map((_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn(
            iconClass,
            i < filled ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"
          )}
        />
      ))}
    </div>
  );
}

export default RatingStars;
