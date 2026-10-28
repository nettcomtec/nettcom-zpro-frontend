"use client";
import { ConfigPage } from "@/components/config/config-section";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Brain, AlertTriangle, KeyRound, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ChatGPTPage() {
  const t = useTranslations("chatGptPage");
  return (
    <ConfigPage
      title={t("title")}
      description={t("description")}
      icon={Brain}
      banner={
        <div className="space-y-3">
          {/* A chave é POR CANAL: "todos os tickets" não liga o ChatGPT em canal sem
              chave, e o Agente de IA do canal vence nos atendimentos novos. */}
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertTitle>{t("channelKeyNoticeTitle")}</AlertTitle>
            <AlertDescription>{t("channelKeyNoticeDesc")}</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t("assistantMigrationTitle")}</AlertTitle>
            <AlertDescription>{t("assistantMigrationDesc")}</AlertDescription>
          </Alert>
        </div>
      }
      help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }}
      sections={[
        {
          title: t("title"),
          fields: [
            { key: "chatgpt", label: t("enableLabel"), type: "boolean", description: t("enableDescription") },
            {
              key: "chatgptAllTickets",
              label: t("allTicketsLabel"),
              type: "boolean",
              description: t("allTicketsDescription"),
              // Popover (abre no toque também), como o do endereço próprio do Copiloto.
              tooltipContent: (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                      aria-label={t("allTicketsLabel")}
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="w-[340px] max-w-[calc(100vw-2rem)] text-xs">
                    {t("allTicketsTooltip")}
                  </PopoverContent>
                </Popover>
              ),
            },
          ],
        },
      ]}
    />
  );
}
