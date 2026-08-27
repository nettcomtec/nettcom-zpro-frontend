"use client";

import { useEffect, useRef, useCallback } from "react";
import { Play, Pause, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAudioPlayerStore } from "@/stores/audio-player-store";
import { registerAudioPlay } from "@/lib/audio-manager";
import { useLiveMode } from "@/hooks/use-live-mode";

export function PersistentAudioPlayer() {
  const t = useTranslations("persistentAudioPlayer");
  const { isLiveMode } = useLiveMode();
  const {
    url,
    originalUrl,
    title,
    currentTime,
    duration,
    playing,
    miniPlayerVisible,
    updateTime,
    updateDuration,
    setPlaying,
    dismiss,
  } = useAudioPlayerStore();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Track whether we've already started playback after handoff
  const startedRef = useRef(false);

  // When mini player becomes visible, create audio, seek, and play
  useEffect(() => {
    if (!miniPlayerVisible || !url) {
      // Mini player hidden — stop any ongoing playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      startedRef.current = false;
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => updateTime(audio.currentTime);
    const onLoadedMetadata = () => updateDuration(audio.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      updateTime(0);
      dismiss();
    };
    const onError = () => {
      // .mp3 failed — try original url (.ogg)
      if (originalUrl && audio.src !== originalUrl) {
        audio.src = originalUrl;
        audio.load();
        audio.currentTime = useAudioPlayerStore.getState().currentTime;
        audio.play().catch(() => {});
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    audio.src = url;
    audio.load();
    // Seek to where WaveAudioContent left off
    const resumeAt = useAudioPlayerStore.getState().currentTime;
    audio.addEventListener("canplay", function seekAndPlay() {
      audio.removeEventListener("canplay", seekAndPlay);
      audio.currentTime = resumeAt;
      registerAudioPlay(audio);
      audio.play().catch(() => {});
    }, { once: true });

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miniPlayerVisible, url]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      registerAudioPlay(audio);
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }, [duration]);

  const fmtTime = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  if (!miniPlayerVisible || !url) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50",
        "w-72 rounded-xl border bg-background/95 shadow-lg backdrop-blur",
        "flex items-center gap-3 px-3 py-2.5",
        "animate-in slide-in-from-bottom-2 duration-200"
      )}
    >
      {/* Play / Pause */}
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        aria-label={playing ? t("pause") : t("play")}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-0.5" />}
      </button>

      {/* Middle: title + progress */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className={cn("truncate text-xs font-medium text-foreground", isLiveMode && "live-blur-text")}>{title}</p>
        {/* Progress bar */}
        <div
          className="h-1.5 w-full cursor-pointer rounded-full bg-muted overflow-hidden"
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] font-mono text-muted-foreground">
            {fmtTime(currentTime)}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {fmtTime(duration)}
          </span>
        </div>
      </div>

      {/* Close */}
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label={t("close")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
