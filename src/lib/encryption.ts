import CryptoJS from "crypto-js";
import api from "./api";

const DEFAULT_KEY = process.env.NEXT_PUBLIC_DEFAULT_ENCRYPTION_KEY || "zpro-passaporte-2024-encryption-key";

let keyCache: { key: string; timestamp: number } | null = null;
const CACHE_TTL = 60000;

async function getTenantEncryptionKey(): Promise<string> {
  const now = Date.now();
  if (keyCache && now - keyCache.timestamp < CACHE_TTL) {
    return keyCache.key || DEFAULT_KEY;
  }

  try {
    const response = await api.get("/publicEncryptionKey", { timeout: 5000 });
    if (response.status === 200 && response.data) {
      keyCache = { key: response.data, timestamp: now };
      return response.data;
    }
  } catch {
    // fallback
  }

  return keyCache?.key || DEFAULT_KEY;
}

export async function encryptPassword(password: string): Promise<string> {
  if (!password) throw new Error("Invalid password");
  const key = await getTenantEncryptionKey();
  return CryptoJS.AES.encrypt(password, key).toString();
}

export function clearEncryptionKeyCache(): void {
  keyCache = null;
}
