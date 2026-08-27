import React from "react";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

interface EmptyStateStep {
  number: number;
  title: string;
  description?: string;
}

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  steps?: EmptyStateStep[];
}

export function EmptyState({ icon: Icon = Inbox, title, description, children, className, steps }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="mb-4 rounded-full bg-gradient-to-b from-muted/40 to-muted p-4 ring-1 ring-border/60 shadow-xs">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground max-w-md">{description}</p>}
      {steps && steps.length > 0 && (
        <div className="mt-4 w-full max-w-sm">
          <ol className="space-y-2">
            {steps.map((step) => (
              <li key={step.number} className="flex items-start gap-3 text-left">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {step.number}
                </span>
                <div>
                  <p className="text-xs font-medium">{step.title}</p>
                  {step.description && <p className="text-[11px] text-muted-foreground">{step.description}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
