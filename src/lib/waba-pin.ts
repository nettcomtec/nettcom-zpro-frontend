// PIN de 6 dígitos para registro do número na API do WhatsApp Business
// (two-step verification). Usa crypto.getRandomValues quando disponível.
export function generateRandomPin(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return String(arr[0] % 1000000).padStart(6, "0");
  }
  return String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
}
