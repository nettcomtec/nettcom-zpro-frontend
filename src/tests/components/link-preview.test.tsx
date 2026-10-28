import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { act, type ReactElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "../utils/dom-testing";
import { NextIntlClientProvider } from "next-intl";
import ptMessages from "@/i18n/locales/pt.json";
import { LinkPreviewCard, resetLinkPreviewMemory } from "@/components/common/link-preview";
import { MessageContentView } from "@/components/atendimento/message-bubble";
import type { Message } from "@/stores/ticket-store";

// Link de pagamento com token: o tipo de endereço que a busca automática gastava.
const PAY_URL = "https://pay.example.com/c/abc123?token=xyz";
const CACHE_KEY = `lp_cache_${PAY_URL}`;
const HINT = "Para montar a prévia, o sistema acessa este endereço. Links de uso único (acesso, pagamento, confirmação) podem deixar de valer para quem os recebeu.";

const fetchMock = vi.fn();

const wrap = (ui: ReactElement) => (
  <NextIntlClientProvider locale="pt" messages={ptMessages}>
    {ui}
  </NextIntlClientProvider>
);

// Passa da espera de 150 ms que a versão anterior usava antes de buscar sozinha.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 400)); });

const previewResponse = (body: Record<string, unknown>) => ({ json: async () => body });
const PAY_PREVIEW = { url: PAY_URL, title: "Pagamento do pedido", hostname: "pay.example.com" };

const originalMatchMedia = window.matchMedia;

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  localStorage.clear();
  resetLinkPreviewMemory();
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

describe("LinkPreviewCard", () => {
  it("sem clique não acessa o link: mostra só o domínio e o botão", async () => {
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    await settle();
    expect(screen.getByText("pay.example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver prévia" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o domínio é o próprio link e abre em nova aba", async () => {
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    const link = screen.getByText("pay.example.com") as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(PAY_URL);
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("Ver prévia busca uma vez, mostra o card e guarda no navegador", async () => {
    fetchMock.mockResolvedValue(previewResponse(PAY_PREVIEW));
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    fireEvent.click(screen.getByRole("button", { name: "Ver prévia" }));
    await screen.findByText("Pagamento do pedido");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/link-preview?url=${encodeURIComponent(PAY_URL)}`);
    expect(localStorage.getItem(CACHE_KEY)).toContain("Pagamento do pedido");
  });

  it("prévia já guardada aparece direto, sem buscar", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: { url: PAY_URL, title: "Guardada", hostname: "pay.example.com" }, ts: Date.now() }));
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    expect(screen.getByText("Guardada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ver prévia" })).toBeNull();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prévia vazia guardada pela versão anterior volta a oferecer o botão", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: { url: PAY_URL, hostname: "pay.example.com" }, ts: Date.now() }));
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    await settle();
    expect(screen.getByRole("button", { name: "Ver prévia" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resposta sem título nem imagem avisa e não guarda", async () => {
    fetchMock.mockResolvedValue(previewResponse({ url: PAY_URL, hostname: "pay.example.com" }));
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    fireEvent.click(screen.getByRole("button", { name: "Ver prévia" }));
    await screen.findByText("Sem prévia para este endereço");
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("título que só repete o domínio (PDF de boleto, página sem título) não vira prévia", async () => {
    fetchMock.mockResolvedValue(previewResponse({ url: PAY_URL, title: "pay.example.com" }));
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    fireEvent.click(screen.getByRole("button", { name: "Ver prévia" }));
    await screen.findByText("Sem prévia para este endereço");
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("título que só começa com termo de erro continua valendo", async () => {
    fetchMock.mockResolvedValue(previewResponse({ url: PAY_URL, title: "500px - fotos", hostname: "pay.example.com" }));
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    fireEvent.click(screen.getByRole("button", { name: "Ver prévia" }));
    await screen.findByText("500px - fotos");
  });

  it("título de verdade que só difere do domínio na grafia continua valendo", async () => {
    fetchMock.mockResolvedValue(previewResponse({ url: "https://github.com", title: "GitHub.com", hostname: "github.com" }));
    render(wrap(<LinkPreviewCard url="https://github.com" />));
    fireEvent.click(screen.getByRole("button", { name: "Ver prévia" }));
    await screen.findByText("GitHub.com");
  });

  it("Sem prévia volta a oferecer o botão depois de 2 minutos (falha de rede não trava o link)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      render(wrap(<LinkPreviewCard url={PAY_URL} />));
      fireEvent.click(screen.getByRole("button", { name: "Ver prévia" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      expect(screen.getByText("Sem prévia para este endereço")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Ver prévia" })).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60 * 1000); });
      expect(screen.getByRole("button", { name: "Ver prévia" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("toque na tela (notebook com tela de toque, mouse como principal) também mostra o aviso antes", async () => {
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    const button = screen.getByRole("button", { name: "Ver prévia" });
    act(() => {
      const tap = new MouseEvent("click", { bubbles: true, cancelable: true });
      Object.defineProperty(tap, "pointerType", { value: "touch" });
      button.dispatchEvent(tap);
    });
    const confirm = await screen.findByRole("dialog");
    expect(within(confirm).getByText(HINT)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falha de rede avisa e não guarda", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    fireEvent.click(screen.getByRole("button", { name: "Ver prévia" }));
    await screen.findByText("Sem prévia para este endereço");
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("o mesmo link em duas bolhas (grafias diferentes): um clique carrega as duas e busca uma vez", async () => {
    fetchMock.mockResolvedValue(previewResponse(PAY_PREVIEW));
    render(wrap(
      <>
        <LinkPreviewCard url={PAY_URL} />
        <LinkPreviewCard url="https://Pay.Example.com/c/abc123?token=xyz" />
      </>,
    ));
    const [first] = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent === "Ver prévia");
    fireEvent.click(first);
    await settle();
    expect(document.body.textContent?.split("Pagamento do pedido").length).toBe(3);
    expect(screen.queryByRole("button", { name: "Ver prévia" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bolha que some durante a busca ainda guarda a prévia (o próximo clique não acessa de novo)", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    const first = render(wrap(<LinkPreviewCard url={PAY_URL} />));
    fireEvent.click(screen.getByRole("button", { name: "Ver prévia" }));
    first.unmount();
    await act(async () => { resolveFetch(previewResponse(PAY_PREVIEW)); });
    await settle();
    expect(localStorage.getItem(CACHE_KEY)).toContain("Pagamento do pedido");
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    expect(screen.getByText("Pagamento do pedido")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("duplo clique na prévia não chega à bolha (no chat interno ele responde a mensagem)", async () => {
    const onBubbleDoubleClick = vi.fn();
    render(wrap(<div onDoubleClick={onBubbleDoubleClick}><LinkPreviewCard url={PAY_URL} /></div>));
    const button = screen.getByRole("button", { name: "Ver prévia" });
    act(() => { button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); });
    expect(onBubbleDoubleClick).not.toHaveBeenCalled();
  });

  it("no celular (sem mouse) o 1º toque mostra o aviso e só a confirmação busca", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query === "(hover: none)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    fetchMock.mockResolvedValue(previewResponse(PAY_PREVIEW));
    render(wrap(<LinkPreviewCard url={PAY_URL} />));
    fireEvent.click(screen.getByRole("button", { name: "Ver prévia" }));
    const confirm = await screen.findByRole("dialog");
    expect(within(confirm).getByText(HINT)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Ver prévia" }));
    await screen.findByText("Pagamento do pedido");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("bolha do atendimento", () => {
  const message = {
    id: "m1",
    body: `Segue o link para pagamento: ${PAY_URL}`,
    mediaType: "chat",
    fromMe: true,
    isDeleted: false,
    ack: 2,
    createdAt: "2026-10-16T12:00:00.000Z",
  } as unknown as Message;

  it("mensagem com link não busca a prévia sozinha", async () => {
    render(wrap(<MessageContentView message={message} />));
    await settle();
    expect(screen.getByRole("button", { name: "Ver prévia" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abrir o link na janela também não busca; o Ver prévia da janela carrega a bolha junto", async () => {
    fetchMock.mockResolvedValue(previewResponse(PAY_PREVIEW));
    render(wrap(<MessageContentView message={message} />));
    const link = document.querySelector<HTMLAnchorElement>('p a[href^="https://pay.example.com"]');
    expect(link).toBeTruthy();
    fireEvent.click(link!);
    const dialog = await screen.findByRole("dialog");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(within(dialog).getByText(HINT)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Ver prévia" }));
    await within(dialog).findByText("Pagamento do pedido");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Ver prévia" })).toBeNull();
  });

  it("na janela, Sem prévia mantém o botão para tentar de novo", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(previewResponse(PAY_PREVIEW));
    render(wrap(<MessageContentView message={message} />));
    fireEvent.click(screen.getByText("pay.example.com"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Ver prévia" }));
    await within(dialog).findByText("Sem prévia para este endereço");
    fireEvent.click(within(dialog).getByRole("button", { name: "Ver prévia" }));
    await within(dialog).findByText("Pagamento do pedido");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clicar no domínio da bolha abre a janela, sem buscar", async () => {
    render(wrap(<MessageContentView message={message} />));
    fireEvent.click(screen.getByText("pay.example.com"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Ver prévia" })).toBeTruthy();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
