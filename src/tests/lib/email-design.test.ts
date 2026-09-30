import { describe, it, expect } from "vitest";
import {
  EMAIL_RENDER_STYLE_ALLOWLIST,
  EMAIL_RENDER_ATTRIBUTE_ALLOWLIST,
  buildStarterDesign,
  countDesignIssues,
  createBlock,
  createEmptyDesign,
  duplicateBlock,
  getBlockIssue,
  insertBlock,
  isInsecureImage,
  isNewerDesign,
  moveBlock,
  parseDesignFile,
  parseEmailDesign,
  renderBlockHtml,
  renderEmailHtml,
  serializeDesignFile,
  utf8Bytes,
  type EmailBlock,
  type EmailDesign
} from "@/lib/email-design";

const texts = { heading: "Olá", text: "Linha 1\nLinha 2", button: "Saiba mais" };

function fullDesign(): EmailDesign {
  let design = createEmptyDesign("rtl");
  const heading = { ...createBlock("heading", texts), italic: true };
  const text = createBlock("text", texts);
  const image = { ...createBlock("image"), src: "https://cdn.exemplo.com/banner.png", alt: "Banner" };
  const button = { ...createBlock("button", texts), href: "tel:+5511999999999", radius: 24 };
  const divider = { ...createBlock("divider"), thickness: 4 };
  const spacer = { ...createBlock("spacer"), height: 40 };
  for (const block of [heading, text, image, button, divider, spacer]) {
    design = insertBlock(design, block as never);
  }
  return design;
}

const styleProps = (html: string): string[] =>
  [...html.matchAll(/style="([^"]*)"/g)].flatMap(m =>
    m[1]
      .split(";")
      .map(d => d.split(":")[0].trim())
      .filter(Boolean)
  );

const tagsWithAttrs = (html: string): Array<{ tag: string; attrs: string[] }> =>
  [...html.matchAll(/<([a-z0-9]+)((?:\s[^>]*)?)>/gi)].map(m => ({
    tag: m[1].toLowerCase(),
    attrs: [...(m[2] || "").matchAll(/([a-zA-Z-]+)=/g)].map(a => a[1].toLowerCase())
  }));

describe("email-design: schema", () => {
  it("accepts the empty design and a full design", () => {
    expect(parseEmailDesign(createEmptyDesign())).not.toBeNull();
    expect(parseEmailDesign(fullDesign())).not.toBeNull();
    expect(parseEmailDesign(JSON.stringify(fullDesign()))).not.toBeNull();
  });

  it("rejects invalid colors, unknown keys and duplicate ids", () => {
    const design = fullDesign();
    expect(parseEmailDesign({ ...design, settings: { ...design.settings, backgroundColor: "red" } })).toBeNull();
    expect(parseEmailDesign({ ...design, extra: true })).toBeNull();
    const dup = { ...design, blocks: [design.blocks[0], design.blocks[0]] };
    expect(parseEmailDesign(dup)).toBeNull();
  });

  it("requires a literal scheme on links (token at the start is rejected)", () => {
    const design = fullDesign();
    const withHref = (href: string) => ({
      ...design,
      blocks: design.blocks.map(b => (b.type === "button" ? { ...b, href } : b))
    });
    expect(parseEmailDesign(withHref("{{name}}"))).toBeNull();
    expect(parseEmailDesign(withHref("javascript:alert(1)"))).toBeNull();
    expect(parseEmailDesign(withHref("data:text/html,x"))).toBeNull();
    expect(parseEmailDesign(withHref("https://site.com/?e={{email}}"))).not.toBeNull();
    expect(parseEmailDesign(withHref("mailto:{{email}}"))).not.toBeNull();
    expect(parseEmailDesign(withHref(""))).not.toBeNull();
  });

  it("detects newer designs", () => {
    expect(isNewerDesign({ version: 2 })).toBe(true);
    expect(isNewerDesign({ version: 1 })).toBe(false);
    expect(isNewerDesign(null)).toBe(false);
  });
});

