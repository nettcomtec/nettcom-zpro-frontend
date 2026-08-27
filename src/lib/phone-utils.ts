import { useAuthStore } from "@/stores/auth-store";

/**
 * Normaliza número de telefone brasileiro seguindo as mesmas regras do backend
 * (helpers/FormatBrPhoneByConventionZPRO + gate Tenant.validateContact).
 *
 * A correção automática do 9º dígito agora é CONFIGURÁVEL por tenant:
 *  - Tenant.validateContact = "disabled" → nenhuma correção automática (retorna
 *    os dígitos como digitados)
 *  - Tenant.brPhoneConvention = "legacy" (padrão) → heurística histórica por DDD:
 *      fixo (1º dígito após DDD = 1..4) fica intacto;
 *      DDD < 30: celular DEVE ter 9º dígito → adiciona se faltar;
 *      DDD >= 30: celular NÃO usa 9º dígito → remove se houver
 *  - Tenant.brPhoneConvention = "always9" → convenção pós-2016: celular SEMPRE
 *    com o 9 (nunca remove; adiciona quando faltar em número de 12 dígitos com
 *    1º dígito 6-9). Fixos ficam intactos.
 *
 * A config vem do auth-store (chaves injetadas pelo layout via injectTenantSettings).
 * Recebe e retorna apenas dígitos (sem +, espaços, etc.).
 */

type BrPhoneConvention = "legacy" | "always9";

function getTenantPhoneConfig(): { convention: BrPhoneConvention; enabled: boolean } {
  try {
    const configuracoes = useAuthStore.getState().configuracoes || [];
    const read = (key: string): string | undefined => {
      const found = configuracoes.find((c: { key: string; value?: string | null }) => c.key === key);
      return found?.value ?? undefined;
    };
    const convention: BrPhoneConvention =
      read("brPhoneConvention") === "always9" ? "always9" : "legacy";
    // validateContact desligado no tenant = front também não corrige nada
    const enabled = read("validateContact") !== "disabled";
    return { convention, enabled };
  } catch {
    return { convention: "legacy", enabled: true };
  }
}

export function normalizeBrPhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");

  // Só processa números brasileiros com pelo menos 12 dígitos (55 + DDD + número)
  if (digits.length < 12 || !digits.startsWith("55")) return digits;

  const { convention, enabled } = getTenantPhoneConfig();
  if (!enabled) return digits;

  const ddd = parseInt(digits.slice(2, 4), 10);
  const hasNine = digits.length === 13 && digits[4] === "9";
  const firstDigit = parseInt(digits[4], 10);

  if (convention === "always9") {
    // Celular sem o 9 (12 dígitos, 1º dígito 6-9): adiciona. Nunca remove.
    if (!hasNine && digits.length === 12 && firstDigit >= 6) {
      return digits.slice(0, 4) + "9" + digits.slice(4);
    }
    return digits;
  }

  // legacy — heurística histórica por DDD
  // Fixo (começa com 1-4): remove o 9 se presente
  if (firstDigit >= 1 && firstDigit <= 4) {
    if (hasNine) return digits.slice(0, 4) + digits.slice(5);
    return digits;
  }

  // Celular DDD < 30: adiciona 9 se ausente
  if (ddd < 30 && !hasNine) {
    return digits.slice(0, 4) + "9" + digits.slice(4);
  }

  // Celular DDD >= 30: remove 9 se presente
  if (ddd >= 30 && hasNine) {
    return digits.slice(0, 4) + digits.slice(5);
  }

  return digits;
}

/**
 * Valida se uma string de dígitos representa um número BR válido após normalização.
 * Aceita 12 (fixo/celular sem 9) ou 13 dígitos (celular com 9) começando em 55.
 */
export function isValidBrPhone(digits: string): boolean {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length < 12) return false;
  const normalized = normalizeBrPhone(d);
  return normalized.length === 12 || normalized.length === 13;
}

/**
 * Retorna o número informado + a variante alternativa com/sem o 9º dígito
 * para celulares BR, deduplicado. Útil para buscar contatos legados que
 * possam estar salvos em qualquer das duas formas (12 ou 13 dígitos),
 * já que o backend faz `LIKE %query%` e não casa entre as variantes.
 * (Independe da convenção/gate do tenant — é lookup, não correção.)
 */
export function getBrPhoneVariants(phoneNumber: string): string[] {
  const digits = phoneNumber.replace(/\D/g, "");
  const variants = new Set<string>();
  if (digits) variants.add(digits);

  if (digits.length >= 12 && digits.startsWith("55")) {
    const firstDigit = parseInt(digits[4], 10);
    const hasNine = digits.length === 13 && digits[4] === "9";

    if (hasNine) {
      variants.add(digits.slice(0, 4) + digits.slice(5));
    } else if (digits.length === 12 && firstDigit >= 5) {
      // Celular legado sem o 9º dígito: oferece também a forma com 9
      variants.add(digits.slice(0, 4) + "9" + digits.slice(4));
    }
  }

  return Array.from(variants);
}

/**
 * Parse texto livre em lista de números BR normalizados e sem duplicatas.
 * Separadores aceitos: vírgula, ponto e vírgula, quebra de linha.
 */
export function parseBulkPhoneList(text: string): string[] {
  if (!text) return [];
  const raw = text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const normalized = normalizeBrPhone(entry);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export type BrPhoneAmbiguityReason =
  | "fixed_has_9"
  | "mobile_missing_9"
  | "mobile_has_9";

export type BrPhoneAmbiguity = {
  raw: string;
  normalized: string;
  reason: BrPhoneAmbiguityReason;
};

/**
 * Detecta se um número BR seria alterado pela correção automática vigente
 * (convenção do tenant). Retorna detalhe da divergência ou null quando o
 * número está OK / não é BR / é curto demais / a correção está desligada.
 *
 * Útil pra avisar o usuário em uploads de massa que aquele número, do jeito
 * que está, pode bater num contato diferente do que ele tem no banco.
 */
export function detectBrPhoneAmbiguity(rawInput: string): BrPhoneAmbiguity | null {
  const digits = (rawInput || "").replace(/\D/g, "");
  if (digits.length < 12 || !digits.startsWith("55")) return null;
  const normalized = normalizeBrPhone(digits);
  if (normalized === digits) return null;

  // Classifica pela direção da correção (vale para ambas as convenções)
  const reason: BrPhoneAmbiguityReason =
    normalized.length > digits.length ? "mobile_missing_9" : "mobile_has_9";
  return { raw: digits, normalized, reason };
}
