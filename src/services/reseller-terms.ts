import axios from "axios";
import api from "@/lib/api";
import type { TermsSection } from "@/lib/terms-doc";

// PLANO_ACEITE_TERMOS_REVENDA §5.5 — chamadas dos termos do revendedor.
// Rotas ADITIVAS: backend antigo responde 404/405/501 → `isBackendMissing` e a
// tela fica como era. O interceptor do `lib/api` rejeita com `error.response ||
// error`, então o status vem em `err.status` (ler os dois formatos).

export interface ResellerTermsVersionSummary {
  id: number;
  version: number;
  requiresReaccept: boolean;
  charCount: number;
  publishedByName: string | null;
  createdAt: string;
}

export interface ResellerTermsVersionFull extends ResellerTermsVersionSummary {
  sections: TermsSection[];
}

export interface ResellerTermsAdminResponse {
  required: boolean;
  draftSections: TermsSection[] | null;
  draftUpdatedAt: string | null;
  versions: ResellerTermsVersionSummary[];
}

export interface ResellerTermsTenantStatusItem {
  lastVersion: number | null;
  lastAcceptedAt: string | null;
  adminCount: number;
}

export interface ResellerTermsTenantsStatusResponse {
  required: boolean;
  requiredVersion: number | null;
  currentVersion: number | null;
  items: Record<string, ResellerTermsTenantStatusItem>;
}

export interface ResellerTermsAcceptance {
  id: string;
  tenantId: number;
  tenantName: string | null;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  versionId: number;
  version: number;
  contentHash: string;
  hashAlgo: string;
  ip: string | null;
  ipSource: "xff" | "x-real-ip" | "socket" | null;
  forwardedFor: string | null;
  cfConnectingIp: string | null;
  userAgent: string | null;
  servedAt: string | null;
  createdAt: string;
}

export interface MyResellerTermsResponse {
  applicable: boolean;
  exempt: boolean;
  pending: boolean;
  currentVersion: number | null;
  lastAcceptance: { version: number; acceptedAt: string; userName: string | null } | null;
  reloginRequired?: boolean;
  masterkeySession?: boolean;
  version?: {
    id: number;
    version: number;
    publishedAt: string;
    sections: TermsSection[];
    contentHash: string;
  };
  readToken?: string;
  issuedAt?: number;
}

export interface PublicResellerTermsResponse {
  available: boolean;
  version?: number;
  publishedAt?: string;
  sections?: TermsSection[];
}

export function statusOf(err: unknown): number | undefined {
  return (
    (err as { status?: number })?.status ??
    (err as { response?: { status?: number } })?.response?.status
  );
}

export function isBackendMissing(err: unknown): boolean {
  const status = statusOf(err);
  return status === 404 || status === 405 || status === 501;
}

export function errorCodeOf(err: unknown): string {
  const data =
    (err as { data?: { error?: string; message?: string } })?.data ??
    (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return String(data?.error ?? data?.message ?? "");
}

// --- superadmin ---

export async function fetchResellerTermsAdmin() {
  return api.get<ResellerTermsAdminResponse>("/reseller-terms/admin");
}

export async function saveResellerTermsDraft(sections: TermsSection[]) {
  return api.put<{ draftSections: TermsSection[]; draftUpdatedAt: string }>(
    "/reseller-terms/admin/draft",
    { sections }
  );
}

export async function publishResellerTermsVersion(payload: {
  sections: TermsSection[];
  requiresReaccept: boolean;
}) {
  return api.post<ResellerTermsVersionSummary>("/reseller-terms/admin/publish", payload);
}

export async function setResellerTermsRequired(required: boolean) {
  return api.put<{ required: boolean }>("/reseller-terms/admin/required", { required });
}

export async function fetchResellerTermsVersion(id: number) {
  return api.get<ResellerTermsVersionFull>(`/reseller-terms/admin/versions/${id}`);
}

export async function fetchResellerTermsTenantsStatus() {
  return api.get<ResellerTermsTenantsStatusResponse>("/reseller-terms/admin/tenants-status");
}

export async function fetchResellerTermsAcceptances(tenantId: number) {
  return api.get<{ acceptances: ResellerTermsAcceptance[] }>(
    `/reseller-terms/admin/acceptances/${tenantId}`
  );
}

// --- usuário logado ---

export async function fetchMyResellerTerms() {
  return api.get<MyResellerTermsResponse>("/reseller-terms/me");
}

export async function acceptResellerTerms(payload: {
  versionId: number;
  readToken: string;
  issuedAt: number;
}) {
  return api.post<{ acceptedAt: string; version: number }>("/reseller-terms/accept", payload);
}

// --- público (sem login) ---

// Axios ISOLADO, sem interceptors: o `lib/api` injeta token e redireciona para
// /login em 401/403 — o visitante de /contrato não tem sessão.
const publicClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101",
});

export async function fetchPublicResellerTerms() {
  return publicClient.get<PublicResellerTermsResponse>("/reseller-terms/public");
}
