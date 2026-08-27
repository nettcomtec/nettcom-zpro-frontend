import { vi } from "vitest";

export const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
  id: "mock-socket-id",
};

export const getSocket = vi.fn(() => mockSocket);
export const connectWithToken = vi.fn();
export const disconnectSocket = vi.fn();
export const ensureConnectedFromStorage = vi.fn();
