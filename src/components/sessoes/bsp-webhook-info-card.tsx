"use client"

import { useEffect, useState } from "react"
import { Copy, ExternalLink, Info, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  getGupshupWebhookInfo,
  type GupshupWebhookInfo,
} from "@/services/gupshup"
import {
  getDialog360WebhookInfo,
  type Dialog360WebhookInfo,
} from "@/services/dialog360"

interface Props {
  channelType: "gupshup" | "dialog360"
  whatsappId: number
  /** Quando true, usa os endpoints cross-tenant /whatsappTenants/actions/* (página /sessoestenants, superadmin). */
  crossTenant?: boolean
}

/**
 * Card exibido em /sessoes (edit dialog ou ações do canal) com a URL de
 * webhook que o admin precisa colar no painel BSP quando o canal foi criado
 * via fluxo Manual (Customer Account). Inclui copy button + instruções +
 * lista de eventos a marcar.
 */
export function BspWebhookInfoCard({ channelType, whatsappId, crossTenant = false }: Props) {
  const [loading, setLoading] = useState(true)
  const [gupshup, setGupshup] = useState<GupshupWebhookInfo | null>(null)
  const [dialog360, setDialog360] = useState<Dialog360WebhookInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const promise =
      channelType === "gupshup"
        ? getGupshupWebhookInfo(whatsappId, crossTenant).then(({ data }) => {
            if (alive) setGupshup(data)
          })
        : getDialog360WebhookInfo(whatsappId, crossTenant).then(({ data }) => {
            if (alive) setDialog360(data)
          })
    promise
      .catch((e: any) => {
        if (alive) setError(e?.response?.data?.error || e?.message || "ERROR")
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [channelType, whatsappId, crossTenant])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Carregando webhook info...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-4 text-xs text-destructive">
          Não foi possível carregar webhook info ({error}).
        </CardContent>
      </Card>
    )
  }

  const webhookUrl = gupshup?.webhookUrl || dialog360?.webhookUrl || ""
  const instructions = gupshup?.instructions || dialog360?.instructions
  const events = gupshup?.events
  const note = dialog360?.instructions?.note
  const panelLabel = channelType === "gupshup" ? "Gupshup (gupshup.io)" : "360dialog (hub.360dialog.com)"

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="w-4 h-4" />
          Configurar webhook no painel {panelLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Se o canal foi criado via fluxo Manual (Customer Account), a URL abaixo
          precisa ser configurada manualmente no painel do BSP — o backend não
          consegue setar automaticamente sem credenciais Partner.
        </p>

        <div className="space-y-1">
          <label className="text-xs font-semibold">URL de Webhook</label>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl)
                toast.success("URL copiada")
              }}
              title="Copiar URL"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {events && events.length > 0 && (
          <div className="space-y-1">
            <label className="text-xs font-semibold">Eventos a marcar</label>
            <div className="flex flex-wrap gap-1.5">
              {events.map((e) => (
                <Badge key={e} variant="secondary" className="font-mono text-[10px]">
                  {e}
                </Badge>
              ))}
            </div>
            {channelType === "gupshup" && (
              <p className="text-[11px] text-muted-foreground">
                Versão: V3 (selecione se houver toggle).
              </p>
            )}
          </div>
        )}

        {instructions && (
          <div className="space-y-1">
            <label className="text-xs font-semibold">Passo a passo no painel</label>
            <ol className="text-xs list-decimal pl-4 space-y-0.5 text-muted-foreground">
              {instructions.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => window.open(instructions.panelUrl, "_blank", "noopener")}
            >
              Abrir {instructions.panelUrl} <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </div>
        )}

        {note && (
          <p className="text-xs text-muted-foreground italic border-l-2 border-blue-300 pl-2">
            {note}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
