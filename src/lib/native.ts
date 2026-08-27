// PLANO_APP_MOBILE §6.4 — ponte com o app nativo (Capacitor).
// 100% aditivo: no navegador comum window.Capacitor não existe e tudo vira no-op.

export const isNativeApp = (): boolean =>
  typeof window !== "undefined" &&
  !!(window as any).Capacitor?.isNativePlatform?.();

export const getNativePlatform = (): string | null =>
  isNativeApp() ? (window as any).Capacitor?.getPlatform?.() ?? null : null;

export const getNativePlugin = (name: string): any | null =>
  isNativeApp() ? (window as any).Capacitor?.Plugins?.[name] ?? null : null;

// Chave onde o token FCM do aparelho fica guardado para o DELETE do logout.
export const FCM_TOKEN_STORAGE_KEY = "zpro:fcmToken";
