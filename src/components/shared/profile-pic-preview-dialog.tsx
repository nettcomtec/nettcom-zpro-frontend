"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Users2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn, getAvatarColor, getInitials } from "@/lib/utils";

export type ProfilePicPreview = {
  /** URL da foto — pode estar quebrada/expirada (WhatsApp pps expira) */
  url: string;
  /** Nome usado para as iniciais e a cor do avatar quando a foto nao carrega */
  name?: string | null;
  /** Grupos usam icone no lugar das iniciais (igual ao avatar da lista) */
  isGroup?: boolean;
};

/** Mesma regra do avatar da lista: descarta placeholders e e-mails salvos por engano */
function isUsableUrl(url?: string | null): boolean {
  const u = url?.trim();
  if (!u || u === "null" || u === "undefined") return false;
  if (u.includes("@") && !u.startsWith("http") && !u.startsWith("/")) return false;
  return true;
}

/**
 * Popup da foto de perfil. Quando a URL falha ao carregar (foto do WhatsApp
 * expirada, 404, URL invalida) o <img alt=""> colapsa para 0px e o modal virava
 * uma faixa branca vazia — aqui caimos para as iniciais do contato, com a mesma
 * cor deterministica do avatar da lista.
 */
export function ProfilePicPreviewDialog({
  preview,
  onClose,
  blur,
}: {
  preview: ProfilePicPreview | null;
  onClose: () => void;
  /** aplica blur do modo live */
  blur?: boolean;
}) {
  const tCommon = useTranslations("common");
  // Guarda a URL que falhou (nao um booleano): o componente segue montado com
  // preview=null enquanto fechado, entao comparar por URL faz a proxima foto
  // tentar carregar normalmente e a mesma foto quebrada ja abrir nas iniciais.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = preview?.url ?? null;

  if (!preview) return null;

  const showFallback = !isUsableUrl(url) || failedUrl === url;
  const color = getAvatarColor(preview.name);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm p-2 flex items-center justify-center">
        {showFallback ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-8">
            <div
              className={cn(
                "h-32 w-32 rounded-full flex items-center justify-center text-4xl font-semibold select-none",
                blur && "live-blur"
              )}
              style={{ backgroundColor: color.background, color: color.color }}
            >
              {preview.isGroup ? <Users2 className="h-14 w-14" /> : getInitials(preview.name || "?")}
            </div>
            {preview.name ? (
              <p className={cn("max-w-[240px] text-center text-base font-medium break-words", blur && "live-blur-text")}>
                {preview.name}
              </p>
            ) : null}
            <p className="text-center text-xs text-muted-foreground">{tCommon("profilePicUnavailable")}</p>
          </div>
        ) : (
          <img
            src={url!}
            alt=""
            onError={() => setFailedUrl(url)}
            className={cn("max-w-full max-h-[80vh] rounded-lg object-contain", blur && "live-blur")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
