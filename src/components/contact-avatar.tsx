"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ContactAvatarProps {
  name?: string | null;
  profilePicUrl?: string | null;
  /** sizing (and any extra) classes, e.g. "w-7 h-7 shrink-0" */
  sizeClassName: string;
  /** styling for the initials fallback, e.g. "bg-primary text-white font-bold" */
  fallbackClassName?: string;
  /** apply live-mode blur */
  blur?: boolean;
  /** alt text for the image (default "") */
  alt?: string;
}

/**
 * Renders a contact's profile picture as a circular avatar, falling back to the
 * contact's initial. Unlike a bare <img>, this also falls back when the URL is
 * present but FAILS to load (expired WhatsApp pic, 404, invalid URL) — otherwise
 * the browser shows a broken-image glyph. Error state is tracked per URL so a
 * later valid URL (e.g. socket update) renders normally again.
 */
export function ContactAvatar({
  name,
  profilePicUrl,
  sizeClassName,
  fallbackClassName,
  blur,
  alt = "",
}: ContactAvatarProps) {
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);
  const hasPic =
    !!profilePicUrl && profilePicUrl !== "null" && erroredUrl !== profilePicUrl;

  if (hasPic) {
    return (
      <img
        src={profilePicUrl!}
        alt={alt}
        className={cn("rounded-full object-cover", sizeClassName, blur && "live-blur")}
        onError={() => setErroredUrl(profilePicUrl!)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center",
        sizeClassName,
        fallbackClassName,
        blur && "live-blur",
      )}
    >
      {name?.charAt(0)?.toUpperCase() ?? "?"}
    </div>
  );
}
