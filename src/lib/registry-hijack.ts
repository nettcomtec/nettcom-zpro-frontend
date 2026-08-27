import { AxiosError } from "axios";
import api from "./api";

/**
 * Quando o backend rejeita o registro de um canal porque o identificador
 * (ig_user_id, page_id, phone_number_id, shop_domain, etc.) ja esta vinculado
 * a outra instalacao (zpro antigo / outro reseller), a resposta e um 409
 * com payload reduzido:
 *
 *   { message, statusCode: 409, hijack: true, channel, errorCode,
 *     existing: { apiUrlMasked, registeredAt } }
 *
 * Nao expomos licenseKey, tenantEmail, token HMAC nem nada que permita abuso.
 */
export interface HijackDetails {
  channel:      string;
  errorCode:    string;
  apiUrlMasked: string;
  registeredAt: string | null;
}

export function parseHijackError(err: unknown): HijackDetails | null {
  const ax = err as AxiosError<any>;
  const data = ax?.response?.data;
  if (ax?.response?.status !== 409) return null;
  if (!data?.hijack || !data?.existing) return null;
  return {
    channel:      String(data.channel || ""),
    errorCode:    String(data.errorCode || "ALREADY_REGISTERED"),
    apiUrlMasked: String(data.existing.apiUrlMasked || "***"),
    registeredAt: data.existing.registeredAt || null,
  };
}

/**
 * Libera o identificador em outra instalacao e vincula aqui.
 * Chamado apos o usuario confirmar o dialog.
 */
export async function takeoverRegistry(params: {
  channel:     string;
  identifier:  string;
  callbackUrl: string;
}): Promise<void> {
  await api.post("/registry-takeover", params);
}
