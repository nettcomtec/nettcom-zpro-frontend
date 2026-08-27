"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Bot, Loader2, RefreshCw, ClipboardCopy, Check, TrendingUp, Meh, TrendingDown, AlertTriangle, Zap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  suggestReply,
  analyzeSentiment,
  suggestFastReplies,
  type SentimentLevel,
} from "@/services/copilot";
import { useUrgencyStore } from "@/stores/urgency-store";
import { useTicketStore } from "@/stores/ticket-store";
import api from "@/lib/api";

const COPILOT_PROVIDER_LABELS: Record<string, string> = {
  openai: "ChatGPT",
  groq: "Grok",
  claude: "Claude",
  gemini: "Gemini",
};

function formatProviderInfo(provider?: string | null, model?: string | null): string {
  if (!provider) return "";
  const label = COPILOT_PROVIDER_LABELS[provider] ?? provider;
  return model ? `${label} (${model})` : label;
}

interface CopilotPanelProps {
  open: boolean;
  onClose: () => void;
  ticketId: number;
  currentText?: string;
  onUseSuggestion: (text: string) => void;
}

const SENTIMENT_CONFIG: Record<
  SentimentLevel,
  { icon: React.ElementType; className: string; labelKey: string }
> = {
  positive: { icon: TrendingUp, className: "bg-green-100 text-green-700 border-green-200", labelKey: "sentimentPositive" },
  neutral: { icon: Meh, className: "bg-gray-100 text-gray-600 border-gray-200", labelKey: "sentimentNeutral" },
  negative: { icon: TrendingDown, className: "bg-orange-100 text-orange-700 border-orange-200", labelKey: "sentimentNegative" },
  frustrated: { icon: AlertTriangle, className: "bg-red-100 text-red-700 border-red-200", labelKey: "sentimentFrustrated" },
};

