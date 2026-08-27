import { create } from "zustand"

export type GupshupCallState =
  | "idle"
  | "ringing"
  | "pre_accepting"
  | "active"
  | "ended"
export type GupshupCallDirection = "USER_INITIATED" | "BUSINESS_INITIATED"

export interface GupshupCallInfo {
  callId: string
  from: string
  to: string
  phoneNumberId: string
  channelId?: number
  appId?: string | null
  direction: GupshupCallDirection
  sdpOffer?: string
  contactName?: string
  contactPic?: string
  startedAt?: number
}

interface GupshupCallStore {
  state: GupshupCallState
  callInfo: GupshupCallInfo | null
  duration: number
  isMuted: boolean
  // True quando outra aba/agente reivindicou a chamada — UI usa para evitar
  // chamadas redundantes ao backend Gupshup.
  claimedByOther: boolean
  setCall: (info: GupshupCallInfo) => void
  setState: (state: GupshupCallState) => void
  setDuration: (duration: number) => void
  setMuted: (muted: boolean) => void
  setClaimedByOther: (value: boolean) => void
  reset: () => void
}

export const useGupshupCallStore = create<GupshupCallStore>((set) => ({
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
