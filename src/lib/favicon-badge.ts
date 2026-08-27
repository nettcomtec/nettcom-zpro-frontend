// Dono do <link rel="icon"> PRÓPRIO (data-zpro-favicon): desenha um badge
// numérico vermelho sobre o favicon whitelabel do tenant.
//
// CORS: o favicon vem do backend (cross-origin). Desenhar uma <img> cross-origin
// num canvas e chamar toDataURL() daria SecurityError (taint). Para evitar isso,
// carregamos a imagem via fetch -> blob -> FileReader.readAsDataURL e desenhamos a
// data:URL resultante (data:URL nunca tainta o canvas) — mesmo padrão já usado em
// lib/export-chat-pdf.ts. Não exige nenhuma mudança de CORS no backend.
//
// Coexistência: há até 3 <link rel=icon> no head — o do metadata SSR (gerenciado
// pelo React, INTOCÁVEL), o do script de boot e o deste módulo (os dois últimos
// compartilham o mesmo nó, marcado com data-zpro-favicon). Este módulo só mexe no
// nó marcado e o mantém por último no <head> para o browser preferi-lo — a base e
// a contagem são guardadas separadamente e o ícone é sempre recomposto.

const CANVAS_SIZE = 64;
const REDRAW_DEBOUNCE_MS = 250;

let currentUrl = "";
let currentCount = 0;
let basePromise: Promise<HTMLImageElement> | null = null;
let redrawTimer: ReturnType<typeof setTimeout> | null = null;

function getIconLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  // NUNCA remover/mover os <link rel=icon> de terceiros: o do metadata SSR é um
  // nó GERENCIADO pelo React 19 (hoistable) — removê-lo faz o próximo commit que
  // toca o <head> (toda navegação de rota) estourar NotFoundError e a navegação
  // congela (URL muda, página não troca, sidebar trava). Este módulo opera só no
  // link próprio (data-zpro-favicon, compartilhado com o script de boot) e ganha
  // precedência mantendo-o por último no <head> (o browser usa o último rel=icon).
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon'][data-zpro-favicon]");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.setAttribute("data-zpro-favicon", "");
  }
  // appendChild move o próprio nó para o fim se já estiver no DOM (seguro: o nó é nosso).
  if (document.head.lastElementChild !== link) document.head.appendChild(link);
  return link;
}

/** Fallback: aponta o favicon para a URL crua, sem badge (nunca quebra). */
function applyRaw(): void {
  const link = getIconLink();
  if (link && currentUrl) link.href = currentUrl;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("favicon decode failed"));
    img.src = dataUrl;
  });
}

async function loadBaseImage(url: string): Promise<HTMLImageElement> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`favicon fetch ${res.status}`);
  const blob = await res.blob();
  const dataUrl = await blobToDataURL(blob);
  return dataUrlToImage(dataUrl);
}

function drawBadge(ctx: CanvasRenderingContext2D, count: number): void {
  const s = CANVAS_SIZE;
  const r = s * 0.32;
  const cx = s - r;
  const cy = r;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444"; // vermelho (destructive)
  ctx.fill();

  const label = count > 9 ? "9+" : String(count);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(r * (label.length > 1 ? 1.0 : 1.25))}px -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 1);
}

function render(): void {
  if (!basePromise) return;
  const link = getIconLink();
  if (!link) return;

  const urlAtRender = currentUrl;
  const countAtRender = currentCount;

  basePromise
    .then((img) => {
      // Aborta se a base mudou enquanto carregava/aguardava o debounce.
      if (urlAtRender !== currentUrl) return;

      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        applyRaw();
        return;
      }
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      if (countAtRender > 0) drawBadge(ctx, countAtRender);

      link.type = "image/png";
      link.href = canvas.toDataURL("image/png");
    })
    .catch(() => applyRaw());
}

function scheduleRender(): void {
  if (redrawTimer) clearTimeout(redrawTimer);
  redrawTimer = setTimeout(render, REDRAW_DEBOUNCE_MS);
}

/** Define o favicon base (URL crua do whitelabel). Recarrega e recompõe o badge. */
export function setBaseFavicon(url: string): void {
  if (typeof document === "undefined" || !url || url === currentUrl) return;
  currentUrl = url;
  basePromise = loadBaseImage(url);
  // Recarregou a base: redesenha já (sem debounce) assim que ela estiver pronta;
  // se falhar, cai no favicon cru.
  render();
}

/** Define a contagem do badge no favicon. Redesenho com debounce (rajadas). */
export function setFaviconBadgeCount(count: number): void {
  const next = Math.max(0, count | 0);
  if (next === currentCount) return;
  currentCount = next;
  if (basePromise) scheduleRender();
}
