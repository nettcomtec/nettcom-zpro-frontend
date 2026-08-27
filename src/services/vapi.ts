import api from "@/lib/api";

export interface VapiAssistant {
  id: string;
  name: string;
}

export interface VapiPhoneNumber {
  id: string;
  number: string;
}

export async function fetchVapiAssistants(tenantId: number) {
  return api.get<VapiAssistant[]>(`/vapiAssistants/${tenantId}`);
}

export async function fetchVapiPhoneNumbers(tenantId: number) {
  return api.get<VapiPhoneNumber[]>(`/vapiPhoneNumbers/${tenantId}`);
}

export async function createVapiCall(
  tenantId: number,
  customers: { number: string }[],
  assistantId: string,
  phoneNumberId: string
) {
  return api.post(`/vapiCall/${tenantId}`, { customers, assistantId, phoneNumberId });
}