export function CopilotPanel({
  open,
  onClose,
  ticketId,
  currentText,
  onUseSuggestion,
}: CopilotPanelProps) {
  const t = useTranslations("copilot");
  const tPrompts = useTranslations("copilotPrompts");
  const setUrgencySentiment = useUrgencyStore((s) => s.setSentiment);
  const updateTicketInStore = useTicketStore((s) => s.updateTicket);

  const [suggesting, setSuggesting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [sentiment, setSentiment] = useState<SentimentLevel | null>(null);
  const [sentimentSummary, setSentimentSummary] = useState("");
  const [copied, setCopied] = useState(false);
  const [loadingFastReplies, setLoadingFastReplies] = useState(false);
  const [fastReplies, setFastReplies] = useState<string[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [sentimentProvider, setSentimentProvider] = useState<string | null>(null);
  const [sentimentModel, setSentimentModel] = useState<string | null>(null);
  const [fastRepliesProvider, setFastRepliesProvider] = useState<string | null>(null);
  const [fastRepliesModel, setFastRepliesModel] = useState<string | null>(null);
  const [suggestionProvider, setSuggestionProvider] = useState<string | null>(null);
  const [suggestionModel, setSuggestionModel] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !ticketId) return;
    let cancelled = false;
    api.get<{ provider: string; model: string }>(`/copilot/resolve`, { params: { ticketId } })
      .then(({ data }) => {
        if (cancelled) return;
        if (data.provider) setProvider(data.provider);
        if (data.model) setModel(data.model);
      })
      .catch(() => { /* silencioso — fallback usa "IA" */ });
    return () => { cancelled = true; };
  }, [open, ticketId]);

  const handleSuggest = useCallback(async () => {
    setSuggesting(true);
    try {
      const result = await suggestReply(ticketId, currentText);
      setSuggestion(result.suggestion);
      if (result.provider) { setProvider(result.provider); setSuggestionProvider(result.provider); }
      if (result.model) { setModel(result.model); setSuggestionModel(result.model); }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("ERR_COPILOT_NO_API_KEY") || (err as { response?: { status?: number } })?.response?.status === 422) {
        toast.error(t("noApiKey"));
      } else {
        toast.error(t("errorSuggest"));
      }
    } finally {
      setSuggesting(false);
    }
  }, [ticketId, currentText, t]);

  const handleSentiment = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await analyzeSentiment(ticketId);
      setSentiment(result.sentiment);
      setSentimentSummary(result.summary);
      if (result.provider) { setProvider(result.provider); setSentimentProvider(result.provider); }
      if (result.model) { setModel(result.model); setSentimentModel(result.model); }
      setUrgencySentiment(ticketId, result.sentiment);
      updateTicketInStore({
        id: ticketId,
        sentiment: result.sentiment,
        sentimentSummary: result.summary,
        sentimentAnalyzedAt: new Date().toISOString(),
      });
    } catch {
      toast.error(t("errorSentiment"));
    } finally {
      setAnalyzing(false);
    }
  }, [ticketId, t, setUrgencySentiment, updateTicketInStore]);

  const handleFastReplies = useCallback(async () => {
    setLoadingFastReplies(true);
    try {
      const systemPrompt = tPrompts("fastReplies");
      const result = await suggestFastReplies(ticketId, systemPrompt);
      setFastReplies(result.suggestions || []);
      if (result.provider) { setProvider(result.provider); setFastRepliesProvider(result.provider); }
      if (result.model) { setModel(result.model); setFastRepliesModel(result.model); }
      if (!result.suggestions?.length) {
        toast.info(t("errorFastReplies"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("ERR_COPILOT_NO_API_KEY") || (err as { response?: { status?: number } })?.response?.status === 422) {
        toast.error(t("noApiKey"));
      } else {
        toast.error(t("errorFastReplies"));
      }
    } finally {
      setLoadingFastReplies(false);
    }
  }, [ticketId, t, tPrompts]);

  const handleUseFastReply = useCallback(
    (text: string) => {
      onUseSuggestion(text);
      onClose();
    },
    [onUseSuggestion, onClose]
  );

  const handleUse = useCallback(() => {
    if (!suggestion.trim()) return;
    onUseSuggestion(suggestion);
    onClose();
  }, [suggestion, onUseSuggestion, onClose]);

  const handleCopy = useCallback(async () => {
    if (!suggestion.trim()) return;
    await navigator.clipboard.writeText(suggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [suggestion]);

  const handleOpenChange = (v: boolean) => {
    if (!v) onClose();
  };

  const sentimentCfg = sentiment ? SENTIMENT_CONFIG[sentiment] : null;
  const providerInfo = formatProviderInfo(provider, model);
  const sentimentInfo = formatProviderInfo(sentimentProvider, sentimentModel);
  const fastRepliesInfo = formatProviderInfo(fastRepliesProvider, fastRepliesModel);
  const suggestionInfo = formatProviderInfo(suggestionProvider, suggestionModel);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-500" />
            {t("title")}
          </DialogTitle>
          {providerInfo && (
            <div className="mt-1">
              <span className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-300">
                <Sparkles className="h-3 w-3" />
                {providerInfo}
              </span>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4 px-6 pb-6 pt-1 flex-1 min-h-0 overflow-y-auto">
          {/* Sentiment section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{t("sentimentTitle")}</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleSentiment}
                disabled={analyzing}
              >
                {analyzing
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <RefreshCw className="h-3 w-3" />}
                {t("analyze")}
              </Button>
            </div>

            {analyzing && (sentimentInfo || providerInfo) && (
              <p className="text-[11px] text-violet-600 dark:text-violet-400 italic flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                via {sentimentInfo || providerInfo}…
              </p>
            )}

            {sentiment && sentimentCfg && (
              <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${sentimentCfg.className}`}>
                <sentimentCfg.icon className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium">{t(sentimentCfg.labelKey)}</span>
                  {sentimentSummary && (
                    <p className="text-xs mt-0.5 opacity-80">{sentimentSummary}</p>
                  )}
                </div>
              </div>
            )}

            {sentiment === "frustrated" && (
              <p className="text-xs text-red-600 font-medium">{t("alertFrustration")}</p>
            )}

            {sentiment && sentimentInfo && (
              <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                via {sentimentInfo}
              </p>
            )}
          </div>

          <Separator />

          {/* Fast-reply suggestions section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{t("fastReplySuggestions")}</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleFastReplies}
                disabled={loadingFastReplies}
              >
                {loadingFastReplies
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Zap className="h-3 w-3" />}
                {loadingFastReplies ? t("loadingFastReplies") : t("fastReplySuggestions")}
              </Button>
            </div>

            {loadingFastReplies && (fastRepliesInfo || providerInfo) && (
              <p className="text-[11px] text-violet-600 dark:text-violet-400 italic flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                via {fastRepliesInfo || providerInfo}…
              </p>
            )}

            {fastReplies.length > 0 && (
              <div className="space-y-1.5">
                {fastReplies.map((reply, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleUseFastReply(reply)}
                    className="w-full text-left rounded-md border border-violet-200 bg-violet-50 hover:bg-violet-100 px-3 py-2 text-sm text-violet-900 transition-colors"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}

            {fastReplies.length > 0 && fastRepliesInfo && (
              <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                via {fastRepliesInfo}
              </p>
            )}
          </div>

          <Separator />

          {/* Suggestion section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{t("suggestionTitle")}</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleSuggest}
                disabled={suggesting}
              >
                {suggesting
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Bot className="h-3 w-3" />}
                {suggesting ? t("generating") : t("suggest")}
              </Button>
            </div>

            {suggesting && (suggestionInfo || providerInfo) && (
              <p className="text-[11px] text-violet-600 dark:text-violet-400 italic flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                via {suggestionInfo || providerInfo}…
              </p>
            )}

            <Textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder={t("suggestionPlaceholder")}
              className="min-h-[100px] max-h-[300px] overflow-y-auto text-sm"
            />

            {suggestion.trim() && suggestionInfo && (
              <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                via {suggestionInfo}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleCopy}
              disabled={!suggestion.trim()}
            >
              {copied
                ? <Check className="h-3.5 w-3.5 text-green-600" />
                : <ClipboardCopy className="h-3.5 w-3.5" />}
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-violet-600 hover:bg-violet-700"
              onClick={handleUse}
              disabled={!suggestion.trim()}
            >
              <Check className="h-3.5 w-3.5" />
              {t("use")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Compact sentiment badge for use in ticket header
export function SentimentBadge({ sentiment }: { sentiment: SentimentLevel }) {
  const t = useTranslations("copilot");
  const cfg = SENTIMENT_CONFIG[sentiment];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-xs ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {t(cfg.labelKey)}
    </Badge>
  );
}
