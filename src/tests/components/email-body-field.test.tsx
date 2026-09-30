import { describe, it, expect, vi, afterEach } from "vitest";
import { act, useState, type ChangeEvent } from "react";
import { cleanup, fireEvent, render, screen } from "../utils/dom-testing";
import {
  createBlock,
  createEmptyDesign,
  insertBlock,
  renderEmailHtml,
  type EmailDesign,
} from "@/lib/email-design";
import type { EmailEditorCapabilities } from "@/services/email-marketing";
import type { VisualEmailDialogProps } from "@/components/email-marketing/visual/visual-email-dialog";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

// Editor clássico (TipTap) trocado por um textarea: o que importa aqui é o value/onChange
vi.mock("@/components/email-marketing/email-html-editor", async () => {
  const React = await import("react");
  return {
    EMAIL_VARIABLES: ["firstName"],
    EmailHtmlEditor: ({ value, onChange }: { value: string; onChange: (html: string) => void }) =>
      React.createElement("textarea", {
        "aria-label": "classic-html",
        value,
        onChange: (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
      }),
  };
});

// A janela visual vira um marcador com o design recebido e um "Aplicar" de mentira
vi.mock("next/dynamic", async () => {
  const React = await import("react");
  const lib = await import("@/lib/email-design");
  function VisualDialogMock(props: VisualEmailDialogProps) {
    if (!props.open) return null;
    const applied = lib.insertBlock(lib.createEmptyDesign(), lib.createBlock("text", { text: "Aplicado" }));
    return React.createElement(
      "div",
      {
        "data-testid": "visual-dialog",
        "data-blocks": props.initialDesign ? String(props.initialDesign.blocks.length) : "null",
      },
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            props.onApply(applied, "<p>aplicado</p>");
            props.onOpenChange(false);
          },
        },
        "apply-visual"
      ),
      React.createElement("button", { type: "button", onClick: () => props.onOpenChange(false) }, "close-visual")
    );
  }
  return { default: () => VisualDialogMock };
});

import { EmailBodyField, type EmailBodyFieldSeed } from "@/components/email-marketing/email-body-field";

afterEach(() => {
  cleanup();
});

const DESIGN_ON: EmailEditorCapabilities = { design: true, assetBaseUrl: null };

function seededDesign(): EmailDesign {
  return insertBlock(createEmptyDesign(), createBlock("heading", { heading: "Oferta" }));
}

function renderField(options: { html: string; seed?: EmailBodyFieldSeed; capabilities?: EmailEditorCapabilities | null }) {
  const probe = { html: options.html };
  function Harness() {
    const [html, setHtml] = useState(options.html);
    probe.html = html;
    return (
      <EmailBodyField
        value={html}
        onChange={setHtml}
        seed={options.seed}
        capabilities={options.capabilities === undefined ? DESIGN_ON : options.capabilities}
      />
    );
  }
  render(<Harness />);
  return probe;
}

describe("EmailBodyField", () => {
  it("sem capacidade de design não oferece o editor visual", () => {
    renderField({ html: "", capabilities: null });
    expect(screen.queryByRole("button", { name: "openVisual" })).toBeNull();
    renderField({ html: "", capabilities: { design: false, assetBaseUrl: null } });
    expect(screen.queryByRole("button", { name: "openVisual" })).toBeNull();
  });

  it("abre direto o design semeado enquanto o HTML é o do modelo", () => {
    const design = seededDesign();
    renderField({ html: renderEmailHtml(design), seed: { design, nonce: 1 } });

    fireEvent.click(screen.getByRole("button", { name: "openVisual" }));

    expect(screen.queryByText("replaceTitle")).toBeNull();
    expect(screen.getByTestId("visual-dialog").dataset.blocks).toBe("1");
  });

  it("editar o HTML no clássico desliga o design e o visual pede para substituir", () => {
    const design = seededDesign();
    renderField({ html: renderEmailHtml(design), seed: { design, nonce: 1 } });

    fireEvent.change(screen.getByLabelText("classic-html"), { target: { value: "<p>editado à mão</p>" } });
    fireEvent.click(screen.getByRole("button", { name: "openVisual" }));

    expect(screen.queryByTestId("visual-dialog")).toBeNull();
    expect(screen.getByText("replaceTitle")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "replaceConfirm" }));
    // abre do zero (design vazio), sem reaproveitar o projeto desligado
    expect(screen.getByTestId("visual-dialog").dataset.blocks).toBe("0");
  });

  it("aplicar grava o HTML e reabre o mesmo projeto sem confirmar", () => {
    const probe = renderField({ html: "" });

    // corpo vazio: abre sem confirmação
    fireEvent.click(screen.getByRole("button", { name: "openVisual" }));
    expect(screen.getByTestId("visual-dialog").dataset.blocks).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "apply-visual" }));
    expect(probe.html).toBe("<p>aplicado</p>");
    expect(screen.queryByTestId("visual-dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "openVisual" }));
    expect(screen.queryByText("replaceTitle")).toBeNull();
    expect(screen.getByTestId("visual-dialog").dataset.blocks).toBe("1");
  });

  it("nova semeadura (nonce) troca o projeto; semear null desliga", () => {
    const first = seededDesign();
    const html = renderEmailHtml(first);
    const probe = { setSeed: (_seed: EmailBodyFieldSeed) => {} };
    function Harness() {
      const [seed, setSeed] = useState<EmailBodyFieldSeed>({ design: first, nonce: 1 });
      probe.setSeed = setSeed;
      return <EmailBodyField value={html} onChange={() => {}} seed={seed} capabilities={DESIGN_ON} />;
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "openVisual" }));
    expect(screen.getByTestId("visual-dialog").dataset.blocks).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "close-visual" }));

    // campanha carregada (sem projeto): mesma string de HTML, mas o design sai
    act(() => probe.setSeed({ design: null, nonce: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "openVisual" }));
    expect(screen.getByText("replaceTitle")).toBeInTheDocument();
  });
});
