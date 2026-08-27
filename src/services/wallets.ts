import api from "@/lib/api";

export interface Wallet {
  id: number;
  name: string;
  userId?: number;
  tenantId?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Wallets in this system are Users — walletId is a FK to the User table.
// There is no /wallets endpoint; fetch users instead and map them.
export async function fetchWallets(): Promise<{ data: Wallet[] }> {
  const res = await api.get<{ users?: Wallet[]; count?: number } | Wallet[]>("/users");
  const raw = res.data;
  const list: Wallet[] = Array.isArray(raw) ? raw : ((raw as { users?: Wallet[] }).users ?? []);
  return { data: list };
}

export async function createWallet(data: { name: string; userId?: number }) {
  return api.post<Wallet>("/wallets", data);
}

export async function updateWallet(id: number, data: Partial<Wallet>) {
  return api.put<Wallet>(`/wallets/${id}`, data);
}

export async function deleteWallet(id: number) {
  return api.delete(`/wallets/${id}`);
}
