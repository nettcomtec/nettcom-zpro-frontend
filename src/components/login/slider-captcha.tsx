"use client";

import React, { useRef, useCallback, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SliderCaptchaProps {
  onVerified: (verified: boolean) => void;
  label?: string;
}

const THUMB_W = 44;

export function SliderCaptcha({ onVerified, label }: SliderCaptchaProps) {
  const [progress, setProgress] = useState(0); // 0..100
  const [verified, setVerified] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const calcProgress = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const raw = clientX - rect.left - THUMB_W / 2;
    const max = rect.width - THUMB_W;
    return Math.max(0, Math.min(100, (raw / max) * 100));
  }, []);

  const finish = useCallback(
    (currentProgress: number) => {
      dragging.current = false;
      if (currentProgress >= 95) {
        setProgress(100);
        setVerified(true);
        onVerified(true);
      } else {
        setProgress(0);
        onVerified(false);
      }
    },
    [onVerified]
  );

  const startDrag = useCallback(
    (clientX: number) => {
      if (verified) return;
      dragging.current = true;

      let lastProgress = calcProgress(clientX);

      const onMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return;
        lastProgress = calcProgress(e.clientX);
        setProgress(lastProgress);
      };
      const onTouchMove = (e: TouchEvent) => {
        if (!dragging.current) return;
        lastProgress = calcProgress(e.touches[0].clientX);
        setProgress(lastProgress);
      };
      const cleanup = () => {
        finish(lastProgress);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", cleanup);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", cleanup);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", cleanup);
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend", cleanup);
    },
    [verified, calcProgress, finish]
  );

  // fill width: thumb center follows progress, fill covers up to thumb center
  const fillWidth = `calc(${progress}% - ${(THUMB_W * progress) / 100}px + ${THUMB_W / 2}px)`;
  const thumbLeft = `calc(${progress}% - ${(THUMB_W * progress) / 100}px)`;

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <p className="text-xs text-muted-foreground">{label}</p>
      )}
      <div
        ref={trackRef}
        className={cn(
          "relative h-11 rounded-md border select-none overflow-hidden",
          verified
            ? "border-green-500 bg-green-50 dark:bg-green-950/20"
            : "border-border bg-muted/40"
        )}
      >
        {/* Progress fill */}
        <div
          className={cn(
            "absolute left-0 top-0 h-full pointer-events-none transition-colors duration-200",
            verified ? "bg-green-500/20" : "bg-primary/15"
          )}
          style={{ width: fillWidth }}
        />

        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {verified ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
              <Check className="h-3.5 w-3.5" />
              Verificado
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/70 font-medium">
              Deslize para verificar →
            </span>
          )}
        </div>

        {/* Draggable thumb */}
        {!verified && (
          <div
            className="absolute top-0 h-full flex items-center justify-center cursor-grab active:cursor-grabbing bg-primary text-primary-foreground shadow-md rounded-md z-10"
            style={{ width: THUMB_W, left: thumbLeft }}
            onMouseDown={(e) => {
              e.preventDefault();
              startDrag(e.clientX);
            }}
            onTouchStart={(e) => {
              startDrag(e.touches[0].clientX);
            }}
          >
            <span className="text-sm font-bold select-none">›</span>
          </div>
        )}
      </div>
    </div>
  );
}
