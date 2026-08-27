interface ContactIdentityFields {
  number?: string | null;
  username?: string | null;
  bsuid?: string | null;
}

interface ContactNameFields {
  name?: string | null;
  pushname?: string | null;
  username?: string | null;
  number?: string | null;
  lid?: string | null;
  isLid?: boolean | null;
}

/**
 * Nome exibível do contato, com fallback para @username (recurso WhatsApp 2026 — item F).
 * Cadeia pedida: name -> pushname -> @username -> number -> lid.
 *
 * Exceção LID-only: quando o contato só tem LID (sem número real) e o `name` gravado
 * é apenas o placeholder de dígitos (o próprio LID/número), o @username é mais legível
 * e tem prioridade — evita exibir os dígitos crus do LID. Um nome real definido pelo
 * operador (não-dígitos) é sempre preservado.
 */
export function displayContactName(contact: ContactNameFields | null | undefined): string {
  if (!contact) return "";
  const name = (contact.name ?? "").trim();
  const pushname = (contact.pushname ?? "").trim();
  const username = contact.username ? `@${contact.username}` : "";
  const number = (contact.number ?? "").trim();
  const lid = (contact.lid ?? "").trim();

  const isLidOnly = !!contact.isLid && (!number || number === lid);
  const nameIsDigitPlaceholder =
    !name || name === number || name === lid || /^\d+$/.test(name);

  if (username && isLidOnly && nameIsDigitPlaceholder) return username;

  return name || pushname || username || number || lid || "";
}

/** Use in JSX/display only. Returns the best human-readable identifier. */
export function displayContactIdentity(contact: ContactIdentityFields | null | undefined): string {
  if (!contact) return "";
  if (contact.number) return contact.number;
  if (contact.username) return contact.username;
  if (contact.bsuid) return `BSUID:${contact.bsuid}`;
  return "";
}

/** Use in logic that requires a phone number (API calls, JIDs, deep links). */
export function getContactPhone(contact: ContactIdentityFields | null | undefined): string | undefined {
  return contact?.number || undefined;
}

/** True when the contact has no phone — only reachable via BSUID. */
export function isContactBsuidOnly(contact: ContactIdentityFields | null | undefined): boolean {
  return !contact?.number && !!contact?.bsuid;
}
