import api from "@/lib/api";

export interface FarewellPrivateMessage {
  id: number;
  name: string;
  message: string;
  reasonId?: number | null;
  reason?: { id: number; name: string; color?: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchFarewells() {
  const all: FarewellPrivateMessage[] = [];
  let pageNumber = 1;
  let hasMore = true;
  while (hasMore) {
    const { data } = await api.get<{ farewellPrivateMessage: FarewellPrivateMessage[]; hasMore: boolean }>(
      "/farewellPrivateMessage",
      { params: { pageNumber } }
    );
    all.push(...(data.farewellPrivateMessage ?? []));
    hasMore = data.hasMore;
    pageNumber++;
  }
  return all;
}

export async function createFarewell(data: { name: string; message: string; reasonId?: number | null }) {
  return api.post<FarewellPrivateMessage>("/farewellPrivateMessage", data);
}

export async function updateFarewell(id: number, data: { name?: string; message?: string; reasonId?: number | null }) {
  return api.put<FarewellPrivateMessage>(`/farewellPrivateMessage/${id}`, data);
}

export async function deleteFarewell(id: number) {
  return api.delete(`/farewellPrivateMessage/${id}`);
}
