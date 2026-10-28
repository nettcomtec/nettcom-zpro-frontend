"use client";

// Janela "Enviar localização" do atendimento (docs/PLANO_LOCALIZACAO_ENVIO_ENCAMINHAR.md §5.0,
// O4): os campos de LocationPickerFields, Enviar com trava (o clique duplo mandava duas) e
// "Salvar este local", que cria a mensagem rápida do tipo Localização só DEPOIS do envio.
// Quem abre faz o envio (onSubmit) e mostra o resultado dele; aqui só o aviso do salvar.

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createFastReply, type FastReply } from "@/services/fast-reply";
import { buildQuickReplyLocationMessage } from "@/lib/location-message";
import {
  EMPTY_LOCATION_VALUE,
  LocationInfoHint,
  LocationPickerFields,
  locationValueFrom,
  locationValueToPoint,
  type LocationPickerValue,
  type LocationPoint,
  type SavedLocationReply,
} from "./location-picker-fields";

// Atalho é varchar(255) no servidor (FastReplyControllerZPRO conta caracteres).
const SHORTCUT_MAX = 255;

/** Atalho como a tela de Mensagens rápidas exige: "/" na frente. */
function normalizeShortcut(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (!s) return "";
  return s.startsWith("/") ? s : `/${s}`;
}

/** Linha criada que o POST devolve; formato inesperado = sem linha (quem chama recarrega). */
function asCreatedReply(data: unknown): FastReply | undefined {
  if (!data || typeof data !== "object") return undefined;
  const row = data as Partial<FastReply>;
  return typeof row.id === "number" && typeof row.key === "string" ? (row as FastReply) : undefined;
}

interface SendLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Aplicado a cada abertura (ex.: mensagem rápida de localização escolhida no "/"). */
  initial?: Partial<LocationPickerValue> | null;
  savedLocations?: SavedLocationReply[];
  /** Mesmo acesso da tela de Mensagens rápidas. */
  canSave?: boolean;
  /** Pode criar mensagem rápida para toda a equipe. */
  canSavePublic?: boolean;
  /** Atalhos já usados (a comparação ignora maiúsculas e o "/" que faltar). */
  existingKeys?: string[];
  /** true = enviada (a janela fecha); false = fica aberta e quem chama mostra o erro. */
  onSubmit: (point: LocationPoint) => Promise<boolean>;
  /** Mensagem rápida criada pelo "Salvar este local" (sem a linha quando o servidor não a devolve). */
  onSaved?: (reply?: FastReply) => void;
}

