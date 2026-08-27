/**
 * Phase 11/12 — OAuth Proxy config (frontend)
 *
 * Hardcoded canonical URL matching backend OAuthProxyClientZPRO.ts.
 * Phase 12 adds optional custom domain support via CNAME — the backend stores
 * `Tenant.oauthCustomDomain`, and helpers here fall back to it when present.
 *
 * The proxy serves:
 * - /callback.html         — generic OAuth2 callback handler
 * - /linkedin-signup       — LinkedIn authorize redirect
 * - /mercadolivre-signup   — MercadoLivre authorize redirect
 * - /olx-signup            — OLX authorize redirect
 * - /tiktok-signup         — TikTok authorize redirect
 * - /youtube-signup        — YouTube (Google OAuth2) authorize redirect
 * - /woocommerce-signup    — WooCommerce auth-endpoint redirect
 * - /wc-return             — WooCommerce visual return page
 * - /api/woocommerce-callback — server-to-server credential relay (POST from WC)
 * - /api/oauth-init        — unified init endpoint
 * - /api/register-oauth-domain — Phase 12 white-label CNAME registration
 */

export const OAUTH_PROXY_URL = "https://oauth.techprovider.com.br";
export const OAUTH_PROXY_HOST = "oauth.techprovider.com.br";
export const OAUTH_PROXY_CNAME_TARGET = "cname.techprovider.com.br";

/**
 * Returns the base URL (protocol + host) of the OAuth proxy for this tenant.
 * If a custom domain is provided (Phase 12), uses that; otherwise defaults to
 * the canonical OAUTH_PROXY_URL.
 */
export function getProxyBaseUrl(customDomain?: string | null): string {
  if (customDomain && customDomain.trim()) {
    const clean = customDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${clean}`;
  }
  return OAUTH_PROXY_URL;
}

/**
 * Returns the fixed redirect URI that should be cadastrado no app do provider.
 * Phase 12: uses the tenant's custom domain if configured.
 */
export function getProxyCallbackUrl(customDomain?: string | null): string {
  return `${getProxyBaseUrl(customDomain)}/callback.html`;
}

/**
 * Returns the server-to-server callback URL that WooCommerce will POST to.
 * Informative only.
 */
export function getWooCommerceProxyCallbackUrl(customDomain?: string | null): string {
  return `${getProxyBaseUrl(customDomain)}/api/woocommerce-callback`;
}

/**
 * Redirect URI (browser callback) cadastrada no portal de parceiros Nuvemshop.
 * O proxy recebe o ?code= aqui, troca pelo token e relaya pro backend.
 */
export function getNuvemshopProxyCallbackUrl(customDomain?: string | null): string {
  return `${getProxyBaseUrl(customDomain)}/nuvemshop-callback`;
}

/**
 * Phase 16 — Google OAuth NAO suporta custom domains nas Authorized Redirect URIs.
 * Cada CNAME teria que ser cadastrado manualmente no Google Cloud Console, o que
 * inviabiliza whitelabel dinamico. Forcamos sempre a URL canonical para que bata
 * com o que esta cadastrado no app Google (oauth.techprovider.com.br/callback.html).
 *
 * O whitelabel cosmetico (signup page no dominio do cliente) continua disponivel
 * para os outros canais OAuth (ML/LinkedIn/OLX/TikTok/Meta).
 */
export function getGoogleCanonicalCallbackUrl(): string {
  return `${OAUTH_PROXY_URL}/callback.html`;
}
