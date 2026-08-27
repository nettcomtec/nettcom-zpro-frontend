"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Pencil, Trash2, Globe, Users, X, Copy, Webhook, Eye, EyeOff, KeyRound, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { fetchGlobalProviders, createGlobalProvider, updateGlobalProvider, deleteGlobalProvider, fetchAllTenants, addTenantToGlobalProvider, removeTenantFromGlobalProvider } from "@/services/superadmin";

// Input de segredo com olhinho para mostrar/ocultar. Cada instancia guarda seu
// proprio estado de visibilidade (default oculto).
function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
      />
      <Button type="button" variant="outline" size="icon" onClick={() => setShow((s) => !s)}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}

interface GlobalProvider {
  id: number;
  name?: string;
  providerType?: string;
  host?: string;
  token?: string;
  isGlobal?: boolean;
  groqCloudLanguage?: string;
  groqCloudModel?: string;
  groqCloudApiKey?: string;
  description?: string;
  status?: string;
  tenants?: Array<{ id: number; name: string }>;
  // BSP partner credentials (dialog360_partner / gupshup_partner)
  dialog360PartnerId?: string;
  dialog360PartnerApiKey?: string;
  dialog360PlatformSecret?: string;
  gupshupPartnerEmail?: string;
  gupshupPartnerPassword?: string;
  gupshupSolutionId?: string;
  // Passkey Linker (evo): sidecar injetor por provedor global
  injectorUrl?: string;
  injectorSecret?: string;
}

const WHISPER_LANGUAGES = [
  { value: "af", label: "Afrikaans" },
  { value: "ar", label: "العربية (Arabic)" },
  { value: "hy", label: "Հայերեն (Armenian)" },
  { value: "az", label: "Azərbaycan (Azerbaijani)" },
  { value: "be", label: "Беларуская (Belarusian)" },
  { value: "bs", label: "Bosanski (Bosnian)" },
  { value: "bg", label: "Български (Bulgarian)" },
  { value: "ca", label: "Català (Catalan)" },
  { value: "zh", label: "中文 (Chinese)" },
  { value: "hr", label: "Hrvatski (Croatian)" },
  { value: "cs", label: "Čeština (Czech)" },
  { value: "da", label: "Dansk (Danish)" },
  { value: "nl", label: "Nederlands (Dutch)" },
  { value: "en", label: "English" },
  { value: "et", label: "Eesti (Estonian)" },
  { value: "fi", label: "Suomi (Finnish)" },
  { value: "fr", label: "Français (French)" },
  { value: "gl", label: "Galego (Galician)" },
  { value: "de", label: "Deutsch (German)" },
  { value: "el", label: "Ελληνικά (Greek)" },
  { value: "he", label: "עברית (Hebrew)" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "hu", label: "Magyar (Hungarian)" },
  { value: "is", label: "Íslenska (Icelandic)" },
  { value: "id", label: "Bahasa Indonesia (Indonesian)" },
  { value: "it", label: "Italiano (Italian)" },
  { value: "ja", label: "日本語 (Japanese)" },
  { value: "kn", label: "ಕನ್ನಡ (Kannada)" },
  { value: "kk", label: "Қазақша (Kazakh)" },
  { value: "ko", label: "한국어 (Korean)" },
  { value: "lv", label: "Latviešu (Latvian)" },
  { value: "lt", label: "Lietuvių (Lithuanian)" },
  { value: "mk", label: "Македонски (Macedonian)" },
  { value: "ms", label: "Bahasa Melayu (Malay)" },
  { value: "mr", label: "मराठी (Marathi)" },
  { value: "mi", label: "Māori" },
  { value: "ne", label: "नेपाली (Nepali)" },
  { value: "no", label: "Norsk (Norwegian)" },
  { value: "fa", label: "فارسی (Persian)" },
  { value: "pl", label: "Polski (Polish)" },
  { value: "pt", label: "Português" },
  { value: "ro", label: "Română (Romanian)" },
  { value: "ru", label: "Русский (Russian)" },
  { value: "sr", label: "Српски (Serbian)" },
  { value: "sk", label: "Slovenčina (Slovak)" },
  { value: "sl", label: "Slovenščina (Slovenian)" },
  { value: "es", label: "Español (Spanish)" },
  { value: "sw", label: "Kiswahili (Swahili)" },
  { value: "sv", label: "Svenska (Swedish)" },
  { value: "tl", label: "Tagalog (Filipino)" },
  { value: "ta", label: "தமிழ் (Tamil)" },
  { value: "th", label: "ภาษาไทย (Thai)" },
  { value: "tr", label: "Türkçe (Turkish)" },
  { value: "uk", label: "Українська (Ukrainian)" },
  { value: "ur", label: "اردو (Urdu)" },
  { value: "vi", label: "Tiếng Việt (Vietnamese)" },
  { value: "cy", label: "Cymraeg (Welsh)" },
];

