// Mensagem rápida do tipo "template" (/mensagens-rapidas): o cadastro guarda só o
// nome e o idioma do template (FastReply.templateJson). No atendimento ela não é
// enviada como texto: abre a janela "Enviar template" com o template certo já
// selecionado, e as variáveis são preenchidas ali, como num envio feito pela lista.

export interface QuickReplyTemplateRef {
  name: string;
  language: string;
}

// templateJson chega como texto do banco (GET /fastreply) ou já como objeto.
export function parseQuickReplyTemplate(raw: unknown): QuickReplyTemplateRef | null {
  let value: unknown = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as { name?: unknown; language?: unknown };
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return null;
  const language = typeof obj.language === "string" ? obj.language.trim() : "";
  return { name, language };
}

const normalizeName = (s: string | undefined | null) => (s || "").trim().toLowerCase();
// "pt-BR", "PT_br" e "pt_BR" são o mesmo idioma para quem digitou no cadastro.
const normalizeLanguage = (s: string | undefined | null) => normalizeName(s).replace(/-/g, "_");

// `name` nos casos sem template escolhido é o nome REAL do template na conexão:
// é por ele que a lista é filtrada para o atendente escolher.
export type QuickReplyTemplateMatch<T> =
  | { kind: "found"; template: T }
  // idioma em branco no cadastro e o template existe em mais de um idioma
  | { kind: "pickLanguage"; name: string }
  // o template existe na conexão, mas não no idioma cadastrado
  | { kind: "languageMissing"; name: string }
  | { kind: "notFound" };

export function matchQuickReplyTemplate<T extends { name: string; language: string }>(
  templates: T[],
  ref: QuickReplyTemplateRef,
): QuickReplyTemplateMatch<T> {
  const wanted = normalizeName(ref.name);
  const sameName = templates.filter((tp) => normalizeName(tp.name) === wanted);
  if (sameName.length === 0) return { kind: "notFound" };
  const name = sameName[0].name;
  if (ref.language) {
    const lang = normalizeLanguage(ref.language);
    const exact = sameName.find((tp) => normalizeLanguage(tp.language) === lang);
    // Nunca troca o idioma cadastrado por outro em silêncio: o cliente receberia
    // o template em outra língua.
    return exact ? { kind: "found", template: exact } : { kind: "languageMissing", name };
  }
  if (sameName.length === 1) return { kind: "found", template: sameName[0] };
  return { kind: "pickLanguage", name };
}
