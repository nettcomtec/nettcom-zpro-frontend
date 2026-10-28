"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, Camera, Check, CheckCircle2, ChevronDown, Copy, HelpCircle, Info, KeyRound, Lightbulb,
  Loader2, LogIn, RefreshCw, ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import {
  MAX_GRANT_CUSTOM_PROFILES,
  MAX_GRANT_TEAMS,
  MAX_GRANT_USERS,
  MAX_TARGET_PLANS,
  MAX_TARGET_TENANTS,
  PANEL_APP_CATEGORIES,
  PANEL_APP_ERROR_CODES,
  PANEL_APP_ICONS,
  PANEL_APP_NAME_MAX,
  PANEL_APP_PLACEMENTS,
  PANEL_APP_PROFILES,
  PANEL_APP_URL_MAX,
  checkPanelAppTemplate,
  findTemplateVariables,
  isSafeLaunchedPanelAppUrl,
  isSafePanelAppUrl,
  panelAppTemplateWarnings,
  replaceTemplateVariables,
  samplePanelAppUrl,
  templateNeedsLaunch,
  type GlobalPanelAppInput,
  type GlobalPanelAppItem,
  type PanelAppEmbedCheck,
  type PanelAppInput,
  type PanelAppManageItem,
  type PanelAppOpenMode,
  type PanelAppPlacement,
  type PanelAppProfile,
  type PanelAppRef,
  type PanelAppScope,
  type PanelAppSigningKeyInfo,
  type PanelAppTemplateIssue,
  type PanelAppUrlVariableName,
} from "@/lib/panel-apps";
import {
  checkPanelAppEmbed,
  createGlobalPanelApp,
  createPanelApp,
  fetchPanelAppOptions,
  rotatePanelAppSigningKey,
  updateGlobalPanelApp,
  updatePanelApp,
  fetchAllPlansForTarget,
} from "@/services/panel-apps";
import { fetchAllTenants } from "@/services/superadmin";
import { usePanelAppsStore } from "@/stores/panel-apps-store";
import { PanelAppIconPicker } from "@/components/panel-apps/panel-app-icon-picker";
import { PanelAppMultiSelect } from "@/components/panel-apps/panel-app-multi-select";
import {
  PanelAppVariablePicker,
  panelAppVariableText,
} from "@/components/panel-apps/panel-app-variable-picker";

/**
 * Cadastro/edição de um aplicativo personalizado (docs/PLANO_APLICATIVOS_PERSONALIZADOS.md §5.5).
 * `scope="tenant"`: app da empresa (quem vê = perfis, perfis personalizados, usuários e
 * equipes; o admin sempre vê). `scope="global"`: app do superadmin (alvo = todas as
 * empresas, empresas e/ou planos, por OU; perfis base; "mostrar no meu menu").
 *
 * - Conferência de embed (D12): "Testar" e, ao salvar com endereço novo não testado,
 *   conferência automática com o resultado no corpo (`embedCheck`). NUNCA impede salvar.
 * - `http://` só no modo "nova aba" (D27): no modo "dentro do painel" a tela avisa e não salva.
 * - Empresa: os três `userIds`/`groupIds`/`customProfileIds` vão SEMPRE no corpo (a tela
 *   mostra os três; ausente no corpo = backend não mexe).
 *
 * Fase 2 (docs/PLANO_APLICATIVOS_PERSONALIZADOS_FASE2.md §5.9), SÓ com `launchSupported`
 * (eco do servidor visto na sessão); sem ele o diálogo é o da v1 e endereço NOVO com
 * variável conhecida não salva ("variáveis exigem o servidor atualizado"):
 * - "Onde aparece" (menu, contato, atendimento) antes da Categoria, que só aparece com o
 *   menu marcado; app global só no menu (D4). `placements` vai no corpo (empresa).
 * - Endereço com variáveis: seletor próprio (insere no cursor), regras a–d do servidor
 *   espelhadas (`checkPanelAppTemplate`, bloqueiam só quando o endereço muda — o servidor
 *   só confere nesse caso, Ag1-4/Ag2-11b) e avisos que não bloqueiam. "Testar" e a
 *   conferência ao salvar usam valores de EXEMPLO (Ag2-11a), nunca o modelo nem dado real.
 * - Ficha assinada (`{{token}}`): chave pública, "Gerar nova chave", chave ilegível e como
 *   a ferramenta confere (exemplos Node/PHP do contrato §5.6). Domínio novo numa app com
 *   chave pede confirmação ANTES de salvar (D15: a chave muda).
 */

// ── Ajudas compartilhadas com as páginas ───────────────────────────────────

/** Categoria canônica conhecida (valor fora da lista = "ferramentas"). */
export function panelAppCanonicalCategory(category: string | null | undefined): string {
  return category && (PANEL_APP_CATEGORIES as readonly string[]).includes(category) ? category : "ferramentas";
}

/** Chave (em `panelAppForm`) do rótulo do perfil base. */
export function panelAppProfileLabelKey(profile: string): string {
  switch (profile) {
    case "admin":
      return "profileAdmin";
    case "super":
      return "profileSuper";
    case "user":
      return "profileUser";
    default:
      return "profileCustomAll";
  }
}

const statusOf = (err: unknown): number | undefined =>
  (err as { status?: number } | null)?.status ?? (err as { response?: { status?: number } } | null)?.response?.status;

/** Código do erro: corpo do backend ou o `Error` montado pelo próprio serviço da tela. */
const errorCodeOf = (err: unknown): string => {
  const code = getBackendErrorCode(err);
  if (code) return code;
  return err instanceof Error && /^ERR_[A-Z0-9_]+$/.test(err.message) ? err.message : "";
};

/**
 * Chave (em `panelAppsPage`) da mensagem de erro de uma chamada das rotas de aplicativos.
 * `null` = já existe aviso global (402 recurso fora do plano, 403 sem permissão) — não
 * repetir. 404 sem código = backend sem as rotas (atualizar o servidor).
 */
export function panelAppErrorKey(err: unknown, fallback: string): string | null {
  const code = errorCodeOf(err);
  if (code === "ERR_FEATURE_NOT_IN_PLAN" || code === "ERR_NO_PERMISSION") return null;
  if ((PANEL_APP_ERROR_CODES as readonly string[]).includes(code)) return `errors.${code}`;
  if (statusOf(err) === 404 && !code) return "backendOutdated";
  return fallback;
}

/** Ícone "?" que abre a explicação ao clicar/tocar (funciona no celular, ao contrário do tooltip). */
export function PanelAppHint({ text, className }: { text: string; className?: string }) {
  const t = useTranslations("panelAppForm");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            className
          )}
          aria-label={t("moreInfo")}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-3 text-xs leading-relaxed text-muted-foreground"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

// ── Endereço ───────────────────────────────────────────────────────────────

type UrlIssue = "empty" | "invalid" | "tooLong" | "credentials" | "httpsRequired" | "sameOrigin";

const URL_ISSUE_KEYS: Record<UrlIssue, string> = {
  empty: "urlErrorEmpty",
  invalid: "urlErrorInvalid",
  tooLong: "urlErrorTooLong",
  credentials: "urlErrorCredentials",
  httpsRequired: "urlErrorHttps",
  sameOrigin: "urlErrorSameOrigin",
};

/**
 * Regras do endereço. `sample` (fase 2): as regras valem para o endereço com valores de
 * EXEMPLO no lugar das variáveis (a posição delas tem regras próprias, `checkPanelAppTemplate`);
 * endereço sem variável fica igual. Sem `sample`, exatamente as regras da v1.
 */
