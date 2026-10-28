"use client";
import { useEffect, useRef } from "react";

// Segurar o dedo parado por este tempo solta o card para arrastar; mexer antes
// disso e rolagem normal (coluna, quadro e pagina). Ate 2026-10-14 o arrastar
// comecava no toque e o card tinha `touch-action: none`: com a coluna cheia de
// cards nao havia onde por o dedo para rolar.
const LONG_PRESS_MS = 300;
// Quanto o dedo pode tremer durante a espera sem virar rolagem.
const MOVE_TOLERANCE_PX = 8;
// O iOS dispara um clique sintetico ao fim do toque longo mesmo com o touchend
// cancelado; o clique que chegar logo depois do arrastar e descartado.
const CLICK_GUARD_MS = 400;

function findDropZone(el: Element | null, attr: string): string | null {
  let node: Element | null = el;
  while (node) {
    const val = node.getAttribute(attr);
    if (val !== null) return val;
    node = node.parentElement;
  }
  return null;
}

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i];
  }
  return null;
}

// Enquanto o card esta solto, as areas de rolagem em volta dele param: no iOS
// so o 1o touchmove do toque decide se a rolagem nativa espera a pagina, e um
// tremor durante a espera deixaria a coluna rolar junto com o card. O
// `scrollLeft +=` do auto-scroll de borda continua funcionando com overflow hidden.
function lockScrollAncestors(from: HTMLElement): () => void {
  const locked: { el: HTMLElement; overflow: string }[] = [];
  for (let el = from.parentElement; el; el = el.parentElement) {
    const cs = window.getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
      locked.push({ el, overflow: el.style.overflow });
      el.style.overflow = "hidden";
    }
  }
  return () => {
    for (const { el, overflow } of locked.reverse()) el.style.overflow = overflow;
  };
}

interface TouchDragSession<T> {
  item: T;
  source: HTMLElement;
  touchId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  timer: number | null;
  active: boolean;
  ghost: HTMLElement | null;
  ghostW: number;
  ghostH: number;
  sourceOpacity: string | null;
  unlockScroll: (() => void) | null;
  detach: () => void;
}

function teardown<T>(s: TouchDragSession<T>) {
  if (s.timer !== null) window.clearTimeout(s.timer);
  s.timer = null;
  s.detach();
  s.ghost?.remove();
  s.ghost = null;
  s.unlockScroll?.();
  s.unlockScroll = null;
  if (s.sourceOpacity !== null) s.source.style.opacity = s.sourceOpacity;
  s.sourceOpacity = null;
}

function placeGhost<T>(s: TouchDragSession<T>) {
  if (!s.ghost) return;
  s.ghost.style.transform = `translate(${s.lastX - s.ghostW / 2}px,${s.lastY - s.ghostH / 2}px)`;
}

/**
 * Adds touch-based drag-and-drop support alongside the native HTML5 drag API.
 * The drag starts only after holding the finger still on the card
 * (LONG_PRESS_MS); moving before that scrolls as usual.
 *
 * Usage:
 *   const { touchStart } = useTouchDrag({
 *     dataAttr: "data-lane-id",
 *     onDrop: (item, zoneId) => handleDrop(item, Number(zoneId)),
 *     onMove: (x) => updateEdgeAutoScroll(x), // only while dragging
 *     onEnd: () => cleanup(),                  // drag finished or canceled
 *   });
 *
 *   // On draggable element (no `touch-none`, or scrolling breaks again):
 *   onTouchStart={(e) => touchStart(e, item)}
 *
 *   // On drop zone container:
 *   data-lane-id={lane.id}   ← the value of dataAttr
 */
