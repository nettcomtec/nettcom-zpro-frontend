import api from "@/lib/api";

export interface ParsedMessage {
  date: string;
  time: string;
  sender: string;
  body: string;
  attachmentName?: string;
  isHiddenMedia?: boolean;
  timestamp: number;
}

export interface PreviewResult {
  txtFileName: string;
  totalMessages: number;
  senders: string[];
  detectedMyName: string | null;
  sampleMessages: ParsedMessage[];
  mediaFilesInZip: string[];
}

export interface ExecuteResult {
  ticketId: number;
  totalCreated: number;
  totalSkipped: number;
  totalMediaCopied: number;
  contactId: number;
}

export async function previewChannelHistoryImport(zip: File): Promise<PreviewResult> {
  const fd = new FormData();
  fd.append("zip", zip);
  const res = await api.post<PreviewResult>("/channelHistoryImport/preview", fd, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return res.data;
}

export async function executeChannelHistoryImport(params: {
  zip: File;
  whatsappId: number;
  contactNumber: string;
  myName: string;
}): Promise<ExecuteResult> {
  const fd = new FormData();
  fd.append("zip", params.zip);
  fd.append("whatsappId", String(params.whatsappId));
  fd.append("contactNumber", params.contactNumber);
  fd.append("myName", params.myName);
  const res = await api.post<ExecuteResult>("/channelHistoryImport/execute", fd, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return res.data;
}
