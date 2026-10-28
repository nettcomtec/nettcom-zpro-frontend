// Espelho de backend/src/helpers/ChatgptChannelCredentialsZPRO.ts (mudar um exige o
// outro): a API Key do ChatGPT é por canal. Sem chave e sem endereço próprio, o
// "Habilitar para todos os tickets" não liga o ChatGPT nos atendimentos do canal.
// A chave da IA da plataforma conta como chave.

export const hasChatgptText = (value: unknown): boolean =>
  typeof value === "string" && value.trim() !== "";

// Endereço próprio só conta quando o servidor o usa (começa com http(s)://).
export const hasUsableChatgptBaseUrl = (value: unknown): boolean =>
  typeof value === "string" && /^https?:\/\//i.test(value.trim());

export const channelHasChatgptCredentials = (
  channel:
    | { chatgptApiKey?: string | null; chatgptBaseUrl?: string | null }
    | null
    | undefined
): boolean =>
  !!channel &&
  (hasChatgptText(channel.chatgptApiKey) || hasUsableChatgptBaseUrl(channel.chatgptBaseUrl));
