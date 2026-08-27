"use client";
import { useRef } from "react";

function findDropZone(el: Element | null, attr: string): string | null {
  let node: Element | null = el;
  while (node) {
    const val = node.getAttribute(attr);
    if (val !== null) return val;
    node = node.parentElement;
  }
  return null;
}

/**
 * Adds touch-based drag-and-drop support alongside the native HTML5 drag API.
 *
 * Usage:
 *   const { touchStart, touchMove, touchEnd } = useTouchDrag({
 *     dataAttr: "data-lane-id",
 *     onDrop: (item, zoneId) => handleDrop(item, Number(zoneId)),
 *     onEnd: () => cleanup(),
 *   });
 *
 *   // On draggable element:
 *   onTouchStart={(e) => touchStart(e, item)}
 *   onTouchMove={touchMove}
 *   onTouchEnd={touchEnd}
 *
 *   // On drop zone container:
 *   data-lane-id={lane.id}   ← the value of dataAttr
 */
export function useTouchDrag<T>({
  dataAttr,
  onDrop,
  onEnd,
}: {
  dataAttr: string;
  onDrop: (item: T, zoneId: string) => void;
  onEnd?: (item: T) => void;
}) {
  const dragging = useRef<T | null>(null);
  const ghost = useRef<HTMLElement | null>(null);

  function touchStart(e: React.TouchEvent<HTMLElement>, item: T) {
    dragging.current = item;
    const src = e.currentTarget;
    const touch = e.touches[0];
    const rect = src.getBoundingClientRect();
    const clone = src.cloneNode(true) as HTMLElement;
    Object.assign(clone.style, {
      position: "fixed",
      zIndex: "9999",
      pointerEvents: "none",
      opacity: "0.75",
      left: "0",
      top: "0",
      width: `${rect.width}px`,
      transform: `translate(${touch.clientX - rect.width / 2}px,${touch.clientY - rect.height / 2}px)`,
    });
    document.body.appendChild(clone);
    ghost.current = clone;
  }

  function touchMove(e: React.TouchEvent) {
    e.preventDefault();
    const touch = e.touches[0];
    if (!ghost.current) return;
    const w = ghost.current.offsetWidth;
    const h = ghost.current.offsetHeight;
    ghost.current.style.transform = `translate(${touch.clientX - w / 2}px,${touch.clientY - h / 2}px)`;
  }

  function touchEnd(e: React.TouchEvent) {
    const touch = e.changedTouches[0];
    // hide ghost so elementFromPoint can reach what's behind it
    if (ghost.current) ghost.current.style.display = "none";
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    ghost.current?.remove();
    ghost.current = null;
    const item = dragging.current;
    dragging.current = null;
    if (item) onEnd?.(item);
    if (!item) return;
    const zoneId = findDropZone(target, dataAttr);
    if (zoneId) onDrop(item, zoneId);
  }

  return { touchStart, touchMove, touchEnd };
}