export function useTouchDrag<T>(options: {
  dataAttr: string;
  onDrop: (item: T, zoneId: string) => void;
  onEnd?: (item: T) => void;
  onMove?: (clientX: number, clientY: number) => void;
}) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const sessionRef = useRef<TouchDragSession<T> | null>(null);
  const clickGuardRef = useRef<{ release: () => void; timer: number | null } | null>(null);

  function releaseClickGuard() {
    const guard = clickGuardRef.current;
    if (!guard) return;
    if (guard.timer !== null) window.clearTimeout(guard.timer);
    guard.release();
    clickGuardRef.current = null;
  }

  function armClickGuard() {
    releaseClickGuard();
    const swallow = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    window.addEventListener("click", swallow, true);
    clickGuardRef.current = { release: () => window.removeEventListener("click", swallow, true), timer: null };
  }

  function finish(s: TouchDragSession<T>) {
    const wasActive = s.active;
    teardown(s);
    if (sessionRef.current === s) sessionRef.current = null;
    const guard = clickGuardRef.current;
    if (wasActive && guard && guard.timer === null) {
      guard.timer = window.setTimeout(releaseClickGuard, CLICK_GUARD_MS);
    }
  }

  // Fim sem soltar sobre uma etapa (toque cancelado, app em segundo plano)
  function abort(s: TouchDragSession<T>) {
    const wasActive = s.active;
    finish(s);
    if (wasActive) optionsRef.current.onEnd?.(s.item);
  }

  useEffect(() => {
    // O iOS Safari so respeita o preventDefault de um touchmove adicionado no
    // meio do toque se ja houver um ouvinte nao passivo na janela. Ele tambem
    // segura o 2o dedo: sem zoom/rolagem durante o arrastar, e pinca na espera
    // nao vira arrastar.
    const onWindowTouchMove = (ev: TouchEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      if (s.active) {
        if (ev.cancelable) ev.preventDefault();
      } else if (ev.touches.length > 1) {
        teardown(s);
        sessionRef.current = null;
      }
    };
    window.addEventListener("touchmove", onWindowTouchMove, { passive: false });
    return () => {
      window.removeEventListener("touchmove", onWindowTouchMove);
      const s = sessionRef.current;
      if (s) teardown(s);
      sessionRef.current = null;
      const guard = clickGuardRef.current;
      if (guard) {
        if (guard.timer !== null) window.clearTimeout(guard.timer);
        guard.release();
      }
      clickGuardRef.current = null;
    };
  }, []);

  function activate(s: TouchDragSession<T>) {
    s.timer = null;
    if (sessionRef.current !== s) return;
    if (!s.source.isConnected) {
      finish(s);
      return;
    }
    s.active = true;
    const rect = s.source.getBoundingClientRect();
    const clone = s.source.cloneNode(true) as HTMLElement;
    s.ghostW = rect.width;
    s.ghostH = rect.height;
    Object.assign(clone.style, {
      position: "fixed",
      zIndex: "9999",
      pointerEvents: "none",
      opacity: "0.75",
      // o card tem transition-all: herdado, o fantasma andaria atrasado do dedo
      transition: "none",
      left: "0",
      top: "0",
      width: `${rect.width}px`,
    });
    document.body.appendChild(clone);
    s.ghost = clone;
    placeGhost(s);
    // O fantasma nasce debaixo do dedo; o card esmaecido mostra que soltou
    s.sourceOpacity = s.source.style.opacity;
    s.source.style.opacity = "0.4";
    s.unlockScroll = lockScrollAncestors(s.source);
    armClickGuard();
    window.getSelection()?.removeAllRanges();
    try {
      navigator.vibrate?.(15);
    } catch {
      /* aparelho sem vibracao */
    }
  }

  function touchStart(e: React.TouchEvent<HTMLElement>, item: T) {
    // O evento do React sobe pela arvore de componentes: toque num popover/menu
    // aberto em portal a partir do card (ver conversas, iniciar atendimento)
    // chega aqui sem estar dentro do card na tela
    if (!e.currentTarget.contains(e.target as Node)) return;
    const current = sessionRef.current;
    if (current) {
      const sameFingerStillDown =
        findTouch(e.nativeEvent.touches, current.touchId) && !findTouch(e.nativeEvent.changedTouches, current.touchId);
      if (sameFingerStillDown) {
        // Segundo dedo (pinca/zoom) durante a espera nao e arrastar
        if (!current.active) finish(current);
        return;
      }
      // O dedo anterior saiu da tela sem o fim do toque chegar (no Android o id
      // do dedo se repete no toque seguinte): limpa e segue
      abort(current);
    }
    // Toque novo libera o clique na hora (o descarte e so para o fim do arrastar)
    releaseClickGuard();
    if (e.touches.length !== 1) return;
    const touch = e.changedTouches[0];
    if (!touch) return;

    const s: TouchDragSession<T> = {
      item,
      source: e.currentTarget,
      touchId: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      timer: null,
      active: false,
      ghost: null,
      ghostW: 0,
      ghostH: 0,
      sourceOpacity: null,
      unlockScroll: null,
      detach: () => {},
    };

    const onTouchMove = (ev: TouchEvent) => {
      const t = findTouch(ev.touches, s.touchId);
      if (!t) return;
      if (!s.active) {
        const moved = Math.hypot(t.clientX - s.startX, t.clientY - s.startY);
        // Nao cancelavel = o navegador ja esta rolando
        if (!ev.cancelable || ev.touches.length > 1 || moved > MOVE_TOLERANCE_PX) finish(s);
        else {
          s.lastX = t.clientX;
          s.lastY = t.clientY;
        }
        return;
      }
      if (ev.cancelable) ev.preventDefault();
      s.lastX = t.clientX;
      s.lastY = t.clientY;
      placeGhost(s);
      optionsRef.current.onMove?.(t.clientX, t.clientY);
    };

    const onTouchEnd = (ev: TouchEvent) => {
      const t = findTouch(ev.changedTouches, s.touchId);
      if (!t) return;
      if (!s.active) {
        finish(s);
        return;
      }
      // Sem isto, soltar o dedo no lugar depois de segurar viraria clique (abre o card)
      if (ev.cancelable) ev.preventDefault();
      // hide ghost so elementFromPoint can reach what's behind it
      if (s.ghost) s.ghost.style.display = "none";
      const target = document.elementFromPoint(t.clientX, t.clientY);
      finish(s);
      const { dataAttr, onDrop, onEnd } = optionsRef.current;
      onEnd?.(s.item);
      const zoneId = findDropZone(target, dataAttr);
      if (zoneId) onDrop(s.item, zoneId);
    };

    const onTouchCancel = () => abort(s);

    const onHidden = () => {
      if (document.visibilityState === "hidden") abort(s);
    };
    const onPageHide = () => abort(s);

    // O toque longo abre o menu do navegador (imagem/texto) e, no Android/iPad,
    // pode iniciar o arrastar nativo do `draggable` — os dois roubariam o toque
    const blockNative = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };

    // Rolagem durante a espera (inercia, leitor de tela) = o usuario esta rolando
    const onScroll = () => {
      if (!s.active) finish(s);
    };

    // Ouvintes no proprio alvo do toque: se o card sair do DOM no meio (lista
    // recarregada pelo socket), os eventos do toque continuam chegando nele
    const target = e.target as HTMLElement;
    target.addEventListener("touchmove", onTouchMove, { passive: false });
    target.addEventListener("touchend", onTouchEnd);
    target.addEventListener("touchcancel", onTouchCancel);
    window.addEventListener("contextmenu", blockNative, true);
    window.addEventListener("dragstart", blockNative, true);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHidden);
    s.detach = () => {
      target.removeEventListener("touchmove", onTouchMove);
      target.removeEventListener("touchend", onTouchEnd);
      target.removeEventListener("touchcancel", onTouchCancel);
      window.removeEventListener("contextmenu", blockNative, true);
      window.removeEventListener("dragstart", blockNative, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHidden);
    };

    sessionRef.current = s;
    s.timer = window.setTimeout(() => activate(s), LONG_PRESS_MS);
  }

  return { touchStart };
}
