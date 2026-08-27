"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingSaveButtonProps {
  saving: boolean;
  onClick: () => void;
  disabled?: boolean;
  threshold?: number;
}

export function FloatingSaveButton({ saving, onClick, disabled, threshold = 150 }: FloatingSaveButtonProps) {
  const t = useTranslations("common");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // The actual scroll container in the dashboard layout is #main-scroll (not window)
    const container = document.getElementById("main-scroll") ?? window;
    const getScrollTop = () =>
      container instanceof Window ? container.scrollY : (container as HTMLElement).scrollTop;
    const onScroll = () => setVisible(getScrollTop() > threshold);
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 transition-all duration-300",
        visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <Button size="sm" disabled={saving || disabled} onClick={onClick} className="shadow-lg">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {t("save")}
      </Button>
    </div>
  );
}
