import fs from "fs";
import path from "path";

const DEFAULT_APP_NAME = "APP";

export interface BrandingServerState {
  appName: string;
  pwaIconTimestamp: number;
}

function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3101").replace(/\/$/, "");
}

function tryReadPwaIconMtime(): number {
  const iconCandidates = [
    path.join(process.cwd(), "public", "icons", "icon-192x192.png"),
    path.join(process.cwd(), "..", "frontendNovo", "public", "icons", "icon-192x192.png"),
    path.join(__dirname, "..", "..", "..", "public", "icons", "icon-192x192.png"),
  ];
  for (const p of iconCandidates) {
    try {
      return Math.floor(fs.statSync(p).mtimeMs);
    } catch {
      /* tenta próximo */
    }
  }
  return 0;
}

/**
 * Fallback: lê branding.json/manifest.json do filesystem local.
 * Só é fonte confiável em dev e PM2 nativo (backend e frontend coexistem no mesmo FS).
 * Em Docker o frontend roda em container separado e não enxerga o volume do backend,
 * então isto retorna o default do build — usado apenas se a API estiver indisponível.
 */
function readBrandingFromFilesystem(): BrandingServerState {
  const brandingCandidates = [
    path.join(process.cwd(), "branding.json"),
    path.join(process.cwd(), "..", "branding.json"),
    path.join(process.cwd(), "..", "..", "..", "branding.json"),
    path.join(__dirname, "..", "..", "..", "..", "..", "..", "branding.json"),
  ];
  for (const p of brandingCandidates) {
    try {
      const json = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
      const appName =
        typeof json.appName === "string" && json.appName.trim() ? json.appName.trim() : DEFAULT_APP_NAME;
      const fromJson =
        typeof json.pwaIconTimestamp === "number" && json.pwaIconTimestamp > 0
          ? json.pwaIconTimestamp
          : 0;
      const pwaIconTimestamp = fromJson || tryReadPwaIconMtime();
      return { appName, pwaIconTimestamp };
    } catch {
      /* tenta próximo */
    }
  }
  const manifestCandidates = [
    path.join(process.cwd(), "public", "manifest.json"),
    path.join(process.cwd(), "..", "..", "..", "public", "manifest.json"),
    path.join(__dirname, "..", "..", "..", "public", "manifest.json"),
  ];
  for (const manifestPath of manifestCandidates) {
    try {
      const json = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { name?: string };
      if (json.name && typeof json.name === "string") {
        return { appName: json.name, pwaIconTimestamp: tryReadPwaIconMtime() };
      }
    } catch {
      /* tenta próximo */
    }
  }
  return { appName: DEFAULT_APP_NAME, pwaIconTimestamp: tryReadPwaIconMtime() };
}

/**
 * Lê o branding global (appName + pwaIconTimestamp) do backend — fonte canônica.
 *
 * Por que via API e não filesystem: em deploy Docker o frontend roda em container
 * separado e NÃO tem acesso ao volume `backend_public` onde o backend grava
 * branding.json. Ler do disco aqui retornaria sempre o default do build, fazendo
 * o manifest (prompt de instalação PWA) e o <title> SSR mostrarem a marca padrão
 * mesmo após a customização global. Buscar de /publicBrandingNovo garante que o
 * SSR reflita a customização ao vivo e que o ?t=<pwaIconTimestamp> dos ícones
 * acompanhe novos uploads (cache-bust correto).
 *
 * Fallback para filesystem/default se o backend estiver indisponível.
 */
export async function readBrandingServer(): Promise<BrandingServerState> {
  const apiBase = getApiBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${apiBase}/publicBrandingNovo`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as { appName?: unknown; pwaIconTimestamp?: unknown };
      const appName =
        typeof json.appName === "string" && json.appName.trim()
          ? json.appName.trim()
          : DEFAULT_APP_NAME;
      const pwaIconTimestamp =
        typeof json.pwaIconTimestamp === "number" && json.pwaIconTimestamp > 0
          ? json.pwaIconTimestamp
          : 0;
      return { appName, pwaIconTimestamp };
    }
  } catch {
    /* backend indisponível / timeout — cai pro fallback de filesystem */
  } finally {
    clearTimeout(timeout);
  }
  return readBrandingFromFilesystem();
}
