import { describe, it, expect } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { getLoginFailureKind } from "@/lib/login-failure-kind";

// O interceptor do `api` rejeita com `error.response || error`: estes casos
// reproduzem os dois formatos que chegam ao catch do login.
const response = (status: number, data: unknown = {}) => ({
  status,
  data,
  statusText: "",
  headers: {},
  config: { headers: new AxiosHeaders() },
});

describe("getLoginFailureKind", () => {
  it("sem internet (AxiosError ERR_NETWORK, sem response) = network", () => {
    const err = new AxiosError("Network Error", "ERR_NETWORK");
    expect(getLoginFailureKind(err)).toBe("network");
  });

  it("prazo estourado (ECONNABORTED) = network", () => {
    const err = new AxiosError("timeout of 10000ms exceeded", "ECONNABORTED");
    expect(getLoginFailureKind(err)).toBe("network");
  });

  it("502/503/504 do proxy (HTML no corpo) = server", () => {
    expect(getLoginFailureKind(response(502, "<html>Bad Gateway</html>"))).toBe("server");
    expect(getLoginFailureKind(response(503))).toBe("server");
    expect(getLoginFailureKind(response(504))).toBe("server");
    expect(getLoginFailureKind(response(500, { error: "ERR_INTERNAL" }))).toBe("server");
  });

  it("recusa 4xx segue como antes (credencial)", () => {
    expect(getLoginFailureKind(response(401, { error: "ERR_INVALID_CREDENTIALS" }))).toBeNull();
    expect(getLoginFailureKind(response(400))).toBeNull();
    expect(getLoginFailureKind(response(429))).toBeNull();
  });

  it("exceção comum de JS não vira falha de rede", () => {
    expect(getLoginFailureKind(new TypeError("x is undefined"))).toBeNull();
    expect(getLoginFailureKind(undefined)).toBeNull();
    expect(getLoginFailureKind("texto")).toBeNull();
  });
});
