import api from "@/lib/api";

export type MetaChannel = "instagram" | "messenger" | "waba";
export type ProbeStatus = "ok" | "warn" | "error";
export type ProbeId =
  | "TOKEN"
  | "IBAID"
  | "PAGE_ID"
  | "WABA_ID"
  | "SUBSCRIPTION"
  | "FIELDS"
  | "REGISTRY"
  | "ACCOUNT_TYPE"
  | "PHONE_NUMBER"
  | "CAT"
  /** Termos da Marketing Messages API (só WABA, só com `?mmStatus=1`). Informativo:
   *  status sempre "ok" e `detail` = valor cru da Meta (ONBOARDED, ELIGIBLE…). */
  | "MM_ONBOARDING";

export interface ProbeResult {
  id: ProbeId;
  status: ProbeStatus;
  label: string;
  detail: string | null;
  durationMs: number;
}

// Avisos que a Meta manda sobre a conta e os números do WhatsApp oficial
// (docs/PLANO_WABA_AVISOS_CONTA_ROTEAMENTO.md §10, contrato do aviso). Só informativos:
// nada aqui muda o status do canal. Sem templates nem pagamento da Índia.
export type MetaAccountEventKind =
  | "ban"
  | "restriction"
  | "violation"
  | "review"
  | "alert"
  | "name"
  | "capability"
  | "security"
  | "partner"
  | "quality"
  | "other";

export type MetaAccountEventDetailValue = string | number | boolean | null;

export interface MetaAccountEventSummary {
  kind: MetaAccountEventKind;
  /** Código principal da Meta em MAIÚSCULAS com "_" (event, decision, ban_state, alert_type…). */
  code: string | null;
  /** Dígitos do número citado no aviso. */
  phone: string | null;
  /** Só campos conhecidos, valores curtos. */
  details: Record<string, MetaAccountEventDetailValue> | null;
  /** Texto livre da Meta (reserva quando o código não tem tradução). */
  text: string | null;
}

export interface MetaAccountEvent {
  /** BIGINT: pode chegar como texto. */
  id: number | string;
  field: string;
  eventType: string | null;
  createdAt: string;
  metaTime: string | null;
  whatsappId: number | null;
  summary: MetaAccountEventSummary | null;
}

export interface DiagnoseResult {
  whatsappId: number;
  type: MetaChannel;
  channelName: string;
  webhookOrigin: "own_app" | "zdg_oauth" | null;
  overallStatus: ProbeStatus;
  checkedAt: string;
  probes: ProbeResult[];
  /**
   * Últimos avisos da conta (mais novos primeiro, até 20). Ausente = backend antigo ou
   * tabela sem a migration: a seção não aparece. Lista vazia = nenhum aviso.
   */
  accountEvents?: MetaAccountEvent[];
}

export async function diagnoseMetaChannel(whatsappId: number, crossTenant = false) {
  // `mmStatus=1` pede o item dos termos da Marketing Messages API (WABA). Backend antigo
  // ignora o parâmetro; a rota entre empresas (superadmin) não o recebe.
  return api.get<DiagnoseResult>(
    crossTenant
      ? `/whatsappTenants/actions/${whatsappId}/diagnose`
      : `/metaChannelDiagnose/${whatsappId}`,
    crossTenant ? undefined : { params: { mmStatus: 1 } }
  );
}

export interface RevalidateWarning {
  code: string;
  probe: ProbeId | string;
  detail: string | null;
  needsRevalidation: boolean;
}

export interface RevalidateResult {
  success: boolean;
  data?: any;
  warnings: RevalidateWarning[];
  needsRevalidation: boolean;
}

export async function revalidateMetaWebhook(whatsappId: number, crossTenant = false) {
  return api.post<RevalidateResult>(
    crossTenant
      ? `/whatsappTenants/actions/${whatsappId}/revalidate-meta-webhook`
      : `/metaChannelRevalidateWebhook/${whatsappId}`
  );
}
