import type { Metadata } from "next";
import { getLegalContext, resolveLegalLang, LegalShell } from "@/components/legal/legal-common";
import { LegalDocBody, LegalDocFooter } from "@/components/legal/legal-render";
import { getLegalStrings } from "@/components/legal/legal-strings";

/*
 * Página PÚBLICA (sem login — ver PUBLIC_PATHS em src/middleware.ts) destinada à
 * aprovação de apps na Meta (App Review). A Meta exige que a URL da Política de
 * Privacidade: (1) seja acessível sem autenticação; (2) aponte direto para a
 * política (sem redirect para home/login); (3) identifique a empresa/app dona.
 * Server component: o conteúdo (incluindo appName e domínio) sai no HTML
 * inicial, visível inclusive para o depurador da Meta.
 *
 * Idioma via ?lang= (13 locales da UI, default pt) — escolhido no gerador de
 * links do /app-waba (superadmin) e /configuracoes/meta (admin). Conteúdo em
 * components/legal/legal-strings/<lang>.ts.
 */

type SearchParams = Promise<{ lang?: string | string[] }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = resolveLegalLang((await searchParams).lang);
  const ctx = await getLegalContext(lang);
  const doc = getLegalStrings(lang).privacy;
  return {
    title: `${doc.title} — ${ctx.appName}`,
    description: doc.metaDescription.replaceAll("{appName}", ctx.appName),
  };
}

export default async function PoliticaDePrivacidadePage({ searchParams }: { searchParams: SearchParams }) {
  const lang = resolveLegalLang((await searchParams).lang);
  const ctx = await getLegalContext(lang);
  const doc = getLegalStrings(lang).privacy;
  return (
    <LegalShell ctx={ctx} title={doc.title} updated={doc.updated} footer={<LegalDocFooter doc={doc} ctx={ctx} />}>
      <LegalDocBody doc={doc} ctx={ctx} />
    </LegalShell>
  );
}
