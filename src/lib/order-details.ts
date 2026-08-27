// Tipos e helpers do template de cobranca ("Detalhes do pedido" / ORDER_DETAILS).
// docs/PLANO_TEMPLATE_ORDER_DETAILS.md — D0 (caminho paralelo).
//
// Compartilhado entre o formulario (components/common/order-details-fields.tsx),
// os construtores de envio (message-input, header, kanban, massa...) e o render
// da bolha (message-bubble). Espelha o helper de backend
// BuildOrderDetailsParamZPRO.ts — manter os dois em sincronia.
//
// Convencao de valor: TUDO em CENTAVOS (inteiro). A Meta exige offset 100 para
// BRL. Conversao para/de texto so acontece na borda da UI.

export type OrderDetailsGoodsType = "digital-goods" | "physical-goods";
export type OrderDetailsPaymentKind = "pix" | "link" | "boleto";
export type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

export interface OrderDetailsItem {
  name: string;
  quantity: number;
  /** centavos, preco unitario */
  amount: number;
}

export interface OrderDetailsPayment {
  kind: OrderDetailsPaymentKind;
  code?: string;
  merchantName?: string;
  key?: string;
  keyType?: PixKeyType;
  uri?: string;
  digitableLine?: string;
}

export interface OrderDetailsValue {
  referenceId?: string;
  goodsType: OrderDetailsGoodsType;
  items: OrderDetailsItem[];
  /** centavos */
  discount?: number;
  shipping?: number;
  tax?: number;
  expirationTimestamp?: number;
  expirationDescription?: string;
  payment: OrderDetailsPayment;
}

export const emptyOrderDetailsItem = (): OrderDetailsItem => ({
  name: "",
  quantity: 1,
  amount: 0,
});

// ---------------------------------------------------------------------------
// Referencia da cobranca (reference_id) — D7
// ---------------------------------------------------------------------------

// Mesmo alfabeto do backend (helpers/GenerateOrderReferenceIdZPRO): sem I/O/0/1,
// porque o cliente final le esse valor na ficha ("N da cobranca") e as vezes o
// dita por telefone. 32 simbolos dividem 256 exatamente — modulo sem vies.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const REFERENCE_LENGTH = 10;

/**
 * Referencia OPACA da cobranca, gerada UMA VEZ por abertura do formulario
 * (`emptyOrderDetails`) e enviada dentro do payload.
 *
 * E ela que faz o guard de idempotencia do backend valer: sem referencia vinda
 * do front o servidor sorteia uma nova a cada request, e duplo clique, timeout
 * com retry ou reenvio viram DUAS cobrancas distintas para o mesmo cliente.
 *
 * Nao embute tenant, contato nem timestamp — o campo e visivel ao destinatario.
 */
export const generateOrderReferenceId = (): string => {
  const bytes = new Uint8Array(REFERENCE_LENGTH);
  const webCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    // Ambiente sem Web Crypto: a referencia precisa ser unica, nao imprevisivel
    // — o backend continua validando e persistindo a linha da cobranca.
    for (let i = 0; i < REFERENCE_LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    out += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  }
  return out;
};

export const emptyOrderDetails = (): OrderDetailsValue => ({
  referenceId: generateOrderReferenceId(),
  goodsType: "digital-goods",
  items: [emptyOrderDetailsItem()],
  payment: { kind: "pix", keyType: "EVP" },
});

// ---------------------------------------------------------------------------
// Deteccao — os 3 discriminadores confirmados no F0 (canal 238, Graph v24.0)
// ---------------------------------------------------------------------------

interface TemplateLike {
  sub_category?: string;
  display_format?: string;
  components?: Array<{ type?: string; buttons?: Array<{ type?: string }> }>;
}

/**
 * Rotulo unico que a Meta aceita no botao ORDER_DETAILS. Nao e escolha nossa:
 * criar o template com qualquer outro texto volta como `Invalid parameter`
 * (error_subcode 2388153). Por isso o editor mostra o campo travado.
 */
export const ORDER_DETAILS_BUTTON_TEXT = "Copy Pix code";

