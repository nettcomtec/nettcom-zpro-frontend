import type { Message } from "@/stores/ticket-store";

export interface EmailReplyInfo {
  /** Subject já com "Re: " quando aplicável (sem duplicar). Vazio quando não há thread. */
  subject: string;
  /** Message-ID do email de origem para o header In-Reply-To. */
  inReplyTo?: string;
  /** Cadeia References completa: references anteriores + messageId atual. */
  references?: string[];
}

/**
 * Monta dados para responder um email preservando thread (RFC 5322).
 * Prioriza a mensagem explicitamente sendo respondida (`replyTo`); senão pega
 * a última mensagem inbound do ticket com `emailMetadata.messageId`.
 */
export function buildEmailReplyInfo(
  messages: Message[],
  replyTo?: Message | null,
): EmailReplyInfo {
  let source: Message | undefined;
  if (replyTo?.emailMetadata?.messageId) {
    source = replyTo;
  } else {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m.fromMe && m.emailMetadata?.messageId) {
        source = m;
        break;
      }
    }
  }
  if (!source?.emailMetadata) return { subject: "" };

  const meta = source.emailMetadata;
  const base = (meta.subject ?? "").trim();
  const replySubject = base
    ? (/^re:\s*/i.test(base) ? base : `Re: ${base}`)
    : "";

  const prevRefs = Array.isArray(meta.references) ? meta.references : [];
  const references = meta.messageId
    ? [...prevRefs, meta.messageId]
    : (prevRefs.length > 0 ? prevRefs : undefined);

  return {
    subject: replySubject,
    inReplyTo: meta.messageId,
    references,
  };
}
