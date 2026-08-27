"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, Minimize2, Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { usePrivateCallStore } from "@/stores/private-call-store";
import { usePrivateCallActions } from "./private-call-provider";

function attachStream(
  el: HTMLMediaElement | null,
  stream: MediaStream | null,
  muted: boolean,
): void {
  if (!el) return;
  if (stream) {
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    el.muted = muted;
    if (el.paused) {
      void el.play().catch(() => {});
    }
  } else if (el.srcObject) {
    el.srcObject = null;
  }
}

export function PrivateCallActiveModal() {
  const t = useTranslations("chatPrivadoPage");
  const state = usePrivateCallStore((s) => s.state);
  const callType = usePrivateCallStore((s) => s.callType);
  const remoteUserName = usePrivateCallStore((s) => s.remoteUserName);
  const remoteUserAvatar = usePrivateCallStore((s) => s.remoteUserAvatar);
  const localStream = usePrivateCallStore((s) => s.localStream);
  const remoteStream = usePrivateCallStore((s) => s.remoteStream);
  const isMuted = usePrivateCallStore((s) => s.isMuted);
  const isVideoOff = usePrivateCallStore((s) => s.isVideoOff);
  const isMinimized = usePrivateCallStore((s) => s.isMinimized);
  const setMinimized = usePrivateCallStore((s) => s.setMinimized);
  const { hangupCall, toggleMute, toggleVideo } = usePrivateCallActions();

  // useState refs so the useEffects re-run when Radix Portal mounts the element
  const [videoLocalEl, setVideoLocalEl] = useState<HTMLVideoElement | null>(null);
  const [videoRemoteEl, setVideoRemoteEl] = useState<HTMLVideoElement | null>(null);
  const [videoLocalMiniEl, setVideoLocalMiniEl] = useState<HTMLVideoElement | null>(null);
  const [videoRemoteMiniEl, setVideoRemoteMiniEl] = useState<HTMLVideoElement | null>(null);
  const audioRemoteRef = useRef<HTMLAudioElement>(null);

  const active = state === "inviting" || state === "connected";
  const open = active && !isMinimized;

  // Local PiP in expanded modal
  useEffect(() => {
    const visible = open && callType === "video";
    attachStream(videoLocalEl, visible ? localStream : null, true);
  }, [videoLocalEl, open, localStream, callType]);

  // Remote video in expanded modal
  useEffect(() => {
    const visible = open && callType === "video";
    attachStream(videoRemoteEl, visible ? remoteStream : null, false);
  }, [videoRemoteEl, open, callType, remoteStream]);

  // Remote audio (always attached for audio calls and as fallback for video)
  useEffect(() => {
    if (!active) {
      attachStream(audioRemoteRef.current, null, false);
      return;
    }
    // For video calls the video element carries the audio track; only use audio el for audio calls.
    if (callType === "audio") {
      attachStream(audioRemoteRef.current, remoteStream, false);
    } else {
      attachStream(audioRemoteRef.current, null, false);
    }
  }, [active, callType, remoteStream]);

  // Minimized: local mini PiP
  useEffect(() => {
    const visible = isMinimized && active && callType === "video" && !isVideoOff;
    attachStream(videoLocalMiniEl, visible ? localStream : null, true);
  }, [videoLocalMiniEl, isMinimized, active, localStream, callType, isVideoOff]);

  // Minimized: remote mini
  useEffect(() => {
    const visible = isMinimized && active && callType === "video";
    attachStream(videoRemoteMiniEl, visible ? remoteStream : null, false);
  }, [videoRemoteMiniEl, isMinimized, active, callType, remoteStream]);

  const displayName = remoteUserName || "";
  const initial = displayName.charAt(0) || "?";

  return (
    <>
      <audio ref={audioRemoteRef} autoPlay playsInline style={{ display: "none" }} />

      {active && isMinimized && (
        <div
          className="fixed bottom-4 right-4 z-50 w-64 rounded-xl border border-border bg-background shadow-2xl overflow-hidden"
          role="dialog"
          aria-label={state === "inviting" ? t("calling") : displayName}
        >
          {callType === "video" ? (
            <div className="relative bg-zinc-900 aspect-video">
              <video
                ref={setVideoRemoteMiniEl}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
              {!remoteStream && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Avatar className="h-12 w-12">
                    {remoteUserAvatar ? <AvatarImage src={remoteUserAvatar} alt={displayName} /> : null}
                    <AvatarFallback className="text-lg bg-primary/80 text-primary-foreground">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              <div
                className={`absolute top-2 right-2 w-16 h-12 rounded-md overflow-hidden border border-white/30 bg-zinc-800 ${(!localStream || isVideoOff) ? "hidden" : ""}`}
              >
                <video
                  ref={setVideoLocalMiniEl}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => setMinimized(false)}
                className="absolute top-2 left-2 h-7 w-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white"
                aria-label={t("expand")}
                title={t("expand")}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-background min-w-0">
              <Avatar className="h-8 w-8 shrink-0">
                {remoteUserAvatar ? <AvatarImage src={remoteUserAvatar} alt={displayName} /> : null}
                <AvatarFallback className="text-sm">{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {state === "inviting" ? t("calling") : displayName}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {state === "inviting" ? t("waiting") : t("audioCallLabel")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMinimized(false)}
                className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center shrink-0"
                aria-label={t("expand")}
                title={t("expand")}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 p-2 bg-background">
            {state === "connected" && (
              <Button
                size="icon"
                variant={isMuted ? "destructive" : "secondary"}
                className="h-8 w-8 rounded-full"
                onClick={toggleMute}
                title={isMuted ? t("enableMic") : t("disableMic")}
                aria-label={isMuted ? t("enableMic") : t("disableMic")}
              >
                {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </Button>
            )}
            {state === "connected" && callType === "video" && (
              <Button
                size="icon"
                variant={isVideoOff ? "destructive" : "secondary"}
                className="h-8 w-8 rounded-full"
                onClick={toggleVideo}
                title={isVideoOff ? t("enableCamera") : t("disableCamera")}
                aria-label={isVideoOff ? t("enableCamera") : t("disableCamera")}
              >
                {isVideoOff ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
              </Button>
            )}
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 rounded-full"
              onClick={hangupCall}
              title={t("hangup")}
              aria-label={t("hangup")}
            >
              <PhoneOff className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!o) setMinimized(true); }}>
        <DialogContent
          className="max-w-sm w-[95vw] p-0 overflow-hidden [&>button.absolute]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">
            {state === "inviting" ? t("calling") : displayName}
          </DialogTitle>
          <div className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-3 border-b bg-background overflow-hidden">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <Avatar className="h-8 w-8 shrink-0">
                {remoteUserAvatar ? <AvatarImage src={remoteUserAvatar} alt={displayName} /> : null}
                <AvatarFallback className="text-sm">{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">
                  {state === "inviting" ? t("calling") : displayName}
                </p>
                {state === "inviting" && (
                  <p className="text-[10px] text-muted-foreground truncate">{t("waiting")}</p>
                )}
              </div>
            </div>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full shrink-0"
              onClick={() => setMinimized(true)}
              title={t("minimize")}
              aria-label={t("minimize")}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 rounded-full shrink-0"
              onClick={hangupCall}
              title={t("hangup")}
              aria-label={t("hangup")}
            >
              <PhoneOff className="h-4 w-4" />
            </Button>
          </div>

          <div
            className="relative bg-zinc-900 flex flex-col items-center justify-center"
            style={{ minHeight: 260 }}
          >
            {callType === "video" ? (
              <>
                <video
                  ref={setVideoRemoteEl}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover rounded"
                  style={{ minHeight: 200, maxHeight: 320 }}
                />
                {!remoteStream && state === "inviting" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
                    <div className="h-8 w-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">{t("waitingVideo")}</span>
                  </div>
                )}
                <div
                  className={`absolute bottom-3 right-3 w-24 h-16 rounded-lg overflow-hidden border-2 border-white/30 bg-zinc-800 ${(!localStream || isVideoOff) ? "hidden" : ""}`}
                >
                  <video
                    ref={setVideoLocalEl}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0.5 left-1 text-[9px] text-white/70">
                    {t("you")}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-white px-4 w-full min-w-0 overflow-hidden">
                <Avatar className="h-20 w-20 shrink-0">
                  {remoteUserAvatar ? <AvatarImage src={remoteUserAvatar} alt={displayName} /> : null}
                  <AvatarFallback className="text-3xl bg-primary/80 text-primary-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div className="w-full min-w-0 overflow-hidden">
                  <p
                    className="font-medium text-center line-clamp-2"
                    style={{ wordBreak: "break-all", overflowWrap: "anywhere" }}
                  >
                    {displayName}
                  </p>
                </div>
                <p className="text-sm text-white/60">
                  {state === "inviting" ? t("calling") : t("audioCallLabel")}
                </p>
              </div>
            )}
          </div>

          {state === "connected" && (
            <div className="flex justify-center gap-4 py-4 border-t bg-background">
              <Button
                size="icon"
                variant={isMuted ? "destructive" : "secondary"}
                className="h-10 w-10 rounded-full"
                onClick={toggleMute}
                title={isMuted ? t("enableMic") : t("disableMic")}
                aria-label={isMuted ? t("enableMic") : t("disableMic")}
              >
                {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              {callType === "video" && (
                <Button
                  size="icon"
                  variant={isVideoOff ? "destructive" : "secondary"}
                  className="h-10 w-10 rounded-full"
                  onClick={toggleVideo}
                  title={isVideoOff ? t("enableCamera") : t("disableCamera")}
                  aria-label={isVideoOff ? t("enableCamera") : t("disableCamera")}
                >
                  {isVideoOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
