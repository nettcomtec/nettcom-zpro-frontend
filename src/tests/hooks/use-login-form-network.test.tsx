import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AxiosError } from "axios";

// Retorno do teste do app (13/10/2026): sem internet o login dizia "E-mail ou senha
// incorretos". O formulário é montado de verdade; só a chamada ao servidor é trocada.
const loginService = vi.fn();
const toastError = vi.fn();

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() } }));
vi.mock("@/services/auth", () => ({ loginService: (...args: unknown[]) => loginService(...args) }));
vi.mock("@/lib/socket", () => ({ connectWithToken: vi.fn() }));
vi.mock("@/i18n/locale-provider", () => ({ useLocale: () => ({ locale: "pt", setLocale: vi.fn() }) }));

import { useLoginForm } from "@/hooks/use-login-form";
import { useMasterkeyForm } from "@/hooks/use-masterkey-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let submit: ((data: { email: string; password: string }) => Promise<void>) | null = null;

function LoginProbe() {
  submit = useLoginForm().onSubmit;
  return null;
}
function MasterkeyProbe() {
  submit = useMasterkeyForm().onSubmit;
  return null;
}

const response = (status: number, data: unknown) => ({ status, data, headers: {}, statusText: "", config: {} });

async function run(Probe: () => null, rejection: unknown) {
  loginService.mockReset();
  toastError.mockReset();
  loginService.mockRejectedValueOnce(rejection);
  const el = document.createElement("div");
  root = createRoot(el);
  await act(async () => { root!.render(<Probe />); });
  await act(async () => { await submit!({ email: "teste@example.com", password: "senha-de-teste" }); });
  return toastError.mock.calls[0]?.[0];
}

describe("login sem resposta do servidor", () => {
  beforeEach(() => { submit = null; });
  afterEach(() => { act(() => root?.unmount()); root = null; });

  for (const [name, Probe] of [["senha", LoginProbe], ["chave mestra", MasterkeyProbe]] as const) {
    it(`${name}: sem internet mostra errorNetwork`, async () => {
      expect(await run(Probe, new AxiosError("Network Error", "ERR_NETWORK"))).toBe("errorNetwork");
    });
    it(`${name}: 502 do proxy mostra errorServerUnavailable`, async () => {
      expect(await run(Probe, response(502, "<html>Bad Gateway</html>"))).toBe("errorServerUnavailable");
    });
    it(`${name}: senha errada continua errorInvalidCredentials`, async () => {
      expect(await run(Probe, response(401, { error: "ERR_INVALID_CREDENTIALS" }))).toBe("errorInvalidCredentials");
    });
    it(`${name}: código conhecido vence o status (500 com INVALID_TENANT)`, async () => {
      expect(await run(Probe, response(500, { error: "INVALID_TENANT" }))).toBe("errorInvalidTenant");
    });
    it(`${name}: 503 de licença indisponível mostra a mensagem de licença`, async () => {
      expect(await run(Probe, response(503, { error: "LICENSE_UNAVAILABLE" }))).toBe("errorServerLicense");
    });
    it(`${name}: 4xx sem código segue como antes`, async () => {
      expect(await run(Probe, response(400, {}))).toBe("errorInvalidCredentials");
    });
  }
});
