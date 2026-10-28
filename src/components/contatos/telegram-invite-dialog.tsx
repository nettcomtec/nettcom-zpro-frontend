"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Copy, Info, Loader2, QrCode, RefreshCw, Send, TriangleAlert, User } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { NewConversationDialog } from "@/components/layout/header";
import { createTelegramInvite, type TelegramInviteResponse } from "@/services/contacts";
import { fetchWhatsapps } from "@/services/whatsapp";
import { useWhatsappStore } from "@/stores/whatsapp-store";
import { useAuthStore } from "@/stores/auth-store";
import { filterWhatsappsByUserAccess } from "@/lib/whatsapp-user-access";
import { useLocale } from "@/i18n/locale-provider";
import { useLiveMode } from "@/hooks/use-live-mode";
import { getRegionText, useRegion } from "@/hooks/use-region";
import { cn } from "@/lib/utils";

export interface TelegramInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: { id: number | string; name: string; number?: string | null; email?: string | null };
  /** "contacts": copiar, QR e "enviar por outro canal". "ticket": mensagem editável enviada no atendimento atual. */
  mode: "contacts" | "ticket";
  /** Modo ticket: envia o texto no atendimento atual. Rejeita em falha (o diálogo avisa e continua aberto). */
  onSendInTicket?: (text: string) => Promise<void>;
}

// Só o que o diálogo lê do canal — a lista vem do store ou do GET /whatsapp (tipos diferentes).
interface BotLike {
  id: number;
  name: string;
  status?: string;
  type?: string;
  channel?: string;
  isDeleted?: boolean;
}

// Código do backend → chave de `telegramInvite`. 404 SEM código é backend antigo (rota
// inexistente) e tem mensagem própria; o resto cai no genérico.
const ERROR_KEY_BY_CODE: Record<string, string> = {
  ERR_TELEGRAM_ALREADY_LINKED: "errorAlreadyLinked",
  ERR_TELEGRAM_BOT_OFFLINE: "errorBotOffline",
  ERR_TELEGRAM_BOT_NOT_FOUND: "errorBotNotFound",
  ERR_TELEGRAM_BOT_REQUIRED: "errorBotRequired",
  ERR_TELEGRAM_BOT_UNAVAILABLE: "errorBotUnavailable",
  ERR_TELEGRAM_INVITE_DISABLED: "errorDisabled",
  ERR_TELEGRAM_INVITE_UNAVAILABLE: "errorUnavailable",
  ERR_TELEGRAM_INVITE_GROUP: "errorGroup",
  ERR_NO_PERMISSION: "errorNoPermission",
  ERR_CONTACT_NOT_FOUND: "errorContactNotFound",
};

// O interceptor de lib/api.ts rejeita com o PRÓPRIO response (status/data na raiz). O 409 do
// AppError traz o código em `data.message`; os demais em `data.error` — lê os dois e só aceita
// o que tem cara de código (no 409 de ticket o `message` é JSON serializado).
function readInviteError(err: unknown): { status?: number; code: string } {
  const e = err as { status?: number; data?: unknown; response?: { status?: number; data?: unknown } } | null;
  const status = e?.status ?? e?.response?.status;
  const data = (e?.data ?? e?.response?.data) as { error?: unknown; message?: unknown } | undefined;
  let code = "";
  if (data && typeof data === "object") {
    for (const value of [data.error, data.message]) {
      if (typeof value === "string" && value.trim().startsWith("ERR_")) {
        code = value.trim().split(/\s+/)[0];
        break;
      }
    }
  }
  return { status, code };
}

function isConnectedTelegramBot(w: BotLike): boolean {
  return (w.type || w.channel) === "telegram" && w.status === "CONNECTED" && !w.isDeleted;
}

