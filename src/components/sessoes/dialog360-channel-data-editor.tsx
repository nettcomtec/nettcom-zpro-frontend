"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getDialog360Channel, updateDialog360Channel } from "@/services/dialog360"

interface Props {
  whatsappId: number
  onSaved?: () => void
}

/**
 * Editor pos-criacao dos dados do canal Dialog360 (campos do popup de onboarding
 * manual): D360-API-KEY (apiKey), WABA Channel External ID (phoneNumberId) e
 * WhatsApp Business Account ID (wabaIdMeta). Corrige dado errado sem SQL.
 *
 * GET /dialog360/channels/:whatsappId pre-preenche; PUT salva. A apiKey vem
 * mascarada — campo vazio = mantem a atual.
 */
export function Dialog360ChannelDataEditor({ whatsappId, onSaved }: Props) {
  const t = useTranslations("dialog360ChannelEditor")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [wabaId, setWabaId] = useState("")
  const [keySet, setKeySet] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getDialog360Channel(whatsappId)
      .then(({ data }) => {
        if (!alive) return
        const d = data as Record<string, unknown>
        setPhoneNumberId(String(d?.phoneNumberId || ""))
        setWabaId(String(d?.wabaIdMeta || d?.wabaId || ""))
        setKeySet(!!d?.apiKeySet)
      })
      .catch(() => {
        if (alive) toast.error(t("loadError"))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [whatsappId, t])

  async function handleSave() {
    const filled = phoneNumberId.trim() && wabaId.trim() && (keySet || apiKey.trim())
    if (!filled) {
      toast.warning(t("requiredFields"))
      return
    }
    setSaving(true)
    try {
      await updateDialog360Channel(whatsappId, {
        phoneNumberId: phoneNumberId.trim(),
        wabaIdMeta: wabaId.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      })
      toast.success(t("saved"))
      setApiKey("")
      setKeySet(true)
      onSaved?.()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err?.response?.data?.error || t("saveError"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-4 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        {t("loading")}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("description")}</p>

      <div className="space-y-1">
        <Label className="text-xs">
          {t("apiKeyLabel")} {keySet ? "" : "*"}
        </Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="font-mono text-xs"
          placeholder={t("tokenPlaceholder")}
        />
        <p className="text-[11px] text-muted-foreground">{t("apiKeyHint")}</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("phoneNumberIdLabel")} *</Label>
        <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="font-mono text-xs" placeholder="1039841329221871" />
        <p className="text-[11px] text-muted-foreground">{t("phoneNumberIdHint")}</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("wabaIdLabel")} *</Label>
        <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="font-mono text-xs" placeholder="1701104247762766" />
        <p className="text-[11px] text-muted-foreground">{t("wabaIdHint")}</p>
      </div>

      <Button type="button" onClick={handleSave} disabled={saving} size="sm">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        {t("save")}
      </Button>
    </div>
  )
}
