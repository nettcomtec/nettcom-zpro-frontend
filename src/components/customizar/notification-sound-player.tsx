"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Loader2 } from "lucide-react";

const BAR_COUNT = 40;

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function buildFallbackBars(): number[] {
  const half = Math.ceil(BAR_COUNT / 2);
  const base = Array.from({ length: half }, (_, i) => {
    const t = i / half;
    return 0.15 + 0.55 * Math.sin(t * Math.PI) * (0.6 + 0.4 * Math.sin(t * Math.PI * 7));
  });
  return [...base, ...[...base].reverse()].slice(0, BAR_COUNT);
}

interface Props { src: string }

export function NotificationSoundPlayer({ src }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [bars, setBars] = useState<number[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading"); setBars([]); setCurrentTime(0); setDuration(0); setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    fetch(src)
      .then((r) => { if (!r.ok) throw new Error(); return r.arrayBuffer(); })
      .then((buf) => {
        if (cancelled) return;
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        return ctx.decodeAudioData(buf).then((decoded) => {
          ctx.close();
          if (cancelled) return;
          const ch = decoded.getChannelData(0);
          const block = Math.floor(ch.length / BAR_COUNT);
          const peaks = Array.from({ length: BAR_COUNT }, (_, i) => {
            let max = 0;
            for (let j = i * block, end = Math.min(j + block, ch.length); j < end; j++) {
              const a = Math.abs(ch[j]); if (a > max) max = a;
            }
            return max;
          });
          const peak = Math.max(...peaks, 0.001);
          setBars(peaks.map((p) => p / peak));
          setDuration(decoded.duration);
          setStatus("ready");
        });
      })
      .catch(() => { if (!cancelled) { setBars(buildFallbackBars()); setStatus("error"); } });

    return () => { cancelled = true; };
  }, [src]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.src = src;
    audio.addEventListener("ended", () => {
      setPlaying(false); setCurrentTime(0);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    });
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ""; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [src]);

  const tick = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    setCurrentTime(a.currentTime);
    if (!a.paused && !a.ended) rafRef.current = requestAnimationFrame(tick);
  }, []);

  const togglePlay = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) {
      a.play().then(() => { setPlaying(true); rafRef.current = requestAnimationFrame(tick); }).catch(() => {});
    } else {
      a.pause(); setPlaying(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
  }, [tick]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current; if (!a || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
    setCurrentTime(a.currentTime);
  }, [duration]);

  const progress = duration > 0 ? currentTime / duration : 0;
  const isLoading = status === "loading";
  const canPlay = !isLoading && status !== "error";

  return (
    <div className="flex items-center gap-2 w-full rounded-lg border bg-muted/20 px-2.5 py-1.5">
      <button
        type="button"
        onClick={canPlay ? togglePlay : undefined}
        disabled={isLoading}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        className={[
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
          canPlay ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer" : "bg-muted text-muted-foreground cursor-default",
        ].join(" ")}
      >
        {isLoading
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : playing
          ? <Pause className="h-3 w-3 fill-current" />
          : <Play className="h-3 w-3 fill-current translate-x-px" />}
      </button>

      <div
        className="flex flex-1 items-center gap-[2px] h-6 select-none"
        style={{ cursor: canPlay ? "pointer" : "default" }}
        onClick={canPlay ? handleSeek : undefined}
        aria-hidden
      >
        {isLoading
          ? Array.from({ length: BAR_COUNT }).map((_, i) => (
              <div key={i} className="flex-1 rounded-full bg-muted animate-pulse"
                style={{ height: `${4 + ((i * 11 + i * i * 2) % 14)}px` }} />
            ))
          : bars.map((amp, i) => {
              const played = i / (BAR_COUNT - 1) <= progress;
              const h = Math.round(2 + amp * 20);
              return (
                <div key={i} style={{ height: `${h}px` }}
                  className={[
                    "flex-1 rounded-full transition-colors [transition-duration:40ms]",
                    status === "error" ? "bg-muted-foreground/20"
                      : played ? "bg-primary"
                      : "bg-muted-foreground/30",
                  ].join(" ")} />
              );
            })}
      </div>

      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {isLoading ? "…" : status === "error" ? "--:--" : duration > 0 ? `${formatTime(currentTime)}/${formatTime(duration)}` : "0:00"}
      </span>
    </div>
  );
}
