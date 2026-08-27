import api from "@/lib/api";

export interface GroupMessage {
  id: number;
  groupId: string;
  groupName?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppGroup {
  id: string;
  name: string;
  description?: string;
  participants?: number;
}

export interface GroupParticipants {
  groupId: string;
  participants: string[];
}

export async function listGroupMessages() {
  return api.get<GroupMessage[]>("/group-message");
}

export async function createGroupMessage(data: Record<string, unknown>) {
  return api.post("/group-message", data);
}

export async function updateGroupMessage(groupId: string, data: Record<string, unknown>) {
  return api.put(`/group-message/${groupId}`, data);
}

export async function deleteGroupMessage(groupId: string) {
  return api.delete(`/group-message/${groupId}`);
}

export async function listGroups(data: { whatsappId: number }) {
  return api.post<{ groups: WhatsAppGroup[] }>("/listGroup/", data);
}

export async function listGroupIds(data: { whatsappId: number }) {
  return api.post<{ groups: WhatsAppGroup[] }>("/listGroupIds/", data);
}

export async function listGroupById(data: { whatsappId: number; groupId: string }) {
  return api.post<{ group: { name: string; id: string } }>("/listGroupById/", data);
}

export async function listParticipants(data: { whatsappId: number; groupIds: string[] }) {
  return api.post<GroupParticipants[]>("/listParticipants/", data);
}

export async function createGroups(data: {
  whatsappId: number;
  titles: string[];
  number: string;
}) {
  return api.post("/createGroups/", data);
}

export async function changeDescriptions(data: {
  whatsappId: number;
  groupIds: string[];
  description: string;
}) {
  return api.post("/changeDescriptions/", data);
}

export async function changeTitles(data: {
  whatsappId: number;
  groupIds: string[];
  title: string;
}) {
  return api.post("/changeTitles/", data);
}

export async function changePicturesUrl(data: {
  whatsappId: number;
  groupIds: string[];
  picture: string;
}) {
  return api.post("/changePicturesUrl/", data);
}

export async function changePicturesFile(formData: FormData) {
  return api.post("/changePicturesFile/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function setAdminsOnlyForGroups(data: {
  whatsappId: number;
  groupIds: string[];
  adminsOnly: boolean;
}) {
  return api.post("/setAdminsOnlyForGroups/", data);
}

export async function promoteParticipantsInGroups(data: {
  whatsappId: number;
  groupIds: string[];
  participants: string[];
}) {
  return api.post("/promoteParticipantsInGroups/", data);
}

export async function demoteParticipantsInGroups(data: {
  whatsappId: number;
  groupIds: string[];
  participants: string[];
}) {
  return api.post("/demoteParticipantsInGroups/", data);
}

export async function addParticipantsToGroups(data: Record<string, unknown>) {
  return api.post("/addParticipantsToGroups/", data);
}

export async function removeParticipantsFromGroups(data: Record<string, unknown>) {
  return api.post("/removeParticipantsFromGroups/", data);
}

// Ban list
export async function listBans() {
  return api.get<{ banList: BanEntry[] }>("/banList");
}

export async function createBan(data: Record<string, unknown>) {
  return api.post("/banList", data);
}

export async function updateBan(id: number, data: Record<string, unknown>) {
  return api.put(`/banList/${id}`, data);
}

export async function deleteBan(id: number) {
  return api.delete(`/banList/${id}`);
}

export async function deleteAllBans() {
  return api.delete("/banListAll");
}

export interface BanEntry {
  id: number;
  number: string;
  userId?: number;
  groupId?: string;
  createdAt: string;
}

// Word list
export async function listWords() {
  return api.get<{ wordList: WordEntry[] }>("/wordList");
}

export async function createWord(data: Record<string, unknown>) {
  return api.post("/wordList", data);
}

export async function updateWord(id: number, data: Record<string, unknown>) {
  return api.put(`/wordList/${id}`, data);
}

export async function deleteWord(id: number) {
  return api.delete(`/wordList/${id}`);
}

export async function deleteAllWords() {
  return api.delete("/wordListAll");
}

export interface WordEntry {
  id: number;
  word: string;
  userId?: number;
  groupId?: string;
  createdAt: string;
}

// Saudacao (greeting)
export async function listGreetings() {
  return api.get<{ greetingMessage: GreetingEntry[] }>("/greetingMessage");
}

export async function createGreeting(data: Record<string, unknown>) {
  return api.post("/greetingMessage", data);
}

export async function updateGreeting(id: number, data: Record<string, unknown>) {
  return api.put(`/greetingMessage/${id}`, data);
}

export async function deleteGreeting(id: number) {
  return api.delete(`/greetingMessage/${id}`);
}

export async function deleteAllGreetings() {
  return api.delete("/greetingMessageAll");
}

export interface GreetingEntry {
  id: number;
  message: string;
  userId?: number;
  groupId?: string;
  createdAt: string;
}

// Despedida (farewell)
export async function listFarewells() {
  return api.get<{ farewellMessage: FarewellEntry[] }>("/farewellMessage");
}

export async function createFarewell(data: Record<string, unknown>) {
  return api.post("/farewellMessage", data);
}

export async function updateFarewell(id: number, data: Record<string, unknown>) {
  return api.put(`/farewellMessage/${id}`, data);
}

export async function deleteFarewell(id: number) {
  return api.delete(`/farewellMessage/${id}`);
}

export async function deleteAllFarewells() {
  return api.delete("/farewellMessageAll");
}

export interface FarewellEntry {
  id: number;
  message: string;
  userId?: number;
  groupId?: string;
  createdAt: string;
}
