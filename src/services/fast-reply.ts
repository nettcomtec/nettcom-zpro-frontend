import api from "@/lib/api";

export interface FastReply {
  id: number;
  key: string;
  message: string;
  isPublic: boolean;
  userId: number;
  tenantId: number;
  media?: string;
  mediasJson?: string;
  voice?: string;
  messageType?: "text" | "buttons" | "list" | "template";
  buttonsJson?: string;
  listJson?: string;
  templateJson?: string;
  createdAt: string;
  updatedAt: string;
}

export function parseFastReplyMedias(item: FastReply): string[] {
  if (item.mediasJson) {
    try {
      const parsed = JSON.parse(item.mediasJson);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  if (item.media) return [item.media];
  return [];
}

export async function fetchFastReplies() {
  return api.get<FastReply[]>("/fastreply");
}

export async function createFastReply(data: {
  key: string;
  message: string;
  isPublic: boolean;
  mediaFiles?: File[];
  voice?: boolean;
  messageType?: string;
  buttonsJson?: object | null;
  listJson?: object | null;
  templateJson?: object | null;
}) {
  const formData = new FormData();
  formData.append("key", data.key);
  formData.append("message", data.message);
  formData.append("isPublic", String(data.isPublic));
  formData.append("voice", data.voice ? "enabled" : "disabled");
  formData.append("messageType", data.messageType || "text");
  if (data.buttonsJson) formData.append("buttonsJson", JSON.stringify(data.buttonsJson));
  if (data.listJson) formData.append("listJson", JSON.stringify(data.listJson));
  if (data.templateJson) formData.append("templateJson", JSON.stringify(data.templateJson));
  if (data.mediaFiles && data.mediaFiles.length > 0) {
    data.mediaFiles.forEach((file) => formData.append("medias", file));
  }
  return api.post("/fastreply", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}

export async function updateFastReply(
  id: number,
  data: {
    key: string;
    message: string;
    isPublic: boolean;
    mediaFiles?: File[];
    removeMedia?: boolean;
    voice?: boolean;
    messageType?: string;
    buttonsJson?: object | null;
    listJson?: object | null;
    templateJson?: object | null;
  }
) {
  const formData = new FormData();
  formData.append("key", data.key);
  formData.append("message", data.message);
  formData.append("isPublic", String(data.isPublic));
  formData.append("voice", data.voice ? "enabled" : "disabled");
  formData.append("messageType", data.messageType || "text");
  if (data.buttonsJson) formData.append("buttonsJson", JSON.stringify(data.buttonsJson));
  else formData.append("buttonsJson", "null");
  if (data.listJson) formData.append("listJson", JSON.stringify(data.listJson));
  else formData.append("listJson", "null");
  if (data.templateJson) formData.append("templateJson", JSON.stringify(data.templateJson));
  else formData.append("templateJson", "null");
  if (data.mediaFiles && data.mediaFiles.length > 0) {
    data.mediaFiles.forEach((file) => formData.append("medias", file));
  } else if (data.removeMedia) {
    formData.append("medias", "null");
  }
  return api.put(`/fastreply/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}

export async function deleteFastReply(id: number) {
  return api.delete(`/fastreply/${id}`);
}
