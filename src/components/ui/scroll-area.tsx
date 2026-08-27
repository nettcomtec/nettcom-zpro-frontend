"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

/* `type` default do Radix é "hover": a barra só é MONTADA quando o ponteiro entra na
   área, e o CSS que o Radix injeta esconde a barra nativa do viewport. Resultado: lista
   longa parece cortada, sem nenhum indício de que há mais conteúdo. "auto" mostra a barra
   sempre que houver overflow — mesma semântica da nativa. */
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, type = "auto", ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} type={type} className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full max-w-full min-w-0 rounded-[inherit] overflow-x-hidden [&>div]:max-w-full [&>div]:!w-full">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      /* w-2/h-2 com p-[1px] = polegar de 6px — mesma medida da barra nativa
         (`::-webkit-scrollbar` em globals.css), pra não conviverem dois visuais. */
      orientation === "vertical" && "h-full w-2 p-[1px]",
      orientation === "horizontal" && "h-2 flex-col p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-muted-foreground/20 transition-colors hover:bg-muted-foreground/40" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
