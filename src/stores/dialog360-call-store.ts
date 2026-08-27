import { create } from "zustand"

export type Dialog360CallState =
  | "idle"
  | "ringing"
  | "pre_accepting"
  | "active"
  | "ended"
export type Dialog360CallDirection = "USER_INITIATED" | "BUSINESS_INITIATED"

export interface Dialog360CallInfo {
  callId: string
  from: string
  to: string
  phoneNumberId: string
  channelId?: number
  direction: Dialog360CallDirection
  sdpOffer?: string
  contactName?: string
  contactPic?: string
  startedAt?: number
}

interface Dialog360CallStore {
  state: Dialog360CallState
  callInfo: Dialog360CallInfo | null
  duration: number
  isMuted: boolean
  // True when another agent (or another tab of the same user) claimed the
  // ringing call. UI usa para evitar chamadas redundantes ao backend.
  claimedByOther: boolean
  setCall: (info: Dialog360CallInfo) => void
  setState: (state: Dialog360CallState) => void
  setDuration: (duration: number) => void
  setMuted: (muted: boolean) => void
  setClaimedByOther: (value: boolean) => void
  reset: () => void
}

export const useDialog360CallStore = create<Dialog360CallStore>((set) => ({
  state: "idle",
  callInfo: null,
  duration: 0,
  isMuted: false,
  claimedByOther: false,

  setCall: (info) => set({ callInfo: info }),
  setState: (state) => set({ state }),
  setDuration: (duration) => set({ duration }),
  setMuted: (muted) => set({ isMuted: muted }),
  setClaimedByOther: (value) => set({ claimedByOther: value }),

  reset: () =>
    set({
      state: "idle",
      callInfo: null,
      duration: 0,
      isMuted: false,
      claimedByOther: false,
    }),
}))
