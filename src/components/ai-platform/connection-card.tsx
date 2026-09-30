"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, Save, Volume2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getActiveLocale } from "@/lib/format";
import {
  testAiPlatform,
  updateAiPlatformSettings,
  type AiPlatformSettings,
  type AiPlatformSettingsUpdate,
  type AiPlatformTestResponse,
} from "@/services/ai-platform";

// ─── Helpers compartilhados pelas cinco abas de /ia-plataforma ───────────────
// Moram aqui (e não em lib/) porque a lista de arquivos deste módulo é fechada; as
// outras abas importam deste arquivo.

export interface AiPlatformCardProps {
  settings: AiPlatformSettings;
  // Recebe a resposta do PUT: traz a configuração inteira com `pricePreview` recalculado.
  onSaved: (next: AiPlatformSettings) => void;
}

// O interceptor rejeita com `error.response || error`: o catch recebe o RESPONSE.
export function aiPlatformErrorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
}

export function aiPlatformErrorCode(err: unknown): string {
  const e = err as
    | { data?: { error?: unknown }; response?: { data?: { error?: unknown } } }
    | null;
  const code = e?.data?.error ?? e?.response?.data?.error ?? "";
  return typeof code === "string" ? code : "";
}

export type AiPlatformSaveErrorKey =
  | "err_ERR_AI_PLATFORM_KEY_REQUIRED"
  | "err_ERR_AI_PLATFORM_INVALID_SETTINGS"
  | "err_generic";

export function aiPlatformSaveErrorKey(err: unknown): AiPlatformSaveErrorKey {
  const code = aiPlatformErrorCode(err);
  if (code === "ERR_AI_PLATFORM_KEY_REQUIRED") return "err_ERR_AI_PLATFORM_KEY_REQUIRED";
  if (code === "ERR_AI_PLATFORM_INVALID_SETTINGS") return "err_ERR_AI_PLATFORM_INVALID_SETTINGS";
  return "err_generic";
}

// Separador decimal do idioma ativo — só "," ou ".". Locale com outro símbolo (árabe)
// cai em ".", que o parser abaixo entende.
function decimalSeparator(): "," | "." {
  try {
    const part = new Intl.NumberFormat(getActiveLocale())
      .formatToParts(1.1)
      .find((p) => p.type === "decimal")?.value;
    return part === "," ? "," : ".";
  } catch {
    return ".";
  }
}

/**
 * Lê número digitado com vírgula OU ponto ("5,43", "5.43", "1.234,56", "1,234.56").
 * `money`: um único separador seguido de exatamente 3 dígitos é milhar ("1.000" = mil) —
 * dinheiro não tem 3 casas. Sem `money` (cotação, preço por 1M) "5.432" é decimal.
 * Devolve null quando não é número.
 */
