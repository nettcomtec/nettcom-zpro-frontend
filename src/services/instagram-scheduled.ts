import api from "@/lib/api";

export interface InstagramScheduledPost {
  id: number;
  whatsappId: number;
  mediaType: "photo" | "reel" | "carousel";
  files: { filename: string; originalName?: string; isVideo?: boolean; size?: number }[];
  caption: string | null;
  shareToFeed: boolean;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  scheduledAt: string | null;
  publishedMediaId: string | null;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
  whatsapp?: { id: number; name: string };
}

export async function listInstagramScheduledPosts(whatsappId?: number) {
  return api.get<InstagramScheduledPost[]>("/instagramScheduledPosts", {
    params: whatsappId ? { whatsappId } : undefined,
  });
}

export interface ScheduledGalleryFile {
  url: string;
  isVideo: boolean;
  originalName?: string;
}

export async function createInstagramScheduledPost(params: {
  whatsappId: number;
  mediaType: "photo" | "reel" | "carousel";
  caption?: string;
  shareToFeed?: boolean;
  status: "draft" | "scheduled";
  scheduledAt?: string;
  files: File[];
  galleryFiles?: ScheduledGalleryFile[];
  onUploadProgress?: (progressEvent: { loaded: number; total?: number }) => void;
}) {
  const form = new FormData();
  form.append("whatsappId", String(params.whatsappId));
  form.append("mediaType", params.mediaType);
  form.append("status", params.status);
  if (params.caption) form.append("caption", params.caption);
  if (params.shareToFeed === false) form.append("shareToFeed", "false");
  if (params.scheduledAt) form.append("scheduledAt", params.scheduledAt);
  if (params.galleryFiles?.length) form.append("galleryFiles", JSON.stringify(params.galleryFiles));
  for (const f of params.files) form.append("medias", f);

  return api.post<InstagramScheduledPost>("/instagramScheduledPosts", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: params.onUploadProgress,
  });
}

export async function updateInstagramScheduledPost(
  id: number,
  data: { caption?: string; scheduledAt?: string | null; status?: "draft" | "scheduled" }
) {
  return api.put<InstagramScheduledPost>(`/instagramScheduledPosts/${id}`, data);
}

export async function deleteInstagramScheduledPost(id: number) {
  return api.delete(`/instagramScheduledPosts/${id}`);
}

export async function publishInstagramScheduledPostNow(id: number) {
  return api.post<{ mediaId: string }>(`/instagramScheduledPosts/${id}/publish`);
}
