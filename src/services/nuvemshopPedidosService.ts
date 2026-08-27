import api from "@/lib/api";
import type { NuvemshopStoreSummary } from "./nuvemshopProdutosService";

export type { NuvemshopStoreSummary };

export interface NuvemshopOrderProduct {
  id: number;
  product_id: number;
  variant_id: number;
  name: string;
  quantity: number;
  price: string;
  sku?: string;
  image?: { id: number | string; src: string } | null;
}

export interface NuvemshopOrderAddress {
  name?: string;
  phone?: string;
  address?: string;
  number?: string;
  floor?: string;
  locality?: string;
  city?: string;
  province?: string;
  zipcode?: string;
  country?: string;
}

export interface NuvemshopOrderCustomer {
  id?: number;
  name?: string;
  email?: string;
  phone?: string;
  identification?: string;
}

export interface NuvemshopOrder {
  id: number;
  number: string | number;
  status: string;          // open | closed | cancelled
  payment_status: string;  // pending | authorized | paid | abandoned | refunded | voided | ...
  shipping_status: string; // unpacked | unfulfilled | fulfilled | ...
  currency: string;
  created_at: string;
  updated_at: string;
  total: string;
  subtotal?: string;
  shipping_cost_customer?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  owner_note?: string;
  note?: string;
  payment_details?: { method?: string };
  gateway?: string;
  customer?: NuvemshopOrderCustomer;
  billing_address?: NuvemshopOrderAddress;
  shipping_address?: NuvemshopOrderAddress;
  products: NuvemshopOrderProduct[];
}

export interface NuvemshopOrderNotes {
  owner_note: string;
  note: string;
}

export interface ListOrdersResponse {
  data: NuvemshopOrder[];
  total: number;
  totalPages: number;
}

export interface FetchOrdersParams {
  page?: number;
  per_page?: number;
  status?: string;
  payment_status?: string;
  shipping_status?: string;
  q?: string;
  created_at_min?: string;
  created_at_max?: string;
  customer_ids?: number | string;
  storeId?: number | null;
}

const withStore = (storeId?: number | null, extras: Record<string, any> = {}) => ({
  ...extras,
  ...(storeId ? { storeId } : {})
});

export async function fetchNuvemshopOrders(params: FetchOrdersParams = {}) {
  const { storeId, ...rest } = params;
  return api.get<ListOrdersResponse>("/nuvemshop-pedidos", {
    params: { ...rest, ...(storeId ? { storeId } : {}) }
  });
}

export async function fetchNuvemshopOrderById(id: number, storeId: number | null = null) {
  return api.get<NuvemshopOrder>(`/nuvemshop-pedidos/${id}`, { params: withStore(storeId) });
}

export interface UpdateNuvemshopOrderInput {
  action?: "close" | "open" | "cancel";
  reason?: string;
  ownerNote?: string;
}

// Status NAO e campo livre: action close/open/cancel (cancel aceita reason) e/ou
// ownerNote (campo unico que substitui a nota interna).
export async function updateNuvemshopOrder(
  id: number,
  payload: UpdateNuvemshopOrderInput,
  storeId: number | null = null
) {
  return api.put<NuvemshopOrder>(`/nuvemshop-pedidos/${id}`, {
    ...payload,
    ...(storeId ? { storeId } : {})
  });
}

export async function fetchNuvemshopOrderNotes(id: number, storeId: number | null = null) {
  return api.get<NuvemshopOrderNotes>(`/nuvemshop-pedidos/${id}/notas`, { params: withStore(storeId) });
}

// owner_note e campo unico — define/substitui a nota interna do lojista.
export async function setNuvemshopOwnerNote(
  id: number,
  ownerNote: string,
  storeId: number | null = null
) {
  return api.post<NuvemshopOrder>(`/nuvemshop-pedidos/${id}/notas`, {
    ownerNote,
    ...(storeId ? { storeId } : {})
  });
}

export async function findNuvemshopOrderTicket(orderId: number, params: { email?: string; phone?: string }) {
  return api.get<{ ticketId: number | null }>(`/nuvemshop-pedidos/${orderId}/ticket`, { params });
}

export async function fetchNuvemshopOrderStores() {
  return api.get<NuvemshopStoreSummary[]>("/nuvemshop-pedidos/stores");
}
