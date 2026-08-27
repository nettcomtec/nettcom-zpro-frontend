import { fetchContacts } from "@/services/contacts";

export interface MassaContact {
  id?: number;
  number: string;
  name?: string;
}

/**
 * Busca todos os contatos do tenant paginando /contacts (sem filtro de carteira/tag).
 */
export async function fetchAllContacts(): Promise<MassaContact[]> {
  const all: MassaContact[] = [];
  let page = 1;
  const maxPages = 500;
  while (page <= maxPages) {
    try {
      const { data } = await fetchContacts({ pageNumber: page });
      const list = ((data as { contacts?: MassaContact[] })?.contacts ?? (Array.isArray(data) ? (data as MassaContact[]) : [])) as MassaContact[];
      if (list.length === 0) break;
      all.push(...list.map((c) => ({ id: c.id, number: c.number, name: c.name })));
      if (list.length < 20) break;
      page += 1;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      break;
    }
  }
  return all;
}

/**
 * Busca todos os contatos de uma carteira paginando o endpoint /contacts?walletId=X.
 */
export async function fetchAllContactsForWallet(walletId: number | string): Promise<MassaContact[]> {
  const all: MassaContact[] = [];
  let page = 1;
  const pageSize = 500;
  const maxPages = 200;
  while (page <= maxPages) {
    try {
      const { data } = await fetchContacts({ pageNumber: page, pageSize, walletId: Number(walletId) });
      const list = ((data as { contacts?: MassaContact[] })?.contacts ?? (Array.isArray(data) ? (data as MassaContact[]) : [])) as MassaContact[];
      if (list.length === 0) break;
      all.push(...list.map((c) => ({ id: c.id, number: c.number, name: c.name })));
      if (list.length < pageSize) break;
      page += 1;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      break;
    }
  }
  return all;
}
