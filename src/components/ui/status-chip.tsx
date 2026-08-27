import { cn } from "@/lib/utils";

/**
 * Cores de estado semânticas (tokens do tema) para indicadores de status.
 * Substitui os mapeamentos ad-hoc (emerald/green/yellow/red hardcoded) espalhados
 * pelas páginas — funciona nos dois temas sem `dark:`.
 */
export type StatusTone = "success" | "warning" | "destructive" | "info" | "neutral";

const DOT: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

const CHIP: Record<StatusTone, string> = {
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-info/10 text-info border-info/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function StatusDot({
  tone,
  pulse = false,
  className,
}: {
  tone: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", DOT[tone], pulse && "animate-pulse", className)}
    />
  );
}

export function StatusChip({
  tone,
  children,
  withDot = true,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  withDot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        CHIP[tone],
        className
      )}
    >
      {withDot && <StatusDot tone={tone} />}
      {children}
    </span>
  );
}
