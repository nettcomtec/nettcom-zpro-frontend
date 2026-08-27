import api from "@/lib/api"
import type { Dialog360HealthCheckResult } from "@/types/dialog360"

/** Endpoint principal de saúde do canal Dialog360. */
export async function fetchDialog360Health(channelId: number | string) {
  const { data } = await api.get<Dialog360HealthCheckResult>(
    `/dialog360/channels/${channelId}/health`,
  )
  return data
}

/** Lista de números do canal Dialog360 com quality_rating. */
export async function fetchDialog360QualityRating(params: {
  channelId: number | string
  phoneHint?: string | null
}) {
  const { data } = await api.get(
    `/dialog360/channels/${params.channelId}/phoneNumbers`,
    {
      params: params.phoneHint ? { phoneHint: params.phoneHint } : undefined,
    },
  )
  return data
}

/** Diagnóstico completo (similar a `metaChannelDiagnose`). */
export async function diagnoseDialog360(channelId: number | string) {
  const { data } = await api.get<Dialog360HealthCheckResult>(
    `/dialog360/channels/${channelId}/diagnose`,
  )
  return data
}
