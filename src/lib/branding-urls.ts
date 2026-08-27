const API_BASE =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3101")
    : "http://localhost:3101";

function withParams(base: string, timestamp?: number, tenantId?: number): string {
  const params = new URLSearchParams();
  if (timestamp) params.set("t", String(timestamp));
  if (tenantId) params.set("tenantId", String(tenantId));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export const getLogoUrl              = (timestamp?: number, tenantId?: number) => withParams(`${API_BASE}/publicLogo`, timestamp, tenantId);
export const getLogoDarkUrl          = (timestamp?: number, tenantId?: number) => withParams(`${API_BASE}/publicLogoDark`, timestamp, tenantId);
export const getFaviconUrl           = (timestamp?: number, tenantId?: number) => withParams(`${API_BASE}/publicFavicon`, timestamp, tenantId);
export const getLoginSideBgUrl       = (timestamp?: number) => withParams(`${API_BASE}/publicLoginSideBg`, timestamp);
export const getPwaIconUrl           = (name: string, timestamp?: number) => withParams(`${API_BASE}/publicPwaIcon/${name}`, timestamp);
export const getNotificationSoundUrl = (type: string, timestamp?: number) => withParams(`${API_BASE}/publicNotificationSound/${type}`, timestamp);
