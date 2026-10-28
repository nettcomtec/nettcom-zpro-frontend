import dns from "dns";
import http from "http";
import https from "https";
import net from "net";
import os from "os";

// Guarda de destino das rotas /api/download e /api/link-preview (roda só no
// servidor do front). As rotas buscam uma URL qualquer: sem esta guarda serviam
// para ler endereço interno (backend em localhost, rede privada, metadados da
// nuvem). O IP é conferido na resolução de DNS usada pela própria conexão (sem
// janela para DNS rebinding) e a cada redirecionamento. IP de interface da
// própria máquina conta como interno fora das portas 80/443: na VPS o IP
// público fica na eth0 e o tráfego para ele entra pelo loopback, passando pelo
// firewall (nas portas web é o nginx, o mesmo que a internet vê).
//
// Instalação de rede local (o endereço do backend, NEXT_PUBLIC_API_URL, resolve
// para IP privado ou loopback) libera sozinha a rede privada e os IPs da própria
// máquina: lá o armazenamento pode estar só na rede interna. Loopback, link-local
// e metadados da nuvem seguem bloqueados sempre.

type IpClass = "public" | "private" | "forbidden";

export class BlockedDestinationError extends Error {
  constructor() {
    super("ERR_DOWNLOAD_DESTINATION_BLOCKED");
  }
}

const V4_FORBIDDEN: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["100.100.100.200", 32],
  ["168.63.129.16", 32],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const V4_PRIVATE: Array<[string, number]> = [
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

function inV4Range(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ip & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0);
}

function classifyV4(ip: string): IpClass {
  const n = ipv4ToInt(ip);
  if (V4_FORBIDDEN.some(([base, bits]) => inV4Range(n, base, bits))) return "forbidden";
  if (V4_PRIVATE.some(([base, bits]) => inV4Range(n, base, bits))) return "private";
  return "public";
}

