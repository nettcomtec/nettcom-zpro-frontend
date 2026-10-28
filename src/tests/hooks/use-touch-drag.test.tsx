import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "fs";
import path from "path";

import { useTouchDrag } from "@/hooks/use-touch-drag";

// Report de 14/10/2026 (PWA, Funil > Kanban): com mais de 4 ou 5 oportunidades a
// coluna nao rolava, porque o arrastar comecava no toque e o card tinha
// `touch-action: none`. Agora o arrastar so comeca segurando o dedo parado.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const onDrop = vi.fn();
const onEnd = vi.fn();
const onMove = vi.fn();

let root: Root | null = null;
let host: HTMLDivElement;

function Board() {
  const { touchStart } = useTouchDrag<string>({ dataAttr: "data-zone", onDrop, onEnd, onMove });
  return (
    <div>
      <div data-zone="a" data-testid="column" style={{ overflowY: "auto" }}>
        <div data-testid="card" onTouchStart={(e) => touchStart(e, "card-1")}>
          <span data-testid="inner">Oportunidade</span>
          {createPortal(<div data-testid="popover">Conversas</div>, document.body)}
        </div>
      </div>
      <div data-zone="b" data-testid="zone-b" />
    </div>
  );
}

function touchEvent(type: string, x: number, y: number, opts: { ended?: boolean; fingers?: number; cancelable?: boolean } = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: opts.cancelable ?? true });
  const touch = { identifier: 1, clientX: x, clientY: y };
  const extra = Array.from({ length: Math.max(0, (opts.fingers ?? 1) - 1) }, (_, i) => ({ identifier: 2 + i, clientX: 0, clientY: 0 }));
  const touches = opts.ended ? extra : [touch, ...extra];
  Object.defineProperty(ev, "touches", { value: touches });
  Object.defineProperty(ev, "targetTouches", { value: touches });
  Object.defineProperty(ev, "changedTouches", { value: [touch] });
  return ev;
}

const card = () => host.querySelector('[data-testid="inner"]') as HTMLElement;
const popover = () => document.querySelector('[data-testid="popover"]') as HTMLElement;
const ghosts = () => Array.from(document.body.children).filter((el) => el !== host && el !== popover());

function press(x = 10, y = 10) {
  act(() => {
    card().dispatchEvent(touchEvent("touchstart", x, y));
  });
}

function move(x: number, y: number) {
  const ev = touchEvent("touchmove", x, y);
  act(() => {
    card().dispatchEvent(ev);
  });
  return ev;
}

function release(x: number, y: number) {
  const ev = touchEvent("touchend", x, y, { ended: true });
  act(() => {
    card().dispatchEvent(ev);
  });
  return ev;
}

