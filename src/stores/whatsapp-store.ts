import { create } from "zustand";

export interface WhatsApp {
  id: number;
  name: string;
  status: string;
  number?: string;
  updatedAt?: string;
  createdAt?: string;
  profilePic?: string;
  tokenAPI?: string;
  wabaId?: string;
  phone?: { pushname?: string; name?: string; phone?: string };
  type?: string;
  channel?: string;
  session?: string;
  qrcode?: string;
  battery?: string;
  plugged?: boolean;
  isDefault?: boolean;
  isDeleted?: boolean;
  smtpConfig?: any;
  emailSignature?: string;
  /** Modo híbrido (coexistence/two_numbers/disabled) e canal vinculado */
  hybridMode?: string;
  linkedChannelId?: number | null;
}

interface WhatsAppState {
  whatsapps: WhatsApp[];
  setWhatsapps: (whatsapps: WhatsApp[]) => void;
  updateWhatsapp: (whatsapp: Partial<WhatsApp> & { id: number }) => void;
  removeWhatsapp: (id: number) => void;
  reset: () => void;
}

export const useWhatsappStore = create<WhatsAppState>((set) => ({
  whatsapps: [],

  setWhatsapps: (whatsapps) => set({ whatsapps }),

  updateWhatsapp: (whatsapp) =>
    set((state) => ({
      whatsapps: state.whatsapps.map((w) =>
        w.id === whatsapp.id ? { ...w, ...whatsapp } : w
      ),
    })),

  removeWhatsapp: (id) =>
    set((state) => ({
      whatsapps: state.whatsapps.filter((w) => w.id !== id),
    })),
  reset: () => set({ whatsapps: [] }),
}));
