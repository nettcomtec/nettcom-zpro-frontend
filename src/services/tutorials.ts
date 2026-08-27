import api from "@/lib/api";

export interface Tutorial {
  id: number;
  title: string;
  description?: string;
  link?: string;
  thumbnailUrl?: string;
  isActive: boolean;
  sortOrder?: number | null;
}

export interface TutorialsResponse {
  tutorials: Tutorial[];
  count: number;
  hasMore: boolean;
}

export async function fetchTutorials(params: { pageNumber?: number; pageSize?: number } = {}) {
  return api.get<TutorialsResponse>("/tutorials", { params });
}

export async function createTutorial(formData: FormData) {
  return api.post<Tutorial>("/tutorials", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}

export async function updateTutorial(id: number, formData: FormData) {
  return api.patch<Tutorial>(`/tutorials/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}

export async function deleteTutorial(id: number) {
  return api.delete(`/tutorials/${id}`);
}
