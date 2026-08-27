"use client";

import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TagName = "span" | "p" | "h3" | "h4" | "div";

interface Props extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  text: string;
  as?: TagName;
  delayMs?: number;
  side?: "top" | "bottom" | "left" | "right";
  tooltipMaxWidth?: number;
}

export function TruncateWithTooltip({
  text,
  as = "span",
  className,
  delayMs = 100,
  side = "top",
  tooltipMaxWidth = 320,
  ...rest
}: Props) {
  const ref = React.useRef<HTMLElement>(null);
  const [overflowing, setOverflowing] = React.useState(false);

  const check = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollWidth > el.clientWidth + 1);
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, check]);

  const Tag = as as React.ElementType;
  const node = (
    <Tag
      ref={ref as React.Ref<HTMLElement>}
      className={cn("truncate min-w-0", className)}
      title={overflowing ? text : undefined}
      onMouseEnter={check}
      {...rest}
    >
      {text}
    </Tag>
  );

  if (!overflowing) return node;

  return (
    <Tooltip delayDuration={delayMs}>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side={side} className="break-words" style={{ maxWidth: tooltipMaxWidth }}>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
