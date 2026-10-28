import { describe, expect, it } from "vitest";

import {
  buildCsv,
  csvCell,
  csvDateTimeText,
  csvDelimiterForCountry,
  csvDigitsCell,
  excelDateTimeFormat,
  excelSerialFromLocalDate,
  sanitizeFileNamePart,
} from "@/lib/csv-export";

// Caracteres invisíveis montados por código (nunca literais no fonte).
const BOM = String.fromCharCode(0xfeff);
const LRM = String.fromCharCode(0x200e);
const RLM = String.fromCharCode(0x200f);
const ALM = String.fromCharCode(0x061c);

describe("csvDelimiterForCountry", () => {
  it("usa ponto e vírgula onde o decimal é vírgula", () => {
    expect(csvDelimiterForCountry("BR")).toBe(";");
    expect(csvDelimiterForCountry("DE")).toBe(";");
  });

  it("usa vírgula onde o decimal é ponto", () => {
    expect(csvDelimiterForCountry("US")).toBe(",");
  });

  it("sem país segue o Brasil", () => {
    expect(csvDelimiterForCountry(undefined)).toBe(";");
  });
});

describe("csvCell", () => {
  it("põe apóstrofo em célula que começa como fórmula", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+5511")).toBe("\"'+5511\"");
    expect(csvCell("-1+1")).toBe("\"'-1+1\"");
    expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
    expect(csvCell("\t=1")).toBe("\"'\t=1\"");
  });

  it("neutraliza depois de juntar as linhas (retorno no início não esconde a fórmula)", () => {
    expect(csvCell("\r=1+1")).toBe("\"'=1+1\"");
    expect(csvCell("\n\n@cmd")).toBe("\"'@cmd\"");
  });

  it("número negativo em texto é texto do usuário e também neutraliza", () => {
    expect(csvCell("-5")).toBe("\"'-5\"");
  });

  it("número de verdade sai como está", () => {
    expect(csvCell(5)).toBe("\"5\"");
    expect(csvCell(-5)).toBe("\"-5\"");
    expect(csvCell(Number.NaN)).toBe("\"\"");
  });

  it("quebra de linha vira ' | ' e linhas vazias somem", () => {
    expect(csvCell("linha 1\r\n\r\n  linha 2  \nlinha 3")).toBe("\"linha 1 | linha 2 | linha 3\"");
  });

  it("dobra as aspas", () => {
    expect(csvCell("diz \"oi\"")).toBe("\"diz \"\"oi\"\"\"");
  });

  it("vazio, nulo e indefinido viram célula vazia", () => {
    expect(csvCell("")).toBe("\"\"");
    expect(csvCell(null)).toBe("\"\"");
    expect(csvCell(undefined)).toBe("\"\"");
  });
});

describe("csvDigitsCell", () => {
  it("telefone vira texto no Excel", () => {
    expect(csvDigitsCell("5511999998888")).toBe("\"=\"\"5511999998888\"\"\"");
    expect(csvDigitsCell("+55 (11) 99999-8888")).toBe("\"=\"\"+55 (11) 99999-8888\"\"\"");
  });

  it("protocolo longo vira texto no Excel", () => {
    expect(csvDigitsCell("20261020143000001234")).toBe("\"=\"\"20261020143000001234\"\"\"");
  });

  it("texto que não é dígito cai na proteção de fórmula", () => {
    expect(csvDigitsCell("=1+1")).toBe("\"'=1+1\"");
    expect(csvDigitsCell("-5")).toBe("\"'-5\"");
    expect(csvDigitsCell("joao.silva")).toBe("\"joao.silva\"");
    expect(csvDigitsCell("BSUID:abc")).toBe("\"BSUID:abc\"");
  });

  it("vazio vira célula vazia", () => {
    expect(csvDigitsCell("")).toBe("\"\"");
    expect(csvDigitsCell(null)).toBe("\"\"");
  });
});

