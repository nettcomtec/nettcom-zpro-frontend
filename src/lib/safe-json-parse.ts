export function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (str === null || str === undefined) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}
