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
