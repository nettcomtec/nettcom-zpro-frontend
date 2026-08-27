import api from "@/lib/api";

// PLANO_APP_MOBILE §5.2 — registro do token FCM do aparelho (app nativo).
// Backend antigo (sem as rotas /mobile/*) responde 404 — chamadas são
// best-effort e o chamador engole o erro.
export const registerMobileDeviceToken = (payload: {
  token: string;
  platform: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
}) => api.post("/mobile/device-token", payload);

export const unregisterMobileDeviceToken = (token: string) =>
  api.delete("/mobile/device-token", { data: { token } });
