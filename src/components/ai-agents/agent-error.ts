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
  // "Sem resposta do cliente" recusado: tempo fora de 1 a 1440 minutos, aviso
  // ligado sem mensagem, "Transferir" sem fila ou com fila que não existe
  ERR_AI_AGENT_INVALID_INACTIVITY: "errInvalidInactivity",
  // v6 — lista "Consultar outros agentes" recusada (agente de outra empresa,
  // o próprio agente ou lista que zerou na validação)
  ERR_AI_AGENT_INVALID_CONSULT: "errInvalidConsult",
  // v7 — lista "Usar também a base de outros agentes" recusada (agente de
  // outra empresa, o próprio agente ou agente que não existe mais)
  ERR_AI_AGENT_INVALID_SHARED_KB: "errInvalidSharedKb",
  // v7 — modelos prontos: lote inválido, agente de origem da conexão sem
  // chave/inexistente e fila de emergência que não existe
  ERR_AI_AGENT_TEMPLATE_INVALID: "errTemplateInvalid",
  ERR_AI_AGENT_KEY_SOURCE_NOT_FOUND: "errKeySourceNotFound",
  ERR_AI_AGENT_INVALID_FALLBACK_QUEUE: "errInvalidFallbackQueue",
  // Nome/chave ausentes no servidor — mesma chave da validação da tela
  ERR_AI_AGENT_REQUIRED_FIELDS: "requiredFields",
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
  // v8 — servidores MCP. Os 400/404/429 chegam em `error`; os 409
  // (desligado, ferramenta que mudou) chegam em `message`.
  ERR_AI_AGENT_INVALID_MCP: "errInvalidMcp",
  ERR_MCP_DISABLED: "errMcpDisabled",
  ERR_MCP_INVALID_NAME: "errMcpInvalidName",
  ERR_MCP_INVALID_URL: "errMcpInvalidUrl",
  ERR_MCP_URL_QUERY: "errMcpUrlQuery",
  ERR_MCP_HTTPS_REQUIRED: "errMcpHttpsRequired",
  ERR_MCP_INVALID_AUTH: "errMcpInvalidAuth",
  ERR_MCP_INVALID_HEADER: "errMcpInvalidHeader",
  ERR_MCP_INVALID_TIMEOUT: "errMcpInvalidTimeout",
  ERR_MCP_SECRET_REQUIRED: "errMcpSecretRequired",
  ERR_MCP_LIMIT: "errMcpLimit",
  ERR_MCP_NOT_FOUND: "errMcpNotFound",
  ERR_MCP_HASH_MISMATCH: "errMcpHashMismatch",
  ERR_MCP_RATE_LIMIT: "errMcpRateLimit",
  // Corpo malformado no salvar das aprovações (PUT /ai-mcp-servers/:id/tools)
  ERR_MCP_INVALID_APPROVALS: "errMcpInvalidApprovals",
  // Falhas do servidor MCP no Testar/Atualizar (200 `{ ok:false, code }`):
  // traduzir com `aiAgentErrorKeyFromCode(code)`.
  ERR_MCP_UNAUTHORIZED: "errMcpUnauthorized",
  ERR_MCP_OAUTH_REQUIRED: "errMcpOauthRequired",
  ERR_MCP_UNREACHABLE: "errMcpUnreachable",
  ERR_MCP_PRIVATE_BLOCKED: "errMcpPrivateBlocked",
  ERR_MCP_REDIRECT: "errMcpRedirect",
  ERR_MCP_PROTOCOL: "errMcpProtocol",
  ERR_MCP_TOO_LARGE: "errMcpTooLarge",
  ERR_MCP_SECRET_UNREADABLE: "errMcpSecretUnreadable",
};

// Código do erro na resposta: os 400/404/429 trazem em `error`; o 409 do
// servidor traz em `message`. O `catch` recebe o `response` (interceptor) ou
// o erro do axios — os dois formatos são lidos.
export function aiAgentErrorCode(err: unknown): string {
  const e = err as {
    response?: { data?: { error?: string; message?: string } };
    data?: { error?: string; message?: string };
  };
  const data = e?.response?.data || e?.data;
  return String(data?.error || data?.message || "");
}

export function aiAgentErrorKey(err: unknown): string | null {
  return CODE_TO_KEY[aiAgentErrorCode(err)] || null;
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
