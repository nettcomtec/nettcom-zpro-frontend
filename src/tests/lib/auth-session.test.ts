import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SESSION_WINDOW_SECONDS,
  forgetCsrfToken,
  jwtIssuedAtMs,
  readCsrfToken,
  rememberCsrfToken,
  remainingSessionSeconds,
  setAuthRouteCookie,
  syncAuthRouteCookieWithToken,
} from "@/lib/auth-session";

function b64url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeJwt(payload: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.assinatura`;
}

const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
let cookieWrites: string[] = [];

function clearCookies(): void {
  document.cookie.split("; ").forEach((c) => {
    const name = c.split("=")[0];
    if (name) cookieDescriptor.set!.call(document, `${name}=; path=/; max-age=0`);
  });
}

beforeEach(() => {
  clearCookies();
  localStorage.clear();
  cookieWrites = [];
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => cookieDescriptor.get!.call(document),
    set: (value: string) => {
      cookieWrites.push(value);
      cookieDescriptor.set!.call(document, value);
    },
  });
});

afterEach(() => {
  delete (document as unknown as Record<string, unknown>).cookie;
  clearCookies();
});

describe("jwtIssuedAtMs", () => {
  it("lê o iat mesmo com nome acentuado no payload (UTF-8)", () => {
    const token = fakeJwt({ usarname: "João Ação ç 漢字", iat: 1_760_000_000, id: 7 });
    expect(jwtIssuedAtMs(token)).toBe(1_760_000_000_000);
  });

  it("devolve null para token ilegível ou sem iat", () => {
    expect(jwtIssuedAtMs(null)).toBeNull();
    expect(jwtIssuedAtMs("")).toBeNull();
    expect(jwtIssuedAtMs("abc")).toBeNull();
    expect(jwtIssuedAtMs("a.%%%.c")).toBeNull();
    expect(jwtIssuedAtMs(fakeJwt({ id: 1 }))).toBeNull();
    expect(jwtIssuedAtMs(fakeJwt({ iat: "123" }))).toBeNull();
  });
});

describe("remainingSessionSeconds", () => {
  const now = 1_760_000_000_000;
  it("janela inteira logo depois da emissão", () => {
    expect(remainingSessionSeconds(now, now)).toBe(SESSION_WINDOW_SECONDS);
  });
  it("desconta o tempo desde a emissão", () => {
    expect(remainingSessionSeconds(now - 86_400_000, now)).toBe(SESSION_WINDOW_SECONDS - 86_400);
  });
  it("zero depois da janela", () => {
    expect(remainingSessionSeconds(now - 6 * 86_400_000, now)).toBe(0);
  });
  it("relógio do aparelho atrasado nunca passa da janela", () => {
    expect(remainingSessionSeconds(now + 2 * 86_400_000, now)).toBe(SESSION_WINDOW_SECONDS);
  });
});

describe("cookie zpro_auth", () => {
  it("login/renovação grava a janela de 5 dias", () => {
    setAuthRouteCookie();
    expect(cookieWrites).toHaveLength(1);
    expect(cookieWrites[0]).toContain("zpro_auth=1");
    expect(cookieWrites[0]).toContain(`max-age=${SESSION_WINDOW_SECONDS}`);
    expect(document.cookie).toContain("zpro_auth=1");
  });

  it("abertura do painel alinha à emissão do token guardado", () => {
    const iat = Math.floor(Date.now() / 1000) - 86_400;
    syncAuthRouteCookieWithToken(fakeJwt({ iat }));
    expect(cookieWrites).toHaveLength(1);
    const maxAge = Number(/max-age=(\d+)/.exec(cookieWrites[0])?.[1]);
    expect(maxAge).toBeGreaterThan(SESSION_WINDOW_SECONDS - 86_400 - 5);
    expect(maxAge).toBeLessThanOrEqual(SESSION_WINDOW_SECONDS - 86_400);
  });

  it("abertura do painel nunca apaga: janela vencida ou token ilegível não escrevem", () => {
    setAuthRouteCookie();
    cookieWrites = [];
    syncAuthRouteCookieWithToken(fakeJwt({ iat: Math.floor(Date.now() / 1000) - 6 * 86_400 }));
    syncAuthRouteCookieWithToken("lixo");
    syncAuthRouteCookieWithToken(null);
    expect(cookieWrites).toHaveLength(0);
    expect(document.cookie).toContain("zpro_auth=1");
  });
});

describe("código anti-CSRF", () => {
  const stored = "a".repeat(64);
  const fromCookie = "b".repeat(64);

  it("usa o guardado quando o cookie da API não é legível (painel em outro subdomínio)", () => {
    rememberCsrfToken(stored);
    expect(readCsrfToken()).toBe(stored);
  });

  it("o guardado vence um cookie legível (pode ser de outro sistema no domínio pai)", () => {
    rememberCsrfToken(stored);
    document.cookie = `csrf_token=${fromCookie}; path=/`;
    expect(readCsrfToken()).toBe(stored);
  });

  it("sem nada guardado usa o cookie legível (sessão anterior, painel e API no mesmo endereço)", () => {
    document.cookie = `csrf_token=${fromCookie}; path=/`;
    expect(readCsrfToken()).toBe(fromCookie);
  });

  it("ignora valor que não tem cara de código e esquece no logout", () => {
    rememberCsrfToken(undefined);
    rememberCsrfToken("curto");
    rememberCsrfToken("<script>alert(1)</script>xxxxxxxx");
    expect(readCsrfToken()).toBe("");
    rememberCsrfToken(stored);
    forgetCsrfToken();
    expect(readCsrfToken()).toBe("");
  });
});
