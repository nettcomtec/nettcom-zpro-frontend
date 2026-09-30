"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import { createAiAgentUrlSource } from "@/services/ai-agents";
import { aiAgentErrorKey } from "./agent-error";

interface AgentSourceUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: number;
  onCreated: () => void;
}

// Só http/https: o servidor recusa qualquer outro esquema — validar aqui
// evita uma ida ao servidor e dá o aviso no campo
const URL_RE = /^https?:\/\/\S+$/i;

export function AgentSourceUrlDialog({
  open,
  onOpenChange,
  agentId,
  onCreated,
}: AgentSourceUrlDialogProps) {
  const t = useTranslations("aiAgents");

  const [url, setUrl] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setSyncEnabled(false);
    setSaving(false);
    setInvalid(false);
  }, [open]);

  const handleSubmit = async () => {
    const value = url.trim();
    if (!URL_RE.test(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setSaving(true);
    try {
      await createAiAgentUrlSource(agentId, { url: value, syncEnabled });
      toast.success(t("sourceAdded"));
      onOpenChange(false);
      onCreated();
    } catch (err: unknown) {
      const key = aiAgentErrorKey(err);
      toast.error(key ? t(key) : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t("urlDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("urlHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ai-agent-source-url">
              {t("urlField")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ai-agent-source-url"
              value={url}
              onChange={e => { setUrl(e.target.value); if (invalid) setInvalid(false); }}
              onKeyDown={e => { if (e.key === "Enter" && !saving) handleSubmit(); }}
              placeholder={t("urlPlaceholder")}
              inputMode="url"
              autoComplete="off"
            />
            {invalid && <p className="text-xs text-destructive">{t("urlInvalid")}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ai-agent-source-url-sync">{t("sourceSyncDaily")}</Label>
              <Switch
                id="ai-agent-source-url-sync"
                checked={syncEnabled}
                onCheckedChange={setSyncEnabled}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("sourceSyncDailyNote")}</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("sourceAdd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
