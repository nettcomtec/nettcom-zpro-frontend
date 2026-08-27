import { create } from "zustand";

/**
 * Confirmação de envio manual para e-mail descadastrado (PLANO_EMAIL_MASSA D6/§5.4).
 * O dialog é global (montado no layout do dashboard) e o fluxo é promise-based:
 * `confirmEmailOptOut(date)` resolve true (enviar mesmo assim) ou false.
 * Centralizado DENTRO do sendEmailWebmail — cobre os 5 pontos de envio do app
 * sem duplicar dialog em cada tela.
 */

interface EmailOptOutConfirmState {
  open: boolean;
  optOutDate: string | null;
  resolver: ((confirmed: boolean) => void) | null;
  ask: (optOutDate: string | null) => Promise<boolean>;
  resolve: (confirmed: boolean) => void;
}

export const useEmailOptOutConfirmStore = create<EmailOptOutConfirmState>((set, get) => ({
  open: false,
  optOutDate: null,
  resolver: null,
  ask: (optOutDate: string | null) =>
    new Promise<boolean>(resolve => {
      // Se já houver um pedido pendente, cancela o anterior
      get().resolver?.(false);
      set({ open: true, optOutDate, resolver: resolve });
    }),
  resolve: (confirmed: boolean) => {
    get().resolver?.(confirmed);
    set({ open: false, optOutDate: null, resolver: null });
  }
}));

export const confirmEmailOptOut = (optOutDate: string | null): Promise<boolean> =>
  useEmailOptOutConfirmStore.getState().ask(optOutDate);
