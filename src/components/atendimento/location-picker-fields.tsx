"use client";

// Campos da localização (docs/PLANO_LOCALIZACAO_ENVIO_ENCAMINHAR.md §5.0, O4): locais salvos,
// "Colar link ou coordenadas", latitude/longitude, mapa de conferência e nome/endereço.
// Controlado e sem rede: o texto colado é lido em memória (lib/location-message.ts); o link
// curto do Google não traz a coordenada e só ganha a explicação (D9). Usado na janela de
// envio do atendimento, em Mensagens rápidas e no nó Localização do fluxo.

import {
  useEffect, useId, useMemo, useState,
  type ChangeEvent, type ClipboardEvent, type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import { ClipboardPaste, ExternalLink, Info, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OsmMapThumbnail } from "@/components/common/osm-map-thumbnail";
import type { FastReply } from "@/services/fast-reply";
import {
  LOCATION_ADDRESS_MAX,
  LOCATION_NAME_MAX,
  LOCATION_PASTE_MAX,
  buildGoogleMapsUrl,
  formatCoord,
  isValidLatLng,
  parseCoordInput,
  parsePastedLocation,
  parseQuickReplyLocationMessage,
  sanitizeLocationText,
  type ParsedLocation,
  type PastedLocation,
} from "@/lib/location-message";
import { cn } from "@/lib/utils";

/** Dica curta que abre no toque/clique (o Tooltip do Radix não abre no celular). */
export function LocationInfoHint({ text, className }: { text: string; className?: string }) {
  const tRegion = useTranslations("regionSettings");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={tRegion("moreInfo")}
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            className
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-3 text-xs leading-relaxed text-muted-foreground">
        {text}
      </PopoverContent>
    </Popover>
  );
}

/** Valores dos campos como digitados (a coordenada aceita vírgula decimal). */
export interface LocationPickerValue {
  lat: string;
  lng: string;
  name: string;
  address: string;
}

