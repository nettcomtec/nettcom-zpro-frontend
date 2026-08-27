import api from "@/lib/api"

export interface Dialog360CallInitiateParams {
  whatsappId: number
  to: string
  sdpOffer: string
  bizOpaqueCallbackData?: string
}

export interface Dialog360CallActionParams {
  whatsappId: number
  callId: string
  sdpAnswer?: string
  bizOpaqueCallbackData?: string
}

export async function initiateDialog360Call(params: Dialog360CallInitiateParams) {
  const { data } = await api.post("/dialog360/calls/initiate", params)
  return data
}

export async function preAcceptDialog360Call(
  params: Dialog360CallActionParams,
) {
  const { data } = await api.post("/dialog360/calls/pre-accept", params)
  return data
}

export async function acceptDialog360Call(params: Dialog360CallActionParams) {
  const { data } = await api.post("/dialog360/calls/accept", params)
  return data
}

export async function rejectDialog360Call(
  params: Pick<Dialog360CallActionParams, "whatsappId" | "callId">,
) {
  const { data } = await api.post("/dialog360/calls/reject", params)
  return data
}

export async function terminateDialog360Call(
  params: Pick<Dialog360CallActionParams, "whatsappId" | "callId">,
) {
  const { data } = await api.post("/dialog360/calls/terminate", params)
  return data
}

export interface Dialog360CallClaimResponse {
  callId: string
  claimedByUserId: number | null
  claimedAt: string | null
}

export async function claimDialog360Call(params: { callId: string }) {
  const { data } = await api.post<Dialog360CallClaimResponse>(
    `/dialog360-calls/${encodeURIComponent(params.callId)}/claim`,
  )
  return data
}

export async function releaseDialog360Call(params: { callId: string }) {
  const { data } = await api.post(
    `/dialog360-calls/${encodeURIComponent(params.callId)}/release`,
  )
  return data
}

export interface Dialog360CallPermissionRequestParams {
  ticketId: number
  bodyText?: string
}

export interface Dialog360CallPermissionRequestResponse {
  messageId: string | null
  alreadyAllowed?: boolean
}

export async function sendDialog360CallPermissionRequest(
  params: Dialog360CallPermissionRequestParams,
) {
  const { data } = await api.post<Dialog360CallPermissionRequestResponse>(
    "/dialog360/calls/permission-request",
    params,
  )
  return data
}
