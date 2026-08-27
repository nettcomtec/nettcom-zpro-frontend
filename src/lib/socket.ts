import { io, Socket } from "socket.io-client";
import { logger } from "./logger";
import { dismissBackendOfflineToast } from "./backend-offline-toast";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  let token: string | null = null;
  try {
    const raw = localStorage.getItem("token");
    token = raw ? JSON.parse(raw) : null;
  } catch {
    token = null;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
  const isRelative = apiBase.startsWith("/");
  const socketUrl = isRelative ? "" : apiBase;
  const socketPath = isRelative ? `${apiBase.replace(/\/$/, "")}/socket.io` : "/socket.io";

  socket = io(socketUrl, {
    reconnection: true,
    transports: ["websocket", "polling"],
    autoConnect: false,
    forceNew: true,
    timeout: 30000,
    path: socketPath,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    ...(token ? { auth: { token } } : {}),
  });

  socket.on("connect", () => {
    logger.log("Socket connected:", socket?.id);
    dismissBackendOfflineToast();
  });

  socket.on("connect_error", (error) => {
    if (error.message === "authentication error") {
      socket?.disconnect();
      // Token may have expired while server was down — retry with the latest stored token
      setTimeout(() => {
        try {
          const raw = localStorage.getItem("token");
          const tok = raw ? (JSON.parse(raw) as string) : null;
          if (tok && socket) {
            socket.auth = { token: tok };
            socket.connect();
          }
        } catch {
          // noop
        }
      }, 5000);
    }
  });

  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") {
      socket?.connect();
    }
  });

  return socket;
}

export function connectWithToken(newToken: string): void {
  const s = getSocket();
  s.auth = { token: newToken };
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function ensureConnectedFromStorage(): void {
  try {
    const raw = localStorage.getItem("token");
    const tok = raw ? JSON.parse(raw) : null;
    if (tok) {
      const s = getSocket();
      s.auth = { token: tok };
      if (!s.connected) s.connect();
    }
  } catch {
    // ignore
  }
}
