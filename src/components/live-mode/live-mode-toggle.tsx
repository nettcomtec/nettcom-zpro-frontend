"use client";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";

export function LiveModeToggle() {
  const { envEnabled, isLiveMode, toggle } = useLiveMode();
  const t = useTranslations("liveMode");

  if (!envEnabled) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("toggleAriaLabel")}
          aria-pressed={isLiveMode}
          onClick={toggle}
          className={cn(
            "h-9 w-9",
            isLiveMode && "ring-2 ring-orange-400 text-orange-500"
          )}
        >
          {isLiveMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("toggleTooltip")}</TooltipContent>
    </Tooltip>
  );
}
