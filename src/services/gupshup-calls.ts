// Servico Gupshup Calls — espelha waba-calls.ts apontando /gupshup/calls/*.
// NAO importa waba-calls.

import api from "@/lib/api"

export interface GupshupCallInitiateParams {
  whatsappId: number
  to: string
  sdpOffer: string
  bizOpaqueCallbackData?: string
  // O controller de initiate resolve canal e destinatario pelo ticketId; os
  // demais campos seguem sendo enviados (aditivo, backend ignora o que nao usa).
  ticketId?: number
}

export interface GupshupCallActionParams {
  whatsappId: number
  callId: string
  sdpAnswer?: string
  bizOpaqueCallbackData?: string
}

export async function initiateGupshupCall(params: GupshupCallInitiateParams) {
  const { data } = await api.post("/gupshup/calls/initiate", params)
  return data
}

export async function preAcceptGupshupCall(params: GupshupCallActionParams) {
  const { data } = await api.post("/gupshup/calls/pre-accept", params)
  return data
}

export async function acceptGupshupCall(params: GupshupCallActionParams) {
  const { data } = await api.post("/gupshup/calls/accept", params)
  return data
}

export async function rejectGupshupCall(
  params: Pick<GupshupCallActionParams, "whatsappId" | "callId">,
) {
  const { data } = await api.post("/gupshup/calls/reject", params)
  return data
}

export async function terminateGupshupCall(
  params: Pick<GupshupCallActionParams, "whatsappId" | "callId">,
) {
  const { data } = await api.post("/gupshup/calls/terminate", params)
  return data
}

export interface GupshupCallClaimResponse {
  callId: string
  claimedByUserId: number | null
  claimedAt: string | null
}

export async function claimGupshupCall(params: { callId: string }) {
  const { data } = await api.post<GupshupCallClaimResponse>(
    `/gupshup-calls/${encodeURIComponent(params.callId)}/claim`,
  )
  return data
}

export async function releaseGupshupCall(params: { callId: string }) {
  const { data } = await api.post(
    `/gupshup-calls/${encodeURIComponent(params.callId)}/release`,
  )
  return data
}

export interface GupshupCallPermissionRequestParams {
  tokenApi: string
  from: string
  ticketId: number
  bodyText?: string
}

export interface GupshupCallPermissionRequestResponse {
  messageId: string | null
  alreadyAllowed?: boolean
}

export async function sendGupshupCallPermissionRequest(
  params: GupshupCallPermissionRequestParams,
) {
  const { data } = await api.post<GupshupCallPermissionRequestResponse>(
    "/gupshup/calls/permission-request",
    params,
  )
  return data
}
