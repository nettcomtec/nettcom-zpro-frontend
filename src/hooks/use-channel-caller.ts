// Hook wrapper que retorna um conjunto unificado de funcoes de Calls
// (initiate/preAccept/accept/reject/terminate/permissionRequest/claim/release)
// conforme o tipo do canal (whatsapp.type). Permite que UIs de chamada
// tratem WABA, Dialog360 e Gupshup como uma unica abstracao "BSP-call".

import {
  initiateWabaCall,
  preAcceptWabaCall,
  acceptWabaCall,
  rejectWabaCall,
  terminateWabaCall,
  claimWabaCall,
  releaseWabaCall,
  sendWabaCallPermissionRequest,
} from "@/services/waba-calls";

import {
  initiateDialog360Call,
  preAcceptDialog360Call,
  acceptDialog360Call,
  rejectDialog360Call,
  terminateDialog360Call,
  claimDialog360Call,
  releaseDialog360Call,
  sendDialog360CallPermissionRequest,
} from "@/services/dialog360-calls";

import {
  initiateGupshupCall,
  preAcceptGupshupCall,
  acceptGupshupCall,
  rejectGupshupCall,
  terminateGupshupCall,
  claimGupshupCall,
  releaseGupshupCall,
  sendGupshupCallPermissionRequest,
} from "@/services/gupshup-calls";

// Conjunto canonico de funcoes de chamada que cada BSP precisa expor.
// Tipagem propositalmente larga (any) pois assinaturas variam entre BSPs.
export interface ChannelCallerSet {
  initiateCall: (params: any) => Promise<any>;
  preAccept: (params: any) => Promise<any>;
  accept: (params: any) => Promise<any>;
  reject: (params: any) => Promise<any>;
  terminate: (params: any) => Promise<any>;
  permissionRequest: (params: any) => Promise<any>;
  claim: (params: { callId: string }) => Promise<any>;
  release: (params: { callId: string }) => Promise<any>;
  channel: "waba" | "dialog360" | "gupshup";
}

const WABA_CALLER: ChannelCallerSet = {
  initiateCall: initiateWabaCall,
  preAccept: preAcceptWabaCall,
  accept: acceptWabaCall,
  reject: rejectWabaCall,
  terminate: terminateWabaCall,
  permissionRequest: sendWabaCallPermissionRequest,
  claim: claimWabaCall,
  release: releaseWabaCall,
  channel: "waba",
};

const DIALOG360_CALLER: ChannelCallerSet = {
  initiateCall: initiateDialog360Call,
  preAccept: preAcceptDialog360Call,
  accept: acceptDialog360Call,
  reject: rejectDialog360Call,
  terminate: terminateDialog360Call,
  permissionRequest: sendDialog360CallPermissionRequest,
  claim: claimDialog360Call,
  release: releaseDialog360Call,
  channel: "dialog360",
};

const GUPSHUP_CALLER: ChannelCallerSet = {
  initiateCall: initiateGupshupCall,
  preAccept: preAcceptGupshupCall,
  accept: acceptGupshupCall,
  reject: rejectGupshupCall,
  terminate: terminateGupshupCall,
  permissionRequest: sendGupshupCallPermissionRequest,
  claim: claimGupshupCall,
  release: releaseGupshupCall,
  channel: "gupshup",
};

/**
 * Retorna o conjunto de funcoes de chamada adequado ao tipo do canal.
 * Default = WABA (caso o caller passe um type desconhecido ou undefined).
 */
export function useChannelCaller(type: string | undefined): ChannelCallerSet {
  if (type === "dialog360") return DIALOG360_CALLER;
  if (type === "gupshup") return GUPSHUP_CALLER;
  return WABA_CALLER;
}