export const isOrderDetailsTemplate = (template: TemplateLike | null | undefined): boolean => {
  if (!template) return false;
  if ((template.sub_category || "").toUpperCase() === "ORDER_DETAILS") return true;
  if ((template.display_format || "").toUpperCase() === "ORDER_DETAILS") return true;
  return (template.components || []).some(
    (c) =>
      (c?.type || "").toUpperCase() === "BUTTONS" &&
      Array.isArray(c?.buttons) &&
      c.buttons!.some((b) => (b?.type || "").toUpperCase() === "ORDER_DETAILS")
  );
};

export const findOrderDetailsButtonIndex = (
  components: Array<{ type?: string; buttons?: Array<{ type?: string }> }> | undefined
): number => {
  for (const comp of components || []) {
    if ((comp?.type || "").toUpperCase() !== "BUTTONS") continue;
    const idx = (comp.buttons || []).findIndex((b) => (b?.type || "").toUpperCase() === "ORDER_DETAILS");
    if (idx >= 0) return idx;
  }
  return 0;
};

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

/** "1.234,56" | "1234.56" | "R$ 1.234,56" -> 123456 (centavos). NaN -> 0. */
export const parseCurrencyToCents = (raw: string | number | null | undefined): number => {
  if (typeof raw === "number") return Math.round(raw * 100);
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const digits = s.replace(/[^\d,.-]/g, "");
  if (!digits) return 0;
  // Ultimo separador manda: "1.234,56" (BR) e "1,234.56" (US) viram 1234.56
  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  let normalized = digits;
  if (lastComma > lastDot) {
    normalized = digits.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = digits.replace(/,/g, "");
  } else {
    normalized = digits.replace(/[,.]/g, "");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
};

/** 123456 -> "1.234,56" */
export const formatCentsToInput = (cents: number | null | undefined): string => {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** 123456 -> "R$ 1.234,56" */
export const formatCentsBRL = (cents: number | null | undefined, currency = "BRL"): string => {
  const n = Number(cents || 0) / 100;
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency });
  } catch {
    return `R$ ${n.toFixed(2).replace(".", ",")}`;
  }
};

/** Valor da Meta ({value, offset}) -> string formatada. */
export const formatMetaAmount = (
  amount: { value?: number; offset?: number } | null | undefined,
  currency = "BRL"
): string => {
  if (!amount || typeof amount.value !== "number") return "";
  const offset = amount.offset && amount.offset > 0 ? amount.offset : 100;
  const n = amount.value / offset;
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency });
  } catch {
    return `R$ ${n.toFixed(2).replace(".", ",")}`;
  }
};

// ---------------------------------------------------------------------------
// Totais e validacao (espelha BuildOrderDetailsParamZPRO)
// ---------------------------------------------------------------------------

/**
 * Itens que de fato viram pedido: item sem nome e descartado aqui e tambem no
 * backend (BuildOrderDetailsParamZPRO filtra por nome antes de somar).
 *
 * Total exibido, total validado e total enviado precisam sair TODOS desta mesma
 * lista. Enquanto o subtotal usava a lista filtrada e o total a lista crua, um
 * item com valor preenchido e nome vazio entrava no total da tela, passava na
 * validacao local e era recusado no envio com AMOUNT_MISMATCH — o operador lia
 * "o total nao bate" olhando para um total que batia.
 */
export const orderDetailsBillableItems = (
  items: OrderDetailsItem[] | null | undefined
): OrderDetailsItem[] => (items || []).filter((i) => String(i?.name || "").trim());

export const computeSubtotal = (items: OrderDetailsItem[]): number =>
  (items || []).reduce((acc, i) => acc + Math.max(0, i.amount || 0) * Math.max(0, i.quantity || 0), 0);

export const computeTotal = (value: OrderDetailsValue): number =>
  computeSubtotal(orderDetailsBillableItems(value.items)) +
  (value.tax || 0) +
  (value.shipping || 0) -
  (value.discount || 0);

// ---------------------------------------------------------------------------
// Vencimento (order.expiration)
// ---------------------------------------------------------------------------

/** A Meta recusa expiracao a menos de 300s do envio (espelha BuildOrderDetailsParamZPRO). */
export const MIN_EXPIRATION_SECONDS = 300;

/** epoch(s) -> "YYYY-MM-DDTHH:mm" no fuso do operador (valor de <input type="datetime-local">). */
export const epochSecondsToDateTimeInput = (ts: number | null | undefined): string => {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
};

