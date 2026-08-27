"use client";

// Selo "Meta Business Partner" clicavel: abre um popup com o selo ampliado.
// Usado em /assinatura e /app-waba. Componente presentacional (sem i18n proprio):
// o rotulo acessivel vem por prop (zoomLabel) da pagina, que ja tem o namespace.
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";

export function MetaPartnerSealDialog({
  imgClassName,
  zoomLabel,
}: {
  imgClassName?: string;
  zoomLabel?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={zoomLabel}
          title={zoomLabel}
          className="inline-flex shrink-0 cursor-zoom-in items-center rounded-md border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bmpartner.png"
            alt="Meta Business Partner"
            className={imgClassName ?? "h-8 object-contain opacity-90"}
            draggable={false}
          />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle className="sr-only">Meta Business Partner</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bmpartner.png"
          alt="Meta Business Partner"
          className="w-full max-h-[72vh] object-contain rounded-md"
          draggable={false}
        />
      </DialogContent>
    </Dialog>
  );
}
