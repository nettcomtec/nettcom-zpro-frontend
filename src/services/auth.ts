import api from "@/lib/api";
import { encryptPassword } from "@/lib/encryption";
import { z } from "zod";
import { logger } from "@/lib/logger";

export interface LoginPayload {
  email: string;
  password: string;
  masterkey?: boolean;
}

export interface LoginResponse {
  token: string;
  username: string;
  email: string;
  profile: string;
  userId: number;
  tenantId: number;
  queues: unknown[];
  blockWavoip: boolean;
  whatsappAllowed: unknown[];
  configs?: {
    filtrosAtendimento?: unknown;
    isDark?: boolean;
  };
 // SIP — flat fields (igual ao front legado: usuarioAtualizado)
  sipEnabled?: boolean;
  sipServer?: string;
  sipDomain?: string;
  sipPort?: number;
  sipUsername?: string;
  sipPassword?: string;
  sipTransport?: "ws" | "wss";
  phone?: string;
  // Extras que podem vir do backend
  restrictedUser?: string | boolean;
  menuPermissions?: Record<string, boolean>;
}

export interface A2FResponse {
  requiresA2F: boolean;
  pendingSessionId: string;
  message: string;
  channel: string;
}

export const loginResponseSchema = z.union([
  z.object({
    token: z.string(),
    username: z.string(),
    email: z.string(),
    profile: z.string(),
    userId: z.number(),
    tenantId: z.number(),
    mustChangePassword: z.boolean().optional(),
  }),
  z.object({
    requiresA2F: z.literal(true),
    pendingSessionId: z.string(),
    message: z.string(),
    channel: z.string(),
  }),
]);

export async function loginService(payload: LoginPayload) {
  const data = { ...payload };
  if (!payload.masterkey) {
    data.password = await encryptPassword(payload.password);
  }
  const response = await api.post<LoginResponse | A2FResponse>("/auth/login/", data);
  if (process.env.NODE_ENV !== "production") {
    const parsed = loginResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      logger.warn("[auth] loginService response schema mismatch:", parsed.error.flatten());
    }
  }
  return response;
}

export async function logoutService(user: { userId: number; tenantId: number }) {
  return api.post("/auth/logout/", user);
}

export async function refreshTokenService() {
  return api.post("/auth/refresh_token");
}

export async function validateA2F(data: { pendingSessionId: string; a2fCode: string; email: string }) {
  return api.post("/auth/validate-a2f/", data);
}

export async function resendA2F(data: { pendingSessionId: string; email: string }) {
  return api.post("/auth/resend-a2f/", data);
}

export async function requestPasswordReset(data: { email: string }) {
  return api.post("/password-reset", data);
}

export async function resetPassword(data: { token: string; password: string }) {
  return api.post("/reset-password", data);
}