export function parseDecimalInput(raw: string, opts?: { money?: boolean }): number | null {
  let s = String(raw ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (!/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    const thousands = dec === "," ? "." : ",";
    normalized = s.split(thousands).join("").replace(dec, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    if (parts.length > 2) {
      normalized = parts.join("");
    } else if (opts?.money && parts[1].length === 3 && parts[0] !== "" && parts[0] !== "0") {
      normalized = parts.join("");
    } else {
      normalized = parts.join(".");
    }
  }
  if (!/^\d*\.?\d*$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Número → texto de campo, sem zeros à direita, com o separador do idioma. */
export function numberToInput(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return "";
  const fixed = n.toFixed(maxDecimals);
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return trimmed.replace(".", decimalSeparator());
}

/** Centavos → texto de campo em reais (sempre 2 casas). */
export function centsToInput(cents: number): string {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  return (n / 100).toFixed(2).replace(".", decimalSeparator());
}

/** Campo em reais → centavos inteiros; null quando o texto não é número. */
export function inputToCents(raw: string): number | null {
  const n = parseDecimalInput(raw, { money: true });
  return n === null ? null : Math.round(n * 100);
}

export const INVALID_FIELD_CLASS =
  "border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20";

// ─── Aba Conexão ─────────────────────────────────────────────────────────────

interface ConnectionForm {
  enabled: boolean;
  baseUrl: string;
  fxRate: string;
  maxOutputTokens: string;
  negativeFloor: string;
}

type ConnectionField = "baseUrl" | "apiKey" | "fxRate" | "maxOutputTokens" | "negativeFloor";

function formFrom(settings: AiPlatformSettings): ConnectionForm {
  return {
    enabled: settings.enabled === true,
    baseUrl: settings.baseUrl ?? "",
    // 0 = cotação ainda não configurada → campo vazio
    fxRate: Number(settings.fxRateMicros) > 0 ? numberToInput(Number(settings.fxRateMicros) / 1e6, 4) : "",
    maxOutputTokens: String(settings.maxOutputTokens ?? ""),
    // Guardado como valor positivo: 500 = o saldo pode chegar a −R$ 5,00
    negativeFloor: centsToInput(Math.abs(Number(settings.negativeFloorCents) || 0)),
  };
}

// `requestFailed`: o pedido ao PRÓPRIO servidor falhou — não há motivo do serviço de IA.
type TestOutcome = AiPlatformTestResponse & { voiceRequested: boolean; requestFailed?: boolean };

// Motivo devolvido pelo teste → frase para quem configura. Código que a tela não conhece
// (servidor mais novo) cai na frase geral; o código segue ao lado para o suporte.
const TEST_ERROR_KEYS: Record<string, string> = {
  not_configured: "testErr_not_configured",
  no_default_model: "testErr_no_default_model",
  invalid_key: "testErr_invalid_key",
  no_gateway_credit: "testErr_no_gateway_credit",
  model_not_found: "testErr_model_not_found",
  bad_request: "testErr_bad_request",
  rate_limited: "testErr_rate_limited",
  timeout: "testErr_timeout",
  network: "testErr_network",
  redirect: "testErr_redirect",
  gateway_error: "testErr_gateway_error",
  internal: "testErr_internal",
};

// No teste de voz a conexão já passou: recusa de modelo é do MODELO DE VOZ (as frases do
// teste de conexão falam do modelo padrão). Saldo, chave, limite e rede valem igual.
const VOICE_ERROR_KEYS: Record<string, string> = {
  voice_not_supported: "testVoiceErr_voice_not_supported",
  empty_audio: "testVoiceErr_empty_audio",
  model_not_found: "testVoiceErr_model_rejected",
  bad_request: "testVoiceErr_model_rejected",
};
const VOICE_SHARED_CODES = ["invalid_key", "no_gateway_credit", "rate_limited", "timeout", "network", "redirect", "gateway_error"];

function testErrorKey(outcome: TestOutcome): string {
  if (outcome.requestFailed) return "testErr_internal";
  return (outcome.error && TEST_ERROR_KEYS[outcome.error]) || "testFail";
}

function voiceErrorKey(code: string | undefined): string {
  if (!code) return "testVoiceFail";
  if (VOICE_ERROR_KEYS[code]) return VOICE_ERROR_KEYS[code];
  if (VOICE_SHARED_CODES.includes(code)) return TEST_ERROR_KEYS[code];
  return "testVoiceFail";
}

export function ConnectionCard({ settings, onSaved }: AiPlatformCardProps) {
  const t = useTranslations("aiPlatformPage");

  const [form, setForm] = useState<ConnectionForm>(() => formFrom(settings));
  // Chave WRITE-ONLY: nunca vem do servidor e só é enviada quando digitada.
  const [apiKey, setApiKey] = useState("");
  const [invalid, setInvalid] = useState<Set<ConnectionField>>(new Set());
  const [keyRequired, setKeyRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"chat" | "voice" | null>(null);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);

  // O formulário nasce da configuração e só é reescrito pelo PRÓPRIO salvar: o salvar
  // das outras abas não mexe nestes campos, então edição pendente aqui sobrevive.
  const saved = useMemo(() => formFrom(settings), [settings]);
  const dirty = apiKey.trim() !== "" || JSON.stringify(saved) !== JSON.stringify(form);

  const setField = <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setInvalid((prev) => {
      if (!prev.has(key as ConnectionField)) return prev;
      const next = new Set(prev);
      next.delete(key as ConnectionField);
      return next;
    });
  };

  const save = async (): Promise<boolean> => {
    const errors = new Set<ConnectionField>();
    const payload: AiPlatformSettingsUpdate = { enabled: form.enabled };

    const url = form.baseUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) errors.add("baseUrl");
    payload.baseUrl = url || null;

    // Cotação em reais (vírgula ou ponto) ↔ fxRateMicros = R$ × 1e6. Campo vazio não
    // é enviado: mantém o que está salvo.
    if (form.fxRate.trim()) {
      const fx = parseDecimalInput(form.fxRate);
      if (fx === null || fx <= 0) errors.add("fxRate");
      else payload.fxRateMicros = Math.round(fx * 1e6);
    }

    const tokens = Number(form.maxOutputTokens.trim());
    if (!form.maxOutputTokens.trim() || !Number.isInteger(tokens) || tokens < 1) errors.add("maxOutputTokens");
    else payload.maxOutputTokens = tokens;

    const floor = inputToCents(form.negativeFloor);
    if (floor === null) errors.add("negativeFloor");
    else payload.negativeFloorCents = Math.abs(floor);

    const typedKey = apiKey.trim();
    if (typedKey) payload.apiKey = typedKey;

    setInvalid(errors);
    if (errors.size > 0) {
      toast.error(t("err_ERR_AI_PLATFORM_INVALID_SETTINGS"));
      return false;
    }

    setSaving(true);
    setKeyRequired(false);
    try {
      const { data } = await updateAiPlatformSettings(payload);
      onSaved(data);
      setForm(formFrom(data));
      setApiKey("");
      toast.success(t("saved"));
      return true;
    } catch (err: unknown) {
      if (aiPlatformErrorCode(err) === "ERR_AI_PLATFORM_KEY_REQUIRED") {
        // Trocou o endereço sem reenviar a chave
        setKeyRequired(true);
        setInvalid(new Set<ConnectionField>(["apiKey"]));
        toast.error(t("apiKeyRequiredOnHostChange"));
      } else {
        toast.error(t(aiPlatformSaveErrorKey(err)));
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  // O teste roda contra a configuração SALVA: com edição pendente, salva antes.
  const runTest = async (voice: boolean) => {
    if (testing || saving) return;
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setTesting(voice ? "voice" : "chat");
    setOutcome(null);
    try {
      const { data } = await testAiPlatform({ voice });
      setOutcome({ ...data, voiceRequested: voice });
    } catch {
      setOutcome({ ok: false, byok: false, model: null, latencyMs: 0, voiceRequested: voice, requestFailed: true });
    } finally {
      setTesting(null);
    }
  };

  const busy = saving || testing !== null;
  const canTest = settings.hasApiKey || apiKey.trim() !== "";
  const canTestVoice = canTest && !!settings.speechModelId;

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <Label htmlFor="ai-platform-enabled" className="text-sm font-semibold">{t("enabled")}</Label>
            <p className="mt-1 text-xs text-muted-foreground">{t("enabledNote")}</p>
          </div>
          <Switch
            id="ai-platform-enabled"
            checked={form.enabled}
            onCheckedChange={(v) => setField("enabled", v)}
            disabled={busy}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ai-platform-base-url">{t("baseUrl")}</Label>
            <Input
              id="ai-platform-base-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={form.baseUrl}
              onChange={(e) => setField("baseUrl", e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
              aria-invalid={invalid.has("baseUrl") || undefined}
              className={cn(invalid.has("baseUrl") && INVALID_FIELD_CLASS)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="ai-platform-api-key">{t("apiKey")}</Label>
              {settings.hasApiKey && (
                <Badge variant="success-soft" className="gap-1 font-normal">
                  <CheckCircle2 className="h-3 w-3" />
                  {t("apiKeyConfigured")}
                </Badge>
              )}
            </div>
            <Input
              id="ai-platform-api-key"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setKeyRequired(false);
                setInvalid((prev) => {
                  if (!prev.has("apiKey")) return prev;
                  const next = new Set(prev);
                  next.delete("apiKey");
                  return next;
                });
              }}
              placeholder={settings.hasApiKey ? t("apiKeyPlaceholder") : undefined}
              aria-invalid={invalid.has("apiKey") || undefined}
              className={cn(invalid.has("apiKey") && INVALID_FIELD_CLASS)}
              disabled={busy}
            />
            {keyRequired && (
              <p className="text-xs text-destructive">{t("apiKeyRequiredOnHostChange")}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-platform-fx">{t("fxRate")}</Label>
            <Input
              id="ai-platform-fx"
              inputMode="decimal"
              autoComplete="off"
              value={form.fxRate}
              onChange={(e) => setField("fxRate", e.target.value)}
              aria-invalid={invalid.has("fxRate") || undefined}
              className={cn(invalid.has("fxRate") && INVALID_FIELD_CLASS)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">{t("fxRateNote")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-platform-max-tokens">{t("maxOutputTokens")}</Label>
            <Input
              id="ai-platform-max-tokens"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.maxOutputTokens}
              onChange={(e) => setField("maxOutputTokens", e.target.value)}
              aria-invalid={invalid.has("maxOutputTokens") || undefined}
              className={cn(invalid.has("maxOutputTokens") && INVALID_FIELD_CLASS)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">{t("maxOutputTokensNote")}</p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ai-platform-floor">{t("negativeFloor")}</Label>
            <Input
              id="ai-platform-floor"
              inputMode="decimal"
              autoComplete="off"
              value={form.negativeFloor}
              onChange={(e) => setField("negativeFloor", e.target.value)}
              aria-invalid={invalid.has("negativeFloor") || undefined}
              className={cn("sm:max-w-xs", invalid.has("negativeFloor") && INVALID_FIELD_CLASS)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">{t("negativeFloorNote")}</p>
          </div>
        </div>

        {outcome && (
          <div className="space-y-2">
            {outcome.ok ? (
              <Alert variant="success-soft">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription className="break-words">
                  {t("testOk")}
                  {outcome.model && (
                    <span className="ms-1 font-mono text-xs text-muted-foreground">
                      {outcome.model}
                      {outcome.latencyMs > 0 ? ` · ${Math.round(outcome.latencyMs)} ms` : ""}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="break-words">
                  {t(testErrorKey(outcome))}
                  {outcome.error && (
                    <span className="ms-1 font-mono text-xs opacity-80">({outcome.error})</span>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {outcome.voiceRequested && outcome.ok && typeof outcome.voiceOk === "boolean" && (
              <Alert variant={outcome.voiceOk ? "success-soft" : "warning-soft"}>
                {outcome.voiceOk ? <Volume2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <AlertDescription className="break-words">
                  {outcome.voiceOk ? t("testVoiceOk") : t(voiceErrorKey(outcome.error))}
                  {!outcome.voiceOk && outcome.error && (
                    <span className="ms-1 font-mono text-xs opacity-80">({outcome.error})</span>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {outcome.byok && (
              <Alert variant="warning-soft">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t("byokWarning")}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={busy || !dirty} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("save")}
          </Button>
          <Button variant="outline" onClick={() => void runTest(false)} disabled={busy || !canTest} className="gap-1.5">
            {testing === "chat" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            {t("test")}
          </Button>
          {/* Sem modelo de voz escolhido (aba Modelos) não há o que testar */}
          <span title={!settings.speechModelId ? t("speechModel") : undefined}>
            <Button variant="outline" onClick={() => void runTest(true)} disabled={busy || !canTestVoice} className="gap-1.5">
              {testing === "voice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
              {t("testVoice")}
            </Button>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default ConnectionCard;
