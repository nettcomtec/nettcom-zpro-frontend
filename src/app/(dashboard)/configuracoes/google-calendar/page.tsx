"use client";

import { formatDate as formatDateIntl, formatTime } from "@/lib/format";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getGoogleCanonicalCallbackUrl } from "@/config/oauth-proxy";
import { useAuthStore } from "@/stores/auth-store";
import { Plus, Pencil, Trash2, Eye, EyeOff, Copy, ExternalLink, Link, Video, Cake, CalendarDays, MapPin, Star } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  listGoogleCalendarConfigs,
  createGoogleCalendarConfig,
  updateGoogleCalendarConfig,
  deleteGoogleCalendarConfig,
  setDefaultGoogleCalendarConfig,
  generateGoogleAuthUrl,
  listGoogleCalendarEvents,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  type GoogleCalendarConfig,
  type GoogleCalendarEvent,
} from "@/services/google-calendar";

const emptyConfig = {
  id: 0,
  name: "",
  googleClientId: "",
  googleClientSecret: "",
  googleAccessToken: "",
  googleRefreshToken: "",
  isActive: false,
};

const emptyEvent = {
  summary: "",
  description: "",
  startDateTime: "",
  endDateTime: "",
  location: "",
  attendees: "",
};

function formatDateTime(dateString?: string) {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    const date = formatDateIntl(d, { day: "2-digit", month: "2-digit" });
    const time = formatTime(d, { hour: "2-digit", minute: "2-digit" });
    return `${date} ${time}`;
  } catch {
    return dateString;
  }
}

function formatDate(dateString?: string) {
  if (!dateString) return "";
  try {
    return formatDateIntl(new Date(dateString));
  } catch {
    return dateString ?? "";
  }
}

function getStatusColor(status?: string) {
  switch (status) {
    case "confirmed": return "bg-green-500";
    case "tentative": return "bg-yellow-500";
    case "cancelled": return "bg-red-500";
    default: return "bg-blue-500";
  }
}

