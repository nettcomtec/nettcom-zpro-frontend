import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { cleanup, render, screen } from "../utils/dom-testing";
import { NextIntlClientProvider } from "next-intl";
import ptMessages from "@/i18n/locales/pt.json";

// Limite da Meta (erro 80008, chamado #38383): a tela não repete a consulta de números
// quando o backend devolve a pausa, guarda a pausa até o horário informado e mostra o
// selo "Consultas pausadas".

const getWABAPhoneNumbers = vi.fn();
vi.mock("@/services/waba-meta", () => ({
  getWABAPhoneNumbers: (data: Record<string, unknown>) => getWABAPhoneNumbers(data),
}));
vi.mock("@/lib/meta-send-health", () => ({
  useMetaSendHealth: () => [],
  findSendHealthByPhoneNumberId: () => null,
}));

import {
  clearWabaPhoneQualityCache,
  fetchWabaPhoneQualityRating,
} from "@/lib/waba-phone-quality";
import { metaRateLimitedMessage, metaRateLimitedUntil } from "@/lib/backend-error-code";
import { WabaConnectionQualityBadge } from "@/components/atendimento/waba-connection-quality-badge";

const UNTIL = new Date(Date.now() + 30 * 60 * 1000).toISOString();
// Formato em que o interceptor de lib/api.ts rejeita: o próprio response, corpo em `data`.
const rateLimited = () => ({ status: 429, data: { error: `ERR_META_RATE_LIMITED:${UNTIL}` } });

beforeEach(() => {
  clearWabaPhoneQualityCache();
  getWABAPhoneNumbers.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("consulta de números com a conta limitada pela Meta", () => {
  it("não repete sem fields e devolve o horário da pausa", async () => {
    getWABAPhoneNumbers.mockRejectedValue(rateLimited());
    const res = await fetchWabaPhoneQualityRating({ bmToken: "EAAtoken", wabaId: "111" });
    expect(getWABAPhoneNumbers).toHaveBeenCalledTimes(1);
    expect(res.rateLimitedUntil).toBe(UNTIL);
  });

  it("durante a pausa nem pede ao backend", async () => {
    getWABAPhoneNumbers.mockRejectedValue(rateLimited());
    await fetchWabaPhoneQualityRating({ bmToken: "EAAtoken", wabaId: "222" });
    const again = await fetchWabaPhoneQualityRating({ bmToken: "EAAtoken", wabaId: "222" });
    expect(getWABAPhoneNumbers).toHaveBeenCalledTimes(1);
    expect(again.rateLimitedUntil).toBe(UNTIL);
  });

  it("outro erro segue como antes: repete sem fields e não guarda", async () => {
    getWABAPhoneNumbers.mockRejectedValue({ status: 400, data: { error: "ERR_FACEBOOK_PHONE_NUMBERS: campo" } });
    const res = await fetchWabaPhoneQualityRating({ bmToken: "EAAtoken", wabaId: "333" });
    expect(getWABAPhoneNumbers).toHaveBeenCalledTimes(2);
    expect(res.rateLimitedUntil).toBeUndefined();
    await fetchWabaPhoneQualityRating({ bmToken: "EAAtoken", wabaId: "333" });
    expect(getWABAPhoneNumbers).toHaveBeenCalledTimes(4);
  });
});

describe("texto do aviso", () => {
  const tCommon = (key: string, values?: Record<string, string>) =>
    String((ptMessages as any).common[key]).replace("{time}", values?.time ?? "");

  it("lê o horário do código do backend", () => {
    expect(metaRateLimitedUntil(rateLimited())?.toISOString()).toBe(UNTIL);
    expect(metaRateLimitedUntil({ data: { error: "ERR_FACEBOOK_UNAUTHORIZED: x" } })).toBeNull();
  });

  it("monta a mensagem só para o limite da Meta", () => {
    const text = metaRateLimitedMessage(rateLimited(), tCommon);
    expect(text).toContain("erro 80008");
    expect(text).not.toContain("{time}");
    expect(metaRateLimitedMessage({ data: { error: "ERR_X" } }, tCommon)).toBeNull();
  });
});

describe("selo no canal", () => {
  it("mostra 'Consultas pausadas' quando a conta está limitada", async () => {
    getWABAPhoneNumbers.mockRejectedValue(rateLimited());
    render(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <WabaConnectionQualityBadge
          bmToken="EAAtoken"
          wabaId="444"
          loadingLabel="Carregando"
          tooltipTitle="Qualidade"
        />
      </NextIntlClientProvider>
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.getByText("Consultas pausadas")).toBeTruthy();
  });

  it("sem limite não mostra o selo", async () => {
    getWABAPhoneNumbers.mockResolvedValue({ data: { data: [{ id: "1", quality_rating: "GREEN" }] } });
    render(
      <NextIntlClientProvider locale="pt" messages={ptMessages}>
        <WabaConnectionQualityBadge
          bmToken="EAAtoken"
          wabaId="555"
          loadingLabel="Carregando"
          tooltipTitle="Qualidade"
        />
      </NextIntlClientProvider>
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByText("Consultas pausadas")).toBeNull();
    expect(screen.getByText("GREEN")).toBeTruthy();
  });
});
