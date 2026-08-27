"use client";

import { NewConversationDialog } from "@/components/layout/header";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTicketId: number;
  contactName?: string;
  contactNumber?: string | null;
  contactEmail?: string | null;
}

/**
 * Cross-channel reply para tickets WooCommerce.
 *
 * Reusa o NewConversationDialog (envio de conversa avulsa) com:
 *  - numero pre-preenchido a partir do contato do ticket pai (read-only)
 *  - parentTicketId setado para vincular o ticket criado de volta ao WC
 *
 * Beneficios da reutilizacao: filtro Oficial/Nao Oficial, fluxo WABA com
 * templates + variaveis + gallery picker — tudo identico ao fluxo de envio
 * avulso, sem duplicar codigo.
 *
 * contactEmail nao eh suportado nesta fase: NewConversationDialog so envia
 * via WhatsApp (sendIndividualMessage). Email entra na Fase 2.
 */
export function ReplyViaChannelDialog({
  open,
  onOpenChange,
  sourceTicketId,
  contactName,
  contactNumber,
  contactEmail,
}: Props) {
  return (
    <NewConversationDialog
      open={open}
      onOpenChange={onOpenChange}
      prefilledNumber={contactNumber || undefined}
      prefilledContactName={contactName}
      prefilledContactEmail={contactEmail || undefined}
      parentTicketId={sourceTicketId}
      lockNumber={!!contactNumber}
    />
  );
}