const GROQ_SPEECH_MODELS = [
  { value: "whisper-large-v3", label: "Whisper Large v3" },
  { value: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo (4× mais rápido)" },
  { value: "distil-whisper-large-v3-en", label: "Distil Whisper Large v3 (somente inglês)" },
];

const PROVIDER_TYPES = [
  { label: "Z-API", value: "zapi" },
  { label: "Evolution", value: "evo" },
  { label: "Evolution Go", value: "evogo" },
  { label: "Wuzapi", value: "wuzapi" },
  { label: "Uazapi", value: "uazapi" },
  { label: "Hub", value: "hub" },
  { label: "GroqCloud", value: "groqcloud" },
  { label: "WhatsApp Business (Meta)", value: "waba" },
  { label: "Instagram (Meta)", value: "instagram" },
  { label: "Messenger (Meta)", value: "messenger" },
  // W3-B: BSPs alternativos (nao-Meta) - usam credenciais de plataforma proprias
  { label: "Dialog360 (BSP)", value: "dialog360_partner" },
  { label: "Gupshup (BSP)", value: "gupshup_partner" },
];

// Tipos Meta (SaaS unificado): nao precisam de host, e o campo "token" guarda o
// verify_token global do webhook. Quando a rota /metaWebhook (sem tenant) for
// chamada pela Meta no handshake GET, o backend procura GlobalProviderConfig
// com providerType correspondente, isGlobal=true e status=active e compara
// hub.verify_token com globalProvider.token.
const META_PROVIDER_TYPES = new Set(["waba", "instagram", "messenger"]);
// BSPs com credenciais granulares (Partner ID/Key/Secret pra Dialog360,
// Email/Password/SolutionId pra Gupshup) — não usam host/token genéricos.
const BSP_PARTNER_TYPES = new Set(["dialog360_partner", "gupshup_partner"]);

const EMPTY: Partial<GlobalProvider> = { name: "", providerType: "zapi", host: "", status: "active", isGlobal: false };

const META_WEBHOOK_PATH: Record<string, string> = {
  waba: "/metaWebhook",
  instagram: "/instagramWebhook",
  messenger: "/messengerWebhook",
};

function buildMetaWebhookUrl(providerType: string | undefined): string | null {
  if (!providerType || !META_WEBHOOK_PATH[providerType]) return null;
  const base = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
  return `${base}${META_WEBHOOK_PATH[providerType]}`;
}

export default function ProvedoresGlobaisPage() {
  const t = useTranslations("provedoresGlobaisPage");
  const [providers, setProviders] = useState<GlobalProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<GlobalProvider>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [tenantModalOpen, setTenantModalOpen] = useState(false);
  const [tenantProvider, setTenantProvider] = useState<GlobalProvider | null>(null);
  const [allTenants, setAllTenants] = useState<Array<{ id: number; name: string }>>([]);
  const [tenantToAdd, setTenantToAdd] = useState("");
  const [tenantSaving, setTenantSaving] = useState(false);

  const set = (k: keyof GlobalProvider, v: unknown) => setEditing((p) => ({ ...p, [k]: v }));

  async function load() {
    try {
      const { data } = await fetchGlobalProviders();
      const list: GlobalProvider[] = Array.isArray(data) ? data : data?.providers || [];
      setProviders(list);
      return list;
    } catch { toast.error(t("errorLoading")); return [] as GlobalProvider[]; }
    finally { setLoading(false); }
  }

  async function loadTenants() {
    try {
      const { data } = await fetchAllTenants();
      setAllTenants(Array.isArray(data) ? data : data?.tenants || []);
    } catch { /* silently ignore */ }
  }

  useEffect(() => { load(); loadTenants(); }, []);

  function handleOpenTenantModal(p: GlobalProvider) {
    setTenantProvider(p);
    setTenantToAdd("");
    setTenantModalOpen(true);
  }

  async function handleAddTenant() {
    if (!tenantProvider || !tenantToAdd) return;
    setTenantSaving(true);
    try {
      await addTenantToGlobalProvider(tenantProvider.id, Number(tenantToAdd));
      toast.success(t("tenantAdded"));
      setTenantToAdd("");
      const updated = await load();
      const found = updated.find((p) => p.id === tenantProvider.id);
      if (found) setTenantProvider(found);
    } catch { toast.error(t("errorAddingTenant")); }
    finally { setTenantSaving(false); }
  }

  async function handleRemoveTenant(tenantId: number) {
    if (!tenantProvider) return;
    if (!confirm(t("confirmRemoveTenant"))) return;
    try {
      await removeTenantFromGlobalProvider(tenantProvider.id, tenantId);
      toast.success(t("tenantRemoved"));
      const updated = await load();
      const found = updated.find((p) => p.id === tenantProvider.id);
      if (found) setTenantProvider(found);
    } catch { toast.error(t("errorRemovingTenant")); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editing.id) { await updateGlobalProvider(editing.id, editing as Record<string, unknown>); toast.success(t("providerUpdated")); }
      else { await createGlobalProvider(editing as Record<string, unknown>); toast.success(t("providerCreated")); }
      setOpen(false); load();
    } catch { toast.error(t("errorSaving")); }
    finally { setSaving(false); }
  }

  async function handleDelete(p: GlobalProvider) {
    if (!confirm(t("confirmDelete", { name: p.name ?? "" }))) return;
    try { await deleteGlobalProvider(p.id); toast.success(t("providerDeleted")); load(); }
    catch { toast.error(t("errorDeleting")); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
          ],
        }}
      >
        <Button size="sm" onClick={() => { setEditing(EMPTY); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> {t("newProvider")}
        </Button>
      </PageHeader>

      {loading ? <Skeleton className="h-64 w-full" /> : providers.length === 0 ? (
        <EmptyState icon={Globe} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("colStatus")}</TableHead><TableHead>{t("colGlobal")}</TableHead><TableHead>{t("colName")}</TableHead>
              <TableHead>{t("colType")}</TableHead><TableHead>{t("colHost")}</TableHead>
              <TableHead>{t("colTenants")}</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {providers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Badge variant={p.status === "active" ? "success" : "secondary"}>{p.status === "active" ? t("active") : t("inactive")}</Badge></TableCell>
                  <TableCell>{p.isGlobal ? <Badge variant="default">{t("global")}</Badge> : "—"}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Badge variant="secondary">{p.providerType}</Badge></TableCell>
                  <TableCell className="font-mono text-xs truncate max-w-[150px]">{p.host || "—"}</TableCell>
                  <TableCell>
                    {p.isGlobal ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : p.tenants && p.tenants.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {p.tenants.slice(0, 2).map((tn) => (
                          <Badge key={tn.id} variant="outline" className="text-xs">{tn.name}</Badge>
                        ))}
                        {p.tenants.length > 2 && (
                          <Badge variant="secondary" className="text-xs">+{p.tenants.length - 2}</Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditing({ ...p }); setOpen(true); }}><Pencil className="mr-2 h-4 w-4" />{t("edit")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenTenantModal(p)}><Users className="mr-2 h-4 w-4" />{t("manageTenants")}</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(p)}><Trash2 className="mr-2 h-4 w-4" />{t("delete")}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing.id ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>{t("labelName")}</Label><Input value={editing.name || ""} onChange={(e) => set("name", e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>{t("labelType")}</Label>
                <Select value={editing.providerType || ""} onValueChange={(v) => set("providerType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROVIDER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {editing.providerType !== "groqcloud"
                && !META_PROVIDER_TYPES.has(editing.providerType || "")
                && !BSP_PARTNER_TYPES.has(editing.providerType || "") && (
                <>
                  <div className="space-y-1.5 col-span-2"><Label>{t("labelHost")}</Label><Input value={editing.host || ""} onChange={(e) => set("host", e.target.value)} placeholder="https://..." /></div>
                  <div className="space-y-1.5 col-span-2"><Label>{t("labelToken")}</Label><SecretInput value={editing.token || ""} onChange={(v) => set("token", v)} /></div>
                </>
              )}
              {["evo", "evogo"].includes(editing.providerType || "") && (
                <>
                  <div className="space-y-1.5 col-span-2"><Label>{t("labelInjectorUrl")}</Label><Input value={editing.injectorUrl || ""} onChange={(e) => set("injectorUrl", e.target.value)} placeholder="https://..." /></div>
                  <div className="space-y-1.5 col-span-2"><Label>{t("labelInjectorSecret")}</Label><SecretInput value={editing.injectorSecret || ""} onChange={(v) => set("injectorSecret", v)} /></div>
                  <details className="group col-span-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <summary className="flex cursor-pointer select-none items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                      <KeyRound className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{t("injectorHelpTitle")}</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-2 space-y-2 text-muted-foreground">
                      <p>{t("injectorHelpIntro")}</p>
                      <ol className="list-decimal space-y-1.5 pl-4">
                        <li>{t("injectorHelpStep1")}</li>
                        <li>{t("injectorHelpStep2")}</li>
                        <li>{editing.providerType === "evogo" ? t("injectorHelpStep3Evogo") : t("injectorHelpStep3Evo")}</li>
                        <li>{t("injectorHelpStep4")}</li>
                        <li>{t("injectorHelpStep5")}</li>
                      </ol>
                      <p className="text-[11px]">{t("injectorHelpNote")}</p>
                    </div>
                  </details>
                </>
              )}
              {META_PROVIDER_TYPES.has(editing.providerType || "") && (
                <>
                  <div className="space-y-1.5 col-span-2">
                    <Label>{t("labelMetaVerifyToken")}</Label>
                    <Input
                      type="text"
                      value={editing.token || ""}
                      onChange={(e) => set("token", e.target.value)}
                      placeholder={t("placeholderMetaVerifyToken")}
                    />
                    <p className="text-xs text-muted-foreground">{t("helperMetaVerifyToken")}</p>
                  </div>
                  {(() => {
                    const webhookUrl = buildMetaWebhookUrl(editing.providerType);
                    if (!webhookUrl) return null;
                    return (
                      <div className="space-y-1.5 col-span-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
                        <div className="flex items-start gap-2">
                          <Webhook className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-400" />
                          <div className="space-y-1 min-w-0 flex-1">
                            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              {t("metaWebhookUrlLabel")}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {t("metaWebhookUrlHint")}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <code className="flex-1 min-w-0 truncate rounded bg-muted/50 px-2 py-1 text-[11px] font-mono">
                                {webhookUrl}
                              </code>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 shrink-0"
                                onClick={() => {
                                  navigator.clipboard.writeText(webhookUrl);
                                  toast.success(t("webhookUrlCopied"));
                                }}
                                aria-label={t("copy")}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
              {editing.providerType === "dialog360_partner" && (
                <>
                  <div className="col-span-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 text-xs space-y-1">
                    <p className="font-semibold text-foreground">Apenas Partner Account 360dialog</p>
                    <p className="text-muted-foreground">
                      Esses campos são para a <strong>Partner API</strong> do 360dialog (BSP).
                      Customer Accounts não têm Partner credentials — usuários Customer devem
                      conectar canais via fluxo <strong>Manual</strong> em /sessoes (colam só a
                      D360-API-KEY emitida no WABA Manager).
                    </p>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Partner ID</Label>
                    <Input
                      value={editing.dialog360PartnerId || ""}
                      onChange={(e) => set("dialog360PartnerId", e.target.value)}
                      placeholder="ID alfanumérico (não é email)"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Partner API Key</Label>
                    <SecretInput
                      value={editing.dialog360PartnerApiKey || ""}
                      onChange={(v) => set("dialog360PartnerApiKey", v)}
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Platform Secret</Label>
                    <SecretInput
                      value={editing.dialog360PlatformSecret || ""}
                      onChange={(v) => set("dialog360PlatformSecret", v)}
                    />
                  </div>
                </>
              )}
              {editing.providerType === "gupshup_partner" && (
                <>
                  <div className="col-span-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 text-xs space-y-1">
                    <p className="font-semibold text-foreground">Apenas Partner Account Gupshup</p>
                    <p className="text-muted-foreground">
                      Esses campos são para a <strong>Partner API</strong> do Gupshup
                      (partner.gupshup.io). Login Partner não aceita Google SSO — só
                      email + senha. Customer Accounts (gupshup.io comum) não têm Partner
                      credentials e devem conectar canais via fluxo <strong>Manual</strong>
                      em /sessoes (colam App ID + App Token criados no painel Customer).
                    </p>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Partner Email</Label>
                    <Input
                      value={editing.gupshupPartnerEmail || ""}
                      onChange={(e) => set("gupshupPartnerEmail", e.target.value)}
                      placeholder="email do Partner Gupshup"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Partner Password</Label>
                    <SecretInput
                      value={editing.gupshupPartnerPassword || ""}
                      onChange={(v) => set("gupshupPartnerPassword", v)}
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Solution ID</Label>
                    <Input
                      value={editing.gupshupSolutionId || ""}
                      onChange={(e) => set("gupshupSolutionId", e.target.value)}
                      placeholder="UUID alfanumérico aprovado pela Meta"
                    />
                  </div>
                </>
              )}
            </div>
            {editing.providerType === "groqcloud" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2"><Label>{t("labelGroqApiKey")}</Label><SecretInput value={editing.groqCloudApiKey || ""} onChange={(v) => set("groqCloudApiKey", v)} /></div>
                <div className="space-y-1.5">
                  <Label>{t("labelLanguage")}</Label>
                  <Select value={editing.groqCloudLanguage || ""} onValueChange={(v) => set("groqCloudLanguage", v)}>
                    <SelectTrigger><SelectValue placeholder={t("labelLanguage")} /></SelectTrigger>
                    <SelectContent>
                      {WHISPER_LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("labelModel")}</Label>
                  <Select value={editing.groqCloudModel || ""} onValueChange={(v) => set("groqCloudModel", v)}>
                    <SelectTrigger><SelectValue placeholder={t("labelModel")} /></SelectTrigger>
                    <SelectContent>
                      {GROQ_SPEECH_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={editing.status === "active"} onCheckedChange={(v) => set("status", v ? "active" : "inactive")} />
                <Label>{t("labelActive")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!editing.isGlobal}
                  onCheckedChange={(v) => set("isGlobal", v)}
                />
                <Label>{t("labelGlobal")}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? t("saving") : t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tenant management dialog */}
      <Dialog open={tenantModalOpen} onOpenChange={setTenantModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("tenantsDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {tenantProvider?.isGlobal ? (
              <p className="text-sm text-muted-foreground">{t("globalProviderInfo")}</p>
            ) : (
              <div className="flex gap-2">
                <Select value={tenantToAdd} onValueChange={setTenantToAdd}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t("selectTenantPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {allTenants
                      .filter((tn) => !tenantProvider?.tenants?.some((assigned) => assigned.id === tn.id))
                      .map((tn) => (
                        <SelectItem key={tn.id} value={String(tn.id)}>{tn.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddTenant} disabled={!tenantToAdd || tenantSaving} size="sm">
                  {t("addTenant")}
                </Button>
              </div>
            )}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {tenantProvider?.tenants && tenantProvider.tenants.length > 0 ? (
                tenantProvider.tenants.map((tn) => (
                  <div key={tn.id} className="flex items-center justify-between rounded-md px-3 py-2 bg-muted/50">
                    <span className="text-sm">{tn.name}</span>
                    {!tenantProvider.isGlobal && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveTenant(tn.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">{t("noTenantsAssigned")}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTenantModalOpen(false)}>{t("cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
