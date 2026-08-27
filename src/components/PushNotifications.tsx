"use client";

import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useTranslations } from "next-intl";

export function PushNotifications() {
  const { subscribed, isPWA, subscribeToPush } = usePushNotifications();
  const t = useTranslations("pushNotifications");

  if (!isPWA) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={subscribeToPush}
        >
          <BellRing className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {subscribed
          ? t("updateSubscription")
          : t("activateNotifications")}
      </TooltipContent>
    </Tooltip>
  );
}
