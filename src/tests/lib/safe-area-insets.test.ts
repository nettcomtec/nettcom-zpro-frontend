import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { cleanup, render } from "../utils/dom-testing";
import {
  NO_SAFE_AREA_INSETS,
  readSafeAreaInsets,
  useSafeAreaCollisionPadding,
  withSafeAreaPadding,
} from "@/lib/safe-area-insets";

/**
 * Faixa dos botões do Android no app (lib/safe-area-insets.ts): os menus flutuantes descontam
 * a faixa do sistema; sem faixa (computador) o `collisionPadding` sai como a tela pediu.
 */

function mockProbePadding(padding: { top?: string; right?: string; bottom?: string; left?: string }) {
  const real = window.getComputedStyle.bind(window);
  return vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
    if (el instanceof HTMLElement && el.hasAttribute("data-zpro-safe-area-probe")) {
      return {
        paddingTop: padding.top ?? "0px",
        paddingRight: padding.right ?? "0px",
        paddingBottom: padding.bottom ?? "0px",
        paddingLeft: padding.left ?? "0px",
      } as CSSStyleDeclaration;
    }
    return real(el, pseudo);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let lastPadding: unknown;
function PaddingProbe({ padding }: { padding?: number }) {
  lastPadding = useSafeAreaCollisionPadding(padding);
  return null;
}

describe("soma da faixa ao collisionPadding", () => {
  it("sem faixa devolve o valor recebido, sem tocar", () => {
    expect(withSafeAreaPadding(undefined, NO_SAFE_AREA_INSETS)).toBeUndefined();
    expect(withSafeAreaPadding(8, NO_SAFE_AREA_INSETS)).toBe(8);
    const obj = { bottom: 4 };
    expect(withSafeAreaPadding(obj, { top: 0, right: 0, bottom: 0, left: 0 })).toBe(obj);
  });

  it("com faixa soma em cada lado", () => {
    const insets = { top: 24, right: 0, bottom: 48, left: 0 };
    expect(withSafeAreaPadding(undefined, insets)).toEqual({ top: 24, right: 0, bottom: 48, left: 0 });
    expect(withSafeAreaPadding(8, insets)).toEqual({ top: 32, right: 8, bottom: 56, left: 8 });
    expect(withSafeAreaPadding({ bottom: 10 }, insets)).toEqual({ top: 24, right: 0, bottom: 58, left: 0 });
  });

  it("valor inválido do lado conta como 0", () => {
    const insets = { top: 0, right: 0, bottom: 48, left: 0 };
    expect(withSafeAreaPadding({ bottom: Number.NaN }, insets)).toEqual({ top: 0, right: 0, bottom: 48, left: 0 });
  });
});

describe("leitura da faixa", () => {
  it("lê o padding do elemento de medida", () => {
    mockProbePadding({ top: "24px", bottom: "47.5px" });
    expect(readSafeAreaInsets()).toEqual({ top: 24, right: 0, bottom: 47.5, left: 0 });
    expect(document.querySelectorAll("[data-zpro-safe-area-probe]")).toHaveLength(1);
  });

  it("sem faixa, ilegível ou negativo devolve tudo 0", () => {
    mockProbePadding({ top: "", bottom: "-3px", left: "abc" });
    expect(readSafeAreaInsets()).toBe(NO_SAFE_AREA_INSETS);
  });

  it("erro na leitura nunca lança", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(readSafeAreaInsets()).toBe(NO_SAFE_AREA_INSETS);
  });

  it("o hook acompanha a mudança de tamanho da janela", () => {
    const spy = mockProbePadding({ bottom: "48px" });
    const { unmount } = render(createElement(PaddingProbe, { padding: 8 }));
    expect(lastPadding).toEqual({ top: 8, right: 8, bottom: 56, left: 8 });

    spy.mockRestore();
    mockProbePadding({ right: "48px" });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(lastPadding).toEqual({ top: 8, right: 56, bottom: 8, left: 8 });

    vi.restoreAllMocks();
    mockProbePadding({});
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(lastPadding).toBe(8);
    unmount();
  });
});
