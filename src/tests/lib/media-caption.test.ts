import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { isBodyFileName, mediaCaptionText, mediaUrlFileName } from "@/lib/media-caption";

/**
 * A legenda que a bolha mostra é a que o encaminhar manda ao cliente: a regra mora em
 * `lib/media-caption.ts` e o backend tem uma cópia em `helpers/ForwardMediaCaptionZPRO.ts`
 * (bloco entre "Espelho de" e "Fim do espelho"). Os dois códigos precisam ser iguais.
 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1")
    .replace(/\s+/g, "");

describe("media-caption (espelho do backend)", () => {
  it("o bloco espelhado do backend é o mesmo código da tela", () => {
    const front = fs.readFileSync(path.resolve(__dirname, "../../lib/media-caption.ts"), "utf8");
    const back = fs.readFileSync(
      path.resolve(__dirname, "../../../../backend/src/helpers/ForwardMediaCaptionZPRO.ts"),
      "utf8"
    );
    const start = back.indexOf("// Espelho de frontend/src/lib/media-caption.ts");
    const end = back.indexOf("// Fim do espelho.");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const mirrored = back.slice(back.indexOf("\n", start) + 1, end);
    expect(stripComments(mirrored)).toBe(stripComments(front));
  });

  it("preenchimento do canal e vazio não são legenda", () => {
    for (const body of ["", "   ", "Imagem", "Vídeo", "GIF", "Documento", "Mensagem PTV", "[image]", "[video]"]) {
      expect(mediaCaptionText(body, null, "foto_1729000000000.jpg")).toBe("");
    }
    expect(mediaCaptionText(null, null, "foto.jpg")).toBe("");
  });

  it("endereço do arquivo no CDN do WhatsApp (nota de vídeo do Baileys) não é legenda", () => {
    expect(mediaCaptionText("https://mmg.whatsapp.net/v/t62.7161-24/123_n.enc?ccb=11-4&oh=01_x&oe=6", null, "v_1729000000000.mp4")).toBe("");
    expect(mediaCaptionText("Veja https://mmg.whatsapp.net/v/x.enc", null, "v_1729000000000.mp4")).toBe("Veja https://mmg.whatsapp.net/v/x.enc");
  });

  it("nome do arquivo (original, salvo ou gerado) não é legenda", () => {
    expect(mediaCaptionText("foto.jpg", null, "foto_1729000000000.jpg")).toBe("");
    expect(mediaCaptionText("Contrato final.pdf", null, "Contrato_final_17290000000001234.pdf")).toBe("");
    expect(mediaCaptionText("relatorio.pdf", "relatorio.pdf", "x_1729000000000.pdf")).toBe("");
    expect(mediaCaptionText("abc_1729000000000.jpg", null, "")).toBe("");
    expect(mediaCaptionText("Ação.png", null, "Acao_1729000000000.png")).toBe("");
  });

  it("o endereço do próprio arquivo não é legenda", () => {
    const urlName = "foto_1729000000000.jpg";
    expect(mediaCaptionText(`https://api.exemplo.com/public/1/${urlName}`, null, urlName)).toBe("");
  });

  it("texto de verdade é legenda, igual ao digitado", () => {
    expect(mediaCaptionText("Olha isso", null, "foto_1729000000000.jpg")).toBe("Olha isso");
    expect(mediaCaptionText("Veja o site.com", null, "foto_1729000000000.jpg")).toBe("Veja o site.com");
    expect(mediaCaptionText("linha 1\nlinha 2", "foto.jpg", "foto_1729000000000.jpg")).toBe("linha 1\nlinha 2");
    expect(mediaCaptionText("https://outro.site/pagina", null, "foto_1729000000000.jpg")).toBe("https://outro.site/pagina");
  });

  it("isBodyFileName e mediaUrlFileName", () => {
    expect(isBodyFileName("", null, "")).toBe(true);
    expect(isBodyFileName("Olá", null, "")).toBe(false);
    expect(mediaUrlFileName("https://x/public/1/chatbot/a%20b.jpg?t=1")).toBe("a b.jpg");
    expect(mediaUrlFileName("https://x/public/1/%E0%A4%A.jpg")).toBe("%E0%A4%A.jpg");
  });
});