/** Ponto pronto para enviar: coordenadas válidas; nome/endereço só quando preenchidos. */
export interface LocationPoint {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

/** O que a lista de locais salvos lê de uma mensagem rápida (serve o FastReply e a cópia da tela de atendimento). */
export type SavedLocationReply = Pick<FastReply, "id" | "key" | "message"> & { messageType?: string | null };

export const EMPTY_LOCATION_VALUE: LocationPickerValue = Object.freeze({ lat: "", lng: "", name: "", address: "" });

// Política de uso do OpenStreetMap: os tiles só são pedidos depois de 400 ms sem mudança.
const MAP_DEBOUNCE_MS = 400;
const MAP_WIDTH = 280;
const MAP_HEIGHT = 140;
// Trecho que entra de uma vez num campo = colagem (o teclado do celular cola sem evento paste).
const BIG_INSERT = 6;

const INVALID_INPUT_CLASS =
  "border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20";

function coordText(raw: unknown): string {
  if (typeof raw === "number") return Number.isFinite(raw) ? formatCoord(raw) : "";
  return typeof raw === "string" ? raw.trim() : "";
}

function plainText(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

/** Campos a partir de um ponto (número vira texto por formatCoord; texto fica como veio). */
export function locationValueFrom(
  loc?: { lat?: number | string; lng?: number | string; name?: string; address?: string } | null,
): LocationPickerValue {
  if (!loc) return { ...EMPTY_LOCATION_VALUE };
  return {
    lat: coordText(loc.lat),
    lng: coordText(loc.lng),
    name: plainText(loc.name),
    address: plainText(loc.address),
  };
}

/** Ponto dos campos, ou null sem coordenada válida. Nome/endereço limpos e com teto; vazio fica de fora. */
export function locationValueToPoint(value: LocationPickerValue): LocationPoint | null {
  if (!value) return null;
  const lat = parseCoordInput(value.lat);
  const lng = parseCoordInput(value.lng);
  if (lat === null || lng === null || !isValidLatLng(lat, lng)) return null;
  const point: LocationPoint = { lat, lng };
  const name = sanitizeLocationText(value.name, LOCATION_NAME_MAX);
  if (name) point.name = name;
  const address = sanitizeLocationText(value.address, LOCATION_ADDRESS_MAX);
  if (address) point.address = address;
  return point;
}

// Digitação em andamento ("-", "-23.", "-23,") ainda não é erro.
const COORD_TYPING_RE = /^[-+\u2212]?(?:\d{1,3}[.,])?$/;

/** Preenchido e fora do formato ou da faixa (vazio não é erro: só ainda não foi preenchido). */
function isCoordFieldInvalid(raw: string, limit: number): boolean {
  const s = raw.trim();
  if (!s || COORD_TYPING_RE.test(s)) return false;
  const n = parseCoordInput(s);
  return n === null || Math.abs(n) > limit;
}

/** Colagem no meio de um texto: vale o campo inteiro; se não der, só o que foi colado. */
function readPastedText(merged: string, pasted: string): PastedLocation {
  const whole = parsePastedLocation(merged);
  if (whole.kind === "coords" || merged === pasted) return whole;
  const alone = parsePastedLocation(pasted);
  if (alone.kind === "coords") return alone;
  return whole.kind === "shortLink" || alone.kind === "shortLink" ? { kind: "shortLink" } : { kind: "none" };
}

function readClipboardText(e: ClipboardEvent<HTMLInputElement>): string {
  const data = e.clipboardData;
  if (!data) return "";
  return data.getData("text/plain") || data.getData("text") || "";
}

type PasteStatus = "idle" | "shortLink" | "none";

interface LocationPickerFieldsProps {
  value: LocationPickerValue;
  onChange: (next: LocationPickerValue) => void;
  /**
   * Nome e endereço (padrão true). Com false eles não aparecem, mas o onChange continua
   * levando os dois (o link colado e o local salvo os preenchem); quem desenha os seus decide.
   */
  showNameAddress?: boolean;
  /** Mensagens rápidas carregadas: só as do tipo Localização legíveis entram na lista. */
  savedLocations?: SavedLocationReply[];
  /** Sem a lista de locais salvos. */
  compact?: boolean;
  disabled?: boolean;
  /** Prefixo dos ids: `<prefixo>-paste`, `-lat`, `-lng`, `-name`, `-address`. */
  idPrefix?: string;
}

export function LocationPickerFields({
  value,
  onChange,
  showNameAddress = true,
  savedLocations,
  compact = false,
  disabled = false,
  idPrefix,
}: LocationPickerFieldsProps) {
  const tShare = useTranslations("locationShare");
  const tInput = useTranslations("messageInput");
  const tBubble = useTranslations("messageBubble");
  const tField = useTranslations("nodeForm.locationField");

  const autoId = useId();
  const base = idPrefix || `location-${autoId}`;
  const ids = {
    saved: `${base}-saved`,
    paste: `${base}-paste`,
    pasteStatus: `${base}-paste-status`,
    lat: `${base}-lat`,
    latError: `${base}-lat-error`,
    lng: `${base}-lng`,
    lngError: `${base}-lng-error`,
    pairError: `${base}-pair-error`,
    name: `${base}-name`,
    address: `${base}-address`,
  };

  // Valor recebido sempre como texto (nó do fluxo antigo pode trazer número).
  const current: LocationPickerValue = {
    lat: typeof value?.lat === "string" ? value.lat : coordText(value?.lat),
    lng: typeof value?.lng === "string" ? value.lng : coordText(value?.lng),
    name: plainText(value?.name),
    address: plainText(value?.address),
  };

  const [pasteText, setPasteText] = useState("");
  const [pasteStatus, setPasteStatus] = useState<PasteStatus>("idle");

  const latNum = parseCoordInput(current.lat);
  const lngNum = parseCoordInput(current.lng);
  const point = latNum !== null && lngNum !== null && isValidLatLng(latNum, lngNum) ? { lat: latNum, lng: lngNum } : null;
  const pointLat = point ? point.lat : null;
  const pointLng = point ? point.lng : null;

  const latInvalid = isCoordFieldInvalid(current.lat, 90);
  const lngInvalid = isCoordFieldInvalid(current.lng, 180);
  // Os dois são números na faixa e o par é recusado: só sobra o (0, 0), que é coordenada ausente.
  const pairInvalid = latNum !== null && lngNum !== null && !latInvalid && !lngInvalid && !point;

  // Mapa: só com coordenada válida e depois da espera; enquanto muda, o anterior fica esmaecido.
  const [mapPoint, setMapPoint] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (pointLat === null || pointLng === null) {
      setMapPoint(null);
      return;
    }
    const timer = setTimeout(() => setMapPoint({ lat: pointLat, lng: pointLng }), MAP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pointLat, pointLng]);
  const mapSettled = !!mapPoint && mapPoint.lat === pointLat && mapPoint.lng === pointLng;

  const saved = useMemo(() => {
    if (compact || !Array.isArray(savedLocations) || savedLocations.length === 0) return [];
    const out: { reactKey: string; key: string; loc: ParsedLocation }[] = [];
    savedLocations.forEach((item, index) => {
      if (!item || item.messageType !== "location") return;
      const loc = parseQuickReplyLocationMessage(item.message);
      if (!loc) return;
      out.push({ reactKey: `${item.id ?? "x"}-${index}`, key: typeof item.key === "string" ? item.key : "", loc });
    });
    return out;
  }, [savedLocations, compact]);

  // Coordenadas lidas de um link ou texto: nome e endereço só entram no campo vazio.
  const fillFrom = (loc: ParsedLocation) => {
    const name = loc.name || (loc.label ? sanitizeLocationText(loc.label, LOCATION_NAME_MAX) : "");
    onChange({
      lat: formatCoord(loc.lat),
      lng: formatCoord(loc.lng),
      name: current.name.trim() || !name ? current.name : name,
      address: current.address.trim() || !loc.address ? current.address : loc.address,
    });
    setPasteText("");
    setPasteStatus("idle");
  };

  // Local salvo: preenche os quatro campos.
  const fillFromSaved = (loc: ParsedLocation) => {
    onChange({
      lat: formatCoord(loc.lat),
      lng: formatCoord(loc.lng),
      name: loc.name ?? "",
      address: loc.address ?? "",
    });
    setPasteText("");
    setPasteStatus("idle");
  };

  const showShortLink = (text: string) => {
    setPasteText(text.trim().slice(0, LOCATION_PASTE_MAX));
    setPasteStatus("shortLink");
  };

  const applyPasteResult = (result: PastedLocation) => {
    if (result.kind === "coords") fillFrom(result.loc);
    else setPasteStatus(result.kind);
  };

  // ── Campo "Colar link ou coordenadas" ─────────────────────────────────
  const handlePasteFieldPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    const pasted = readClipboardText(e);
    if (!pasted.trim()) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const merged = `${el.value.slice(0, start)}${pasted}${el.value.slice(end)}`.slice(0, LOCATION_PASTE_MAX);
    const result = readPastedText(merged, pasted);
    if (result.kind === "coords") {
      fillFrom(result.loc);
      return;
    }
    // Fica no campo o que foi lido, com a explicação na linha.
    setPasteText(merged);
    setPasteStatus(result.kind);
  };

