import { fetchContacts } from "@/services/contacts";
import {
  type AddressFilter,
  AddressFilterUnsupportedError,
  hasAddressFilterEcho,
  isAddressFilterActive,
  toAddressQuery,
} from "@/lib/address-filter";

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
 * Com filtro de endereço ativo, toda página precisa do eco `addressFilter: true` (backend
 * antigo ignora os params e devolveria a carteira inteira): sem ele lança
 * AddressFilterUnsupportedError, conferido antes de mapear as linhas e lançado fora do try.
 * `isCurrent` (opcional) para a paginação quando quem pediu já descartou a carga.
 */
export async function fetchAllContactsForWallet(
  walletId: number | string,
  addressFilter?: AddressFilter | null,
  isCurrent?: () => boolean
): Promise<MassaContact[]> {
  const addressQuery = toAddressQuery(addressFilter);
  const requireEcho = isAddressFilterActive(addressFilter);
  const all: MassaContact[] = [];
  let unsupported = false;
  let page = 1;
  const pageSize = 500;
  const maxPages = 200;
  while (page <= maxPages) {
    if (isCurrent && !isCurrent()) break;
    try {
      const { data } = await fetchContacts({ pageNumber: page, pageSize, walletId: Number(walletId), ...addressQuery });
      if (requireEcho && !hasAddressFilterEcho(data)) {
        unsupported = true;
        break;
      }
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
  // Fora do try: o catch da paginação engoliria o erro e a massa sairia sem aviso.
  if (unsupported) throw new AddressFilterUnsupportedError();
  return all;
}
