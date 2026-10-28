import { create } from "zustand";
import type { SipRegisterFailure } from "@/lib/sip-diagnostics";
import type { SipLinkState, SipLinkStatus } from "@/lib/sip-link";

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

/** Há chamada em curso: estado da conexão/registro nunca mexe no `callStatus` dela. */
export const isSipCallActive = (status: CallStatus): boolean =>
  status === "ringing" || status === "calling" || status === "established" || status === "on-hold";

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
  /** Por que o ramal não está registrado (motivo mostrado no WebPhone). */
  sipRegisterFailure: SipRegisterFailure | null;
  /** Conexão e registro do ramal (lib/sip-link.ts), separado da chamada. */
  sipLinkState: SipLinkState;
  wavoipTokens: Record<string, { inboxName: string; token: string }>;
  /**
   * Quando preenchido, o WaVoIPWebphone deve iniciar a discagem automaticamente
   * e limpar este campo após consumir. Usado por componentes externos (ex: TicketDetail).
   */
  pendingWavoipCall: { phone: string; token: string; ticketId?: number; contactName?: string; contactPic?: string; inboxName?: string } | null;
  /**
   * Pedido de discagem SIP vindo de fora do webphone (ex: botão SIP do contato).
   * O AsteriskWebphone consome, limpa e disca de fato (Inviter + INVITE).
   * `requestedAt` protege contra pedido velho: se o modal não montar na hora
   * (config SIP incompleta), o pedido não pode discar sozinho minutos depois.
   */
  pendingSipCall: { phone: string; tag?: string; requestedAt: number } | null;

  toggleVisibility: (visible?: boolean) => void;
  setCallStatus: (status: CallStatus) => void;
  startCall: (info: CallInfo) => void;
  endCall: () => void;
  toggleMute: () => void;
  setOnHold: (onHold: boolean) => void;
  setSipRegistered: (registered: boolean) => void;
  /** Registro recusado/caído: tira o "registrado" sem mexer numa chamada em curso. */
  setSipRegisterFailure: (failure: SipRegisterFailure) => void;
  /** Estado vindo do SipLink (conectando, registrando, registrado, reconectando, erro). */
  setSipLinkStatus: (status: SipLinkStatus) => void;
  setCallDuration: (seconds: number) => void;
  addWavoipToken: (key: string, data: { inboxName: string; token: string }) => void;
  removeWavoipToken: (key: string) => void;
  requestWavoipCall: (info: WebphoneState["pendingWavoipCall"]) => void;
  clearPendingWavoipCall: () => void;
  requestSipCall: (info: { phone: string; tag?: string }) => void;
  clearPendingSipCall: () => void;
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
  sipRegisterFailure: null,
  sipLinkState: "idle",
  wavoipTokens: {},
  pendingWavoipCall: null,
  pendingSipCall: null,

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

  // Registrar de novo no meio de uma chamada (reconexão) não pode trocar "Em chamada"
  // por "Registrado": os controles da chamada sumiriam.
  setSipRegistered: (registered) =>
    set((state) => ({
      sipRegistered: registered,
      sipRegisterFailure: null,
      sipLinkState: registered ? "registered" : "idle",
      callStatus: registered
        ? isSipCallActive(state.callStatus) ? state.callStatus : "registered"
        : "idle",
    })),

  setSipRegisterFailure: (failure) =>
    set((state) => ({
      sipRegistered: false,
      sipRegisterFailure: failure,
      sipLinkState: "error",
      callStatus:
        state.callStatus === "idle" || state.callStatus === "registering" || state.callStatus === "registered"
          ? "error"
          : state.callStatus,
    })),

  setSipLinkStatus: ({ state: linkState, failure }) =>
    set((state) => {
      const inCall = isSipCallActive(state.callStatus);
      const registered = linkState === "registered";
      const idleStatus: CallStatus =
        registered ? "registered" : linkState === "error" ? "error" : linkState === "idle" ? "idle" : "registering";
      return {
        sipLinkState: linkState,
        sipRegistered: registered,
        sipRegisterFailure: registered || linkState === "idle" ? null : failure,
        callStatus: inCall ? state.callStatus : idleStatus,
      };
    }),

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

  requestSipCall: (info) =>
    set({ pendingSipCall: { ...info, requestedAt: Date.now() }, isVisible: true }),

  clearPendingSipCall: () =>
    set({ pendingSipCall: null }),
  reset: () => set({ isVisible: false, callStatus: "idle", callInfo: null, callDuration: 0, isMuted: false, isOnHold: false, sipRegistered: false, sipRegisterFailure: null, sipLinkState: "idle", wavoipTokens: {}, pendingWavoipCall: null, pendingSipCall: null }),
}));