beforeEach(() => {
  vi.useFakeTimers();
  onDrop.mockReset();
  onEnd.mockReset();
  onMove.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Board />));
  // jsdom nao tem layout: o ponto do dedo cai sempre na etapa "b"
  document.elementFromPoint = () => host.querySelector('[data-testid="zone-b"]');
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("useTouchDrag", () => {
  it("toque rapido nao arrasta e deixa o clique acontecer", () => {
    press();
    vi.advanceTimersByTime(100);
    const end = release(10, 10);
    vi.advanceTimersByTime(500);
    expect(ghosts()).toHaveLength(0);
    expect(end.defaultPrevented).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("deslizar antes de segurar e rolagem: nada bloqueado e o card nao solta", () => {
    press(10, 10);
    vi.advanceTimersByTime(50);
    const first = move(10, 40);
    vi.advanceTimersByTime(500);
    const later = move(10, 120);
    release(10, 120);
    expect(first.defaultPrevented).toBe(false);
    expect(later.defaultPrevented).toBe(false);
    expect(ghosts()).toHaveLength(0);
    expect(onMove).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("tremida pequena durante a espera nao cancela", () => {
    press(10, 10);
    const shake = move(13, 14);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(shake.defaultPrevented).toBe(false);
    expect(ghosts()).toHaveLength(1);
  });

  it("segurar solta o card: bloqueia a rolagem so durante o arrastar e entrega na etapa", () => {
    press();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ghosts()).toHaveLength(1);
    const drag = move(200, 50);
    expect(drag.defaultPrevented).toBe(true);
    expect(onMove).toHaveBeenCalledWith(200, 50);
    const end = release(200, 50);
    expect(end.defaultPrevented).toBe(true);
    expect(ghosts()).toHaveLength(0);
    expect(onEnd).toHaveBeenCalledWith("card-1");
    expect(onDrop).toHaveBeenCalledWith("card-1", "b");
    // Toque seguinte volta a rolar normalmente
    press();
    const scroll = move(10, 60);
    expect(scroll.defaultPrevented).toBe(false);
  });

  it("toque cancelado pelo sistema limpa o card fantasma sem mover", () => {
    press();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => {
      card().dispatchEvent(touchEvent("touchcancel", 10, 10, { ended: true }));
    });
    expect(ghosts()).toHaveLength(0);
    expect(onEnd).toHaveBeenCalledWith("card-1");
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("menu do toque longo e arrastar nativo ficam bloqueados so durante o toque", () => {
    const fire = (type: string) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      card().dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    press();
    expect(fire("contextmenu")).toBe(true);
    expect(fire("dragstart")).toBe(true);
    release(10, 10);
    expect(fire("contextmenu")).toBe(false);
    expect(fire("dragstart")).toBe(false);
  });

  it("segundo dedo (zoom) durante a espera cancela o arrastar", () => {
    press();
    act(() => {
      card().dispatchEvent(touchEvent("touchmove", 10, 10, { fingers: 2 }));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(ghosts()).toHaveLength(0);
  });

  it("enquanto o card esta solto: card esmaecido e coluna sem rolagem; tudo volta no fim", () => {
    const column = host.querySelector('[data-testid="column"]') as HTMLElement;
    const source = host.querySelector('[data-testid="card"]') as HTMLElement;
    press();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(source.style.opacity).toBe("0.4");
    expect(column.style.overflow).toBe("hidden");
    expect((ghosts()[0] as HTMLElement).style.transition).toBe("none");
    release(200, 50);
    expect(source.style.opacity).toBe("");
    expect(column.style.overflow).toBe("");
  });

  it("clique logo depois de segurar e soltar e descartado (clique sintetico do iOS), toque novo libera", () => {
    const click = () => {
      const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
      card().dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    press();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    release(10, 10);
    expect(click()).toBe(true);
    // Toque rapido seguinte abre o card normalmente
    press();
    release(10, 10);
    expect(click()).toBe(false);
    // Sem toque novo, o descarte termina sozinho
    press();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    release(10, 10);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(click()).toBe(false);
  });

  it("fim do toque perdido (Android repete o id do dedo): o toque seguinte limpa e arrasta de novo", () => {
    press();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ghosts()).toHaveLength(1);
    // Mesmo id 1, sem touchend antes
    press();
    expect(ghosts()).toHaveLength(0);
    expect(onEnd).toHaveBeenCalledWith("card-1");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ghosts()).toHaveLength(1);
  });

  it("app em segundo plano no meio do arrastar cancela sem mover", () => {
    press();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    expect(ghosts()).toHaveLength(0);
    expect(onEnd).toHaveBeenCalledWith("card-1");
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("navegador ja rolando durante a espera (touchmove nao cancelavel) cancela o arrastar", () => {
    press();
    act(() => {
      card().dispatchEvent(touchEvent("touchmove", 11, 11, { cancelable: false }));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(ghosts()).toHaveLength(0);
  });

  it("segundo dedo durante o arrastar nao da zoom nem rola", () => {
    press();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const pinch = touchEvent("touchmove", 10, 10, { fingers: 2 });
    act(() => {
      popover().dispatchEvent(pinch);
    });
    expect(pinch.defaultPrevented).toBe(true);
    expect(ghosts()).toHaveLength(1);
  });

  it("segurar dentro de popover aberto a partir do card nao arrasta o card", () => {
    act(() => {
      popover().dispatchEvent(touchEvent("touchstart", 10, 10));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(ghosts()).toHaveLength(0);
    const ev = new Event("contextmenu", { bubbles: true, cancelable: true });
    popover().dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("cards das 3 telas nao voltam a usar touch-none (bloqueia a rolagem por toque)", () => {
    const pages = ["funil/kanban/page.tsx", "kanban/board/page.tsx", "tarefas/page.tsx"];
    for (const page of pages) {
      const src = readFileSync(path.resolve(__dirname, "../../app/(dashboard)", page), "utf8");
      expect(src, page).toContain("useTouchDrag");
      expect(src, page).not.toContain("touch-none");
    }
  });

  it("card fantasma some se a tela fecha no meio do arrastar", () => {
    press();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ghosts()).toHaveLength(1);
    act(() => root?.unmount());
    root = null;
    expect(ghosts()).toHaveLength(0);
  });
});
