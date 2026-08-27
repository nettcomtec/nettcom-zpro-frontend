import api from "@/lib/api";

export interface Tag {
  id: number;
  name: string;
  color: string;
  isActive: boolean;
  triggerKeyword?: string | null;
}

interface TagApiResponse {
  id: number;
  tag?: string;
  name?: string;
  color?: string;
  [key: string]: unknown;
}

function normalizeTag(r: TagApiResponse): Tag {
  return {
    id: r.id,
    name: r.name ?? r.tag ?? "",
    color: r.color ?? "#3B82F6",
    isActive: (r.isActive as boolean | undefined) ?? true,
    triggerKeyword: (r.triggerKeyword as string | null | undefined) ?? null,
  };
}

export async function fetchTags() {
  const { data } = await api.get<TagApiResponse[] | Tag[]>("/tags");
  const arr = Array.isArray(data) ? data : [];
  return {
    data: arr.map((t) => (typeof (t as Tag).name === "string" ? (t as Tag) : normalizeTag(t as TagApiResponse))),
  };
}

export async function createTag(data: Partial<Tag>) {
  return api.post("/tags", {
    tag: data.name ?? "",
    color: data.color ?? "#3B82F6",
    isActive: data.isActive ?? true,
    triggerKeyword: data.triggerKeyword || null,
  });
}

export async function updateTag(tagId: number, data: Partial<Tag>) {
  return api.put(`/tags/${tagId}`, {
    tag: data.name ?? "",
    color: data.color ?? "#3B82F6",
    isActive: data.isActive ?? true,
    triggerKeyword: data.triggerKeyword || null,
  });
}

export async function deleteTag(tagId: number, force = false) {
  return api.delete(`/tags/${tagId}`, { params: force ? { force: "true" } : {} });
}
