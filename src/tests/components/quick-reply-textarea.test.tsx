import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { useState } from "react";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "../utils/dom-testing";
import { NextIntlClientProvider } from "next-intl";
import ptMessages from "@/i18n/locales/pt.json";
import { QuickReplyTextarea, type QuickReplyVarWarningsContext } from "@/components/quick-replies/quick-reply-textarea";
import type { FastReply } from "@/services/fast-reply";

const row = (over: Partial<FastReply>): FastReply => ({
  id: 1,
  key: "oi",
  message: "Olá",
  isPublic: true,
  userId: 1,
  tenantId: 1,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const REPLIES: FastReply[] = [
  row({ id: 1, key: "/bomdia", message: "Bom dia, {{name}}!" }),
  row({ id: 2, key: "boleto", message: "Segue o boleto.", mediasJson: '["boleto.pdf"]' }),
  row({ id: 3, key: "botoes", message: "Escolha", messageType: "buttons" }),
  row({ id: 4, key: "tpl", message: "", messageType: "template", templateJson: '{"name":"x","language":"pt_BR"}' }),
];

let lastValue = "";
function Harness({ initial = "", warnings = null }: { initial?: string; warnings?: QuickReplyVarWarningsContext | null }) {
  const [value, setValue] = useState(initial);
  lastValue = value;
  return (
    <NextIntlClientProvider locale="pt" messages={ptMessages}>
      <QuickReplyTextarea value={value} onChange={setValue} quickReplies={REPLIES} warnings={warnings} />
    </NextIntlClientProvider>
  );
}

const textarea = () => screen.getByRole("combobox") as HTMLTextAreaElement;
const options = () => Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
const type = (value: string) => fireEvent.change(textarea(), { target: { value } });
const focus = () => act(() => textarea().focus());

beforeAll(() => {
  Element.prototype.scrollIntoView = function () {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  lastValue = "";
});

describe("QuickReplyTextarea", () => {
  it("abre ao digitar /, lista só as rápidas de texto e filtra pelo atalho", () => {
    render(<Harness />);
    focus();
    type("/");
    expect(options().map((o) => o.textContent)).toEqual([
      expect.stringContaining("/bomdia"),
      expect.stringContaining("/boleto"),
    ]);
    type("/bol");
    expect(options()).toHaveLength(1);
    expect(options()[0].textContent).toContain("/boleto");
  });

  it("Enter com a busca vazia não escolhe; Tab troca só o /atalho e preserva o resto", async () => {
    render(<Harness />);
    focus();
    type("/");
    fireEvent.keyDown(textarea(), { key: "Enter" });
    expect(lastValue).toBe("/");
    expect(options().length).toBeGreaterThan(0);
    type("Link https://t.me/x /bom");
    fireEvent.keyDown(textarea(), { key: "Tab" });
    expect(lastValue).toBe("Link https://t.me/x Bom dia, {{name}}!");
    expect(options()).toHaveLength(0);
  });

  it("Enter escolhe depois de digitar e ↓ muda o destaque", () => {
    render(<Harness />);
    focus();
    type("/bo");
    fireEvent.keyDown(textarea(), { key: "ArrowDown" });
    fireEvent.keyDown(textarea(), { key: "Enter" });
    expect(lastValue).toBe("Segue o boleto.");
    expect(screen.queryByText(/Os arquivos desta mensagem rápida não vão/)).not.toBeNull();
  });

  it("Esc fecha só a lista (o Esc não chega ao document) e não reabre até a busca mudar", () => {
    let documentEsc = 0;
    const onDocEsc = (e: KeyboardEvent) => { if (e.key === "Escape") documentEsc++; };
    document.addEventListener("keydown", onDocEsc, true);
    try {
      render(<Harness />);
      focus();
      type("/b");
      expect(options().length).toBeGreaterThan(0);
      fireEvent.keyDown(textarea(), { key: "Escape" });
      expect(documentEsc).toBe(0);
      expect(options()).toHaveLength(0);
      type("/b");
      expect(options()).toHaveLength(0);
      type("/bo");
      expect(options().length).toBeGreaterThan(0);
      // Sem lista aberta o Esc segue para o diálogo
      type("texto");
      fireEvent.keyDown(textarea(), { key: "Escape" });
      expect(documentEsc).toBe(1);
    } finally {
      document.removeEventListener("keydown", onDocEsc, true);
    }
  });

  it("o botão abre a lista sem focar o campo e insere no fim com espaço", () => {
    render(<Harness initial="Convite: https://t.me/x" />);
    fireEvent.click(screen.getByRole("button", { name: "Mensagens rápidas (/)" }));
    expect(document.activeElement).not.toBe(textarea());
    expect(options()).toHaveLength(2);
    fireEvent.click(options()[0]);
    expect(lastValue).toBe("Convite: https://t.me/x Bom dia, {{name}}!");
    expect(document.activeElement).not.toBe(textarea());
  });

  it("aberta pelo botão: Esc fecha só a lista e voltar ao campo fecha a lista", () => {
    let documentEsc = 0;
    const onDocEsc = (e: KeyboardEvent) => { if (e.key === "Escape") documentEsc++; };
    document.addEventListener("keydown", onDocEsc, true);
    try {
      render(<Harness initial="abc" />);
      const button = screen.getByRole("button", { name: "Mensagens rápidas (/)" });
      fireEvent.click(button);
      expect(options()).toHaveLength(2);
      // Safari não foca o botão: o Esc sai do body
      act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
      expect(documentEsc).toBe(0);
      expect(options()).toHaveLength(0);
      // Com o botão focado (Chrome/Firefox)
      act(() => button.focus());
      fireEvent.click(button);
      fireEvent.keyDown(button, { key: "Escape" });
      expect(documentEsc).toBe(0);
      expect(options()).toHaveLength(0);
      // Voltar a escrever fecha a lista aberta pelo botão; Tab não escolhe nada
      fireEvent.click(button);
      expect(options()).toHaveLength(2);
      focus();
      expect(options()).toHaveLength(0);
      fireEvent.keyDown(textarea(), { key: "Tab" });
      expect(lastValue).toBe("abc");
    } finally {
      document.removeEventListener("keydown", onDocEsc, true);
    }
  });

  it("mostra os avisos de variável conforme o contexto", () => {
    render(<Harness initial="Oi {{name}}, sou {{user}} #{{protocol}}" warnings={{ contactKnown: false, ownerKnown: false, ticketVarsEmpty: true, channel: "phone" }} />);
    expect(screen.queryByText(/\{\{name\}\} vem do cadastro do contato/)).not.toBeNull();
    expect(screen.queryByText(/\{\{user\}\} vai sair vazio/)).not.toBeNull();
    expect(screen.queryByText(/\{\{protocol\}\} sai vazio neste envio/)).not.toBeNull();
  });

  it("não abre por / no meio de link nem sem rápida que case", () => {
    render(<Harness />);
    focus();
    type("https://x.test/bom");
    expect(options()).toHaveLength(0);
    type("/zzz");
    expect(options()).toHaveLength(0);
  });
});
