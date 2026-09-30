// Mapeia códigos de erro do backend de Agentes de IA para sufixos de chave
// i18n do namespace `aiAgents`. Retorna null quando o código não é conhecido
// (o chamador usa o fallback genérico).
const CODE_TO_KEY: Record<string, string> = {
  ERR_AI_AGENT_NOT_FOUND: "errNotFound",
  ERR_AI_AGENT_INVALID_TARGETS: "errInvalidTargets",
  ERR_AI_AGENT_INVALID_TOOLS: "errInvalidTools",
  ERR_AI_AGENT_INVALID_ACTIONS: "errInvalidActions",
  ERR_AI_AGENT_INVALID_MEMORY_FIELDS: "errInvalidMemoryFields",
  ERR_AI_AGENT_INVALID_CLOSE_RULES: "errInvalidCloseRules",
  ERR_AI_AGENT_INVALID_NATIVE_TOOLS: "errInvalidNativeTools",
  ERR_AI_AGENT_BLOCK_NEEDS_FALLBACK: "errBlockNeedsFallback",
  ERR_AI_AGENT_INVALID_TIMEZONE: "errInvalidTimezone",
  // v6 — lista "Consultar outros agentes" recusada (agente de outra empresa,
  // o próprio agente ou lista que zerou na validação)
  ERR_AI_AGENT_INVALID_CONSULT: "errInvalidConsult",
  ERR_AI_AGENT_KB_TOO_LARGE: "errKbTooLarge",
  ERR_AI_AGENT_WRONG_TENANT: "errWrongTenant",
  ERR_AI_AGENT_DUPLICATE_FAILED: "duplicateError",
  // Fontes da base de conhecimento
  ERR_AI_AGENT_SOURCE_PARSE: "errSourceParse",
  ERR_AI_AGENT_SOURCE_NO_TEXT: "errSourceNoText",
  ERR_AI_AGENT_SOURCE_FETCH: "errSourceFetch",
  ERR_AI_AGENT_SOURCE_LIMIT: "errSourceLimit",
  ERR_AI_AGENT_SOURCE_DUPLICATE: "errSourceDuplicate",
  ERR_AI_AGENT_SOURCE_BUSY: "errSourceBusy",
  ERR_AI_AGENT_SOURCE_TYPE: "errSourceType",
  ERR_AI_AGENT_SOURCE_RESYNC_UNSUPPORTED: "errSourceResyncUnsupported",
  // Arquivo acima do limite (413 do upload)
  FILE_TOO_LARGE: "errFileTooLarge",
  // IA da plataforma (Créditos de IA): recurso não liberado na empresa (403) e
  // modelo fora do catálogo ao salvar o agente nesse modo (422)
  ERR_AI_PLATFORM_DISABLED: "errPlatformDisabled",
  ERR_AI_PLATFORM_MODEL_NOT_ALLOWED: "errPlatformModelNotAllowed",
};

export function aiAgentErrorKey(err: unknown): string | null {
  const code = String(
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
      (err as { data?: { error?: string } })?.data?.error ||
      ""
  );
  return CODE_TO_KEY[code] || null;
}

// O `errorMessage` gravado numa fonte é um CÓDIGO `ERR_*` (nunca texto do
// parser): traduzir por esta função e NUNCA renderizar o valor cru.
export function aiAgentErrorKeyFromCode(code?: string | null): string | null {
  return CODE_TO_KEY[String(code || "")] || null;
}

// Sonda de backend antigo: rota inexistente responde 404.
export function isNotFoundStatus(err: unknown): boolean {
  const status =
    (err as { response?: { status?: number } })?.response?.status ??
    (err as { status?: number })?.status;
  return status === 404;
}
