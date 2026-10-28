import axios from "axios";
import type { PublicFormSubmitPayload, PublicFormSubmitResponse, PublicFormView } from "@/lib/forms";

/*
 * Client da PÁGINA PÚBLICA do formulário (/f/[slug]).
 *
 * Igual ao do agendamento (services/booking-public.ts): NÃO usar o `@/lib/api`
 * compartilhado — ele injeta Authorization: Bearer e redireciona para /login (401/403)
 * e para a cobrança (402). O visitante não tem sessão; aqui o axios é ISOLADO, sem
 * interceptors e sem cookies. Prazo próprio para o botão não ficar em "Enviando..."
 * para sempre: repetir o envio é seguro (o código da página é de uso único no servidor,
 * e a repetição devolve o mesmo envio).
 */
const publicClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101",
  timeout: 30000,
});

export async function getPublicForm(slug: string): Promise<PublicFormView> {
  const { data } = await publicClient.get(`/forms-public/${encodeURIComponent(slug)}`);
  return data;
}

export async function submitPublicForm(
  slug: string,
  payload: PublicFormSubmitPayload
): Promise<PublicFormSubmitResponse> {
  const { data } = await publicClient.post(`/forms-public/${encodeURIComponent(slug)}/submit`, payload);
  return data;
}
