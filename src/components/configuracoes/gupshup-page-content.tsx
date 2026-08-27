"use client"

import React, { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Plus,
  Trash2,
  RefreshCw,
  Edit,
  Activity,
  Settings2,
  Loader2,
  Globe,
  BarChart2,
  ShieldCheck,
  Pencil,
  Eye,
} from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { GupshupCreateChannelDialog } from "@/components/sessoes/gupshup-create-channel-dialog"
import { GupshupEditChannelDialog } from "@/components/sessoes/gupshup-edit-channel-dialog"
import { GupshupDiagnoseModal } from "@/components/sessoes/gupshup-diagnose-modal"
import { GupshupCredentialsForm } from "@/components/configuracoes/gupshup-credentials-form"
import { TemplateButtonsEditor, buildTemplateButtonsComponent, parseTemplateButtons, type TemplateButton } from "@/components/configuracoes/template-buttons-editor"
import { BspChannelInfoCard } from "@/components/configuracoes/bsp-channel-info-card"
import { WABA_LIMITS } from "@/lib/waba-text-limits"
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog"
import { generateTemplateViaCopilot } from "@/services/copilot"
import { Sparkles, Image as ImageIcon } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { GalleryItem } from "@/services/gallery"
import {
  listGupshupChannels,
  deleteGupshupChannel,
  setGupshupWebhook,
} from "@/services/gupshup"
import {
  listGupshupTemplates,
  listGupshupTemplatesByWhatsappId,
  createGupshupTemplate,
  editGupshupTemplate,
  deleteGupshupTemplate,
} from "@/services/gupshup-meta"
import { WabaTemplateMobilePreview } from "@/components/meta/waba-template-mobile-preview"
import type { GupshupChannel, GupshupTemplate } from "@/types/gupshup"

function statusBadgeClasses(status?: string | null): string {
  const s = String(status || "").toLowerCase()
  if (s === "running" || s === "approved" || s === "ok")
    return "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400"
  if (s === "pending")
    return "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400"
  if (s === "token_expired" || s === "suspended" || s === "rejected")
    return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400"
  return "bg-muted text-muted-foreground border-transparent"
}

