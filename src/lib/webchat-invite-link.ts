// Link de convite do WebChat (docs/PLANO_WEBCHAT_LINK_CONVITE.md, D22).
//
// A variável {{linkWebchat}} vira, no envio, `<servidor>/chat/<canal>#c=1.<código>`: o código é
// de uso único e quem abre primeiro fica com a conversa do cliente. No painel o link NUNCA pode
// ser clicável (o atendente gastaria o código no próprio navegador): o balão mostra o texto e um
// botão de copiar. Este módulo só decide o que é link de convite — sem React e sem DOM, para o
// balão, as notas e os testes usarem o mesmo critério.
//
// Formato do código: `1.<empresa>.<atendimento>.<canal>.<minuto>.<assinatura>`, só [0-9a-z.]
// (o backend monta em base36 + hex; nunca `_`/`-`, que o itálico do WhatsApp quebraria).

/** URL inteira de convite: caminho terminando em /chat/<id do canal> e fragmento #c=1.<código>. */
export const WEBCHAT_INVITE_URL_RE =
  /^https?:\/\/[^\s/?#]+(?:\/[^\s?#]*)?\/chat\/[0-9A-Za-z-]{8,64}(?:\?[^\s#]*)?#c=1\.[0-9a-z.]{20,118}$/;

const MAX_URL_LENGTH = 2048;
const CODE_MARKER = "#c=1.";
const CODE_CHAR_RE = /[0-9a-z.]/;
// Candidatos a URL num texto cru (mesmo critério de fim de URL das bolhas).
const URL_CANDIDATE_RE = /https?:\/\/[^\s<>"']+/g;
const MAX_INVITES_PER_TEXT = 5;

export function isWebchatInviteUrl(url: string): boolean {
  if (typeof url !== "string" || url.length === 0 || url.length > MAX_URL_LENGTH) return false;
  if (url.indexOf(CODE_MARKER) === -1) return false;
  return WEBCHAT_INVITE_URL_RE.test(url);
}

/**
 * Recorta o link de convite do começo de um trecho que um linkificador tratou como URL. O
 * trecho pode trazer depois do código pontuação, marcador do WhatsApp (`*`, `_`, `~`) ou
 * entidade HTML (`&gt;`): o código só tem [0-9a-z.], então o link termina no 1º caractere fora
 * disso (ponto final fica fora). `null` = não é link de convite (o trecho segue como hoje).
 */
export function matchWebchatInviteUrl(raw: string): { url: string; tail: string } | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const marker = raw.indexOf(CODE_MARKER);
  if (marker === -1 || marker > MAX_URL_LENGTH) return null;
  const codeStart = marker + CODE_MARKER.length;
  let end = codeStart;
  while (end < raw.length && end - codeStart < 200 && CODE_CHAR_RE.test(raw.charAt(end))) end++;
  while (end > codeStart && raw.charAt(end - 1) === ".") end--;
  const url = raw.slice(0, end);
  return isWebchatInviteUrl(url) ? { url, tail: raw.slice(end) } : null;
}

/** Links de convite distintos de um texto cru (no máximo 5), na ordem em que aparecem. */
export function extractWebchatInviteUrls(text: string | null | undefined): string[] {
  if (!text || typeof text !== "string" || text.indexOf(CODE_MARKER) === -1) return [];
  const found: string[] = [];
  URL_CANDIDATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_CANDIDATE_RE.exec(text)) !== null) {
    const invite = matchWebchatInviteUrl(match[0]);
    if (invite && !found.includes(invite.url)) {
      found.push(invite.url);
      if (found.length >= MAX_INVITES_PER_TEXT) break;
    }
  }
  URL_CANDIDATE_RE.lastIndex = 0;
  return found;
}
