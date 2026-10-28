// Localização no atendimento (docs/PLANO_LOCALIZACAO_ENVIO_ENCAMINHAR.md): ponto único da
// tela para ler as coordenadas de uma mensagem, de um link colado ou de uma mensagem
// rápida do tipo "location", e para montar o texto/links que vão ao cliente.
// Espelho no backend: backend/src/helpers/LocationMessageZPRO.ts — mudar um exige o outro.
//
// Puro e sem rede. O link curto do Google (maps.app.goo.gl) NÃO traz a coordenada do lugar
// (nem na página final: só o centro da região) — ele só é reconhecido para a tela explicar
// como pegar o link completo (D9).
//
// Os textos montados aqui não têm palavra fixa (só nome, endereço e links), então não
// passam pelo catálogo de textos ao cliente.

export interface ParsedLocation {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  /** Linha pronta de nome/endereço (o Telegram grava "lugar - endereço" no corpo). */
  label?: string;
}

export const LOCATION_NAME_MAX = 120;
export const LOCATION_ADDRESS_MAX = 250;
/** Teto do texto colado no campo "Colar link ou coordenadas". */
export const LOCATION_PASTE_MAX = 2048;
// Corpo de localização é curto; texto maior não é varrido (o tempo real do Baileys guarda
// a miniatura em base64 antes do "|", que é cortada antes).
const BODY_SCAN_MAX = 4096;
const DATAJSON_SCAN_MAX = 200_000;

const LOCATION_MEDIA_TYPES = new Set(["location", "locationMessage", "liveLocationMessage"]);

export function isLocationMediaType(mediaType?: string | null): boolean {
  return !!mediaType && LOCATION_MEDIA_TYPES.has(mediaType);
}

