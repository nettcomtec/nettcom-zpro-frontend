import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/stores/auth-store";

describe("auth-store", () => {
  beforeEach(() => {
    const { clearAuth } = useAuthStore.getState();
    clearAuth();
  });

  it("starts with unauthenticated state", () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });

  it("setAuth sets user and token", () => {
    const { setAuth } = useAuthStore.getState();
    setAuth({
      token: "test-token",
      username: "testuser",
      email: "test@example.com",
      profile: "admin",
      userId: 1,
      tenantId: 1,
      queues: [],
      blockWavoip: false,
      whatsappAllowed: [],
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe("test-token");
    expect(state.user?.username).toBe("testuser");
    expect(state.isAdmin).toBe(true);
  });

  it("clearAuth resets all state", () => {
    const { setAuth, clearAuth } = useAuthStore.getState();
    setAuth({
      token: "test-token",
      username: "testuser",
      email: "test@example.com",
      profile: "admin",
      userId: 1,
      tenantId: 1,
      queues: [],
      blockWavoip: false,
      whatsappAllowed: [],
    });

    clearAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });

  it("detects admin profile", () => {
    const { setAuth } = useAuthStore.getState();
    setAuth({
      token: "t",
      username: "u",
      email: "e",
      profile: "admin",
      userId: 1,
      tenantId: 1,
      queues: [],
      blockWavoip: false,
      whatsappAllowed: [],
    });

    expect(useAuthStore.getState().isAdmin).toBe(true);
    expect(useAuthStore.getState().isSuporte).toBe(false);
  });

  it("detects suporte profile via email", () => {
    const { setAuth } = useAuthStore.getState();
    setAuth({
      token: "t",
      username: "u",
      email: "suporte@zpro.com",
      profile: "superadmin",
      userId: 1,
      tenantId: 1,
      queues: [],
      blockWavoip: false,
      whatsappAllowed: [],
    });

    expect(useAuthStore.getState().isSuporte).toBe(true);
  });
});
