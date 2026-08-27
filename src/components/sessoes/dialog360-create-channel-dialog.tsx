"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, ExternalLink, KeyRound } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  createDialog360Channel,
  manualOnboardDialog360,
  onboardDialog360Partner,
  takeoverDialog360Registry,
} from "@/services/dialog360"
import { useDialog360ProxyPopup } from "@/hooks/use-dialog360-proxy-popup"
import { useAuthStore } from "@/stores/auth-store"
import { fetchTenantById } from "@/services/tenants"
import { Dialog360HijackTakeoverDialog } from "@/components/common/dialog360-hijack-takeover-dialog"
import type { Dialog360HijackDetails } from "@/types/dialog360"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  // Quando true, esconde aba Manual e força fluxo OAuth (usado em
  // "Conectar" de canal órfão — manual entry não revalida licença via proxy).
  onboardingOnly?: boolean
  // Pré-preenche o campo Nome (útil em reconexão de canal órfão).
  defaultName?: string
}

/**
 * Dialog para criar um canal Dialog360. Suporta dois modos:
 *  - Onboarding via popup OAuth no oauth-proxy (`/dialog360-signup`).
 *  - Manual com chave D360-API-KEY emitida no WABA Manager.
 */
export function Dialog360CreateChannelDialog({
  open,
  onOpenChange,
  onCreated,
  onboardingOnly = false,
  defaultName = "",
}: Props) {
  const t = useTranslations("dialog360")
  const { user } = useAuthStore()
  const { open: openPopup } = useDialog360ProxyPopup()

  const [submitting, setSubmitting] = useState(false)
  const [hijack, setHijack] = useState<{
    open: boolean
    details: Dialog360HijackDetails | null
    pendingPayload: Record<string, unknown> | null
  }>({ open: false, details: null, pendingPayload: null })

  // Manual fields.
  const [name, setName] = useState(defaultName)

  // Repopula o nome quando o dialog reabre (ex: reconexão de outro órfão).
  useEffect(() => {
    if (open) setName(defaultName || "")
  }, [open, defaultName])

  const [apiKey, setApiKey] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [wabaId, setWabaId] = useState("")
  const [greetingMessage, setGreetingMessage] = useState("")

  const resetManualFields = useCallback(() => {
    setName("")
    setApiKey("")
    setPhoneNumberId("")
    setWabaId("")
    setGreetingMessage("")
  }, [])

  const handleSubmitManual = useCallback(async () => {
    // Manual agora roteia pelo oauth-proxy: backend gera popup URL via
    // /dialog360manual-oauth/auth-url, popup HTML coleta dados, proxy valida
    // licença + relay RS256 → cria canal. Form local removido.
    setSubmitting(true)
    try {
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")
      const authToken = (localStorage.getItem("token") || "").replace(/^"|"$/g, "")
      const resp = await fetch(`${apiUrl}/dialog360manual-oauth/auth-url`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data?.authUrl) {
        toast.error(data?.message || t("createdError"))
        return
      }
      window.open(
        data.authUrl,
        "dialog360_manual_proxy",
        "width=560,height=720,scrollbars=yes,resizable=yes"
      )
    } catch (err: any) {
      toast.error(err?.message || t("createdError"))
    } finally {
      setSubmitting(false)
    }
  }, [t])

  // Listener postMessage do popup Manual (proxy → browser bounce do backend).
  useEffect(() => {
    if (!open) return
    function handler(event: MessageEvent) {
      const data = event.data as { type?: string; payload?: { whatsappId?: number; error?: string } }
      if (!data?.type) return
      if (data.type === "dialog360:manual:success") {
        toast.success(t("createdSuccess"))
        resetManualFields()
        onOpenChange(false)
        onCreated?.()
      } else if (data.type === "dialog360:manual:error") {
        toast.error(data.payload?.error || t("createdError"))
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [open, onCreated, onOpenChange, resetManualFields, t])

  const handleOnboardingClick = useCallback(async () => {
    if (!user?.tenantId) {
      toast.error(t("notAuthenticated"))
      return
    }
    // licenseKey = tenant.tenantEmail (registrado no LicenseBox).
    // user.email é o login do operador — não serve.
    let licenseKey = ""
    try {
      const { data } = await fetchTenantById(user.tenantId)
      const d = Array.isArray(data) ? data[0] : data
      licenseKey = (d as { tenantEmail?: string })?.tenantEmail || ""
    } catch {
      // ignore — popup vai falhar no validateLicense e mostra o erro pro user
    }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ""
    openPopup({
      credentials: {
        apiUrl,
        authToken: localStorage.getItem("token"),
        tenantId: user.tenantId,
        licenseKey,
      },
      onSuccess: async (data) => {
        try {
          await onboardDialog360Partner(
            data as unknown as Record<string, unknown>,
          )
          toast.success(t("createdSuccess"))
          onOpenChange(false)
          onCreated?.()
        } catch (err: unknown) {
          const e = err as { response?: { data?: { error?: string } } }
          toast.error(e.response?.data?.error || t("createdError"))
        }
      },
      onError: (msg, hijackPayload) => {
        if (hijackPayload) {
          setHijack({
            open: true,
            details: {
              apiUrlMasked: hijackPayload.apiUrlMasked,
              registeredAt: hijackPayload.registeredAt,
              identifier: hijackPayload.identifier,
              callbackUrl: hijackPayload.callbackUrl,
            },
            pendingPayload: { identifier: hijackPayload.identifier },
          })
          return
        }
        toast.error(msg)
      },
      onCancelled: () => {
        // ignore — user closed popup
      },
    })
  }, [onCreated, onOpenChange, openPopup, t, user])

  const handleHijackConfirm = useCallback(async () => {
    if (!hijack.pendingPayload) return
    setSubmitting(true)
    try {
      await takeoverDialog360Registry({
        ...(hijack.pendingPayload as {
          phoneNumberId?: string
          wabaId?: string
          identifier?: string
        }),
        confirm: true,
      })
      toast.success(t("takeoverSuccess"))
      setHijack({ open: false, details: null, pendingPayload: null })
      // tenta criar novamente com o canal liberado.
      if ("apiKey" in (hijack.pendingPayload as Record<string, unknown>)) {
        await handleSubmitManual()
      } else {
        onOpenChange(false)
        onCreated?.()
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e.response?.data?.error || t("takeoverError"))
    } finally {
      setSubmitting(false)
    }
  }, [
    handleSubmitManual,
    hijack.pendingPayload,
    onCreated,
    onOpenChange,
    t,
  ])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("createChannelTitle")}</DialogTitle>
            <DialogDescription>{t("createChannelDesc")}</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="manual" className="w-full">
            {!onboardingOnly && (
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual">{t("tabManual")}</TabsTrigger>
                <TabsTrigger value="onboarding">
                  {t("tabOnboarding")}
                </TabsTrigger>
              </TabsList>
            )}

            {!onboardingOnly && (
            <TabsContent value="manual" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                {t("manualDescription")}
              </p>
              <p className="text-xs text-muted-foreground">
                Os campos (D360-API-KEY, Phone Number ID, WABA ID) são preenchidos diretamente no popup seguro hospedado em oauth.techprovider.com.br, com validação de licença antes do envio. Clique abaixo para abrir.
              </p>
              <Button onClick={handleSubmitManual} disabled={submitting} className="w-full">
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <KeyRound className="w-4 h-4 mr-2" />
                {t("saveManual")}
              </Button>
            </TabsContent>
            )}

            <TabsContent value="onboarding" className="space-y-3 pt-3">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                {t("onboardingPartnerOnlyWarning")}
              </div>
              <p className="text-sm text-muted-foreground">
                {t("onboardingDescription")}
              </p>
              <Button
                onClick={handleOnboardingClick}
                disabled={submitting}
                className="w-full"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {t("connectViaDialog360")}
              </Button>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog360HijackTakeoverDialog
        open={hijack.open}
        details={hijack.details}
        loading={submitting}
        onCancel={() =>
          setHijack({ open: false, details: null, pendingPayload: null })
        }
        onConfirm={handleHijackConfirm}
      />
    </>
  )
}

// Note about createDialog360Channel: keeps the export reachable in case the
// host needs raw channel creation without onboarding flow.
export { createDialog360Channel }
