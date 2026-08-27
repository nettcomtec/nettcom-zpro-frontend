import api from "@/lib/api";
import type { WooProduct } from "./woocommerceProdutosService";

export interface InternalStoreSummary {
  id: number;
  description: string | null;
  storeUrl: string | null;
  whatsappId: number | null;
  isActive: boolean;
}

// Assinatura compatível com pickWooProducts/pickNuvemshopProducts (o picker chama
// todas igual). Catálogo interno ignora force/storeId/whatsappId (loja única).
export async function pickInternalProducts(
  q = "",
  _force = false,
  _storeId: number | null = null,
  _whatsappId: number | null = null
) {
  return api.get<WooProduct[]>("/internal-produtos/picker", {
    params: { ...(q ? { q } : {}) }
  });
}

export async function fetchInternalStores() {
  return api.get<InternalStoreSummary[]>("/internal-produtos/stores");
}

export async function sendInternalProduct(productId: number, ticketId: number) {
  return api.post(`/internal-produtos/${productId}/send/${ticketId}`);
}
