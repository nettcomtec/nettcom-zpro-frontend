// Wrapper unificado de "listar templates" do canal BSP correto.
// Despacha para a API certa conforme whatsapp.type.
//
// Notas:
//  - WABA usa getWabaTemplates(tokenApi) (services/messages.ts)
//  - Dialog360 usa getDialog360Templates(channelId) — aceita number ou string
//  - Gupshup usa listGupshupTemplatesByWhatsappId(whatsappId) ou listGupshupTemplates(appId)
//
// Para uniformizar o uso pelo caller, este helper aceita o objeto Whatsapp
// e escolhe o identificador correto internamente.

import { getWabaTemplates } from "@/services/messages";
import { getDialog360Templates } from "@/services/dialog360-messages";
import {
  listGupshupTemplatesByWhatsappId,
  listGupshupTemplates,
} from "@/services/gupshup-meta";
import { fetchWhatsapps } from "@/services/whatsapp";

// Forma minima esperada pelo wrapper. Usamos um tipo "duck typed" para nao
// criar uma dependencia rigida com a interface Whatsapp completa.
export interface ChannelTemplatesInput {
  id?: number | string;
  type?: string;
  tokenAPI?: string;
  appId?: string;
}

/**
 * Garante que o canal tenha o identificador necessario para listar templates
 * (tokenAPI no WABA; id/appId nos BSP). Logo apos o login a lista de sessoes
 * ainda esta sendo carregada de forma assincrona, entao o objeto de canal
 * passado pelo caller pode chegar SEM tokenAPI — o que fazia a listagem de
 * templates WABA falhar ate um F5 (que re-hidrata o store de sessoes). Aqui,
 * se o identificador estiver ausente mas tivermos um id numerico, refazemos o
 * fetch de /whatsapp (furando o cache) e re-resolvemos o canal pelo id antes
 * de prosseguir. Best-effort: se o refetch nao ajudar, devolve o canal como
 * veio e a chamada segue o fluxo normal (com o mesmo erro de antes).
 */
export async function resolveChannelForTemplates(
  channel: ChannelTemplatesInput,
): Promise<ChannelTemplatesInput> {
  const type = (channel?.type ?? "").toLowerCase();
  const isBsp = type === "dialog360" || type === "gupshup";

  // Ja temos o identificador que este canal usa? Entao nada a curar.
  if (isBsp) {
    if (channel?.id !== undefined && channel?.id !== null) return channel;
    if (type === "gupshup" && channel?.appId) return channel;
  } else if (channel?.tokenAPI) {
    return channel;
  }

  // Sem um id numerico nao ha como re-resolver a sessao na lista fresca.
  const numericId =
    channel?.id !== undefined && channel?.id !== null ? Number(channel.id) : NaN;
  if (!Number.isFinite(numericId)) return channel;

  try {
    const { data } = await fetchWhatsapps(true); // fura o cache TTL 1500ms
    const list = (Array.isArray(data) ? data : []) as Array<{
      id?: number | string;
      type?: string;
      tokenAPI?: string;
      appId?: string;
    }>;
    const fresh = list.find((w) => Number(w?.id) === numericId);
    if (fresh) {
      return {
        id: fresh.id ?? channel.id,
        type: fresh.type ?? channel.type,
        tokenAPI: fresh.tokenAPI ?? channel.tokenAPI,
        appId: fresh.appId ?? channel.appId,
      };
    }
  } catch {
    // best-effort: mantem o canal original.
  }
  return channel;
}

/**
 * Lista templates do canal apontado por `whatsapp`, despachando para o
 * service certo conforme whatsapp.type.
 *
 * Default = WABA. Retorna o que o service subjacente retornar (array de
 * templates ou objeto com .data, conforme cada BSP).
 */
export async function getTemplatesForChannel(whatsapp: ChannelTemplatesInput) {
  // Auto-cura pos-login: garante tokenAPI/id antes de despachar. Sem custo
  // quando o identificador ja existe (retorna o canal na hora, sem refetch).
  whatsapp = await resolveChannelForTemplates(whatsapp);
  const type = whatsapp?.type;

  if (type === "dialog360") {
    const id = whatsapp?.id;
    if (id === undefined || id === null) {
      throw new Error("getTemplatesForChannel: dialog360 requer whatsapp.id");
    }
    return getDialog360Templates(id);
  }

  if (type === "gupshup") {
    // Prefere whatsappId quando disponivel; cai para appId se nao houver id.
    if (whatsapp?.id !== undefined && whatsapp.id !== null) {
      const numericId = Number(whatsapp.id);
      if (Number.isFinite(numericId)) {
        return listGupshupTemplatesByWhatsappId(numericId);
      }
    }
    if (whatsapp?.appId) {
      return listGupshupTemplates(whatsapp.appId);
    }
    throw new Error(
      "getTemplatesForChannel: gupshup requer whatsapp.id ou whatsapp.appId",
    );
  }

  // Default = WABA
  const token = whatsapp?.tokenAPI;
  if (!token) {
    throw new Error("getTemplatesForChannel: WABA requer whatsapp.tokenAPI");
  }
  return getWabaTemplates(token);
}
