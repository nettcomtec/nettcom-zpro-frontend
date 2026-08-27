import { create } from "zustand";

export type PrivateCallState = "idle" | "inviting" | "incoming" | "connected";
export type PrivateCallType = "audio" | "video";

interface PrivateCallStore {
  state: PrivateCallState;
  callType: PrivateCallType | null;
  remoteUserId: string | null;
  remoteUserName: string | null;
  remoteUserAvatar: string | null;
  incomingOffer: RTCSessionDescriptionInit | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isMinimized: boolean;

  setState: (state: PrivateCallState) => void;
  setCallType: (type: PrivateCallType | null) => void;
  setRemote: (id: string | null, name: string | null, avatar?: string | null) => void;
  setIncomingOffer: (offer: RTCSessionDescriptionInit | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setMuted: (muted: boolean) => void;
  setVideoOff: (off: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  reset: () => void;
}

const initial = {
  state: "idle" as PrivateCallState,
  callType: null,
  remoteUserId: null,
  remoteUserName: null,
  remoteUserAvatar: null,
  incomingOffer: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoOff: false,
  isMinimized: false,
};

export const usePrivateCallStore = create<PrivateCallStore>((set) => ({
  ...initial,

  setState: (state) => set({ state }),
  setCallType: (callType) => set({ callType }),
  setRemote: (remoteUserId, remoteUserName, remoteUserAvatar = null) =>
    set({ remoteUserId, remoteUserName, remoteUserAvatar }),
  setIncomingOffer: (incomingOffer) => set({ incomingOffer }),
  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setMuted: (isMuted) => set({ isMuted }),
  setVideoOff: (isVideoOff) => set({ isVideoOff }),
  setMinimized: (isMinimized) => set({ isMinimized }),

  reset: () => set({ ...initial }),
}));