function getUrlIssue(raw: string, openMode: PanelAppOpenMode, opts?: { sample?: boolean }): UrlIssue | null {
  const url = raw.trim();
  if (!url) return "empty";
  if (url.length > PANEL_APP_URL_MAX) return "tooLong";
  if (/\s/.test(url)) return "invalid";
  const probe = opts?.sample ? samplePanelAppUrl(url) : url;
  let parsed: URL;
  try {
    parsed = new URL(probe);
  } catch {
    return "invalid";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "invalid";
  if (!parsed.hostname) return "invalid";
  if (parsed.username || parsed.password) return "credentials";
  if (parsed.protocol === "http:" && openMode !== "new_tab") return "httpsRequired";
  if (typeof window !== "undefined" && parsed.origin === window.location.origin) return "sameOrigin";
  // O exemplo pode passar um pouco do teto (valor maior que o nome da variável): o teto de
  // 2048 vale para o endereço digitado, já conferido acima.
  const safe = probe === url ? isSafePanelAppUrl(url, openMode) : isSafeLaunchedPanelAppUrl(probe, openMode);
  return safe ? null : "invalid";
}

/**
 * Sem esquema ("meusistema.com.br") → completa com https:// ao sair do campo. Texto que
 * começa por variável fica como está: `https://{{x}}…` seria variável no domínio.
 */
function withDefaultScheme(raw: string): string {
  const url = raw.trim();
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (/^(\{\{|%7b%7b)/i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

// ── Fase 2: lugares, variáveis e ficha assinada ────────────────────────────

const PLACEMENT_LABEL_KEYS: Record<PanelAppPlacement, string> = {
  menu: "placementMenu",
  contact: "placementContact",
  ticket: "placementTicket",
};

const PLACEMENT_DESC_KEYS: Record<PanelAppPlacement, string> = {
  menu: "placementMenuDesc",
  contact: "placementContactDesc",
  ticket: "placementTicketDesc",
};

/** Lugares gravados: só os conhecidos, na ordem da lista; vazio (app da v1) = só o menu. */
function normalizePlacements(raw: unknown): PanelAppPlacement[] {
  const input = Array.isArray(raw) ? raw : [];
  const list = PANEL_APP_PLACEMENTS.filter((p) => input.includes(p));
  return list.length > 0 ? list : ["menu"];
}

/**
 * Endereço com as variáveis conhecidas sempre como `{{nome}}`: o servidor grava a forma
 * `%7B%7Bnome%7D%7D` no caminho (href do `new URL`) e as duas formas são a mesma variável.
 */
const canonicalTemplate = (raw: string | null | undefined): string =>
  replaceTemplateVariables(String(raw ?? "").trim(), (name) => panelAppVariableText(name));

/** Origem do endereço com valores de exemplo no lugar das variáveis (null = não abre). */
function templateOriginOf(raw: string | null | undefined): string | null {
  try {
    const origin = new URL(samplePanelAppUrl(String(raw ?? ""))).origin;
    return origin && origin !== "null" ? origin : null;
  } catch {
    return null;
  }
}

/** Parte pública da chave vinda do servidor, com o formato conferido (a privada nunca vem). */
function readKeyInfo(raw: unknown): PanelAppSigningKeyInfo | null {
  const v = raw as Partial<PanelAppSigningKeyInfo> | null | undefined;
  if (!v || typeof v !== "object") return null;
  if (typeof v.publicKeyBase64 !== "string" || !v.publicKeyBase64) return null;
  return {
    keyId: typeof v.keyId === "string" ? v.keyId : "",
    publicKeyBase64: v.publicKeyBase64,
    publicKeyPem: typeof v.publicKeyPem === "string" ? v.publicKeyPem : "",
    createdAt: typeof v.createdAt === "string" ? v.createdAt : null,
    ...(typeof v.origin === "string" && v.origin ? { origin: v.origin } : {}),
  };
}

function formatKeyDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return formatDateTime(date, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return null;
  }
}

/** `typ` da ficha (espelho de `PANEL_APP_TOKEN_TYPE` em PanelAppSigningKeyServiceZPRO, §5.6). */
const PANEL_APP_TOKEN_TYPE = "app-launch";
const EXAMPLE_ORIGIN_PLACEHOLDER = "https://...";
const EXAMPLE_PEM_PLACEHOLDER = "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----";

/**
 * Exemplo Node (contrato §5.6): assinatura Ed25519 sobre os bytes ASCII da 1ª parte, depois
 * `typ`, `aud`, `iss`, `exp` (tolerância de 60 s) e `iat` ≤ agora + 60. `base64url` no
 * `Buffer` exige Node 14.18 ou mais novo. Código nunca traduzido.
 */
function buildNodeExample(pem: string, appOrigin: string, panelOrigin: string): string {
  return [
    'const crypto = require("crypto");',
    "",
    "const PUBLIC_KEY_PEM = `" + (pem.trim() || EXAMPLE_PEM_PLACEHOLDER) + "`;",
    `const APP_ORIGIN = ${JSON.stringify(appOrigin || EXAMPLE_ORIGIN_PLACEHOLDER)};`,
    `const PANEL_ORIGINS = [${JSON.stringify(panelOrigin || EXAMPLE_ORIGIN_PLACEHOLDER)}];`,
    "",
    "function verifyPanelToken(token) {",
    "  try {",
    '    const parts = String(token || "").split(".");',
    "    if (parts.length !== 2) return null;",
    "    const [data, signature] = parts;",
    "    const valid = crypto.verify(",
    "      null,",
    '      Buffer.from(data, "ascii"),',
    "      PUBLIC_KEY_PEM,",
    '      Buffer.from(signature, "base64url")',
    "    );",
    "    if (!valid) return null;",
    '    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));',
    "    const now = Math.floor(Date.now() / 1000);",
    `    if (payload.typ !== ${JSON.stringify(PANEL_APP_TOKEN_TYPE)}) return null;`,
    "    if (payload.aud !== APP_ORIGIN) return null;",
    "    if (!PANEL_ORIGINS.includes(payload.iss)) return null;",
    '    if (typeof payload.exp !== "number" || payload.exp + 60 < now) return null;',
    '    if (typeof payload.iat !== "number" || payload.iat > now + 60) return null;',
    "    return payload;",
    "  } catch (err) {",
    "    return null;",
    "  }",
    "}",
    "",
    "module.exports = { verifyPanelToken };",
    "",
  ].join("\n");
}

/**
 * Exemplo PHP (sodium, nativo desde o 7.2): `sodium_base642bin(…, URLSAFE_NO_PADDING)` (o
 * `base64_decode` sem trocar `-`/`_` falha na maioria das fichas — Ag2-14) e a ordem
 * assinatura, mensagem (1ª parte em ASCII), chave pública de 32 bytes.
 */
function buildPhpExample(publicKeyBase64: string, appOrigin: string, panelOrigin: string): string {
  const q = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  return [
    "<?php",
    "",
    `const PUBLIC_KEY_BASE64 = ${q(publicKeyBase64 || "...")};`,
    `const APP_ORIGIN = ${q(appOrigin || EXAMPLE_ORIGIN_PLACEHOLDER)};`,
    `const PANEL_ORIGINS = [${q(panelOrigin || EXAMPLE_ORIGIN_PLACEHOLDER)}];`,
    "",
    // Sem tipo no parâmetro: `$_GET['t']` ausente (null) ou em lista (`t[]=x`) com `string`
    // lançaria TypeError (erro 500 na ferramenta) em vez de recusar. `mixed` só existe no PHP 8.
    "function verify_panel_token($token): ?array",
    "{",
    "    if (!is_string($token)) {",
    "        return null;",
    "    }",
    "    $parts = explode('.', $token);",
    "    if (count($parts) !== 2) {",
    "        return null;",
    "    }",
    "    [$data, $signature] = $parts;",
    "    try {",
    "        $signatureBin = sodium_base642bin($signature, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);",
    "        $json = sodium_base642bin($data, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);",
    "        $publicKey = base64_decode(PUBLIC_KEY_BASE64, true);",
    "        if ($publicKey === false || strlen($publicKey) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES) {",
    "            return null;",
    "        }",
    "        if (!sodium_crypto_sign_verify_detached($signatureBin, $data, $publicKey)) {",
    "            return null;",
    "        }",
    // Barra na frente: em arquivo com `namespace` o nome sem ela não acha a classe global.
    "    } catch (\\SodiumException $e) {",
    "        return null;",
    "    }",
    "    $payload = json_decode($json, true);",
    "    if (!is_array($payload)) {",
    "        return null;",
    "    }",
    "    $now = time();",
    `    if (($payload['typ'] ?? null) !== ${q(PANEL_APP_TOKEN_TYPE)}) {`,
    "        return null;",
    "    }",
    "    if (($payload['aud'] ?? null) !== APP_ORIGIN) {",
    "        return null;",
    "    }",
    "    if (!in_array($payload['iss'] ?? null, PANEL_ORIGINS, true)) {",
    "        return null;",
    "    }",
    "    if (!is_int($payload['exp'] ?? null) || $payload['exp'] + 60 < $now) {",
    "        return null;",
    "    }",
    "    if (!is_int($payload['iat'] ?? null) || $payload['iat'] > $now + 60) {",
    "        return null;",
    "    }",
    "    return $payload;",
    "}",
    "",
  ].join("\n");
}

/** Copia para a área de transferência; fora de contexto seguro usa o modo antigo. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // cai no modo antigo abaixo
  }
  try {
    // Dentro do diálogo (a trava de foco do diálogo tiraria a seleção de fora dele).
    const active = document.activeElement as HTMLElement | null;
    const host = active?.closest?.("[role='dialog'],[role='alertdialog']") ?? document.body;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    host.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    host.removeChild(area);
    active?.focus?.();
    return ok;
  } catch {
    return false;
  }
}

/** Copia e marca "copiado" por 2 s no item `id`. */
function useCopyFeedback(failMessage: string) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );
  const copy = async (id: string, text: string) => {
    const ok = await copyText(text);
    if (!ok) {
      toast.error(failMessage);
      return;
    }
    setCopiedId(id);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedId(null), 2000);
  };
  return { copiedId, copy };
}

function CopyButton({
  id,
  text,
  label,
  copiedId,
  onCopy,
}: {
  id: string;
  text: string;
  label: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const t = useTranslations("panelAppForm");
  const copied = copiedId === id;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 shrink-0 gap-1.5"
      onClick={() => onCopy(id, text)}
      disabled={!text}
      aria-label={copied ? t("copied") : t("copyLabel", { what: label })}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? t("copied") : t("copy")}
    </Button>
  );
}

