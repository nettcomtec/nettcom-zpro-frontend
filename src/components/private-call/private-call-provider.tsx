"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { logger } from "@/lib/logger";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { usePrivateCallStore, type PrivateCallType } from "@/stores/private-call-store";
import { getPrivateChatRtcConfiguration } from "@/lib/webrtc-ice-servers";

let _pc: RTCPeerConnection | null = null;
let _peerUserId: string | null = null;
let _pendingRemoteIce: RTCIceCandidateInit[] = [];

function getPc(): RTCPeerConnection | null {
  return _pc;
}

function setPc(pc: RTCPeerConnection | null): void {
  _pc = pc;
}

function setPeerUserId(id: string | null): void {
  _peerUserId = id;
}

function getPeerUserId(): string | null {
  return _peerUserId;
}

function pushPendingIce(c: RTCIceCandidateInit): void {
  _pendingRemoteIce.push(c);
}

async function flushPendingIce(): Promise<void> {
  const pc = _pc;
  if (!pc?.remoteDescription) return;
  const q = _pendingRemoteIce;
  _pendingRemoteIce = [];
  for (const c of q) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    } catch {
      /* candidato expirado ou ordem - ignora */
    }
  }
}

function fullReset(): void {
  if (_pc) {
    try { _pc.close(); } catch { /* ignore */ }
    _pc = null;
  }
  _peerUserId = null;
  _pendingRemoteIce = [];

  const s = usePrivateCallStore.getState();
  s.localStream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
  s.reset();
}

type MediaErrorKind =
  | "insecure"
  | "unsupported"
  | "permission-mic"
  | "permission-cam"
  | "permission"
  | "no-device-mic"
  | "no-device-cam"
  | "device-in-use"
  | "generic";

function classifyMediaError(err: unknown, type: PrivateCallType): MediaErrorKind {
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
  const e = err as { name?: string } | null;
  const name = e?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return type === "video" ? "permission-cam" : "permission-mic";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return type === "video" ? "no-device-cam" : "no-device-mic";
  }
  if (name === "NotReadableError" || name === "AbortError") return "device-in-use";
  return "generic";
}

async function requestUserMedia(type: PrivateCallType): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw Object.assign(new Error("insecure context"), { name: "SecurityError" });
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("getUserMedia unsupported"), { name: "NotSupportedError" });
  }
  return navigator.mediaDevices.getUserMedia({
    video: type === "video",
    audio: true,
  });
}

export function PrivateCallProvider() {
  const t = useTranslations("chatPrivadoPage");
  const { user, isAuthenticated } = useAuthStore();
  const tenantId = user?.tenantId;
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !tenantId || registeredRef.current) return;
    void getPrivateChatRtcConfiguration();

    const socket = getSocket();
    const inviteEvent = `${tenantId}:private-call-invite`;
    const answerEvent = `${tenantId}:private-call-answer`;
    const rejectEvent = `${tenantId}:private-call-reject`;
    const hangupEvent = `${tenantId}:private-call-hangup`;
    const iceEvent = `${tenantId}:private-call-ice-candidate`;

    const onInvite = (data: {
      fromUserId: string;
      fromUserName?: string;
      fromName?: string;
      fromUserAvatar?: string;
      offer: RTCSessionDescriptionInit;
      type: PrivateCallType;
    }) => {
      const store = usePrivateCallStore.getState();
      if (store.state !== "idle") return;
      setPeerUserId(String(data.fromUserId));
      store.setCallType(data.type);
      store.setRemote(
        String(data.fromUserId),
        data.fromUserName || data.fromName || null,
        data.fromUserAvatar || null
      );
      store.setIncomingOffer(data.offer);
      store.setState("incoming");
    };

    const onAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
      try {
        const pc = getPc();
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushPendingIce();
        usePrivateCallStore.getState().setState("connected");
      } catch (err) {
        logger.error("Erro ao processar answer:", err);
      }
    };

    const onReject = () => {
      toast.info(t("callRejected"));
      fullReset();
    };

    const onHangup = () => {
      toast.info(t("callEnded"));
      fullReset();
    };

    const onIce = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      if (!data?.candidate) return;
      const expected = getPeerUserId();
      if (!expected || String(data.fromUserId) !== String(expected)) return;
      const pc = getPc();
      if (pc?.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch {
          pushPendingIce(data.candidate);
        }
      } else {
        pushPendingIce(data.candidate);
      }
    };

    socket.on(inviteEvent, onInvite);
    socket.on(answerEvent, onAnswer);
    socket.on(rejectEvent, onReject);
    socket.on(hangupEvent, onHangup);
    socket.on(iceEvent, onIce);
    registeredRef.current = true;

    return () => {
      socket.off(inviteEvent, onInvite);
      socket.off(answerEvent, onAnswer);
      socket.off(rejectEvent, onReject);
      socket.off(hangupEvent, onHangup);
      socket.off(iceEvent, onIce);
      registeredRef.current = false;
    };
  }, [isAuthenticated, tenantId, t]);

  useEffect(() => {
    return () => {
      fullReset();
    };
  }, []);

  return null;
}

