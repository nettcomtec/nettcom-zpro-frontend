"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Grid3X3,
  ArrowRightLeft,
  Pause,
  Play,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useWebphoneStore } from "@/stores/webphone-store";

interface CallControlsProps {
  onDial?: () => void;
  onHangup?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onToggleKeypad?: () => void;
  onTransfer?: () => void;
  /** Quando fornecido, exibe o botão de espera (hold). SIP-only. */
  onToggleHold?: () => void;
  /** Desabilita o botão de espera enquanto o re-INVITE está em curso. */
  holdPending?: boolean;
}

export function CallControls({
  onDial,
  onHangup,
  onAccept,
  onReject,
  onToggleKeypad,
  onTransfer,
  onToggleHold,
  holdPending,
}: CallControlsProps) {
  const { callStatus, isMuted, isOnHold, toggleMute } = useWebphoneStore();
  const t = useTranslations("webphoneControls");

  if (callStatus === "ringing") {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center justify-center gap-6">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="lg"
                className="h-14 w-14 rounded-full bg-success hover:bg-success/90"
                onClick={onAccept}
                aria-label={t("acceptTooltip")}
              >
                <Phone className="h-6 w-6 text-success-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("acceptTooltip")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="lg"
                className="h-14 w-14 rounded-full bg-destructive hover:bg-destructive/90"
                onClick={onReject}
                aria-label={t("rejectTooltip")}
              >
                <PhoneOff className="h-6 w-6 text-destructive-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("rejectTooltip")}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  if (callStatus === "established" || callStatus === "calling") {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center justify-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                className={cn("h-12 w-12 rounded-full", isMuted && "bg-destructive/10 border-destructive")}
                onClick={toggleMute}
                aria-label={isMuted ? t("unmuteTooltip") : t("muteTooltip")}
              >
                {isMuted ? (
                  <MicOff className="h-5 w-5 text-destructive" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isMuted ? t("unmuteTooltip") : t("muteTooltip")}</TooltipContent>
          </Tooltip>
          {onToggleHold && callStatus === "established" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  disabled={holdPending}
                  className={cn(
                    "h-12 w-12 rounded-full",
                    isOnHold && "bg-warning/10 border-warning"
                  )}
                  onClick={onToggleHold}
                  aria-label={isOnHold ? t("resumeTooltip") : t("holdTooltip")}
                >
                  {isOnHold ? (
                    <Play className="h-5 w-5 text-warning" />
                  ) : (
                    <Pause className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isOnHold ? t("resumeTooltip") : t("holdTooltip")}</TooltipContent>
            </Tooltip>
          )}
          {onToggleKeypad && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 w-12 rounded-full"
                  onClick={onToggleKeypad}
                  aria-label={t("keypadTooltip")}
                >
                  <Grid3X3 className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("keypadTooltip")}</TooltipContent>
            </Tooltip>
          )}
          {onTransfer && callStatus === "established" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 w-12 rounded-full"
                  onClick={onTransfer}
                  aria-label={t("transferTooltip")}
                >
                  <ArrowRightLeft className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("transferTooltip")}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="lg"
                className="h-14 w-14 rounded-full bg-destructive hover:bg-destructive/90"
                onClick={onHangup}
                aria-label={t("hangupTooltip")}
              >
                <PhoneOff className="h-6 w-6 text-destructive-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("hangupTooltip")}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-center gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="lg"
              className="h-14 w-14 rounded-full bg-success hover:bg-success/90"
              onClick={onDial}
              aria-label={t("dialTooltip")}
            >
              <Phone className="h-6 w-6 text-success-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("dialTooltip")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="lg"
              className="h-14 w-14 rounded-full bg-destructive hover:bg-destructive/90"
              onClick={onHangup}
              aria-label={t("hangupTooltip")}
            >
              <PhoneOff className="h-6 w-6 text-destructive-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("hangupTooltip")}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
