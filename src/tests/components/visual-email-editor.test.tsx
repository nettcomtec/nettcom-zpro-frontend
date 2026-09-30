import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "../utils/dom-testing";
import {
  createBlock,
  createEmptyDesign,
  insertBlock,
  serializeDesignFile,
  type EmailBlock,
  type EmailDesign,
} from "@/lib/email-design";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/services/email-marketing", () => ({
  uploadEmailAsset: vi.fn(),
  readApiError: () => ({}),
}));
vi.mock("@/services/gallery", () => ({ fetchGalleryBlob: vi.fn() }));
vi.mock("@/components/gallery/gallery-picker-with-upload-dialog", () => ({
  GalleryPickerWithUploadDialog: () => null,
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { hasPermission: (key: string) => boolean }) => unknown) =>
    selector({ hasPermission: () => false }),
}));
vi.mock("@/components/email-marketing/email-html-editor", () => ({
  EMAIL_VARIABLES: ["name", "firstName", "email"],
  EmailHtmlEditor: () => null,
}));

import { toast } from "sonner";
import {
  VisualEmailEditor,
  type VisualEmailEditorStatus,
} from "@/components/email-marketing/visual/visual-email-editor";

// jsdom não tem ResizeObserver/scrollIntoView (usados por menus e pelo scroll do bloco novo)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  // Layout de computador: painel de propriedades na coluna (sem o Sheet do celular)
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width: 1024px"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  vi.clearAllMocks();
});

function designWith(...blocks: EmailBlock[]): EmailDesign {
  return blocks.reduce<EmailDesign>((design, block) => insertBlock(design, block), createEmptyDesign());
}

function renderEditor(initial: EmailDesign) {
  const probe: { design: EmailDesign; status: VisualEmailEditorStatus | null } = { design: initial, status: null };
  function Harness() {
    const [design, setDesign] = useState(initial);
    probe.design = design;
    return (
      <VisualEmailEditor
        value={design}
        onChange={setDesign}
        capabilities={null}
        onStatusChange={status => {
          probe.status = status;
        }}
      />
    );
  }
  const utils = render(<Harness />);
  return { ...utils, probe };
}

const blockCards = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>("[data-block-id]"));
const cardOf = (container: HTMLElement, id: string) => container.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
const types = (design: EmailDesign) => design.blocks.map(block => block.type);
const textOf = (block: EmailBlock) => ("text" in block ? block.text : "");