export function usePrivateCallActions() {
  const t = useTranslations("chatPrivadoPage");
  const { user } = useAuthStore();

  const toastMediaError = useCallback((err: unknown, type: PrivateCallType) => {
    const kind = classifyMediaError(err, type);
    const map: Record<MediaErrorKind, string> = {
      insecure: t("callInsecureContext"),
      unsupported: t("callMediaUnsupported"),
      "permission-mic": t("callPermissionDeniedMic"),
      "permission-cam": t("callPermissionDeniedCamera"),
      permission: t("callPermissionDeniedMic"),
      "no-device-mic": t("callNoDeviceMic"),
      "no-device-cam": t("callNoDeviceCamera"),
      "device-in-use": t("callDeviceInUse"),
      generic: t("callStartError"),
    };
    toast.error(map[kind]);
  }, [t]);

  const startCall = useCallback(
    async (
      remoteUserId: string | number,
      remoteUserName: string,
      type: PrivateCallType,
      remoteUserAvatar?: string | null
    ) => {
      const tenantId = user?.tenantId;
      if (!tenantId) return;
      const store = usePrivateCallStore.getState();
      if (store.state !== "idle") return;

      try {
        const stream = await requestUserMedia(type);
        const peerId = String(remoteUserId);
        setPeerUserId(peerId);

        const rtcConfig = await getPrivateChatRtcConfiguration();
        const pc = new RTCPeerConnection(rtcConfig);
        pc.ontrack = (e) => {
          if (e.streams?.[0]) usePrivateCallStore.getState().setRemoteStream(e.streams[0]);
        };
        setPc(pc);
        stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));

        const socket = getSocket();
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit(`${tenantId}:private-call-ice-candidate`, {
              toUserId: peerId,
              candidate: e.candidate.toJSON(),
            });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        store.setLocalStream(stream);
        store.setCallType(type);
        store.setRemote(peerId, remoteUserName, remoteUserAvatar ?? null);
        store.setState("inviting");

        socket.emit(`${tenantId}:private-call-invite`, {
          toUserId: peerId,
          offer,
          type,
        });
      } catch (err) {
        logger.error("Erro ao iniciar chamada:", err);
        toastMediaError(err, type);
        fullReset();
      }
    },
    [user?.tenantId, toastMediaError]
  );

  const acceptCall = useCallback(async () => {
    const tenantId = user?.tenantId;
    if (!tenantId) return;
    const store = usePrivateCallStore.getState();
    if (store.state !== "incoming" || !store.incomingOffer || !store.remoteUserId) return;

    const peerId = store.remoteUserId;
    const type = store.callType ?? "audio";

    try {
      const stream = await requestUserMedia(type);
      setPeerUserId(peerId);

      const rtcConfig = await getPrivateChatRtcConfiguration();
      const pc = new RTCPeerConnection(rtcConfig);
      pc.ontrack = (e) => {
        if (e.streams?.[0]) usePrivateCallStore.getState().setRemoteStream(e.streams[0]);
      };
      setPc(pc);
      stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));

      const socket = getSocket();
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit(`${tenantId}:private-call-ice-candidate`, {
            toUserId: peerId,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(store.incomingOffer));
      await flushPendingIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit(`${tenantId}:private-call-answer`, { toUserId: peerId, answer });

      store.setLocalStream(stream);
      store.setIncomingOffer(null);
      store.setState("connected");
    } catch (err) {
      logger.error("Erro ao atender chamada:", err);
      toastMediaError(err, type);
      const currentPeer = peerId;
      if (currentPeer) {
        try {
          getSocket().emit(`${tenantId}:private-call-reject`, { toUserId: currentPeer });
        } catch { /* ignore */ }
      }
      fullReset();
    }
  }, [user?.tenantId, toastMediaError]);

  const rejectCall = useCallback(() => {
    const tenantId = user?.tenantId;
    const store = usePrivateCallStore.getState();
    const peerId = store.remoteUserId;
    if (peerId && tenantId) {
      try {
        getSocket().emit(`${tenantId}:private-call-reject`, { toUserId: peerId });
      } catch { /* ignore */ }
    }
    fullReset();
  }, [user?.tenantId]);

  const hangupCall = useCallback(() => {
    const tenantId = user?.tenantId;
    const store = usePrivateCallStore.getState();
    const peerId = store.remoteUserId;
    if (peerId && tenantId) {
      try {
        getSocket().emit(`${tenantId}:private-call-hangup`, { toUserId: peerId });
      } catch { /* ignore */ }
    }
    fullReset();
  }, [user?.tenantId]);

  const toggleMute = useCallback(() => {
    const store = usePrivateCallStore.getState();
    if (!store.localStream) return;
    const next = !store.isMuted;
    store.localStream.getAudioTracks().forEach((tr) => { tr.enabled = !next; });
    store.setMuted(next);
  }, []);

  const toggleVideo = useCallback(() => {
    const store = usePrivateCallStore.getState();
    if (!store.localStream) return;
    const next = !store.isVideoOff;
    store.localStream.getVideoTracks().forEach((tr) => { tr.enabled = !next; });
    store.setVideoOff(next);
  }, []);

  return { startCall, acceptCall, rejectCall, hangupCall, toggleMute, toggleVideo };
}
