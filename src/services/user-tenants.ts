import api from "@/lib/api";

export interface UserTenant {
  id: number;
  name: string;
  email: string;
  profile: string;
  phone?: string;
  tenantId: number;
  tenant?: { id: number; name: string };
  restrictedUser?: string | boolean;
  menuPermissions?: Record<string, boolean>;
  businessHours?: unknown[];
  inactive?: boolean;
  profilePicture?: string;
}

export async function fetchUserTenants(params?: Record<string, unknown>) {
  return api.get("/userTenants/", { params });
}

export interface UserTenantsPageResult {
  users: UserTenant[];
  count: number;
  activeCount: number;
  hasMore: boolean;
}

export interface FetchUserTenantsParams {
  pageNumber?: number;
  pageSize?: number;
  searchParam?: string;
  tenantId?: number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

/**
 * Busca UMA página de usuários cross-tenant com busca/ordenação server-side.
 *
 * O backend (ListTenantUsersService) filtra por nome/email (`searchParam`),
 * ordena por coluna na whitelist (`sortKey`/`sortDir`), pagina por `pageSize`
 * e devolve `{ users, count, activeCount, hasMore }`. A página /usuariotenants
 * acumula as páginas via infinite scroll, então cada chamada traz só o bloco.
 */
export async function fetchUserTenantsPage(
  params: FetchUserTenantsParams
): Promise<UserTenantsPageResult> {
  const { data } = await fetchUserTenants(params as Record<string, unknown>);
  if (Array.isArray(data)) {
    return { users: data, count: data.length, activeCount: data.length, hasMore: false };
  }
  const d = (data ?? {}) as Partial<UserTenantsPageResult>;
  return {
    users: Array.isArray(d.users) ? d.users : [],
    count: typeof d.count === "number" ? d.count : 0,
    activeCount: typeof d.activeCount === "number" ? d.activeCount : (d.count ?? 0),
    hasMore: !!d.hasMore,
  };
}

export async function createUserTenant(data: Record<string, unknown>) {
  return api.post("/userTenants", data);
}

export async function updateUserTenant(id: number, data: Record<string, unknown>) {
  return api.put(`/userTenants/${id}`, data);
}

export async function deleteUserTenant(id: number) {
  return api.delete(`/userTenants/${id}`);
}

export async function inactivateUserTenant(id: number) {
  return api.put(`/userTenants/${id}/inactivate`);
}

export async function reactivateUserTenant(id: number) {
  return api.put(`/userTenants/${id}/reactivate`);
}
