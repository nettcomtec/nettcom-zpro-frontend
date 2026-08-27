"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations, useMessages } from "next-intl";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Save, RotateCcw, RefreshCw, Loader2, ShieldAlert, Zap } from "lucide-react";
import { FloatingSaveButton } from "@/components/ui/floating-save-button";
import { toast } from "sonner";
import { fetchSettings, updateSetting } from "@/services/settings";
import { fetchChatFlows } from "@/services/chatflow";
import { fetchTenantById } from "@/services/tenants";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchAllUsers, type User } from "@/services/users";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { LidConsolidationDialog } from "@/components/configuracoes/lid-consolidation-dialog";
import { InstagramPkSanitizeDialog } from "@/components/configuracoes/instagram-pk-sanitize-dialog";
import { SettingRow, SettingRowProvider } from "@/components/configuracoes/settings-setting-row";
import { SettingsCollapsibleSection } from "@/components/configuracoes/settings-collapsible-section";
import { SettingsPendingBar, type PendingChangeEntry } from "@/components/configuracoes/settings-pending-bar";
import { SettingsSectionNav } from "@/components/configuracoes/settings-section-nav";
import {
  SettingsFilterBar, type SettingsStatusFilter,
} from "@/components/configuracoes/settings-filter-bar";
import { UnsavedChangesDialog } from "@/components/configuracoes/unsaved-changes-dialog";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import {
  SETTINGS_CATALOG, SETTINGS_BY_KEY, SETTING_SECTION_ORDER, SETTING_TAG_ORDER,
  SETTING_GROUP_ORDER, tagLabelKey, sectionOfSetting,
  type SettingTag,
} from "@/lib/settings-catalog";

interface Setting {
  key: string;
  value: string;
}

interface ChatFlow {
  id: number | string;
  name: string;
}

