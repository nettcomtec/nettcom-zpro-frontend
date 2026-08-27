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
  | "CAT";

export interface ProbeResult {
  id: ProbeId;
  status: ProbeStatus;
  label: string;
  detail: string | null;
  durationMs: number;
}

export interface DiagnoseResult {
  whatsappId: number;
  type: MetaChannel;
  channelName: string;
  webhookOrigin: "own_app" | "zdg_oauth" | null;
  overallStatus: ProbeStatus;
  checkedAt: string;
  probes: ProbeResult[];
}

export async function diagnoseMetaChannel(whatsappId: number, crossTenant = false) {
  return api.get<DiagnoseResult>(
    crossTenant
      ? `/whatsappTenants/actions/${whatsappId}/diagnose`
      : `/metaChannelDiagnose/${whatsappId}`
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
