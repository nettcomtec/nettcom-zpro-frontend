import type { Metadata } from "next";
import { getLegalContext, resolveLegalLang, LegalShell } from "@/components/legal/legal-common";
import { LegalDocBody, LegalDocFooter } from "@/components/legal/legal-render";
import { getLegalStrings } from "@/components/legal/legal-strings";

/*
 * Página PÚBLICA (sem login — ver PUBLIC_PATHS em src/middleware.ts) destinada à
 * aprovação de apps na Meta (App Review). Mesmas premissas da página de
 * Política de Privacidade: server component, conteúdo no HTML inicial,
 * identifica a empresa/app dona. Idioma via ?lang= (13 locales, default pt).
 */

type SearchParams = Promise<{ lang?: string | string[] }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = resolveLegalLang((await searchParams).lang);
  const ctx = await getLegalContext(lang);
  const doc = getLegalStrings(lang).terms;
  return {
    title: `${doc.title} — ${ctx.appName}`,
    description: doc.metaDescription.replaceAll("{appName}", ctx.appName),
  };
}

export default async function TermosDeUsoPage({ searchParams }: { searchParams: SearchParams }) {
  const lang = resolveLegalLang((await searchParams).lang);
  const ctx = await getLegalContext(lang);
  const doc = getLegalStrings(lang).terms;
  return (
    <LegalShell ctx={ctx} title={doc.title} updated={doc.updated} footer={<LegalDocFooter doc={doc} ctx={ctx} />}>
      <LegalDocBody doc={doc} ctx={ctx} />
    </LegalShell>
  );
}
