import type { IncomingHttpHeaders, IncomingMessage } from "http";
import { NextRequest, NextResponse } from "next/server";
import type { PanelAppEmbedCheckResult } from "@/lib/panel-apps";
import { BlockedDestinationError, fetchGuarded, parseDownloadUrl } from "../_lib/outbound-guard";

/**
 * Conferência de embed dos aplicativos personalizados (docs/PLANO_APLICATIVOS_PERSONALIZADOS.md
 * §5.6, D12/D23): o servidor do front busca SÓ os cabeçalhos do site (guarda anti-SSRF a
 * cada salto) e diz se ele aceita ser aberto dentro do painel. É só aviso — nunca impede
 * salvar.
 *
 * - POST com corpo `{ url, origin }`: a URL pode ter token (link de BI) e nunca vai na
 *   querystring (log do nginx). Nada é logado.
 * - Regra: CSP `frame-ancestors` (de TODAS as políticas — o Node junta cabeçalhos repetidos
 *   com vírgula) manda quando existe, e aí o navegador ignora o X-Frame-Options; sem ela,
 *   `X-Frame-Options` DENY/SAMEORIGIN bloqueia.
 * - Resultado: bloqueado sem redirecionamento → `blocked`; bloqueado depois de redirecionar
 *   (tela de login costuma ter cabeçalho próprio) → `unknown`; status ≥ 400, prazo, destino
 *   recusado pela guarda → `unknown`; resto → `ok`.
 * - Resposta `{ result, reason }` (código curto). Nunca o corpo nem cabeçalho cru do site.
 * - Rota pública (o middleware libera `/api`): 20 conferências por minuto por IP.
 */

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 6000;
const MAX_BODY_BYTES = 8 * 1024;
// Espelho de PANEL_APP_URL_MAX (lib/panel-apps): a lib não é importada aqui em tempo de
// execução (traz o store do login e os ícones para a rota do servidor).
const URL_MAX = 2048;

const RATE_LIMIT_PER_MINUTE = 20;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_TRACKED_IPS = 5000;
const rateBuckets = new Map<string, { start: number; count: number }>();

type Result = PanelAppEmbedCheckResult;

const reply = (result: Result["result"], reason: string, status = 200) => {
  const payload: Result = { result, reason };
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
};

function clientIp(req: NextRequest): string {
  // nginx dos instaladores: X-Real-IP = $remote_addr. Sem ele, o ÚLTIMO item do
  // X-Forwarded-For (o que o proxy acrescentou; o primeiro vem do próprio cliente).
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return rateKeyOf(realIp.slice(0, 64));
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return rateKeyOf(parts[parts.length - 1].slice(0, 64));
  }
  return "unknown";
}

/** IPv6 conta por /64 (cada cliente tem uma faixa inteira); IPv4 mapeado vira o IPv4. */
function rateKeyOf(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;
  return ip.toLowerCase().split(":").slice(0, 4).join(":");
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (rateBuckets.size > RATE_MAX_TRACKED_IPS) {
    for (const [key, bucket] of rateBuckets) {
      if (now - bucket.start >= RATE_WINDOW_MS) rateBuckets.delete(key);
    }
    // Ainda cheio (muitos IPs na mesma janela): descarta os mais antigos, nunca zera o
    // limite de todo mundo de uma vez.
    if (rateBuckets.size > RATE_MAX_TRACKED_IPS) {
      const excess = rateBuckets.size - Math.floor(RATE_MAX_TRACKED_IPS * 0.9);
      let removed = 0;
      for (const key of Array.from(rateBuckets.keys())) {
        if (removed >= excess) break;
        rateBuckets.delete(key);
        removed += 1;
      }
    }
  }
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

class BodyTooLargeError extends Error {}

async function readJsonBody(req: NextRequest): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new BodyTooLargeError();
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError();
    }
    chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
}

/** Origem http(s) válida, ou null. */
function parseOrigin(raw: unknown): URL | null {
  if (typeof raw !== "string" || !raw || raw.length > URL_MAX) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.username || u.password) return null;
    return new URL(u.origin);
  } catch {
    return null;
  }
}

const defaultPort = (protocol: string): string => (protocol === "https:" ? "443" : protocol === "http:" ? "80" : "");
const effectivePort = (u: URL): string => u.port || defaultPort(u.protocol);

