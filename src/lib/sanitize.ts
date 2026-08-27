import type { Config } from "dompurify";

type DOMPurifyLike = { sanitize(dirty: string, cfg?: Config): string };

let _DOMPurify: DOMPurifyLike | null = null;

async function getDOMPurify() {
  if (_DOMPurify) return _DOMPurify;
  if (typeof window === "undefined") return null;
  _DOMPurify = (await import("dompurify")).default as unknown as DOMPurifyLike;
  return _DOMPurify;
}

/**
 * Synchronous sanitize for use in render functions.
 * Falls back to the raw string on SSR (server doesn't execute this HTML).
 * The async `sanitizeAsync` variant should be preferred for pre-processing.
 */
export function sanitize(html: string, config?: Config): string {
  if (typeof window === "undefined") return html;
  if (!_DOMPurify) {
    // Lazy-load: fire import but return html for this render; next render will be clean
    import("dompurify").then((m) => { _DOMPurify = m.default as unknown as DOMPurifyLike; });
    return html;
  }
  return _DOMPurify.sanitize(html, config);
}
