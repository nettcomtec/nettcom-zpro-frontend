import { describe, it, expect, beforeEach } from "vitest";
import { useNotificationStore } from "@/stores/notification-store";

describe("notification-store", () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
  });

  it("starts empty", () => {
    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(0);
    expect(state.unreadCount).toBe(0);
  });

  it("addNotification adds and increments unread", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification({
      id: 1,
      message: "Test notification",
      read: false,
      createdAt: new Date().toISOString(),
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.unreadCount).toBe(1);
  });

  it("markAsRead decrements unread", () => {
    const { addNotification, markAsRead } = useNotificationStore.getState();
    addNotification({
      id: 1,
      message: "Test",
      read: false,
      createdAt: new Date().toISOString(),
    });

    markAsRead(1);

    const state = useNotificationStore.getState();
    expect(state.unreadCount).toBe(0);
    expect(state.notifications[0].read).toBe(true);
  });

  it("markAllAsRead resets unread to 0", () => {
    const { addNotification, markAllAsRead } = useNotificationStore.getState();
    addNotification({ id: 1, message: "a", read: false, createdAt: "" });
    addNotification({ id: 2, message: "b", read: false, createdAt: "" });

    markAllAsRead();

    const state = useNotificationStore.getState();
    expect(state.unreadCount).toBe(0);
    expect(state.notifications.every((n) => n.read)).toBe(true);
  });
});
