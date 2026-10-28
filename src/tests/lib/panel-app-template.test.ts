import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  checkPanelAppTemplate,
  findTemplateVariables,
  isSafeLaunchedPanelAppUrl,
  panelAppTemplateWarnings,
  panelAppVariablesForScope,
  samplePanelAppUrl,
  selectContextPanelApps,
  selectMenuPanelApps,
  templateNeedsLaunch,
  type PanelAppNavEntry,
} from "@/lib/panel-apps";

/**
 * Endereço com variáveis dos aplicativos personalizados (fase 2): as regras moram em
 * `backend/src/services/PanelAppServices/PanelAppTemplateZPRO.ts` e o front tem uma
 * cópia em `lib/panel-apps.ts` (bloco entre "Espelho de" e "Fim do espelho"). Os dois
 * códigos precisam ser iguais (a tela avisa o mesmo que o servidor recusa).
 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1")
    .replace(/\s+/g, "");

const mirrorBlock = (src: string) => {
  const start = src.indexOf("// Espelho de ");
  const end = src.indexOf("// Fim do espelho.");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(src.indexOf("\n", start) + 1, end);
};

describe("panel-app-template (espelho do backend)", () => {
  it("o bloco espelhado é o mesmo código nos dois lados", () => {
    const front = fs.readFileSync(path.resolve(__dirname, "../../lib/panel-apps.ts"), "utf8");
    const back = fs.readFileSync(
      path.resolve(__dirname, "../../../../backend/src/services/PanelAppServices/PanelAppTemplateZPRO.ts"),
      "utf8"
    );
    expect(stripComments(mirrorBlock(front))).toBe(stripComments(mirrorBlock(back)));
  });

  it("acha as duas formas, só com nome conhecido e na caixa exata", () => {
    expect(findTemplateVariables("https://x.com/a/{{contactId}}?n={{name}}#t={{token}}")).toEqual([
      "contactId",
      "name",
      "token",
    ]);
    expect(findTemplateVariables("https://x.com/a/%7B%7BphoneNumber%7D%7D/%7b%7bticketId%7d%7d")).toEqual([
      "phoneNumber",
      "ticketId",
    ]);
    expect(findTemplateVariables("https://x.com/?a={{Name}}&b={{foo}}")).toEqual([]);
    expect(templateNeedsLaunch("https://x.com/{{foo}}")).toBe(false);
    expect(templateNeedsLaunch(new URL("https://x.com/c/{{contactId}}").toString())).toBe(true);
  });

  it("variável no esquema, host, porta ou usuário é recusada", () => {
    expect(checkPanelAppTemplate("https://{{tenantId}}.example.com/x", { scope: "tenant" })).toBe(
      "ERR_PANEL_APP_VARIABLE_IN_HOST"
    );
    expect(checkPanelAppTemplate("https://EXAMPLE{{tenantId}}.com/", { scope: "tenant" })).toBe(
      "ERR_PANEL_APP_VARIABLE_IN_HOST"
    );
    expect(checkPanelAppTemplate("https://example.com:{{contactId}}/", { scope: "tenant" })).toBe(
      "ERR_PANEL_APP_VARIABLE_IN_HOST"
    );
    expect(checkPanelAppTemplate("https:{{tenantId}}//evil.com", { scope: "tenant" })).toBe(
      "ERR_PANEL_APP_VARIABLE_IN_HOST"
    );
    expect(checkPanelAppTemplate("https://{{currentUserId}}@example.com/", { scope: "tenant" })).toBe(
      "ERR_PANEL_APP_VARIABLE_IN_HOST"
    );
    expect(checkPanelAppTemplate("foo/{{contactId}}", { scope: "tenant" })).toBe("ERR_PANEL_APP_URL_INVALID");
  });

  it("texto livre só depois de ? ou #; ids, protocolo, telefone e ficha no caminho", () => {
    expect(checkPanelAppTemplate("https://crm.com/cliente/{{name}}/ficha", { scope: "tenant" })).toBe(
      "ERR_PANEL_APP_VARIABLE_IN_PATH"
    );
    expect(checkPanelAppTemplate("https://crm.com/cliente/%7B%7Bemail%7D%7D", { scope: "tenant" })).toBe(
      "ERR_PANEL_APP_VARIABLE_IN_PATH"
    );
    expect(
      checkPanelAppTemplate("https://crm.com/c/{{phoneNumber}}?nome={{name}}#t={{token}}", { scope: "tenant" })
    ).toBeNull();
    expect(checkPanelAppTemplate("https://crm.com/c#n={{name}}", { scope: "tenant" })).toBeNull();
    expect(checkPanelAppTemplate("https://crm.com/c/{{contactId}}/{{protocol}}/{{token}}", { scope: "tenant" })).toBeNull();
  });

  it("global só com quem abre, a empresa e a ficha; ficha só com https", () => {
    expect(checkPanelAppTemplate("https://x.com/?c={{contactId}}", { scope: "global" })).toBe(
      "ERR_PANEL_APP_VARIABLE_NOT_ALLOWED"
    );
    expect(
      checkPanelAppTemplate("https://x.com/u/{{currentUserId}}?e={{currentUserEmail}}&t={{tenantId}}#{{token}}", {
        scope: "global",
      })
    ).toBeNull();
    expect(checkPanelAppTemplate("http://x.com/?t={{token}}", { scope: "tenant" })).toBe(
      "ERR_PANEL_APP_TOKEN_HTTPS_REQUIRED"
    );
    expect(checkPanelAppTemplate("http://x.com/?c={{contactId}}", { scope: "tenant" })).toBeNull();
    expect(panelAppVariablesForScope("global").map((v) => v.name)).toEqual([
      "currentUserId",
      "currentUserName",
      "currentUserEmail",
      "tenantId",
      "token",
    ]);
    expect(panelAppVariablesForScope("tenant")).toHaveLength(14);
  });

  it("exemplo troca as variáveis por valores de exemplo codificados", () => {
    const sample = samplePanelAppUrl("https://crm.com/c/{{phoneNumber}}?nome={{name}}#t={{token}}");
    expect(sample).toBe("https://crm.com/c/5511999990000?nome=Ana%20Lima#t=TOKEN");
    expect(samplePanelAppUrl("https://crm.com/sem-variavel")).toBe("https://crm.com/sem-variavel");
  });

  it("avisos: vazia pelo menu, vazia pelo contato, vazio no caminho, http com variável", () => {
    const w = panelAppTemplateWarnings("http://crm.com/c/{{phoneNumber}}/{{ticketId}}?n={{name}}", {
      placements: ["menu", "contact"],
    });
    expect(w.emptyFromMenu).toBe(true);
    expect(w.emptyFromContact).toBe(true);
    expect(w.maybeEmptyInPath).toEqual(["phoneNumber", "ticketId"]);
    expect(w.httpWithVariables).toBe(true);
    const none = panelAppTemplateWarnings("https://crm.com/u/{{currentUserId}}", { placements: ["menu"] });
    expect(none).toEqual({ emptyFromMenu: false, emptyFromContact: false, maybeEmptyInPath: [], httpWithVariables: false });
  });

  it("link lançado aceita até 4096 e as mesmas regras de protocolo", () => {
    const long = `https://crm.com/x?t=${"a".repeat(3000)}`;
    expect(isSafeLaunchedPanelAppUrl(long, "embed")).toBe(true);
    expect(isSafeLaunchedPanelAppUrl(`https://crm.com/x?t=${"a".repeat(4100)}`, "embed")).toBe(false);
    expect(isSafeLaunchedPanelAppUrl("http://crm.com/x", "embed")).toBe(false);
    expect(isSafeLaunchedPanelAppUrl("http://crm.com/x", "new_tab")).toBe(true);
    expect(isSafeLaunchedPanelAppUrl("javascript:alert(1)", "new_tab")).toBe(false);
  });

  it("menu × contexto: v1 sem lugares é menu; contexto só da empresa com o lugar", () => {
    const base = { name: "x", url: "https://x.com", icon: "app-window", category: "ferramentas", position: 0, openMode: "embed" as const, embedCheck: null };
    const apps: PanelAppNavEntry[] = [
      { ...base, id: 1, scope: "tenant" },
      { ...base, id: 2, scope: "tenant", placements: ["contact"] },
      { ...base, id: 3, scope: "tenant", placements: ["menu", "ticket"] },
      { ...base, id: 4, scope: "global", placements: ["menu"] },
    ];
    expect(selectMenuPanelApps(apps).map((a) => a.id)).toEqual([1, 3, 4]);
    expect(selectContextPanelApps(apps, "contact").map((a) => a.id)).toEqual([2]);
    expect(selectContextPanelApps(apps, "ticket").map((a) => a.id)).toEqual([3]);
  });
});
