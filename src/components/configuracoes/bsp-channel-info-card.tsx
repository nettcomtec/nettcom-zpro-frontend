"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, BadgeCheck, BadgeAlert, BadgeX, BadgeIcon as BadgeIconCircle, ShieldCheck, ShieldAlert, Phone, BarChart3, Hash } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import api from "@/lib/api"

type ChannelType = "dialog360" | "gupshup"

interface PhoneInfo {
  id?: string | null
  display_phone_number?: string | null
  verified_name?: string | null
  status?: string | null
  quality_rating?: string | null
  code_verification_status?: string | null
  platform_type?: string | null
  throughput?: { level?: string } | string | null
}

interface Props {
  whatsappId: number
  channelType: ChannelType
  channelName?: string | null
}

function qualityColor(rating?: string | null): string {
  const r = String(rating || "").toUpperCase()
  if (r === "GREEN" || r === "HIGH") return "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400"
  if (r === "YELLOW" || r === "MEDIUM") return "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400"
  if (r === "RED" || r === "LOW") return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400"
  return "bg-muted text-muted-foreground border-transparent"
}

function QualityIcon({ rating }: { rating?: string | null }) {
  const r = String(rating || "").toUpperCase()
  if (r === "GREEN" || r === "HIGH") return <BadgeCheck className="w-4 h-4 text-green-500 dark:text-green-400 fill-green-500/15" />
  if (r === "YELLOW" || r === "MEDIUM") return <BadgeAlert className="w-4 h-4 text-yellow-500 dark:text-yellow-400 fill-yellow-500/15" />
  if (r === "RED" || r === "LOW") return <BadgeX className="w-4 h-4 text-red-500 dark:text-red-400 fill-red-500/15" />
  return <BadgeIconCircle className="w-4 h-4 text-muted-foreground/60" />
}

export function BspChannelInfoCard({ whatsappId, channelType, channelName }: Props) {
  const t = useTranslations("bspChannelInfo")
  const [info, setInfo] = useState<PhoneInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!whatsappId) return
    setLoading(true)
    setError(null)
    const url =
      channelType === "dialog360"
        ? `/dialog360/channels/${whatsappId}/phoneNumbers`
        : `/gupshup/phone-numbers-by-whatsapp/${whatsappId}`
    api
      .get(url)
      .then((res) => {
        if (cancelled) return
        const first = Array.isArray(res.data?.data) ? res.data.data[0] : null
        setInfo(first || {})
      })
      .catch(() => {
        if (cancelled) return
        setError(t("loadError"))
        setInfo({})
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [whatsappId, channelType, t])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            {channelName || t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  let throughputLevel: string | null | undefined = null
  const tp = info?.throughput
  if (tp) {
    if (typeof tp === "string") {
      throughputLevel = tp
    } else if (typeof tp === "object" && "level" in tp) {
      throughputLevel = tp.level || null
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="w-4 h-4" />
          {channelName || t("title")}
        </CardTitle>
        {channelType === "dialog360" ? (
          <CardDescription>{t("descDialog360")}</CardDescription>
        ) : (
          <CardDescription>{t("descGupshup")}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-xs text-muted-foreground">{error}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              icon={<Hash className="w-3.5 h-3.5" />}
              label={t("displayPhone")}
              value={info?.display_phone_number}
            />
            <Field
              icon={<Hash className="w-3.5 h-3.5" />}
              label={t("phoneNumberId")}
              value={info?.id}
              mono
            />
            <Field
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              label={t("verifiedName")}
              value={info?.verified_name}
            />
            <Field
              icon={<ShieldAlert className="w-3.5 h-3.5" />}
              label={t("codeVerification")}
              value={info?.code_verification_status}
            />
            <Field
              icon={<BarChart3 className="w-3.5 h-3.5" />}
              label={t("status")}
              value={info?.status}
            />
            <Field
              icon={<BarChart3 className="w-3.5 h-3.5" />}
              label={t("throughput")}
              value={throughputLevel}
            />
            <div className="flex items-start gap-2 sm:col-span-2">
              <QualityIcon rating={info?.quality_rating} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{t("quality")}</p>
                {info?.quality_rating ? (
                  <Badge variant="outline" className={qualityColor(info.quality_rating)}>
                    {info.quality_rating}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("unknown")}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Field({
  icon,
  label,
  value,
  mono = false,
}: {
  icon?: React.ReactNode
  label: string
  value?: string | null
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="mt-0.5 text-muted-foreground flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-medium truncate ${mono ? "font-mono text-xs" : ""}`}>
          {value || <span className="text-muted-foreground">—</span>}
        </p>
      </div>
    </div>
  )
}

export default BspChannelInfoCard
