import api from "@/lib/api";

export interface NuvemshopProduct {
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
  // metadados Nuvemshop p/ edicao (variant a atualizar + aviso de multi-variant)
  _nuvemshop?: { variantId: number | null; variantCount: number; multiVariant: boolean };
}

export interface NuvemshopProductPayload {
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
  variantId?: number | null;
}

const withStore = (storeId?: number | null, extras: Record<string, any> = {}) => ({
  ...extras,
  ...(storeId ? { storeId } : {})
});

export async function fetchNuvemshopProducts(search = "", storeId: number | null = null) {
  return api.get<NuvemshopProduct[]>("/nuvemshop-produtos", {
    params: withStore(storeId, search ? { search } : {})
  });
}

export async function fetchNuvemshopProductById(id: number, storeId: number | null = null) {
  return api.get<NuvemshopProduct>(`/nuvemshop-produtos/${id}`, {
    params: withStore(storeId)
  });
}

export async function createNuvemshopProduct(data: NuvemshopProductPayload, storeId: number | null = null) {
  return api.post<NuvemshopProduct>("/nuvemshop-produtos", { ...data, ...(storeId ? { storeId } : {}) });
}

export async function updateNuvemshopProduct(
  id: number,
  data: Partial<NuvemshopProductPayload>,
  storeId: number | null = null
) {
  return api.put<NuvemshopProduct>(`/nuvemshop-produtos/${id}`, {
    ...data,
    ...(storeId ? { storeId } : {})
  });
}

export async function deleteNuvemshopProduct(id: number, storeId: number | null = null) {
  return api.delete(`/nuvemshop-produtos/${id}`, {
    params: withStore(storeId)
  });
}

export interface NuvemshopStoreSummary {
  id: number;
  description: string | null;
  storeUrl: string | null;
  storeId?: string | null;
  whatsappId: number | null;
  isActive: boolean;
  tokenInvalidatedAt?: string | null;
}

export async function pickNuvemshopProducts(
  q = "",
  force = false,
  storeId: number | null = null,
  whatsappId: number | null = null
) {
  return api.get<NuvemshopProduct[]>("/nuvemshop-produtos/picker", {
    params: {
      ...(q ? { q } : {}),
      ...(force ? { force: "1" } : {}),
      ...(storeId ? { storeId } : {}),
      ...(whatsappId ? { whatsappId } : {})
    }
  });
}

export async function fetchNuvemshopStores() {
  return api.get<NuvemshopStoreSummary[]>("/nuvemshop-produtos/stores");
}
