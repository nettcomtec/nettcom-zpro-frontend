import api from "@/lib/api";

export interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  attachments?: {
    data?: Array<{
      type?: string;
      url?: string;
    }>;
  };
}

export interface FacebookCommentReply {
  id: string;
  message?: string;
  from?: {
    id?: string;
    name?: string;
  };
  created_time?: string;
  like_count?: number;
}

export interface FacebookComment {
  id: string;
  message?: string;
  from?: {
    id?: string;
    name?: string;
  };
  created_time?: string;
  like_count?: number;
  comment_count?: number;
}

export async function listPagePosts(whatsappId: number, nextUrl?: string) {
  return api.get<{ data: FacebookPost[]; paging?: { next?: string } }>(
    `/messengerPagePosts/${whatsappId}`,
    { params: nextUrl ? { nextUrl } : undefined }
  );
}

export async function getPostComments(postId: string, whatsappId: number, nextUrl?: string) {
  return api.get<{ data: FacebookComment[]; paging?: { next?: string } }>(
    `/messengerPostComments/${postId}`,
    { params: { whatsappId, ...(nextUrl ? { nextUrl } : {}) } }
  );
}

export async function getCommentReplies(commentId: string, whatsappId: number, nextUrl?: string) {
  return api.get<{ data: FacebookCommentReply[]; paging?: { next?: string } }>(
    `/messengerCommentReplies/${commentId}`,
    { params: { whatsappId, ...(nextUrl ? { nextUrl } : {}) } }
  );
}

export async function replyFacebookComment(data: { commentId: string; message: string; whatsappId: number }) {
  return api.post("/messengerReplyComment/", data);
}

export async function commentOnFacebookPost(data: { postId: string; message: string; whatsappId: number }) {
  return api.post("/messengerCommentOnPost/", data);
}

export async function editFacebookComment(data: { commentId: string; message: string; whatsappId: number }) {
  return api.put("/messengerEditComment/", data);
}

export async function deleteFacebookComment(data: { commentId: string; whatsappId: number }) {
  return api.delete("/messengerDeleteComment/", { data });
}

export interface PublishFacebookPostParams {
  whatsappId: number;
  postType: "status" | "photo" | "video" | "album";
  message?: string;
  link?: string;
  files?: File[];
  onUploadProgress?: (ev: ProgressEvent) => void;
}

export async function editFacebookPost(data: { postId: string; message: string; whatsappId: number }) {
  return api.put<{ postId: string; success: boolean }>("/messengerEditPost/", data);
}

export async function deleteFacebookPost(data: { postId: string; whatsappId: number }) {
  return api.delete<{ postId: string; success: boolean }>("/messengerDeletePost/", { data });
}

export async function publishFacebookPost({
  whatsappId,
  postType,
  message,
  link,
  files,
  onUploadProgress,
}: PublishFacebookPostParams) {
  const form = new FormData();
  form.append("whatsappId", String(whatsappId));
  form.append("postType", postType);
  if (message) form.append("message", message);
  if (link) form.append("link", link);
  (files || []).forEach((f) => form.append("medias", f));

  return api.post<{ postId: string; mediaId: string; postType: string }>(
    "/messengerPublishPost/",
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: onUploadProgress as any,
    }
  );
}
