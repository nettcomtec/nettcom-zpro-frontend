"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Loader2,
  Plus,
  Settings2,
  Trash2,
  Activity,
  RefreshCcw,
  Globe,
  Eye,
  Edit,
  Pencil,
  Image as ImageIcon,
} from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Dialog360CreateChannelDialog } from "@/components/sessoes/dialog360-create-channel-dialog"
import { Dialog360EditChannelDialog } from "@/components/sessoes/dialog360-edit-channel-dialog"
import { Dialog360DiagnoseModal } from "@/components/sessoes/dialog360-diagnose-modal"
import { Dialog360CredentialsForm } from "@/components/configuracoes/dialog360-credentials-form"
import { TemplateButtonsEditor, buildTemplateButtonsComponent, parseTemplateButtons, type TemplateButton } from "@/components/configuracoes/template-buttons-editor"
import { BspChannelInfoCard } from "@/components/configuracoes/bsp-channel-info-card"
import { WABA_LIMITS } from "@/lib/waba-text-limits"
import {
  listDialog360Channels,
  deleteDialog360Channel,
} from "@/services/dialog360"
import {
  listDialog360Templates,
  deleteDialog360Template,
  createDialog360Template,
  editDialog360Template,
  syncDialog360Templates as syncTemplates,
} from "@/services/dialog360-meta"
import { WabaTemplateMobilePreview } from "@/components/meta/waba-template-mobile-preview"
import {
  GalleryPickerWithUploadDialog,
  wabaHeaderFormatToGalleryParams,
} from "@/components/gallery/gallery-picker-with-upload-dialog"
import type { GalleryItem } from "@/services/gallery"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  Dialog360Channel,
  Dialog360Template,
} from "@/types/dialog360"

function statusBadgeClasses(status?: string | null): string {
  const s = String(status || "").toLowerCase()
  if (s === "running" || s === "approved" || s === "ok" || s === "connected")
    return "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400"
  if (s === "pending" || s === "opening")
    return "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400"
  if (s === "token_expired" || s === "suspended" || s === "rejected" || s === "disconnected")
    return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400"
  return "bg-muted text-muted-foreground border-transparent"
}

function qualityBadgeClasses(quality?: string | null): string {
  const q = String(quality || "").toUpperCase()
  if (q === "GREEN" || q === "HIGH")
    return "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400"
  if (q === "YELLOW" || q === "MEDIUM")
    return "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400"
  if (q === "RED" || q === "LOW")
    return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400"
  return "bg-muted text-muted-foreground border-transparent"
}

