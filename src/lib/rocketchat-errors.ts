// Códigos devolvidos pelo backend nas rotas do Rocket.Chat (RocketChatClientZPRO.ts).
// Cada um tem texto em `rocketChatErrors.<código>` nos 13 locales — código fora
// desta lista cai no `message` do backend.
export const ROCKETCHAT_ERROR_CODES = [
  "ERR_RC_NOT_CONFIGURED",
  "ERR_RC_UNREACHABLE",
  "ERR_RC_HOST_BLOCKED",
  "ERR_RC_ADMIN_AUTH",
  "ERR_RC_PERMISSION",
  "ERR_RC_TOKEN_SECRET_MISSING",
  "ERR_RC_TOKEN_SECRET_INVALID",
  "ERR_RC_USER_NOT_FOUND",
  "ERR_RC_ACCOUNT_CONFLICT",
  "ERR_RC_ACCOUNT_IS_ADMIN",
  "ERR_RC_ACCOUNT_UNVERIFIED",
  "ERR_RC_ACCOUNT_INACTIVE",
  "ERR_RC_INVALID_USER_DATA",
  "ERR_RC_CREDENTIALS_REQUIRED",
  "ERR_RC_IFRAME_BLOCKED",
  "ERR_RC_IFRAME_NOT_HTTPS",
  "ERR_RC_IFRAME_RECEIVE_DISABLED",
  "ERR_RC_IFRAME_SEND_DISABLED",
  "ERR_RC_INTERNAL",
  "ERR_RC_UNKNOWN",
] as const;

export type RocketChatErrorCode = (typeof ROCKETCHAT_ERROR_CODES)[number];

export function isRocketChatErrorCode(code: unknown): code is RocketChatErrorCode {
  return typeof code === "string" && (ROCKETCHAT_ERROR_CODES as readonly string[]).includes(code);
}