export default function ConfigGoogleCalendarPage() {
  const t = useTranslations("configGoogleCalendarPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoReconnectTriggered = useRef(false);
  // Tenant-level toggle (superadmin /tenants): quando "disabled", esconde o radio
  // "Usar app Google da plataforma" e forca o tenant a configurar app proprio.
  const platformGoogleAppEnabled =
    useAuthStore((s) => s.getConfigValue("enablePlatformGoogleApp")) !== "disabled";
  // Phase 16 — Toggle "App Google da plataforma" vs "App proprio".
  // TODO: quando app Google da plataforma sair de testes, restaurar default false e o useEffect
  const [useOwnGoogleApp, setUseOwnGoogleApp] = useState<boolean>(true);
  // --- Configs state ---
  const [configs, setConfigs] = useState<GoogleCalendarConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<typeof emptyConfig>(emptyConfig);
  const [savingConfig, setSavingConfig] = useState(false);
  const [obtainingTokens, setObtainingTokens] = useState(false);
  const [deleteConfigDialogOpen, setDeleteConfigDialogOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<GoogleCalendarConfig | null>(null);
  const [connectingOAuthId, setConnectingOAuthId] = useState<number | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<number | null>(null);

  // Password visibility
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showRefreshToken, setShowRefreshToken] = useState(false);

  // --- Events state ---
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [filtros, setFiltros] = useState({
    // Phase 16 — range default 30d passado a 90d futuro (cobre reunioes recentes)
    dataInicio: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    dataFim: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    maxResults: 100,
  });

  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ ...emptyEvent });
  const [creatingEvent, setCreatingEvent] = useState(false);

  const [editEventOpen, setEditEventOpen] = useState(false);
  // calendarId: o evento pode viver num calendario secundario da conta (a busca
  // varre todos). Sem ele, editar/apagar cai sempre no primary e falha.
  const [editingEvent, setEditingEvent] = useState({ id: "", calendarId: "", ...emptyEvent });
  const [updatingEvent, setUpdatingEvent] = useState(false);

  const [deleteEventDialogOpen, setDeleteEventDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; calendarId?: string } | null>(null);

  // Phase 16 — Google nao aceita custom domain nas Authorized Redirect URIs.
  // Sempre canonical, independente de oauthCustomDomain.
  const redirectUri = getGoogleCanonicalCallbackUrl();

  // Detecta erro especifico do backend e mostra mensagem clara em vez do
  // generico "errorGenerateUrl". Caso 403 ERR_PLATFORM_GOOGLE_APP_DISABLED
  // indica que o superadmin do tenant desativou a opcao plataforma.
  // O interceptor em lib/api.ts (linha 176) rejeita com error.response em vez
  // da AxiosError completa, entao o objeto recebido aqui ja eh o response —
  // checamos err.data e err.response.data para cobrir ambos os formatos.
  const showGoogleAuthError = (error: unknown, fallbackKey: "errorGenerateUrl" | "errorSave" = "errorGenerateUrl") => {
    const err = error as {
      data?: { error?: string; message?: string };
      response?: { data?: { error?: string; message?: string } };
    };
    const body = err?.data || err?.response?.data;
    const code = body?.error || body?.message;
    if (code === "ERR_PLATFORM_GOOGLE_APP_DISABLED") {
      toast.error(
        (t("errorPlatformGoogleAppDisabled" as any) as string) ||
          "App Google da plataforma desativado pelo administrador. Configure um app proprio (Client ID/Secret)."
      );
      return;
    }
    if (code === "ERR_NO_GOOGLE_APP_CONFIGURED" || code === "GOOGLE_APP_NOT_CONFIGURED") {
      toast.error(
        (t("errorNoGoogleAppConfigured" as any) as string) ||
          "Nenhum app Google configurado. Use seu proprio app (Client ID/Secret) ou peca ao administrador para configurar o App Google da plataforma."
      );
      return;
    }
    toast.error(t(fallbackKey));
  };

  // Validacao: client_id/secret obrigatorios apenas no modo "app proprio".
  // No modo "plataforma", o backend resolve via AppGoogle dashboard (camada 2).
  const isConfigValid =
    editingConfig.name &&
    (!useOwnGoogleApp || (editingConfig.googleClientId && editingConfig.googleClientSecret)) &&
    editingConfig.googleAccessToken &&
    editingConfig.googleRefreshToken;

  // --- Load configs ---
  const loadConfigs = useCallback(async () => {
    setLoadingConfigs(true);
    try {
      const res = await listGoogleCalendarConfigs();
      const list = res.data?.configs ?? [];
      setConfigs(list);
      if (list.length > 0 && !selectedConfigId) {
        // Comeca pela agenda padrao do tenant — a mesma que o Meet e o
        // agendamento usam — em vez da config criada por ultimo.
        const preferred = list.find(c => c.isDefault) ?? list[0];
        setSelectedConfigId(String(preferred.id));
      }
    } catch {
      setConfigs([]);
    } finally {
      setLoadingConfigs(false);
    }
  }, [selectedConfigId]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  // Listener do popup OAuth (Google Calendar): após sucesso, recarrega a lista
  // de configs (que já contém os tokens gravados pela própria callback page)
  // e fecha o modal de edição se estiver aberto.
  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "OAUTH_COMPLETE_CALENDAR") return;
      if (event.data.status === "success") {
        toast.success(t("configSaved"));
        setObtainingTokens(false);
        setConnectingOAuthId(null);
        setConfigModalOpen(false);
        loadConfigs();
      } else if (event.data.status === "error") {
        toast.error(event.data.message || t("errorGenerateUrl"));
        setObtainingTokens(false);
        setConnectingOAuthId(null);
      }
    }
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [loadConfigs, t]);

  function openOAuthPopup(authUrl: string) {
    const w = 600;
    const h = 700;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    return window.open(
      authUrl,
      "google_calendar_oauth",
      `width=${w},height=${h},left=${left},top=${top},popup=yes`
    );
  }

  // --- Config modal ---
  const openCreateConfig = () => {
    setEditingConfig({ ...emptyConfig });
    setUseOwnGoogleApp(true); // TODO: restaurar false quando app da plataforma sair de testes
    setShowClientSecret(false);
    setShowAccessToken(false);
    setShowRefreshToken(false);
    setConfigModalOpen(true);
  };

  const openEditConfig = (config: GoogleCalendarConfig) => {
    setEditingConfig({
      id: config.id,
      name: config.name,
      googleClientId: config.googleClientId,
      googleClientSecret: config.googleClientSecret,
      googleAccessToken: config.googleAccessToken ?? "",
      googleRefreshToken: config.googleRefreshToken ?? "",
      isActive: config.isActive,
    });
    // Phase 16 — se a config tem clientId/secret preenchidos, e app proprio
    setUseOwnGoogleApp(!!(config.googleClientId || config.googleClientSecret));
    setShowClientSecret(false);
    setShowAccessToken(false);
    setShowRefreshToken(false);
    setConfigModalOpen(true);
  };

  const duplicateConfig = (config: GoogleCalendarConfig) => {
    setEditingConfig({
      id: 0,
      name: `${config.name} (cópia)`,
      googleClientId: config.googleClientId,
      googleClientSecret: config.googleClientSecret,
      googleAccessToken: "",
      googleRefreshToken: "",
      isActive: false,
    });
    setShowClientSecret(false);
    setShowAccessToken(false);
    setShowRefreshToken(false);
    setConfigModalOpen(true);
  };

  const saveConfig = async () => {
    if (!editingConfig.name) {
      toast.warning(t("fillRequiredFields"));
      return;
    }
    // Phase 16 — client_id/secret so obrigatorios no modo "app proprio"
    if (useOwnGoogleApp && (!editingConfig.googleClientId || !editingConfig.googleClientSecret)) {
      toast.warning(t("fillRequiredFields"));
      return;
    }
    setSavingConfig(true);
    try {
      const payload = {
        name: editingConfig.name,
        // Modo plataforma: envia vazio. Backend resolve via resolveGoogleCredentials.
        googleClientId: useOwnGoogleApp ? editingConfig.googleClientId : "",
        googleClientSecret: useOwnGoogleApp ? editingConfig.googleClientSecret : "",
        googleAccessToken: editingConfig.googleAccessToken || "",
        googleRefreshToken: editingConfig.googleRefreshToken || "",
        isActive: Boolean(isConfigValid),
      };
      if (editingConfig.id) {
        await updateGoogleCalendarConfig(editingConfig.id, payload);
      } else {
        await createGoogleCalendarConfig(payload);
      }
      toast.success(t("configSaved"));
      setConfigModalOpen(false);
      await loadConfigs();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(t("errorSave"));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleGetTokens = async () => {
    if (!editingConfig.name) {
      toast.warning(t("fillConfigName"));
      return;
    }
    // Phase 16 — client_id/secret so obrigatorios no modo "app proprio"
    if (useOwnGoogleApp && (!editingConfig.googleClientId || !editingConfig.googleClientSecret)) {
      toast.warning(t("fillClientIdSecret"));
      return;
    }
    setObtainingTokens(true);
    try {
      if (!editingConfig.id) {
        const res = await createGoogleCalendarConfig({
          name: editingConfig.name,
          googleClientId: useOwnGoogleApp ? editingConfig.googleClientId : "",
          googleClientSecret: useOwnGoogleApp ? editingConfig.googleClientSecret : "",
          isActive: false,
        });
        setEditingConfig(prev => ({ ...prev, id: (res.data as GoogleCalendarConfig).id }));
      }
      const res = await generateGoogleAuthUrl({
        // Modo plataforma: envia vazio. Backend resolve via resolveGoogleCredentials.
        clientId: useOwnGoogleApp ? editingConfig.googleClientId : "",
        clientSecret: useOwnGoogleApp ? editingConfig.googleClientSecret : "",
        state: editingConfig.name,
      });
      const popup = openOAuthPopup(res.data.authUrl);
      if (!popup) {
        toast.error(t("errorGenerateUrl"));
        setObtainingTokens(false);
      }
      // setObtainingTokens permanece true até o listener OAUTH_COMPLETE_CALENDAR resetar
    } catch (error: unknown) {
      showGoogleAuthError(error);
      setObtainingTokens(false);
    }
  };

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      toast.success(t("uriCopied"));
    } catch {
      toast.error(t("errorCopy"));
    }
  };

  // Quick connect via app Google da plataforma — pula o modal de criar config.
  // Cria a config no backend com nome auto-gerado (clientId/secret vazios para
  // o backend resolver via resolveGoogleCredentials) e dispara o popup OAuth.
  // Disponivel apenas quando enablePlatformGoogleApp=enabled no tenant.
  const quickConnectPlatform = async () => {
    if (!platformGoogleAppEnabled) return;
    const baseName = t("defaultConfigName" as any) || "Google Calendar";
    let autoName = baseName;
    let i = 1;
    while (configs.some(c => c.name === autoName)) {
      i += 1;
      autoName = `${baseName} ${i}`;
    }
    setObtainingTokens(true);
    try {
      const res = await createGoogleCalendarConfig({
        name: autoName,
        googleClientId: "",
        googleClientSecret: "",
        isActive: false,
      });
      const created = res.data as GoogleCalendarConfig;
      setConnectingOAuthId(created.id);
      const auth = await generateGoogleAuthUrl({
        clientId: "",
        clientSecret: "",
        state: autoName,
      });
      const popup = openOAuthPopup(auth.data.authUrl);
      if (!popup) {
        toast.error(t("errorGenerateUrl"));
        setObtainingTokens(false);
        setConnectingOAuthId(null);
      }
      // Listener OAUTH_COMPLETE_CALENDAR vai resetar e recarregar configs.
    } catch (error: unknown) {
      showGoogleAuthError(error);
      setObtainingTokens(false);
      setConnectingOAuthId(null);
    }
  };

  const handleConnectOAuth = async (config: GoogleCalendarConfig) => {
    setConnectingOAuthId(config.id);
    try {
      const res = await generateGoogleAuthUrl({
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        state: config.name,
      });
      const popup = openOAuthPopup(res.data.authUrl);
      if (!popup) {
        toast.error(t("errorGenerateUrl"));
        setConnectingOAuthId(null);
      }
      // connectingOAuthId permanece até listener OAUTH_COMPLETE_CALENDAR resetar
    } catch (error: unknown) {
      showGoogleAuthError(error);
      setConnectingOAuthId(null);
    }
  };

  // Auto-trigger OAuth quando vier da toast "Reconectar" (?reconnect=true).
  // Espera as configs carregarem, abre o popup pra config ativa (ou primeira),
  // e limpa o query param pra nao re-disparar em refresh.
  useEffect(() => {
    if (autoReconnectTriggered.current) return;
    if (loadingConfigs) return;
    if (searchParams.get("reconnect") !== "true") return;
    const target = configs.find(c => c.isActive) ?? configs[0];
    if (!target) return;
    autoReconnectTriggered.current = true;
    void handleConnectOAuth(target);
    router.replace("/configuracoes/google-calendar");
  }, [loadingConfigs, configs, searchParams, router]);

  // Agenda padrao: quem nao tem seletor proprio (link do Meet, agendamento
  // publico sem agenda escolhida) passa a usar exatamente esta.
  const handleSetDefault = async (config: GoogleCalendarConfig) => {
    if (config.isDefault) return;
    setSettingDefaultId(config.id);
    try {
      await setDefaultGoogleCalendarConfig(config.id);
      toast.success(t("defaultUpdated"));
      await loadConfigs();
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSettingDefaultId(null);
    }
  };

  const confirmDeleteConfig = (config: GoogleCalendarConfig) => {
    setConfigToDelete(config);
    setDeleteConfigDialogOpen(true);
  };

  const handleDeleteConfig = async () => {
    if (!configToDelete) return;
    try {
      await deleteGoogleCalendarConfig(configToDelete.id);
      toast.success(t("configDeleted"));
      setDeleteConfigDialogOpen(false);
      setConfigToDelete(null);
      await loadConfigs();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(t("errorDelete"));
    }
  };

  // --- Events ---
  const selectedConfig = configs.find(c => String(c.id) === selectedConfigId);

  const loadEvents = async () => {
    if (!selectedConfig) {
      toast.warning(t("selectConfig"));
      return;
    }
    if (!selectedConfig.googleAccessToken) {
      toast.warning(t("configureGoogleFirst"));
      return;
    }
    setLoadingEvents(true);
    try {
      const res = await listGoogleCalendarEvents(
        {
          // dataInicio/dataFim sao YYYY-MM-DD; timeMin = inicio do dia (local),
          // timeMax = FIM do dia (local 23:59:59.999) para que eventos do ultimo
          // dia selecionado entrem no resultado (timeMax do Google e exclusivo).
          timeMin: filtros.dataInicio ? new Date(`${filtros.dataInicio}T00:00:00`).toISOString() : new Date().toISOString(),
          timeMax: filtros.dataFim ? new Date(`${filtros.dataFim}T23:59:59.999`).toISOString() : new Date().toISOString(),
          maxResults: filtros.maxResults || 50,
          // Phase 16 — "all" = lista eventos de todos os calendars do user
          // (cobre Trabalho/Pessoal/etc, nao so primary que pode so ter birthdays)
          googleCalendarId: "all",
        },
        {
          googleAccessToken: selectedConfig.googleAccessToken,
          googleRefreshToken: selectedConfig.googleRefreshToken,
          googleClientId: selectedConfig.googleClientId,
          googleClientSecret: selectedConfig.googleClientSecret,
        }
      );
      setEvents(res.data?.events ?? []);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(t("errorLoadEvents"));
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!selectedConfig) return;
    setCreatingEvent(true);
    try {
      const attendees = newEvent.attendees
        ? newEvent.attendees.split(",").map(e => e.trim())
        : [];
      await createGoogleCalendarEvent({
        summary: newEvent.summary,
        description: newEvent.description,
        startDateTime: newEvent.startDateTime,
        endDateTime: newEvent.endDateTime,
        location: newEvent.location,
        attendees,
        googleAccessToken: selectedConfig.googleAccessToken,
        googleRefreshToken: selectedConfig.googleRefreshToken,
        googleClientId: selectedConfig.googleClientId,
        googleClientSecret: selectedConfig.googleClientSecret,
      });
      toast.success(t("eventCreated"));
      setNewEvent({ ...emptyEvent });
      setCreateEventOpen(false);
      await loadEvents();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(t("errorCreateEvent"));
    } finally {
      setCreatingEvent(false);
    }
  };

  const openEditEvent = (event: GoogleCalendarEvent) => {
    let startDateTime = "";
    let endDateTime = "";
    if (event.start) {
      try {
        const d = new Date(event.start);
        if (event.start.length === 10) d.setHours(9, 0, 0, 0);
        startDateTime = d.toISOString().slice(0, 16);
      } catch { /* ignore */ }
    }
    if (event.end) {
      try {
        const d = new Date(event.end);
        if (event.end.length === 10) d.setHours(10, 0, 0, 0);
        endDateTime = d.toISOString().slice(0, 16);
      } catch { /* ignore */ }
    }
    setEditingEvent({
      id: event.id,
      calendarId: event.calendarId ?? "",
      summary: event.summary ?? "",
      description: event.description ?? "",
      startDateTime,
      endDateTime,
      location: event.location ?? "",
      attendees: event.attendees ? event.attendees.join(", ") : "",
    });
    setEditEventOpen(true);
  };

  const handleUpdateEvent = async () => {
    if (!selectedConfig) return;
    setUpdatingEvent(true);
    try {
      const attendees = editingEvent.attendees
        ? editingEvent.attendees.split(",").map(e => e.trim())
        : [];
      await updateGoogleCalendarEvent(editingEvent.id, {
        summary: editingEvent.summary,
        description: editingEvent.description,
        startDateTime: editingEvent.startDateTime,
        endDateTime: editingEvent.endDateTime,
        location: editingEvent.location,
        attendees,
        googleCalendarId: editingEvent.calendarId || undefined,
        googleAccessToken: selectedConfig.googleAccessToken,
        googleRefreshToken: selectedConfig.googleRefreshToken,
        googleClientId: selectedConfig.googleClientId,
        googleClientSecret: selectedConfig.googleClientSecret,
      });
      toast.success(t("eventUpdated"));
      setEditEventOpen(false);
      await loadEvents();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(t("errorUpdate"));
    } finally {
      setUpdatingEvent(false);
    }
  };

  const confirmDeleteEvent = (event: GoogleCalendarEvent) => {
    setEventToDelete({ id: event.id, calendarId: event.calendarId });
    setDeleteEventDialogOpen(true);
  };

  const handleDeleteEvent = async () => {
    if (!eventToDelete || !selectedConfig) return;
    try {
      await deleteGoogleCalendarEvent(eventToDelete.id, {
        googleCalendarId: eventToDelete.calendarId || undefined,
        googleAccessToken: selectedConfig.googleAccessToken,
        googleRefreshToken: selectedConfig.googleRefreshToken,
        googleClientId: selectedConfig.googleClientId,
        googleClientSecret: selectedConfig.googleClientSecret,
      });
      toast.success(t("eventDeleted"));
      setDeleteEventDialogOpen(false);
      setEventToDelete(null);
      await loadEvents();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
      const code = err?.response?.data?.error || err?.response?.data?.message;
      // Phase 16 — evento read-only (birthday/holiday) — mensagem clara
      if (typeof code === "string" && code.includes("READONLY")) {
        toast.error(t("eventReadonly" as any) || "Este evento nao pode ser deletado (e gerenciado pelo Google).");
      } else {
        toast.error(t("errorDeleteEvent"));
      }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")] },
            { title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1")] },
          ],
        }}
      />

      {/* ── Gerenciar Configurações ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">{t("manageConfigsTitle")}</CardTitle>
          <div className="flex gap-2">
            {/* Quick connect — so quando o tenant tem app Google da plataforma habilitado.
                Cria config + dispara OAuth direto, sem passar pelo modal de criar config. */}
            {platformGoogleAppEnabled && (
              <Button
                size="sm"
                variant="default"
                onClick={quickConnectPlatform}
                disabled={obtainingTokens || connectingOAuthId !== null}
              >
                <Link className="h-4 w-4 mr-1" />
                {t("quickConnectGoogle" as any) || "Conectar Google Calendar"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={openCreateConfig}>
              <Plus className="h-4 w-4 mr-1" /> {t("newConfig")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingConfigs ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : configs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noConfigs")}</p>
          ) : (
            <>
            <p className="text-xs text-muted-foreground mb-3">{t("defaultHint")}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead className="text-center">{t("colStatus")}</TableHead>
                  <TableHead className="text-center">{t("colTokens")}</TableHead>
                  <TableHead className="text-center">{t("colCreatedAt")}</TableHead>
                  <TableHead className="text-center">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        {c.name}
                        {c.isDefault && (
                          <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                            <Star className="h-3 w-3 fill-current text-amber-500" />
                            {t("defaultBadge")}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={c.isActive ? "bg-green-500" : "bg-gray-400"}>
                        {c.isActive ? t("statusActive") : t("statusInactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={c.googleAccessToken && c.googleRefreshToken ? "bg-green-500" : "bg-yellow-500"}>
                        {c.googleAccessToken && c.googleRefreshToken ? t("tokensComplete") : t("tokensPending")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{formatDate(c.createdAt)}</TableCell>
                    <TableCell className="text-center space-x-1">
                      {/* A padrão já é indicada pelo selo ao lado do nome; aqui
                          só aparece a ação para as demais. Agenda sem conexão
                          não pode virar padrão — o sistema não conseguiria usá-la. */}
                      {!c.isDefault && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSetDefault(c)}
                          disabled={
                            settingDefaultId !== null ||
                            !c.isActive ||
                            !c.googleAccessToken ||
                            !c.googleRefreshToken
                          }
                          title={
                            !c.isActive || !c.googleRefreshToken
                              ? t("setDefaultNeedsConnection")
                              : t("setAsDefault")
                          }
                        >
                          <Star className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleConnectOAuth(c)}
                        disabled={connectingOAuthId === c.id}
                        title={t("getTokensOAuth")}
                      >
                        <Link className="h-4 w-4 text-blue-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => duplicateConfig(c)}
                        title={t("duplicateConfig")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditConfig(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => confirmDeleteConfig(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Lista de Eventos ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("eventsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[200px]">
              <Label className="text-xs mb-1 block">{t("calendarLabel")}</Label>
              <Select value={selectedConfigId} onValueChange={v => { setSelectedConfigId(v); setEvents([]); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectCalendar")} />
                </SelectTrigger>
                <SelectContent>
                  {configs.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                      {c.isDefault && ` (${t("defaultBadge")})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">{t("startDate")}</Label>
              <Input type="date" value={filtros.dataInicio}
                onChange={e => setFiltros(f => ({ ...f, dataInicio: e.target.value }))}
                className="w-40" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">{t("endDate")}</Label>
              <Input type="date" value={filtros.dataFim}
                onChange={e => setFiltros(f => ({ ...f, dataFim: e.target.value }))}
                className="w-40" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">{t("maxResults")}</Label>
              <Input type="number" min={1} max={100} value={filtros.maxResults}
                onChange={e => setFiltros(f => ({ ...f, maxResults: Number(e.target.value) }))}
                className="w-24" />
            </div>
            <Button onClick={loadEvents} disabled={loadingEvents || !selectedConfigId}>
              {loadingEvents ? t("loading") : t("search")}
            </Button>
            <Button variant="outline" onClick={() => setCreateEventOpen(true)} disabled={!selectedConfigId}>
              <Plus className="h-4 w-4 mr-1" /> {t("newEvent")}
            </Button>
          </div>

          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%]">{t("colTitle")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("colCalendar")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("colStart")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("colEnd")}</TableHead>
                  <TableHead className="text-center">{t("colStatus")}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map(ev => (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ev.eventType === "birthday" && (
                            <Cake className="h-3.5 w-3.5 text-pink-500 shrink-0" aria-label="Birthday" />
                          )}
                          <span className="font-medium">{ev.summary}</span>
                          {ev.meetLink && (
                            <a
                              href={ev.meetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:bg-blue-100"
                            >
                              <Video className="h-3 w-3" />
                              Meet
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                          {ev.location && (
                            <span className="inline-flex items-center gap-1 truncate max-w-[180px]" title={ev.location}>
                              <MapPin className="h-3 w-3 shrink-0" />
                              {ev.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {ev.calendarName ? (
                        <span className="inline-flex items-center gap-1 truncate max-w-[160px]" title={ev.calendarName}>
                          <CalendarDays className="h-3 w-3 shrink-0 text-muted-foreground" />
                          {ev.calendarName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(ev.start)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(ev.end)}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={getStatusColor(ev.status)}>{ev.status ?? "-"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-0.5">
                        {!ev.isReadOnly && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEvent(ev)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirmDeleteEvent(ev)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                        {ev.htmlLink && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(ev.htmlLink, "_blank")}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Modal: Config ── */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingConfig.id ? t("editConfig") : t("newConfigTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Status banner */}
            <div className={`flex items-center gap-2 rounded-md p-3 text-sm ${isConfigValid ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
              <span>{isConfigValid ? t("configComplete") : t("configIncomplete")}</span>
            </div>

            <div>
              <Label>{t("nameLabel")}</Label>
              <Input value={editingConfig.name}
                onChange={e => setEditingConfig(p => ({ ...p, name: e.target.value }))}
                placeholder={t("namePlaceholder")} />
            </div>

            {/* TODO: reativar selector de app quando app Google da plataforma sair de testes */}
            {false && platformGoogleAppEnabled && (
              <div className="rounded-md border border-border bg-card p-3 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="googleAppModeCalendar"
                    checked={!useOwnGoogleApp}
                    onChange={() => {
                      setUseOwnGoogleApp(false);
                      setEditingConfig(p => ({ ...p, googleClientId: "", googleClientSecret: "" }));
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t("googleAppPlatform" as any) || "Usar app Google da plataforma (recomendado)"}</div>
                    <div className="text-xs text-muted-foreground">{t("googleAppPlatformHint" as any) || "Conexao instantanea — sem cadastro no Google Cloud."}</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="googleAppModeCalendar"
                    checked={useOwnGoogleApp}
                    onChange={() => setUseOwnGoogleApp(true)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t("googleAppOwn" as any) || "Usar meu proprio app Google"}</div>
                    <div className="text-xs text-muted-foreground">{t("googleAppOwnHint" as any) || "Quota separada, controle total. Voce precisa criar um projeto no Google Cloud Console."}</div>
                  </div>
                </label>
              </div>
            )}

            {useOwnGoogleApp && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Client ID *</Label>
                  <Input value={editingConfig.googleClientId}
                    onChange={e => setEditingConfig(p => ({ ...p, googleClientId: e.target.value }))} />
                </div>
                <div>
                  <Label>Client Secret *</Label>
                  <div className="relative">
                    <Input
                      type={showClientSecret ? "text" : "password"}
                      value={editingConfig.googleClientSecret}
                      onChange={e => setEditingConfig(p => ({ ...p, googleClientSecret: e.target.value }))}
                      className="pr-10"
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowClientSecret(v => !v)}>
                      {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Redirect URI: so necessario no modo "app proprio" (usuario tem que cadastrar
                este URI nas Authorized Redirect URIs do projeto no Google Cloud Console).
                No modo plataforma o backend resolve via app global e o usuario nao precisa
                fazer nada no Google Cloud, entao o bloco fica oculto. */}
            {useOwnGoogleApp && (
              <div>
                <Label>{t("redirectUriLabel")}</Label>
                <div className="flex gap-2">
                  <Input value={redirectUri} readOnly className="flex-1 bg-muted" />
                  <Button type="button" variant="outline" size="icon" onClick={copyRedirectUri}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t("redirectUriHint")}</p>
              </div>
            )}

            <Button type="button" variant="outline" className="w-full"
              onClick={handleGetTokens}
              disabled={
                obtainingTokens ||
                !editingConfig.name ||
                /* Phase 16: client_id/secret so obrigatorios no modo "proprio" */
                (useOwnGoogleApp && (!editingConfig.googleClientId || !editingConfig.googleClientSecret))
              }>
              {obtainingTokens ? t("redirecting") : t("getTokensOAuth")}
            </Button>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Access Token</Label>
                <div className="relative">
                  <Input
                    type={showAccessToken ? "text" : "password"}
                    value={editingConfig.googleAccessToken}
                    onChange={e => setEditingConfig(p => ({ ...p, googleAccessToken: e.target.value }))}
                    className="pr-10"
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowAccessToken(v => !v)}>
                    {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Refresh Token</Label>
                <div className="relative">
                  <Input
                    type={showRefreshToken ? "text" : "password"}
                    value={editingConfig.googleRefreshToken}
                    onChange={e => setEditingConfig(p => ({ ...p, googleRefreshToken: e.target.value }))}
                    className="pr-10"
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowRefreshToken(v => !v)}>
                    {showRefreshToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigModalOpen(false)}>{t("cancel")}</Button>
            {editingConfig.id ? (
              <Button variant="destructive" onClick={() => { setConfigToDelete(configs.find(c => c.id === editingConfig.id) ?? null); setConfigModalOpen(false); setDeleteConfigDialogOpen(true); }}>
                {t("delete")}
              </Button>
            ) : null}
            <Button onClick={saveConfig} disabled={savingConfig}>
              {savingConfig ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Criar Evento ── */}
      <Dialog open={createEventOpen} onOpenChange={setCreateEventOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("createEventTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* A busca lista eventos de todas as agendas da conta, mas a criação
                sempre cai na principal — deixar explícito evita procurar depois. */}
            <p className="text-xs text-muted-foreground">{t("newEventPrimaryNote")}</p>
            <div>
              <Label>{t("eventTitleLabel")}</Label>
              <Input value={newEvent.summary}
                onChange={e => setNewEvent(p => ({ ...p, summary: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("eventStartDateTime")}</Label>
                <Input type="datetime-local" value={newEvent.startDateTime}
                  onChange={e => setNewEvent(p => ({ ...p, startDateTime: e.target.value }))} />
              </div>
              <div>
                <Label>{t("eventEndDateTime")}</Label>
                <Input type="datetime-local" value={newEvent.endDateTime}
                  onChange={e => setNewEvent(p => ({ ...p, endDateTime: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t("eventDescription")}</Label>
              <Textarea rows={3} value={newEvent.description}
                onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("eventLocation")}</Label>
                <Input value={newEvent.location}
                  onChange={e => setNewEvent(p => ({ ...p, location: e.target.value }))} />
              </div>
              <div>
                <Label>{t("eventAttendees")}</Label>
                <Input value={newEvent.attendees} placeholder="email1@..., email2@..."
                  onChange={e => setNewEvent(p => ({ ...p, attendees: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">{t("attendeesSeparator")}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateEventOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleCreateEvent} disabled={creatingEvent || !newEvent.summary || !newEvent.startDateTime || !newEvent.endDateTime}>
              {creatingEvent ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Editar Evento ── */}
      <Dialog open={editEventOpen} onOpenChange={setEditEventOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("editEventTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t("eventTitleLabel")}</Label>
              <Input value={editingEvent.summary}
                onChange={e => setEditingEvent(p => ({ ...p, summary: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("eventStartDateTime")}</Label>
                <Input type="datetime-local" value={editingEvent.startDateTime}
                  onChange={e => setEditingEvent(p => ({ ...p, startDateTime: e.target.value }))} />
              </div>
              <div>
                <Label>{t("eventEndDateTime")}</Label>
                <Input type="datetime-local" value={editingEvent.endDateTime}
                  onChange={e => setEditingEvent(p => ({ ...p, endDateTime: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t("eventDescription")}</Label>
              <Textarea rows={3} value={editingEvent.description}
                onChange={e => setEditingEvent(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("eventLocation")}</Label>
                <Input value={editingEvent.location}
                  onChange={e => setEditingEvent(p => ({ ...p, location: e.target.value }))} />
              </div>
              <div>
                <Label>{t("eventAttendees")}</Label>
                <Input value={editingEvent.attendees} placeholder="email1@..., email2@..."
                  onChange={e => setEditingEvent(p => ({ ...p, attendees: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">{t("attendeesSeparator")}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEventOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleUpdateEvent} disabled={updatingEvent || !editingEvent.summary}>
              {updatingEvent ? t("updating") : t("update")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm: Excluir Config ── */}
      <Dialog open={deleteConfigDialogOpen} onOpenChange={setDeleteConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteConfigTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("deleteConfigConfirm")} <strong>{configToDelete?.name}</strong>? {t("cannotBeUndone")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfigDialogOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDeleteConfig}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm: Excluir Evento ── */}
      <Dialog open={deleteEventDialogOpen} onOpenChange={setDeleteEventDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteEventTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("deleteEventConfirm")} {t("cannotBeUndone")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEventDialogOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDeleteEvent}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