/** "YYYY-MM-DDTHH:mm" (fuso do operador) -> epoch em SEGUNDOS. Vazio/invalido -> undefined. */
export const dateTimeInputToEpochSeconds = (raw: string | null | undefined): number | undefined => {
  const s = String(raw || "").trim();
  if (!s) return undefined;
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) return undefined;
  return Math.floor(ms / 1000);
};

/** Chave i18n do erro, ou null quando valido. Namespace `orderDetails`. */
export const validateOrderDetails = (value: OrderDetailsValue): string | null => {
  const items = orderDetailsBillableItems(value.items);
  if (items.length === 0) return "errorNoItems";
  if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity <= 0)) return "errorQuantity";
  if (items.some((i) => !Number.isInteger(i.amount) || i.amount < 0)) return "errorAmount";

  const total = computeTotal(value);
  if (total <= 0) return "errorTotalZero";

  const payment = value.payment;
  // FORMATO do meio de pagamento nao bloqueia. O codigo e digitado/colado pelo
  // operador e vai verbatim para a Meta: quando nao fecha (CRC, estrutura de
  // BRCode, valor divergente, linha digitavel fora do padrao) a tela AVISA em
  // amarelo — ver order-details-fields.tsx — mas quem decide o que cobrar e ele.
  // Aqui so entra o que impede a cobranca de existir: campo vazio.
  if (payment.kind === "pix") {
    if (!payment.code?.trim()) return "errorPixRequired";
  } else if (payment.kind === "link") {
    if (!payment.uri?.trim()) return "errorLinkInvalid";
  } else if (payment.kind === "boleto") {
    if (!payment.digitableLine?.trim()) return "errorBoletoInvalid";
  }

  if (value.expirationTimestamp) {
    // A descricao aparece na ficha do cliente e a Meta a exige junto da expiracao.
    if (!value.expirationDescription?.trim()) return "errorExpirationDescription";
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (value.expirationTimestamp - nowSeconds < MIN_EXPIRATION_SECONDS) {
      return "errorExpirationTooSoon";
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// BRCode (Pix copia-e-cola) — validacao no cliente, espelho do backend (D9)
// ---------------------------------------------------------------------------

const crc16ccitt = (input: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

const parseTlv = (payload: string): Record<string, string> => {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.substring(i, i + 2);
    const len = parseInt(payload.substring(i + 2, i + 4), 10);
    if (!Number.isFinite(len) || len < 0) break;
    const v = payload.substring(i + 4, i + 4 + len);
    if (v.length < len) break;
    out[id] = v;
    i += 4 + len;
  }
  return out;
};

export const isBrCodeCrcValid = (code: string | undefined): boolean => {
  const clean = String(code || "").trim();
  const idx = clean.lastIndexOf("6304");
  if (idx < 0 || idx + 8 !== clean.length) return false;
  return crc16ccitt(clean.substring(0, idx + 4)) === clean.substring(idx + 4).toUpperCase();
};

/** Valor embutido no BRCode (campo 54) em centavos, ou null se o codigo nao traz valor. */
export const parseBrCodeAmountCents = (code: string | undefined): number | null => {
  const root = parseTlv(String(code || "").trim());
  if (!root["54"]) return null;
  const n = Number(root["54"]);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/**
 * Chave Pix do BRCode — SO existe em codigo ESTATICO (campo 26/01).
 * O copia-e-cola do dia a dia e DINAMICO: o banco gera um codigo por cobranca e
 * ele traz a URL do PSP (campo 26/25) no lugar da chave. Por isso isto devolve
 * undefined com frequencia, e nada pode depender da chave estar presente.
 */
export const parseBrCodeKey = (code: string | undefined): string | undefined => {
  const root = parseTlv(String(code || "").trim());
  for (let id = 26; id <= 51; id++) {
    const raw = root[String(id).padStart(2, "0")];
    if (!raw) continue;
    const inner = parseTlv(raw);
    if ((inner["00"] || "").toLowerCase().includes("br.gov.bcb.pix")) return inner["01"];
  }
  return undefined;
};

/** URL do payload no PSP (campo 26/25) — presente no BRCode dinamico. */
export const parseBrCodePayloadUrl = (code: string | undefined): string | undefined => {
  const root = parseTlv(String(code || "").trim());
  for (let id = 26; id <= 51; id++) {
    const raw = root[String(id).padStart(2, "0")];
    if (!raw) continue;
    const inner = parseTlv(raw);
    if ((inner["00"] || "").toLowerCase().includes("br.gov.bcb.pix")) return inner["25"];
  }
  return undefined;
};

/** true quando o codigo e um BRCode Pix valido — estatico (chave) ou dinamico (URL). */
export const isPixBrCode = (code: string | undefined): boolean =>
  Boolean(parseBrCodeKey(code) || parseBrCodePayloadUrl(code));

/**
 * Tipo da chave Pix deduzido do proprio valor.
 *
 * A Meta exige `key_type` junto da chave. Deduzir evita duas coisas: o operador
 * ter de escolher o tipo, e o par chave/tipo sair divergente (chave de CPF
 * declarada como EVP), que a Meta recusa.
 */
export const guessPixKeyType = (key: string | undefined): PixKeyType => {
  const raw = String(key || "").trim();
  if (!raw) return "EVP";
  if (raw.includes("@")) return "EMAIL";
  const digits = raw.replace(/\D/g, "");
  // Telefone chega com "+" (formato E.164 exigido pelo Pix).
  if (raw.startsWith("+")) return "PHONE";
  // So digitos: CPF tem 11, CNPJ tem 14. Chave aleatoria (EVP) e um UUID com
  // hifens, entao nunca cai aqui.
  if (digits.length === raw.length) {
    if (digits.length === 11) return "CPF";
    if (digits.length === 14) return "CNPJ";
  }
  return "EVP";
};

export const parseBrCodeMerchant = (code: string | undefined): string | undefined =>
  parseTlv(String(code || "").trim())["59"];

// ---------------------------------------------------------------------------
// Payload de envio (o backend valida de novo — este e o shape amigavel)
// ---------------------------------------------------------------------------

export const buildOrderDetailsPayload = (value: OrderDetailsValue) => {
  const items = orderDetailsBillableItems(value.items);
  return {
    // Idempotencia (D7): a referencia sai do front para que retry/duplo clique
    // caiam na MESMA linha de cobranca no backend em vez de virar uma cobranca
    // nova. Ausente no disparo repetido (lote/campanha/acao), onde o backend
    // precisa gerar uma referencia por destinatario — ver OrderDetailsFields.
    ...(value.referenceId ? { referenceId: value.referenceId } : {}),
    goodsType: value.goodsType,
    totalAmount: computeTotal(value),
    subtotal: computeSubtotal(items),
    items: items.map((i) => ({ name: i.name.trim(), quantity: i.quantity, amount: i.amount })),
    ...(value.tax ? { tax: { value: value.tax } } : {}),
    ...(value.shipping ? { shipping: { value: value.shipping } } : {}),
    ...(value.discount ? { discount: { value: value.discount } } : {}),
    ...(value.expirationTimestamp
      ? {
          expirationTimestamp: value.expirationTimestamp,
          expirationDescription: value.expirationDescription,
        }
      : {}),
    payment: value.payment,
  };
};

/**
 * Extrai o order_details de um array de components (usado no render da bolha).
 *
 * O componente aparece em DOIS niveis conforme quem montou o array:
 *  - raiz: formato final da Meta ({type:"button", sub_type:"order_details"});
 *  - dentro de BUTTONS.buttons[]: formato interno do Z-PRO — e este que o
 *    backend grava no dataJson (contrato exigido pelos senders).
 * Varrer so a raiz faria a ficha nunca renderizar.
 */
export const extractOrderDetails = (components: unknown): Record<string, any> | null => {
  if (!Array.isArray(components)) return null;

  const fromButton = (btn: any): Record<string, any> | null => {
    if (String(btn?.sub_type || "").toLowerCase() !== "order_details") return null;
    return btn?.parameters?.[0]?.action?.order_details || null;
  };

  for (const comp of components) {
    const direct = fromButton(comp);
    if (direct) return direct;

    const buttons = (comp as any)?.buttons;
    if (Array.isArray(buttons)) {
      for (const btn of buttons) {
        const nested = fromButton(btn);
        if (nested) return nested;
      }
    }
  }
  return null;
};
