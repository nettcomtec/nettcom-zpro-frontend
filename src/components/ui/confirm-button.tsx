"use client";
import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmButtonProps {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmText?: string;
  variant?: "destructive" | "default";
  size?: "default" | "sm" | "icon";
  className?: string;
  disabled?: boolean;
  timeout?: number;   // ms to auto-cancel confirm state (default 3000)
  delayMs?: number;   // ms the confirm button stays disabled after first click (default 2000)
}

export function ConfirmButton({
  onConfirm, children, confirmText, variant = "destructive", size, className, disabled,
  timeout = 3000, delayMs = 2000,
}: ConfirmButtonProps) {
  const t = useTranslations("confirmButton");
  const [confirming, setConfirming] = useState(false);
  const [delayActive, setDelayActive] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const delayRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      setDelayActive(true);
      setCountdown(Math.ceil(delayMs / 1000));

      // countdown tick
      intervalRef.current = setInterval(() => {
        setCountdown((c) => Math.max(0, c - 1));
      }, 1000);

      // unlock confirm button after delayMs
      delayRef.current = setTimeout(() => {
        setDelayActive(false);
        clearInterval(intervalRef.current);
      }, delayMs);

      // auto-cancel confirm state after timeout
      timerRef.current = setTimeout(() => {
        setConfirming(false);
        setDelayActive(false);
        clearInterval(intervalRef.current);
      }, timeout);
    } else if (!delayActive) {
      clearTimeout(timerRef.current);
      clearTimeout(delayRef.current);
      clearInterval(intervalRef.current);
      setConfirming(false);
      setDelayActive(false);
      onConfirm();
    }
  };

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    clearTimeout(delayRef.current);
    clearInterval(intervalRef.current);
  }, []);

  return (
    <Button
      variant={confirming ? variant : "ghost"}
      size={size}
      className={cn(
        "transition-all duration-200",
        confirming && variant === "destructive" && "bg-red-500 text-white hover:bg-red-600",
        delayActive && "opacity-60 cursor-not-allowed",
        className
      )}
      onClick={handleClick}
      disabled={disabled || delayActive}
    >
      {confirming
        ? delayActive
          ? `${confirmText || t("confirm")} (${countdown}s)`
          : (confirmText || t("confirm"))
        : children}
    </Button>
  );
}
