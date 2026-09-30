import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Utilitário mínimo de teste de componente, só com React + DOM nativo.
 *
 * O @testing-library/react 16 exige o peer @testing-library/dom, que NÃO está nas
 * dependências do projeto — e o zip distribuído não leva package-lock (toda VPS resolve
 * versões ao vivo no update; ver CLAUDE.md "Distribuição"). Em vez de acrescentar
 * dependência, este arquivo cobre o subconjunto de consultas usado nos testes do editor
 * de e-mail: render/cleanup, getBy/queryBy/findBy por papel, texto, rótulo e testid,
 * within, fireEvent (click/change/pointerDown/keyDown) e waitFor.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export type TextMatcher = string | RegExp;

interface Mounted {
  root: Root;
  container: HTMLElement;
}

const mounted: Mounted[] = [];

const normalize = (value: string | null | undefined): string => (value || "").replace(/\s+/g, " ").trim();

const matches = (value: string, matcher: TextMatcher): boolean =>
  typeof matcher === "string" ? value === matcher : matcher.test(value);

function accessibleName(el: Element): string {
  const label = el.getAttribute("aria-label");
  if (label) return normalize(label);
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    return normalize(
      labelledBy
        .split(/\s+/)
        .map(id => el.ownerDocument.getElementById(id)?.textContent || "")
        .join(" ")
    );
  }
  if (el instanceof HTMLInputElement && (el.type === "button" || el.type === "submit")) return normalize(el.value);
  return normalize(el.textContent);
}

const ROLE_SELECTORS: Record<string, string> = {
  button: 'button, [role="button"], input[type="button"], input[type="submit"]',
  textbox: 'input:not([type]), input[type="text"], input[type="url"], input[type="email"], textarea, [role="textbox"]',
  dialog: '[role="dialog"], [role="alertdialog"]',
  menuitem: '[role="menuitem"]',
  checkbox: 'input[type="checkbox"], [role="checkbox"]',
  combobox: 'select, [role="combobox"]'
};

const FORM_CONTROL = "input, textarea, select";

function queryAllByRole(scope: ParentNode, role: string, options: { name?: TextMatcher } = {}): HTMLElement[] {
  const selector = ROLE_SELECTORS[role] || `[role="${role}"]`;
  return Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter(
    el => options.name === undefined || matches(accessibleName(el), options.name)
  );
}

/** Menor elemento cujo texto casa (não devolve os ancestrais que só o contêm) */
function queryAllByText(scope: ParentNode, text: TextMatcher): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>("*")).filter(el => {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return false;
    if (!matches(normalize(el.textContent), text)) return false;
    return !Array.from(el.children).some(child => matches(normalize(child.textContent), text));
  });
}

function queryAllByLabelText(scope: ParentNode, text: TextMatcher): HTMLElement[] {
  const results = new Set<HTMLElement>();
  scope.querySelectorAll<HTMLLabelElement>("label").forEach(label => {
    if (!matches(normalize(label.textContent), text)) return;
    const target = label.htmlFor
      ? label.ownerDocument.getElementById(label.htmlFor)
      : label.querySelector<HTMLElement>(FORM_CONTROL);
    if (target) results.add(target as HTMLElement);
  });
  scope.querySelectorAll<HTMLElement>(`${FORM_CONTROL.split(", ").map(tag => `${tag}[aria-label]`).join(", ")}`).forEach(el => {
    if (matches(normalize(el.getAttribute("aria-label")), text)) results.add(el);
  });
  return Array.from(results);
}

function single<T>(items: T[], description: string): T {
  if (items.length === 0) throw new Error(`Elemento não encontrado: ${description}`);
  if (items.length > 1) throw new Error(`Mais de um elemento para: ${description} (${items.length})`);
  return items[0];
}

const describeMatcher = (matcher: TextMatcher | undefined): string => (matcher === undefined ? "" : String(matcher));

export async function waitFor<T>(
  callback: () => T,
  { timeout = 2000, interval = 20 }: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown = new Error("waitFor: tempo esgotado");
  while (Date.now() - startedAt < timeout) {
    try {
      let result: T | undefined;
      await act(async () => {
        result = callback();
      });
      return result as T;
    } catch (error) {
      lastError = error;
    }
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, interval));
    });
  }
  throw lastError;
}

export function within(scope: ParentNode) {
  return {
    getByRole: (role: string, options?: { name?: TextMatcher }) =>
      single(queryAllByRole(scope, role, options), `papel ${role} ${describeMatcher(options?.name)}`),
    queryByRole: (role: string, options?: { name?: TextMatcher }): HTMLElement | null =>
      queryAllByRole(scope, role, options)[0] ?? null,
    getByText: (text: TextMatcher) => single(queryAllByText(scope, text), `texto ${describeMatcher(text)}`),
    queryByText: (text: TextMatcher): HTMLElement | null => queryAllByText(scope, text)[0] ?? null,
    getByLabelText: (text: TextMatcher) => single(queryAllByLabelText(scope, text), `rótulo ${describeMatcher(text)}`),
    getByTestId: (id: string) =>
      single(Array.from(scope.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)), `testid ${id}`),
    queryByTestId: (id: string): HTMLElement | null => scope.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    findByText: (text: TextMatcher) =>
      waitFor(() => single(queryAllByText(scope, text), `texto ${describeMatcher(text)}`)),
    findByRole: (role: string, options?: { name?: TextMatcher }) =>
      waitFor(() => single(queryAllByRole(scope, role, options), `papel ${role} ${describeMatcher(options?.name)}`))
  };
}

export const screen = within(document.body);

export function render(ui: ReactElement): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    }
  };
}

export function cleanup(): void {
  while (mounted.length) {
    const { root, container } = mounted.pop() as Mounted;
    act(() => root.unmount());
    container.remove();
  }
  document.body.innerHTML = "";
}

const nativeValueSetter = (el: Element): ((value: string) => void) | undefined => {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, "value")?.set;
};

export const fireEvent = {
  click(el: Element): void {
    act(() => {
      (el as HTMLElement).click();
    });
  },
  /** React escuta `input` em campos de texto; o setter nativo é necessário para o React ver a mudança */
  change(el: Element, init: { target: { value?: string; files?: File[] } }): void {
    act(() => {
      if (init.target.files) {
        Object.defineProperty(el, "files", { configurable: true, value: init.target.files });
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      nativeValueSetter(el)?.call(el, init.target.value ?? "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  },
  pointerDown(el: Element, init: MouseEventInit & { pointerType?: string } = {}): void {
    act(() => {
      const { pointerType, ...mouseInit } = init;
      const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, ...mouseInit });
      if (pointerType) Object.defineProperty(event, "pointerType", { value: pointerType });
      el.dispatchEvent(event);
    });
  },
  keyDown(el: Element, init: KeyboardEventInit): void {
    act(() => {
      el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    });
  }
};
