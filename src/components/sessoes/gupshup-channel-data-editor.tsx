"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getGupshupChannel, updateGupshupChannel } from "@/services/gupshup"

interface Props {
  whatsappId: number
  onSaved?: () => void
}

/**
 * Editor pos-criacao dos dados do canal Gupshup (os mesmos campos do popup de
 * onboarding manual): Nome do app na Gupshup (src.name), App ID, API Token,
 * Numero de telefone, Phone Number ID, WABA ID. Corrige dado errado sem SQL.
 *
 * GET /gupshup/channels/:whatsappId pre-preenche; PUT salva. O token vem
 * mascarado — campo vazio = mantem o atual.
 */
export function GupshupChannelDataEditor({ whatsappId, onSaved }: Props) {
  const t = useTranslations("gupshupChannelEditor")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [appName, setAppName] = useState("")
  const [appId, setAppId] = useState("")
  const [appToken, setAppToken] = useState("")
  const [businessPhone, setBusinessPhone] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [wabaId, setWabaId] = useState("")
  const [tokenSet, setTokenSet] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getGupshupChannel(whatsappId)
      .then(({ data }) => {
        if (!alive) return
        const d = data as Record<string, unknown>
        setAppName(String(d?.appName || ""))
        setAppId(String(d?.appId || ""))
        setBusinessPhone(String(d?.businessPhone || ""))
        setPhoneNumberId(String(d?.phoneNumberId || ""))
        setWabaId(String(d?.wabaIdMeta || d?.wabaId || ""))
        setTokenSet(!!d?.appTokenSet)
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
    const filled =
      appName.trim() &&
      appId.trim() &&
      businessPhone.trim() &&
      phoneNumberId.trim() &&
      wabaId.trim() &&
      (tokenSet || appToken.trim())
    if (!filled) {
      toast.warning(t("requiredFields"))
      return
    }
    setSaving(true)
    try {
      await updateGupshupChannel(whatsappId, {
        appName: appName.trim(),
        appId: appId.trim(),
        businessPhone: businessPhone.trim(),
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaId.trim(),
        ...(appToken.trim() ? { appToken: appToken.trim() } : {}),
      })
      toast.success(t("saved"))
      setAppToken("")
      setTokenSet(true)
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
        <Label className="text-xs">{t("appNameLabel")} *</Label>
        <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="zdgteste" />
        <p className="text-[11px] text-muted-foreground">{t("appNameHint")}</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("appIdLabel")} *</Label>
        <Input value={appId} onChange={(e) => setAppId(e.target.value)} className="font-mono text-xs" placeholder="f81c9d6c-9d3e-..." />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">
          {t("appTokenLabel")} {tokenSet ? "" : "*"}
        </Label>
        <Input
          type="password"
          value={appToken}
          onChange={(e) => setAppToken(e.target.value)}
          className="font-mono text-xs"
          placeholder={t("tokenPlaceholder")}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("businessPhoneLabel")} *</Label>
        <Input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} className="font-mono text-xs" placeholder="15559627692" />
        <p className="text-[11px] text-muted-foreground">{t("businessPhoneHint")}</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("phoneNumberIdLabel")} *</Label>
        <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="font-mono text-xs" placeholder="1076986112173356" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("wabaIdLabel")} *</Label>
        <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="font-mono text-xs" placeholder="365441016653551" />
      </div>

      <Button type="button" onClick={handleSave} disabled={saving} size="sm">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        {t("save")}
      </Button>
    </div>
  )
}
