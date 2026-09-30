// Listas de modelos OpenAI usadas em datalists no /sessoes (canal config).
// Usuário pode escolher um da lista OU digitar um custom — datalist permite ambos.

/**
 * Modelos de chat (GPT) suportados pela OpenAI. Lista mantida em ordem
 * de uso prático: vision-capable / mais usados primeiro, legacy depois.
 * Atualizar conforme novos modelos forem lançados.
 */
export const CHATGPT_MODELS: ReadonlyArray<string> = [
  // GPT-4o (vision-capable, recomendados)
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4o-2024-11-20",
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-05-13",
  "gpt-4o-mini-2024-07-18",
  // GPT-4 / 4-Turbo (vision-capable)
  "gpt-4-turbo",
  "gpt-4-turbo-2024-04-09",
  "gpt-4",
  "gpt-4-0613",
  // GPT-4.1
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4.1-2025-04-14",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4.1-nano-2025-04-14",
  // GPT-5 family (raramente com vision; rodam texto)
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-2025-08-07",
  "gpt-5-mini-2025-08-07",
  "gpt-5-nano-2025-08-07",
  "gpt-5-pro",
  "gpt-5-pro-2025-10-06",
  "gpt-5-chat-latest",
  "gpt-5-codex",
  "gpt-5-search-api",
  "gpt-5.1",
  "gpt-5.1-2025-11-13",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5.1-codex-max",
  "gpt-5.1-chat-latest",
  "gpt-5.2",
  "gpt-5.2-2025-12-11",
  "gpt-5.2-codex",
  "gpt-5.2-pro",
  "gpt-5.2-pro-2025-12-11",
  "gpt-5.2-chat-latest",
  "gpt-5.3-codex",
  "gpt-5.3-chat-latest",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.4-pro",
  "gpt-5.4-2026-03-05",
  "gpt-5.4-mini-2026-03-17",
  "gpt-5.4-nano-2026-03-17",
  "gpt-5.4-pro-2026-03-05",
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.5-2026-04-23",
  "gpt-5.5-pro-2026-04-23",
  // GPT-4o search/audio variantes
  "gpt-4o-mini-search-preview",
  "gpt-4o-mini-search-preview-2025-03-11",
  "gpt-4o-search-preview",
  "gpt-4o-search-preview-2025-03-11",
  "gpt-4o-audio-preview",
  "gpt-4o-audio-preview-2024-12-17",
  "gpt-4o-audio-preview-2025-06-03",
  "gpt-4o-mini-audio-preview",
  "gpt-4o-mini-audio-preview-2024-12-17",
  // o1 / o3 / o4 family (reasoning)
  "o1",
  "o1-2024-12-17",
  "o1-pro",
  "o1-pro-2025-03-19",
  "o3",
  "o3-2025-04-16",
  "o3-mini",
  "o3-mini-2025-01-31",
  "o3-pro",
  "o3-pro-2025-06-10",
  "o3-deep-research",
  "o3-deep-research-2025-06-26",
  "o4-mini",
  "o4-mini-2025-04-16",
  "o4-mini-deep-research",
  "o4-mini-deep-research-2025-06-26",
  // GPT-3.5 (legacy)
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-0125",
  "gpt-3.5-turbo-1106",
  "gpt-3.5-turbo-16k",
  "gpt-3.5-turbo-instruct",
  "gpt-3.5-turbo-instruct-0914",
];

/**
 * Vozes TTS suportadas pela OpenAI (api.openai.com/v1/audio/speech).
 * Esta é a lista oficial — qualquer outra string causa
 * `invalid_request_error` ("Input should be 'nova', 'shimmer', ...").
 * Mantemos a opção de custom no input só pra futuras adições da OpenAI.
 */
export const OPENAI_VOICES: ReadonlyArray<string> = [
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
];

/** Modelos xAI Grok (api.x.ai/v1). */
export const GROK_MODELS: ReadonlyArray<string> = [
  "grok-3",
  "grok-3-mini",
  "grok-2-vision-1212",
  "grok-2-1212",
  "grok-2",
  "grok-vision-beta",
  "grok-beta",
];

/**
 * Modelos Google Gemini (generativelanguage.googleapis.com).
 * O Google DESLIGA modelos antigos (1.5 e 1.0 respondem 404; a 2.0 caiu em
 * 01/06/2026) — nunca listar modelo aposentado: quem o escolhe fica com a IA
 * parada. Conferir https://ai.google.dev/gemini-api/docs/deprecations.
 */
export const GEMINI_MODELS: ReadonlyArray<string> = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-flash-latest",
];

/** Modelos DeepSeek (api.deepseek.com/v1). */
export const DEEPSEEK_MODELS: ReadonlyArray<string> = [
  "deepseek-chat",
  "deepseek-reasoner",
  "deepseek-coder",
];

/** Modelos Alibaba Qwen (dashscope.aliyuncs.com). */
export const QWEN_MODELS: ReadonlyArray<string> = [
  "qwen-max",
  "qwen-max-2025-01-25",
  "qwen-plus",
  "qwen-turbo",
  "qwen-vl-max",
  "qwen-vl-plus",
  "qwen2.5-72b-instruct",
  "qwen2.5-32b-instruct",
  "qwen2.5-14b-instruct",
  "qwen2.5-7b-instruct",
];

/** Modelos Anthropic Claude (api.anthropic.com/v1). */
export const CLAUDE_MODELS: ReadonlyArray<string> = [
  "claude-opus-4-5-20250929",
  "claude-sonnet-4-5-20250929",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-20240620",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
];

/**
 * Modelos Ollama (locais — depende do que o usuário instalou).
 * Lista com os nomes mais comuns; admin pode digitar qualquer outro.
 */
export const OLLAMA_MODELS: ReadonlyArray<string> = [
  "llama3.3",
  "llama3.2",
  "llama3.1",
  "llama3",
  "llama2",
  "mistral",
  "mixtral",
  "codellama",
  "gemma2",
  "gemma",
  "phi3",
  "phi",
  "qwen2.5",
  "deepseek-r1",
];

/**
 * Modelos do Copilot por provider — usado em /configuracoes/copilot
 * pra mostrar lista relevante no datalist conforme o provider selecionado.
 * Os keys batem com os values de COPILOT_PROVIDERS.
 */
export const COPILOT_MODELS_BY_PROVIDER: Record<string, ReadonlyArray<string>> = {
  openai: CHATGPT_MODELS,
  groq:   GROK_MODELS,
  claude: CLAUDE_MODELS,
  gemini: GEMINI_MODELS,
};
