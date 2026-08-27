import { create } from "zustand";

export type CallStatus =
  | "idle"
  | "registering"
  | "registered"
  | "ringing"
  | "calling"
  | "established"
  | "on-hold"
  | "terminated"
  | "error";

export type CallDirection = "incoming" | "outgoing";

export interface CallInfo {
  phone: string;
  tag?: string;
  pictureProfile?: string;
  direction: CallDirection;
  whatsappInstance?: string;
  inboxName?: string;
}

interface WebphoneState {
  isVisible: boolean;
  callStatus: CallStatus;
  callInfo: CallInfo | null;
  callDuration: number;
  isMuted: boolean;
  /** Chamada SIP em espera (hold). Ortogonal ao callStatus, igual ao isMuted. */
  isOnHold: boolean;
  sipRegistered: boolean;
  wavoipTokens: Record<string, { inboxName: string; token: string }>;
  /**
   * Quando preenchido, o WaVoIPWebphone deve iniciar a discagem automaticamente
   * e limpar este campo após consumir. Usado por componentes externos (ex: TicketDetail).
   */
  pendingWavoipCall: { phone: string; token: string; ticketId?: number; contactName?: string; contactPic?: string; inboxName?: string } | null;

  toggleVisibility: (visible?: boolean) => void;
  setCallStatus: (status: CallStatus) => void;
  startCall: (info: CallInfo) => void;
  endCall: () => void;
  toggleMute: () => void;
  setOnHold: (onHold: boolean) => void;
  setSipRegistered: (registered: boolean) => void;
  setCallDuration: (seconds: number) => void;
  addWavoipToken: (key: string, data: { inboxName: string; token: string }) => void;
  removeWavoipToken: (key: string) => void;
  requestWavoipCall: (info: WebphoneState["pendingWavoipCall"]) => void;
  clearPendingWavoipCall: () => void;
  reset: () => void;
}

export const useWebphoneStore = create<WebphoneState>((set) => ({
  isVisible: false,
  callStatus: "idle",
  callInfo: null,
  callDuration: 0,
  isMuted: false,
  isOnHold: false,
  sipRegistered: false,
  wavoipTokens: {},
  pendingWavoipCall: null,

  toggleVisibility: (visible) =>
    set((state) => ({ isVisible: visible ?? !state.isVisible })),

  setCallStatus: (status) => set({ callStatus: status }),

  startCall: (info) =>
    set({
      callInfo: info,
      callStatus: info.direction === "incoming" ? "ringing" : "calling",
      callDuration: 0,
      isMuted: false,
      isOnHold: false,
      isVisible: true,
    }),

  endCall: () =>
    set({ callStatus: "idle", callInfo: null, callDuration: 0, isMuted: false, isOnHold: false }),

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  setOnHold: (onHold) => set({ isOnHold: onHold }),

  setSipRegistered: (registered) =>
    set({ sipRegistered: registered, callStatus: registered ? "registered" : "idle" }),

  setCallDuration: (seconds) => set({ callDuration: seconds }),

  addWavoipToken: (key, data) =>
    set((state) => ({ wavoipTokens: { ...state.wavoipTokens, [key]: data } })),

  removeWavoipToken: (key) =>
    set((state) => {
      const tokens = { ...state.wavoipTokens };
      delete tokens[key];
      return { wavoipTokens: tokens };
    }),

  requestWavoipCall: (info) =>
    set({ pendingWavoipCall: info, isVisible: true }),

  clearPendingWavoipCall: () =>
    set({ pendingWavoipCall: null }),
  reset: () => set({ isVisible: false, callStatus: "idle", callInfo: null, callDuration: 0, isMuted: false, isOnHold: false, sipRegistered: false, wavoipTokens: {}, pendingWavoipCall: null }),
}));
