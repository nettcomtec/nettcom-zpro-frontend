import api from "@/lib/api";

export interface LicenseStatus {
  recovery: boolean;
  reason: "is_blocked" | "status_false" | "domain_mismatch" | "heartbeat_failed" | null;
  /**
   * Campo ADITIVO: por que a licenca foi bloqueada, quando o motivo e o ENDERECO
   * desta instalacao. `reason` continua sendo um dos quatro de sempre — um valor
   * novo ali apareceria como chave de traducao crua num front desatualizado.
   * Backend antigo nao envia: ausente = mensagem generica, como sempre foi.
   */
  blockedReason?: "domain" | "domain_enforced" | null;
}

export interface LicenseRecoverResponse {
  ok: boolean;
  licensedDomains?: string | string[];
  productId?: string;
  licenseExpiry?: string;
}

export interface LicenseRecheckResponse extends LicenseRecoverResponse {
  /** true = a instalacao ESTAVA em recuperacao e saiu agora. */
  recovered?: boolean;
  /**
   * Chave desta instalacao com os 4 primeiros caracteres visiveis e o resto
   * mascarado — identifica QUAL licenca esta configurada aqui (quem administra
   * mais de uma pode ter trocado as chaves entre instalacoes). Backend antigo
   * nao envia: a tela simplesmente nao mostra o marcador.
   */
  licenseCodeMasked?: string;
}

export async function fetchLicenseStatus() {
  return api.get<LicenseStatus>("/license/status");
}

export async function recoverLicense(licenseCode: string) {
  return api.post<LicenseRecoverResponse>("/license/recover", { licenseCode });
}

export async function recoverLicenseDomain(domains: string[]) {
  return api.post<LicenseRecoverResponse>("/license/recover-domain", { domains });
}

/**
 * F5 (Painel do Licenciado) — revalida a licenca AGORA, sem esperar o ciclo do
 * heartbeat. Rota ADITIVA: backend antigo nao a tem, entao o chamador precisa
 * tratar 404/405 e tambem o 402 LICENSE_BLOCKED (em instalacoes antigas a rota
 * nao esta na allowlist do modo de recuperacao).
 */
export async function recheckLicense() {
  return api.post<LicenseRecheckResponse>("/license/recheck");
}