describe("email-design: issues", () => {
  it("flags empty text, invalid link and missing image", () => {
    expect(getBlockIssue(createBlock("text"))).toBe("text");
    expect(getBlockIssue({ ...createBlock("button", texts), href: "" } as EmailBlock)).toBe("href");
    expect(getBlockIssue({ ...createBlock("button", texts), href: "https://" } as EmailBlock)).toBe("href");
    expect(getBlockIssue(createBlock("image"))).toBe("imageSrc");
    expect(getBlockIssue(createBlock("divider"))).toBeNull();
    expect(countDesignIssues(fullDesign())).toBe(0);
  });

  it("warns only for http images", () => {
    expect(isInsecureImage("http://x.com/a.png")).toBe(true);
    expect(isInsecureImage("https://x.com/a.png")).toBe(false);
  });
});

describe("email-design: render", () => {
  it("escapes text and keeps variable tokens", () => {
    const design = insertBlock(createEmptyDesign(), createBlock("text", { text: '<script>alert("x")</script> {{firstName}}' }));
    const html = renderEmailHtml(design);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("{{firstName}}");
  });

  it("emits only allowlisted styles and attributes", () => {
    const html = renderEmailHtml(fullDesign());
    const allowedStyles = new Set<string>(EMAIL_RENDER_STYLE_ALLOWLIST);
    for (const prop of styleProps(html)) expect(allowedStyles.has(prop)).toBe(true);
    for (const { tag, attrs } of tagsWithAttrs(html)) {
      const allowed = EMAIL_RENDER_ATTRIBUTE_ALLOWLIST[tag];
      expect(allowed, `tag ${tag}`).toBeDefined();
      for (const attr of attrs) expect(allowed).toContain(attr);
    }
    expect(html).not.toMatch(/<!--/);
    expect(html).not.toMatch(/class=|data-/);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('href="tel:+5511999999999"');
    expect(html).toContain("border-radius:24px");
    expect(html).toContain("font-style:italic");
    // Sem isto a tabela externa cresce até a interna e o e-mail não encolhe no celular
    expect(html).toContain("table-layout:fixed");
  });

  it("returns empty html for a design without blocks", () => {
    expect(renderEmailHtml(createEmptyDesign())).toBe("");
  });

  it("never renders links in canvas mode", () => {
    const button = { ...createBlock("button", texts), href: "https://site.com" } as EmailBlock;
    const html = renderBlockHtml(button, createEmptyDesign(), { forCanvas: true });
    expect(html).not.toContain("<a");
    expect(html).toContain("<span");
  });
});

describe("email-design: helpers", () => {
  it("builds valid starters", () => {
    expect(parseEmailDesign(buildStarterDesign("welcome", texts))).not.toBeNull();
    expect(parseEmailDesign(buildStarterDesign("news", texts, "rtl"))).not.toBeNull();
  });

  it("moves and duplicates blocks", () => {
    const design = fullDesign();
    const moved = moveBlock(design, 0, 2);
    expect(moved.blocks[2].id).toBe(design.blocks[0].id);
    const duplicated = duplicateBlock(design, design.blocks[1].id);
    expect(duplicated.blocks).toHaveLength(design.blocks.length + 1);
    expect(duplicated.blocks[2].id).not.toBe(design.blocks[1].id);
  });

  it("round-trips the design file and rejects foreign files", () => {
    const design = fullDesign();
    expect(parseDesignFile(serializeDesignFile(design))).toEqual(design);
    expect(parseDesignFile('{"type":"other","design":{}}')).toBeNull();
    expect(parseDesignFile("not json")).toBeNull();
  });

  it("omits href for an empty button link (sanitizer would drop href=\"\")", () => {
    const design = insertBlock(createEmptyDesign(), { ...createBlock("button", texts), href: "" } as EmailBlock);
    const html = renderEmailHtml(design);
    expect(html).toContain("<a target=\"_blank\"");
    expect(html).not.toContain('href=""');
  });

  it("measures utf-8 bytes", () => {
    expect(utf8Bytes("abc")).toBe(3);
    expect(utf8Bytes("日本")).toBe(6);
  });
});
