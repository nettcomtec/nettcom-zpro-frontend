import api from "@/lib/api";

export interface ProductVariation {
  name: string;
  options: string[];
}

export interface ProductImage {
  url: string;
}

export interface Product {
  id: number;
  name: string;
  description?: string | null;
  priceOriginal?: string | number | null;
  pricePromo?: string | number | null;
  mainImageUrl?: string | null;
  imagesJson?: ProductImage[];
  videoUrl?: string | null;
  variationsJson?: ProductVariation[];
  hasFreight?: boolean;
  sku?: string | null;
  category?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductPayload {
  name: string;
  description?: string | null;
  priceOriginal?: number | null;
  pricePromo?: number | null;
  mainImageUrl?: string | null;
  imagesJson?: ProductImage[];
  videoUrl?: string | null;
  variationsJson?: ProductVariation[];
  hasFreight?: boolean;
  sku?: string | null;
  category?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export async function fetchProducts(params?: {
  pageNumber?: number;
  searchParam?: string;
}) {
  const { data } = await api.get("/internal-produtos", { params });
  return {
    data: (data?.products || []) as Product[],
    count: data?.count ?? 0,
    hasMore: data?.hasMore ?? false,
  };
}

export async function createProduct(payload: ProductPayload) {
  return api.post<Product>("/internal-produtos", payload);
}

export async function updateProduct(id: number, payload: Partial<ProductPayload>) {
  return api.put<Product>(`/internal-produtos/${id}`, payload);
}

export async function deleteProduct(id: number) {
  return api.delete(`/internal-produtos/${id}`);
}