export function SendLocationDialog({
  open,
  onOpenChange,
  title,
  initial,
  savedLocations,
  canSave = false,
  canSavePublic = false,
  existingKeys,
  onSubmit,
  onSaved,
}: SendLocationDialogProps) {
  const tShare = useTranslations("locationShare");
  const tInput = useTranslations("messageInput");
  const tQuick = useTranslations("mensagensRapidasPage");

  const baseId = useId();
  const pickerId = `${baseId}-loc`;
  const saveId = `${baseId}-save`;
  const shortcutId = `${baseId}-shortcut`;
  const shortcutErrorId = `${baseId}-shortcut-error`;
  const publicId = `${baseId}-public`;

  const [value, setValue] = useState<LocationPickerValue>(EMPTY_LOCATION_VALUE);
  const [session, setSession] = useState(0);
  const [prevOpen, setPrevOpen] = useState(false);
  const [saveChecked, setSaveChecked] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const shortcutRef = useRef<HTMLInputElement>(null);

  // Ao abrir: tudo zerado e o `initial` aplicado (ajuste no próprio render, sem mostrar o anterior).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setValue(locationValueFrom(initial));
      setSaveChecked(false);
      setShortcut("");
      setIsPublic(false);
      setShortcutError(null);
      setSession((s) => s + 1);
    }
  }

  const point = locationValueToPoint(value);
  const willSave = canSave && saveChecked;

  // Enviando, a janela não fecha (Esc, clique fora, X e Cancelar passam por aqui).
  const handleOpenChange = (next: boolean) => {
    if (!next && sendingRef.current) return;
    onOpenChange(next);
  };

  const checkShortcut = (): { key: string } | { error: string } => {
    const key = normalizeShortcut(shortcut);
    if (!key.replace(/^\/+/, "").trim()) return { error: tShare("shortcutRequired") };
    if (Array.from(key).length > SHORTCUT_MAX) return { error: tQuick("shortcutTooLong") };
    const lower = key.toLowerCase();
    const taken = (existingKeys ?? []).some((k) => normalizeShortcut(k).toLowerCase() === lower);
    return taken ? { error: tShare("shortcutExists") } : { key };
  };

  const handleSubmit = async () => {
    if (sendingRef.current) return;
    const target = locationValueToPoint(value);
    if (!target) return;

    // O atalho é conferido antes do envio: com erro, nada sai.
    let key = "";
    if (willSave) {
      const checked = checkShortcut();
      if ("error" in checked) {
        setShortcutError(checked.error);
        shortcutRef.current?.focus();
        return;
      }
      key = checked.key;
    }

    sendingRef.current = true;
    setSending(true);
    let ok = false;
    try {
      ok = await onSubmit(target);
    } catch {
      // Fora do contrato (quem chama trata o erro e devolve false): não fica sem aviso.
      ok = false;
      toast.error(tInput("errorSendingLocation"));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
    if (!ok) return;
    onOpenChange(false);
    // A localização já saiu: a mensagem rápida é gravada com a janela já fechada, para um
    // salvar demorado (o pedido espera até 5 min) não segurar a janela.
    if (key) void saveLocationReply(key, target, canSavePublic && isPublic);
  };

  const saveLocationReply = async (key: string, target: LocationPoint, publicReply: boolean) => {
    let created: FastReply | undefined;
    try {
      const res = await createFastReply({
        key,
        message: buildQuickReplyLocationMessage(target),
        isPublic: publicReply,
        messageType: "location",
      });
      created = asCreatedReply(res?.data);
    } catch {
      // A localização já saiu: só o salvar falhou.
      toast.error(tShare("saveFailed"));
      return;
    }
    toast.success(tShare("saved"));
    try {
      onSaved?.(created);
    } catch {
      // Atualizar a lista de quem chama nunca quebra o aviso.
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] max-w-md flex-col overflow-hidden p-4 sm:p-6"
        onOpenAutoFocus={(e) => {
          // Foco no "Colar link ou coordenadas" (o 1º focável seria a dica dos locais salvos).
          const field = document.getElementById(`${pickerId}-paste`);
          if (field) {
            e.preventDefault();
            field.focus({ preventScroll: true });
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
          <LocationPickerFields
            key={session}
            idPrefix={pickerId}
            value={value}
            onChange={setValue}
            savedLocations={savedLocations}
            disabled={sending}
          />

          {canSave && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={saveId}
                  checked={saveChecked}
                  disabled={sending}
                  onCheckedChange={(checked) => {
                    setSaveChecked(checked === true);
                    setShortcutError(null);
                    // Marcou: o próximo passo é digitar o atalho.
                    if (checked === true) requestAnimationFrame(() => shortcutRef.current?.focus());
                  }}
                />
                <Label htmlFor={saveId} className="cursor-pointer text-sm font-normal leading-snug">
                  {tShare("saveAsQuickReply")}
                </Label>
                <LocationInfoHint text={tShare("saveAsQuickReplyHelp")} />
              </div>

              {saveChecked && (
                <div className="space-y-3 sm:pl-6">
                  <div className="space-y-1.5">
                    <Label htmlFor={shortcutId} className="text-xs">{tShare("shortcut")}</Label>
                    <Input
                      ref={shortcutRef}
                      id={shortcutId}
                      value={shortcut}
                      maxLength={SHORTCUT_MAX}
                      disabled={sending}
                      onChange={(e) => {
                        setShortcut(e.target.value);
                        if (shortcutError) setShortcutError(null);
                      }}
                      placeholder={tShare("shortcutPlaceholder")}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-invalid={!!shortcutError || undefined}
                      aria-describedby={shortcutError ? shortcutErrorId : undefined}
                      className={
                        shortcutError
                          ? "h-8 text-sm border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
                          : "h-8 text-sm"
                      }
                    />
                    {shortcutError && (
                      <p id={shortcutErrorId} className="text-xs text-destructive">{shortcutError}</p>
                    )}
                  </div>

                  {canSavePublic && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-1">
                        <Label htmlFor={publicId} className="cursor-pointer text-xs font-normal leading-snug">
                          {tShare("forWholeTeam")}
                        </Label>
                        <LocationInfoHint text={tShare("forWholeTeamHelp")} />
                      </div>
                      <Switch id={publicId} checked={isPublic} disabled={sending} onCheckedChange={setIsPublic} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={sending}>
            {tInput("cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!point} loading={sending}>
            {sending ? tInput("sending") : tInput("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
