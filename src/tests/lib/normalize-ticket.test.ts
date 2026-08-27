import { describe, it, expect } from "vitest";
import { normalizeTicket } from "@/lib/normalize-ticket";

describe("normalizeTicket — etiquetas", () => {
  it("usa ticket.tags quando o payload REST as traz", () => {
    const tk = normalizeTicket({
      id: 1,
      contactId: 9,
      tags: [{ id: 5, tag: "VIP", color: "#f00" }],
    });

    expect(tk.tags).toHaveLength(1);
    expect(tk.tags?.[0].id).toBe(5);
  });

  it("cai em contact.tags quando o emit so as traz no contato (ShowTicketService)", () => {
    const tk = normalizeTicket({
      id: 1,
      contact: { id: 9, name: "Test", number: "123", tags: [{ id: 7, tag: "Lead", color: "#0f0" }] },
    });

    expect(tk.tags).toHaveLength(1);
    expect(tk.tags?.[0].id).toBe(7);
  });

  it("deduplica etiquetas repetidas por id", () => {
    const tk = normalizeTicket({
      id: 1,
      tags: [
        { id: 5, tag: "VIP", color: "#f00" },
        { id: 5, tag: "VIP", color: "#f00" },
      ],
    });

    expect(tk.tags).toHaveLength(1);
  });

  it("mantem lista vazia explicita (etiquetas removidas de verdade)", () => {
    const tk = normalizeTicket({ id: 1, tags: [] });

    expect(tk.tags).toEqual([]);
  });

  it("omite a chave tags no emit magro (sem ticket.tags e sem contact.tags)", () => {
    // Sem isto o merge do store zeraria as etiquetas ja carregadas a cada
    // ticket:update magro — chip sumia do card e o ticket caia do filtro.
    const tk = normalizeTicket({ id: 1, status: "open", contactId: 9 });

    expect("tags" in tk).toBe(false);
    expect("tags" in tk.contact).toBe(false);
  });
});
