// Legenda de mídia: o que a bolha mostra embaixo da imagem/vídeo/álbum e, no documento,
// quando o `body` é o nome do arquivo e quando é legenda.
//
// Espelho do backend `helpers/ForwardMediaCaptionZPRO.ts`, que usa a MESMA regra para
// decidir a legenda da mídia encaminhada (o que o atendente vê é o que vai ao cliente).
// Mudar um exige o outro (teste de paridade em `tests/lib/media-caption.test.ts`).

// Midia sem legenda chega com um preenchimento em `body`, nao com legenda: o texto
// fixo do canal ("Imagem"/"Vídeo"/"GIF" no Baileys e no Zapo, "Documento" no documento
// sem titulo e "Mensagem PTV" na nota de video do Baileys, "[image]" no Gupshup)
// ou o nome do arquivo (painel: nome original ou o salvo; recebida: nome do remetente,
// com o arquivo salvo sanitizado + sufixo de horario e as vezes outra extensao).
export const MEDIA_BODY_PLACEHOLDERS = new Set(["Imagem", "Vídeo", "GIF", "Documento", "Mensagem PTV", "[image]", "[video]"]);
// Nota de video do Baileys grava o endereco do arquivo no CDN do WhatsApp como corpo.
export const WHATSAPP_CDN_URL_RE = /^https?:\/\/[^/\s]*\.whatsapp\.net\/\S*$/i;
// Marcas do nome salvo: data do multer (_ddMMyyyyHHmmssSSS, 17 digitos) ou horario em
// ms (_<13 digitos>) no fim; prefixo do envio Gupshup (gupshup_out_<ms>_) e da midia
// do fluxo (<ms>-) no comeco.
export const SAVED_FILE_SUFFIX_RE = /_\d{13}(?:\d{4})?(?=\.[^.]+$)/;
export const SAVED_FILE_PREFIX_RE = /^(?:gupshup_out_\d{13}_|\d{13}-)/;
// Mesma sanitizacao do multer (uploadZPRO.ts): espacos->_ e [^\w.-] removidos.
const sanitizeUploadName = (s: string) => s.replace(/\s+/g, "_").replace(/[^\w.-]/g, "").toLowerCase();
// Base comparavel: sem extensao e so letras/digitos — o nome salvo troca espaco/acento
// por "_" (acento decomposto ou descartado) e as vezes a extensao (.mov -> .mp4).
const looseFileBase = (s: string, decompose: boolean) => {
  const noExt = s.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return (decompose ? noExt.normalize("NFD") : noExt).replace(/[^A-Za-z0-9]/g, "").toLowerCase();
};

export function mediaUrlFileName(url: string): string {
  const base = url.split(/[?#]/)[0].split("/").pop() || "";
  try { return decodeURIComponent(base); } catch { return base; }
}

export function isBodyFileName(body: string, fileName: string | null | undefined, urlName: string): boolean {
  const text = body.trim();
  if (!text) return true;
  if (fileName && text === fileName.trim()) return true;
  // Comparacao frouxa so para texto de uma linha com extensao: legenda nao se passa
  // por nome de arquivo.
  const looksLikeFile = /^[^\n]+\.[A-Za-z0-9]{2,5}$/.test(text);
  // Nome gerado pelo servidor (sem espaco e com o sufixo de horario) nunca e legenda.
  if (looksLikeFile && !/\s/.test(text) && SAVED_FILE_SUFFIX_RE.test(text)) return true;
  if (!urlName) return false;
  const unsuffixed = urlName.replace(SAVED_FILE_SUFFIX_RE, "");
  const savedNames = [urlName, unsuffixed, unsuffixed.replace(SAVED_FILE_PREFIX_RE, "")];
  if (savedNames.some((n) => sanitizeUploadName(n) === sanitizeUploadName(text))) return true;
  if (!looksLikeFile) return false;
  const textBases = [looseFileBase(text, true), looseFileBase(text, false)].filter(Boolean);
  return savedNames.some((n) => textBases.includes(looseFileBase(n, true)));
}

// Legenda de imagem/video/album: preenchimento vira vazio (nada embaixo da midia).
// `urlName` = nome do arquivo na URL da mídia (mediaUrlFileName).
export function mediaCaptionText(body: string | null | undefined, fileName: string | null | undefined, urlName: string): string {
  const raw = body || "";
  const text = raw.trim();
  if (!text || MEDIA_BODY_PLACEHOLDERS.has(text) || WHATSAPP_CDN_URL_RE.test(text)) return "";
  // Alguns envios gravam o link do proprio arquivo como corpo.
  if (/^https?:\/\/\S+$/.test(text) && urlName && mediaUrlFileName(text) === urlName) return "";
  return isBodyFileName(text, fileName, urlName) ? "" : raw;
}
