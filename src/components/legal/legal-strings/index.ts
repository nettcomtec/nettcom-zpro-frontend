import type { LegalLang } from "@/lib/legal-langs";
import type { LegalStrings } from "../legal-render";
import pt from "./pt";
import en from "./en";
import es from "./es";
import de from "./de";
import fr from "./fr";
import it from "./it";
import ja from "./ja";
import zh from "./zh";
import ar from "./ar";
import hi from "./hi";
import id from "./id";
import ru from "./ru";
import tr from "./tr";

/*
 * Registro dos documentos legais por idioma (13 locales da UI).
 * Fallback pt para idioma desconhecido (resolveLegalLang já valida).
 */
const REGISTRY: Record<LegalLang, LegalStrings> = {
  pt,
  en,
  es,
  de,
  fr,
  it,
  ja,
  zh,
  ar,
  hi,
  id,
  ru,
  tr,
};

export function getLegalStrings(lang: LegalLang): LegalStrings {
  return REGISTRY[lang] ?? pt;
}
