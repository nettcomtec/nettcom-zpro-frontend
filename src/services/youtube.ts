import api from "@/lib/api";

export interface YouTubeVideo {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  viewCount?: number;
  commentCount?: number;
}

export interface YouTubeComment {
  id: string;
  authorDisplayName: string;
  authorChannelId?: string;
  textDisplay: string;
  publishedAt: string;
  likeCount?: number;
  totalReplyCount?: number;
  replies?: YouTubeComment[];
}

export async function listYouTubeVideos(whatsappId: number) {
  return api.get(`/yt-videos/${whatsappId}`);
}

export async function getYouTubeComments(videoId: string, whatsappId: number) {
  return api.get(`/yt-comments/${videoId}`, { params: { whatsappId } });
}

export async function replyYouTubeComment(data: {
  parentId: string;
  message: string;
  whatsappId: number;
}) {
  // Backend espera { commentId, text, whatsappId } — mapeia o shape publico
  // do service (parentId/message) para os nomes que o controller le.
  return api.post("/yt-reply-comment", {
    commentId: data.parentId,
    text: data.message,
    whatsappId: data.whatsappId,
  });
}

export async function deleteYouTubeComment(data: {
  commentId: string;
  whatsappId: number;
}) {
  return api.delete("/yt-delete-comment", { data });
}

export async function editYouTubeComment(data: {
  commentId: string;
  text: string;
  whatsappId: number;
}) {
  return api.put("/yt-edit-comment", data);
}