/** CSP3 "scheme-part match": http casa https; ws casa wss/http/https; wss casa https. */
function schemeMatches(sourceScheme: string, urlScheme: string): boolean {
  const a = sourceScheme.toLowerCase().replace(/:$/, "");
  const b = urlScheme.toLowerCase().replace(/:$/, "");
  if (a === b) return true;
  if (a === "http" && b === "https") return true;
  if (a === "ws" && (b === "wss" || b === "http" || b === "https")) return true;
  if (a === "wss" && b === "https") return true;
  return false;
}

const HOST_SOURCE =
  /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*|\*\.[^\s:/]+|\[[0-9a-f:.]+\]|[^\s:/*]+)(?::(\d{1,5}|\*))?(?:\/.*)?$/i;

/**
 * A lista de `frame-ancestors` aceita o painel? `appOrigin` = origem da página conferida
 * (para `'self'` e para a fonte sem esquema). Caminho da fonte é ignorado.
 */
function frameAncestorsAllow(tokens: string[], panel: URL, appOrigin: URL): boolean {
  const sources = tokens.filter((tk) => tk.toLowerCase() !== "'none'");
  for (const raw of sources) {
    const token = raw.trim();
    if (!token) continue;
    const lower = token.toLowerCase();
    if (lower === "*") {
      if (["http", "https", "ws", "wss"].includes(panel.protocol.replace(/:$/, ""))) return true;
      if (schemeMatches(appOrigin.protocol, panel.protocol)) return true;
      continue;
    }
    if (lower === "'self'") {
      if (panel.origin === appOrigin.origin) return true;
      continue;
    }
    if (lower.startsWith("'")) continue; // nonce/hash/unsafe-*: não valem para frame-ancestors
    if (/^[a-z][a-z0-9+.-]*:$/.test(lower)) {
      if (schemeMatches(lower, panel.protocol)) return true;
      continue;
    }
    const m = HOST_SOURCE.exec(token);
    if (!m) continue;
    const [, scheme, hostRaw, port] = m;
    if (scheme) {
      if (!schemeMatches(scheme, panel.protocol)) continue;
    } else if (!schemeMatches(appOrigin.protocol, panel.protocol)) {
      continue;
    }
    const host = hostRaw.toLowerCase();
    const panelHost = panel.hostname.toLowerCase();
    if (host !== "*") {
      if (host.startsWith("*.")) {
        const suffix = host.slice(1); // ".dominio.com"
        if (!(panelHost.endsWith(suffix) && panelHost.length > suffix.length)) continue;
      } else if (host !== panelHost) {
        continue;
      }
    }
    if (port === "*") return true;
    const panelPort = effectivePort(panel);
    if (!port) {
      if (!panel.port) return true; // porta padrão do esquema do painel
      continue;
    }
    if (port === panelPort) return true;
    // Fonte http na porta 80 também vale para o painel em https na 443 (CSP3).
    if (port === "80" && panel.protocol === "https:" && panelPort === "443") return true;
  }
  return false;
}

const headerText = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";

/** Bloqueio pelos cabeçalhos: `null` = aceita ser embutido. */
function framingBlockReason(headers: IncomingHttpHeaders, panel: URL, appOrigin: URL): string | null {
  const csp = headerText(headers["content-security-policy"]);
  let hasFrameAncestors = false;
  let cspBlocks = false;
  if (csp) {
    for (const policy of csp.split(",")) {
      const seen = new Set<string>();
      for (const directive of policy.split(";")) {
        const parts = directive.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) continue;
        const name = parts[0].toLowerCase();
        // Diretiva repetida na mesma política: vale a primeira.
        if (seen.has(name)) continue;
        seen.add(name);
        if (name !== "frame-ancestors") continue;
        hasFrameAncestors = true;
        if (!frameAncestorsAllow(parts.slice(1), panel, appOrigin)) cspBlocks = true;
      }
    }
  }
  if (hasFrameAncestors) return cspBlocks ? "frame_ancestors" : null;

  // Regra do HTML para X-Frame-Options (valores repetidos chegam juntos por vírgula).
  const xfo = new Set(
    headerText(headers["x-frame-options"])
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
  if (xfo.size === 0) return null;
  if (xfo.size > 1) {
    return xfo.has("deny") || xfo.has("sameorigin") || xfo.has("allowall") ? "x_frame_options" : null;
  }
  // SAMEORIGIN: o painel nunca tem a origem da app (o cadastro recusa a mesma origem).
  if (xfo.has("deny") || xfo.has("sameorigin")) return "x_frame_options";
  return null;
}

/** Endereço do último pedido feito (o Node guarda o pedido em `res.req`). `null` = não deu para ler. */
function finalRequestKey(res: IncomingMessage): string | null {
  const req = (res as IncomingMessage & {
    req?: { protocol?: string; host?: string; path?: string; getHeader?: (name: string) => unknown };
  }).req;
  if (!req || typeof req.path !== "string") return null;
  const hostHeader = typeof req.getHeader === "function" ? req.getHeader("host") : undefined;
  const host = typeof hostHeader === "string" && hostHeader ? hostHeader : req.host;
  if (!host) return null;
  return `${String(req.protocol || "").toLowerCase()}//${host.toLowerCase()}${req.path}`;
}

const requestKeyOf = (u: URL): string => `${u.protocol}//${u.host.toLowerCase()}${u.pathname}${u.search}`;

/** Origem da página que respondeu (para `'self'`). Sem leitura confiável, a pedida. */
function finalOrigin(res: IncomingMessage, fallback: URL): URL {
  const key = finalRequestKey(res);
  if (!key) return fallback;
  try {
    return new URL(new URL(key).origin);
  } catch {
    return fallback;
  }
}

const TLS_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_GET_ISSUER_CERT",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
]);

