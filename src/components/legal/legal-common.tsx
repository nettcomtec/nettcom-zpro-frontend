import { headers } from "next/headers";
import { readBrandingServer } from "@/lib/branding-server";
import { isLegalLang, type LegalLang } from "@/lib/legal-langs";

/*
 * Infra comum das páginas legais públicas (/politica-de-privacidade e
 * /termos-de-uso), usadas na aprovação de apps na Meta (App Review).
 * Server-only: lê branding do backend e o host do request para que o
 * documento identifique a empresa/app dona (exigência da Meta).
 *
 * O conteúdo é gerado nos 13 idiomas da UI via query ?lang= — escolhido
 * pelo gerador de links no superadmin (/app-waba) e no admin
 * (/configuracoes/meta, aba Configurações). Conteúdo em
 * legal-strings/<lang>.ts, renderizado por legal-render.tsx.
 */

export interface LegalCtx {
  appName: string;
  baseUrl: string;
  host: string;
  lang: LegalLang;
}

export function resolveLegalLang(raw: string | string[] | undefined): LegalLang {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isLegalLang(v) ? v : "pt";
}

/** Cross-link entre os documentos preservando o idioma (pt = URL limpa). */
export function legalHref(path: string, lang: LegalLang): string {
  return lang === "pt" ? path : `${path}?lang=${lang}`;
}

export async function getLegalContext(lang: LegalLang): Promise<LegalCtx> {
  const [{ appName }, hdrs] = await Promise.all([readBrandingServer(), headers()]);
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "";
  const proto = hdrs.get("x-forwarded-proto") || "https";
  const baseUrl = host ? `${proto}://${host}` : "/";
  return { appName, baseUrl, host: host || appName, lang };
}

export function LegalShell({
  ctx,
  title,
  updated,
  children,
  footer,
}: {
  ctx: LegalCtx;
  title: string;
  updated: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main
      className="w-full max-w-3xl px-4 py-10"
      lang={ctx.lang === "pt" ? "pt-BR" : ctx.lang}
      dir={ctx.lang === "ar" ? "rtl" : "ltr"}
    >
      <header className="mb-6 border-b pb-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-lg font-medium">{ctx.appName}</p>
        <p className="mt-1 text-sm text-muted-foreground">{updated}</p>
      </header>
      {children}
      <footer className="mt-10 border-t pt-6 text-sm text-muted-foreground">{footer}</footer>
    </main>
  );
}