describe("VisualEmailEditor", () => {
  it("adiciona bloco pela paleta logo após o selecionado", () => {
    const { probe, container } = renderEditor(createEmptyDesign());

    fireEvent.click(screen.getByRole("button", { name: "blockHeading" }));
    expect(types(probe.design)).toEqual(["heading"]);
    expect(textOf(probe.design.blocks[0])).toBe("newHeading");

    // o bloco novo fica selecionado: o próximo entra logo depois dele
    fireEvent.click(screen.getByRole("button", { name: "blockText" }));
    expect(types(probe.design)).toEqual(["heading", "text"]);

    // seleciona o título e adiciona um botão: entra na 2ª posição
    fireEvent.click(within(blockCards(container)[0]).getByRole("button", { name: /^blockHeading/ }));
    fireEvent.click(screen.getByRole("button", { name: "blockButton" }));
    expect(types(probe.design)).toEqual(["heading", "button", "text"]);
  });

  it("sobe e desce blocos pelas setas", () => {
    const heading = createBlock("heading", { heading: "A" });
    const text = createBlock("text", { text: "B" });
    const { probe, container } = renderEditor(designWith(heading, text));

    fireEvent.click(within(cardOf(container, heading.id)).getByRole("button", { name: "moveDown" }));
    expect(probe.design.blocks.map(block => block.id)).toEqual([text.id, heading.id]);

    fireEvent.click(within(cardOf(container, heading.id)).getByRole("button", { name: "moveUp" }));
    expect(probe.design.blocks.map(block => block.id)).toEqual([heading.id, text.id]);
    expect(within(cardOf(container, heading.id)).getByRole("button", { name: "moveUp" })).toBeDisabled();
  });

  it("duplica e exclui blocos", () => {
    const heading = createBlock("heading", { heading: "Oferta" });
    const { probe, container } = renderEditor(designWith(heading));

    fireEvent.click(within(cardOf(container, heading.id)).getByRole("button", { name: "duplicate" }));
    expect(probe.design.blocks).toHaveLength(2);
    const [original, copy] = probe.design.blocks;
    expect(original.id).toBe(heading.id);
    expect(copy.id).not.toBe(heading.id);
    expect(copy.type).toBe("heading");
    expect(textOf(copy)).toBe("Oferta");

    fireEvent.click(within(cardOf(container, copy.id)).getByRole("button", { name: "delete" }));
    expect(probe.design.blocks.map(block => block.id)).toEqual([heading.id]);
  });

  it("desfaz e refaz, com a digitação agrupada num passo só", () => {
    const { probe } = renderEditor(createEmptyDesign());
    const undoButton = screen.getByRole("button", { name: "editorUndo" });
    const redoButton = screen.getByRole("button", { name: "editorRedo" });
    expect(undoButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "blockText" }));
    expect(probe.design.blocks).toHaveLength(1);

    const textarea = screen.getByLabelText("content") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "O" } });
    fireEvent.change(textarea, { target: { value: "Ol" } });
    fireEvent.change(textarea, { target: { value: "Olá" } });
    expect(textOf(probe.design.blocks[0])).toBe("Olá");

    fireEvent.click(undoButton);
    expect(textOf(probe.design.blocks[0])).toBe("newText");
    fireEvent.click(undoButton);
    expect(probe.design.blocks).toHaveLength(0);
    expect(undoButton).toBeDisabled();

    fireEvent.click(redoButton);
    expect(probe.design.blocks).toHaveLength(1);
    fireEvent.click(redoButton);
    expect(textOf(probe.design.blocks[0])).toBe("Olá");
    expect(redoButton).toBeDisabled();
  });

  it("insere a variável na posição do cursor do campo de texto", async () => {
    const text = createBlock("text", { text: "abcdef" });
    const { probe, container } = renderEditor(designWith(text));

    fireEvent.click(within(cardOf(container, text.id)).getByRole("button", { name: /^blockText/ }));
    const textarea = screen.getByLabelText("content") as HTMLTextAreaElement;
    act(() => {
      textarea.focus();
      textarea.setSelectionRange(3, 3);
    });

    // o menu do Radix abre no pointerdown (botão principal, sem Ctrl)
    fireEvent.pointerDown(screen.getByRole("button", { name: "editorVariables" }), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(await screen.findByText("{{firstName}}"));

    expect(textOf(probe.design.blocks[0])).toBe("abc{{firstName}}def");
  });

  it("conta as pendências e avisa o pai", async () => {
    const button = createBlock("button", { button: "Comprar" });
    const { probe, container } = renderEditor(designWith(button, createBlock("text", { text: "" })));

    // botão sem link + texto vazio
    await waitFor(() => expect(probe.status?.issues).toBe(2));
    expect(probe.status!.bytes).toBeGreaterThan(0);

    fireEvent.click(within(cardOf(container, button.id)).getByRole("button", { name: /^blockButton/ }));
    fireEvent.change(screen.getByLabelText("buttonUrl"), { target: { value: "https://exemplo.com.br/oferta" } });
    await waitFor(() => expect(probe.status?.issues).toBe(1));
    expect(probe.design.blocks[0]).toMatchObject({ href: "https://exemplo.com.br/oferta" });

    // link sem esquema não entra no design: o bloco volta a ficar pendente
    fireEvent.change(screen.getByLabelText("buttonUrl"), { target: { value: "exemplo" } });
    await waitFor(() => expect(probe.status?.issues).toBe(2));
    expect(probe.design.blocks[0]).toMatchObject({ href: "" });
  });

  it("recusa importação de arquivo inválido com mensagem", async () => {
    const { probe, container } = renderEditor(createEmptyDesign());
    const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*="json"]')!;
    const file = new File(["isto não é um projeto"], "projeto.json", { type: "application/json" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("importError"));
    expect(probe.design.blocks).toHaveLength(0);
  });

  it("importa projeto válido e confirma antes de substituir o conteúdo", async () => {
    const current = createBlock("heading", { heading: "Atual" });
    const { probe, container } = renderEditor(designWith(current));
    const incoming = designWith(createBlock("text", { text: "Importado" }), createBlock("divider"));
    const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*="json"]')!;

    fireEvent.change(input, {
      target: { files: [new File([serializeDesignFile(incoming)], "projeto.json", { type: "application/json" })] },
    });

    fireEvent.click(await screen.findByRole("button", { name: "replaceConfirm" }));
    expect(types(probe.design)).toEqual(["text", "divider"]);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
