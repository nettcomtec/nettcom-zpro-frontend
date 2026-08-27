"use client";
import * as React from "react";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";

type Variant = "text" | "media" | "strong";

interface SensitiveProps extends React.HTMLAttributes<HTMLElement> {
  variant?: Variant;
  as?: "span" | "div" | "p";
  children: React.ReactNode;
}

const variantClass: Record<Variant, string> = {
  text: "live-blur-text",
  media: "live-blur",
  strong: "live-blur-strong",
};

export function Sensitive({
  variant = "text",
  as = "span",
  className,
  children,
  title,
  ...rest
}: SensitiveProps) {
  const { isLiveMode } = useLiveMode();
  const Tag = as as React.ElementType;
  return (
    <Tag
      className={cn(isLiveMode && variantClass[variant], className)}
      title={isLiveMode ? undefined : title}
      {...rest}
    >
      {children}
    </Tag>
  );
}
