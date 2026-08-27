import api from "@/lib/api";
import type { WooStoreSummary } from "./woocommerceProdutosService";

export type { WooStoreSummary };

export interface WooOrderLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  total: string;
  subtotal: string;
  sku: string;
  price: number;
  image?: { id: number | string; src: string };
}

export interface WooOrderAddress {
  first_name: string;
  last_name: string;
  company?: string;
  address_1: string;
  address_2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

export interface WooOrder {
  id: number;
  number: string;
  status: string;
  currency: string;
  date_created: string;
  date_modified: string;
  total: string;
  subtotal?: string;
  shipping_total: string;
  total_tax: string;
  customer_id: number;
  customer_note: string;
  payment_method: string;
  payment_method_title: string;
  billing: WooOrderAddress;
  shipping: WooOrderAddress;
  line_items: WooOrderLineItem[];
}

export interface WooOrderNote {
  id: number;
  author: string;
  date_created: string;
  note: string;
  customer_note: boolean;
}

export interface ListOrdersResponse {
  data: WooOrder[];
  total: number;
  totalPages: number;
}

export interface FetchOrdersParams {
  page?: number;
  per_page?: number;
  status?: string;
  search?: string;
  after?: string;
  before?: string;
  customer?: number;
  storeId?: number | null;
}

const withStore = (storeId?: number | null, extras: Record<string, any> = {}) => ({
  ...extras,
  ...(storeId ? { storeId } : {})
});

export async function fetchWooOrders(params: FetchOrdersParams = {}) {
  const { storeId, ...rest } = params;
  return api.get<ListOrdersResponse>("/woocommerce-pedidos", {
    params: { ...rest, ...(storeId ? { storeId } : {}) }
  });
}

export async function fetchWooOrderById(id: number, storeId: number | null = null) {
  return api.get<WooOrder>(`/woocommerce-pedidos/${id}`, {
    params: withStore(storeId)
  });
}

export async function updateWooOrder(
  id: number,
  payload: { status?: string; customer_note?: string },
  storeId: number | null = null
) {
  return api.put<WooOrder>(`/woocommerce-pedidos/${id}`, {
    ...payload,
    ...(storeId ? { storeId } : {})
  });
}

export async function fetchWooOrderNotes(id: number, storeId: number | null = null) {
  return api.get<WooOrderNote[]>(`/woocommerce-pedidos/${id}/notas`, {
    params: withStore(storeId)
  });
}

export async function addWooOrderNote(
  id: number,
  note: string,
  customerNote = false,
  storeId: number | null = null
) {
  return api.post<WooOrderNote>(`/woocommerce-pedidos/${id}/notas`, {
    note,
    customer_note: customerNote,
    ...(storeId ? { storeId } : {})
  });
}

export async function findWooOrderTicket(orderId: number, params: { email?: string; phone?: string }) {
  return api.get<{ ticketId: number | null }>(`/woocommerce-pedidos/${orderId}/ticket`, {
    params
  });
}

export async function fetchWooOrderStores() {
  return api.get<WooStoreSummary[]>("/woocommerce-pedidos/stores");
}
