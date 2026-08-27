import { useTicketStore } from "./ticket-store";
import { useChatStore } from "./chat-store";
import { useContactsStore } from "./contacts-store";
import { useUsersStore } from "./users-store";
import { useWhatsappStore } from "./whatsapp-store";
import { useWebphoneStore } from "./webphone-store";
import { useActivityStore } from "./activity-store";
import { useAudioPlayerStore } from "./audio-player-store";
import { useBrandingStore } from "./branding-store";
import { useUIStore } from "./ui-store";
import { useNotificationStore } from "./notification-store";
import { useSupportChatStore } from "./support-chat-store";

export function resetAllStores(): void {
  useTicketStore.getState().resetTickets();
  useChatStore.getState().reset();
  useContactsStore.getState().reset();
  useUsersStore.getState().reset();
  useWhatsappStore.getState().reset();
  useWebphoneStore.getState().reset();
  useActivityStore.getState().clearActivities();
  useAudioPlayerStore.getState().dismiss();
  useBrandingStore.getState().reset();
  useUIStore.getState().reset();
  useNotificationStore.getState().clearAll();
  useSupportChatStore.getState().reset();
}