const CODE_BLOCK_CLASS =
  "max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed";

function FieldRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <dt>
        <code className="font-mono font-medium">{name}</code>
      </dt>
      <dd className="min-w-0 break-words text-muted-foreground">{children}</dd>
    </>
  );
}

interface SigningKeySectionProps {
  scope: PanelAppScope;
  keyInfo: PanelAppSigningKeyInfo | null;
  unreadable: boolean;
  /** Edição de app cujo endereço GRAVADO já usa a ficha e ainda sem chave (ex.: empresa migrada). */
  canGenerateMissing: boolean;
  /** Origem do endereço da app (`aud`); null = endereço ainda incompleto. */
  appOrigin: string | null;
  /** Origem do painel aberto agora (`iss`). */
  panelOrigin: string;
  busy: boolean;
  rotating: boolean;
  onRotate: () => void;
}

/** Bloco da chave da ficha assinada e de como a ferramenta confere (D5, §5.6). */
function PanelAppSigningKeySection({
  scope,
  keyInfo,
  unreadable,
  canGenerateMissing,
  appOrigin,
  panelOrigin,
  busy,
  rotating,
  onRotate,
}: SigningKeySectionProps) {
  const t = useTranslations("panelAppForm");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [example, setExample] = useState<"node" | "php">("node");
  const { copiedId, copy } = useCopyFeedback(t("copyFailed"));

  const pem = (keyInfo?.publicKeyPem || "").trim();
  const base64 = keyInfo?.publicKeyBase64 || "";
  const createdAtText = formatKeyDate(keyInfo?.createdAt);
  const nodeCode = useMemo(() => buildNodeExample(pem, appOrigin || "", panelOrigin), [pem, appOrigin, panelOrigin]);
  const phpCode = useMemo(() => buildPhpExample(base64, appOrigin || "", panelOrigin), [base64, appOrigin, panelOrigin]);
  const exampleCode = example === "php" ? phpCode : nodeCode;
  const placementList: readonly string[] = scope === "global" ? ["menu"] : PANEL_APP_PLACEMENTS;
  const placementValues = placementList.map((p) => `"${p}"`).join(", ");
  const tokenText = panelAppVariableText("token");

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-start gap-2">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold">{t("keyTitle")}</p>
            <PanelAppHint text={t("keyHint")} />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("tipTokenValidity")} {t("tipDomainChange")}
          </p>
        </div>
      </div>

      {unreadable && (
        <div
          className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs sm:flex-row sm:items-center"
          role="status"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
            <span>{t("keyUnreadable")}</span>
          </div>
          {/* Sem a parte pública não há o bloco da chave (com o botão): gera daqui. */}
          {!keyInfo && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1.5"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
            >
              {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {rotating ? t("keyRotating") : t("keyRotate")}
            </Button>
          )}
        </div>
      )}

      {unreadable && !keyInfo ? null : keyInfo ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{t("keyPem")}</span>
              <CopyButton id="pem" text={pem} label={t("keyPem")} copiedId={copiedId} onCopy={copy} />
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
              {pem}
            </pre>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{t("keyBase64")}</span>
              <CopyButton id="base64" text={base64} label={t("keyBase64")} copiedId={copiedId} onCopy={copy} />
            </div>
            <code className="block break-all rounded-md border bg-muted/40 p-2 font-mono text-[11px]">{base64}</code>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 break-words text-[11px] text-muted-foreground">
              {keyInfo.keyId && (
                <>
                  {t("keyId", { field: "kid" })}: <code className="font-mono">{keyInfo.keyId}</code>
                </>
              )}
              {keyInfo.keyId && createdAtText ? " · " : null}
              {createdAtText ? t("keyCreatedAt", { date: createdAtText }) : null}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 self-start sm:self-auto"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
            >
              {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {rotating ? t("keyRotating") : t("keyRotate")}
            </Button>
          </div>
        </div>
      ) : canGenerateMissing ? (
        <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
            <span>{t("keyMissing")}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5"
            onClick={onRotate}
            disabled={busy}
          >
            {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            {rotating ? t("keyRotating") : t("keyGenerate")}
          </Button>
        </div>
      ) : (
        <p className="flex items-start gap-1.5 rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{t("keyPendingNew")}</span>
        </p>
      )}

      <Collapsible open={verifyOpen} onOpenChange={setVerifyOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span>{t("verifyTitle")}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-4 text-xs leading-relaxed">
            <p className="text-muted-foreground">{t("verifyIntro")}</p>

            <ol className="list-decimal space-y-1.5 pl-4">
              <li>{t("verifyStep1", { variable: tokenText })}</li>
              <li>{t("verifyStep2")}</li>
              <li>{t("verifyStep3")}</li>
            </ol>

            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-md border bg-muted/20 p-2.5">
              <FieldRow name="typ">{t("verifyCheckTyp", { value: PANEL_APP_TOKEN_TYPE })}</FieldRow>
              <FieldRow name="aud">{t("verifyCheckAud", { value: appOrigin || EXAMPLE_ORIGIN_PLACEHOLDER })}</FieldRow>
              <FieldRow name="iss">{t("verifyCheckIss", { value: panelOrigin || EXAMPLE_ORIGIN_PLACEHOLDER })}</FieldRow>
              <FieldRow name="exp">{t("verifyCheckExp")}</FieldRow>
              <FieldRow name="iat">{t("verifyCheckIat")}</FieldRow>
              <FieldRow name="jti">{t("verifyCheckJti")}</FieldRow>
            </dl>

            <div className="space-y-1.5">
              <p className="font-semibold">{t("verifyFieldsTitle")}</p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-md border bg-muted/20 p-2.5">
                <FieldRow name="user">{t("verifyFieldUser")}</FieldRow>
                <FieldRow name="tenant">{t("verifyFieldTenant")}</FieldRow>
                {scope === "tenant" && <FieldRow name="contact">{t("verifyFieldContact", { masked: "masked" })}</FieldRow>}
                {scope === "tenant" && <FieldRow name="ticket">{t("verifyFieldTicket")}</FieldRow>}
                <FieldRow name="placement">{t("verifyFieldPlacement", { values: placementValues })}</FieldRow>
                {scope === "tenant" && <FieldRow name="masked">{t("verifyFieldMasked")}</FieldRow>}
              </dl>
              {/* Nome e e-mail são editáveis por quem administra o painel: identidade é pelo id. */}
              <p className="text-muted-foreground">
                {t("verifyIdentityTip", { userId: "user.id", tenantId: "tenant.id", iss: "iss" })}
              </p>
            </div>

            <div className="space-y-2">
              <Tabs value={example} onValueChange={(v) => setExample(v === "php" ? "php" : "node")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <TabsList className="h-8">
                    <TabsTrigger value="node" className="px-2.5 text-xs">
                      {t("verifyTabNode")}
                    </TabsTrigger>
                    <TabsTrigger value="php" className="px-2.5 text-xs">
                      {t("verifyTabPhp")}
                    </TabsTrigger>
                  </TabsList>
                  <CopyButton
                    id={`example-${example}`}
                    text={exampleCode}
                    label={example === "php" ? t("verifyTabPhp") : t("verifyTabNode")}
                    copiedId={copiedId}
                    onCopy={copy}
                  />
                </div>
                <TabsContent value="node" className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("verifyExampleNode")}</p>
                  <pre className={CODE_BLOCK_CLASS}>
                    <code>{nodeCode}</code>
                  </pre>
                </TabsContent>
                <TabsContent value="php" className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t("verifyExamplePhp")}</p>
                  <pre className={CODE_BLOCK_CLASS}>
                    <code>{phpCode}</code>
                  </pre>
                </TabsContent>
              </Tabs>
              <p className="text-[11px] text-muted-foreground">{t("verifyExampleNote")}</p>
            </div>

            <div className="space-y-1.5">
              <p className="font-semibold">{t("sessionTitle")}</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li className="flex gap-2">
                  <span className="mt-px shrink-0 text-primary">•</span>
                  <span>{t("sessionTipFragment", { example: `#t=${tokenText}` })}</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-px shrink-0 text-primary">•</span>
                  <span>
                    {t("sessionTipStorage", {
                      storage: "sessionStorage",
                      cookie: "SameSite=None; Secure; Partitioned",
                    })}
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-px shrink-0 text-primary">•</span>
                  <span>{t("sessionTipClean", { fn: "history.replaceState" })}</span>
                </li>
                {scope === "tenant" && (
                  <li className="flex gap-2">
                    <span className="mt-px shrink-0 text-primary">•</span>
                    <span>{t("sessionTipMasked", { masked: "masked" })}</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("keyRotateConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("keyRotateConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onRotate()}>{t("keyRotate")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Formulário ─────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  url: string;
  icon: string;
  category: string;
  openMode: PanelAppOpenMode;
  isActive: boolean;
  profiles: PanelAppProfile[];
  userIds: number[];
  groupIds: number[];
  customProfileIds: number[];
  allTenants: boolean;
  targetTenantIds: number[];
  targetPlanIds: number[];
  showToSuperadmin: boolean;
  /** Fase 2: onde a app aparece (global = sempre só o menu, D4). */
  placements: PanelAppPlacement[];
}

type AnyPanelAppItem = PanelAppManageItem | GlobalPanelAppItem;

const isTenantItem = (item: AnyPanelAppItem): item is PanelAppManageItem =>
  Array.isArray((item as PanelAppManageItem).users);

const isGlobalItem = (item: AnyPanelAppItem): item is GlobalPanelAppItem =>
  typeof (item as GlobalPanelAppItem).allTenants === "boolean";

function normalizeProfiles(raw: unknown, scope: "tenant" | "global"): PanelAppProfile[] {
  const input = Array.isArray(raw) ? raw : [];
  const list = PANEL_APP_PROFILES.filter((p) => input.includes(p));
  if (scope === "tenant" && !list.includes("admin")) return ["admin", ...list];
  return list;
}

const refIds = (refs: PanelAppRef[] | undefined): number[] =>
  Array.isArray(refs) ? refs.map((r) => Number(r.id)).filter((id) => Number.isInteger(id) && id > 0) : [];

const numIds = (ids: unknown): number[] =>
  Array.isArray(ids) ? ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0) : [];

/**
 * `launch` (fase 2): o endereço gravado aparece com as variáveis como `{{nome}}` (o servidor
 * grava `%7B%7Bnome%7D%7D` no caminho) e os lugares vêm da app. Sem ele, como na v1.
 */
function initialForm(scope: "tenant" | "global", item: AnyPanelAppItem | null | undefined, launch: boolean): FormState {
  const empty: FormState = {
    name: "",
    url: "",
    icon: "app-window",
    category: "ferramentas",
    openMode: "embed",
    isActive: true,
    profiles: ["admin"],
    userIds: [],
    groupIds: [],
    customProfileIds: [],
    allTenants: false,
    targetTenantIds: [],
    targetPlanIds: [],
    showToSuperadmin: false,
    placements: ["menu"],
  };
  if (!item) return empty;
  const form: FormState = {
    ...empty,
    name: item.name || "",
    url: launch ? canonicalTemplate(item.url || "") : item.url || "",
    icon: PANEL_APP_ICONS[item.icon] ? item.icon : "app-window",
    category: panelAppCanonicalCategory(item.category),
    openMode: item.openMode === "new_tab" ? "new_tab" : "embed",
    isActive: item.isActive !== false,
    profiles: normalizeProfiles(item.profiles, scope),
    placements: scope === "global" ? ["menu"] : normalizePlacements(item.placements),
  };
  if (scope === "tenant" && isTenantItem(item)) {
    form.userIds = refIds(item.users);
    form.groupIds = refIds(item.teams);
    form.customProfileIds = refIds(item.customProfiles);
  }
  if (scope === "global" && isGlobalItem(item)) {
    form.allTenants = item.allTenants === true;
    form.targetTenantIds = numIds(item.targetTenantIds);
    form.targetPlanIds = numIds(item.targetPlanIds);
    form.showToSuperadmin = item.showToSuperadmin === true;
  }
  return form;
}

/** Opções do servidor + vínculos atuais que não vieram na lista (nunca some um chip). */
function mergeRefs(options: PanelAppRef[], extra: PanelAppRef[] | undefined): PanelAppRef[] {
  const map = new Map<number, PanelAppRef>();
  for (const o of options) map.set(o.id, o);
  for (const e of extra || []) if (!map.has(e.id)) map.set(e.id, e);
  return Array.from(map.values());
}

function toRefs(list: unknown): PanelAppRef[] {
  if (!Array.isArray(list)) return [];
  const out: PanelAppRef[] = [];
  for (const row of list) {
    const id = Number((row as { id?: unknown })?.id);
    const name = (row as { name?: unknown })?.name;
    if (Number.isInteger(id) && id > 0) out.push({ id, name: typeof name === "string" && name ? name : `#${id}` });
  }
  return out;
}

/** Resultado de uma gravação, para a página (aviso de chave criada ou trocada). */
export interface PanelAppSavedResult {
  /** App como o servidor devolveu (null = resposta fora do formato). */
  app: PanelAppManageItem | GlobalPanelAppItem | null;
  /** A chave da ficha nasceu (`created`) ou foi trocada (`rotated`, D15) nesta gravação. */
  keyEvent: "created" | "rotated" | null;
}

export interface PanelAppFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: "tenant" | "global";
  /** App em edição; ausente = nova. */
  item?: PanelAppManageItem | GlobalPanelAppItem | null;
  /** Chamado depois de salvar com sucesso (a página recarrega a lista e o menu). */
  onSaved: (result?: PanelAppSavedResult) => void | Promise<void>;
  /** Chave da ficha gerada/trocada pelo botão do cadastro (a página recarrega a lista). */
  onKeyChanged?: () => void | Promise<void>;
  /** Global: empresas já carregadas pela página (evita buscar de novo). */
  tenantOptions?: PanelAppRef[];
  /** Global: planos já carregados pela página. */
  planOptions?: PanelAppRef[];
}

interface TestState {
  url: string;
  result: PanelAppEmbedCheck;
}

export function PanelAppFormDialog({
  open,
  onOpenChange,
  scope,
  item,
  onSaved,
  onKeyChanged,
  tenantOptions,
  planOptions,
}: PanelAppFormDialogProps) {
  const t = useTranslations("panelAppForm");
  const tp = useTranslations("panelAppsPage");
  const isEdit = !!item;
  // Fase 2 ligada no servidor (eco visto nesta sessão). Sem ele: o diálogo da v1.
  const launchSupported = usePanelAppsStore((s) => s.launchSupported);

  const [form, setForm] = useState<FormState>(() =>
    initialForm(scope, item, usePanelAppsStore.getState().launchSupported)
  );
  const [submitted, setSubmitted] = useState(false);
  const [urlTouched, setUrlTouched] = useState(false);
  const [test, setTest] = useState<TestState | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingOnSave, setCheckingOnSave] = useState(false);

  // Empresa: opções dos seletores (GET /panel-apps/options)
  const [optUsers, setOptUsers] = useState<PanelAppRef[]>([]);
  const [optTeams, setOptTeams] = useState<PanelAppRef[]>([]);
  const [optCustomProfiles, setOptCustomProfiles] = useState<PanelAppRef[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsFailed, setOptionsFailed] = useState(false);

  // Global: empresas e planos
  const [loadedTenants, setLoadedTenants] = useState<PanelAppRef[] | null>(null);
  const [loadedPlans, setLoadedPlans] = useState<PanelAppRef[] | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  // Fase 2: chave da ficha (parte pública) e confirmação da troca de domínio (D15)
  const [keyInfo, setKeyInfo] = useState<PanelAppSigningKeyInfo | null>(null);
  const [keyUnreadable, setKeyUnreadable] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [domainConfirm, setDomainConfirm] = useState<{ from: string; to: string } | null>(null);
  /** Lugares mexidos nesta abertura: só então (ou em app nova / item com lugares) vão no corpo. */
  const [placementsTouched, setPlacementsTouched] = useState(false);

  const openSeqRef = useRef(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const placementsFirstRef = useRef<HTMLButtonElement>(null);
  /**
   * Seleção do endereço contada a partir do FIM do texto: o "https://" que o onBlur põe no
   * começo (clicar no seletor tira o foco do campo) não desloca o ponto de inserção.
   */
  const urlSelRef = useRef<{ fromStart: number; fromEnd: number } | null>(null);

  // Reabre limpo a cada abertura (a página troca o `item` antes de abrir).
  useEffect(() => {
    if (!open) {
      openSeqRef.current += 1;
      return;
    }
    const seq = ++openSeqRef.current;
    setForm(initialForm(scope, item, usePanelAppsStore.getState().launchSupported));
    setSubmitted(false);
    setUrlTouched(false);
    setTest(null);
    setTesting(false);
    setSaving(false);
    setCheckingOnSave(false);
    setOptionsFailed(false);
    setKeyInfo(readKeyInfo(item?.signingKey));
    setKeyUnreadable(item?.signingKeyUnreadable === true);
    setRotating(false);
    setDomainConfirm(null);
    setPlacementsTouched(false);
    urlSelRef.current = null;

    if (scope === "tenant") {
      setOptionsLoading(true);
      fetchPanelAppOptions()
        .then((opts) => {
          if (seq !== openSeqRef.current) return;
          setOptUsers(toRefs(opts.users));
          setOptTeams(toRefs(opts.teams));
          setOptCustomProfiles(toRefs(opts.customProfiles));
        })
        .catch(() => {
          if (seq !== openSeqRef.current) return;
          // Os vínculos atuais seguem mostrados (vêm da própria app) e vão no corpo
          // como estão; só não dá para escolher novos.
          setOptionsFailed(true);
        })
        .finally(() => {
          if (seq === openSeqRef.current) setOptionsLoading(false);
        });
    } else {
      const needTenants = !tenantOptions;
      const needPlans = !planOptions;
      if (needTenants || needPlans) {
        setSourcesLoading(true);
        Promise.all([
          needTenants
            ? fetchAllTenants().then(({ data }) => toRefs(Array.isArray(data) ? data : data?.tenants)).catch(() => [])
            : Promise.resolve(null),
          needPlans
            ? fetchAllPlansForTarget().then((list) => toRefs(list)).catch(() => [])
            : Promise.resolve(null),
        ])
          .then(([tenants, plans]) => {
            if (seq !== openSeqRef.current) return;
            if (tenants) setLoadedTenants(tenants);
            if (plans) setLoadedPlans(plans);
          })
          .finally(() => {
            if (seq === openSeqRef.current) setSourcesLoading(false);
          });
      }
    }
    // Só a abertura reinicia o formulário; mudanças do `item` com o diálogo aberto não.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const trimmedUrl = form.url.trim();
  // Endereço mudou? As duas formas da variável contam como iguais. O servidor só confere as
  // regras das variáveis (e o 409 sem a fase) quando o endereço muda (Ag1-4/Ag2-11b).
  const urlChanged = !item || canonicalTemplate(trimmedUrl) !== canonicalTemplate(item.url);
  const hasVariables = templateNeedsLaunch(trimmedUrl);
  const urlVariables = useMemo(() => findTemplateVariables(trimmedUrl), [trimmedUrl]);
  const usesToken = launchSupported && urlVariables.includes("token");

  const urlIssue = getUrlIssue(form.url, form.openMode, { sample: launchSupported && urlChanged });
  const templateIssue: PanelAppTemplateIssue | null =
    launchSupported && hasVariables && urlIssue !== "empty" && urlIssue !== "tooLong"
      ? checkPanelAppTemplate(trimmedUrl, { scope })
      : null;
  // URL_INVALID da regra das variáveis = o endereço não abre nem sem elas (aviso de sempre).
  const templateRuleIssue = templateIssue && templateIssue !== "ERR_PANEL_APP_URL_INVALID" ? templateIssue : null;
  const templateBlocks = urlChanged && templateRuleIssue !== null;
  // Endereço salvo antes, sem mudança: o servidor não reconfere; avisa sem impedir salvar.
  const templateSavedIssue = !urlChanged ? templateRuleIssue : null;
  // Servidor sem a fase 2: endereço NOVO com variável seria gravado e aberto com o texto cru.
  const needsServerUpdate = !launchSupported && urlChanged && hasVariables;
  const urlBlocked = urlIssue !== null || templateBlocks || needsServerUpdate;

  const showUrlError = submitted || urlTouched;
  let urlErrorText: string | undefined;
  if (urlIssue === "empty") urlErrorText = submitted ? t(URL_ISSUE_KEYS.empty) : undefined;
  else if (showUrlError && templateBlocks && templateRuleIssue) urlErrorText = tp(`errors.${templateRuleIssue}`);
  else if (showUrlError && urlIssue) urlErrorText = t(URL_ISSUE_KEYS[urlIssue]);
  else if (showUrlError && needsServerUpdate) urlErrorText = tp("errors.ERR_PANEL_APP_LAUNCH_NOT_READY");

  const nameTrimmed = form.name.trim();
  const nameIssue = !nameTrimmed ? "nameErrorEmpty" : nameTrimmed.length > PANEL_APP_NAME_MAX ? "nameErrorTooLong" : null;
  // O teste só vale para endereço https válido (é o único que abre dentro do painel). Com
  // variável no domínio o exemplo não diz nada sobre o site de verdade.
  const canTest =
    getUrlIssue(form.url, "embed", { sample: launchSupported }) === null &&
    templateIssue !== "ERR_PANEL_APP_VARIABLE_IN_HOST";
  /** Endereço conferido no "Testar" e ao salvar: valores de exemplo no lugar das variáveis. */
  const probeOf = (url: string): string => (launchSupported ? samplePanelAppUrl(url) : url);

  // Fase 2: lugares
  const placementsIssue = launchSupported && scope === "tenant" && form.placements.length === 0;
  const showCategory = !launchSupported || scope === "global" || form.placements.includes("menu");
  const hasContextPlacement =
    launchSupported && scope === "tenant" && (form.placements.includes("contact") || form.placements.includes("ticket"));

  // Fase 2: avisos que não bloqueiam
  const warnings =
    launchSupported && hasVariables && !urlIssue && !templateBlocks
      ? panelAppTemplateWarnings(trimmedUrl, { placements: scope === "global" ? ["menu"] : form.placements })
      : null;
  const warningLines: string[] = [];
  if (warnings) {
    if (warnings.emptyFromMenu) warningLines.push(t("warnEmptyFromMenu"));
    if (warnings.emptyFromContact) warningLines.push(t("warnEmptyFromContact"));
    if (warnings.maybeEmptyInPath.length > 0) {
      warningLines.push(t("warnEmptyInPath", { names: warnings.maybeEmptyInPath.map(panelAppVariableText).join(", ") }));
    }
    if (warnings.httpWithVariables && templateIssue !== "ERR_PANEL_APP_TOKEN_HTTPS_REQUIRED") {
      warningLines.push(t("warnHttpVariables"));
    }
  }

  // Fase 2: ficha assinada
  const storedHasToken = !!item && findTemplateVariables(item.url || "").includes("token");
  const appOrigin = usesToken ? templateOriginOf(trimmedUrl) : null;
  const panelOrigin = typeof window !== "undefined" ? window.location.origin : "";
  // D15: o servidor troca a chave ao salvar quando o endereço tem `{{token}}` e a chave nasceu
  // em outra origem — a comparação é com a origem DA CHAVE (o endereço gravado pode ter mudado
  // com a fase desligada), e sem `{{token}}` a chave não muda (confirmação antes).
  const oldOrigin = keyInfo?.origin || (item ? templateOriginOf(item.url) : null);
  const newOrigin = templateOriginOf(trimmedUrl);
  const domainChanges =
    launchSupported &&
    !!item &&
    usesToken &&
    (keyInfo !== null || keyUnreadable) &&
    oldOrigin !== null &&
    newOrigin !== null &&
    oldOrigin !== newOrigin;
  // Item da lista sem os lugares (lista carregada antes da fase ficar pronta): sem mexer no
  // controle, nada vai no corpo e o servidor mantém os gravados (o padrão ["menu"] da tela
  // regravaria por cima dos de verdade).
  const sendPlacements =
    launchSupported &&
    scope === "tenant" &&
    (!item || Array.isArray((item as PanelAppManageItem).placements) || placementsTouched);

  const tenantItem = item && isTenantItem(item) ? item : null;
  const userOptions = useMemo(() => mergeRefs(optUsers, tenantItem?.users), [optUsers, tenantItem]);
  const teamOptions = useMemo(() => mergeRefs(optTeams, tenantItem?.teams), [optTeams, tenantItem]);
  const customProfileOptions = useMemo(
    () => mergeRefs(optCustomProfiles, tenantItem?.customProfiles),
    [optCustomProfiles, tenantItem]
  );
  const tenantChoices = tenantOptions ?? loadedTenants ?? [];
  const planChoices = planOptions ?? loadedPlans ?? [];

  // Resultado mostrado: o teste desta abertura (se for do endereço atual) ou o gravado.
  const currentTest: TestState | null = test && test.url === trimmedUrl ? test : null;
  const storedCheck: PanelAppEmbedCheck | null =
    !currentTest && item && !urlChanged && item.embedCheck ? item.embedCheck : null;
  const shownCheck = currentTest?.result ?? storedCheck;

  const runTest = async () => {
    if (!canTest || testing) return;
    const seq = openSeqRef.current;
    const url = trimmedUrl;
    setTesting(true);
    try {
      const res = await checkPanelAppEmbed(probeOf(url));
      if (seq !== openSeqRef.current) return;
      setTest({ url, result: res.result });
    } finally {
      if (seq === openSeqRef.current) setTesting(false);
    }
  };

  const toggleProfile = (profile: PanelAppProfile, checked: boolean) => {
    if (scope === "tenant" && profile === "admin") return;
    setForm((prev) => {
      const next = checked
        ? PANEL_APP_PROFILES.filter((p) => p === profile || prev.profiles.includes(p))
        : prev.profiles.filter((p) => p !== profile);
      return { ...prev, profiles: next };
    });
  };

  const togglePlacement = (placement: PanelAppPlacement, checked: boolean) => {
    if (scope === "global") return;
    setPlacementsTouched(true);
    setForm((prev) => {
      const next = checked
        ? PANEL_APP_PLACEMENTS.filter((p) => p === placement || prev.placements.includes(p))
        : prev.placements.filter((p) => p !== placement);
      return { ...prev, placements: next };
    });
  };

  const saveUrlCursor = () => {
    const el = urlRef.current;
    if (!el) return;
    const len = el.value.length;
    const start = el.selectionStart ?? len;
    const end = el.selectionEnd ?? start;
    urlSelRef.current = { fromStart: len - start, fromEnd: len - end };
  };

  /** Insere `{{nome}}` onde está o cursor do endereço (ou no fim) e devolve o foco ao campo. */
  const insertUrlVariable = (name: PanelAppUrlVariableName) => {
    if (saving) return;
    const text = panelAppVariableText(name);
    const el = urlRef.current;
    const value = el ? el.value : form.url;
    const len = value.length;
    let start = len;
    let end = len;
    if (el && typeof document !== "undefined" && document.activeElement === el) {
      start = el.selectionStart ?? len;
      end = el.selectionEnd ?? start;
    } else if (urlSelRef.current) {
      start = Math.min(Math.max(len - urlSelRef.current.fromStart, 0), len);
      end = Math.min(Math.max(len - urlSelRef.current.fromEnd, start), len);
    }
    const next = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    set("url", next);
    setUrlTouched(true);
    urlSelRef.current = { fromStart: next.length - caret, fromEnd: next.length - caret };
    requestAnimationFrame(() => {
      const input = urlRef.current;
      if (!input) return;
      input.focus();
      try {
        input.setSelectionRange(caret, caret);
      } catch {
        // campo sem seleção: o texto já foi inserido
      }
    });
  };

  /** "Gerar chave" / "Gerar nova chave" (a anterior para de valer na hora). */
  const runRotate = async () => {
    if (!item || rotating || saving) return;
    const seq = openSeqRef.current;
    const hadKey = keyInfo !== null || keyUnreadable;
    setRotating(true);
    try {
      const info = await rotatePanelAppSigningKey(item.id, scope);
      if (seq !== openSeqRef.current) return;
      setKeyInfo(readKeyInfo(info));
      setKeyUnreadable(false);
      toast.success(hadKey ? t("keyRotated") : t("keyCreatedNow"));
      void onKeyChanged?.();
    } catch (err: unknown) {
      if (seq !== openSeqRef.current) return;
      if (errorCodeOf(err) === "ERR_PANEL_APP_LAUNCH_NOT_READY") usePanelAppsStore.getState().setLaunchUnsupported();
      const key = panelAppErrorKey(err, "errors.keyRotateFailed");
      if (key) toast.error(tp(key));
    } finally {
      if (seq === openSeqRef.current) setRotating(false);
    }
  };

  const handleSave = async (opts?: { domainConfirmed?: boolean }) => {
    if (saving || rotating) return;
    setSubmitted(true);
    if (nameIssue) {
      nameRef.current?.focus();
      return;
    }
    if (urlBlocked) {
      urlRef.current?.focus();
      return;
    }
    if (placementsIssue) {
      placementsFirstRef.current?.focus();
      return;
    }
    // D15: o aviso vem ANTES de enviar — salvando, a chave muda e a ferramenta precisa da nova.
    if (domainChanges && !opts?.domainConfirmed && oldOrigin && newOrigin) {
      setDomainConfirm({ from: oldOrigin, to: newOrigin });
      return;
    }
    const seq = openSeqRef.current;
    const url = trimmedUrl;
    const hadKey = keyInfo !== null || keyUnreadable;
    setSaving(true);
    try {
      // Conferência ao salvar (D12): endereço novo (ou passou a abrir dentro do painel)
      // sem teste desta abertura → confere agora, com valores de exemplo no lugar das
      // variáveis (Ag2-11a). Nunca impede salvar.
      let embedCheck: PanelAppEmbedCheck | undefined;
      const switchedToEmbed = !!item && form.openMode === "embed" && item.openMode !== "embed";
      if (currentTest) {
        embedCheck = currentTest.result;
      } else if (canTest && (urlChanged || switchedToEmbed)) {
        setCheckingOnSave(true);
        const res = await checkPanelAppEmbed(probeOf(url));
        if (seq !== openSeqRef.current) return;
        setCheckingOnSave(false);
        embedCheck = res.result;
        setTest({ url, result: res.result });
      }

      const common = {
        name: nameTrimmed,
        url,
        icon: form.icon,
        category: form.category,
        openMode: form.openMode,
        isActive: form.isActive,
        ...(embedCheck !== undefined ? { embedCheck } : {}),
      };

      let saved: AnyPanelAppItem | null | undefined;
      if (scope === "tenant") {
        const input: PanelAppInput = {
          ...common,
          profiles: normalizeProfiles(form.profiles, "tenant"),
          // Sempre os três: a tela mostra os três tipos de vínculo.
          userIds: form.userIds,
          groupIds: form.groupIds,
          customProfileIds: form.customProfileIds,
          // Fase 2: só com o eco (o backend da v1 ignoraria; ausente = não mexe).
          ...(sendPlacements ? { placements: PANEL_APP_PLACEMENTS.filter((p) => form.placements.includes(p)) } : {}),
        };
        saved = item ? await updatePanelApp(item.id, input) : await createPanelApp(input);
      } else {
        const input: GlobalPanelAppInput = {
          ...common,
          profiles: normalizeProfiles(form.profiles, "global"),
          allTenants: form.allTenants,
          targetTenantIds: form.targetTenantIds,
          targetPlanIds: form.targetPlanIds,
          showToSuperadmin: form.showToSuperadmin,
        };
        saved = item ? await updateGlobalPanelApp(item.id, input) : await createGlobalPanelApp(input);
      }
      if (seq !== openSeqRef.current) return;

      const savedApp = saved && typeof saved === "object" ? saved : null;
      const keyRotated = savedApp?.signingKeyRotated === true;
      const keyCreated = !keyRotated && !hadKey && readKeyInfo(savedApp?.signingKey) !== null;
      const finalCheck = embedCheck ?? storedCheck;
      if (form.openMode === "embed" && finalCheck === "blocked") toast.warning(tp("savedButBlocked"));
      else if (!keyRotated) toast.success(item ? tp("saved") : tp("created"));
      // Domínio novo (D15): a ferramenta precisa da chave nova, senão recusa toda ficha.
      if (keyRotated) toast.warning(tp("savedKeyRotated"));
      await onSaved({ app: savedApp, keyEvent: keyRotated ? "rotated" : keyCreated ? "created" : null });
      onOpenChange(false);
    } catch (err: unknown) {
      if (seq !== openSeqRef.current) return;
      // Servidor sem a fase 2 (tabelas ausentes): o diálogo volta a ser o da v1.
      if (errorCodeOf(err) === "ERR_PANEL_APP_LAUNCH_NOT_READY") usePanelAppsStore.getState().setLaunchUnsupported();
      const key = panelAppErrorKey(err, "errors.saveFailed");
      if (key) toast.error(tp(key));
    } finally {
      if (seq === openSeqRef.current) {
        setSaving(false);
        setCheckingOnSave(false);
      }
    }
  };

  const title =
    scope === "global"
      ? isEdit ? t("titleEditGlobal") : t("titleNewGlobal")
      : isEdit ? t("titleEdit") : t("titleNew");

  const subtitle =
    scope === "global" ? t("subtitleGlobal") : launchSupported ? t("subtitlePlacements") : t("subtitle");

  const hasGlobalTarget = form.allTenants || form.targetTenantIds.length > 0 || form.targetPlanIds.length > 0;
  const placementOptions: readonly PanelAppPlacement[] = scope === "global" ? ["menu"] : PANEL_APP_PLACEMENTS;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 pb-3 pl-5 pr-12 pt-5 sm:pl-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5 sm:px-6">
          {/* ── Aplicativo ─────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="panel-app-name">{t("name")}</Label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {form.name.length}/{PANEL_APP_NAME_MAX}
                </span>
              </div>
              <Input
                id="panel-app-name"
                ref={nameRef}
                value={form.name}
                maxLength={PANEL_APP_NAME_MAX}
                onChange={(e) => set("name", e.target.value)}
                placeholder={t("namePlaceholder")}
                error={submitted && nameIssue ? t(nameIssue) : undefined}
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="panel-app-url">{t("url")}</Label>
                <PanelAppHint text={t("urlHint")} />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <Input
                    id="panel-app-url"
                    ref={urlRef}
                    value={form.url}
                    maxLength={PANEL_APP_URL_MAX}
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => set("url", e.target.value)}
                    onSelect={saveUrlCursor}
                    onKeyUp={saveUrlCursor}
                    onClick={saveUrlCursor}
                    onBlur={() => {
                      saveUrlCursor();
                      setUrlTouched(true);
                      const fixed = withDefaultScheme(form.url);
                      if (fixed !== form.url) set("url", fixed);
                    }}
                    placeholder="https://"
                    error={urlErrorText}
                    disabled={saving}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runTest}
                  disabled={!canTest || testing || saving}
                  className="shrink-0 gap-1.5"
                  title={canTest ? t("testHint") : t("testNeedsHttps")}
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {testing ? t("testing") : t("test")}
                </Button>
              </div>

              {launchSupported && (
                <PanelAppVariablePicker scope={scope} onInsert={insertUrlVariable} disabled={saving} />
              )}

              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <KeyRound className="mt-px h-3 w-3 shrink-0" />
                <span>{t("noSecretsHint")}</span>
              </p>
              {/* Endereço http válido (nova aba): o teste não se aplica — diz por quê */}
              {trimmedUrl && !urlIssue && !canTest && templateIssue !== "ERR_PANEL_APP_VARIABLE_IN_HOST" && (
                <p className="text-[11px] text-muted-foreground">{t("testNeedsHttps")}</p>
              )}

              {/* Fase 2: endereço salvo antes com variável fora do lugar (não impede salvar) */}
              {templateSavedIssue && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs" role="status">
                  <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
                  <span>
                    {t("templateSavedIssue")} {tp(`errors.${templateSavedIssue}`)}
                  </span>
                </div>
              )}

              {/* Fase 2: avisos do endereço com variáveis (não bloqueiam) */}
              {warningLines.length > 0 && (
                <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs" role="status">
                  {warningLines.map((line) => (
                    <p key={line} className="flex items-start gap-2">
                      <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
                      <span>{line}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Fase 2: dicas do endereço com dados (sem termo técnico) */}
              {launchSupported && hasVariables && (
                <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                  <p className="flex items-start gap-1.5">
                    <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>{t("tipAccessLog")}</span>
                  </p>
                  {scope === "tenant" && (
                    <p className="flex items-start gap-1.5">
                      <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>{t("tipRestricted")}</span>
                    </p>
                  )}
                  <p className="flex items-start gap-1.5">
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>{t("testWithSample")}</span>
                  </p>
                </div>
              )}

              {shownCheck && (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-2.5 text-xs",
                    shownCheck === "ok" && "border-success/40 bg-success/10",
                    shownCheck === "blocked" && "border-warning/40 bg-warning/10",
                    shownCheck === "unknown" && "border-border bg-muted/40"
                  )}
                  role="status"
                >
                  {shownCheck === "ok" ? (
                    <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-success" />
                  ) : shownCheck === "blocked" ? (
                    <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
                  ) : (
                    <Info className="mt-px h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p>
                      {storedCheck && <span className="font-medium">{t("lastCheck")} </span>}
                      {shownCheck === "ok" ? t("testOk") : shownCheck === "blocked" ? t("testBlocked") : t("testUnknown")}
                    </p>
                    {shownCheck === "blocked" && form.openMode === "embed" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => set("openMode", "new_tab")}
                        disabled={saving}
                      >
                        {t("useNewTab")}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Fase 2: chave da ficha assinada (endereço com a ficha) ── */}
            {usesToken && (
              <PanelAppSigningKeySection
                scope={scope}
                keyInfo={keyInfo}
                unreadable={keyUnreadable}
                canGenerateMissing={isEdit && storedHasToken}
                appOrigin={appOrigin}
                panelOrigin={panelOrigin}
                busy={saving || rotating}
                rotating={rotating}
                onRotate={() => void runRotate()}
              />
            )}

            <div className="space-y-1.5">
              <Label>{t("icon")}</Label>
              <PanelAppIconPicker
                value={form.icon}
                onChange={(key) => set("icon", key)}
                disabled={saving}
                label={t("icon")}
              />
            </div>
          </div>

          <Separator />

          {/* ── Onde e como abre ───────────────────────────────────── */}
          <div className="space-y-4">
            {launchSupported && (
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label id="panel-app-placements-label">{t("placementsTitle")}</Label>
                  {scope === "tenant" && <PanelAppHint text={t("placementsHint")} />}
                </div>
                <div
                  role="group"
                  aria-labelledby="panel-app-placements-label"
                  className={cn("grid gap-2", scope === "tenant" && "sm:grid-cols-3")}
                >
                  {placementOptions.map((placement, index) => {
                    const locked = scope === "global";
                    const checked = locked || form.placements.includes(placement);
                    return (
                      <label
                        key={placement}
                        htmlFor={`panel-app-placement-${placement}`}
                        className={cn(
                          "flex items-start gap-2 rounded-md border p-2.5 text-sm",
                          locked ? "cursor-default bg-muted/30" : "cursor-pointer hover:bg-accent/40",
                          checked && !locked && "border-primary/60 bg-primary/5"
                        )}
                      >
                        <Checkbox
                          id={`panel-app-placement-${placement}`}
                          ref={index === 0 ? placementsFirstRef : undefined}
                          checked={checked}
                          disabled={locked || saving}
                          onCheckedChange={(v) => togglePlacement(placement, v === true)}
                          className="mt-0.5"
                          aria-invalid={submitted && placementsIssue ? true : undefined}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">{t(PLACEMENT_LABEL_KEYS[placement])}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {t(PLACEMENT_DESC_KEYS[placement])}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {scope === "global" && (
                  <p className="text-[11px] text-muted-foreground">{t("placementsGlobalHint")}</p>
                )}
                {submitted && placementsIssue && (
                  <p className="text-xs text-destructive" role="alert">
                    {t("placementsRequired")}
                  </p>
                )}
              </div>
            )}

            {showCategory && (
              <div className="space-y-1.5">
                <Label htmlFor="panel-app-category">{t("category")}</Label>
                <Select value={form.category} onValueChange={(v) => set("category", v)} disabled={saving}>
                  <SelectTrigger id="panel-app-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PANEL_APP_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`categories.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {scope === "global" ? t("categoryHintGlobal") : t("categoryHint")}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>{t("mode")}</Label>
                <PanelAppHint text={t("modeHint")} />
              </div>
              <RadioGroup
                value={form.openMode}
                onValueChange={(v) => set("openMode", v === "new_tab" ? "new_tab" : "embed")}
                className="grid gap-2 sm:grid-cols-2"
                disabled={saving}
              >
                {(["embed", "new_tab"] as const).map((mode) => (
                  <label
                    key={mode}
                    htmlFor={`panel-app-mode-${mode}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors hover:bg-accent/40",
                      form.openMode === mode && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem id={`panel-app-mode-${mode}`} value={mode} className="mt-0.5" />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-sm font-medium">
                        {mode === "embed" ? t("modeEmbed") : t("modeNewTab")}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {mode === "embed" ? t("modeEmbedDesc") : t("modeNewTabDesc")}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>

              {hasContextPlacement && (
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{t("modeContextHint")}</span>
                </p>
              )}

              {urlIssue === "httpsRequired" && (
                <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
                    <span>{t("httpOnlyNewTab")}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0"
                    onClick={() => set("openMode", "new_tab")}
                    disabled={saving}
                  >
                    {t("useNewTab")}
                  </Button>
                </div>
              )}

              {form.openMode === "embed" && (
                <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                  <p className="flex items-start gap-1.5">
                    <LogIn className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>{t("loginHint")}</span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>{t("blockedSitesHint")}</span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <Camera className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>{t("devicesHint")}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="panel-app-active">{t("active")}</Label>
                <p className="text-[11px] text-muted-foreground">{t("activeHint")}</p>
              </div>
              <Switch
                id="panel-app-active"
                checked={form.isActive}
                onCheckedChange={(v) => set("isActive", v)}
                disabled={saving}
              />
            </div>
          </div>

          <Separator />

          {/* ── Quem vê ────────────────────────────────────────────── */}
          {scope === "tenant" ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{t("sectionAccess")}</p>
                <p className="text-[11px] text-muted-foreground">{t("accessOrHint")}</p>
              </div>

              {optionsFailed && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
                  <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
                  <span>{t("optionsFailed")}</span>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>{t("profiles")}</Label>
                  <PanelAppHint text={t("profilesHint")} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PANEL_APP_PROFILES.map((profile) => {
                    const locked = profile === "admin";
                    const checked = locked || form.profiles.includes(profile);
                    return (
                      <label
                        key={profile}
                        htmlFor={`panel-app-profile-${profile}`}
                        className={cn(
                          "flex items-start gap-2 rounded-md border p-2.5 text-sm",
                          locked ? "cursor-default bg-muted/30" : "cursor-pointer hover:bg-accent/40"
                        )}
                      >
                        <Checkbox
                          id={`panel-app-profile-${profile}`}
                          checked={checked}
                          disabled={locked || saving}
                          onCheckedChange={(v) => toggleProfile(profile, v === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block">{t(panelAppProfileLabelKey(profile))}</span>
                          {locked && (
                            <span className="block text-[11px] text-muted-foreground">{t("adminAlwaysSees")}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t("customProfiles")}</Label>
                {form.profiles.includes("custom") && (
                  <p className="text-[11px] text-muted-foreground">{t("customAllChecked")}</p>
                )}
                <PanelAppMultiSelect
                  label={t("customProfiles")}
                  options={customProfileOptions}
                  value={form.customProfileIds}
                  onChange={(ids) => set("customProfileIds", ids)}
                  loading={optionsLoading}
                  disabled={saving}
                  max={MAX_GRANT_CUSTOM_PROFILES}
                  emptyText={t("noCustomProfiles")}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("users")}</Label>
                <PanelAppMultiSelect
                  label={t("users")}
                  options={userOptions}
                  value={form.userIds}
                  onChange={(ids) => set("userIds", ids)}
                  loading={optionsLoading}
                  disabled={saving}
                  max={MAX_GRANT_USERS}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>{t("teams")}</Label>
                  <PanelAppHint text={t("teamsHint")} />
                </div>
                <PanelAppMultiSelect
                  label={t("teams")}
                  options={teamOptions}
                  value={form.groupIds}
                  onChange={(ids) => set("groupIds", ids)}
                  loading={optionsLoading}
                  disabled={saving}
                  max={MAX_GRANT_TEAMS}
                  emptyText={t("noTeams")}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-semibold">{t("target")}</p>
                  <PanelAppHint text={t("targetHint")} />
                </div>
                <p className="text-[11px] text-muted-foreground">{t("targetOrHint")}</p>
              </div>

              <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="panel-app-all-tenants">{t("targetAll")}</Label>
                  <p className="text-[11px] text-muted-foreground">{t("targetAllHint")}</p>
                </div>
                <Switch
                  id="panel-app-all-tenants"
                  checked={form.allTenants}
                  onCheckedChange={(v) => set("allTenants", v)}
                  disabled={saving}
                />
              </div>

              {form.allTenants && <p className="text-[11px] text-muted-foreground">{t("targetAllOn")}</p>}

              <div className="space-y-1.5">
                <Label>{t("targetTenants")}</Label>
                <PanelAppMultiSelect
                  label={t("targetTenants")}
                  options={tenantChoices}
                  value={form.targetTenantIds}
                  onChange={(ids) => set("targetTenantIds", ids)}
                  loading={sourcesLoading}
                  disabled={saving || form.allTenants}
                  max={MAX_TARGET_TENANTS}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>{t("targetPlans")}</Label>
                  <PanelAppHint text={t("targetPlansHint")} />
                </div>
                <PanelAppMultiSelect
                  label={t("targetPlans")}
                  options={planChoices}
                  value={form.targetPlanIds}
                  onChange={(ids) => set("targetPlanIds", ids)}
                  loading={sourcesLoading}
                  disabled={saving || form.allTenants}
                  max={MAX_TARGET_PLANS}
                />
              </div>

              {!hasGlobalTarget && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
                  <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
                  <span>{form.showToSuperadmin ? t("noTargetOnlyMe") : t("noTarget")}</span>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>{t("profilesGlobal")}</Label>
                  <PanelAppHint text={t("profilesGlobalHint")} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PANEL_APP_PROFILES.map((profile) => (
                    <label
                      key={profile}
                      htmlFor={`panel-app-gprofile-${profile}`}
                      className="flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm hover:bg-accent/40"
                    >
                      <Checkbox
                        id={`panel-app-gprofile-${profile}`}
                        checked={form.profiles.includes(profile)}
                        disabled={saving}
                        onCheckedChange={(v) => toggleProfile(profile, v === true)}
                      />
                      <span>{t(panelAppProfileLabelKey(profile))}</span>
                    </label>
                  ))}
                </div>
                {form.profiles.length === 0 && hasGlobalTarget && (
                  <p className="text-[11px] text-warning">{t("noProfiles")}</p>
                )}
              </div>

              <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="panel-app-show-sa">{t("showToSuperadmin")}</Label>
                  <p className="text-[11px] text-muted-foreground">{t("showToSuperadminHint")}</p>
                </div>
                <Switch
                  id="panel-app-show-sa"
                  checked={form.showToSuperadmin}
                  onCheckedChange={(v) => set("showToSuperadmin", v)}
                  disabled={saving}
                />
              </div>

              <p className="text-[11px] text-muted-foreground">{t("hiddenByAdminHint")}</p>
            </div>
          )}

          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" />
            <span>{t("changesDelayHint")}</span>
          </p>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:space-x-0 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || rotating || urlIssue === "httpsRequired"}
            className="gap-1.5"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {checkingOnSave ? t("checkingSite") : saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>

        {/* D15: domínio novo numa app com chave — confirmação ANTES de enviar */}
        <AlertDialog
          open={domainConfirm !== null}
          onOpenChange={(o) => {
            if (!o) setDomainConfirm(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("domainChangeTitle")}</AlertDialogTitle>
              <AlertDialogDescription className="break-words">
                {t("domainChangeDesc", { from: domainConfirm?.from ?? "", to: domainConfirm?.to ?? "" })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleSave({ domainConfirmed: true })}>
                {t("domainChangeConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
