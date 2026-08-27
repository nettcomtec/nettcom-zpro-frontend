import { describe, it, expect } from "vitest";
import {
  CHAT_MAX_FILE_SIZE,
  PASTE_MAX_FILES,
  filterIncomingChatFiles,
  isChatMimeAllowed,
  namePastedFile,
  normalizeUploadFilename,
  shouldDeferPasteToText,
  validateChatFile,
} from "@/lib/chat-upload-validation";
import type {
  ChatFileRejection,
  ChatUploadPolicy,
} from "@/lib/chat-upload-validation";

const MB = 1024 * 1024;

const mk = (name: string, type: string, size = 1024): File => {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const policy = (over: Partial<ChatUploadPolicy> = {}): ChatUploadPolicy => ({
  channelType: "whatsapp",
  maxFiles: PASTE_MAX_FILES,
  maxBytes: CHAT_MAX_FILE_SIZE,
  currentCount: 0,
  ...over,
});

const names = (files: File[]) => files.map((f) => f.name);
const reasonsOf = (rejected: ChatFileRejection[]) => rejected.map((r) => r.reason);

// ──────────────────────────────────────────────────────────────────────────

describe("normalizeUploadFilename", () => {
  it("translitera o acento em vez de apagar a letra", () => {
    expect(normalizeUploadFilename("Cotação Final.pdf")).toBe("Cotacao_Final.pdf");
  });

  it("remove pontuacao nao suportada e junta espacos com _", () => {
    expect(normalizeUploadFilename("Relatório #12 (final) 50%.xlsx")).toBe(
      "Relatorio_12_final_50.xlsx",
    );
  });

  // Nome 100% nao-ASCII sobrava so como ".pdf": o multer gerava ".pdf_<ts>",
  // um dotfile que o express.static recusa com 403 (dotfiles: 'deny').
  it("nao gera dotfile para nome 100% nao-ASCII e mantem a extensao", () => {
    for (const nome of ["报价单.pdf", "Отчет.pdf", "🎉.png"]) {
      const out = normalizeUploadFilename(nome);
      expect(out.startsWith(".")).toBe(false);
      expect(out.length).toBeGreaterThan(4);
    }
    expect(normalizeUploadFilename("报价单.pdf").endsWith(".pdf")).toBe(true);
    expect(normalizeUploadFilename("Отчет.pdf").endsWith(".pdf")).toBe(true);
    expect(normalizeUploadFilename("🎉.png").endsWith(".png")).toBe(true);
  });

  it("da basename para nome que e so extensao", () => {
    expect(normalizeUploadFilename(".pdf")).toBe("arquivo.pdf");
  });

  it("da basename para nome vazio", () => {
    expect(normalizeUploadFilename("")).toBe("arquivo");
  });

  it("mantem nome sem extensao", () => {
    expect(normalizeUploadFilename("relatorio final")).toBe("relatorio_final");
  });

  it("preserva extensao dupla", () => {
    expect(normalizeUploadFilename("arquivo.tar.gz")).toBe("arquivo.tar.gz");
    expect(normalizeUploadFilename("backup do sistema.tar.gz")).toBe(
      "backup_do_sistema.tar.gz",
    );
  });

  it("trunca o basename longo preservando a extensao", () => {
    const out = normalizeUploadFilename(`${"a".repeat(300)}.pdf`);
    expect(out.endsWith(".pdf")).toBe(true);
    const base = out.slice(0, out.lastIndexOf("."));
    expect(base.length).toBeGreaterThan(0);
    expect(base.length).toBeLessThan(300);
    // multer acrescenta "_" + 17 digitos; tem de caber nos 255 bytes do FS.
    expect(out.length + 18).toBeLessThanOrEqual(255);
  });

  it("trunca depois de transliterar (resultado sempre ASCII seguro)", () => {
    const out = normalizeUploadFilename(`${"Cotação ".repeat(40)}final.pdf`);
    expect(out).toMatch(/^[\w.-]+$/);
    expect(out.endsWith(".pdf")).toBe(true);
    expect(out.length + 18).toBeLessThanOrEqual(255);
  });
});

// ──────────────────────────────────────────────────────────────────────────

describe("filterIncomingChatFiles", () => {
  describe("canal comum", () => {
    it("aceita PDF", () => {
      const pdf = mk("cotacao.pdf", "application/pdf", 2 * MB);
      const { accepted, rejected } = filterIncomingChatFiles([pdf], policy());
      expect(accepted).toHaveLength(1);
      expect(accepted[0]).toBe(pdf);
      expect(rejected).toEqual([]);
    });

    it("aceita quando o canal nao foi informado", () => {
      const pdf = mk("cotacao.pdf", "application/pdf", 2 * MB);
      const { accepted } = filterIncomingChatFiles(
        [pdf],
        policy({ channelType: null }),
      );
      expect(names(accepted)).toEqual(["cotacao.pdf"]);
    });

    it("rejeita executavel com reason type", () => {
      const files = [
        mk("virus.exe", "application/x-msdownload"),
        mk("run.bat", ""),
      ];
      const { accepted, rejected } = filterIncomingChatFiles(files, policy());
      expect(accepted).toEqual([]);
      expect(reasonsOf(rejected)).toEqual(["type", "type"]);
      expect(names(rejected.map((r) => r.file))).toEqual(["virus.exe", "run.bat"]);
    });
  });

  describe("canal text-only", () => {
    // O job de envio manda message.body (= nome do arquivo) como comentario
    // publico: anexar ali vazaria o nome do arquivo e marcaria como entregue.
    for (const canal of ["linkedin", "olx", "youtube", "tiktok"]) {
      it(`rejeita qualquer arquivo em ${canal}`, () => {
        const files = [
          mk("foto.png", "image/png", 100 * 1024),
          mk("cotacao.pdf", "application/pdf", 1 * MB),
          mk("audio.mp3", "audio/mpeg", 1 * MB),
        ];
        const { accepted, rejected } = filterIncomingChatFiles(
          files,
          policy({ channelType: canal }),
        );
        expect(accepted).toEqual([]);
        expect(reasonsOf(rejected)).toEqual([
          "channelNoFile",
          "channelNoFile",
          "channelNoFile",
        ]);
      });
    }

    it("normaliza o canal em maiuscula", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("foto.png", "image/png")],
        policy({ channelType: "LinkedIn" }),
      );
      expect(accepted).toEqual([]);
      expect(reasonsOf(rejected)).toEqual(["channelNoFile"]);
    });
  });

  describe("instagram", () => {
    it("aceita imagem", () => {
      const png = mk("foto.png", "image/png", 1 * MB);
      const { accepted, rejected } = filterIncomingChatFiles(
        [png],
        policy({ channelType: "instagram" }),
      );
      expect(names(accepted)).toEqual(["foto.png"]);
      expect(rejected).toEqual([]);
    });

    it("rejeita documento com reason channelNoDoc", () => {
      const pdf = mk("cotacao.pdf", "application/pdf", 1 * MB);
      const { accepted, rejected } = filterIncomingChatFiles(
        [pdf],
        policy({ channelType: "instagram" }),
      );
      expect(accepted).toEqual([]);
      expect(reasonsOf(rejected)).toEqual(["channelNoDoc"]);
      expect(rejected[0].file).toBe(pdf);
    });
  });

  describe("hub", () => {
    it("aceita imagem", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("foto.png", "image/png", 1 * MB)],
        policy({ channelType: "hub_whatsapp" }),
      );
      expect(names(accepted)).toEqual(["foto.png"]);
      expect(rejected).toEqual([]);
    });

    it("rejeita documento com reason channelNoDoc", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("cotacao.pdf", "application/pdf", 1 * MB)],
        policy({ channelType: "hub_whatsapp" }),
      );
      expect(accepted).toEqual([]);
      expect(reasonsOf(rejected)).toEqual(["channelNoDoc"]);
    });
  });

  describe("waba", () => {
    const wabaPolicy = policy({ channelType: "waba" });

    it("aceita PDF de 50MB (limite Meta de documento e 100MB)", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("contrato.pdf", "application/pdf", 50 * MB)],
        wabaPolicy,
      );
      expect(names(accepted)).toEqual(["contrato.pdf"]);
      expect(rejected).toEqual([]);
    });

    it("rejeita PDF de 150MB com channelSize e os tamanhos preenchidos", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("contrato.pdf", "application/pdf", 150 * MB)],
        wabaPolicy,
      );
      expect(accepted).toEqual([]);
      expect(reasonsOf(rejected)).toEqual(["channelSize"]);
      expect(rejected[0].maxSizeMB).toBe("100.0");
      expect(rejected[0].fileSizeMB).toBe("150.0");
    });

    // Mudanca de comportamento declarada: o limite Meta de IMAGEM e 5MB,
    // menor que o teto generico do chat.
    it("rejeita PNG de 8MB (limite Meta de imagem e 5MB)", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("foto.png", "image/png", 8 * MB)],
        wabaPolicy,
      );
      expect(accepted).toEqual([]);
      expect(reasonsOf(rejected)).toEqual(["channelSize"]);
      expect(rejected[0].maxSizeMB).toBe("5.0");
      expect(rejected[0].fileSizeMB).toBe("8.0");
    });

    it("rejeita zip com reason channelType", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("backup.zip", "application/zip", 1 * MB)],
        wabaPolicy,
      );
      expect(accepted).toEqual([]);
      expect(reasonsOf(rejected)).toEqual(["channelType"]);
      expect(rejected[0].maxSizeMB).toBeUndefined();
    });
  });

  describe("messenger", () => {
    // Regressao fechada pelo gate novo: checkFileForChannel so era chamado sob
    // isWabaLike, entao os 25MB da tabela do Messenger nunca eram aplicados.
    it("rejeita arquivo acima de 25MB mesmo com teto generico folgado", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("contrato.pdf", "application/pdf", 30 * MB)],
        policy({ channelType: "messenger", maxBytes: CHAT_MAX_FILE_SIZE }),
      );
      expect(accepted).toEqual([]);
      expect(reasonsOf(rejected)).toEqual(["channelSize"]);
      expect(rejected[0].maxSizeMB).toBe("25.0");
      expect(rejected[0].fileSizeMB).toBe("30.0");
    });

    it("aceita arquivo dentro do limite do canal", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("contrato.pdf", "application/pdf", 10 * MB)],
        policy({ channelType: "messenger" }),
      );
      expect(names(accepted)).toEqual(["contrato.pdf"]);
      expect(rejected).toEqual([]);
    });
  });

  describe("cap de arquivos", () => {
    const pdfs = (qtd: number) =>
      Array.from({ length: qtd }, (_, i) =>
        mk(`doc-${i}.pdf`, "application/pdf", 1 * MB),
      );

    it("conta os arquivos ja staged (currentCount) no cap", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        pdfs(4),
        policy({ maxFiles: 5, currentCount: 3 }),
      );
      expect(names(accepted)).toEqual(["doc-0.pdf", "doc-1.pdf"]);
      expect(reasonsOf(rejected)).toEqual(["cap", "cap"]);
      expect(names(rejected.map((r) => r.file))).toEqual([
        "doc-2.pdf",
        "doc-3.pdf",
      ]);
    });

    it("rejeita tudo quando o cap ja esta cheio", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        pdfs(2),
        policy({ maxFiles: PASTE_MAX_FILES, currentCount: PASTE_MAX_FILES }),
      );
      expect(accepted).toEqual([]);
      expect(reasonsOf(rejected)).toEqual(["cap", "cap"]);
    });

    it("aceita ate maxFiles numa colagem unica", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        pdfs(PASTE_MAX_FILES + 1),
        policy({ maxFiles: PASTE_MAX_FILES, currentCount: 0 }),
      );
      expect(accepted).toHaveLength(PASTE_MAX_FILES);
      expect(reasonsOf(rejected)).toEqual(["cap"]);
    });
  });

  describe("teto generico (maxBytes)", () => {
    it("aplica o teto em canal nao restrito", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("contrato.pdf", "application/pdf", 20 * MB)],
        policy({ channelType: "whatsapp", maxBytes: 10 * MB }),
      );
      expect(accepted).toEqual([]);
      expect(reasonsOf(rejected)).toEqual(["size"]);
    });

    it("nao aplica o teto em canal restrito (a tabela do canal ja julgou)", () => {
      const { accepted, rejected } = filterIncomingChatFiles(
        [mk("contrato.pdf", "application/pdf", 20 * MB)],
        policy({ channelType: "waba", maxBytes: 10 * MB }),
      );
      expect(names(accepted)).toEqual(["contrato.pdf"]);
      expect(rejected).toEqual([]);
    });
  });

  describe("precedencia dos gates", () => {
    it("canal text-only vence o gate de tipo", () => {
      const { rejected } = filterIncomingChatFiles(
        [mk("virus.exe", "application/x-msdownload")],
        policy({ channelType: "linkedin" }),
      );
      expect(reasonsOf(rejected)).toEqual(["channelNoFile"]);
    });
  });

  it("separa aceitos e rejeitados preservando a ordem de entrada", () => {
    const files = [
      mk("a.pdf", "application/pdf", 1 * MB),
      mk("b.exe", "application/x-msdownload"),
      mk("c.png", "image/png", 1 * MB),
    ];
    const { accepted, rejected } = filterIncomingChatFiles(files, policy());
    expect(names(accepted)).toEqual(["a.pdf", "c.png"]);
    expect(names(rejected.map((r) => r.file))).toEqual(["b.exe"]);
  });

  it("devolve listas vazias para entrada vazia", () => {
    expect(filterIncomingChatFiles([], policy())).toEqual({
      accepted: [],
      rejected: [],
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────

describe("shouldDeferPasteToText", () => {
  // Excel/Word no Windows publicam CF_DIB junto com o texto; sem o guard,
  // copiar um intervalo do Excel anexa um print e engole o texto.
  it("deixa o texto ganhar quando o unico arquivo e bitmap sintetico", () => {
    expect(
      shouldDeferPasteToText(
        ["text/plain", "text/html", "Files"],
        [mk("image.png", "image/png")],
      ),
    ).toBe(true);
  });

  // "Copiar imagem" de uma pagina web escreve o bitmap + um text/html com o
  // <img src=...> e nenhum text/plain. Deferir aqui matava o paste de imagem
  // copiada do navegador (inclusive a do proprio ticket).
  it("deixa o arquivo ganhar quando ha text/html mas nenhum text/plain", () => {
    expect(
      shouldDeferPasteToText(["text/html", "Files"], [mk("image.png", "image/png")]),
    ).toBe(false);
  });

  it("deixa o arquivo ganhar quando ele tem nome real", () => {
    expect(
      shouldDeferPasteToText(
        ["text/plain", "Files"],
        [mk("cotacao.pdf", "application/pdf")],
      ),
    ).toBe(false);
  });

  it("defere quando nao ha arquivo nenhum", () => {
    expect(shouldDeferPasteToText(["text/plain"], [])).toBe(true);
    expect(shouldDeferPasteToText([], [])).toBe(true);
  });

  it("nao defere quando so ha arquivo, sem texto", () => {
    expect(shouldDeferPasteToText(["Files"], [mk("image.png", "image/png")])).toBe(
      false,
    );
  });

  it("nao defere no misto (bitmap sintetico + arquivo real)", () => {
    expect(
      shouldDeferPasteToText(
        ["text/plain", "Files"],
        [mk("image.png", "image/png"), mk("cotacao.pdf", "application/pdf")],
      ),
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────

describe("namePastedFile", () => {
  const NOW = 1700000000000;

  // Recriar via new File([f], ...) refaz o Blob: pico de heap num PDF grande.
  it("devolve a MESMA instancia quando o nome ja e bom", () => {
    const pdf = mk("cotacao.pdf", "application/pdf", 40 * MB);
    expect(namePastedFile(pdf, NOW)).toBe(pdf);
  });

  it("renomeia o sentinela image.png do Blink", () => {
    const png = mk("image.png", "image/png");
    const out = namePastedFile(png, NOW);
    expect(out).not.toBe(png);
    expect(out.name).toBe(`pasted-image-${NOW}.png`);
    expect(out.type).toBe("image/png");
  });

  it("renomeia arquivo sem nome", () => {
    expect(namePastedFile(mk("", "image/png"), NOW).name).toBe(
      `pasted-image-${NOW}.png`,
    );
  });

  it("usa prefixo e extensao de video para video/mp4 sem nome", () => {
    expect(namePastedFile(mk("", "video/mp4"), NOW).name).toBe(
      `pasted-video-${NOW}.mp4`,
    );
  });

  it("mapeia os demais mimes de video conhecidos", () => {
    expect(namePastedFile(mk("", "video/webm"), NOW).name).toBe(
      `pasted-video-${NOW}.webm`,
    );
    expect(namePastedFile(mk("", "video/quicktime"), NOW).name).toBe(
      `pasted-video-${NOW}.mov`,
    );
  });

  it("cai em .mp4 para mime de video desconhecido", () => {
    expect(namePastedFile(mk("", "video/x-matroska"), NOW).name).toBe(
      `pasted-video-${NOW}.mp4`,
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────

describe("isChatMimeAllowed / validateChatFile", () => {
  it("bloqueia executavel mesmo com mime de imagem forjado", () => {
    for (const nome of ["payload.exe", "payload.ps1", "payload.jar"]) {
      const f = mk(nome, "image/png");
      expect(isChatMimeAllowed(f)).toBe(false);
      expect(validateChatFile(f)).toBe("type");
    }
  });

  it("bloqueia extensao perigosa com mime vazio", () => {
    expect(isChatMimeAllowed(mk("script.vbs", ""))).toBe(false);
    expect(isChatMimeAllowed(mk("instalador.msi", ""))).toBe(false);
  });

  // Caso normal, nao borda: o Chromium deixa file.type vazio para varias
  // extensoes de documento/arquivo compactado.
  it("aceita por extensao quando file.type vem vazio", () => {
    for (const nome of ["cotacao.pdf", "contrato.docx", "backup.7z", "fotos.rar", "texto.odt"]) {
      expect(isChatMimeAllowed(mk(nome, ""))).toBe(true);
      expect(validateChatFile(mk(nome, ""))).toBeNull();
    }
  });

  it("aceita midia por prefixo de mime", () => {
    expect(isChatMimeAllowed(mk("foto.jpg", "image/jpeg"))).toBe(true);
    expect(isChatMimeAllowed(mk("audio.ogg", "audio/ogg"))).toBe(true);
    expect(isChatMimeAllowed(mk("video.mp4", "video/mp4"))).toBe(true);
  });

  it("rejeita mime desconhecido sem extensao de fallback", () => {
    expect(isChatMimeAllowed(mk("dados.bin", "application/octet-stream"))).toBe(false);
  });

  it("rejeita acima do teto de 100MB e aceita exatamente no teto", () => {
    expect(validateChatFile(mk("contrato.pdf", "application/pdf", CHAT_MAX_FILE_SIZE + 1))).toBe(
      "size",
    );
    expect(validateChatFile(mk("contrato.pdf", "application/pdf", CHAT_MAX_FILE_SIZE))).toBeNull();
  });
});
