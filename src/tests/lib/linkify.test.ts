import { describe, it, expect } from "vitest";
import { linkifyParts } from "@/lib/linkify";

const links = (text: string) =>
  linkifyParts(text).filter((p) => p.type === "link");

describe("linkifyParts", () => {
  it("detecta URL http/https", () => {
    const [link] = links("Boleto PDF: https://ony.sgp.tsmx.com.br/boleto/27834-2JJZ9GXRHD/");
    expect(link).toEqual({
      type: "link",
      value: "https://ony.sgp.tsmx.com.br/boleto/27834-2JJZ9GXRHD/",
      href: "https://ony.sgp.tsmx.com.br/boleto/27834-2JJZ9GXRHD/",
    });
  });

  it("completa o protocolo em www.", () => {
    const [link] = links("acesse www.empresa.com.br hoje");
    expect(link).toMatchObject({ value: "www.empresa.com.br", href: "https://www.empresa.com.br" });
  });

  it("transforma e-mail em mailto", () => {
    const [link] = links("duvidas: suporte@empresa.com.br");
    expect(link).toMatchObject({ value: "suporte@empresa.com.br", href: "mailto:suporte@empresa.com.br" });
  });

  it("nao engole a pontuacao final da frase", () => {
    const [link] = links("veja https://ex.com/a.");
    expect(link).toMatchObject({ value: "https://ex.com/a" });
  });

  it("mantem parenteses que fazem parte da URL", () => {
    const [link] = links("veja https://ex.com/a_(b) aqui");
    expect(link).toMatchObject({ value: "https://ex.com/a_(b)" });
  });

  // Notas do atendimento trazem PIX copia-e-cola e linha digitavel: o payload do
  // PIX embute dominios (br.gov.bcb.pix / pix.sicoob.com.br/qr/...) e nao pode
  // virar link, senao o cliente copia um pedaco do codigo.
  it("nao linkifica PIX copia-e-cola nem linha digitavel de boleto", () => {
    const pix =
      "00020101021226950014br.gov.bcb.pix2573pix.sicoob.com.br/qr/payload/v2/5000ad4f-b0fb-41e6-bcf0-02df06507420***630452DA";
    const barras = "75698154400000099001437901229914300192338001";
    expect(links(`PIX: ${pix}\nCod. barras: ${barras}`)).toHaveLength(0);
  });

  it("preserva o texto original ao remontar as partes", () => {
    const texto = "Pagar: https://ex.com/a, ou fale com suporte@ex.com.br (www.ex.com).";
    expect(linkifyParts(texto).map((p) => p.value).join("")).toBe(texto);
  });

  it("retorna vazio para texto nulo", () => {
    expect(linkifyParts(null)).toEqual([]);
    expect(linkifyParts("")).toEqual([]);
  });
});