function parseV6(raw: string): number[] | null {
  let s = raw.split("%")[0].toLowerCase();
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!net.isIPv4(tail)) return null;
    const o = tail.split(".").map(Number);
    s = `${s.slice(0, lastColon + 1)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    groups = [...head, ...Array(fill).fill("0"), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function v4FromGroups(hi: number, lo: number): string {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
}

function classifyV6(ip: string): IpClass {
  const h = parseV6(ip);
  if (!h) return "forbidden";
  const zeroUntil = (end: number) => h.slice(0, end).every((g) => g === 0);
  // ::ffff:a.b.c.d (mapeado) e ::a.b.c.d (compatível, legado)
  if (zeroUntil(5) && (h[5] === 0xffff || h[5] === 0)) {
    if (h[5] === 0 && h[6] === 0 && h[7] <= 1) return "forbidden"; // :: e ::1
    return classifyV4(v4FromGroups(h[6], h[7]));
  }
  // ::ffff:0:a.b.c.d (SIIT), NAT64 (64:ff9b::/96) e 6to4 (2002::/16) carregam um IPv4 dentro
  if (zeroUntil(4) && h[4] === 0xffff && h[5] === 0) return classifyV4(v4FromGroups(h[6], h[7]));
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((g) => g === 0)) {
    return classifyV4(v4FromGroups(h[6], h[7]));
  }
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 1) return "private"; // NAT64 de uso local
  if (h[0] === 0x2002) return classifyV4(v4FromGroups(h[1], h[2]));
  // Teredo (2001::/32) e documentação (2001:db8::/32)
  if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0xdb8)) return "forbidden";
  if ((h[0] & 0xffc0) === 0xfe80) return "forbidden"; // link-local
  if ((h[0] & 0xff00) === 0xff00) return "forbidden"; // multicast
  // fd00:ec2::254 e fd20:ce::254 = metadados da AWS e da GCP por IPv6
  if (h[0] === 0xfd00 && h[1] === 0x0ec2 && h.slice(2, 7).every((g) => g === 0) && h[7] === 0x254) return "forbidden";
  if (h[0] === 0xfd20 && h[1] === 0x00ce && h.slice(2, 7).every((g) => g === 0) && h[7] === 0x254) return "forbidden";
  if ((h[0] & 0xfe00) === 0xfc00) return "private"; // ULA
  if ((h[0] & 0xffc0) === 0xfec0) return "private"; // site-local (obsoleto)
  return "public";
}

const LOCAL_ADDRESSES_TTL_MS = 60_000;
let localAddresses: { at: number; set: Set<string> } | null = null;

function normalizeIpForCompare(ip: string): string {
  const groups = net.isIPv6(ip) ? parseV6(ip) : null;
  return groups ? groups.map((g) => g.toString(16)).join(":") : ip;
}

// IPv4 carregado dentro de um IPv6 (mapeado, compatível, SIIT, NAT64, 6to4).
function embeddedV4(ip: string): string | null {
  const h = net.isIPv6(ip) ? parseV6(ip) : null;
  if (!h) return null;
  const zeroUntil = (end: number) => h.slice(0, end).every((g) => g === 0);
  if (zeroUntil(5) && (h[5] === 0xffff || h[5] === 0)) return v4FromGroups(h[6], h[7]);
  if (zeroUntil(4) && h[4] === 0xffff && h[5] === 0) return v4FromGroups(h[6], h[7]);
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((g) => g === 0)) return v4FromGroups(h[6], h[7]);
  if (h[0] === 0x2002) return v4FromGroups(h[1], h[2]);
  return null;
}

function isLocalInterfaceAddress(ip: string): boolean {
  const now = Date.now();
  if (!localAddresses || now - localAddresses.at > LOCAL_ADDRESSES_TTL_MS) {
    const set = new Set<string>();
    try {
      for (const list of Object.values(os.networkInterfaces())) {
        for (const iface of list || []) set.add(normalizeIpForCompare(iface.address));
      }
    } catch {
      /* sem a lista, vale só a classificação por faixa */
    }
    localAddresses = { at: now, set };
  }
  const v4 = embeddedV4(ip);
  return localAddresses.set.has(normalizeIpForCompare(ip)) || (v4 !== null && localAddresses.set.has(v4));
}

// webPort: destino na porta 80/443. O IP da própria máquina nessas portas é o nginx,
// que a internet já enxerga; nas demais (backend cru, Next, banco) o firewall seria contornado.
function isBlockedIp(ip: string, allowPrivate: boolean, webPort: boolean): boolean {
  let kind: IpClass = net.isIPv4(ip) ? classifyV4(ip) : net.isIPv6(ip) ? classifyV6(ip) : "forbidden";
  if (kind === "public" && !webPort && isLocalInterfaceAddress(ip)) kind = "private";
  if (kind === "forbidden") return true;
  if (kind === "private") return !allowPrivate;
  return false;
}

function isLoopback(ip: string): boolean {
  // ::1 antes do IPv4 embutido: pela forma "compatível" ele seria lido como 0.0.0.1.
  const h = net.isIPv6(ip) ? parseV6(ip) : null;
  if (h && h.slice(0, 7).every((g) => g === 0) && h[7] === 1) return true;
  const v4 = net.isIPv4(ip) ? ip : embeddedV4(ip);
  return !!v4 && v4.startsWith("127.");
}

// Só a faixa conta (nunca o "IP da própria máquina"): na VPS o domínio do backend
// resolve para o IP público da eth0, e isso é instalação pública.
function isInternalAddress(ip: string): boolean {
  if (isLoopback(ip)) return true;
  const kind = net.isIPv4(ip) ? classifyV4(ip) : net.isIPv6(ip) ? classifyV6(ip) : "forbidden";
  return kind === "private";
}

const INSTALL_KIND_TTL_MS = 5 * 60_000;
const INSTALL_KIND_FAILURE_TTL_MS = 60_000;
let installKind: { at: number; ttl: number; local: Promise<boolean> } | null = null;

function resolveLocalNetworkInstall(): Promise<{ local: boolean; ok: boolean }> {
  let host = "";
  try {
    host = new URL(process.env.NEXT_PUBLIC_API_URL || "").hostname.replace(/^\[|\]$/g, "");
  } catch {
    return Promise.resolve({ local: false, ok: true });
  }
  if (!host) return Promise.resolve({ local: false, ok: true });
  if (net.isIP(host)) return Promise.resolve({ local: isInternalAddress(host), ok: true });
  return new Promise((resolve) => {
    dns.lookup(host, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return resolve({ local: false, ok: false });
      const list = addresses as dns.LookupAddress[];
      resolve({ local: list.length > 0 && list.every((a) => isInternalAddress(a.address)), ok: true });
    });
  });
}

// Falha de DNS conta como instalação pública (fail-closed) e é refeita em 1 min.
function isLocalNetworkInstall(): Promise<boolean> {
  const now = Date.now();
  if (!installKind || now - installKind.at > installKind.ttl) {
    const entry = { at: now, ttl: INSTALL_KIND_TTL_MS, local: Promise.resolve(false) };
    entry.local = resolveLocalNetworkInstall().then(({ local, ok }) => {
      if (!ok) entry.ttl = INSTALL_KIND_FAILURE_TTL_MS;
      return local;
    });
    installKind = entry;
  }
  return installKind.local;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

function guardedLookup(allowPrivate: boolean, webPort: boolean) {
  return (hostname: string, options: dns.LookupOptions | number, callback: LookupCallback) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err);
      const list = addresses as dns.LookupAddress[];
      // Qualquer endereço proibido recusa o nome inteiro: a conexão poderia cair nele.
      if (list.some((a) => isBlockedIp(a.address, allowPrivate, webPort))) return callback(new BlockedDestinationError());
      const family = typeof options === "number" ? options : options?.family;
      const usable = family === 4 || family === 6 ? list.filter((a) => a.family === family) : list;
      if (usable.length === 0) {
        return callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }));
      }
      if (typeof options === "object" && options?.all) return callback(null, usable);
      return callback(null, usable[0].address, usable[0].family);
    });
  };
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
// Inatividade no meio do corpo (o mesmo teto do fetch que a rota usava antes).
const BODY_IDLE_TIMEOUT_MS = 300_000;

function parseAllowedUrl(raw: string, base?: URL): URL | null {
  let url: URL;
  try {
    url = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url;
}

export function parseDownloadUrl(raw: string): URL | null {
  return parseAllowedUrl(raw);
}

function requestOnce(
  target: URL,
  allowPrivate: boolean,
  headers: Record<string, string>,
  deadline: number,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const host = target.hostname.replace(/^\[|\]$/g, "");
    const port = target.port || (target.protocol === "https:" ? "443" : "80");
    const webPort = port === "80" || port === "443";
    // IP literal não passa pelo lookup: confere aqui.
    if (net.isIP(host) && isBlockedIp(host, allowPrivate, webPort)) {
      reject(new BlockedDestinationError());
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new Error("ETIMEDOUT"));
      return;
    }
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(
      target,
      { method: "GET", headers, agent: false, lookup: guardedLookup(allowPrivate, webPort) as unknown as net.LookupFunction },
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("ETIMEDOUT")), remaining);
    req.setTimeout(BODY_IDLE_TIMEOUT_MS, () => req.destroy(new Error("ETIMEDOUT")));
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}

/**
 * Busca a URL com a guarda de destino em cada salto. Devolve a resposta final
 * (qualquer status que não seja redirecionamento) para o chamador decidir.
 */
export async function fetchGuarded(
  url: URL,
  headers: Record<string, string>,
  timeoutMs: number,
  firstHopHeaders?: Record<string, string>,
): Promise<http.IncomingMessage> {
  const allowPrivate = await isLocalNetworkInstall();
  const deadline = Date.now() + timeoutMs;
  let current = url;
  for (let hop = 0; ; hop++) {
    // firstHopHeaders só no pedido original: nunca seguem o redirecionamento para outro host.
    const hopHeaders = hop === 0 && firstHopHeaders ? { ...headers, ...firstHopHeaders } : headers;
    const res = await requestOnce(current, allowPrivate, hopHeaders, deadline);
    const location = res.headers.location;
    if (!REDIRECT_STATUSES.has(res.statusCode || 0) || !location) return res;
    // Corpo do salto nunca é lido: fechar já, senão segue baixando sem prazo.
    res.destroy();
    if (hop >= MAX_REDIRECTS) throw new Error("ERR_TOO_MANY_REDIRECTS");
    const next = parseAllowedUrl(location, current);
    if (!next) throw new BlockedDestinationError();
    current = next;
  }
}
