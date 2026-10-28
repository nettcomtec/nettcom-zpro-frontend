import { describe, it, expect, afterEach, beforeAll } from "vitest";
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "../utils/dom-testing";
import { NextIntlClientProvider } from "next-intl";
import ptMessages from "@/i18n/locales/pt.json";
import { MessageBubble } from "@/components/atendimento/message-bubble";
import { readInstagramStoryReply } from "@/lib/instagram-story-reply";
import type { Message } from "@/stores/ticket-store";

const STORY_URL = "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1864&signature=abc";

const wrap = (ui: ReactElement) => (
  <NextIntlClientProvider locale="pt" messages={ptMessages}>
    {ui}
  </NextIntlClientProvider>
);

const message = (over: Partial<Message>): Message =>
  ({
    id: "m1",
    messageId: "aWdfZAG1",
    body: "Quanto custa esse modelo?",
    fromMe: false,
    mediaType: "text",
    read: true,
    ack: 0,
    createdAt: "2026-10-22T18:18:00.000Z",
    updatedAt: "2026-10-22T18:18:00.000Z",
    ticketId: 1,
    ...over,
  }) as unknown as Message;

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => cleanup());

describe("readInstagramStoryReply", () => {
  it("lê o formato do servidor e o do reparo por SQL (jsonb com espaços)", () => {
    const server = `{"igStoryReply":{"storyId":"18064068424605011","url":"${STORY_URL}"}}`;
    const jsonb = `{"igStoryReply": {"url": "${STORY_URL}", "storyId": "18064068424605011"}}`;
    expect(readInstagramStoryReply(server)).toEqual({ storyId: "18064068424605011", url: STORY_URL });
    expect(readInstagramStoryReply(jsonb)).toEqual({ storyId: "18064068424605011", url: STORY_URL });
  });

  it("link fora da CDN da Meta não vira link; id e link inválidos mantêm só a linha", () => {
    expect(readInstagramStoryReply(`{"igStoryReply":{"storyId":"1","url":"https://evil.example/x"}}`)).toEqual({ storyId: "1", url: null });
    expect(readInstagramStoryReply(`{"igStoryReply":{"storyId":"a b","url":"javascript:alert(1)"}}`)).toEqual({ storyId: null, url: null });
    expect(readInstagramStoryReply("texto-que-nao-e-json")).toBeNull();
    expect(readInstagramStoryReply(null)).toBeNull();
    expect(readInstagramStoryReply(`{"adReferral":{"kind":"ad"}}`)).toBeNull();
  });
});

describe("bolha da resposta a story", () => {
  it("mostra o texto do cliente, a linha do story e o link que abre em nova aba", () => {
    render(wrap(
      <MessageBubble
        message={message({ dataJson: `{"igStoryReply":{"storyId":"1806","url":"${STORY_URL}"}}` })}
        ticketId={1}
      />
    ));
    expect(screen.getByText("Quanto custa esse modelo?")).toBeTruthy();
    expect(screen.getByText("Respondeu ao seu story")).toBeTruthy();
    const link = screen.getByText("Ver story").closest("a") as HTMLAnchorElement;
    expect(link.href).toBe(STORY_URL);
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
  });

  it("a dica abre no clique e explica o prazo do link", () => {
    render(wrap(
      <MessageBubble
        message={message({ dataJson: `{"igStoryReply":{"storyId":"1806","url":"${STORY_URL}"}}` })}
        ticketId={1}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: ptMessages.regionSettings.moreInfo }));
    expect(screen.getByText(ptMessages.messageBubble.igStoryReplyHint)).toBeTruthy();
    expect(screen.getByText(ptMessages.messageBubble.igStoryReplyHintBot)).toBeTruthy();
  });

  it("eco da própria conta usa o texto do story do contato, sem a frase do chatbot", () => {
    render(wrap(
      <MessageBubble
        message={message({ fromMe: true, body: "Obrigado!", dataJson: `{"igStoryReply":{"storyId":"1806","url":"${STORY_URL}"}}` })}
        ticketId={1}
      />
    ));
    expect(screen.getByText("Resposta ao story do contato")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: ptMessages.regionSettings.moreInfo }));
    expect(screen.getByText(ptMessages.messageBubble.igStoryReplyHint)).toBeTruthy();
    expect(screen.queryByText(ptMessages.messageBubble.igStoryReplyHintBot)).toBeNull();
  });

  it("story sem link válido: linha sem \"Ver story\"", () => {
    render(wrap(
      <MessageBubble message={message({ dataJson: `{"igStoryReply":{"storyId":null,"url":null}}` })} ticketId={1} />
    ));
    expect(screen.getByText("Respondeu ao seu story")).toBeTruthy();
    expect(screen.queryByText("Ver story")).toBeNull();
  });

  it("anúncio e story juntos: os dois aparecem; sem story, nenhuma linha nova", () => {
    const both = `{"adReferral":{"kind":"ad","source":"ADS","adId":"123","adTitle":"Promo","ref":null,"photoUrl":null,"videoUrl":null},"igStoryReply":{"storyId":"1806","url":"${STORY_URL}"}}`;
    render(wrap(<MessageBubble message={message({ dataJson: both })} ticketId={1} />));
    expect(screen.getByText("Respondeu ao seu story")).toBeTruthy();
    expect(screen.getByText(/Promo/)).toBeTruthy();
    cleanup();
    render(wrap(<MessageBubble message={message({ dataJson: null as unknown as string })} ticketId={1} />));
    expect(screen.queryByText("Respondeu ao seu story")).toBeNull();
  });
});
