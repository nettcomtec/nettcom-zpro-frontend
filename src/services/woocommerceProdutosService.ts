import api from "@/lib/api";

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  type: string;
  status: string;
  sku: string;
  permalink?: string;
  regular_price: string;
  sale_price: string;
  price: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: string;
  description: string;
  short_description: string;
  weight: string;
  dimensions: { length: string; width: string; height: string };
  categories: { id: number; name: string; slug: string }[];
  images: { id: number; src: string; name: string; alt: string }[];
}

export interface WooProductPayload {
  name: string;
  type?: string;
  status?: string;
  regular_price?: string;
  sale_price?: string;
  sku?: string;
  description?: string;
  short_description?: string;
  manage_stock?: boolean;
  stock_quantity?: number | null;
  stock_status?: string;
  weight?: string;
  images?: { src: string; alt?: string }[];
}

const withStore = (storeId?: number | null, extras: Record<string, any> = {}) => ({
  ...extras,
  ...(storeId ? { storeId } : {})
});

export async function fetchWooProducts(search = "", storeId: number | null = null) {
  return api.get<WooProduct[]>("/woocommerce-produtos", {
    params: withStore(storeId, search ? { search } : {})
  });
}

export async function fetchWooProductById(id: number, storeId: number | null = null) {
  return api.get<WooProduct>(`/woocommerce-produtos/${id}`, {
    params: withStore(storeId)
  });
}

export async function createWooProduct(data: WooProductPayload, storeId: number | null = null) {
  return api.post<WooProduct>("/woocommerce-produtos", { ...data, ...(storeId ? { storeId } : {}) });
}

export async function updateWooProduct(
  id: number,
  data: Partial<WooProductPayload>,
  storeId: number | null = null
) {
  return api.put<WooProduct>(`/woocommerce-produtos/${id}`, {
    ...data,
    ...(storeId ? { storeId } : {})
  });
}

export async function deleteWooProduct(id: number, storeId: number | null = null) {
  return api.delete(`/woocommerce-produtos/${id}`, {
    params: withStore(storeId)
  });
}

export interface WooStoreSummary {
  id: number;
  description: string | null;
  storeUrl: string;
  whatsappId: number | null;
  isActive: boolean;
}

export async function pickWooProducts(
  q = "",
  force = false,
  storeId: number | null = null,
  whatsappId: number | null = null
) {
  return api.get<WooProduct[]>("/woocommerce-produtos/picker", {
    params: {
      ...(q ? { q } : {}),
      ...(force ? { force: "1" } : {}),
      ...(storeId ? { storeId } : {}),
      ...(whatsappId ? { whatsappId } : {})
    }
  });
}

export async function fetchWooStores() {
  return api.get<WooStoreSummary[]>("/woocommerce-produtos/stores");
}
