"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "next-themes";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <SonnerToaster
      theme={theme as ToasterProps["theme"]}
      richColors
      closeButton
      className="toaster group"
      toastOptions={{
        classNames: {
          // pr-8 reserva espaço p/ o X (20px + inset 8px) não cobrir o texto
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:pr-8",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // X DENTRO do toast, à direita, centralizado verticalmente com o
          // conteúdo (default do sonner é um círculo flutuante vazando o
          // canto superior esquerdo).
          closeButton:
            "group-[.toast]:left-auto group-[.toast]:right-2 group-[.toast]:top-1/2 group-[.toast]:-translate-y-1/2",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
