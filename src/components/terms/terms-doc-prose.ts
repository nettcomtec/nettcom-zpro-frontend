// Classes tipográficas ÚNICAS para o editor e o renderer dos termos do revendedor
// (PLANO_ACEITE_TERMOS_REVENDA §5.5). O projeto não tem @tailwindcss/typography —
// `prose` não faz nada. O que o revendedor vê ao editar é o que o cliente vê ao aceitar.
// Fica em src/components/ DE PROPÓSITO: o `content` do tailwind.config.ts não varre
// src/lib/, e as classes arbitrárias abaixo só são geradas se o literal estiver num
// caminho varrido. `lib/terms-doc.ts` apenas reexporta.
export const TERMS_DOC_PROSE = [
  "break-words text-sm",
  "[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-2",
  "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2",
  "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1",
  "[&_p]:my-2 [&_p]:leading-relaxed",
  "[&_ul]:list-disc [&_ul]:ps-5 [&_ul]:my-2",
  "[&_ol]:list-decimal [&_ol]:ps-5 [&_ol]:my-2",
  // list-decimal sobrepõe o atributo `type` do <ol> (listas com letras/romanos)
  "[&_ol[type='a']]:[list-style-type:lower-alpha] [&_ol[type='A']]:[list-style-type:upper-alpha]",
  "[&_ol[type='i']]:[list-style-type:lower-roman] [&_ol[type='I']]:[list-style-type:upper-roman]",
  "[&_blockquote]:border-s-4 [&_blockquote]:ps-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4",
  "[&_a]:underline [&_a]:text-primary",
].join(" ");