// Named export usado pelo /configuracoes/bsp/page.tsx (com prop embedded).
// O export default abaixo é o que o Next.js usa como Page de rota e aceita
// PageProps padrão (sem props customizadas).
export function GupshupConfigContent({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const t = useTranslations("gupshupConfigPage")
  const pathname = usePathname()
  const router = useRouter()

  // Redirect automatico pra rota unificada BSP quando acessado direto via URL antiga.
  // Quando renderizado como aba dentro de /configuracoes/bsp, `embedded=true` evita o redirect.
  useEffect(() => {
    if (!embedded && pathname === "/configuracoes/gupshup") {
      router.replace("/configuracoes/bsp?tab=gupshup")
    }
  }, [embedded, pathname, router])
  if (!embedded && pathname === "/configuracoes/gupshup") return null


  // ─── Channels state ────────────────────────────────────────────────────
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [channels, setChannels] = useState<GupshupChannel[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [editChannel, setEditChannel] = useState<GupshupChannel | null>(null)
  // Canal selecionado pra mostrar o card de info detalhada (toggle por click no row).
  const [selectedInfoWhatsappId, setSelectedInfoWhatsappId] = useState<number | null>(null)
  const [diagnoseChannel, setDiagnoseChannel] = useState<GupshupChannel | null>(
    null,
  )
  const [confirmDelete, setConfirmDelete] = useState<GupshupChannel | null>(
    null,
  )
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [webhookingId, setWebhookingId] = useState<number | null>(null)

  // ─── Templates state ───────────────────────────────────────────────────
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templates, setTemplates] = useState<GupshupTemplate[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string>("")

  const [createTplOpen, setCreateTplOpen] = useState(false)
  const [tplName, setTplName] = useState("")
  const [tplLanguage, setTplLanguage] = useState("pt_BR")
  const [tplCategory, setTplCategory] = useState("MARKETING")
  const [tplBody, setTplBody] = useState("")
  // WABA-like extras — opcionais. Header (text/image/video/document) + Footer + Buttons.
  const [tplHeaderFormat, setTplHeaderFormat] = useState<"NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT">("NONE")
  const [tplHeaderText, setTplHeaderText] = useState("")
  const [tplHeaderMediaUrl, setTplHeaderMediaUrl] = useState("")
  const [tplFooter, setTplFooter] = useState("")
  const [tplButtons, setTplButtons] = useState<TemplateButton[]>([])
  const [submittingTpl, setSubmittingTpl] = useState(false)
  // Gallery picker
  const [tplGalleryOpen, setTplGalleryOpen] = useState(false)
  // AI Copilot
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiIncludeHeader, setAiIncludeHeader] = useState(false)
  const [aiIncludeFooter, setAiIncludeFooter] = useState(false)
  const [aiIncludeButtons, setAiIncludeButtons] = useState(false)
  const [confirmDeleteTpl, setConfirmDeleteTpl] =
    useState<GupshupTemplate | null>(null)
  // Template em edicao (null = modo criar). Guarda o id do template no provedor.
  const [editingTpl, setEditingTpl] = useState<GupshupTemplate | null>(null)
  // Template em visualizacao (modal read-only).
  const [viewTpl, setViewTpl] = useState<GupshupTemplate | null>(null)

  const selectedChannel = useMemo(
    () => channels.find((c) => String(c.whatsappId) === selectedChannelId),
    [channels, selectedChannelId],
  )

  // ─── Loaders ───────────────────────────────────────────────────────────

  async function reloadChannels() {
    setLoadingChannels(true)
    try {
      const { data } = await listGupshupChannels()
      setChannels(Array.isArray(data) ? data : [])
      if (
        !selectedChannelId &&
        Array.isArray(data) &&
        data.length > 0 &&
        data[0].whatsappId
      ) {
        setSelectedChannelId(String(data[0].whatsappId))
      }
    } catch {
      toast.error(t("loadChannelsError"))
    } finally {
      setLoadingChannels(false)
    }
  }

  async function reloadTemplates(whatsappId?: number, appId?: string | null) {
    if (!whatsappId && !appId) {
      setTemplates([])
      return
    }
    setLoadingTemplates(true)
    try {
      // listGupshup* já retornam array normalizado. includeAll=true: a tela de
      // gestao mostra TODOS os status (PENDING/REJECTED/PAUSED), nao so aprovados
      // (o filtro approved-only e so pro picker de envio em atendimento/massa).
      const data = appId
        ? await listGupshupTemplates(appId, { includeAll: true })
        : await listGupshupTemplatesByWhatsappId(whatsappId!, { includeAll: true })
      setTemplates(Array.isArray(data) ? data : [])
    } catch {
      toast.error(t("loadTemplatesError"))
      setTemplates([])
    } finally {
      setLoadingTemplates(false)
    }
  }

  useEffect(() => {
    reloadChannels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedChannel) {
      reloadTemplates(selectedChannel.whatsappId, selectedChannel.appId)
    } else {
      setTemplates([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId, selectedChannel?.appId])

  // ─── Channel ops ───────────────────────────────────────────────────────

  async function handleDelete() {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.whatsappId)
    try {
      await deleteGupshupChannel(confirmDelete.whatsappId)
      toast.success(t("deleteSuccess"))
      setConfirmDelete(null)
      await reloadChannels()
    } catch {
      toast.error(t("deleteError"))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSetWebhook(c: GupshupChannel) {
    setWebhookingId(c.whatsappId)
    try {
      await setGupshupWebhook(c.whatsappId)
      toast.success(t("webhookSuccess"))
      await reloadChannels()
    } catch {
      toast.error(t("webhookError"))
    } finally {
      setWebhookingId(null)
    }
  }

  // ─── Template ops ──────────────────────────────────────────────────────

  function resetTplState() {
    setTplName("")
    setTplLanguage("pt_BR")
    setTplCategory("MARKETING")
    setTplBody("")
    setTplHeaderFormat("NONE")
    setTplHeaderText("")
    setTplHeaderMediaUrl("")
    setTplFooter("")
    setTplButtons([])
  }

  // Preenche o formulario a partir dos `components` Meta-native do template
  // (inverso do que submitTemplate monta). Usado ao abrir o modal em modo edicao.
  function prefillTplFromTemplate(tpl: GupshupTemplate) {
    const comps = (tpl.components || []) as any[]
    const header = comps.find((c) => String(c.type).toUpperCase() === "HEADER")
    const body = comps.find((c) => String(c.type).toUpperCase() === "BODY")
    const footer = comps.find((c) => String(c.type).toUpperCase() === "FOOTER")
    const buttonsComp = comps.find((c) => String(c.type).toUpperCase() === "BUTTONS")
    setTplName(tpl.name || tpl.elementName || "")
    setTplLanguage(tpl.language || "pt_BR")
    setTplCategory(tpl.category || "MARKETING")
    setTplBody(body?.text || "")
    if (header) {
      const fmt = String(header.format || "TEXT").toUpperCase()
      if (fmt === "IMAGE" || fmt === "VIDEO" || fmt === "DOCUMENT") {
        setTplHeaderFormat(fmt as any)
        setTplHeaderMediaUrl(header?.example?.header_handle?.[0] || header?.example?.header_url || "")
        setTplHeaderText("")
      } else {
        setTplHeaderFormat("TEXT")
        setTplHeaderText(header.text || "")
        setTplHeaderMediaUrl("")
      }
    } else {
      setTplHeaderFormat("NONE")
      setTplHeaderText("")
      setTplHeaderMediaUrl("")
    }
    setTplFooter(footer?.text || "")
    setTplButtons(parseTemplateButtons(buttonsComp))
  }

  function openCreateTpl() {
    setEditingTpl(null)
    resetTplState()
    setCreateTplOpen(true)
  }

  function openEditTpl(tpl: GupshupTemplate) {
    setEditingTpl(tpl)
    prefillTplFromTemplate(tpl)
    setCreateTplOpen(true)
  }

  function pickGalleryItem(item: GalleryItem) {
    setTplHeaderMediaUrl(item.url)
    setTplGalleryOpen(false)
  }

  // ─── AI Copilot — gera template via copilot service ────────────────────
  async function generateTemplateAI() {
    if (!aiPrompt.trim()) {
      toast.error(t("tplRequiredFields"))
      return
    }
    setAiGenerating(true)
    try {
      const langMap: Record<string, string> = {
        pt_BR: "portugues brasileiro", en_US: "English", es: "Spanish",
        fr: "French", de: "German", it: "Italian", ja: "Japanese",
        zh_CN: "Chinese", ar: "Arabic", hi: "Hindi", id: "Indonesian",
        ru: "Russian", tr: "Turkish",
      }
      const langLabel = langMap[tplLanguage] || tplLanguage

      const componentInstructions: string[] = []
      if (aiIncludeHeader) {
        componentInstructions.push(`- HEADER component: type HEADER, format TEXT, text field (max 60 chars, can use 1 variable {{1}})`)
      }
      componentInstructions.push(`- BODY component (required): type BODY, text field (max 1024 chars, use {{1}} {{2}} etc for variables)`)
      if (aiIncludeFooter) {
        componentInstructions.push(`- FOOTER component: type FOOTER, text field (max 60 chars, no variables allowed)`)
      }
      if (aiIncludeButtons) {
        componentInstructions.push(`- BUTTONS component: type BUTTONS, array of QUICK_REPLY buttons (max 3, text max 20 chars each)`)
      }

      const systemPrompt = `You are an expert in Gupshup/Meta WhatsApp Business API template creation. Generate a complete, valid template.

STRICT RULES:
- Template name: lowercase letters, numbers, and underscores ONLY
- Category: must be exactly "${tplCategory}"
- Language: must be exactly "${tplLanguage}"
- All text must be written in ${langLabel}
- BODY text: max 1024 characters, use {{1}}, {{2}} etc for variables
- HEADER TEXT: max 60 characters, optional {{1}} variable
- FOOTER text: max 60 characters, NO variables allowed
- Button text: max 20 characters each
- Maximum 3 buttons total

REQUIRED COMPONENTS:
${componentInstructions.join("\n")}

Return ONLY a valid JSON object (no markdown, no explanation, no code blocks):
{
  "name": "template_name_here",
  "language": "${tplLanguage}",
  "category": "${tplCategory}",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "..." },
    { "type": "BODY", "text": "..." },
    { "type": "FOOTER", "text": "..." },
    { "type": "BUTTONS", "buttons": [{ "type": "QUICK_REPLY", "text": "..." }] }
  ]
}
Include only the components requested.`

      const userPrompt = `Create a WhatsApp Business template for this purpose: ${aiPrompt}`

      const result = await generateTemplateViaCopilot(systemPrompt, userPrompt)
      let raw = String(result.result || "").trim()
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
      const parsed = JSON.parse(raw)

      // Aplica no state
      setTplName(String(parsed.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "_"))
      if (Array.isArray(parsed.components)) {
        for (const c of parsed.components) {
          if (c.type === "HEADER" && c.format === "TEXT") {
            setTplHeaderFormat("TEXT")
            setTplHeaderText(String(c.text || ""))
          } else if (c.type === "BODY") {
            setTplBody(String(c.text || ""))
          } else if (c.type === "FOOTER") {
            setTplFooter(String(c.text || ""))
          } else if (c.type === "BUTTONS" && Array.isArray(c.buttons)) {
            setTplButtons(parseTemplateButtons(c))
          }
        }
      }
      setAiDialogOpen(false)
      toast.success(t("tplCreateSuccess"))
    } catch (e: any) {
      toast.error(e?.response?.data?.error === "ERR_COPILOT_NO_API_KEY" ? "Copilot sem API key configurada" : t("tplCreateError"))
    } finally {
      setAiGenerating(false)
    }
  }

  async function submitTemplate() {
    if (!selectedChannel) return
    if (!tplName.trim() || !tplBody.trim()) {
      toast.error(t("tplRequiredFields"))
      return
    }
    setSubmittingTpl(true)
    try {
      // Monta components WABA-style: HEADER (text OU media IMAGE/VIDEO/DOCUMENT),
      // BODY (obrigatorio), FOOTER (opcional), BUTTONS quick_reply (ate 3 opcional).
      const components: Array<Record<string, unknown>> = []
      if (tplHeaderFormat === "TEXT" && tplHeaderText.trim()) {
        components.push({ type: "HEADER", format: "TEXT", text: tplHeaderText.trim() })
      } else if (
        (tplHeaderFormat === "IMAGE" || tplHeaderFormat === "VIDEO" || tplHeaderFormat === "DOCUMENT") &&
        tplHeaderMediaUrl.trim()
      ) {
        components.push({
          type: "HEADER",
          format: tplHeaderFormat,
          example: { header_handle: [tplHeaderMediaUrl.trim()] },
        })
      }
      components.push({ type: "BODY", text: tplBody.trim() })
      if (tplFooter.trim()) {
        components.push({ type: "FOOTER", text: tplFooter.trim() })
      }
      const btnComp = buildTemplateButtonsComponent(tplButtons)
      if (btnComp) components.push(btnComp)
      if (editingTpl) {
        await editGupshupTemplate({
          whatsappId: selectedChannel.whatsappId,
          appId: selectedChannel.appId,
          templateId: editingTpl.id,
          name: tplName.trim(),
          language: tplLanguage,
          category: tplCategory,
          components,
        })
        toast.success(t("tplUpdateSuccess"))
      } else {
        await createGupshupTemplate({
          whatsappId: selectedChannel.whatsappId,
          appId: selectedChannel.appId,
          name: tplName.trim(),
          language: tplLanguage,
          category: tplCategory,
          components,
        })
        toast.success(t("tplCreateSuccess"))
      }
      setCreateTplOpen(false)
      setEditingTpl(null)
      resetTplState()
      await reloadTemplates(
        selectedChannel.whatsappId,
        selectedChannel.appId,
      )
    } catch (e: any) {
      // Surfacing do erro real (Gupshup/back) — sem isso fica so o toast generico
      // e nao da pra diagnosticar (ex: 403 do Partner API).
      const detail =
        e?.data?.message || e?.response?.data?.message || e?.message
      toast.error(
        (editingTpl ? t("tplUpdateError") : t("tplCreateError")) +
          (detail ? `: ${String(detail).slice(0, 300)}` : ""),
      )
    } finally {
      setSubmittingTpl(false)
    }
  }

  async function handleDeleteTemplate() {
    if (!confirmDeleteTpl || !selectedChannel) return
    try {
      await deleteGupshupTemplate({
        whatsappId: selectedChannel.whatsappId,
        appId: selectedChannel.appId,
        name: confirmDeleteTpl.name,
      })
      toast.success(t("tplDeleteSuccess"))
      setConfirmDeleteTpl(null)
      await reloadTemplates(
        selectedChannel.whatsappId,
        selectedChannel.appId,
      )
    } catch {
      toast.error(t("tplDeleteError"))
    }
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title={t("title")}
          description={t("description")}
          help={{
            description: t("helpDesc"),
            sections: [
              {
                title: t("helpS0T"),
                items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")],
              },
              {
                title: t("helpS1T"),
                items: [t("helpS1I0"), t("helpS1I1")],
              },
            ],
          }}
        />
      )}

      <Tabs defaultValue="channels" className="w-full">
        <TabsList className="grid grid-cols-3 w-full sm:w-auto">
          <TabsTrigger value="channels">{t("tabChannels")}</TabsTrigger>
          <TabsTrigger value="templates">{t("tabTemplates")}</TabsTrigger>
          <TabsTrigger value="credentials">Credenciais</TabsTrigger>
        </TabsList>

        {/* ─── CHANNELS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="channels" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" /> {t("channelsTitle")}
                </CardTitle>
                <CardDescription>{t("channelsDescription")}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reloadChannels}
                  disabled={loadingChannels}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-2 ${loadingChannels ? "animate-spin" : ""}`}
                  />
                  {t("refresh")}
                </Button>
                <Button onClick={() => setCreateOpen(true)} size="sm">
                  <Plus className="w-4 h-4 mr-2" /> {t("createChannel")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingChannels ? (
                <Skeleton className="h-48" />
              ) : channels.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {t("noChannels")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colName")}</TableHead>
                        <TableHead>{t("colAppId")}</TableHead>
                        <TableHead>{t("colPhone")}</TableHead>
                        <TableHead>{t("colStatus")}</TableHead>
                        <TableHead>{t("colQuality")}</TableHead>
                        <TableHead className="text-right">
                          {t("colActions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channels.map((c) => (
                        <TableRow
                          key={c.whatsappId}
                          data-state={selectedInfoWhatsappId === c.whatsappId ? "selected" : undefined}
                          className="cursor-pointer"
                          onClick={() =>
                            setSelectedInfoWhatsappId((prev) =>
                              prev === c.whatsappId ? null : c.whatsappId,
                            )
                          }
                        >
                          <TableCell className="font-medium">
                            {c.appName || `#${c.whatsappId}`}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {c.appId || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {c.displayPhoneNumber || c.phoneNumberId || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusBadgeClasses(c.channelStatus)}
                            >
                              {c.channelStatus || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {c.qualityRating ? (
                              <Badge
                                variant="outline"
                                className={statusBadgeClasses(
                                  c.qualityRating === "GREEN"
                                    ? "running"
                                    : c.qualityRating === "YELLOW"
                                      ? "pending"
                                      : "rejected",
                                )}
                              >
                                {c.qualityRating}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <TooltipProvider delayDuration={150}>
                              <div className="flex justify-end gap-1">
                                {/* Diagnose removido a pedido — BSP eh externo, sem teste interno
                                    util alem do envio real (que ja eh validado em /sessoes). */}
                                {/* Edit removido a pedido — acao fica em /sessoes apenas. */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setConfirmDelete(c)}
                                      disabled={deletingId === c.whatsappId}
                                    >
                                      {deletingId === c.whatsappId ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("actionDelete")}
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card de info detalhada do canal selecionado (clique no row da tabela). */}
          {!loadingChannels && selectedInfoWhatsappId !== null && (() => {
            const selected = channels.find((c) => c.whatsappId === selectedInfoWhatsappId)
            if (!selected) return null
            return (
              <div className="pb-6">
                <BspChannelInfoCard
                  whatsappId={selected.whatsappId}
                  channelType="gupshup"
                  channelName={selected.appName || selected.displayPhoneNumber || `#${selected.whatsappId}`}
                />
              </div>
            )
          })()}
        </TabsContent>

        {/* ─── TEMPLATES TAB ──────────────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="w-5 h-5" /> {t("templatesTitle")}
                </CardTitle>
                <CardDescription>{t("templatesDescription")}</CardDescription>
              </div>
              <div className="flex gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">{t("channelLabel")}</Label>
                  <Select
                    value={selectedChannelId}
                    onValueChange={setSelectedChannelId}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder={t("channelPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((c) => (
                        <SelectItem
                          key={c.whatsappId}
                          value={String(c.whatsappId)}
                        >
                          {c.appName || `#${c.whatsappId}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    selectedChannel &&
                    reloadTemplates(
                      selectedChannel.whatsappId,
                      selectedChannel.appId,
                    )
                  }
                  disabled={loadingTemplates || !selectedChannel}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-2 ${loadingTemplates ? "animate-spin" : ""}`}
                  />
                  {t("refresh")}
                </Button>
                <Button
                  size="sm"
                  onClick={openCreateTpl}
                  disabled={!selectedChannel}
                >
                  <Plus className="w-4 h-4 mr-2" /> {t("createTemplate")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <Skeleton className="h-48" />
              ) : !selectedChannel ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {t("selectChannelHint")}
                </p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {t("noTemplates")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("tplColName")}</TableHead>
                        <TableHead>{t("tplColLanguage")}</TableHead>
                        <TableHead>{t("tplColCategory")}</TableHead>
                        <TableHead>{t("tplColStatus")}</TableHead>
                        <TableHead className="text-right">
                          {t("colActions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((tpl, idx) => (
                        <TableRow key={`${tpl.name}-${tpl.language}-${idx}`}>
                          <TableCell className="font-mono text-xs">
                            {tpl.name || tpl.elementName}
                          </TableCell>
                          <TableCell>{tpl.language}</TableCell>
                          <TableCell>{tpl.category}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusBadgeClasses(tpl.status)}
                            >
                              {tpl.status || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <TooltipProvider delayDuration={150}>
                              <div className="flex justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setViewTpl(tpl)}
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t("tplActionView")}</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openEditTpl(tpl)}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t("tplActionEdit")}</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setConfirmDeleteTpl(tpl)}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t("actionDelete")}</TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── CREDENTIALS TAB (Partner Account credentials) ─────────────────── */}
        <TabsContent value="credentials" className="space-y-4 mt-4">
          <GupshupCredentialsForm />
        </TabsContent>
      </Tabs>

      {/* Create channel */}
      <GupshupCreateChannelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={reloadChannels}
      />

      {/* Edit channel */}
      <GupshupEditChannelDialog
        whatsappId={editChannel?.whatsappId ?? null}
        open={!!editChannel}
        onOpenChange={(v) => !v && setEditChannel(null)}
        onSaved={reloadChannels}
      />

      {/* Diagnose */}
      <GupshupDiagnoseModal
        whatsappId={diagnoseChannel?.whatsappId ?? null}
        channelName={diagnoseChannel?.appName ?? undefined}
        open={!!diagnoseChannel}
        onOpenChange={(v) => !v && setDiagnoseChannel(null)}
      />

      {/* Confirm delete channel */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirmDesc", {
                name: confirmDelete?.appName || `#${confirmDelete?.whatsappId}`,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit template — fluxo WABA-like (HEADER/BODY/FOOTER/BUTTONS + AI Copilot + Galeria) */}
      <Dialog
        open={createTplOpen}
        onOpenChange={(v) => {
          setCreateTplOpen(v)
          if (!v) setEditingTpl(null)
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            {/* Mantemos o titulo em uma linha exclusiva pra nao colidir com
                o botao X (close) automatico do DialogContent (absolute right-4 top-4). */}
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Pencil className="w-4 h-4" />
              {editingTpl ? t("tplEditTitle") : t("tplCreateTitle")}
            </DialogTitle>
            <DialogDescription>
              {editingTpl ? t("tplEditDesc") : t("tplCreateDesc")}
            </DialogDescription>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setAiPrompt(""); setAiDialogOpen(true); }}
              >
                <Sparkles className="w-4 h-4 mr-1 text-purple-500" />
                Gerar com IA
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            {/* Basic info */}
            <div className="space-y-3 border rounded-md p-3">
              <p className="text-sm font-semibold text-muted-foreground">Informacoes basicas</p>
              <div className="space-y-1">
                <Label>{t("tplNameLabel")}</Label>
                <Input
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  placeholder="my_template"
                  maxLength={WABA_LIMITS.templateName}
                  disabled={!!editingTpl}
                />
                <p className="text-xs text-muted-foreground">
                  {editingTpl ? t("tplImmutableNote") : "apenas minusculas, numeros e underscore"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("tplLangLabel")}</Label>
                  <Select value={tplLanguage} onValueChange={setTplLanguage} disabled={!!editingTpl}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt_BR">Portugues (BR)</SelectItem>
                      <SelectItem value="en_US">English (US)</SelectItem>
                      <SelectItem value="es">Espanol</SelectItem>
                      <SelectItem value="fr">Frances</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="it">Italiano</SelectItem>
                      <SelectItem value="ja">Japones</SelectItem>
                      <SelectItem value="zh_CN">Chines (Simpl.)</SelectItem>
                      <SelectItem value="ar">Arabe</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="id">Indonesio</SelectItem>
                      <SelectItem value="ru">Russo</SelectItem>
                      <SelectItem value="tr">Turco</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("tplCategoryLabel")}</Label>
                  <Select value={tplCategory} onValueChange={setTplCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="UTILITY">Utilidade</SelectItem>
                      <SelectItem value="AUTHENTICATION">Autenticacao</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Header opcional — TEXT, IMAGE, VIDEO, DOCUMENT */}
            <div className="space-y-2 border rounded-md p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">Header (opcional)</p>
                <Select value={tplHeaderFormat} onValueChange={(v) => setTplHeaderFormat(v as any)}>
                  <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Sem header</SelectItem>
                    <SelectItem value="TEXT">Texto</SelectItem>
                    <SelectItem value="IMAGE">Imagem</SelectItem>
                    <SelectItem value="VIDEO">Video</SelectItem>
                    <SelectItem value="DOCUMENT">Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {tplHeaderFormat === "TEXT" && (
                <>
                  <Input
                    value={tplHeaderText}
                    onChange={(e) => setTplHeaderText(e.target.value)}
                    placeholder="Titulo do cabecalho (texto)"
                    maxLength={60}
                  />
                  <p className="text-xs text-muted-foreground">Maximo 60 caracteres. Use {"{{1}}"} para variavel.</p>
                </>
              )}
              {(tplHeaderFormat === "IMAGE" || tplHeaderFormat === "VIDEO" || tplHeaderFormat === "DOCUMENT") && (
                <>
                  <div className="flex gap-2">
                    <Input
                      value={tplHeaderMediaUrl}
                      onChange={(e) => setTplHeaderMediaUrl(e.target.value)}
                      placeholder="URL da midia (https://...)"
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setTplGalleryOpen(true)}>
                      <ImageIcon className="w-4 h-4 mr-1" /> Galeria
                    </Button>
                  </div>
                  {tplHeaderMediaUrl && tplHeaderFormat === "IMAGE" && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={tplHeaderMediaUrl} alt="header preview" className="max-h-32 rounded border" />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {tplHeaderFormat === "IMAGE" ? "JPG/PNG max 5MB" : tplHeaderFormat === "VIDEO" ? "MP4 max 16MB" : "PDF max 100MB"}
                  </p>
                </>
              )}
            </div>

            {/* Body obrigatorio */}
            <div className="space-y-2 border rounded-md p-3">
              <p className="text-sm font-semibold text-muted-foreground">Corpo da mensagem *</p>
              <textarea
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
                rows={4}
                maxLength={1024}
                placeholder="Ola {{1}}, seja bem-vindo!"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">Use {"{{1}}"}, {"{{2}}"}... para variaveis. Maximo 1024 caracteres.</p>
            </div>

            {/* Footer opcional */}
            <div className="space-y-2 border rounded-md p-3">
              <p className="text-sm font-semibold text-muted-foreground">Footer (opcional)</p>
              <Input
                value={tplFooter}
                onChange={(e) => setTplFooter(e.target.value)}
                placeholder="Texto do rodape"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">Maximo 60 caracteres. Sem variaveis.</p>
            </div>

            {/* Buttons opcional — paridade com WABA (QUICK_REPLY/URL/PHONE_NUMBER/OTP) */}
            <TemplateButtonsEditor
              buttons={tplButtons}
              onChange={setTplButtons}
              title="Botoes (opcional, ate 3)"
            />

            {/* Preview */}
            <div className="space-y-2 border rounded-md p-3 bg-[#e5ddd5]">
              <p className="text-xs font-semibold text-gray-700">Preview</p>
              <div className="bg-white rounded-lg shadow-sm p-3 space-y-1.5 max-w-sm">
                {tplHeaderText && <p className="font-bold text-sm text-gray-900">{tplHeaderText}</p>}
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{tplBody || "Corpo da mensagem"}</p>
                {tplFooter && <p className="text-xs text-gray-500">{tplFooter}</p>}
                {tplButtons.some((b) => b.text.trim()) && (
                  <div className="pt-1 space-y-1 border-t mt-2">
                    {tplButtons.filter((b) => b.text.trim()).map((b, i) => (
                      <button key={i} className="w-full text-center text-sm text-blue-600 py-1.5 rounded bg-blue-50">{b.text}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateTplOpen(false)}
              disabled={submittingTpl}
            >
              {t("cancel")}
            </Button>
            <Button onClick={submitTemplate} disabled={submittingTpl}>
              {submittingTpl ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : editingTpl ? (
                <Pencil className="w-4 h-4 mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {editingTpl ? t("tplEditSubmit") : t("tplCreateSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete template */}
      <Dialog
        open={!!confirmDeleteTpl}
        onOpenChange={(v) => !v && setConfirmDeleteTpl(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tplDeleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("tplDeleteConfirmDesc", {
                name: confirmDeleteTpl?.name || "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteTpl(null)}
            >
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteTemplate}>
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View template — modal read-only (preview estilo celular + metadados) */}
      <Dialog open={!!viewTpl} onOpenChange={(v) => !v && setViewTpl(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Eye className="w-4 h-4" />
              {viewTpl?.name || viewTpl?.elementName || t("tplViewTitle")}
            </DialogTitle>
            <DialogDescription>{t("tplViewDesc")}</DialogDescription>
          </DialogHeader>
          {viewTpl && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{viewTpl.language}</Badge>
                <Badge variant="outline">{viewTpl.category}</Badge>
                {viewTpl.status && (
                  <Badge variant="outline" className={statusBadgeClasses(viewTpl.status)}>
                    {viewTpl.status}
                  </Badge>
                )}
              </div>
              <WabaTemplateMobilePreview template={viewTpl} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTpl(null)}>
              {t("cancel")}
            </Button>
            {viewTpl && (
              <Button
                onClick={() => {
                  const tpl = viewTpl
                  setViewTpl(null)
                  openEditTpl(tpl)
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                {t("tplActionEdit")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gallery picker para HEADER media (IMAGE/VIDEO/DOCUMENT) */}
      <GalleryPickerWithUploadDialog
        open={tplGalleryOpen}
        onOpenChange={setTplGalleryOpen}
        onPick={pickGalleryItem}
        {...wabaHeaderFormatToGalleryParams(tplHeaderFormat === "NONE" ? undefined : tplHeaderFormat)}
      />

      {/* AI Copilot dialog — gera template via Copilot */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              Gerar template via IA Copilot
            </DialogTitle>
            <DialogDescription>
              Descreva o objetivo do template em linguagem natural. O Copilot gera nome, BODY e componentes opcionais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>O que voce quer enviar?</Label>
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                placeholder="Ex: Mensagem de boas vindas pra novos clientes da loja, com nome do cliente e botao 'Ver catalogo'"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Idioma</Label>
                <Select value={tplLanguage} onValueChange={setTplLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">Portugues (BR)</SelectItem>
                    <SelectItem value="en_US">English (US)</SelectItem>
                    <SelectItem value="es">Espanol</SelectItem>
                    <SelectItem value="fr">Frances</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="ja">Japones</SelectItem>
                    <SelectItem value="zh_CN">Chines (Simpl.)</SelectItem>
                    <SelectItem value="ar">Arabe</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                    <SelectItem value="id">Indonesio</SelectItem>
                    <SelectItem value="ru">Russo</SelectItem>
                    <SelectItem value="tr">Turco</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={tplCategory} onValueChange={setTplCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="UTILITY">Utilidade</SelectItem>
                    <SelectItem value="AUTHENTICATION">Autenticacao</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2 border rounded-md p-3">
              <p className="text-sm font-semibold text-muted-foreground">Componentes a incluir</p>
              <label className="flex items-center justify-between text-sm">
                <span>Header (texto)</span>
                <Switch checked={aiIncludeHeader} onCheckedChange={setAiIncludeHeader} />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Footer</span>
                <Switch checked={aiIncludeFooter} onCheckedChange={setAiIncludeFooter} />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Botoes Quick Reply</span>
                <Switch checked={aiIncludeButtons} onCheckedChange={setAiIncludeButtons} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)} disabled={aiGenerating}>Cancelar</Button>
            <Button onClick={generateTemplateAI} disabled={aiGenerating || !aiPrompt.trim()}>
              {aiGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
