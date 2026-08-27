// Cache + fetcher do quality_rating do número Dialog360.
// 360dialog expõe o quality_rating no GET /v1/configs/phone_numbers ou no
// próprio webhook de partner — o backend consolida e devolve via endpoint
// `/dialog360/phoneNumbers`.

import { fetchDialog360QualityRating } from "@/services/dialog360-health"

export type Dialog360QualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN"

const CACHE_TTL_MS = 5 * 60 * 1000
type CacheEntry = {
  quality_rating?: string
  display_phone_number?: string
  error?: string
  ts: number
}
const qualityCache = new Map<string, CacheEntry>()

function cacheKey(
  channelId: number | string,
  phoneHint: string | null | undefined,
): string {
  return `${channelId}::${(phoneHint ?? "").trim()}`
}

/** Limpa o cache manualmente (útil após reconectar / rotacionar a API key). */
export function clearDialog360PhoneQualityCache(): void {
  qualityCache.clear()
}

export interface Dialog360PhoneNumberRow {
  id?: string
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
  status?: string
  throughput?: unknown
}

/** Mapa de classes Tailwind para cada quality_rating. */
export function dialog360QualityRatingBadgeClasses(
  rating?: string | null,
): string {
  const r = (rating ?? "").toUpperCase()
  if (r === "GREEN")
    return "bg-green-500 hover:bg-green-500/90 text-white border-transparent"
  if (r === "YELLOW")
    return "bg-yellow-400 hover:bg-yellow-400/90 text-black border-transparent"
  if (r === "RED")
    return "bg-red-500 hover:bg-red-500/90 text-white border-transparent"
  return "bg-muted text-muted-foreground border-transparent"
}

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "")
}

/**
 * Busca quality_rating do canal Dialog360 via backend.
 * O backend é responsável por chamar 360dialog com o header `D360-API-KEY`.
 * Se `phoneHint` for fornecido, escolhe o número correspondente; caso
 * contrário retorna o primeiro.
 */
export async function fetchDialog360PhoneQualityRating(params: {
  channelId: number | string | null
  phoneHint?: string | null
}): Promise<{
  quality_rating?: string
  display_phone_number?: string
  error?: string
}> {
  const channelId = params.channelId
  if (!channelId) return {}

  const key = cacheKey(channelId, params.phoneHint)
  const cached = qualityCache.get(key)
  const now = Date.now()
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    const { ts: _ts, ...rest } = cached
    return rest
  }

  const store = (res: {
    quality_rating?: string
    display_phone_number?: string
    error?: string
  }) => {
    qualityCache.set(key, { ...res, ts: Date.now() })
    return res
  }

  try {
    const data = await fetchDialog360QualityRating({
      channelId,
      phoneHint: params.phoneHint || null,
    })
    const phones: Dialog360PhoneNumberRow[] = Array.isArray(
      (data as { data?: unknown })?.data,
    )
      ? ((data as { data: Dialog360PhoneNumberRow[] }).data)
      : Array.isArray(data)
        ? (data as unknown as Dialog360PhoneNumberRow[])
        : []
    if (phones.length === 0) return store({})

    const hint = (params.phoneHint || "").trim()
    if (hint) {
      const byId = phones.find((p) => p.id && String(p.id) === hint)
      if (byId?.quality_rating) {
        return store({
          quality_rating: byId.quality_rating,
          display_phone_number: byId.display_phone_number,
        })
      }
      const hintDigits = digitsOnly(hint)
      if (hintDigits.length >= 8) {
        const byDisplay = phones.find((p) => {
          const d = digitsOnly(p.display_phone_number)
          return (
            d &&
            (d === hintDigits ||
              d.endsWith(hintDigits) ||
              hintDigits.endsWith(d))
          )
        })
        if (byDisplay?.quality_rating) {
          return store({
            quality_rating: byDisplay.quality_rating,
            display_phone_number: byDisplay.display_phone_number,
          })
        }
      }
    }

    const first = phones[0]
    return store(
      first?.quality_rating
        ? {
            quality_rating: first.quality_rating,
            display_phone_number: first.display_phone_number,
          }
        : {},
    )
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Erro ao buscar qualidade Dialog360"
    return { error: msg }
  }
}
