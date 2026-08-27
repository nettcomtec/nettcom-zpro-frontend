import api from "@/lib/api"

export interface WabaCallInitiateParams {
  whatsappId: number
  to: string
  sdpOffer: string
  bizOpaqueCallbackData?: string
}

export interface WabaCallActionParams {
  whatsappId: number
  callId: string
  sdpAnswer?: string
  bizOpaqueCallbackData?: string
}

export async function initiateWabaCall(params: WabaCallInitiateParams) {
  const { data } = await api.post('/waba/calls/initiate', params)
  return data
}

export async function preAcceptWabaCall(params: WabaCallActionParams) {
  const { data } = await api.post('/waba/calls/pre-accept', params)
  return data
}

export async function acceptWabaCall(params: WabaCallActionParams) {
  const { data } = await api.post('/waba/calls/accept', params)
  return data
}

export async function rejectWabaCall(params: Pick<WabaCallActionParams, 'whatsappId' | 'callId'>) {
  const { data } = await api.post('/waba/calls/reject', params)
  return data
}

export async function terminateWabaCall(params: Pick<WabaCallActionParams, 'whatsappId' | 'callId'>) {
  const { data } = await api.post('/waba/calls/terminate', params)
  return data
}

export interface WabaCallClaimResponse {
  callId: string
  claimedByUserId: number | null
  claimedAt: string | null
}

export async function claimWabaCall(params: { callId: string }) {
  const { data } = await api.post<WabaCallClaimResponse>(`/waba-calls/${encodeURIComponent(params.callId)}/claim`)
  return data
}

export async function releaseWabaCall(params: { callId: string }) {
  const { data } = await api.post(`/waba-calls/${encodeURIComponent(params.callId)}/release`)
  return data
}

export interface WabaCallPermissionRequestParams {
  tokenApi: string
  from: string
  ticketId: number
  bodyText?: string
}

export interface WabaCallPermissionRequestResponse {
  messageId: string | null
  alreadyAllowed?: boolean
}

export async function sendWabaCallPermissionRequest(params: WabaCallPermissionRequestParams) {
  const { data } = await api.post<WabaCallPermissionRequestResponse>('/waba/calls/permission-request', params)
  return data
}
