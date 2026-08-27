// Dono único do document.title da aba: combina o nome base (branding/whitelabel)
// com a contagem de não lidos, exibindo "(N) Nome".
//
// Por que um manager singleton + MutationObserver: vários pontos escrevem o título
// (branding por tenant, fallback global, editor do superadmin) e — crucial — o Next
// App Router REAPLICA o título do generateMetadata (nome cru, sem badge) a cada
// navegação client-side, em um timing que não controlamos. Guardamos nome e
// contagem separados e recompomos o título; o observer reaplica o badge sempre que
// algo externo (o Next, na troca de rota) sobrescreve o título, evitando que o
// "(N)" suma ao trocar de página.
//
// Também espelha a contagem na App Badging API (ícone do PWA instalado).

let baseTitle = "";
let badgeCount = 0;
let expected = "";
let observer: MutationObserver | null = null;

/** Remove um prefixo de badge "(3) " ou "(99+) " de um título já composto. */
function stripBadge(title: string): string {
  return title.replace(/^\(\d+\+?\)\s+/, "");
}

/** Formata o título final. Número como PREFIXO (a aba trunca o fim), cap "99+". */
export function formatTabTitle(name: string, count: number): string {
  const badge = count > 0 ? `(${count > 99 ? "99+" : count}) ` : "";
  return (badge + (name || "")).trim() || (name || "");
}

function write(): void {
  if (typeof document === "undefined") return;
  // Usa o nome base conhecido; se ainda não foi informado (boot antes do branding
  // resolver), deriva do título atual removendo qualquer badge para não acumular.
  const name = baseTitle || stripBadge(document.title);
  expected = formatTabTitle(name, badgeCount);
  if (document.title !== expected) document.title = expected;
  ensureObserver();
}

function ensureObserver(): void {
  if (observer || typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  const head = document.head;
  if (!head) return;
  observer = new MutationObserver(() => {
    // Sem badge ativo: deixa o título do app como o branding/Next definiu.
    if (badgeCount <= 0) return;
    // Já está correto: nada a fazer (também evita loop com nossa própria escrita).
    if (document.title === expected) return;
    // O Next reaplicou o <title> do metadata na navegação, apagando o badge.
    // Recompõe preservando o badge (captura o nome novo, caso tenha mudado).
    baseTitle = stripBadge(document.title) || baseTitle;
    expected = formatTabTitle(baseTitle, badgeCount);
    if (document.title !== expected) document.title = expected;
  });
  // childList+subtree pega substituição/recriação do <title>; characterData pega
  // alteração do texto do título existente.
  observer.observe(head, { childList: true, subtree: true, characterData: true });
}

/** Define o nome base do app (whitelabel). Chamado pelos pontos de branding. */
export function setBaseTitle(name: string): void {
  baseTitle = stripBadge(name || "");
  write();
}

/** Define a contagem de não lidos exibida no título e no badge do PWA. */
export function setTitleBadgeCount(count: number): void {
  badgeCount = Math.max(0, count | 0);
  write();
  setAppBadgeSafe(badgeCount);
}

interface BadgingNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

/**
 * Espelha a contagem no ícone do app instalado (taskbar/dock) via App Badging API.
 * Só tem efeito em PWA instalado e em browsers compatíveis; no-op silencioso caso
 * contrário (feature-detect + try/catch; Firefox não suporta).
 */
export function setAppBadgeSafe(count: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & BadgingNavigator;
  try {
    if (count > 0) {
      nav.setAppBadge?.(count)?.catch(() => {});
    } else {
      nav.clearAppBadge?.()?.catch(() => {});
    }
  } catch {
    /* no-op */
  }
}