describe("buildCsv", () => {
  it("começa com BOM e separa as linhas com CRLF", () => {
    const csv = buildCsv([["\"a\"", "\"b\""], ["\"1\"", "\"2\""]], ";");
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(1)).toBe("\"a\";\"b\"\r\n\"1\";\"2\"");
  });
});

describe("excelSerialFromLocalDate", () => {
  it("calcula a data e a hora no horário local", () => {
    expect(excelSerialFromLocalDate(new Date(2026, 9, 20, 14, 30))).toBeCloseTo(46315.604167, 5);
  });

  it("meia-noite cai no número inteiro", () => {
    expect(excelSerialFromLocalDate(new Date(2026, 9, 20, 0, 0))).toBe(46315);
  });
});

describe("excelDateTimeFormat", () => {
  it("segue a ordem e o separador do idioma", () => {
    expect(excelDateTimeFormat("pt-BR")).toBe("dd/mm/yyyy hh:mm");
    expect(excelDateTimeFormat("en-US")).toBe("mm/dd/yyyy hh:mm");
    expect(excelDateTimeFormat("de-DE")).toBe("dd.mm.yyyy hh:mm");
    expect(excelDateTimeFormat("ja-JP")).toBe("yyyy/mm/dd hh:mm");
  });

  it("árabe sem as marcas de direção", () => {
    const fmt = excelDateTimeFormat("ar");
    expect(fmt).toMatch(/^(dd|mm|yyyy)[/.\- ](dd|mm|yyyy)[/.\- ](dd|mm|yyyy) hh:mm$/);
  });
});

describe("csvDateTimeText", () => {
  const date = new Date(2026, 9, 20, 14, 30);

  it("data e hora separadas por espaço, sem vírgula", () => {
    const text = csvDateTimeText(date, "pt-BR");
    expect(text).toBe("20/10/2026 14:30");
    expect(csvDateTimeText(date, "en-US")).not.toContain(",");
  });

  it("árabe com dígitos latinos e sem marcas de direção", () => {
    const text = csvDateTimeText(date, "ar");
    expect(text).not.toContain(LRM);
    expect(text).not.toContain(RLM);
    expect(text).not.toContain(ALM);
    expect(text).toMatch(/2026/);
    expect(text).not.toMatch(/[\u0660-\u0669]/);
  });

  it("data inválida vira vazio", () => {
    expect(csvDateTimeText(new Date("x"), "pt-BR")).toBe("");
  });
});

describe("sanitizeFileNamePart", () => {
  it("tira o acento latino e troca espaço por _", () => {
    expect(sanitizeFileNamePart("Avaliações de Atendimento")).toBe("Avaliacoes_de_Atendimento");
    expect(sanitizeFileNamePart("Değerlendirmeler")).toBe("Degerlendirmeler");
  });

  it("mantém letras de outros alfabetos", () => {
    expect(sanitizeFileNamePart("Отзывы")).toBe("Отзывы");
    expect(sanitizeFileNamePart("Мой отзыв")).toBe("Мой_отзыв");
    expect(sanitizeFileNamePart("評価")).toBe("評価");
    expect(sanitizeFileNamePart("मूल्यांकन")).toBe("मूल्यांकन");
  });

  it("remove caracteres proibidos e de controle", () => {
    expect(sanitizeFileNamePart("a/b\\c:d*e?f\"g<h>i|j")).toBe("abcdefghij");
    expect(sanitizeFileNamePart(`x${String.fromCharCode(1)}y`)).toBe("xy");
  });

  it("colapsa _ repetido e apara as pontas", () => {
    expect(sanitizeFileNamePart("  2026-10-01   a   2026-10-20  ")).toBe("2026-10-01_a_2026-10-20");
    expect(sanitizeFileNamePart("__a__b__")).toBe("a_b");
  });

  it("vazio vira export", () => {
    expect(sanitizeFileNamePart("")).toBe("export");
    expect(sanitizeFileNamePart("///")).toBe("export");
    expect(sanitizeFileNamePart(null)).toBe("export");
  });
});
