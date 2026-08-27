import { create } from "zustand";

export type ActivityType =
  | "session_connected"
  | "session_disconnected"
  | "channel_created"
  | "api_created"
  | "api_deleted"
  | "ticket_opened"
  | "ticket_closed"
  | "user_action";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: Date;
  icon?: string; // lucide icon name
}

interface ActivityStore {
  activities: ActivityEntry[];
  addActivity: (entry: Omit<ActivityEntry, "id" | "timestamp">) => void;
  clearActivities: () => void;
}

export const useActivityStore = create<ActivityStore>((set) => ({
  activities: [],
  addActivity: (entry) =>
    set((state) => ({
      activities: [
        { ...entry, id: crypto.randomUUID(), timestamp: new Date() },
        ...state.activities,
      ].slice(0, 50), // keep last 50
    })),
  clearActivities: () => set({ activities: [] }),
}));
