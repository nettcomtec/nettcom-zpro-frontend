import api from "@/lib/api";

interface SmsPayload {
  phoneNumber?: string;
  message: string;
}

/** Comtele SMS service */
export async function sendSMS(data: SmsPayload) {
  return api.post("/sendSms", data);
}

/** ConectaStartup SMS service */
export async function sendSMSConecta(data: SmsPayload) {
  return api.post("/sendSmsConecta", data);
}

/** BHI / Livson SMS service */
export async function sendSMSLivson(data: SmsPayload) {
  return api.post("/sendSmsLivson", data);
}

export interface ComteleRoute {
  id: number;
  displayName: string;
  farePrice: number;
  productName: string;
}

/**
 * Rotas da conta Comtele (só o painel novo tem). `available` = o banco já tem a
 * coluna da rota; `api` = "v4" quando a chave é do painel novo.
 */
export interface ComteleRoutesInfo {
  available: boolean;
  api: "v4" | "legacy" | "unknown" | "none";
  routes: ComteleRoute[];
  selectedRoute: number | null;
  defaultRouteId: number | null;
}

export async function fetchComteleRoutes() {
  return api.get<ComteleRoutesInfo>("/sms/comtele/routes");
}

/** `null` = automática (a rota mais barata da conta). */
export async function updateComteleRoute(route: number | null) {
  return api.put<{ selectedRoute: number | null }>("/sms/comtele/route", { route });
}
