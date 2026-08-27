import { create } from 'zustand'

export type WabaCallState = 'idle' | 'ringing' | 'pre_accepting' | 'active' | 'ended'
export type WabaCallDirection = 'USER_INITIATED' | 'BUSINESS_INITIATED'

export type WabaCallChannel = "waba" | "gupshup" | "dialog360"

export interface WabaCallInfo {
  callId: string
  from: string
  to: string
  phoneNumberId: string
  channelId?: number
  // Tipo do canal — quem dispara setWabaCall (ticket-detail/waba-call-provider/sockets)
  // deve preencher para o provider escolher o service certo (waba|gupshup|dialog360).
  channel?: WabaCallChannel
  direction: WabaCallDirection
  sdpOffer?: string
  contactName?: string
  contactPic?: string
  startedAt?: number
}

interface WabaCallStore {
  state: WabaCallState
  callInfo: WabaCallInfo | null
  duration: number
  isMuted: boolean
  // True when another agent (or another tab of the same user) claimed the
  // ringing call. UI uses this to skip Meta-side reject/terminate calls when
  // the local tab tears down.
  claimedByOther: boolean
  setCall: (info: WabaCallInfo) => void
  setState: (state: WabaCallState) => void
  setDuration: (duration: number) => void
  setMuted: (muted: boolean) => void
  setClaimedByOther: (value: boolean) => void
  reset: () => void
}

export const useWabaCallStore = create<WabaCallStore>((set) => ({
  state: 'idle',
  callInfo: null,
  duration: 0,
  isMuted: false,
  claimedByOther: false,

  setCall: (info) => set({ callInfo: info }),
  setState: (state) => set({ state }),
  setDuration: (duration) => set({ duration }),
  setMuted: (muted) => set({ isMuted: muted }),
  setClaimedByOther: (value) => set({ claimedByOther: value }),

  reset: () => set({
    state: 'idle',
    callInfo: null,
    duration: 0,
    isMuted: false,
    claimedByOther: false
  })
}))
