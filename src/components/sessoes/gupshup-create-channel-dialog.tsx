"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Plug, KeyRound, Sparkles } from "lucide-react"
import { toast } from "sonner"
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useGupshupProxyPopup } from "@/hooks/use-gupshup-proxy-popup"
import { useAuthStore } from "@/stores/auth-store"
import { fetchTenantById } from "@/services/tenants"
import {
  createGupshupChannelManual,
  createGupshupChannelFromSignup,
} from "@/services/gupshup"
import { GupshupHijackTakeoverDialog } from "@/components/common/gupshup-hijack-takeover-dialog"
import { takeoverGupshupRegistry } from "@/services/gupshup"
import type {
  GupshupCreateChannelMode,
  GupshupHijackDetails,
} from "@/types/gupshup"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  // appGupshupId opcional — quando setado o popup usa app proprio do tenant
  // ao inves do hardcoded do proxy.
  appGupshupId?: number | null
  // Quando true, esconde aba Manual e força fluxo Embedded Signup (usado em
  // "Conectar" de canal órfão — manual entry não revalida licença via proxy).
  onboardingOnly?: boolean
  // Pré-preenche o campo Nome (útil em reconexão de canal órfão).
  defaultName?: string
}

export function GupshupCreateChannelDialog({
  open,
  onOpenChange,
  onCreated,
  appGupshupId = null,
  onboardingOnly = false,
  defaultName = "",
}: Props) {
  const t = useTranslations("gupshupCreateChannel")
  const { user, token } = useAuthStore()
  const { open: openPopup } = useGupshupProxyPopup()

  const [mode, setMode] = useState<GupshupCreateChannelMode>("manual")
  const [submitting, setSubmitting] = useState(false)

  // Manual mode fields
  const [name, setName] = useState(defaultName)
  // appId Gupshup também usado no fluxo signup (Embedded Signup é PARA um
  // app existente — Partner API exige appId). User pode obter no painel
  // partner.gupshup.io após criar app via Solution ID.
  const [signupAppId, setSignupAppId] = useState("")

  // Quando o dialog abre, repopula o nome com o defaultName (caso o pai mude
  // entre canais — ex: usuário fecha e abre noutro órfão).
  useEffect(() => {
    if (open) {
      setName(defaultName || "")
      setSignupAppId("")
    }
  }, [open, defaultName])

  // Listener postMessage do popup Manual (proxy → browser bounce do backend).
  useEffect(() => {
    if (!open) return
    function handler(event: MessageEvent) {
      const data = event.data as { type?: string; payload?: { whatsappId?: number; error?: string } }
      if (!data?.type) return
      if (data.type === "gupshup:manual:success") {
        toast.success(t("createdSuccess"))
        onCreated?.()
        onOpenChange(false)
      } else if (data.type === "gupshup:manual:error") {
        toast.error(data.payload?.error || t("createError"))
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [open, onCreated, onOpenChange, t])

  const [appId, setAppId] = useState("")
  const [appToken, setAppToken] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [wabaId, setWabaId] = useState("")

  // Hijack flow
  const [hijack, setHijack] = useState<GupshupHijackDetails | null>(null)
  const [hijackIdentifier, setHijackIdentifier] = useState<string | null>(null)
  const [hijackCallbackUrl, setHijackCallbackUrl] = useState<string | null>(null)
  const [hijackLoading, setHijackLoading] = useState(false)
  const [pendingSignupRetry, setPendingSignupRetry] = useState(false)

  function resetForm() {
    setName("")
    setAppId("")
    setAppToken("")
    setApiKey("")
    setPhoneNumberId("")
    setWabaId("")
    setHijack(null)
    setHijackIdentifier(null)
    setHijackCallbackUrl(null)
    setPendingSignupRetry(false)
  }

  function close() {
    if (submitting || hijackLoading) return
    resetForm()
    onOpenChange(false)
  }

  async function submitManual() {
    // Manual agora roteia pelo oauth-proxy: backend gera popup URL via
    // /gupshupmanual-oauth/auth-url, popup HTML coleta dados, proxy valida
    // licença + relay RS256 → cria canal. Form local removido.
    setSubmitting(true)
    try {
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")
      const resp = await fetch(`${apiUrl}/gupshupmanual-oauth/auth-url`, {
        headers: {
          Authorization: `Bearer ${(token || "").replace(/^"|"$/g, "")}`,
        },
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data?.authUrl) {
        toast.error(data?.message || t("createError"))
        return
      }
      window.open(
        data.authUrl,
        "gupshup_manual_proxy",
        "width=560,height=720,scrollbars=yes,resizable=yes"
      )
      // Popup aberto = feedback visual suficiente; canal aparece via
      // postMessage('gupshup:manual:success') -> onCreated
    } catch (err: any) {
      toast.error(err?.message || t("createError"))
    } finally {
      setSubmitting(false)
    }
  }

  async function startSignup() {
    if (!user) {
      toast.error(t("notLoggedIn"))
      return
    }
    // apiUrl = backend URL (NEXT_PUBLIC_API_URL), não origin do front.
    // licenseKey = tenant.tenantEmail (registrado no LicenseBox).
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ""
    let licenseKey = ""
    try {
      const { data } = await fetchTenantById(user.tenantId)
      const d = Array.isArray(data) ? data[0] : data
      licenseKey = (d as { tenantEmail?: string })?.tenantEmail || ""
    } catch {
      // ignore — popup vai falhar no validateLicense e mostra o erro
    }

    openPopup({
      credentials: {
        apiUrl,
        authToken: token,
        tenantId: user.tenantId,
        licenseKey,
        appGupshupId,
        webhookOrigin: appGupshupId ? "own_app" : "zdg_oauth",
        gupshupAppId: signupAppId.trim(),
      },
      onSuccess: async (data) => {
        if (!data.appId) {
          toast.error(t("signupNoAppId"))
          return
        }
        setSubmitting(true)
        try {
          await createGupshupChannelFromSignup({
            name: data.appName || name.trim() || data.appId,
            appId: data.appId,
            appToken: data.appToken,
            apiKey: data.apiKey,
            phoneNumberId: data.phone_number_id || data.phoneNumberId,
            wabaId: data.waba_id || data.wabaId,
            partnerEmail: data.partnerEmail,
          })
          toast.success(t("createdSuccess"))
          onCreated?.()
          resetForm()
          onOpenChange(false)
        } catch (err: unknown) {
          const ax = err as {
            response?: { status?: number; data?: Record<string, unknown> }
          }
          const status = ax?.response?.status
          const payload = ax?.response?.data
          if (status === 409 && payload?.hijack && payload?.existing) {
            const existing = payload.existing as {
              apiUrlMasked?: string
              registeredAt?: string | null
            }
            setHijack({
              apiUrlMasked: existing.apiUrlMasked || "***",
              registeredAt: existing.registeredAt || null,
              identifier: (payload.identifier as string) || data.appId,
              callbackUrl: (payload.callbackUrl as string) || null,
            })
            setHijackIdentifier((payload.identifier as string) || data.appId)
            setHijackCallbackUrl((payload.callbackUrl as string) || null)
            setPendingSignupRetry(true)
          } else {
            toast.error(t("createError"))
          }
        } finally {
          setSubmitting(false)
        }
      },
      onError: (msg, hijackPayload) => {
        if (hijackPayload) {
          setHijack({
            apiUrlMasked: hijackPayload.apiUrlMasked,
            registeredAt: hijackPayload.registeredAt,
            identifier: hijackPayload.identifier,
            callbackUrl: hijackPayload.callbackUrl,
          })
          setHijackIdentifier(hijackPayload.identifier)
          setHijackCallbackUrl(hijackPayload.callbackUrl)
          setPendingSignupRetry(true)
        } else {
          toast.error(t("signupErrorWithCode", { code: msg }))
        }
      },
      onCancelled: () => {
        toast.info(t("signupCancelled"))
      },
    })
  }

  async function confirmTakeover() {
    if (!hijackIdentifier) return
    setHijackLoading(true)
    try {
      await takeoverGupshupRegistry({
        identifier: hijackIdentifier,
        callbackUrl: hijackCallbackUrl || "",
      })
      toast.success(t("takeoverSuccess"))
      setHijack(null)
      // Apos takeover, reexecuta o fluxo apropriado
      if (pendingSignupRetry) {
        setPendingSignupRetry(false)
        startSignup()
      } else {
        await submitManual()
      }
    } catch {
      toast.error(t("takeoverError"))
    } finally {
      setHijackLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-lg w-full sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="w-4 h-4" />
              {t("title")}
            </DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as GupshupCreateChannelMode)}
            className="w-full"
          >
            {!onboardingOnly && (
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="manual">
                  <KeyRound className="w-3.5 h-3.5 mr-1" />
                  {t("modeManual")}
                </TabsTrigger>
                <TabsTrigger value="signup">
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  {t("modeSignup")}
                </TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="signup" className="space-y-3 mt-3">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                {t("onboardingPartnerOnlyWarning")}
              </div>
              <Alert>
                <AlertDescription className="text-xs">
                  {t("signupHint")}
                </AlertDescription>
              </Alert>
              <div className="space-y-1">
                <Label htmlFor="gupshup-signup-name">{t("nameLabel")}</Label>
                <Input
                  id="gupshup-signup-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("nameHint")}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="gupshup-signup-appid">{t("appIdLabel")}</Label>
                <Input
                  id="gupshup-signup-appid"
                  value={signupAppId}
                  onChange={(e) => setSignupAppId(e.target.value)}
                  placeholder="ex: f81c9d6c-..."
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("signupAppIdHint")}
                </p>
              </div>
              <Button onClick={startSignup} disabled={submitting || !signupAppId.trim()} className="w-full">
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {t("startSignup")}
              </Button>
            </TabsContent>

            {!onboardingOnly && (
            <TabsContent value="manual" className="space-y-3 mt-3">
              <Alert>
                <AlertDescription className="text-xs">
                  {t("manualHint")}
                </AlertDescription>
              </Alert>
              <p className="text-xs text-muted-foreground">
                Os campos (App ID, App Token, API Key, Phone Number ID, WABA ID) são preenchidos diretamente no popup seguro hospedado em oauth.techprovider.com.br, com validação de licença antes do envio. Clique abaixo para abrir.
              </p>
              <Button
                onClick={submitManual}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plug className="w-4 h-4 mr-2" />
                )}
                {t("createButton")}
              </Button>
            </TabsContent>
            )}
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={submitting}>
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GupshupHijackTakeoverDialog
        open={!!hijack}
        details={hijack}
        loading={hijackLoading}
        onCancel={() => {
          if (hijackLoading) return
          setHijack(null)
          setPendingSignupRetry(false)
        }}
        onConfirm={confirmTakeover}
      />
    </>
  )
}