/** Número de coordenada vindo de campo, link ou JSON. Aceita vírgula decimal e o "−" tipográfico. */
export function parseCoordInput(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/[\u2212\u2013\u2014]/g, "-");
  if (!s) return null;
  if (!s.includes(".") && s.split(",").length === 2) s = s.replace(",", ".");
  if (!/^[-+]?\d{1,3}(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Faixa válida e nunca (0,0) — é o que sobra de coordenada ausente lida como zero. */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Até 6 casas (~10 cm), sem zero à direita. */
export function formatCoord(n: number): string {
  const s = n.toFixed(6).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

export function buildGoogleMapsUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${formatCoord(lat)},${formatCoord(lng)}`;
}

export function buildWazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${formatCoord(lat)},${formatCoord(lng)}&navigate=yes`;
}

/**
 * Nome/endereço numa linha: sem "<"/">" (o sanitizador global do backend reescreve o texto
 * inteiro quando acha uma tag, e o "&" do link do Waze viraria "&amp;") e sem quebra de linha.
 */
export function sanitizeLocationText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<[^<>]{0,100}>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** Texto do encaminhar e do fluxo nos canais sem pino (D1/D11). */
export function buildLocationShareText(loc: ParsedLocation): string {
  const name = sanitizeLocationText(loc.name, LOCATION_NAME_MAX);
  const address = sanitizeLocationText(loc.address, LOCATION_ADDRESS_MAX);
  const label = sanitizeLocationText(loc.label, LOCATION_NAME_MAX + LOCATION_ADDRESS_MAX + 3);
  const head = label || [name, address && address !== name ? address : ""].filter(Boolean).join(" - ");
  return [head, buildGoogleMapsUrl(loc.lat, loc.lng), buildWazeUrl(loc.lat, loc.lng)].filter(Boolean).join("\n");
}

/** `message` da mensagem rápida do tipo "location": legível como texto (bundle antigo e canal sem pino o mandam assim). */
export function buildQuickReplyLocationMessage(loc: { lat: number; lng: number; name?: string; address?: string }): string {
  const name = sanitizeLocationText(loc.name, LOCATION_NAME_MAX);
  const address = sanitizeLocationText(loc.address, LOCATION_ADDRESS_MAX);
  return [name, address, buildGoogleMapsUrl(loc.lat, loc.lng), buildWazeUrl(loc.lat, loc.lng)].filter(Boolean).join("\n");
}

const LINE_URL_RE = /^https?:\/\//i;

/** Lê o `message` gravado por buildQuickReplyLocationMessage (1ª linha de texto = nome; demais = endereço). */
export function parseQuickReplyLocationMessage(message: unknown): ParsedLocation | null {
  if (typeof message !== "string" || !message.trim()) return null;
  const lines = message.slice(0, LOCATION_PASTE_MAX).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let loc: ParsedLocation | null = null;
  const textLines: string[] = [];
  for (const line of lines) {
    if (LINE_URL_RE.test(line)) {
      if (!loc) {
        const url = safeUrl(line);
        const found = url ? coordsFromUrl(url) : null;
        if (found) loc = { lat: found.lat, lng: found.lng };
      }
    } else {
      textLines.push(line);
    }
  }
  if (!loc) return null;
  const name = sanitizeLocationText(textLines[0], LOCATION_NAME_MAX);
  if (name) loc.name = name;
  const address = sanitizeLocationText(textLines.slice(1).join(", "), LOCATION_ADDRESS_MAX);
  if (address) loc.address = address;
  return loc;
}

// ---------------------------------------------------------------------------
// Leitura das mensagens gravadas (todos os formatos do banco — §4.7 do plano)
// ---------------------------------------------------------------------------

const NUM = "-?\\d{1,3}(?:\\.\\d+)?";
const PAIR_RE = new RegExp(`^\\s*(?:loc:)?\\s*(${NUM})\\s*[,;]\\s*(${NUM})\\s*(?:\\([^)]{0,200}\\))?\\s*$`, "i");
const GUPSHUP_RE = new RegExp(`^\\[location:\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\]$`, "i");
const LAT_LINE_RE = new RegExp(`Latitude:\\s*(${NUM})`, "i");
const LNG_LINE_RE = new RegExp(`Longitude:\\s*(${NUM})`, "i");
const LOCATION_PREFIX_RE = new RegExp(`^Location:\\s*(${NUM})\\s*,\\s*(${NUM})`, "i");
const LEADING_PAIR_RE = /^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/;
const URL_IN_TEXT_RE = /https?:\/\/[^\s|<>"']+/i;
const FLOW_NAME_RE = /^Localiza[cç][aã]o:[ \t]*([^\r\n]*)$/im;
const FLOW_ADDRESS_RE = /^Endere[cç]o:[ \t]*([^\r\n]*)$/im;

function pair(latRaw: unknown, lngRaw: unknown): ParsedLocation | null {
  const lat = parseCoordInput(latRaw);
  const lng = parseCoordInput(lngRaw);
  if (lat === null || lng === null || !isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

function pairFromText(text: string): ParsedLocation | null {
  const m = PAIR_RE.exec(text);
  return m ? pair(m[1], m[2]) : null;
}

function safeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Waze curto `waze.com/ul/h<geohash>`: a coordenada está no próprio link. */
function decodeGeohash(hash: string): ParsedLocation | null {
  if (!/^[0-9bcdefghjkmnpqrstuvwxyz]{5,12}$/.test(hash)) return null;
  let lat: [number, number] = [-90, 90];
  let lng: [number, number] = [-180, 180];
  let even = true;
  for (const ch of hash) {
    const bits = GEOHASH_ALPHABET.indexOf(ch);
    for (let i = 4; i >= 0; i--) {
      const bit = (bits >> i) & 1;
      const range = even ? lng : lat;
      const mid = (range[0] + range[1]) / 2;
      if (bit) range[0] = mid;
      else range[1] = mid;
      even = !even;
    }
  }
  return pair((lat[0] + lat[1]) / 2, (lng[0] + lng[1]) / 2);
}

// "coordinate": link unificado do Apple Maps (iOS 18.4+: maps.apple.com/place?coordinate=LAT,LNG&name=…).
const COORD_PARAMS = ["q", "query", "ll", "sll", "center", "daddr", "destination", "latlng", "to", "coordinate"];
const GOOGLE_PIN_RE = new RegExp(`!3d(${NUM})!4d(${NUM})`);
const OSM_HASH_RE = new RegExp(`#map=\\d{1,2}/(${NUM})/(${NUM})`);
const GOOGLE_VIEW_RE = new RegExp(`@(${NUM}),(${NUM})`);

/** Coordenadas de um link de mapa (Google, Waze, Apple Maps, OpenStreetMap). */
function coordsFromUrl(url: URL): ParsedLocation | null {
  const host = url.hostname.toLowerCase();
  const href = url.href;
  // Google: !3dLAT!4dLNG é o ponto exato do lugar (o @LAT,LNG é só o centro do mapa na tela).
  let m = GOOGLE_PIN_RE.exec(href);
  let loc: ParsedLocation | null = m ? pair(m[1], m[2]) : null;
  if (!loc) {
    for (const key of COORD_PARAMS) {
      const value = url.searchParams.get(key);
      if (!value) continue;
      loc = pairFromText(key === "to" ? value.replace(/^ll\./i, "") : value);
      if (loc) break;
    }
  }
  if (!loc) loc = pair(url.searchParams.get("mlat") ?? "", url.searchParams.get("mlon") ?? "");
  if (!loc) {
    m = OSM_HASH_RE.exec(href);
    if (m) loc = pair(m[1], m[2]);
  }
  if (!loc) {
    const search = /\/maps\/search\/([^/?#]+)/.exec(url.pathname);
    if (search) loc = pairFromText(safeDecode(search[1].replace(/\+/g, " ")));
  }
  if (!loc) {
    // Rota do Google: o destino é o último trecho antes do "@" (que é só o centro do mapa
    // na tela, no meio do trajeto). Destino sem coordenada = não reconhecido.
    const dir = /\/maps\/dir\/(.+)$/.exec(url.pathname);
    if (dir) {
      const parts = dir[1].split("/").filter((p) => p && !p.startsWith("@") && !p.startsWith("data="));
      const last = parts[parts.length - 1];
      return last ? pairFromText(safeDecode(last.replace(/\+/g, " "))) : null;
    }
    m = GOOGLE_VIEW_RE.exec(url.pathname);
    if (m) loc = pair(m[1], m[2]);
  }
  if (!loc && (host === "waze.com" || host.endsWith(".waze.com"))) {
    const geo = /^\/ul\/h([0-9a-z]+)/i.exec(url.pathname);
    if (geo) loc = decodeGeohash(geo[1].toLowerCase());
  }
  if (!loc) return null;
  const place = /\/maps\/place\/([^/?#]+)/.exec(url.pathname);
  // Nome que é só a coordenada (par decimal ou graus: o "alfinete" do Google traz
  // 23°33'01.8"S 46°38'00.0"W no caminho) não vira título do pino.
  const isCoordText = (text: string) => !!pairFromText(text) || !!coordsFromPlainText(text);
  if (place) {
    const name = sanitizeLocationText(safeDecode(place[1].replace(/\+/g, " ")), LOCATION_NAME_MAX);
    if (name && !isCoordText(name)) loc.name = name;
  } else if (host === "maps.apple.com") {
    const raw = url.searchParams.get("name") || url.searchParams.get("q");
    const name = raw && !isCoordText(raw) ? sanitizeLocationText(raw, LOCATION_NAME_MAX) : "";
    if (name) loc.name = name;
  }
  return loc;
}

function isShortMapLink(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  return host === "maps.app.goo.gl" || (host === "goo.gl" && path.startsWith("/maps")) || (host === "g.co" && path.startsWith("/kgs"));
}

/** Corpo gravado pelos canais (o formato muda por canal; nenhum deles muda nesta entrega). */
function coordsFromBody(raw: string): ParsedLocation | null {
  let body = raw;
  if (body.startsWith("data:")) {
    // Tempo real do Baileys/Zapo: "data:image/png;base64, <miniatura> | <link do mapa>"
    const cut = body.lastIndexOf("|");
    if (cut < 0) return null;
    body = body.slice(cut + 1);
  }
  body = body.slice(0, BODY_SCAN_MAX).trim();
  if (!body) return null;

  let m = GUPSHUP_RE.exec(body);
  if (m) return pair(m[1], m[2]);

  const latLine = LAT_LINE_RE.exec(body);
  const lngLine = LNG_LINE_RE.exec(body);
  if (latLine && lngLine) {
    const loc = pair(latLine[1], lngLine[1]);
    if (loc) {
      // Corpo do fluxo: "Localização: <nome>\nLatitude…\nLongitude…\nEndereço: <x>" ("Local" = sem nome)
      const nameMatch = FLOW_NAME_RE.exec(body);
      const name = nameMatch ? sanitizeLocationText(nameMatch[1], LOCATION_NAME_MAX) : "";
      if (name && name !== "Local") loc.name = name;
      const addressMatch = FLOW_ADDRESS_RE.exec(body);
      const address = addressMatch ? sanitizeLocationText(addressMatch[1], LOCATION_ADDRESS_MAX) : "";
      if (address) loc.address = address;
    }
    return loc;
  }

  m = LOCATION_PREFIX_RE.exec(body);
  if (m) return pair(m[1], m[2]);

  m = LEADING_PAIR_RE.exec(body);
  if (m) {
    // Telegram: "LAT,LNG" e, na linha seguinte, "lugar - endereço"
    const loc = pair(m[1], m[2]);
    if (loc) {
      const rest = body.slice(m[0].length).replace(/^\s*\r?\n/, "");
      const label = sanitizeLocationText(rest.split(/\r?\n/)[0] || "", LOCATION_NAME_MAX + LOCATION_ADDRESS_MAX + 3);
      if (label) loc.label = label;
    }
    return loc;
  }

  const urlMatch = URL_IN_TEXT_RE.exec(body);
  if (urlMatch) {
    const url = safeUrl(urlMatch[0]);
    if (url) return coordsFromUrl(url);
  }
  return null;
}

const MESSAGE_WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "editedMessage",
];

function unwrapMessage(message: unknown, depth = 0): Record<string, unknown> | null {
  if (!message || typeof message !== "object") return null;
  const obj = message as Record<string, unknown>;
  if (depth < 3) {
    for (const wrapper of MESSAGE_WRAPPERS) {
      const inner = (obj[wrapper] as { message?: unknown } | undefined)?.message;
      if (inner && typeof inner === "object") return unwrapMessage(inner, depth + 1);
    }
  }
  return obj;
}

function fromLocationObject(value: unknown): ParsedLocation | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const loc = pair(
    o.lat ?? o.latitude ?? o.degreesLatitude ?? o.Latitude ?? o.DegreesLatitude,
    o.lng ?? o.longitude ?? o.degreesLongitude ?? o.Longitude ?? o.DegreesLongitude,
  );
  if (!loc) return null;
  const name = sanitizeLocationText(o.name ?? o.Name, LOCATION_NAME_MAX);
  if (name) loc.name = name;
  const address = sanitizeLocationText(o.address ?? o.Address, LOCATION_ADDRESS_MAX);
  if (address && address !== name) loc.address = address;
  return loc;
}

/**
 * `dataJson` da linha: o formato novo e o cru do Cloud API (`{ location: {…} }`), e a
 * mensagem crua do Baileys/Zapo das linhas "Media download limited" (`{ message: { locationMessage } }`).
 */
function coordsFromDataJson(raw: unknown): ParsedLocation | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (!raw || raw.length > DATAJSON_SCAN_MAX) return null;
    // Sem chave de coordenada não vale o JSON.parse (o dataJson guarda outras coisas).
    if (!raw.includes("atitude") && !raw.includes('"lat"')) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const direct = fromLocationObject(obj.location);
  if (direct) return direct;
  const message = unwrapMessage(obj.message) ?? unwrapMessage(obj);
  return fromLocationObject(message?.locationMessage) ?? fromLocationObject(message?.liveLocationMessage);
}

/** Coordenadas de uma mensagem gravada (body + dataJson). Quem chama decide pelo mediaType. */
export function parseLocationMessage(msg: { body?: string | null; dataJson?: unknown } | null | undefined): ParsedLocation | null {
  if (!msg) return null;
  const fromData = coordsFromDataJson(msg.dataJson);
  const fromBody = typeof msg.body === "string" ? coordsFromBody(msg.body) : null;
  const loc = fromData ?? fromBody;
  if (!loc) return null;
  if (fromData && fromBody) {
    if (!loc.name && fromBody.name) loc.name = fromBody.name;
    if (!loc.address && fromBody.address) loc.address = fromBody.address;
    if (!loc.name && !loc.address && fromBody.label) loc.label = fromBody.label;
  }
  return loc;
}

const messageLocationCache = new WeakMap<object, ParsedLocation | null>();

/** parseLocationMessage memorizado por objeto de mensagem (o balão e a lista chamam a cada render). */
export function getMessageLocation(msg: { body?: string | null; dataJson?: unknown } | null | undefined): ParsedLocation | null {
  if (!msg || typeof msg !== "object") return null;
  if (messageLocationCache.has(msg)) return messageLocationCache.get(msg) ?? null;
  const loc = parseLocationMessage(msg);
  messageLocationCache.set(msg, loc);
  return loc;
}

// ---------------------------------------------------------------------------
// Campo "Colar link ou coordenadas"
// ---------------------------------------------------------------------------

const PLAIN_DOT_RE = /^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/;
const PLAIN_COMMA_RE = /^(-?\d{1,3},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)$/;
const GEO_URI_RE = new RegExp(`^geo:\\s*(${NUM})\\s*,\\s*(${NUM})`, "i");
// Graus com hemisfério: 23°33'01.8"S 46°38'00.0"W, 23.5505° S, 46.6333° W (O = oeste, L = leste)
const HEMI_PART =
  "(\\d{1,3}(?:[.,]\\d+)?)\\s*°?\\s*(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*['′’]\\s*)?(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*[\"″”]\\s*)?([NSLOEW])";
const HEMI_RE = new RegExp(`^${HEMI_PART}[\\s,;]*${HEMI_PART}$`, "i");

function hemiValue(deg: string, min: string | undefined, sec: string | undefined, hemi: string): number | null {
  const d = Number(deg.replace(",", "."));
  const mi = min ? Number(min.replace(",", ".")) : 0;
  const se = sec ? Number(sec.replace(",", ".")) : 0;
  if (![d, mi, se].every(Number.isFinite) || mi >= 60 || se >= 60) return null;
  const value = d + mi / 60 + se / 3600;
  return /[SOW]/i.test(hemi) ? -value : value;
}

function coordsFromPlainText(text: string): ParsedLocation | null {
  const s = text.trim().replace(/[\u2212\u2013\u2014]/g, "-");
  let m = PLAIN_DOT_RE.exec(s);
  if (m) return pair(m[1], m[2]);
  m = PLAIN_COMMA_RE.exec(s);
  if (m) return pair(m[1], m[2]);
  m = GEO_URI_RE.exec(s);
  if (m) return pair(m[1], m[2]);
  m = HEMI_RE.exec(s);
  if (m) {
    const first = hemiValue(m[1], m[2], m[3], m[4]);
    const second = hemiValue(m[5], m[6], m[7], m[8]);
    if (first === null || second === null) return null;
    const firstIsLat = /[NS]/i.test(m[4]);
    const secondIsLat = /[NS]/i.test(m[8]);
    if (firstIsLat === secondIsLat) return null;
    return firstIsLat ? pair(first, second) : pair(second, first);
  }
  return null;
}

export type PastedLocation = { kind: "coords"; loc: ParsedLocation } | { kind: "shortLink" } | { kind: "none" };

/** Texto colado pelo atendente: link de mapa, coordenadas soltas, graus ou o texto do "Compartilhar". */
export function parsePastedLocation(text: unknown): PastedLocation {
  if (typeof text !== "string") return { kind: "none" };
  const s = text.slice(0, LOCATION_PASTE_MAX).trim();
  if (!s) return { kind: "none" };

  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const urls: URL[] = [];
  const textLines: string[] = [];
  for (const line of lines) {
    // O apóstrofo faz parte do link (o "alfinete" do Google traz 23°33'01.8"S no caminho);
    // só a pontuação no fim sai (link entre aspas ou no fim de uma frase).
    const found = line.match(/https?:\/\/[^\s<>"]+/gi);
    if (found) {
      for (const raw of found.slice(0, 3)) {
        const url = safeUrl(raw.replace(/['),.;]+$/, ""));
        if (url) urls.push(url);
      }
      const rest = line.replace(/https?:\/\/[^\s<>"]+/gi, " ").trim();
      if (rest) textLines.push(rest);
    } else {
      textLines.push(line);
    }
  }

  const withText = (loc: ParsedLocation, skip?: string): PastedLocation => {
    const others = textLines.filter((l) => l !== skip && !coordsFromPlainText(l));
    if (!loc.name && others[0]) {
      const name = sanitizeLocationText(others[0], LOCATION_NAME_MAX);
      if (name) loc.name = name;
    }
    if (!loc.address && others.length > 1) {
      const address = sanitizeLocationText(others.slice(1).join(", "), LOCATION_ADDRESS_MAX);
      if (address) loc.address = address;
    }
    return { kind: "coords", loc };
  };

  let sawShortLink = false;
  for (const url of urls) {
    if (isShortMapLink(url)) {
      sawShortLink = true;
      continue;
    }
    const loc = coordsFromUrl(url);
    if (loc) return withText(loc);
  }

  const whole = coordsFromPlainText(s) ?? coordsFromBody(s);
  if (whole && urls.length === 0) return { kind: "coords", loc: whole };
  for (const line of textLines) {
    const loc = coordsFromPlainText(line);
    if (loc) return withText(loc, line);
  }
  if (whole) return { kind: "coords", loc: whole };
  return sawShortLink ? { kind: "shortLink" } : { kind: "none" };
}