interface ConfirmDialog {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

// Settings that are stored on the tenant model and need dedicated endpoints
const TENANT_KEY_MAP: Record<string, { url: string; field: string }> = {
  chatbotLane:             { url: "tenantsShowChatbot",          field: "showChatBot" },
  semRedis:                { url: "tenantsNoRedis",               field: "noRedis" },
  forceReason:             { url: "tenantsForceReason",           field: "forceReason" },
  allowPause:              { url: "tenantsAllowPause",            field: "allowPause" },
  autoUnpauseOnReply:      { url: "tenantsAutoUnpauseOnReply",    field: "autoUnpauseOnReply" },
  allowDuplicateMessages:  { url: "tenantsAllowDuplicateMessages", field: "allowDuplicateMessages" },
  autoDisableIntegrationsOnAccept: { url: "tenantsAutoDisableIntegrationsOnAccept", field: "autoDisableIntegrationsOnAccept" },
  botReopenGraceSeconds:   { url: "tenantsBotReopenGrace",        field: "botReopenGraceSeconds" },
  botReopenDestinationType: { url: "tenantsBotReopenGrace",       field: "botReopenDestinationType" },
  botReopenQueueId:        { url: "tenantsBotReopenGrace",        field: "botReopenQueueId" },
  botReopenUserId:         { url: "tenantsBotReopenGrace",        field: "botReopenUserId" },
  botReopenChatFlowId:     { url: "tenantsBotReopenGrace",        field: "botReopenChatFlowId" },
  scheduleRoutingWindowDays: { url: "tenantsScheduleRoutingWindow", field: "scheduleRoutingWindowDays" },
  useUserBusinessHours:    { url: "tenantsUseUserBusinessHours",  field: "useUserBusinessHours" },
  webPushChatInterno:      { url: "tenantsWebPushChatInterno",    field: "webPushChatInterno" },
  pushNotificationLimitToOwner: { url: "tenantsPushNotificationLimitToOwner", field: "pushNotificationLimitToOwner" },
  controleFeatures:        { url: "tenantsControlFeatures",       field: "controlFeatures" },
  ticketNulo:              { url: "tenantsNullTickets",           field: "nullTickets" },
  forcarAdmin:             { url: "tenantsForceAdmin",            field: "forceAdmin" },
  fixarConexao:            { url: "tenantsFixConnections",        field: "fixConnections" },
  forcarPendente:          { url: "tenantsForcePending",          field: "forcePendingUser" },
  supervisor:              { url: "tenantsSupervisorAdmin",       field: "supervisorAdmin" },
  customProfileEnabled:    { url: "tenantsCustomProfileEnabled",  field: "customProfileEnabled" },
  userPaymentsEnabled:     { url: "tenantsUserPaymentsEnabled",   field: "userPaymentsEnabled" },
  pushMessagePreview:      { url: "tenantsPushMessagePreview",    field: "pushMessagePreview" },
  pushDuplicateSuppression: { url: "tenantsPushDuplicateSuppression", field: "pushDuplicateSuppression" },
  privacidadeFunil:        { url: "tenantsFunnelPrivacy",         field: "funnelPrivacy" },
  agruparTickets:          { url: "tenantsGroupTickets",          field: "groupTickets" },
  messageListingType:      { url: "tenantsMessageListingType",    field: "messageListingType" },
  listarPelaUltimaMensagem:{ url: "tenantsListByLastMessage",     field: "listByLastMessage" },
  ordemReversaLista:       { url: "tenantsReverseOrder",          field: "reverseOrder" },
  videoConferenceProvider: { url: "tenantsVideoConferenceProvider", field: "videoConferenceProvider" },
  wabaCallRouting:         { url: "tenantsWabaCallRouting",         field: "wabaCallRouting" },
  wabaCallFallbackSeconds: { url: "tenantsWabaCallRouting",         field: "wabaCallFallbackSeconds" },
  windowTimerBanner:       { url: "tenantsWabaWindowBanners",       field: "windowTimerBanner" },
  wabaTemplateBanner:      { url: "tenantsWabaWindowBanners",       field: "wabaTemplateBanner" },
  wabaTemplateBannerMessage: { url: "tenantsWabaWindowBanners",     field: "wabaTemplateBannerMessage" },
  windowClosedBanner:      { url: "tenantsWabaWindowBanners",       field: "windowClosedBanner" },
  validateContact:         { url: "tenantsValidateContact",       field: "validateContact" },
  brPhoneConvention:       { url: "tenantsBrPhoneConvention",     field: "brPhoneConvention" },
  userCreationPasswordMode: { url: "tenantsUserPasswordMode",     field: "userCreationPasswordMode" },
  hearHubApi:              { url: "tenantsHearHubApi",            field: "hearHubApi" },
  ticketsRain:             { url: "tenantsTicketsRain",           field: "ticketsRain" },
  transbordo:              { url: "tenantsServiceTransfer",       field: "serviceTransfer" },
  janelaConversa:          { url: "tenantsWindowChat",            field: "forceOpenChatWindow" },
  esperarProcessamento:    { url: "tenantsWaitExternal",          field: "waitProcessExternalInteraction" },
  carteiraExterna:         { url: "tenantsWalletExternal",        field: "walletExternalInteraction" },
  ignorarStories:          { url: "tenantsIgnoreIgStories",       field: "ignoreIgStories" },
  mostrarGruposParaTodos:  { url: "tenantsShowGroupsForAll",      field: "showGroupsForAll" },
  audioModulo:             { url: "tenantsAudioModule",           field: "audioModule" },
  pluginAudio:             { url: "tenantsAudioPlugin",           field: "audioPlugin" },
  persistirMedia:          { url: "tenantsBailesyMediaPersist",   field: "baileysMediaPersist" },
  mostrarFechadoParaTodos: { url: "tenantsShowClosedForAll",      field: "showClosedForAll" },
  atualizarNomes:          { url: "tenantsUpdateNames",           field: "updateNames" },
  bsuidStrictMode:         { url: "tenantsBsuidStrictMode",       field: "bsuidStrictMode" },
  uazapiDisableLid:        { url: "tenantsUazapiDisableLid",      field: "uazapiDisableLid" },
  walletShowAll:           { url: "tenantsWalletShowAll",         field: "walletShowAll" },
  contactDeleteAdminOnly:  { url: "tenantsContactDeleteAdminOnly", field: "contactDeleteAdminOnly" },
  hidePaymentsFromUsers:   { url: "tenantsHidePaymentsFromUsers",   field: "hidePaymentsFromUsers" },
  inboundByQueueOnly:      { url: "tenantsInboundByQueueOnly",      field: "inboundByQueueOnly" },
  crossChannelTicketCheck: { url: "tenantsCrossChannelTicketCheck", field: "crossChannelTicketCheck" },
  notifyOnlyHumanTickets:  { url: "tenantsNotifyOnlyHumanTickets", field: "notifyOnlyHumanTickets" },
  supervisorChannelScoped: { url: "tenantsSupervisorChannelScoped", field: "supervisorChannelScoped" },
  reopenTicketAssignsToActor: { url: "tenantsReopenTicketAssignsToActor", field: "reopenTicketAssignsToActor" },
  youtubeCommentsCreateTickets: { url: "tenantsYoutubeCommentsCreateTickets", field: "youtubeCommentsCreateTickets" },
  tentativas:              { url: "tenantsMaxRetries",            field: "maxRetries" },
  limiteChatInterno:       { url: "tenantsPrivateMessageLimit",   field: "privateMessageLimit" },
  limiteTickets:           { url: "tenantsTicketLimit",           field: "ticketLimit" },
};

/**
 * Sub-cabeçalho de grupo dentro de um card. É apenas uma divisão VISUAL: nenhuma
 * configuração muda de card, então PageHelp, índice de busca e tutoriais seguem
 * válidos. Declarado fora da página para não recriar identidade a cada render.
 */
function GroupHeading({ id, label, first }: { id: string; label: string; first?: boolean }) {
  return (
    <div id={id} className={first ? "pb-1" : "pt-5 pb-1"}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export default function ConfigGeralPage() {
  const t = useTranslations("configGeralPage");
  const messages = useMessages();
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [changed, setChanged] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [chatFlows, setChatFlows] = useState<ChatFlow[]>([]);
  // Carência pós-atendimento (destino): filas e usuários usados nos pickers de destino
  const [queues, setQueues] = useState<Queue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lidConsolidationOpen, setLidConsolidationOpen] = useState(false);
  const [instagramPkSanitizeOpen, setInstagramPkSanitizeOpen] = useState(false);
  const userProfile = useAuthStore((s) => s.user?.profile);
  const canRunLidConsolidation = userProfile === "admin" || userProfile === "superadmin";
  const [confirm, setConfirm] = useState<ConfirmDialog>({
    open: false, title: "", message: "", onConfirm: () => {},
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  // Unidade de exibição da carência pós-atendimento (valor sempre salvo em segundos)
  const [botGraceUnit, setBotGraceUnit] = useState<"seconds" | "minutes">("seconds");
  // Feature "Distribuicao Automatica por Fila": exibe info-box no topo quando
  // ao menos uma queue do tenant tem autoDistributeEnabled=true. Avisa que
  // varias settings abaixo interagem com a feature.
  const [hasAutoDistEnabledQueues, setHasAutoDistEnabledQueues] = useState(false);
  // ── UX: seções recolhíveis, filtros e modo compacto ──────────────────────
  // REGRA: o estado inicial de TODOS eles reproduz a página como ela sempre foi
  // (tudo expandido, sem filtro, descrições visíveis). Recolher/filtrar é opt-in
  // do usuário e fica persistido — quem nunca mexer vê exatamente a tela antiga.
  const router = useRouter();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<SettingsStatusFilter>("all");
  const [activeTags, setActiveTags] = useState<SettingTag[]>([]);
  const [compactMode, setCompactMode] = useState(false);
  // Navegação interceptada com alterações pendentes (href de destino)
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);

  // Restaura preferências de layout (nunca afeta valores de configuração)
  useEffect(() => {
    try {
      const rawCollapsed = localStorage.getItem("configGeralCollapsedSections");
      if (rawCollapsed) setCollapsedSections(JSON.parse(rawCollapsed) as Record<string, boolean>);
      setCompactMode(localStorage.getItem("configGeralCompactMode") === "1");
    } catch {
      /* localStorage indisponível → mantém os defaults (tudo aberto, sem compactar) */
    }
  }, []);

  const toggleSection = useCallback((sectionKey: string, open: boolean) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [sectionKey]: !open };
      try {
        localStorage.setItem("configGeralCollapsedSections", JSON.stringify(next));
      } catch {
        /* sem persistência é aceitável — o estado da sessão continua valendo */
      }
      return next;
    });
  }, []);

  const handleCompactChange = useCallback((next: boolean) => {
    setCompactMode(next);
    try {
      localStorage.setItem("configGeralCompactMode", next ? "1" : "0");
    } catch {
      /* idem */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const promises: Promise<unknown>[] = [fetchSettings(), fetchChatFlows(), fetchQueues(), fetchAllUsers()];
        if (tenantId) promises.push(fetchTenantById(tenantId));
        const results = await Promise.all(promises);
        const settingsData = (results[0] as { data: unknown }).data;
        const flowsData = (results[1] as { data: unknown }).data;
        const queuesData = (results[2] as { data: Queue[] }).data;
        const usersData = (results[3] as { data: { users: User[] } }).data;
        // Feature "Distribuicao Automatica por Fila": detecta se alguma queue
        // tem o toggle ligado pra renderizar info-box no topo.
        setHasAutoDistEnabledQueues(
          Array.isArray(queuesData) && queuesData.some((q) => q.autoDistributeEnabled === true)
        );
        // Carência pós-atendimento (destino): guarda filas e usuários pros pickers
        setQueues(Array.isArray(queuesData) ? [...queuesData].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : []);
        const usersArr = Array.isArray(usersData?.users) ? usersData.users : [];
        setUsers([...usersArr].sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR")));
        const settingsArr: Setting[] = Array.isArray(settingsData) ? settingsData : (settingsData as Record<string, unknown>)?.settings as Setting[] || [];

        // Merge tenant-level fields into settings so toggles show correct state
        if (tenantId && results[4]) {
          const raw = (results[4] as { data: unknown }).data;
          const tenantData = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>;
          const tenantFieldMap: Record<string, unknown> = {
            chatbotLane: tenantData?.showChatBot,
            semRedis: tenantData?.noRedis,
            forceReason: tenantData?.forceReason,
            allowPause: tenantData?.allowPause,
            autoUnpauseOnReply: tenantData?.autoUnpauseOnReply,
            allowDuplicateMessages: tenantData?.allowDuplicateMessages,
            autoDisableIntegrationsOnAccept: tenantData?.autoDisableIntegrationsOnAccept,
            botReopenGraceSeconds: tenantData?.botReopenGraceSeconds ?? 0,
            botReopenDestinationType: tenantData?.botReopenDestinationType ?? "lastUser",
            botReopenQueueId: tenantData?.botReopenQueueId ?? "",
            botReopenUserId: tenantData?.botReopenUserId ?? "",
            botReopenChatFlowId: tenantData?.botReopenChatFlowId ?? "",
            scheduleRoutingWindowDays: tenantData?.scheduleRoutingWindowDays ?? 7,
            useUserBusinessHours: tenantData?.useUserBusinessHours,
            webPushChatInterno: tenantData?.webPushChatInterno,
            pushNotificationLimitToOwner: tenantData?.pushNotificationLimitToOwner,
            controleFeatures: tenantData?.controlFeatures,
            ticketNulo: tenantData?.nullTickets,
            forcarAdmin: tenantData?.forceAdmin,
            fixarConexao: tenantData?.fixConnections,
            forcarPendente: tenantData?.forcePendingUser,
            supervisor: tenantData?.supervisorAdmin,
            supervisorChannelScoped: tenantData?.supervisorChannelScoped,
            customProfileEnabled: tenantData?.customProfileEnabled ? "enabled" : "disabled",
            // Backend antigo não tem a coluna: cai em "disabled", que é o comportamento atual.
            userPaymentsEnabled: tenantData?.userPaymentsEnabled ?? "disabled",
            // Backend antigo não tem a coluna: cai em "enabled", que é o default
            // do módulo (a prévia nasce ligada) — sem regressão de exibição.
            pushMessagePreview: tenantData?.pushMessagePreview ?? "enabled",
            // Polaridade INVERTIDA em relação ao irmão acima: nasce "disabled".
            // Backend antigo não tem a coluna e cai aqui, mantendo o comportamento
            // atual (nenhuma supressão) — o toggle só aparece ligado se o tenant optar.
            pushDuplicateSuppression: tenantData?.pushDuplicateSuppression ?? "disabled",
            privacidadeFunil: tenantData?.funnelPrivacy,
            agruparTickets: tenantData?.groupTickets,
            messageListingType: tenantData?.messageListingType,
            listarPelaUltimaMensagem: tenantData?.listByLastMessage,
            ordemReversaLista: tenantData?.reverseOrder,
            validateContact: tenantData?.validateContact,
            brPhoneConvention: tenantData?.brPhoneConvention ?? "legacy",
            userCreationPasswordMode: tenantData?.userCreationPasswordMode ?? "manual",
            hearHubApi: tenantData?.hearHubApi,
            ticketsRain: tenantData?.ticketsRain,
            transbordo: tenantData?.serviceTransfer,
            janelaConversa: tenantData?.forceOpenChatWindow,
            esperarProcessamento: tenantData?.waitProcessExternalInteraction,
            carteiraExterna: tenantData?.walletExternalInteraction,
            ignorarStories: tenantData?.ignoreIgStories,
            mostrarGruposParaTodos: tenantData?.showGroupsForAll,
            audioModulo: tenantData?.audioModule,
            pluginAudio: tenantData?.audioPlugin,
            persistirMedia: tenantData?.baileysMediaPersist,
            mostrarFechadoParaTodos: tenantData?.showClosedForAll,
            atualizarNomes: tenantData?.updateNames,
            bsuidStrictMode: tenantData?.bsuidStrictMode,
            uazapiDisableLid: tenantData?.uazapiDisableLid,
            walletShowAll: tenantData?.walletShowAll,
            contactDeleteAdminOnly: tenantData?.contactDeleteAdminOnly,
            hidePaymentsFromUsers: tenantData?.hidePaymentsFromUsers,
            inboundByQueueOnly: tenantData?.inboundByQueueOnly,
            crossChannelTicketCheck: tenantData?.crossChannelTicketCheck,
            notifyOnlyHumanTickets: tenantData?.notifyOnlyHumanTickets,
            reopenTicketAssignsToActor: tenantData?.reopenTicketAssignsToActor,
            youtubeCommentsCreateTickets: tenantData?.youtubeCommentsCreateTickets,
            tentativas: tenantData?.maxRetries,
            limiteChatInterno: tenantData?.privateMessageLimit,
            limiteTickets: tenantData?.ticketLimit,
            videoConferenceProvider: tenantData?.videoConferenceProvider ?? "jitsi",
            wabaCallRouting: tenantData?.wabaCallRouting ?? "broadcast",
            wabaCallFallbackSeconds: tenantData?.wabaCallFallbackSeconds ?? 15,
            windowTimerBanner: tenantData?.windowTimerBanner ?? "enabled",
            wabaTemplateBanner: tenantData?.wabaTemplateBanner ?? "enabled",
            wabaTemplateBannerMessage: tenantData?.wabaTemplateBannerMessage ?? "",
            windowClosedBanner: tenantData?.windowClosedBanner ?? "enabled",
          };
          // Carência pós-atendimento: valor em segundos; exibir em minutos quando múltiplo
          const graceSecsLoaded = Number(tenantData?.botReopenGraceSeconds ?? 0);
          if (graceSecsLoaded >= 60 && graceSecsLoaded % 60 === 0) setBotGraceUnit("minutes");
          const tenantEntries = Object.entries(tenantFieldMap)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([key, value]) => ({ key, value: String(value) }));
          // Merge: tenant entries override any duplicates from Settings table
          const mergedKeys = new Set(tenantEntries.map((e) => e.key));
          const merged = [...settingsArr.filter((s) => !mergedKeys.has(s.key)), ...tenantEntries];
          setSettings(merged);
        } else {
          setSettings(settingsArr);
        }

        const flows = Array.isArray(flowsData) ? flowsData : ((flowsData as Record<string, unknown>)?.chatFlow || (flowsData as Record<string, unknown>)?.chatFlows || []) as ChatFlow[];
        setChatFlows([...flows].sort((a: ChatFlow, b: ChatFlow) => a.name.localeCompare(b.name, "pt-BR")));
      } catch {
        toast.error(t("errorLoad"));
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  const getValue = (key: string): string => {
    if (key in changed) return changed[key];
    return settings.find((s) => s.key === key)?.value || "";
  };

  const isEnabled = (key: string) => {
    const val = getValue(key);
    // LGPD: hidePaymentsFromUsers padrão é "enabled" quando não existe registro,
    // para garantir conformidade desde o primeiro acesso.
    if (!val && key === "hidePaymentsFromUsers") return true;
    if (!val && key === "youtubeCommentsCreateTickets") return true;
    return val === "enabled" || val === "true" || val === "1";
  };

  const handleChange = useCallback((key: string, value: string) => {
    setChanged((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleToggle = useCallback((key: string, checked: boolean) => {
    const value = checked ? "enabled" : "disabled";
    setChanged((prev) => {
      const next = { ...prev, [key]: value };
      // mutual exclusions: NotViewAssignedTickets/NotViewTicketsChatBot/ticketNulo
      if (key === "ticketNulo" && checked) {
        next.NotViewAssignedTickets = "disabled";
        next.NotViewTicketsChatBot = "disabled";
      }
      if ((key === "NotViewAssignedTickets" || key === "NotViewTicketsChatBot") && checked) {
        next.ticketNulo = "disabled";
      }
      return next;
    });
  }, []);

  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const entries = Object.entries(changed);
      // allSettled em vez de all: com Promise.all, a primeira rejeição mascarava
      // o fato de que as OUTRAS requisições já tinham gravado no servidor — o
      // admin via só "erro" e re-salvava tudo. Aqui sabemos exatamente quais
      // chaves falharam.
      //
      // IMPORTANTE: o estado local resultante é o MESMO de antes em ambos os
      // caminhos. Tudo certo -> limpa `changed` e faz o upsert. Qualquer falha ->
      // mantém `changed` intacto (era o que o catch já fazia), apenas com uma
      // mensagem melhor. Nada de limpeza parcial: se limpássemos as chaves que
      // deram certo, uma chave marcada errado faria o admin acreditar que salvou
      // algo que falhou. Reenviar o que já gravou é idempotente.
      const results = await Promise.allSettled(
        entries.map(([key, value]) => {
          const tenantMapping = TENANT_KEY_MAP[key];
          if (tenantMapping && tenantId) {
            // customProfileEnabled é boolean no backend; demais flags são strings 'enabled'/'disabled'
            const mappedValue =
              tenantMapping.field === "customProfileEnabled"
                ? value === "enabled"
                : value;
            return api.put(`/${tenantMapping.url}/${tenantId}`, {
              id: tenantId,
              [tenantMapping.field]: mappedValue,
            });
          }
          return updateSetting(key, value);
        })
      );

      const failedKeys = results
        .map((r, i) => (r.status === "rejected" ? entries[i][0] : null))
        .filter((k): k is string => k !== null);

      if (failedKeys.length > 0) {
        toast.error(t("errorSavePartial", { keys: failedKeys.join(", ") }));
        return false;
      }

      setSettings((prev) => {
        // Upsert: atualiza chaves existentes e ADICIONA chaves novas (sem registro
        // prévio no DB, ausentes do fetch inicial). Sem o append, um setting salvo
        // pela primeira vez (ex.: aiEngine) some do estado local ao limpar `changed`
        // e o select volta ao padrão até recarregar a tela.
        const existingKeys = new Set(prev.map((s) => s.key));
        const next = prev.map((s) => (s.key in changed ? { ...s, value: changed[s.key] } : s));
        for (const [key, value] of Object.entries(changed)) {
          if (!existingKeys.has(key)) next.push({ key, value });
        }
        return next;
      });

      // Espelha no auth-store o que acabou de ser gravado. Sem isto, o estado local
      // acima deixava a TELA correta enquanto o `configuracoes` do store seguia com o
      // valor antigo — e quem consome `getConfigValue` em runtime (ex.: o gate de som
      // `notificationSilenced` nos hooks de socket) só via a mudança após F5, porque o
      // store só é populado no mount do layout do dashboard (navegação SPA não remonta).
      // Mesmo padrão de `use-settings.ts` no save.
      //
      // APENAS as chaves da tabela Settings: elas chegam ao store com o MESMO nome
      // (o layout as carrega direto de GET /settings). As chaves do TENANT_KEY_MAP são
      // injetadas pelo layout sob outro nome (controleFeatures→controlFeatures,
      // ordemReversaLista→reverseOrder, mostrarGruposParaTodos→showGroupsForAll, ...),
      // então empurrá-las aqui criaria chaves órfãs que ninguém lê.
      const settingsTableEntries = entries
        .filter(([key]) => !TENANT_KEY_MAP[key])
        .map(([key, value]) => ({ key, value }));
      if (settingsTableEntries.length > 0) {
        useAuthStore.getState().setConfiguracoes(settingsTableEntries);
      }
      setChanged({});
      toast.success(t("successSave"));
      return true;
    } catch {
      toast.error(t("errorSave"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirm({ open: true, title, message, onConfirm });
  };

  const runAction = async (actionKey: string, fn: () => Promise<void>) => {
    setActionLoading(actionKey);
    try {
      await fn();
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetFlow = () => {
    openConfirm(
      t("resetFlowTitle"),
      t("resetFlowMsg"),
      async () => {
        await runAction("resetFlow", async () => {
          await updateSetting("botTicketActive", "");
          handleChange("botTicketActive", "");
          setSettings((prev) => prev.map((s) => s.key === "botTicketActive" ? { ...s, value: "" } : s));
          toast.success(t("flowReset"));
        });
      }
    );
  };

  const handleForceMessage = () => {
    openConfirm(
      t("forceMessageTitle"),
      t("forceMessageMsg"),
      async () => {
        await runAction("forceMessage", async () => {
          toast.info(t("processTrying"));
          try {
            await api.post("/forceMessage", {});
            toast.success(t("processStarted"));
          } catch {
            toast.error(t("errorSendMessages"));
          }
        });
      }
    );
  };

  const handleResolvePending = () => {
    openConfirm(
      t("resolveMessagesTitle"),
      t("resolveMessagesMsg"),
      async () => {
        await runAction("resolvePending", async () => {
          toast.info(t("processStarted"));
          try {
            await api.post("/pending/resolvePending", {});
            toast.success(t("processDone"));
          } catch {
            toast.error(t("errorResolveMessages"));
          }
        });
      }
    );
  };

  const handleValidateContacts = () => {
    openConfirm(
      t("validateContactsTitle"),
      t("validateContactsMsg"),
      async () => {
        await runAction("validateContacts", async () => {
          toast.info(t("processStarted"));
          try {
            await api.post("/checkContacts", {});
            toast.success(t("contactsValidated"));
          } catch {
            toast.error(t("errorValidateContacts"));
          }
        });
      }
    );
  };

  const handleSyncMessages = () => {
    openConfirm(
      t("syncMessagesTitle"),
      t("syncMessagesMsg"),
      async () => {
        await runAction("syncMessages", async () => {
          toast.info(t("processStarted"));
          try {
            await api.post("/messagesUpdateSyncTime", {});
            toast.success(t("syncMessagesUpdating"));
          } catch {
            toast.error(t("errorUpdateMessages"));
          }
        });
      }
    );
  };

  const handleSyncTicketData = () => {
    openConfirm(
      t("syncTicketsTitle"),
      t("syncTicketsMsg"),
      async () => {
        await runAction("syncTicketData", async () => {
          toast.info(t("processStarted"));
          try {
            await api.put("/ticketsLastMessageAt", {});
            toast.success(t("ticketsUpdated"));
          } catch {
            toast.error(t("errorUpdateTickets"));
          }
        });
      }
    );
  };

  const handleScanContacts = () => {
    openConfirm(
      t("scanContactsTitle"),
      t("scanContactsMsg"),
      async () => {
        await runAction("scanContacts", async () => {
          toast.info(t("processStarted"));
          try {
            await api.post("/scanContacts", {});
            toast.success(t("contactsUpdated"));
          } catch {
            toast.error(t("errorUpdateContacts"));
          }
        });
      }
    );
  };

  const handleNormalizeBirthdays = () => {
    openConfirm(
      t("normalizeBirthdaysTitle"),
      t("normalizeBirthdaysMsg"),
      async () => {
        await runAction("normalizeBirthdays", async () => {
          toast.info(t("processStarted"));
          try {
            const { data } = await api.post("/contacts/normalize-birthdays", {});
            toast.success(t("normalizeBirthdaysDone", { count: (data as { normalized?: number })?.normalized ?? 0 }));
          } catch {
            toast.error(t("errorUpdateContacts"));
          }
        });
      }
    );
  };

  const allSettingItems = useMemo(() => [
    { id: "NotViewAssignedTickets", label: t("notViewAssignedTickets"), section: t("ticketsVisibilityTitle") },
    { id: "NotViewTicketsChatBot", label: t("notViewTicketsChatBot"), section: t("ticketsVisibilityTitle") },
    { id: "DirectTicketsToWallets", label: t("directTicketsToWallets"), section: t("ticketsVisibilityTitle") },
    { id: "DirectTicketsToContactQueue", label: t("directTicketsToContactQueue"), section: t("ticketsVisibilityTitle") },
    { id: "ticketNulo", label: t("ticketNulo"), section: t("ticketsVisibilityTitle") },
    { id: "supervisor", label: t("supervisor"), section: t("ticketsVisibilityTitle") },
    { id: "supervisorChannelScoped", label: t("supervisorChannelScoped"), section: t("ticketsVisibilityTitle") },
    { id: "customProfileEnabled", label: t("customProfileEnabled"), section: t("ticketsVisibilityTitle") },
    { id: "userPaymentsEnabled", label: t("userPaymentsEnabled"), section: t("ticketsVisibilityTitle") },
    { id: "privacidadeFunil", label: t("privacidadeFunil"), section: t("ticketsVisibilityTitle") },
    { id: "semRedis", label: t("semRedis"), section: t("ticketsVisibilityTitle") },
    { id: "botTicketActive", label: t("botFlowActive"), section: t("botChatbotTitle") },
    // Estavam renderizadas na página mas fora do índice — invisíveis na busca.
    { id: "autoDisableIntegrationsOnAccept", label: t("autoDisableIntegrationsOnAccept"), section: t("botChatbotTitle") },
    { id: "aiEngine", label: t("aiEngine"), section: t("botChatbotTitle") },
    { id: "ignoreGroupMsg", label: t("ignoreGroupMsg"), section: t("botChatbotTitle") },
    { id: "ignorarStories", label: t("ignorarStories"), section: t("botChatbotTitle") },
    { id: "mostrarGruposParaTodos", label: t("mostrarGruposParaTodos"), section: t("botChatbotTitle") },
    { id: "mostrarFechadoParaTodos", label: t("mostrarFechadoParaTodos"), section: t("botChatbotTitle") },
    { id: "rejectCalls", label: t("rejectCalls"), section: t("botChatbotTitle") },
    { id: "chatbotLane", label: t("chatbotLane"), section: t("botChatbotTitle") },
    { id: "fixarConexao", label: t("fixarConexao"), section: t("botChatbotTitle") },
    { id: "forcarPendente", label: t("forcarPendente"), section: t("botChatbotTitle") },
    { id: "agruparTickets", label: t("agruparTickets"), section: t("orgDistTitle") },
    { id: "messageListingType", label: t("messageListingType"), section: t("orgDistTitle") },
    { id: "videoConferenceProvider", label: t("videoConferenceProvider"), section: t("orgDistTitle") },
    { id: "wabaCallRouting", label: t("wabaCallRouting"), section: t("orgDistTitle") },
    { id: "wabaCallFallbackSeconds", label: t("wabaCallFallbackSeconds"), section: t("orgDistTitle") },
    { id: "windowTimerBanner", label: t("windowTimerBanner"), section: t("orgDistTitle") },
    { id: "wabaTemplateBanner", label: t("wabaTemplateBanner"), section: t("orgDistTitle") },
    { id: "windowClosedBanner", label: t("windowClosedBanner"), section: t("orgDistTitle") },
    { id: "listarPelaUltimaMensagem", label: t("listarPelaUltimaMensagem"), section: t("orgDistTitle") },
    { id: "ordemReversaLista", label: t("ordemReversaLista"), section: t("orgDistTitle") },
    { id: "validateContact", label: t("validateContact"), section: t("orgDistTitle") },
    { id: "brPhoneConvention", label: t("brPhoneConvention"), section: t("orgDistTitle") },
    { id: "userCreationPasswordMode", label: t("userCreationPasswordMode"), section: t("orgDistTitle") },
    { id: "hearHubApi", label: t("hearHubApi"), section: t("orgDistTitle") },
    { id: "ticketsRain", label: t("ticketsRain"), section: t("orgDistTitle") },
    { id: "carteiraExterna", label: t("carteiraExterna"), section: t("orgDistTitle") },
    { id: "walletShowAll", label: t("walletShowAll"), section: t("orgDistTitle") },
    { id: "contactDeleteAdminOnly", label: t("contactDeleteAdminOnly"), section: t("orgDistTitle") },
    { id: "hidePaymentsFromUsers", label: t("hidePaymentsFromUsers"), section: t("orgDistTitle") },
    { id: "inboundByQueueOnly", label: t("inboundByQueueOnly"), section: t("orgDistTitle") },
    { id: "crossChannelTicketCheck", label: t("crossChannelTicketCheck"), section: t("ticketsVisibilityTitle") },
    { id: "notifyOnlyHumanTickets", label: t("notifyOnlyHumanTickets"), section: t("botChatbotTitle") },
    { id: "reopenTicketAssignsToActor", label: t("reopenTicketAssignsToActor"), section: t("attendanceResourcesTitle") },
    { id: "youtubeCommentsCreateTickets", label: t("youtubeCommentsCreateTickets"), section: t("orgDistTitle") },
    { id: "esperarProcessamento", label: t("esperarProcessamento"), section: t("orgDistTitle") },
    { id: "transbordo", label: t("transbordo"), section: t("orgDistTitle") },
    { id: "janelaConversa", label: t("janelaConversa"), section: t("orgDistTitle") },
    { id: "atualizarNomes", label: t("atualizarNomes"), section: t("orgDistTitle") },
    { id: "bsuidStrictMode", label: t("bsuidStrictMode"), section: t("orgDistTitle") },
    { id: "forcarAdmin", label: t("forcarAdmin"), section: t("orgDistTitle") },
    { id: "uazapiDisableLid", label: t("uazapiDisableLid"), section: t("orgDistTitle") },
    { id: "signed", label: t("signed"), section: t("attendanceResourcesTitle") },
    { id: "controleFeatures", label: t("controleFeatures"), section: t("attendanceResourcesTitle") },
    { id: "forceReason", label: t("forceReason"), section: t("attendanceResourcesTitle") },
    { id: "allowPause", label: t("allowPause"), section: t("attendanceResourcesTitle") },
    { id: "autoUnpauseOnReply", label: t("autoUnpauseOnReply"), section: t("attendanceResourcesTitle") },
    { id: "allowDuplicateMessages", label: t("allowDuplicateMessages"), section: t("attendanceResourcesTitle") },
    { id: "botReopenGraceSeconds", label: t("botReopenGrace"), section: t("attendanceResourcesTitle") },
    { id: "botReopenDestinationType", label: t("botReopenDestination"), section: t("attendanceResourcesTitle") },
    { id: "scheduleRoutingWindowDays", label: t("scheduleRoutingWindow"), section: t("attendanceResourcesTitle") },
    { id: "offlineOnTabClose", label: t("offlineOnTabClose"), section: t("attendanceResourcesTitle") },
    { id: "universalCounter", label: t("universalCounter"), section: t("attendanceResourcesTitle") },
    { id: "pluginAudio", label: t("pluginAudio"), section: t("attendanceResourcesTitle") },
    { id: "audioModulo", label: t("audioModulo"), section: t("attendanceResourcesTitle") },
    { id: "persistirMedia", label: t("persistirMedia"), section: t("attendanceResourcesTitle") },
    { id: "useUserBusinessHours", label: t("useUserBusinessHours"), section: t("attendanceResourcesTitle") },
    { id: "webPushChatInterno", label: t("webPushChatInterno"), section: t("attendanceResourcesTitle") },
    { id: "pushNotificationLimitToOwner", label: t("pushNotificationLimitToOwner"), section: t("attendanceResourcesTitle") },
    { id: "notificationSilenced", label: t("notificationSilenced"), section: t("attendanceResourcesTitle") },
    { id: "pushMessagePreview", label: t("pushMessagePreview"), section: t("attendanceResourcesTitle") },
    { id: "pushDuplicateSuppression", label: t("pushDuplicateSuppression"), section: t("attendanceResourcesTitle") },
    { id: "autoClose", label: t("autoClose"), section: t("attendanceResourcesTitle") },
    { id: "queuePositionEnabled", label: t("queuePositionGlobalEnabledLabel"), section: t("attendanceResourcesTitle") },
    { id: "ticketLimit", label: t("ticketLimit"), section: t("attendanceResourcesTitle") },
    { id: "tentativas", label: t("tentativas"), section: t("attendanceResourcesTitle") },
    { id: "limiteTickets", label: t("limiteTickets"), section: t("attendanceResourcesTitle") },
    { id: "limiteChatInterno", label: t("limiteChatInterno"), section: t("attendanceResourcesTitle") },
    { id: "forbiddenNumbers", label: t("forbiddenNumbers"), section: t("attendanceResourcesTitle") },
    { id: "forceMessage", label: t("forceMessageTitle"), section: t("systemActionsTitle") },
    { id: "resolvePending", label: t("resolveMessagesTitle"), section: t("systemActionsTitle") },
    { id: "validateContacts", label: t("validateContactsTitle"), section: t("systemActionsTitle") },
    { id: "syncMessages", label: t("syncMessagesTitle"), section: t("systemActionsTitle") },
    { id: "syncTicketData", label: t("syncTicketsTitle"), section: t("systemActionsTitle") },
    { id: "scanContacts", label: t("scanContactsTitle"), section: t("systemActionsTitle") },
    ...(canRunLidConsolidation ? [{ id: "normalizeBirthdays", label: t("normalizeBirthdaysTitle"), section: t("systemActionsTitle") }] : []),
    ...(canRunLidConsolidation ? [{ id: "lidConsolidation", label: t("lidConsolidationTitle"), section: t("systemActionsTitle") }] : []),
    ...(canRunLidConsolidation ? [{ id: "instagramPkSanitize", label: t("instagramPkSanitizeTitle"), section: t("systemActionsTitle") }] : []),
  ], [t, canRunLidConsolidation]);

  // \u00cdndice r\u00f3tulo -> descri\u00e7\u00e3o, montado a partir das mensagens cruas do namespace.
  // A conven\u00e7\u00e3o do arquivo de locale \u00e9 `chave` + `chaveDesc`, ent\u00e3o d\u00e1 para indexar
  // as descri\u00e7\u00f5es sem precisar repetir as ~85 chaves i18n no array acima.
  const descByLabel = useMemo(() => {
    const ns = (messages as Record<string, unknown>)?.configGeralPage as
      | Record<string, unknown>
      | undefined;
    const map: Record<string, string> = {};
    if (!ns) return map;
    for (const key of Object.keys(ns)) {
      const label = ns[key];
      const desc = ns[`${key}Desc`];
      if (typeof label === "string" && typeof desc === "string") map[label] = desc;
    }
    return map;
  }, [messages]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = norm(searchQuery);
    return allSettingItems.filter(item =>
      norm(item.label).includes(q) ||
      norm(item.section).includes(q) ||
      // Busca tamb\u00e9m na descri\u00e7\u00e3o: o admin costuma lembrar do EFEITO da op\u00e7\u00e3o,
      // n\u00e3o do nome exato dela.
      norm(descByLabel[item.label] || "").includes(q)
    ).slice(0, 8);
  }, [searchQuery, allSettingItems, descByLabel]);

  const scrollToSetting = useCallback((id: string) => {
    setSearchQuery("");
    setShowSearchResults(false);
    setHighlightedKey(id);
    // Sem isto a busca quebraria: com a se\u00e7\u00e3o recolhida ou com um filtro ativo,
    // o elemento `row-<id>` pode estar escondido (ou fora da lista renderizada) e
    // o scrollIntoView n\u00e3o teria efeito vis\u00edvel. Abrimos a se\u00e7\u00e3o do alvo e
    // zeramos os filtros ANTES de rolar \u2014 garantia por constru\u00e7\u00e3o, n\u00e3o por sorte.
    const section = sectionOfSetting(id);
    if (section) setCollapsedSections((prev) => (prev[section] ? { ...prev, [section]: false } : prev));
    setStatusFilter("all");
    setActiveTags([]);
    setTimeout(() => {
      const el = document.getElementById(`row-${id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    setTimeout(() => setHighlightedKey(null), 2500);
  }, []);

  const hasChanges = Object.keys(changed).length > 0;
  const hasActiveFilters = statusFilter !== "all" || activeTags.length > 0;

  // Uma setting passa no filtro quando atende ao status E a pelo menos uma das
  // tags marcadas (OR entre tags, AND entre status e tags).
  const matchesFilters = useCallback(
    (key: string) => {
      if (statusFilter === "enabled" && !isEnabled(key)) return false;
      if (statusFilter === "changed" && !(key in changed)) return false;
      if (activeTags.length > 0) {
        const tags = SETTINGS_BY_KEY[key]?.tags ?? [];
        if (!tags.some((tg) => activeTags.includes(tg))) return false;
      }
      return true;
    },
    // isEnabled depende de settings/changed; ambos entram nas deps abaixo
    [statusFilter, activeTags, changed, settings] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const statusCounts = useMemo(() => {
    const all = SETTINGS_CATALOG.length;
    let enabled = 0;
    for (const e of SETTINGS_CATALOG) if (isEnabled(e.key)) enabled += 1;
    return { all, enabled, changed: Object.keys(changed).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, changed]);

  const tagItems = useMemo(
    () =>
      SETTING_TAG_ORDER.map((tag) => ({
        tag,
        label: t(tagLabelKey(tag)),
        count: SETTINGS_CATALOG.filter((e) => e.tags.includes(tag)).length,
      })),
    [t]
  );

  const toggleTag = useCallback((tag: SettingTag) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }, []);

  const clearFilters = useCallback(() => {
    setStatusFilter("all");
    setActiveTags([]);
  }, []);

  // Contagem "N de M ativas" por card, para o header e o índice lateral.
  const sectionCounts = useMemo(() => {
    const acc: Record<string, { active: number; total: number }> = {};
    for (const section of SETTING_SECTION_ORDER) acc[section] = { active: 0, total: 0 };
    for (const e of SETTINGS_CATALOG) {
      // Ações do sistema são execuções, não configurações — não entram na contagem.
      if (e.section === "systemActionsTitle") continue;
      acc[e.section].total += 1;
      if (isEnabled(e.key)) acc[e.section].active += 1;
    }
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, changed]);

  const sectionNavItems = useMemo(
    () =>
      SETTING_SECTION_ORDER.map((key) => ({
        key,
        label: t(key),
        countLabel:
          key === "systemActionsTitle"
            ? undefined
            : `${sectionCounts[key]?.active ?? 0}/${sectionCounts[key]?.total ?? 0}`,
      })),
    [t, sectionCounts]
  );

  // Lista "antes -> depois" exibida no popover da barra de pendências.
  const pendingEntries = useMemo<PendingChangeEntry[]>(() => {
    const labelOf = (key: string) => allSettingItems.find((i) => i.id === key)?.label ?? key;
    const fmt = (v: string | undefined) => {
      if (v === undefined || v === "") return t("pendingValueEmpty");
      if (v === "enabled" || v === "true" || v === "1") return t("pendingValueOn");
      if (v === "disabled" || v === "false" || v === "0") return t("pendingValueOff");
      return v;
    };
    return Object.entries(changed).map(([key, value]) => ({
      key,
      label: labelOf(key),
      from: fmt(settings.find((s) => s.key === key)?.value),
      to: fmt(value),
    }));
  }, [changed, settings, allSettingItems, t]);

  // Com filtro ativo a seção fica sempre aberta: filtrar e continuar vendo um
  // card fechado passaria a impressão de que o filtro não fez nada. Ao limpar os
  // filtros, cada seção volta ao estado que o usuário tinha escolhido.
  const isSectionOpen = useCallback(
    (key: string) => hasActiveFilters || !collapsedSections[key],
    [hasActiveFilters, collapsedSections]
  );

  const handleSectionSelect = useCallback((key: string) => {
    // Abre a seção antes de rolar — mesma garantia usada na busca.
    setCollapsedSections((prev) => (prev[key] ? { ...prev, [key]: false } : prev));
    setTimeout(() => {
      document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  // Guard de saída: beforeunload + intercepção de cliques em links internos.
  // Só fica armado enquanto existem alterações pendentes.
  useUnsavedChangesGuard({
    enabled: hasChanges,
    onIntercept: setPendingNavHref,
  });

  // Aplica os filtros diretamente no DOM em vez de condicionar os ~75 call-sites.
  // Motivo: manter os elementos `row-*` montados preserva a busca (getElementById)
  // e o Ctrl+F nativo. Sem filtro ativo, removemos o atributo de todas as linhas —
  // ou seja, a página volta a ser exatamente o que era antes.
  useEffect(() => {
    // Usa `style.display` e NÃO o atributo `hidden`: as linhas têm `flex` no
    // className e o `[hidden]{display:none}` do preflight do Tailwind tem a mesma
    // especificidade de uma classe, perdendo para o utilitário que vem depois no
    // cascade. Estilo inline vence os dois.
    const apply = (id: string, hide: boolean) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (hide) el.style.setProperty("display", "none");
      else el.style.removeProperty("display");
    };
    for (const entry of SETTINGS_CATALOG) {
      const hide = hasActiveFilters && !matchesFilters(entry.key);
      apply(`row-${entry.key}`, hide);
    }

    // Notas e dicas (`js-setting-hint`): são irmãs da linha ou vivem dentro de
    // blocos condicionais, fora do alcance do SettingRow. Duas razões para sumir,
    // avaliadas JUNTAS — se fossem dois laços, o segundo desfaria o display do
    // primeiro ao limpar o estilo:
    //   1. o filtro escondeu a linha dona (senão a nota fica órfã na tela);
    //   2. modo compacto, que existe para cortar exatamente esse texto longo.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(".js-setting-hint"))) {
      const ownerKey = el.id.startsWith("note-") ? el.id.slice("note-".length) : null;
      const hiddenByFilter = ownerKey ? hasActiveFilters && !matchesFilters(ownerKey) : false;
      if (compactMode || hiddenByFilter) el.style.setProperty("display", "none");
      else el.style.removeProperty("display");
    }
    // Sub-campos condicionais não são settings próprias (não entram no catálogo
    // nem na contagem "N de M ativas"), mas precisam sumir junto com o pai para
    // não ficarem órfãos na tela sob filtro.
    const dependents: Record<string, string> = {
      wabaCallFallbackSeconds: "wabaCallRouting",
      wabaTemplateBannerMessage: "wabaTemplateBanner",
    };
    for (const [child, parent] of Object.entries(dependents)) {
      apply(`row-${child}`, hasActiveFilters && !matchesFilters(parent));
    }
    // Sub-cabeçalhos de grupo somem quando todas as linhas do grupo sumiram.
    for (const [, groups] of Object.entries(SETTING_GROUP_ORDER)) {
      for (const group of groups) {
        const keys = SETTINGS_CATALOG.filter((e) => e.group === group).map((e) => e.key);
        const allHidden = hasActiveFilters && keys.every((k) => !matchesFilters(k));
        apply(`group-${group}`, allHidden);
      }
    }
    // Card inteiro some quando nenhuma das suas settings passou no filtro —
    // sem isso restaria só o cabeçalho e a tela pareceria não ter filtrado nada.
    for (const section of SETTING_SECTION_ORDER) {
      if (section === "systemActionsTitle") continue;
      const keys = SETTINGS_CATALOG.filter((e) => e.section === section).map((e) => e.key);
      apply(`section-${section}`, hasActiveFilters && keys.every((k) => !matchesFilters(k)));
    }
    // Ações do sistema são execuções: sem sentido sob filtro de configuração.
    apply("section-systemActionsTitle", hasActiveFilters);
  }, [hasActiveFilters, matchesFilters, loading, collapsedSections, compactMode]);

  // `SettingRow`/`Toggle` viviam declarados AQUI dentro. Como ganhavam identidade
  // nova a cada render, o React desmontava e remontava as 61 linhas a cada toggle
  // e a cada tecla digitada em qualquer campo da página. Agora vêm de um módulo
  // próprio (memoizados) e recebem o ambiente por contexto — os call-sites
  // continuam idênticos. `isEnabled` NÃO foi movida: segue sendo a única fonte
  // dos defaults especiais (hidePaymentsFromUsers / youtubeCommentsCreateTickets).
  const rowContextValue = useMemo(
    () => ({
      isEnabled,
      onToggle: handleToggle,
      highlightedKey,
      compact: compactMode,
    }),
    // isEnabled fecha sobre settings/changed, então ambos precisam entrar aqui
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, changed, handleToggle, highlightedKey, compactMode]
  );

  // A ajuda precisa existir tambem no skeleton: sem isso o botao de ajuda
  // some da pagina enquanto os dados carregam.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
      { title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1"), t("helpS3I2")] },
      { title: t("helpS4T"), items: [t("helpS4I0"), t("helpS4I1"), t("helpS4I2")] },
      { title: t("helpS5T"), items: [t("helpS5I0"), t("helpS5I1")] },
      { title: t("helpS6T"), items: [t("helpS6I0"), t("helpS6I1")] },
      { title: t("helpS7T"), items: [t("helpS7I0"), t("helpS7I1"), t("helpS7I2")] },
      { title: t("helpS8T"), items: [t("helpS8I0"), t("helpS8I1")] },
      { title: t("helpS9T"), items: [t("helpS9I0"), t("helpS9I1"), t("helpS9I2"), t("helpS9I3")] },
      { title: t("helpS10T"), items: [t("helpS10I0"), t("helpS10I1"), t("helpS10I2")] },
    ],
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} help={pageHelp} />
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={pageHelp}
      >
        <div className="flex flex-wrap gap-2">
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={() => setChanged({})} title={t("discard")}>
              <RotateCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("discard")}</span>
            </Button>
          )}
          <Button size="sm" disabled={!hasChanges || saving} onClick={handleSave} title={saving ? t("saving") : t("save")}>
            <Save className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{saving ? t("saving") : t("save")}</span>
          </Button>
        </div>
      </PageHeader>

      {/* Busca + filtros (status, tema) + modo compacto */}
      <SettingsFilterBar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        results={searchResults}
        onSelectResult={scrollToSetting}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusCounts={statusCounts}
        tags={tagItems}
        activeTags={activeTags}
        onToggleTag={toggleTag}
        compact={compactMode}
        onCompactChange={handleCompactChange}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        labels={{
          searchPlaceholder: t("searchPlaceholder"),
          noResults: t("searchNoResults"),
          filterAll: t("filterAll"),
          filterEnabled: t("filterEnabled"),
          filterChanged: t("filterChanged"),
          filterByTheme: t("filterByTheme"),
          clearFilters: t("clearFilters"),
          compactMode: t("compactMode"),
          searchHint: t("searchHint"),
        }}
      />

      {/* Alterações pendentes: contador + revisão antes/depois + salvar/descartar */}
      <SettingsPendingBar
        entries={pendingEntries}
        saving={saving}
        onSave={handleSave}
        onDiscard={() => setChanged({})}
        labels={{
          count: pendingEntries.length === 1 ? t("pendingCountOne") : t("pendingCount", { count: pendingEntries.length }),
          review: t("pendingReview"),
          discard: t("discard"),
          save: t("save"),
          saving: t("saving"),
          settingColumn: t("pendingSettingColumn"),
          fromColumn: t("pendingFromColumn"),
          toColumn: t("pendingToColumn"),
        }}
      />

      {/* Info-box condicional: avisa que ha filas com Distribuicao Automatica
          ligada, e algumas settings abaixo sao sobrescritas para tickets dessas
          filas. So aparece quando ha pelo menos 1 queue com toggle ligado. */}
      {hasAutoDistEnabledQueues && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-3">
          <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              {t("autoDistEnabledTitle")}
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200/90">
              {t("autoDistEnabledDesc")}
            </p>
          </div>
        </div>
      )}

      <SettingRowProvider value={rowContextValue}>
      <div className="flex flex-col lg:flex-row lg:gap-6">
        <SettingsSectionNav
          items={sectionNavItems}
          onSelect={handleSectionSelect}
          title={t("sectionNavTitle")}
        />
        <div className="flex-1 min-w-0 space-y-6">

        {/* Tickets e Visibilidade */}
        <SettingsCollapsibleSection
          sectionKey="ticketsVisibilityTitle"
          title={t("ticketsVisibilityTitle")}
          description={t("ticketsVisibilityDesc")}
          open={isSectionOpen("ticketsVisibilityTitle")}
          onOpenChange={(o) => toggleSection("ticketsVisibilityTitle", o)}
          countLabel={t("sectionActiveCount", {
            active: sectionCounts.ticketsVisibilityTitle?.active ?? 0,
            total: sectionCounts.ticketsVisibilityTitle?.total ?? 0,
          })}
        >
            <SettingRow
              settingKey="NotViewAssignedTickets"
              label={t("notViewAssignedTickets")}
              description={t("notViewAssignedTicketsDesc")}
            />
            <SettingRow
              settingKey="NotViewTicketsChatBot"
              label={t("notViewTicketsChatBot")}
              description={t("notViewTicketsChatBotDesc")}
            />
            <SettingRow
              settingKey="DirectTicketsToWallets"
              label={t("directTicketsToWallets")}
              description={t("directTicketsToWalletsDesc")}
            />
            <p id="note-DirectTicketsToWallets" className="js-setting-hint text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
              {t("directTicketsToWalletsAutoDistNote")}
            </p>
            <SettingRow
              settingKey="DirectTicketsToContactQueue"
              label={t("directTicketsToContactQueue")}
              description={t("directTicketsToContactQueueDesc")}
            />
            <SettingRow
              settingKey="ticketNulo"
              label={t("ticketNulo")}
              description={t("ticketNuloDesc")}
            />
            <SettingRow
              settingKey="supervisor"
              label={t("supervisor")}
              description={t("supervisorDesc")}
            />
            <SettingRow
              settingKey="supervisorChannelScoped"
              label={t("supervisorChannelScoped")}
              description={t("supervisorChannelScopedDesc")}
            />
            <SettingRow
              settingKey="customProfileEnabled"
              label={t("customProfileEnabled")}
              description={t("customProfileEnabledDesc")}
            />
            <SettingRow
              settingKey="userPaymentsEnabled"
              label={t("userPaymentsEnabled")}
              description={t("userPaymentsEnabledDesc")}
            />
            <SettingRow
              settingKey="privacidadeFunil"
              label={t("privacidadeFunil")}
              description={t("privacidadeFunilDesc")}
            />
            <SettingRow
              settingKey="crossChannelTicketCheck"
              label={t("crossChannelTicketCheck")}
              description={t("crossChannelTicketCheckDesc")}
            />
            <p id="note-crossChannelTicketCheck" className="js-setting-hint text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
              {t("crossChannelTicketCheckNote")}
            </p>
            <div id="row-semRedis" className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0">
              <div className="flex-1 min-w-0 pr-2 sm:pr-4">
                <Label className="text-sm font-medium break-words">{t("semRedis")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5 break-words">{t("semRedisDesc")}</p>
              </div>
              <Switch checked={true} disabled={true} className="shrink-0" />
            </div>
        </SettingsCollapsibleSection>

        {/* Bot e Chatbot */}
        <SettingsCollapsibleSection
          sectionKey="botChatbotTitle"
          title={t("botChatbotTitle")}
          description={t("botChatbotDesc")}
          open={isSectionOpen("botChatbotTitle")}
          onOpenChange={(o) => toggleSection("botChatbotTitle", o)}
          countLabel={t("sectionActiveCount", {
            active: sectionCounts.botChatbotTitle?.active ?? 0,
            total: sectionCounts.botChatbotTitle?.total ?? 0,
          })}
        >
            {/* botTicketActive */}
            <div id="row-botTicketActive" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-border/40">
              <div className="flex-1 min-w-0 sm:pr-4">
                <Label className="text-sm font-medium">{t("botFlowActive")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("botFlowActiveDesc")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={getValue("botTicketActive") || "__none__"}
                  onValueChange={(v) => handleChange("botTicketActive", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder={t("none")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("none")}</SelectItem>
                    {chatFlows.map((flow) => (
                      <SelectItem key={flow.id} value={String(flow.id)}>{flow.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={handleResetFlow} title={t("resetFlowTitle")}>
                  <RefreshCw className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
            <SettingRow
              settingKey="autoDisableIntegrationsOnAccept"
              label={t("autoDisableIntegrationsOnAccept")}
              description={t("autoDisableIntegrationsOnAcceptDesc")}
            />
            <SettingRow
              settingKey="notifyOnlyHumanTickets"
              label={t("notifyOnlyHumanTickets")}
              description={t("notifyOnlyHumanTicketsDesc")}
            />
            <p id="note-notifyOnlyHumanTickets" className="js-setting-hint text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
              {t("notifyOnlyHumanTicketsNote")}
            </p>
            {/* aiEngine — motor do assistente OpenAI (Assistants → Responses) */}
            <div id="row-aiEngine" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-border/40">
              <div className="flex-1 min-w-0 sm:pr-4">
                <Label className="text-sm font-medium">{t("aiEngine")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("aiEngineDesc")}</p>
              </div>
              <Select
                value={getValue("aiEngine") || "auto"}
                onValueChange={(v) => handleChange("aiEngine", v)}
              >
                <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("aiEngineAuto")}</SelectItem>
                  <SelectItem value="responses">{t("aiEngineResponses")}</SelectItem>
                  <SelectItem value="threads">{t("aiEngineThreads")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SettingRow
              settingKey="ignoreGroupMsg"
              label={t("ignoreGroupMsg")}
              description={t("ignoreGroupMsgDesc")}
            />
            <SettingRow
              settingKey="ignorarStories"
              label={t("ignorarStories")}
              description={t("ignorarStoriesDesc")}
            />
            <SettingRow
              settingKey="mostrarGruposParaTodos"
              label={t("mostrarGruposParaTodos")}
              description={t("mostrarGruposParaTodosDesc")}
            />
            <SettingRow
              settingKey="mostrarFechadoParaTodos"
              label={t("mostrarFechadoParaTodos")}
              description={t("mostrarFechadoParaTodosDesc")}
            />
            <SettingRow
              settingKey="rejectCalls"
              label={t("rejectCalls")}
              description={t("rejectCallsDesc")}
            />
            {isEnabled("rejectCalls") && (
              <div className="py-2 px-1 border-b border-border/40">
                <Label className="text-sm">{t("rejectCallMessage")}</Label>
                <Textarea
                  className="mt-1.5 min-h-[80px]"
                  value={getValue("callRejectMessage")}
                  onChange={(e) => handleChange("callRejectMessage", e.target.value)}
                />
              </div>
            )}
            <SettingRow
              settingKey="chatbotLane"
              label={t("chatbotLane")}
              description={t("chatbotLaneDesc")}
            />
            <SettingRow
              settingKey="fixarConexao"
              label={t("fixarConexao")}
              description={t("fixarConexaoDesc")}
            />
            <SettingRow
              settingKey="forcarPendente"
              label={t("forcarPendente")}
              description={t("forcarPendenteDesc")}
            />
        </SettingsCollapsibleSection>

        {/* Organização */}
        <SettingsCollapsibleSection
          sectionKey="orgDistTitle"
          title={t("orgDistTitle")}
          description={t("orgDistDesc")}
          open={isSectionOpen("orgDistTitle")}
          onOpenChange={(o) => toggleSection("orgDistTitle", o)}
          countLabel={t("sectionActiveCount", {
            active: sectionCounts.orgDistTitle?.active ?? 0,
            total: sectionCounts.orgDistTitle?.total ?? 0,
          })}
        >
            <GroupHeading id="group-groupListing" label={t("groupListing")} first />
            <SettingRow
              settingKey="agruparTickets"
              label={t("agruparTickets")}
              description={t("agruparTicketsDesc")}
            />
            {/* messageListingType */}
            <div id="row-messageListingType" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-border/40">
              <div className="flex-1 min-w-0 sm:pr-4">
                <Label className="text-sm font-medium">{t("messageListingType")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("messageListingTypeDesc")}</p>
              </div>
              <Select
                value={getValue("messageListingType") || "default"}
                onValueChange={(v) => handleChange("messageListingType", v)}
              >
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t("listingDefault")}</SelectItem>
                  <SelectItem value="byQueue">{t("listingByQueue")}</SelectItem>
                  <SelectItem value="complete">{t("listingComplete")}</SelectItem>
                  <SelectItem value="byTicket">{t("listingByTicket")}</SelectItem>
                  <SelectItem value="byUser">{t("listingByUser")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p id="note-messageListingType" className="js-setting-hint text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
              {t("messageListingTypeNote")}
            </p>
            <SettingRow
              settingKey="listarPelaUltimaMensagem"
              label={t("listarPelaUltimaMensagem")}
              description={t("listarPelaUltimaMensagemDesc")}
            />
            <SettingRow
              settingKey="ordemReversaLista"
              label={t("ordemReversaLista")}
              description={t("ordemReversaListaDesc")}
            />
            <GroupHeading id="group-groupWaba" label={t("groupWaba")} />
            {/* videoConferenceProvider */}
            <div id="row-videoConferenceProvider" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-border/40">
              <div className="flex-1 min-w-0 sm:pr-4">
                <Label className="text-sm font-medium">{t("videoConferenceProvider")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("videoConferenceProviderDesc")}</p>
              </div>
              <Select
                value={getValue("videoConferenceProvider") || "jitsi"}
                onValueChange={(v) => handleChange("videoConferenceProvider", v)}
              >
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jitsi">Jitsi</SelectItem>
                  <SelectItem value="google_meet">Google Meet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* wabaCallRouting */}
            <div id="row-wabaCallRouting" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-border/40">
              <div className="flex-1 min-w-0 sm:pr-4">
                <Label className="text-sm font-medium">{t("wabaCallRouting")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("wabaCallRoutingDesc")}</p>
              </div>
              <Select
                value={getValue("wabaCallRouting") || "broadcast"}
                onValueChange={(v) => handleChange("wabaCallRouting", v)}
              >
                <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="broadcast">{t("wabaCallRoutingBroadcast")}</SelectItem>
                  <SelectItem value="assigned-ticket">{t("wabaCallRoutingAssignedTicket")}</SelectItem>
                  <SelectItem value="round-robin">{t("wabaCallRoutingRoundRobin")}</SelectItem>
                  <SelectItem value="queue-fallback">{t("wabaCallRoutingQueueFallback")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(getValue("wabaCallRouting") || "broadcast") === "queue-fallback" && (
              <div id="row-wabaCallFallbackSeconds" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-border/40">
                <div className="flex-1 min-w-0 sm:pr-4">
                  <Label className="text-sm font-medium">{t("wabaCallFallbackSeconds")}</Label>
                  <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("wabaCallFallbackSecondsDesc")}</p>
                </div>
                <Input
                  type="number"
                  min={5}
                  max={120}
                  className="w-full sm:w-[120px]"
                  value={getValue("wabaCallFallbackSeconds") || "15"}
                  onChange={(e) => handleChange("wabaCallFallbackSeconds", e.target.value)}
                />
              </div>
            )}
            {/* Avisos da janela de 24h no topo do chat (WABA/Hub/Instagram/Messenger) */}
            <SettingRow
              settingKey="windowTimerBanner"
              label={t("windowTimerBanner")}
              description={t("windowTimerBannerDesc")}
            />
            <SettingRow
              settingKey="wabaTemplateBanner"
              label={t("wabaTemplateBanner")}
              description={t("wabaTemplateBannerDesc")}
            />
            {isEnabled("wabaTemplateBanner") && (
              <div id="row-wabaTemplateBannerMessage" className="flex flex-col gap-2 py-2 border-b border-border/40">
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">{t("wabaTemplateBannerMsg")}</Label>
                  <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("wabaTemplateBannerMsgDesc")}</p>
                </div>
                <Textarea
                  value={getValue("wabaTemplateBannerMessage")}
                  onChange={(e) => handleChange("wabaTemplateBannerMessage", e.target.value)}
                  placeholder={t("wabaTemplateBannerMsgPlaceholder")}
                  rows={2}
                  maxLength={1000}
                />
              </div>
            )}
            <SettingRow
              settingKey="windowClosedBanner"
              label={t("windowClosedBanner")}
              description={t("windowClosedBannerDesc")}
            />
            <GroupHeading id="group-groupPhone" label={t("groupPhone")} />
            <SettingRow
              settingKey="validateContact"
              label={t("validateContact")}
              description={t("validateContactDesc")}
            />
            {/* brPhoneConvention — convenção do 9º dígito BR */}
            <div id="row-brPhoneConvention" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-border/40">
              <div className="flex-1 min-w-0 sm:pr-4">
                <Label className="text-sm font-medium">{t("brPhoneConvention")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("brPhoneConventionDesc")}</p>
              </div>
              <Select
                value={getValue("brPhoneConvention") || "legacy"}
                onValueChange={(v) => handleChange("brPhoneConvention", v)}
              >
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="legacy">{t("brPhoneConventionLegacy")}</SelectItem>
                  <SelectItem value="always9">{t("brPhoneConventionAlways9")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p id="note-brPhoneConvention" className="js-setting-hint text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
              {t("brPhoneConventionNote")}
            </p>
            <GroupHeading id="group-groupWallet" label={t("groupWallet")} />
            {/* userCreationPasswordMode — como usuários novos recebem a senha */}
            <div id="row-userCreationPasswordMode" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-border/40">
              <div className="flex-1 min-w-0 sm:pr-4">
                <Label className="text-sm font-medium">{t("userCreationPasswordMode")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("userCreationPasswordModeDesc")}</p>
              </div>
              <Select
                value={getValue("userCreationPasswordMode") || "manual"}
                onValueChange={(v) => handleChange("userCreationPasswordMode", v)}
              >
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t("userCreationPasswordModeManual")}</SelectItem>
                  <SelectItem value="forceChange">{t("userCreationPasswordModeForceChange")}</SelectItem>
                  <SelectItem value="invite">{t("userCreationPasswordModeInvite")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p id="note-userCreationPasswordMode" className="js-setting-hint text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
              {t("userCreationPasswordModeNote")}
            </p>
            <SettingRow
              settingKey="hearHubApi"
              label={t("hearHubApi")}
              description={t("hearHubApiDesc")}
            />
            <SettingRow
              settingKey="ticketsRain"
              label={t("ticketsRain")}
              description={t("ticketsRainDesc")}
            />
            <SettingRow
              settingKey="carteiraExterna"
              label={t("carteiraExterna")}
              description={t("carteiraExternaDesc")}
            />
            <SettingRow
              settingKey="walletShowAll"
              label={t("walletShowAll")}
              description={t("walletShowAllDesc")}
            />
            <SettingRow
              settingKey="contactDeleteAdminOnly"
              label={t("contactDeleteAdminOnly")}
              description={t("contactDeleteAdminOnlyDesc")}
            />
            <SettingRow
              settingKey="hidePaymentsFromUsers"
              label={t("hidePaymentsFromUsers")}
              description={t("hidePaymentsFromUsersDesc")}
            />
            <SettingRow
              settingKey="inboundByQueueOnly"
              label={t("inboundByQueueOnly")}
              description={t("inboundByQueueOnlyDesc")}
            />
            <GroupHeading id="group-groupIntegrations" label={t("groupIntegrations")} />
            <SettingRow
              settingKey="youtubeCommentsCreateTickets"
              label={t("youtubeCommentsCreateTickets")}
              description={t("youtubeCommentsCreateTicketsDesc")}
            />
            <SettingRow
              settingKey="esperarProcessamento"
              label={t("esperarProcessamento")}
              description={t("esperarProcessamentoDesc")}
            />
            <SettingRow
              settingKey="transbordo"
              label={t("transbordo")}
              description={t("transbordoDesc")}
            />
            <p id="note-transbordo" className="js-setting-hint text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
              {t("transbordoAutoDistNote")}
            </p>
            <SettingRow
              settingKey="janelaConversa"
              label={t("janelaConversa")}
              description={t("janelaConversaDesc")}
            />
            <SettingRow
              settingKey="atualizarNomes"
              label={t("atualizarNomes")}
              description={t("atualizarNomesDesc")}
            />
            <SettingRow
              settingKey="bsuidStrictMode"
              label={t("bsuidStrictMode")}
              description={t("bsuidStrictModeDesc")}
            />
            <SettingRow
              settingKey="forcarAdmin"
              label={t("forcarAdmin")}
              description={t("forcarAdminDesc")}
            />
            <p id="note-forcarAdmin" className="js-setting-hint text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
              {t("forcarAdminAutoDistNote")}
            </p>
            <SettingRow
              settingKey="uazapiDisableLid"
              label={t("uazapiDisableLid")}
              description={t("uazapiDisableLidDesc")}
            />
        </SettingsCollapsibleSection>

        {/* Atendimento e Recursos */}
        <SettingsCollapsibleSection
          sectionKey="attendanceResourcesTitle"
          title={t("attendanceResourcesTitle")}
          description={t("attendanceResourcesDesc")}
          open={isSectionOpen("attendanceResourcesTitle")}
          onOpenChange={(o) => toggleSection("attendanceResourcesTitle", o)}
          countLabel={t("sectionActiveCount", {
            active: sectionCounts.attendanceResourcesTitle?.active ?? 0,
            total: sectionCounts.attendanceResourcesTitle?.total ?? 0,
          })}
        >
            <GroupHeading id="group-groupService" label={t("groupService")} first />
            <SettingRow
              settingKey="signed"
              label={t("signed")}
              description={t("signedDesc")}
            />
            <SettingRow
              settingKey="controleFeatures"
              label={t("controleFeatures")}
              description={t("controleFeaturesDesc")}
            />
            <SettingRow
              settingKey="forceReason"
              label={t("forceReason")}
              description={t("forceReasonDesc")}
            />
            <SettingRow
              settingKey="allowPause"
              label={t("allowPause")}
              description={t("allowPauseDesc")}
            />
            <SettingRow
              settingKey="autoUnpauseOnReply"
              label={t("autoUnpauseOnReply")}
              description={t("autoUnpauseOnReplyDesc")}
            />
            <SettingRow
              settingKey="allowDuplicateMessages"
              label={t("allowDuplicateMessages")}
              description={t("allowDuplicateMessagesDesc")}
            />
            <GroupHeading id="group-groupReopen" label={t("groupReopen")} />
            {/* botReopenGraceSeconds: valor numérico (segundos) no tenant — switch derivado
                de valor > 0; NÃO usar SettingRow/isEnabled (trataria "30" como desligado) */}
            <div
              id="row-botReopenGraceSeconds"
              className={`flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0 rounded-sm transition-colors duration-500 ${highlightedKey === "botReopenGraceSeconds" ? "bg-yellow-100/70 dark:bg-yellow-800/25" : ""}`}
            >
              <div className="flex-1 min-w-0 pr-2 sm:pr-4">
                <Label className="text-sm font-medium break-words">{t("botReopenGrace")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5 break-words">{t("botReopenGraceDesc")}</p>
              </div>
              <div className="shrink-0">
                <Switch
                  checked={Number(getValue("botReopenGraceSeconds") || "0") > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setBotGraceUnit("minutes");
                      handleChange("botReopenGraceSeconds", "60");
                    } else {
                      handleChange("botReopenGraceSeconds", "0");
                    }
                  }}
                />
              </div>
            </div>
            <p id="note-botReopenGraceSeconds" className="js-setting-hint text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50 whitespace-pre-line">
              {t("botReopenGraceScenarios")}
            </p>
            {Number(getValue("botReopenGraceSeconds") || "0") > 0 && (
              <div className="py-2 px-1 border-b border-border/40 space-y-3">
                <div>
                  <Label className="text-sm">{t("botReopenGraceValueLabel")}</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={botGraceUnit === "minutes" ? 1440 : 86400}
                      className="w-full sm:w-[140px]"
                      value={botGraceUnit === "minutes"
                        ? Math.max(1, Math.round(Number(getValue("botReopenGraceSeconds") || "0") / 60))
                        : Number(getValue("botReopenGraceSeconds") || "0")}
                      onChange={(e) => {
                        const n = Math.max(0, Number(e.target.value) || 0);
                        handleChange("botReopenGraceSeconds", String(botGraceUnit === "minutes" ? n * 60 : n));
                      }}
                    />
                    <Select
                      value={botGraceUnit}
                      onValueChange={(v) => {
                        const secs = Number(getValue("botReopenGraceSeconds") || "0");
                        if (v === "minutes" && botGraceUnit === "seconds") {
                          handleChange("botReopenGraceSeconds", String(Math.max(60, Math.round(secs / 60) * 60)));
                        }
                        setBotGraceUnit(v as "seconds" | "minutes");
                      }}
                    >
                      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seconds">{t("botReopenGraceUnitSeconds")}</SelectItem>
                        <SelectItem value="minutes">{t("botReopenGraceUnitMinutes")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            {/* Carência pós-atendimento (destino): só faz sentido quando a carência
                está ligada (segundos > 0). Escolhe pra onde a conversa volta quando o
                cliente responde dentro da janela. botReopenDestinationType define o tipo;
                pickers condicionais gravam o id do destino (fila/usuário/fluxo). */}
            {Number(getValue("botReopenGraceSeconds") || "0") > 0 && (
              <div
                id="row-botReopenDestinationType"
                className={`py-2 px-1 border-b border-border/40 space-y-3 rounded-sm transition-colors duration-500 ${highlightedKey === "botReopenDestinationType" ? "bg-yellow-100/70 dark:bg-yellow-800/25" : ""}`}
              >
                <div>
                  <Label className="text-sm font-medium">{t("botReopenDestination")}</Label>
                  <Select
                    value={getValue("botReopenDestinationType") || "lastUser"}
                    onValueChange={(v) => handleChange("botReopenDestinationType", v)}
                  >
                    <SelectTrigger className="mt-1.5 w-full sm:w-[260px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lastUser">{t("botReopenDestLastUser")}</SelectItem>
                      <SelectItem value="closedUser">{t("botReopenDestClosedUser")}</SelectItem>
                      <SelectItem value="queue">{t("botReopenDestQueue")}</SelectItem>
                      <SelectItem value="user">{t("botReopenDestUser")}</SelectItem>
                      <SelectItem value="chatflow">{t("botReopenDestChatFlow")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="js-setting-hint text-xs text-muted-foreground mt-1.5 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
                    {t("botReopenDestinationHint")}
                  </p>
                </div>
                {(getValue("botReopenDestinationType") || "lastUser") === "queue" && (
                  <div>
                    <Label className="text-sm">{t("botReopenDestQueue")}</Label>
                    <Select
                      value={getValue("botReopenQueueId") || "__none__"}
                      onValueChange={(v) => handleChange("botReopenQueueId", v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="mt-1.5 w-full sm:w-[260px]"><SelectValue placeholder={t("botReopenQueuePicker")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("botReopenQueuePicker")}</SelectItem>
                        {queues.map((q) => (
                          <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(getValue("botReopenDestinationType") || "lastUser") === "user" && (
                  <div>
                    <Label className="text-sm">{t("botReopenDestUser")}</Label>
                    <Select
                      value={getValue("botReopenUserId") || "__none__"}
                      onValueChange={(v) => handleChange("botReopenUserId", v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="mt-1.5 w-full sm:w-[260px]"><SelectValue placeholder={t("botReopenUserPicker")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("botReopenUserPicker")}</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(getValue("botReopenDestinationType") || "lastUser") === "chatflow" && (
                  <div>
                    <Label className="text-sm">{t("botReopenDestChatFlow")}</Label>
                    <Select
                      value={getValue("botReopenChatFlowId") || "__none__"}
                      onValueChange={(v) => handleChange("botReopenChatFlowId", v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="mt-1.5 w-full sm:w-[260px]"><SelectValue placeholder={t("botReopenChatFlowPicker")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("botReopenChatFlowPicker")}</SelectItem>
                        {chatFlows.map((flow) => (
                          <SelectItem key={flow.id} value={String(flow.id)}>{flow.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            {/* scheduleRoutingWindowDays: janela (dias) do roteamento de resposta a
                agendada — valor numérico no tenant; switch derivado de valor > 0 */}
            <div
              id="row-scheduleRoutingWindowDays"
              className={`flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0 rounded-sm transition-colors duration-500 ${highlightedKey === "scheduleRoutingWindowDays" ? "bg-yellow-100/70 dark:bg-yellow-800/25" : ""}`}
            >
              <div className="flex-1 min-w-0 pr-2 sm:pr-4">
                <Label className="text-sm font-medium break-words">{t("scheduleRoutingWindow")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5 break-words">{t("scheduleRoutingWindowDesc")}</p>
              </div>
              <div className="shrink-0">
                <Switch
                  checked={Number(getValue("scheduleRoutingWindowDays") || "0") > 0}
                  onCheckedChange={(checked) => handleChange("scheduleRoutingWindowDays", checked ? "7" : "0")}
                />
              </div>
            </div>
            {Number(getValue("scheduleRoutingWindowDays") || "0") > 0 && (
              <div className="py-2 px-1 border-b border-border/40 space-y-3">
                <div>
                  <Label className="text-sm">{t("scheduleRoutingWindowValueLabel")}</Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      className="w-full sm:w-[140px]"
                      value={Number(getValue("scheduleRoutingWindowDays") || "0")}
                      onChange={(e) => handleChange("scheduleRoutingWindowDays", String(Math.max(0, Math.min(365, Number(e.target.value) || 0))))}
                    />
                    <span className="text-sm text-muted-foreground">{t("scheduleRoutingWindowUnitDays")}</span>
                  </div>
                </div>
              </div>
            )}
            <SettingRow
              settingKey="offlineOnTabClose"
              label={t("offlineOnTabClose")}
              description={t("offlineOnTabCloseDesc")}
            />
            <SettingRow
              settingKey="reopenTicketAssignsToActor"
              label={t("reopenTicketAssignsToActor")}
              description={t("reopenTicketAssignsToActorDesc")}
            />
            <p id="note-reopenTicketAssignsToActor" className="js-setting-hint text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
              {t("reopenTicketAssignsToActorAutoDistNote")}
            </p>
            <SettingRow
              settingKey="universalCounter"
              label={t("universalCounter")}
              description={t("universalCounterDesc")}
            />
            <GroupHeading id="group-groupMedia" label={t("groupMedia")} />
            <SettingRow
              settingKey="pluginAudio"
              label={t("pluginAudio")}
              description={t("pluginAudioDesc")}
            />
            <SettingRow
              settingKey="audioModulo"
              label={t("audioModulo")}
              description={t("audioModuloDesc")}
            />
            <SettingRow
              settingKey="persistirMedia"
              label={t("persistirMedia")}
              description={t("persistirMediaDesc")}
            />
            <GroupHeading id="group-groupNotifications" label={t("groupNotifications")} />
            <SettingRow
              settingKey="useUserBusinessHours"
              label={t("useUserBusinessHours")}
              description={t("useUserBusinessHoursDesc")}
            />
            <SettingRow
              settingKey="webPushChatInterno"
              label={t("webPushChatInterno")}
              description={t("webPushChatInternoDesc")}
            />
            <SettingRow
              settingKey="pushNotificationLimitToOwner"
              label={t("pushNotificationLimitToOwner")}
              description={t("pushNotificationLimitToOwnerDesc")}
            />
            <SettingRow
              settingKey="notificationSilenced"
              label={t("notificationSilenced")}
              description={t("notificationSilencedDesc")}
            />
            <SettingRow
              settingKey="pushMessagePreview"
              label={t("pushMessagePreview")}
              description={t("pushMessagePreviewDesc")}
            />
            <SettingRow
              settingKey="pushDuplicateSuppression"
              label={t("pushDuplicateSuppression")}
              description={t("pushDuplicateSuppressionDesc")}
            />
            <GroupHeading id="group-groupLimits" label={t("groupLimits")} />
            {/* autoClose */}
            <SettingRow
              settingKey="autoClose"
              label={t("autoClose")}
              description={t("autoCloseDesc")}
            />
            {isEnabled("autoClose") && (
              <div className="py-2 px-1 border-b border-border/40 space-y-3">
                <div className="js-setting-hint rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                  {t("autoCloseChannelOverrideNote")}
                </div>
                <div>
                  <Label className="text-sm">{t("autoCloseTimeLabel")}</Label>
                  <Select
                    value={getValue("autoCloseTime") || "10"}
                    onValueChange={(v) => handleChange("autoCloseTime", v)}
                  >
                    <SelectTrigger className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">{t("time10min")}</SelectItem>
                      <SelectItem value="60">{t("time1hour")}</SelectItem>
                      <SelectItem value="1440">{t("time1day")}</SelectItem>
                      <SelectItem value="7200">{t("time5days")}</SelectItem>
                      <SelectItem value="14400">{t("time10days")}</SelectItem>
                      <SelectItem value="custom">{t("timeCustom")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {getValue("autoCloseTime") === "custom" && (
                  <div>
                    <Label className="text-sm">{t("autoCloseCustomLabel")}</Label>
                    <Input
                      type="number"
                      min={1}
                      className="mt-1.5 w-full sm:w-[180px]"
                      value={getValue("autoCloseTimeCustom")}
                      onChange={(e) => handleChange("autoCloseTimeCustom", e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <Label className="text-sm">{t("autoCloseMessage")}</Label>
                  <Textarea
                    className="mt-1.5 min-h-[80px]"
                    value={getValue("autoCloseMessage")}
                    onChange={(e) => handleChange("autoCloseMessage", e.target.value)}
                  />
                </div>
              </div>
            )}
            {/* queuePositionEnabled */}
            <SettingRow
              settingKey="queuePositionEnabled"
              label={t("queuePositionGlobalEnabledLabel")}
              description={t("queuePositionGlobalEnabledHint")}
            />
            {isEnabled("queuePositionEnabled") && (
              <div className="py-2 px-1 border-b border-border/40 space-y-3">
                <div>
                  <Label className="text-sm">{t("queuePositionAvgLabel")}</Label>
                  <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("queuePositionAvgHint")}</p>
                  <Input
                    type="number"
                    min={1}
                    max={600}
                    className="mt-1.5 w-full sm:w-[180px]"
                    value={getValue("queuePositionAvgMinutes") || "5"}
                    onChange={(e) => handleChange("queuePositionAvgMinutes", e.target.value)}
                    placeholder={t("queuePositionAvgPlaceholder")}
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("queuePositionMessageLabel")}</Label>
                  <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t.raw("queuePositionPlaceholdersHint") as string}</p>
                  <Textarea
                    className="mt-1.5 min-h-[96px]"
                    value={getValue("queuePositionMessage")}
                    onChange={(e) => handleChange("queuePositionMessage", e.target.value)}
                    placeholder={t.raw("queuePositionMessagePlaceholder") as string}
                  />
                </div>
              </div>
            )}
            {/* ticketLimit */}
            <SettingRow
              settingKey="ticketLimit"
              label={t("ticketLimit")}
              description={t("ticketLimitDesc")}
            />
            {isEnabled("ticketLimit") && (
              <div className="grid grid-cols-[1fr_96px] items-center gap-3 sm:gap-6 py-2 border-b border-border/40">
                <div className="min-w-0">
                  <Label className="text-sm font-medium break-words">{t("ticketLimitDays")}</Label>
                  <p className="js-setting-hint text-xs text-muted-foreground mt-0.5 break-words">{t("ticketLimitDaysDesc")}</p>
                </div>
                <Input
                  type="number"
                  min={1}
                  className="text-center"
                  value={getValue("ticketLimitDaysAgo")}
                  onChange={(e) => handleChange("ticketLimitDaysAgo", e.target.value)}
                />
              </div>
            )}
            {/* Number inputs */}
            {[
              {
                key: "tentativas",
                label: t("tentativas"),
                description: t("tentativasDesc"),
              },
              {
                key: "limiteTickets",
                label: t("limiteTickets"),
                description: t("limiteTicketsDesc"),
              },
              {
                key: "limiteChatInterno",
                label: t("limiteChatInterno"),
                description: t("limiteChatInternoDesc"),
              },
            ].map(({ key, label, description }) => (
              <div key={key} id={`row-${key}`} className="grid grid-cols-[1fr_96px] items-center gap-3 sm:gap-6 py-2 border-b border-border/40 last:border-0">
                <div className="min-w-0">
                  <Label className="text-sm font-medium break-words">{label}</Label>
                  <p className="js-setting-hint text-xs text-muted-foreground mt-0.5 break-words">{description}</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  className="text-center"
                  value={getValue(key)}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
              </div>
            ))}
            {/* forbiddenNumbers */}
            <div id="row-forbiddenNumbers" className="grid grid-cols-1 sm:grid-cols-[1fr_256px] items-start gap-6 py-3 border-t border-border/40">
              <div>
                <Label className="text-sm font-medium">{t("forbiddenNumbers")}</Label>
                <p className="js-setting-hint text-xs text-muted-foreground mt-0.5">{t("forbiddenNumbersDesc")}</p>
              </div>
              <Input
                value={getValue("forbiddenNumbers")}
                onChange={(e) => handleChange("forbiddenNumbers", e.target.value)}
                placeholder={t("forbiddenNumbersPlaceholder")}
              />
            </div>
        </SettingsCollapsibleSection>

        {/* Ações do Sistema */}
        <SettingsCollapsibleSection
          sectionKey="systemActionsTitle"
          title={t("systemActionsTitle")}
          description={t("systemActionsDesc")}
          open={isSectionOpen("systemActionsTitle")}
          onOpenChange={(o) => toggleSection("systemActionsTitle", o)}
        >
            {[
              {
                key: "forceMessage",
                label: t("forceMessageTitle"),
                description: t("forceMessageDesc"),
                onClick: handleForceMessage,
              },
              {
                key: "resolvePending",
                label: t("resolveMessagesTitle"),
                description: t("resolveMessagesDesc"),
                onClick: handleResolvePending,
              },
              {
                key: "validateContacts",
                label: t("validateContactsTitle"),
                description: t("validateContactsDesc"),
                onClick: handleValidateContacts,
              },
              {
                key: "syncMessages",
                label: t("syncMessagesTitle"),
                description: t("syncMessagesDesc"),
                onClick: handleSyncMessages,
              },
              {
                key: "syncTicketData",
                label: t("syncTicketsTitle"),
                description: t("syncTicketsDesc"),
                onClick: handleSyncTicketData,
              },
              {
                key: "scanContacts",
                label: t("scanContactsTitle"),
                description: t("scanContactsDesc"),
                onClick: handleScanContacts,
              },
              ...(canRunLidConsolidation ? [{
                key: "normalizeBirthdays",
                label: t("normalizeBirthdaysTitle"),
                description: t("normalizeBirthdaysDesc"),
                onClick: handleNormalizeBirthdays,
              }] : []),
              ...(canRunLidConsolidation ? [{
                key: "lidConsolidation",
                label: t("lidConsolidationTitle"),
                description: t("lidConsolidationDesc"),
                onClick: () => setLidConsolidationOpen(true),
                icon: ShieldAlert,
              }] : []),
              ...(canRunLidConsolidation ? [{
                key: "instagramPkSanitize",
                label: t("instagramPkSanitizeTitle"),
                description: t("instagramPkSanitizeDesc"),
                onClick: () => setInstagramPkSanitizeOpen(true),
                icon: ShieldAlert,
              }] : []),
            ].map((action) => (
              <div key={action.key} id={`row-${action.key}`} className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0">
                <div className="flex-1 min-w-0 pr-2 sm:pr-4">
                  <Label className="text-sm font-medium break-words">{action.label}</Label>
                  <p className="js-setting-hint text-xs text-muted-foreground mt-0.5 break-words">{action.description}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={action.onClick}
                  disabled={actionLoading === action.key}
                  className="text-destructive border-destructive/40 hover:bg-destructive/10"
                >
                  {actionLoading === action.key ? (
                    <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                  ) : (action as any).icon ? (
                    <ShieldAlert className="h-4 w-4 sm:mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 sm:mr-2" />
                  )}
                  {/* Antes o botão era só ícone: nada indicava que ali se EXECUTA algo. */}
                  <span className="hidden sm:inline">{t("actionExecute")}</span>
                </Button>
              </div>
            ))}
        </SettingsCollapsibleSection>
        </div>
      </div>
      </SettingRowProvider>

      {/* Confirmation Dialog */}
      <Dialog open={confirm.open} onOpenChange={(open) => !open && setConfirm((c) => ({ ...c, open: false }))}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{confirm.title}</DialogTitle>
            <DialogDescription>{confirm.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm((c) => ({ ...c, open: false }))}>
              {t("no")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirm((c) => ({ ...c, open: false }));
                confirm.onConfirm();
              }}
            >
              {t("yes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FloatingSaveButton saving={saving} disabled={!hasChanges} onClick={handleSave} />

      {/* Saída com alterações pendentes: o clique num link interno é interceptado
          pelo guard e cai aqui em vez de descartar as mudanças em silêncio. */}
      <UnsavedChangesDialog
        open={pendingNavHref !== null}
        onOpenChange={(open) => !open && setPendingNavHref(null)}
        onDiscard={() => {
          const href = pendingNavHref;
          setChanged({});
          setPendingNavHref(null);
          if (href) router.push(href);
        }}
        onSave={async () => {
          const href = pendingNavHref;
          const ok = await handleSave();
          if (ok) {
            setPendingNavHref(null);
            if (href) router.push(href);
          }
        }}
        saving={saving}
        labels={{
          title: t("leaveTitle"),
          message: t("leaveMessage"),
          stay: t("leaveStay"),
          discard: t("leaveDiscard"),
          save: t("leaveSave"),
        }}
      />
      {canRunLidConsolidation && (
        <LidConsolidationDialog open={lidConsolidationOpen} onOpenChange={setLidConsolidationOpen} />
      )}
      {canRunLidConsolidation && (
        <InstagramPkSanitizeDialog open={instagramPkSanitizeOpen} onOpenChange={setInstagramPkSanitizeOpen} />
      )}
    </div>
  );
}
