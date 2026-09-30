// Busca de CEP direto do navegador (PLANO_ENDERECO_COMPLETO_CONTATO §5 0.6).
// ViaCEP primeiro; com falha de rede, tempo esgotado ou resposta ruim cai na BrasilAPI v1.
// Só o CEP sai do navegador — nenhuma credencial (fetch nativo, sem cookie de terceiro).

export type CepLookupResult =
  | { status: "ok"; logradouro: string; bairro: string; cidade: string; uf: string }
  | { status: "invalid" }
  | { status: "notFound" }
  | { status: "error" }
  | { status: "aborted" };

const TIMEOUT_MS = 5000;

// Dígitos do CEP em qualquer texto colado ("CEP 01.310-100" → "01310100"), até 8.
export function cepDigits(text: string | null | undefined): string {
  return String(text ?? "").replace(/\D/g, "").slice(0, 8);
}

// "00000-000" pelos dígitos (até 8).
export function formatCep(text: string | null | undefined): string {
  const digits = cepDigits(text);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

class ExternalAbort extends Error {}

async function fetchJson(
  url: string,
  signal: AbortSignal | undefined
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const res = await fetch(url, { signal: controller.signal });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    if (signal?.aborted) throw new ExternalAbort();
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

const isTruthyFlag = (value: unknown): boolean =>
  value === true || String(value ?? "").trim().toLowerCase() === "true";

export async function lookupCep(cep: string | null | undefined, signal?: AbortSignal): Promise<CepLookupResult> {
  const digits = cepDigits(cep);
  if (digits.length < 8) return { status: "invalid" };

  try {
    const via = await fetchJson(`https://viacep.com.br/ws/${digits}/json/`, signal);
    if (via.ok && via.data && typeof via.data === "object") {
      const data = via.data as Record<string, unknown>;
      // ViaCEP responde 200 com { erro: true } (às vezes "true" em texto) para CEP inexistente.
      if (isTruthyFlag(data.erro)) return { status: "notFound" };
      return {
        status: "ok",
        logradouro: clean(data.logradouro),
        bairro: clean(data.bairro),
        cidade: clean(data.localidade),
        uf: clean(data.uf).toUpperCase(),
      };
    }
  } catch (err) {
    if (err instanceof ExternalAbort) return { status: "aborted" };
    // rede ou tempo esgotado: tenta a reserva
  }

  try {
    const br = await fetchJson(`https://brasilapi.com.br/api/cep/v1/${digits}`, signal);
    if (br.status === 404) return { status: "notFound" };
    if (br.ok && br.data && typeof br.data === "object") {
      const data = br.data as Record<string, unknown>;
      return {
        status: "ok",
        logradouro: clean(data.street),
        bairro: clean(data.neighborhood),
        cidade: clean(data.city),
        uf: clean(data.state).toUpperCase(),
      };
    }
    return { status: "error" };
  } catch (err) {
    if (err instanceof ExternalAbort) return { status: "aborted" };
    return { status: "error" };
  }
}
