"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

/**
 * Phase 12 — Fetches the tenant's currently configured OAuth custom domain.
 *
 * Returns `{customDomain, loading, proxyHostname}`.
 * - `customDomain` = null when the tenant has not configured a custom CNAME;
 *   helpers in @/config/oauth-proxy then fall back to OAUTH_PROXY_URL.
 * - `proxyHostname` is the canonical proxy hostname (for UI hints showing
 *   where the CNAME should point).
 *
 * Used by the 6 app-* superadmin pages to render the correct readonly
 * redirect URI (custom domain vs oauth.techprovider.com.br).
 */
export function useOAuthProxyDomain(): {
  customDomain: string | null;
  proxyHostname: string;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [customDomain, setCustomDomain] = useState<string | null>(null);
  const [proxyHostname, setProxyHostname] = useState<string>("oauth.techprovider.com.br");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get<{ customDomain: string | null; proxyHostname: string }>(
        "/admin/oauth-custom-domain"
      );
      setCustomDomain(data?.customDomain || null);
      if (data?.proxyHostname) setProxyHostname(data.proxyHostname);
    } catch {
      setCustomDomain(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return { customDomain, proxyHostname, loading, refetch: load };
}
