// Resposta a story do Instagram: o story respondido vem em `dataJson.igStoryReply` e o texto
// do cliente fica no corpo da mensagem. Espelho da gravação em
// backend/src/helpers/InstagramStoryReplyZPRO.ts (mudar um exige o outro).
import { safeMetaCdnUrl } from "@/lib/ad-referral";

export interface InstagramStoryReplyView {
  storyId: string | null;
  /** Link da CDN da Meta (para de abrir quando o story expira). */
  url: string | null;
}

const STORY_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

// A bolha chama em toda mensagem: atalho barato antes do JSON.parse.
export function readInstagramStoryReply(dataJson: unknown): InstagramStoryReplyView | null {
  if (typeof dataJson !== "string" || !dataJson.includes("\"igStoryReply\"")) return null;
  const text = dataJson.trim();
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text);
    const raw = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.igStoryReply : null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    // Sem id nem link válidos a linha aparece mesmo assim, só sem "Ver story".
    const storyId = typeof raw.storyId === "string" && STORY_ID_RE.test(raw.storyId) ? raw.storyId : null;
    const url = safeMetaCdnUrl(raw.url);
    return { storyId, url };
  } catch {
    return null;
  }
}
