"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AlignJustify, List, StretchHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableDensity } from "@/hooks/use-table-density";

interface TableDensityToggleProps {
  density: TableDensity;
  onChange: (density: TableDensity) => void;
}

export function TableDensityToggle({ density, onChange }: TableDensityToggleProps) {
  const t = useTranslations("tableDensity");

  const options: { value: TableDensity; icon: React.ElementType; label: string }[] = [
    { value: "compact", icon: List, label: t("compact") },
    { value: "comfortable", icon: AlignJustify, label: t("comfortable") },
    { value: "spacious", icon: StretchHorizontal, label: t("spacious") },
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center border rounded-md overflow-hidden">
        {options.map(({ value, icon: Icon, label }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 rounded-none border-0",
                  density === value && "bg-accent text-accent-foreground"
                )}
                onClick={() => onChange(value)}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
