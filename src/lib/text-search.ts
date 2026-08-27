const DIACRITICS_RE = /[̀-ͯ]/g;

export function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

export function matchesAllTerms(text: string, search: string): boolean {
  if (!search.trim()) return true;
  const normalized = normalizeForSearch(text);
  return normalizeForSearch(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => normalized.includes(term));
}
