import api from "@/lib/api";
import type { WooProduct } from "./woocommerceProdutosService";

export interface InternalStoreSummary {
  id: number;
  description: string | null;
  storeUrl: string | null;
  whatsappId: number | null;
  isActive: boolean;
}

// Página do catálogo interno (loja única: sem force/storeId/whatsappId) para o "Carregar mais" do seletor. Backend anterior ignora
// `pageNumber`/`meta` e devolve a lista pura da 1ª página: aí não há "tem mais".
export async function pickInternalProductsPage(q = "", pageNumber = 1) {
  const { data } = await api.get<WooProduct[] | { products?: WooProduct[]; hasMore?: boolean }>(
    "/internal-produtos/picker",
    { params: { ...(q ? { q } : {}), pageNumber, meta: 1 } }
  );
  if (Array.isArray(data)) return { products: data, hasMore: false };
  return {
    products: Array.isArray(data?.products) ? data.products : [],
    hasMore: data?.hasMore === true,
  };
}

export async function fetchInternalStores() {
  return api.get<InternalStoreSummary[]>("/internal-produtos/stores");
}

export async function sendInternalProduct(productId: number, ticketId: number) {
  return api.post(`/internal-produtos/${productId}/send/${ticketId}`);
}
