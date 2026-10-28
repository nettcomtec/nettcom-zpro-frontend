const DIACRITICS_RE = /[̀-ͯ]/g;

export function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/g;

/**
 * Palavras da busca do chat interno: separadas por espaço, só as de 2+ letras, no máximo 5.
 * Espelho de `privateChatSearchTokens` em `backend/src/services/PrivateMessage/PrivateMessageServiceZPRO.ts`.
 */
export function privateChatSearchTokens(term: string): string[] {
  return String(term || "")
    .replace(CONTROL_CHARS_RE, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .slice(0, 5)
    .map((token) => token.slice(0, 50));
}

/** Divide o texto em pedaços marcando onde aparece alguma das palavras, ignorando acento e caixa. */
export function splitFoldedMatches(text: string, tokens: string[]): Array<{ value: string; match: boolean }> {
  const foldedTokens = tokens.map(normalizeForSearch).filter(Boolean);
  if (!text || foldedTokens.length === 0) return [{ value: text, match: false }];
  let folded = "";
  const origIndex: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const piece = normalizeForSearch(text[i]);
    for (let k = 0; k < piece.length; k += 1) {
      folded += piece[k];
      origIndex.push(i);
    }
  }
  const marked = new Array<boolean>(text.length).fill(false);
  for (const token of foldedTokens) {
    let from = 0;
    while (from <= folded.length - token.length) {
      const at = folded.indexOf(token, from);
      if (at < 0) break;
      for (let j = origIndex[at]; j <= origIndex[at + token.length - 1]; j += 1) marked[j] = true;
      from = at + token.length;
    }
  }
  const parts: Array<{ value: string; match: boolean }> = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = parts[parts.length - 1];
    if (last && last.match === marked[i]) last.value += text[i];
    else parts.push({ value: text[i], match: marked[i] });
  }
  return parts;
}

export function matchesAllTerms(text: string, search: string): boolean {
  if (!search.trim()) return true;
  const normalized = normalizeForSearch(text);
  return normalizeForSearch(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => normalized.includes(term));
}
