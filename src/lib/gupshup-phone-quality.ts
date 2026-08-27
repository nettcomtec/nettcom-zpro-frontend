// Helper independente de qualidade do numero Gupshup (BSP).
// Equivalente a waba-phone-quality.ts mas chamando endpoints /gupshup/* — NAO
// importa waba-phone-quality nem reusa o cache do WABA.

import api from "@/lib/api"

export type GupshupQualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN"

const CACHE_TTL_MS = 5 * 60 * 1000
type CacheEntry = {
  quality_rating?: string
  display_phone_number?: string
  error?: string
  ts: number
}
const qualityCache = new Map<string, CacheEntry>()

function cacheKey(appId: string, phoneHint: string | null | undefined): string {
  return `${appId}::${(phoneHint ?? "").trim()}`
}

/** Limpa o cache manualmente (apos reconectar ou refresh do app_token). */
export function clearGupshupPhoneQualityCache() {
  qualityCache.clear()
}

export interface GupshupPhoneNumberRow {
  id?: string
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
  status?: string
  throughput?: unknown
}

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "")
}

/** Classes Tailwind para badge baseado em quality_rating. */
export function gupshupQualityRatingBadgeClasses(
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

/**
 * Busca quality_rating do numero via backend `/gupshup/phone-numbers/:appId`.
 * O backend internamente chama o Partner Gupshup endpoint de phone-numbers.
 * Diferente do WABA Meta, NAO precisamos validar/derivar token aqui — o
 * backend ja resolve via app_token do GupshupChannel.
 */
export async function fetchGupshupPhoneQualityRating(params: {
  appId?: string | null
  whatsappId?: number | null
  phoneHint?: string | null
}): Promise<{
  quality_rating?: string
  display_phone_number?: string
  error?: string
}> {
  const appId = (params.appId ?? "").trim()
  if (!appId && !params.whatsappId) return {}

  const key = cacheKey(appId || `wid:${params.whatsappId}`, params.phoneHint)
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
    const url = appId
      ? `/gupshup/phone-numbers/${encodeURIComponent(appId)}`
      : `/gupshup/phone-numbers-by-whatsapp/${params.whatsappId}`
    const { data } = await api.get<unknown>(url)
    const phones: GupshupPhoneNumberRow[] = Array.isArray(
      (data as { data?: unknown })?.data,
    )
      ? ((data as { data: GupshupPhoneNumberRow[] }).data)
      : Array.isArray(data)
        ? (data as GupshupPhoneNumberRow[])
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
            (d === hintDigits || d.endsWith(hintDigits) || hintDigits.endsWith(d))
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
    const msg = err instanceof Error ? err.message : "Erro Gupshup phone quality"
    // Nao cacheia erros — proxima tentativa pode retentar
    return { error: msg }
  }
}
