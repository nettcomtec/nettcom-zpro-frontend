// Filtro por endereço do contato (bairro, cidade, UF do cadastro) — PLANO_ENDERECO_COMPLETO_CONTATO.
// Quem garante o resultado é o SQL do backend MAIS o eco: toda resposta de backend que entende o
// filtro traz `addressFilter: true`. Sem o eco, com filtro ativo, a tela aborta — um backend antigo
// ignora os params e devolveria a base inteira (massa iria para todo mundo).

export interface AddressFilter {
  bairro: string;
  cidade: string;
  ufs: string[];
}

export const EMPTY_ADDRESS_FILTER: AddressFilter = { bairro: "", cidade: "", ufs: [] };

export function normalizeAddressFilter(filter?: Partial<AddressFilter> | null): AddressFilter {
  const ufs = Array.from(
    new Set((filter?.ufs ?? []).map((uf) => String(uf).trim().toUpperCase()).filter(Boolean))
  ).sort();
  return {
    bairro: (filter?.bairro ?? "").replace(/\s+/g, " ").trim(),
    cidade: (filter?.cidade ?? "").replace(/\s+/g, " ").trim(),
    ufs,
  };
}

export function isAddressFilterActive(filter?: Partial<AddressFilter> | null): boolean {
  const f = normalizeAddressFilter(filter);
  return !!f.bairro || !!f.cidade || f.ufs.length > 0;
}

// Quantos critérios estão ativos (bairro, cidade, UF) — para o contador.
export function addressFilterActiveCount(filter?: Partial<AddressFilter> | null): number {
  const f = normalizeAddressFilter(filter);
  return (f.bairro ? 1 : 0) + (f.cidade ? 1 : 0) + (f.ufs.length > 0 ? 1 : 0);
}

export interface AddressFilterQuery {
  addressBairro?: string;
  addressCidade?: string;
  // CSV numa chave só: chave repetida vira objeto no qs acima do arrayLimit.
  addressUfs?: string;
}

// Params para GET /contacts, /contacts/export(/count), /contacts-report-campaign e a busca da API.
export function toAddressQuery(filter?: Partial<AddressFilter> | null): AddressFilterQuery {
  const f = normalizeAddressFilter(filter);
  const query: AddressFilterQuery = {};
  if (f.bairro) query.addressBairro = f.bairro;
  if (f.cidade) query.addressCidade = f.cidade;
  if (f.ufs.length > 0) query.addressUfs = f.ufs.join(",");
  return query;
}

export function sameAddressFilter(
  a?: Partial<AddressFilter> | null,
  b?: Partial<AddressFilter> | null
): boolean {
  const x = normalizeAddressFilter(a);
  const y = normalizeAddressFilter(b);
  return x.bairro === y.bairro && x.cidade === y.cidade && x.ufs.join(",") === y.ufs.join(",");
}

export class AddressFilterUnsupportedError extends Error {
  readonly code = "ERR_ADDRESS_FILTER_UNSUPPORTED";

  constructor() {
    super("ERR_ADDRESS_FILTER_UNSUPPORTED");
    this.name = "AddressFilterUnsupportedError";
  }
}

// Eco de suporte: `addressFilter === true` na resposta (envelope do GET /contacts, da contagem
// do export e do /contacts-report-campaign; `meta.addressFilter` na busca da API externa).
export function hasAddressFilterEcho(data: unknown): boolean {
  return !!data && typeof data === "object" && (data as { addressFilter?: unknown }).addressFilter === true;
}

// Lança AddressFilterUnsupportedError quando o filtro está ativo e a resposta não tem o eco.
export function assertAddressFilterEcho(filter: Partial<AddressFilter> | null | undefined, data: unknown): void {
  if (isAddressFilterActive(filter) && !hasAddressFilterEcho(data)) {
    throw new AddressFilterUnsupportedError();
  }
}