  const handlePasteFieldChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.slice(0, LOCATION_PASTE_MAX);
    const bigInsert = next.length - pasteText.length >= BIG_INSERT;
    setPasteText(next);
    setPasteStatus("idle");
    if (!bigInsert) return;
    // Colado pelo teclado do celular: lê na hora (texto incompleto só é avaliado no Enter/ao sair).
    const result = parsePastedLocation(next);
    if (result.kind === "coords") fillFrom(result.loc);
    else if (result.kind === "shortLink") setPasteStatus("shortLink");
  };

  const handlePasteFieldKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    // Enter lê o campo e nunca envia o formulário em volta (Mensagens rápidas).
    e.preventDefault();
    if (pasteText.trim()) applyPasteResult(parsePastedLocation(pasteText));
  };

  const handlePasteFieldBlur = () => {
    if (pasteText.trim()) applyPasteResult(parsePastedLocation(pasteText));
    else if (pasteStatus !== "idle") setPasteStatus("idle");
  };

  // ── Latitude / longitude ──────────────────────────────────────────────
  // Par "lat, lng" ou link num dos dois campos: divide nos dois; link curto vai para o
  // "Colar" com a explicação. Devolve true quando tratou (o texto cru não é gravado).
  const takeCoordFieldText = (field: "lat" | "lng", raw: string): boolean => {
    if (!raw.trim() || parseCoordInput(raw) !== null) return false;
    const result = parsePastedLocation(raw);
    if (result.kind === "coords") {
      fillFrom(result.loc);
      return true;
    }
    if (result.kind === "shortLink") {
      onChange({ ...current, [field]: "" });
      showShortLink(raw);
      return true;
    }
    return false;
  };

  const handleCoordPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    const pasted = readClipboardText(e);
    // Número solto é a colagem normal do campo.
    if (!pasted.trim() || parseCoordInput(pasted) !== null) return;
    const result = parsePastedLocation(pasted);
    if (result.kind === "coords") {
      e.preventDefault();
      fillFrom(result.loc);
    } else if (result.kind === "shortLink") {
      e.preventDefault();
      showShortLink(pasted);
    }
  };

  const handleCoordChange = (field: "lat" | "lng", e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (next.length - current[field].length >= BIG_INSERT && takeCoordFieldText(field, next)) return;
    onChange({ ...current, [field]: next });
  };

  const setText = (field: "name" | "address", next: string) => onChange({ ...current, [field]: next });

  const pasteMessage =
    pasteStatus === "shortLink" ? tShare("shortLinkHelp") : pasteStatus === "none" ? tShare("notRecognized") : "";

  return (
    <div className="space-y-3">
      {saved.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <p id={ids.saved} className="text-xs font-medium">{tShare("savedLocations")}</p>
            <LocationInfoHint text={tShare("savedLocationsHelp")} />
          </div>
          <ul aria-labelledby={ids.saved} className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto p-0.5">
            {saved.map((item) => {
              const label = item.loc.name || `${formatCoord(item.loc.lat)}, ${formatCoord(item.loc.lng)}`;
              return (
                <li key={item.reactKey} className="max-w-full">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => fillFromSaved(item.loc)}
                    title={[item.key, item.loc.name, item.loc.address].filter(Boolean).join(" - ")}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden="true" />
                    {item.key && <span className="max-w-[9rem] shrink-0 truncate font-medium">{item.key}</span>}
                    <span className="min-w-0 truncate text-muted-foreground">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label htmlFor={ids.paste} className="text-xs">{tShare("pasteLabel")}</Label>
          <LocationInfoHint text={tShare("pasteHelp")} />
        </div>
        <div className="relative">
          <ClipboardPaste
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={ids.paste}
            value={pasteText}
            maxLength={LOCATION_PASTE_MAX}
            disabled={disabled}
            onChange={handlePasteFieldChange}
            onPaste={handlePasteFieldPaste}
            onKeyDown={handlePasteFieldKeyDown}
            onBlur={handlePasteFieldBlur}
            placeholder={tShare("pastePlaceholder")}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby={pasteMessage ? ids.pasteStatus : undefined}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div aria-live="polite">
          {pasteMessage && (
            <p
              id={ids.pasteStatus}
              className={cn(
                "text-xs leading-snug",
                pasteStatus === "shortLink" ? "text-amber-700 dark:text-amber-400" : "text-destructive",
              )}
            >
              {pasteMessage}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={ids.lat} className="text-xs">{tField("latitude")}</Label>
            <Input
              id={ids.lat}
              value={current.lat}
              maxLength={LOCATION_PASTE_MAX}
              disabled={disabled}
              onChange={(e) => handleCoordChange("lat", e)}
              onPaste={handleCoordPaste}
              onBlur={() => takeCoordFieldText("lat", current.lat)}
              placeholder="-23.5505"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={latInvalid || pairInvalid || undefined}
              aria-describedby={latInvalid ? ids.latError : pairInvalid ? ids.pairError : undefined}
              className={cn("h-8 text-sm", (latInvalid || pairInvalid) && INVALID_INPUT_CLASS)}
            />
            {latInvalid && <p id={ids.latError} className="text-xs text-destructive">{tField("latitudeInvalid")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.lng} className="text-xs">{tField("longitude")}</Label>
            <Input
              id={ids.lng}
              value={current.lng}
              maxLength={LOCATION_PASTE_MAX}
              disabled={disabled}
              onChange={(e) => handleCoordChange("lng", e)}
              onPaste={handleCoordPaste}
              onBlur={() => takeCoordFieldText("lng", current.lng)}
              placeholder="-46.6333"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={lngInvalid || pairInvalid || undefined}
              aria-describedby={lngInvalid ? ids.lngError : pairInvalid ? ids.pairError : undefined}
              className={cn("h-8 text-sm", (lngInvalid || pairInvalid) && INVALID_INPUT_CLASS)}
            />
            {lngInvalid && <p id={ids.lngError} className="text-xs text-destructive">{tField("longitudeInvalid")}</p>}
          </div>
        </div>
        {pairInvalid && <p id={ids.pairError} className="text-xs text-destructive">{tInput("invalidLatLng")}</p>}
      </div>

      {point && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{tShare("preview")}</p>
          <div className="relative flex h-[140px] w-full max-w-[280px] items-center justify-center overflow-hidden rounded-md border bg-muted">
            {mapPoint ? (
              <div
                className={cn(
                  "absolute inset-0 flex items-center justify-center transition-opacity",
                  !mapSettled && "opacity-40",
                )}
              >
                <OsmMapThumbnail
                  lat={mapPoint.lat}
                  lng={mapPoint.lng}
                  alt={tBubble("locationAlt")}
                  attribution={tBubble("mapAttribution")}
                  width={MAP_WIDTH}
                  height={MAP_HEIGHT}
                />
              </div>
            ) : (
              <MapPin className="h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
            )}
          </div>
          <a
            href={buildGoogleMapsUrl(point.lat, point.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {tShare("openInGoogleMaps")}
          </a>
        </div>
      )}

      {showNameAddress && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={ids.name} className="text-xs">{tInput("locationNameOptional")}</Label>
            <Input
              id={ids.name}
              value={current.name}
              maxLength={LOCATION_NAME_MAX}
              disabled={disabled}
              onChange={(e) => setText("name", e.target.value)}
              placeholder={tInput("locationNamePlaceholder")}
              autoComplete="off"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.address} className="text-xs">{tInput("addressOptional")}</Label>
            <Input
              id={ids.address}
              value={current.address}
              maxLength={LOCATION_ADDRESS_MAX}
              disabled={disabled}
              onChange={(e) => setText("address", e.target.value)}
              placeholder={tInput("addressPlaceholder")}
              autoComplete="off"
              className="h-8 text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}