function errorReason(err: unknown): string {
  if (err instanceof BlockedDestinationError) return "blocked_destination";
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? e.message : "";
  if (message === "ETIMEDOUT" || code === "ETIMEDOUT") return "timeout";
  if (message === "ERR_TOO_MANY_REDIRECTS") return "too_many_redirects";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (code === "ECONNREFUSED") return "connection_refused";
  if (TLS_CODES.has(code) || code.startsWith("ERR_TLS") || code.startsWith("ERR_SSL") || code.includes("CERT")) return "tls";
  return "network";
}

export async function POST(req: NextRequest) {
  if (rateLimited(clientIp(req))) return reply("unknown", "rate_limited", 429);

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    if (err instanceof BodyTooLargeError) return reply("unknown", "body_too_large", 413);
    return reply("unknown", "bad_request", 400);
  }
  const input = (body && typeof body === "object" ? body : {}) as { url?: unknown; origin?: unknown };

  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  // eslint-disable-next-line no-control-regex
  if (!rawUrl || rawUrl.length > URL_MAX || /[\u0000-\u0020\u007f]/.test(rawUrl)) {
    return reply("unknown", "invalid_url");
  }
  const target = parseDownloadUrl(rawUrl);
  if (!target) return reply("unknown", "invalid_url");
  // "Dentro do painel" só abre https (D27); a conferência só vale para esse modo.
  if (target.protocol !== "https:") return reply("unknown", "https_required");

  const panel = parseOrigin(input.origin) ?? parseOrigin(req.headers.get("origin"));
  if (!panel) return reply("unknown", "invalid_origin");
  // O próprio painel responde X-Frame-Options: DENY (e o cadastro recusa a mesma origem).
  if (target.origin === panel.origin) return reply("blocked", "same_origin");

  let res: IncomingMessage | null = null;
  try {
    res = await fetchGuarded(
      target,
      { "User-Agent": "Mozilla/5.0 (compatible)", Accept: "text/html" },
      FETCH_TIMEOUT_MS
    );
    // Só os cabeçalhos importam: o corpo é descartado na hora.
    const status = res.statusCode || 0;
    const headers = res.headers;
    const finalKey = finalRequestKey(res);
    const appOrigin = finalOrigin(res, target);
    res.destroy();
    res = null;

    if (status >= 400) return reply("unknown", `http_${status}`);
    // Terminou numa página http (ex.: login da intranet): o painel em https nunca a
    // carrega no iframe (conteúdo misto + frame-src https:), então é bloqueio certo.
    if (finalKey !== null && finalKey.startsWith("http:")) return reply("blocked", "insecure_redirect");

    const blockReason = framingBlockReason(headers, panel, appOrigin);
    if (!blockReason) return reply("ok", "allowed");
    // Sem saber se houve redirecionamento, não afirma "bloqueado" (o selo é categórico).
    const redirected = finalKey === null || finalKey !== requestKeyOf(target);
    return redirected ? reply("unknown", "redirect") : reply("blocked", blockReason);
  } catch (err) {
    res?.destroy();
    return reply("unknown", errorReason(err));
  }
}