export function TelegramInviteDialog({ open, onOpenChange, contact, mode, onSendInTicket }: TelegramInviteDialogProps) {
  const t = useTranslations("telegramInvite");
  const tCommon = useTranslations("common");
  // O texto que acompanha o link vai ao CLIENTE: sai do catálogo da Região (idioma da empresa),
  // nunca do idioma da tela do atendente.
  const { ensureTexts } = useRegion();
  const { locale } = useLocale();
  const { isLiveMode } = useLiveMode();
  const user = useAuthStore((s) => s.user);
  const supervisorAdmin = useAuthStore((s) => s.supervisorAdmin);
  // "Enviar por outro canal" abre a Nova Conversa: some para quem não pode iniciar conversa
  // (D12); o link continua copiável e o QR Code segue na tela.
  const canStartConversation = useAuthStore((s) => s.canStartConversation());
  const storeWhatsapps = useWhatsappStore((s) => s.whatsapps);

  const [fetchedWhatsapps, setFetchedWhatsapps] = useState<BotLike[] | null>(null);
  const [botsFetchDone, setBotsFetchDone] = useState(false);
  const [botId, setBotId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<TelegramInviteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [otherChannelOpen, setOtherChannelOpen] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  // Resposta que chega depois de fechar/reabrir (ou de outro clique) é descartada.
  const requestSeqRef = useRef(0);

  // Cada abertura começa do zero: o link é credencial e só vale o mais novo.
  useEffect(() => {
    if (!open) return;
    requestSeqRef.current += 1;
    setBotId("");
    setGenerating(false);
    setResult(null);
    setError(null);
    setMessage("");
    setSending(false);
    setOtherChannelOpen(false);
  }, [open, contact.id]);

  useEffect(() => {
    if (open) void ensureTexts();
  }, [open, ensureTexts]);

  // Lista fresca dos canais ao abrir (cache de 1,5 s no serviço); enquanto não chega, vale o store.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchWhatsapps()
      .then(({ data }) => {
        if (alive) setFetchedWhatsapps(Array.isArray(data) ? (data as unknown as BotLike[]) : []);
      })
      .catch(() => { /* fica com o que o store já tem */ })
      .finally(() => { if (alive) setBotsFetchDone(true); });
    return () => { alive = false; };
  }, [open]);

  const bots = useMemo(() => {
    const source = (fetchedWhatsapps ?? (storeWhatsapps as unknown as BotLike[])) || [];
    return filterWhatsappsByUserAccess(source.filter(isConnectedTelegramBot), user, supervisorAdmin);
  }, [fetchedWhatsapps, storeWhatsapps, user, supervisorAdmin]);

  // Um bot só: já vem escolhido. Vários: o atendente escolhe (o backend recusa sem bot).
  useEffect(() => {
    if (!open) return;
    setBotId((prev) => {
      if (prev && bots.some((b) => String(b.id) === prev)) return prev;
      return bots.length === 1 ? String(bots[0].id) : "";
    });
  }, [open, bots, contact.id]);

  // Lê o store na hora (getRegionText): os textos podem chegar entre o render e o clique.
  const buildMessage = (link: string) =>
    `${getRegionText(
      "telegram.inviteMessage",
      undefined,
      "Agora você também pode falar com a gente pelo Telegram. Toque no link abaixo e depois em Iniciar:"
    )}\n${link}`;

  const describeError = (err: unknown): string => {
    const { status, code } = readInviteError(err);
    const key = code ? ERROR_KEY_BY_CODE[code] : undefined;
    if (key) return t(key);
    if (status === 404 && !code) return t("errorOutdatedBackend");
    return t("errorGeneric");
  };

  const handleGenerate = async () => {
    if (!botId || generating) return;
    const seq = ++requestSeqRef.current;
    const previousLink = result?.link ?? null;
    setGenerating(true);
    setError(null);
    try {
      const { data } = await createTelegramInvite(contact.id, { whatsappId: Number(botId) });
      if (seq !== requestSeqRef.current) return;
      if (!data || typeof data.link !== "string" || !data.link) {
        setResult(null);
        setError(t("errorGeneric"));
        return;
      }
      setResult(data);
      // O link entra em código, nunca interpolado no ICU. Gerar de novo troca só o link
      // dentro do texto que o atendente já editou.
      setMessage((prev) =>
        previousLink && prev.includes(previousLink)
          ? prev.split(previousLink).join(data.link)
          : buildMessage(data.link)
      );
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      // Falhou: o link anterior pode já ter sido usado (ou trocado) — não fica na tela.
      setResult(null);
      setError(describeError(err));
    } finally {
      if (seq === requestSeqRef.current) setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      // Fora de contexto seguro (instalação por IP/HTTP) a área de transferência não existe.
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) throw new Error("clipboard");
      await navigator.clipboard.writeText(result.link);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyUnavailable"));
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    }
  };

  const handleSendInTicket = async () => {
    const text = message.trim();
    if (!onSendInTicket || !result || !text || sending) return;
    setSending(true);
    try {
      await onSendInTicket(text);
      toast.success(t("sent"));
      onOpenChange(false);
    } catch (err) {
      // Mesmo critério do handoff do atendimento: a recusa do canal (ex.: WABA/BSP
      // fora da janela de 24 h) vem em data.error/data.message e diz o motivo.
      const e = err as { data?: { error?: unknown; message?: unknown }; response?: { data?: { error?: unknown; message?: unknown } } } | null;
      const data = e?.data ?? e?.response?.data;
      const backendMsg = [data?.error, data?.message].find(
        (v): v is string => typeof v === "string" && v.trim() !== "" && v.length <= 300 && !v.trim().startsWith("{")
      );
      toast.error(backendMsg || t("errorGeneric"));
    } finally {
      setSending(false);
    }
  };

  const expiresLabel = useMemo(() => {
    if (!result?.expiresAt) return null;
    const date = new Date(result.expiresAt);
    if (Number.isNaN(date.getTime())) return null;
    try {
      return date.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return date.toLocaleString();
    }
  }, [result?.expiresAt, locale]);

  const selectedBot = bots.find((b) => String(b.id) === botId);
  // Sem nada no store, espera a 1ª resposta antes de dizer que não há bot.
  const showBotLoader = bots.length === 0 && fetchedWhatsapps === null && !botsFetchDone;
  const noBot = !showBotLoader && bots.length === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!sending) onOpenChange(o); }}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 shrink-0" /> {t("title")}
            </DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm font-medium min-w-0">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className={cn("truncate", isLiveMode && "live-blur-text")}>{contact.name}</span>
            </p>

            <Alert variant="info-soft" className="py-2 px-3">
              <Info className="h-4 w-4" />
              <AlertDescription className="pl-6 text-xs">{t("note")}</AlertDescription>
            </Alert>

            {showBotLoader ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {tCommon("loading")}
              </div>
            ) : noBot ? (
              <Alert variant="warning-soft" className="py-2 px-3">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription className="pl-6 text-xs">{t("noBot")}</AlertDescription>
              </Alert>
            ) : bots.length > 1 ? (
              <div className="space-y-2">
                <Label>{t("selectBot")}</Label>
                <Select value={botId} onValueChange={setBotId} disabled={generating || sending}>
                  <SelectTrigger><SelectValue placeholder={t("selectBot")} /></SelectTrigger>
                  <SelectContent>
                    {bots.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : selectedBot ? (
              <div className="space-y-1">
                <Label>{t("selectBot")}</Label>
                <p className="text-sm text-muted-foreground truncate">{selectedBot.name}</p>
              </div>
            ) : null}

            {error && (
              <Alert variant="warning-soft" className="py-2 px-3">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription className="pl-6 text-xs">{error}</AlertDescription>
              </Alert>
            )}

            {!result ? (
              !noBot && !showBotLoader && (
                <Button className="w-full sm:w-auto" onClick={handleGenerate} disabled={!botId || generating}>
                  {generating
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("generating")}</>
                    : <><Send className="mr-2 h-4 w-4" /> {t("generate")}</>}
                </Button>
              )
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="telegram-invite-link">{t("linkLabel")}</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="telegram-invite-link"
                      ref={linkInputRef}
                      value={result.link}
                      readOnly
                      onFocus={(e) => e.currentTarget.select()}
                      className={cn("flex-1 font-mono text-xs", isLiveMode && "live-blur-text")}
                    />
                    <Button type="button" variant="outline" className="shrink-0" onClick={handleCopy}>
                      <Copy className="mr-2 h-4 w-4" /> {t("copy")}
                    </Button>
                  </div>
                  {expiresLabel && (
                    <p className="text-xs text-muted-foreground">{t("expiresAt", { date: expiresLabel })}</p>
                  )}
                </div>

                <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
                  <p className="flex items-center gap-2 text-center text-sm font-medium">
                    <QrCode className="h-4 w-4 shrink-0" /> {t("qrLabel")}
                  </p>
                  <div className={cn("rounded-md bg-white p-3", isLiveMode && "live-blur")} style={{ colorScheme: "light" }}>
                    <QRCodeSVG value={result.link} size={180} bgColor="#ffffff" fgColor="#000000" />
                  </div>
                </div>

                {mode === "ticket" ? (
                  <div className="space-y-2">
                    <Label htmlFor="telegram-invite-message">{t("messageLabel")}</Label>
                    <Textarea
                      id="telegram-invite-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      className="resize-none"
                      disabled={sending}
                    />
                  </div>
                ) : canStartConversation ? (
                  // Nota do "Enviar por outro canal": sem o botão, não há o que explicar.
                  <Alert variant="info-soft" className="py-2 px-3">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="pl-6 text-xs">{t("officialChannelNote")}</AlertDescription>
                  </Alert>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={handleGenerate}
                  disabled={!botId || generating || sending}
                >
                  {generating
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("generating")}</>
                    : <><RefreshCw className="mr-2 h-4 w-4" /> {t("regenerate")}</>}
                </Button>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              {tCommon("close")}
            </Button>
            {result && mode === "contacts" && canStartConversation && (
              <Button onClick={() => setOtherChannelOpen(true)} disabled={generating}>
                <Send className="mr-2 h-4 w-4" /> {t("sendOtherChannel")}
              </Button>
            )}
            {result && mode === "ticket" && onSendInTicket && (
              <Button onClick={handleSendInTicket} disabled={sending || generating || !message.trim()}>
                {sending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("sending")}</>
                  : <><Send className="mr-2 h-4 w-4" /> {t("sendInTicket")}</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {mode === "contacts" && (
        <NewConversationDialog
          open={otherChannelOpen}
          onOpenChange={setOtherChannelOpen}
          prefilledNumber={contact.number || null}
          prefilledContactName={contact.name}
          prefilledContactEmail={contact.email || null}
          prefilledMessage={result ? buildMessage(result.link) : null}
        />
      )}
    </>
  );
}
