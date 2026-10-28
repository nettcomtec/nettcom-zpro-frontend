import type { Metadata } from "next";

// Metadados neutros: o formulário é da empresa, não da instalação. Sem o nome e a
// descrição do painel no título e na prévia do link, sem o manifest (o navegador não
// oferece "instalar" o painel ao cliente final) e fora dos buscadores. O título de
// verdade (nome do formulário) é posto pela página quando a configuração chega.
export const metadata: Metadata = {
  title: { absolute: " " },
  description: null,
  openGraph: null,
  twitter: null,
  appleWebApp: null,
  manifest: null,
  robots: { index: false, follow: false },
};

export default function PublicFormLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