// Named export usado pelo /configuracoes/bsp/page.tsx (com prop embedded).
// O export default abaixo é o que o Next.js usa como Page de rota e aceita
// PageProps padrão (sem props customizadas).
export function Dialog360PageContent({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const t = useTranslations("dialog360Page")
  const pathname = usePathname()
  const router = useRouter()

  // Redirect automatico pra rota unificada BSP quando acessado direto via URL antiga.
  // Quando renderizado como aba dentro de /configuracoes/bsp, `embedded=true` evita o redirect.
  useEffect(() => {
    if (!embedded && pathname === "/configuracoes/dialog360") {
      router.replace("/configuracoes/bsp?tab=dialog360")
    }
  }, [embedded, pathname, router])
  if (!embedded && pathname === "/configuracoes/dialog360") return null

  const [channels, setChannels] = useState<Dialog360Channel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editChannelId, setEditChannelId] = useState<number | null>(null)
  const [diagnoseChannel, setDiagnoseChannel] = useState<{
    id: number
    name?: string
  } | null>(null)
  // Canal selecionado pra mostrar o card de info detalhada (toggle por click no row).
  const [selectedInfoChannelId, setSelectedInfoChannelId] = useState<number | null>(null)

  const [templates, setTemplates] = useState<Dialog360Template[]>([])
  const [templatesWhatsappId, setTemplatesWhatsappId] = useState<number | null>(
    null,
  )
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Create/Edit template state
  const [createTplOpen, setCreateTplOpen] = useState(false)
  const [tplName, setTplName] = useState("")
  const [tplLanguage, setTplLanguage] = useState("pt_BR")
  const [tplCategory, setTplCategory] = useState("MARKETING")
  const [tplBody, setTplBody] = useState("")
  // WABA-like extras — Header (text/image/video/document) + Footer + Buttons.
  const [tplHeaderFormat, setTplHeaderFormat] = useState<"NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT">("NONE")
  const [tplHeaderText, setTplHeaderText] = useState("")
  const [tplHeaderMediaUrl, setTplHeaderMediaUrl] = useState("")
  const [tplFooter, setTplFooter] = useState("")
  const [tplButtons, setTplButtons] = useState<TemplateButton[]>([])
  const [tplGalleryOpen, setTplGalleryOpen] = useState(false)
  const [submittingTpl, setSubmittingTpl] = useState(false)
  // Template em edicao (null = modo criar). Guarda o id do template no provedor.
  const [editingTpl, setEditingTpl] = useState<Dialog360Template | null>(null)
  // Template em visualizacao (modal read-only).
  const [viewTpl, setViewTpl] = useState<Dialog360Template | null>(null)

  const loadChannels = useCallback(async () => {
    setLoadingChannels(true)
    try {
      const { data } = await listDialog360Channels()
      setChannels(Array.isArray(data) ? data : [])
      if (data?.length && templatesWhatsappId == null) {
        // IMPORTANTE: passar `whatsappId` (FK pro Whatsapp), nao `id` (PK do
        // Dialog360Channel). O backend de templates indexa por whatsappId.
        setTemplatesWhatsappId(data[0].whatsappId)
      }
    } catch {
      toast.error(t("errorLoadChannels"))
    } finally {
      setLoadingChannels(false)
    }
  }, [t, templatesWhatsappId])

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  const loadTemplates = useCallback(async () => {
    if (!templatesWhatsappId) {
      setTemplates([])
      return
    }
    setLoadingTemplates(true)
    try {
      const { data } = await listDialog360Templates(templatesWhatsappId)
      setTemplates(Array.isArray(data) ? data : [])
    } catch {
      toast.error(t("errorLoadTemplates"))
    } finally {
      setLoadingTemplates(false)
    }
  }, [t, templatesWhatsappId])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  async function handleDeleteChannel(id: number) {
    if (!window.confirm(t("deleteChannelConfirm"))) return
    try {
      await deleteDialog360Channel(id)
      toast.success(t("deleteChannelSuccess"))
      loadChannels()
    } catch {
      toast.error(t("deleteChannelError"))
    }
  }

  async function handleSyncTemplates() {
    if (!templatesWhatsappId) return
    setSyncing(true)
    try {
      await syncTemplates(templatesWhatsappId)
      toast.success(t("syncTemplatesSuccess"))
      loadTemplates()
    } catch {
      toast.error(t("syncTemplatesError"))
    } finally {
      setSyncing(false)
    }
  }

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

  // Preenche o formulario a partir dos `components` Meta-native (inverso do que
  // submitTemplate monta). Usado ao abrir o modal em modo edicao.
  function prefillTplFromTemplate(tpl: Dialog360Template) {
    const comps = (tpl.components || []) as any[]
    const header = comps.find((c) => String(c.type).toUpperCase() === "HEADER")
    const body = comps.find((c) => String(c.type).toUpperCase() === "BODY")
    const footer = comps.find((c) => String(c.type).toUpperCase() === "FOOTER")
    const buttonsComp = comps.find((c) => String(c.type).toUpperCase() === "BUTTONS")
    setTplName(tpl.name || "")
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

  function openEditTpl(tpl: Dialog360Template) {
    setEditingTpl(tpl)
    prefillTplFromTemplate(tpl)
    setCreateTplOpen(true)
  }

  function pickGalleryItem(item: GalleryItem) {
    setTplHeaderMediaUrl(item.url)
    setTplGalleryOpen(false)
  }

  function buildTemplateComponents(): Array<Record<string, unknown>> {
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
    const buttonsComp = buildTemplateButtonsComponent(tplButtons)
    if (buttonsComp) components.push(buttonsComp)
    return components
  }

  async function submitTemplate() {
    if (!templatesWhatsappId) return
    if (!tplName.trim() || !tplBody.trim()) {
      toast.error(t("tplRequiredFields"))
      return
    }
    setSubmittingTpl(true)
    try {
      const components = buildTemplateComponents()
      if (editingTpl) {
        await editDialog360Template({
          whatsappId: templatesWhatsappId,
          templateId: editingTpl.id,
          template: {
            name: tplName.trim(),
            language: tplLanguage,
            category: tplCategory,
            components,
          },
        })
        toast.success(t("tplUpdateSuccess"))
      } else {
        await createDialog360Template({
          whatsappId: templatesWhatsappId,
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
      loadTemplates()
    } catch (e: any) {
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

  async function handleDeleteTemplate(template: Dialog360Template) {
    if (!templatesWhatsappId) return
    if (!window.confirm(t("deleteTemplateConfirm"))) return
    try {
      await deleteDialog360Template({
        whatsappId: templatesWhatsappId,
        name: template.name,
        language: template.language,
      })
      toast.success(t("deleteTemplateSuccess"))
      loadTemplates()
    } catch {
      toast.error(t("deleteTemplateError"))
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
          <TabsTrigger value="credentials">{t("tabCredentials")}</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" /> {t("channelsCardTitle")}
                </CardTitle>
                <CardDescription>{t("channelsDescription")}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadChannels}
                  disabled={loadingChannels}
                >
                  <RefreshCcw
                    className={`w-4 h-4 mr-2 ${loadingChannels ? "animate-spin" : ""}`}
                  />
                  {t("reload")}
                </Button>
                <Button onClick={() => setCreateOpen(true)} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("newChannel")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingChannels ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : channels.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {t("emptyChannels")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colName")}</TableHead>
                        <TableHead>{t("colChannelId")}</TableHead>
                        <TableHead>{t("colPhone")}</TableHead>
                        <TableHead>{t("colStatus")}</TableHead>
                        <TableHead>{t("colQuality")}</TableHead>
                        <TableHead className="text-right">
                          {t("colActions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channels.map((channel) => (
                        <TableRow
                          key={channel.id}
                          data-state={selectedInfoChannelId === channel.id ? "selected" : undefined}
                          className="cursor-pointer"
                          onClick={() =>
                            setSelectedInfoChannelId((prev) =>
                              prev === channel.id ? null : channel.id,
                            )
                          }
                        >
                          <TableCell className="font-medium">
                            {channel.verifiedName || channel.displayPhoneNumber || `#${channel.id}`}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {channel.channelId || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {channel.displayPhoneNumber || channel.phoneNumberId || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusBadgeClasses(channel.channelStatus)}
                            >
                              {channel.channelStatus || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {channel.qualityRating ? (
                              <Badge
                                variant="outline"
                                className={qualityBadgeClasses(channel.qualityRating)}
                              >
                                {channel.qualityRating}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">
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
                                      onClick={() => handleDeleteChannel(channel.id)}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500" />
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
          {!loadingChannels && selectedInfoChannelId !== null && (() => {
            const selected = channels.find((c) => c.id === selectedInfoChannelId)
            if (!selected) return null
            return (
              <div className="pb-6">
                <BspChannelInfoCard
                  whatsappId={selected.whatsappId}
                  channelType="dialog360"
                  channelName={selected.verifiedName || selected.displayPhoneNumber || `#${selected.id}`}
                />
              </div>
            )
          })()}
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("templatesCardTitle")}</CardTitle>
              <div className="flex gap-2 items-center">
                <select
                  value={templatesWhatsappId ?? ""}
                  onChange={(e) =>
                    setTemplatesWhatsappId(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className="rounded-md border px-2 py-1 text-sm bg-background"
                >
                  <option value="">
                    {t("selectChannelPlaceholder")}
                  </option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.whatsappId}>
                      {c.verifiedName || c.displayPhoneNumber || `#${c.id}`}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={handleSyncTemplates}
                  disabled={syncing || !templatesWhatsappId}
                >
                  {syncing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCcw className="w-4 h-4 mr-2" />
                  )}
                  {t("syncTemplates")}
                </Button>
                <Button
                  onClick={openCreateTpl}
                  disabled={!templatesWhatsappId}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t("createTemplate")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !templatesWhatsappId ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {t("selectChannelToView")}
                </p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {t("emptyTemplates")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colTemplateName")}</TableHead>
                      <TableHead>{t("colLanguage")}</TableHead>
                      <TableHead>{t("colCategory")}</TableHead>
                      <TableHead>{t("colStatus")}</TableHead>
                      <TableHead className="text-right">
                        {t("colActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((tpl) => (
                      <TableRow key={`${tpl.name}:${tpl.language}`}>
                        <TableCell className="font-mono text-xs">
                          {tpl.name}
                        </TableCell>
                        <TableCell>{tpl.language}</TableCell>
                        <TableCell>{tpl.category}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
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
                                    onClick={() => handleDeleteTemplate(tpl)}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── CREDENTIALS TAB (Partner Account credentials) ─────────────────── */}
        <TabsContent value="credentials" className="space-y-4">
          <Dialog360CredentialsForm />
        </TabsContent>
      </Tabs>

      <Dialog360CreateChannelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadChannels}
      />
      <Dialog360EditChannelDialog
        open={editChannelId != null}
        channelId={editChannelId}
        onOpenChange={(open) => !open && setEditChannelId(null)}
        onUpdated={loadChannels}
      />
      <Dialog360DiagnoseModal
        channelId={diagnoseChannel?.id ?? null}
        channelName={diagnoseChannel?.name}
        open={diagnoseChannel != null}
        onOpenChange={(open) => !open && setDiagnoseChannel(null)}
        onRevalidated={loadChannels}
      />

      {/* Create/Edit template — fluxo WABA-like (HEADER/BODY/FOOTER/BUTTONS + Galeria) */}
      <Dialog
        open={createTplOpen}
        onOpenChange={(v) => {
          setCreateTplOpen(v)
          if (!v) setEditingTpl(null)
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Pencil className="w-4 h-4" />
              {editingTpl ? t("editTemplateTitle") : t("createTemplateTitle")}
            </DialogTitle>
            <DialogDescription>
              {editingTpl ? t("editTemplateDesc") : t("createTemplateDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Basic info */}
            <div className="space-y-3 border rounded-md p-3">
              <p className="text-sm font-semibold text-muted-foreground">Informacoes basicas</p>
              <div className="space-y-1">
                <Label htmlFor="tpl-name">{t("tplName")}</Label>
                <Input
                  id="tpl-name"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                  placeholder="boas_vindas"
                  maxLength={WABA_LIMITS.templateName}
                  disabled={!!editingTpl}
                />
                <p className="text-xs text-muted-foreground">
                  {editingTpl ? t("tplImmutableNote") : "apenas minusculas, numeros e underscore"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("tplLanguage")}</Label>
                  <Select value={tplLanguage} onValueChange={setTplLanguage} disabled={!!editingTpl}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt_BR">Portugues (BR)</SelectItem>
                      <SelectItem value="en_US">English (US)</SelectItem>
                      <SelectItem value="es">Espanol</SelectItem>
                      <SelectItem value="es_ES">Espanol (ES)</SelectItem>
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
                  <Label>{t("tplCategory")}</Label>
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
              <p className="text-sm font-semibold text-muted-foreground">{t("tplBody")} *</p>
              <Textarea
                id="tpl-body"
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
                rows={4}
                maxLength={1024}
                placeholder="Ola {{1}}, seja bem-vindo!"
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
            <Button variant="outline" onClick={() => setCreateTplOpen(false)} disabled={submittingTpl}>
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
              {editingTpl ? t("tplSaveBtn") : t("create")}
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
              {viewTpl?.name || t("tplViewTitle")}
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
    </div>
  )
}
