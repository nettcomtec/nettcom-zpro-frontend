import { locales } from "@/i18n/config";

/**
 * Região da empresa no front: países (ISO2 → DDI), moedas, telefone e dinheiro.
 *
 * A tabela de países e a lista de moedas são as MESMAS de
 * backend/src/helpers/RegionCatalogZPRO.ts — mudou uma, muda a outra (o front só
 * pode oferecer o que o backend aceita).
 *
 * Dinheiro sai no locale do PAÍS (AR → es-AR, BR → pt-BR), nunca idioma da tela +
 * país ("es-BR" formata "R$1,234.50"), e sempre com dígitos latinos.
 */

export const REGION_LANGUAGES = locales;

export const DEFAULT_COUNTRY = "BR";
export const DEFAULT_CURRENCY = "BRL";

// ISO2:DDI:moeda padrão. DDI "1-XXX" = plano NANP (DDI 1) com código de área próprio.
const COUNTRY_TABLE =
  "AD:376:EUR,AE:971:AED,AF:93:AFN,AG:1-268:XCD,AI:1-264:XCD,AL:355:ALL,AM:374:AMD,AO:244:AOA," +
  "AR:54:ARS,AS:1-684:USD,AT:43:EUR,AU:61:AUD,AW:297:AWG,AX:358:EUR,AZ:994:AZN,BA:387:BAM," +
  "BB:1-246:BBD,BD:880:BDT,BE:32:EUR,BF:226:XOF,BG:359:EUR,BH:973:BHD,BI:257:BIF,BJ:229:XOF," +
  "BL:590:EUR,BM:1-441:BMD,BN:673:BND,BO:591:BOB,BQ:599:USD,BR:55:BRL,BS:1-242:BSD,BT:975:BTN," +
  "BW:267:BWP,BY:375:BYN,BZ:501:BZD,CA:1:CAD,CC:61:AUD,CD:243:CDF,CF:236:XAF,CG:242:XAF," +
  "CH:41:CHF,CI:225:XOF,CK:682:NZD,CL:56:CLP,CM:237:XAF,CN:86:CNY,CO:57:COP,CR:506:CRC," +
  "CU:53:CUP,CV:238:CVE,CW:599:XCG,CX:61:AUD,CY:357:EUR,CZ:420:CZK,DE:49:EUR,DJ:253:DJF," +
  "DK:45:DKK,DM:1-767:XCD,DO:1-809:DOP,DZ:213:DZD,EC:593:USD,EE:372:EUR,EG:20:EGP,EH:212:MAD," +
  "ER:291:ERN,ES:34:EUR,ET:251:ETB,FI:358:EUR,FJ:679:FJD,FK:500:FKP,FM:691:USD,FO:298:DKK," +
  "FR:33:EUR,GA:241:XAF,GB:44:GBP,GD:1-473:XCD,GE:995:GEL,GF:594:EUR,GG:44:GBP,GH:233:GHS," +
  "GI:350:GIP,GL:299:DKK,GM:220:GMD,GN:224:GNF,GP:590:EUR,GQ:240:XAF,GR:30:EUR,GT:502:GTQ," +
  "GU:1-671:USD,GW:245:XOF,GY:592:GYD,HK:852:HKD,HN:504:HNL,HR:385:EUR,HT:509:HTG,HU:36:HUF," +
  "ID:62:IDR,IE:353:EUR,IL:972:ILS,IM:44:GBP,IN:91:INR,IO:246:USD,IQ:964:IQD,IR:98:IRR," +
  "IS:354:ISK,IT:39:EUR,JE:44:GBP,JM:1-876:JMD,JO:962:JOD,JP:81:JPY,KE:254:KES,KG:996:KGS," +
  "KH:855:KHR,KI:686:AUD,KM:269:KMF,KN:1-869:XCD,KP:850:KPW,KR:82:KRW,KW:965:KWD,KY:1-345:KYD," +
  "KZ:7:KZT,LA:856:LAK,LB:961:LBP,LC:1-758:XCD,LI:423:CHF,LK:94:LKR,LR:231:LRD,LS:266:LSL," +
  "LT:370:EUR,LU:352:EUR,LV:371:EUR,LY:218:LYD,MA:212:MAD,MC:377:EUR,MD:373:MDL,ME:382:EUR," +
  "MF:590:EUR,MG:261:MGA,MH:692:USD,MK:389:MKD,ML:223:XOF,MM:95:MMK,MN:976:MNT,MO:853:MOP," +
  "MP:1-670:USD,MQ:596:EUR,MR:222:MRU,MS:1-664:XCD,MT:356:EUR,MU:230:MUR,MV:960:MVR,MW:265:MWK," +
  "MX:52:MXN,MY:60:MYR,MZ:258:MZN,NA:264:NAD,NC:687:XPF,NE:227:XOF,NF:672:AUD,NG:234:NGN," +
  "NI:505:NIO,NL:31:EUR,NO:47:NOK,NP:977:NPR,NR:674:AUD,NU:683:NZD,NZ:64:NZD,OM:968:OMR," +
  "PA:507:USD,PE:51:PEN,PF:689:XPF,PG:675:PGK,PH:63:PHP,PK:92:PKR,PL:48:PLN,PM:508:EUR," +
  "PR:1-787:USD,PS:970:ILS,PT:351:EUR,PW:680:USD,PY:595:PYG,QA:974:QAR,RE:262:EUR,RO:40:RON," +
  "RS:381:RSD,RU:7:RUB,RW:250:RWF,SA:966:SAR,SB:677:SBD,SC:248:SCR,SD:249:SDG,SE:46:SEK," +
  "SG:65:SGD,SH:290:SHP,SI:386:EUR,SJ:47:NOK,SK:421:EUR,SL:232:SLE,SM:378:EUR,SN:221:XOF," +
  "SO:252:SOS,SR:597:SRD,SS:211:SSP,ST:239:STN,SV:503:USD,SX:1-721:XCG,SY:963:SYP,SZ:268:SZL," +
  "TC:1-649:USD,TD:235:XAF,TG:228:XOF,TH:66:THB,TJ:992:TJS,TK:690:NZD,TL:670:USD,TM:993:TMT," +
  "TN:216:TND,TO:676:TOP,TR:90:TRY,TT:1-868:TTD,TV:688:AUD,TW:886:TWD,TZ:255:TZS,UA:380:UAH," +
  "UG:256:UGX,US:1:USD,UY:598:UYU,UZ:998:UZS,VA:39:EUR,VC:1-784:XCD,VE:58:VES,VG:1-284:USD," +
  "VI:1-340:USD,VN:84:VND,VU:678:VUV,WF:681:XPF,WS:685:WST,XK:383:EUR,YE:967:YER,YT:262:EUR," +
  "ZA:27:ZAR,ZM:260:ZMW,ZW:263:USD";

// ISO 4217 em uso (mesma lista do backend).
export const ISO_CURRENCIES: readonly string[] = (
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP " +
  "BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP " +
  "GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR " +
  "KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK " +
  "MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR " +
  "SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS " +
  "UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG"
).split(" ");

export interface CountryInfo {
  iso: string;
  /** DDI sem "+" (NANP = "1"). */
  dial: string;
  currency: string;
  /** Códigos de área NANP deste território (vazio para os demais e para US). */
  nanpAreas: string[];
}

// Códigos de área NANP além do principal da tabela.
const EXTRA_NANP_AREAS: Record<string, string[]> = {
  DO: ["829", "849"],
  PR: ["939"],
  JM: ["658"],
  CA: [
    "204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354", "365", "367", "368",
    "382", "403", "416", "418", "428", "431", "437", "438", "450", "468", "474", "506", "514", "519",
    "548", "579", "581", "584", "587", "604", "613", "639", "647", "672", "683", "705", "709", "742",
    "753", "778", "780", "782", "807", "819", "825", "867", "873", "879", "902", "905", "942"
  ]
};

export const COUNTRIES: readonly CountryInfo[] = COUNTRY_TABLE.split(",").map((entry) => {
  const [iso, rawDial, currency] = entry.split(":");
  const [dial, area] = rawDial.split("-");
  const nanpAreas = [...(area ? [area] : []), ...(EXTRA_NANP_AREAS[iso] || [])];
  return { iso, dial, currency, nanpAreas };
});

const COUNTRY_BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));
const NANP_AREA_TO_ISO = new Map<string, string>();
COUNTRIES.forEach((c) => c.nanpAreas.forEach((a) => NANP_AREA_TO_ISO.set(a, c.iso)));

// DDI compartilhado: país que fica com o número quando nada mais decide.
const PRIMARY_FOR_DIAL: Record<string, string> = {
  "1": "US", "7": "RU", "44": "GB", "358": "FI", "590": "GP", "262": "RE", "599": "CW",
  "61": "AU", "47": "NO", "212": "MA", "39": "IT", "672": "NF"
};

const DIAL_TO_ISOS = new Map<string, string[]>();
COUNTRIES.forEach((c) => {
  const list = DIAL_TO_ISOS.get(c.dial) || [];
  list.push(c.iso);
  DIAL_TO_ISOS.set(c.dial, list);
});

export function getCountry(iso?: string | null): CountryInfo | undefined {
  return iso ? COUNTRY_BY_ISO.get(String(iso).toUpperCase()) : undefined;
}

export function isCountryIso(iso: unknown): iso is string {
  return typeof iso === "string" && COUNTRY_BY_ISO.has(iso.toUpperCase());
}

export function dialCodeFor(iso?: string | null): string {
  return getCountry(iso)?.dial || getCountry(DEFAULT_COUNTRY)!.dial;
}

export function defaultCurrencyFor(country?: string | null): string {
  return getCountry(country)?.currency || DEFAULT_CURRENCY;
}

/** Tamanho do número NACIONAL (sem DDI), mín e máx, dos países mais comuns. */
const NATIONAL_LENGTH: Record<string, [number, number]> = {
  BR: [10, 11], US: [10, 10], CA: [10, 10], DO: [10, 10], PR: [10, 10], JM: [10, 10],
  AR: [10, 11], MX: [10, 11], CL: [9, 9], CO: [10, 10], PE: [8, 9], UY: [8, 8], PY: [8, 9],
  BO: [8, 8], EC: [8, 9], VE: [10, 10], CR: [8, 8], PA: [7, 8], GT: [8, 8], HN: [8, 8],
  SV: [8, 8], NI: [8, 8], CU: [8, 8], ES: [9, 9], PT: [9, 9], FR: [9, 9], DE: [6, 13],
  IT: [6, 11], GB: [9, 10], NL: [9, 9], BE: [8, 9], CH: [9, 9], AT: [7, 13], IE: [7, 9],
  PL: [9, 9], RU: [10, 10], KZ: [10, 10], TR: [10, 10], IN: [10, 10], CN: [10, 11],
  JP: [9, 10], KR: [9, 10], ID: [9, 12], PH: [10, 10], TH: [9, 9], VN: [9, 10], MY: [9, 10],
  SG: [8, 8], AU: [9, 9], NZ: [8, 10], ZA: [9, 9], NG: [10, 10], EG: [10, 10], MA: [9, 9],
  AE: [9, 9], SA: [9, 9], IL: [8, 9], AO: [9, 9], MZ: [9, 9], CV: [7, 7]
};

export function nationalLength(iso?: string | null): { min: number; max: number } {
  const c = getCountry(iso);
  if (c && c.dial === "1") return { min: 10, max: 10 };
  const l = c ? NATIONAL_LENGTH[c.iso] : undefined;
  return l ? { min: l[0], max: l[1] } : { min: 4, max: 12 };
}

const onlyDigits = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/** País de um número COMPLETO (com DDI, só dígitos) pelo prefixo mais longo. */
export function countryFromFullNumber(digits: string): string | null {
  const d = onlyDigits(digits);
  if (!d) return null;
  if (d.startsWith("1")) {
    // Código de área do NANP começa em 2–9: "11 9…" é número nacional (ex.: DDD 11), não +1.
    if (d.length > 1 && !/[2-9]/.test(d.charAt(1))) return null;
    const area = d.slice(1, 4);
    return NANP_AREA_TO_ISO.get(area) || "US";
  }
  if (d.startsWith("7")) {
    // Cazaquistão usa +7 6xx/7xx.
    return d.charAt(1) === "6" || d.charAt(1) === "7" ? "KZ" : "RU";
  }
  for (let len = 3; len >= 1; len -= 1) {
    const prefix = d.slice(0, len);
    const isos = DIAL_TO_ISOS.get(prefix);
    if (isos && isos.length) return PRIMARY_FOR_DIAL[prefix] || isos[0];
  }
  return null;
}

export interface ParsedPhone {
  /** País reconhecido; null = modo "como está" (valor mostrado e devolvido intacto). */
  iso: string | null;
  dial: string;
  national: string;
  confident: boolean;
}

/**
 * Lê um valor que veio DE FORA (banco, prop, colado) para o campo de telefone.
 * - "+…" ou "00…": número internacional, país pelo prefixo;
 * - começa com o DDI do país padrão → país padrão (NANP: refinado pelo código de área);
 * - começa com outro DDI e tem mais dígitos que o máximo nacional do país padrão
 *   (BR: 11) → esse país;
 * - senão, modo "como está" (confident=false): nada é inventado.
 */
export function parsePhone(value: unknown, defaultIso?: string | null): ParsedPhone {
  const raw = String(value ?? "").trim();
  const def = getCountry(defaultIso) || getCountry(DEFAULT_COUNTRY)!;
  const digits = onlyDigits(raw);
  if (!digits) return { iso: def.iso, dial: def.dial, national: "", confident: true };

  let full = "";
  if (raw.startsWith("+")) full = digits;
  else if (raw.startsWith("00")) full = digits.slice(2);
  if (full) {
    const iso = countryFromFullNumber(full);
    const c = getCountry(iso);
    if (c) return { iso: c.iso, dial: c.dial, national: full.slice(c.dial.length), confident: true };
    return { iso: null, dial: "", national: digits, confident: false };
  }

  const defMax = nationalLength(def.iso).max;
  if (digits.startsWith(def.dial) && digits.length > defMax) {
    const iso = def.dial === "1" ? countryFromFullNumber(digits) || def.iso : def.iso;
    const c = getCountry(iso)!;
    return { iso: c.iso, dial: c.dial, national: digits.slice(c.dial.length), confident: true };
  }
  if (digits.length > defMax) {
    const iso = countryFromFullNumber(digits);
    const c = getCountry(iso);
    if (c && c.dial !== def.dial) {
      return { iso: c.iso, dial: c.dial, national: digits.slice(c.dial.length), confident: true };
    }
  }
  return { iso: null, dial: "", national: digits, confident: false };
}

/**
 * Número com DDI (só dígitos) a partir de um telefone local e do país (ex.: telefone
 * de pedido Woo/Nuvemshop + billing.country). Já com DDI e comprido demais para ser
 * nacional = devolvido como está; "+"/"00" = internacional; zero de tronco na frente
 * é descartado (salvo Itália, onde o 0 faz parte do número fixo).
 */
export function withDialCode(phone: unknown, iso?: string | null): string {
  const raw = String(phone ?? "").trim();
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (raw.startsWith("+")) return digits;
  if (raw.startsWith("00")) return digits.slice(2);
  const c = getCountry(iso);
  if (!c) return digits;
  const { max } = nationalLength(c.iso);
  if (digits.startsWith(c.dial) && digits.length > max) return digits;
  // Nesses países o 0 inicial faz parte do número (Costa do Marfim desde 2021).
  const keepZero = c.iso === "IT" || c.iso === "SM" || c.iso === "VA" || c.iso === "CI";
  const national = !keepZero && digits.startsWith("0") ? digits.replace(/^0+/, "") : digits;
  return `${c.dial}${national}`;
}

const EXAMPLE_NATIONAL: Record<string, string> = {
  BR: "11 91234-5678", US: "201 555 0123", CA: "416 555 0123", AR: "9 11 2345-6789",
  MX: "55 1234 5678", CL: "9 6123 4567", CO: "321 1234567", PE: "912 345 678",
  UY: "94 231 234", PY: "961 456789", BO: "71234567", EC: "99 123 4567", VE: "412 1234567",
  CR: "8312 3456", PA: "6123 4567", GT: "5123 4567", HN: "9123 4567", SV: "7012 3456",
  NI: "8123 4567", DO: "809 555 0123", PR: "787 555 0123", ES: "612 34 56 78",
  PT: "912 345 678", FR: "6 12 34 56 78", DE: "1512 3456789", IT: "312 345 6789",
  GB: "7400 123456", NL: "6 12345678", BE: "470 12 34 56", CH: "78 123 45 67",
  IN: "81234 56789", AO: "923 123 456", MZ: "82 123 4567", CV: "991 12 34"
};

/** Exemplo de número completo no formato do país ("+54 9 11 2345-6789"). */
export function examplePhone(iso?: string | null): string {
  const c = getCountry(iso) || getCountry(DEFAULT_COUNTRY)!;
  const national = EXAMPLE_NATIONAL[c.iso];
  if (national) return `+${c.dial} ${national}`;
  const { max } = nationalLength(c.iso);
  return `+${c.dial} ${"123456789012".slice(0, Math.min(Math.max(max, 7), 10))}`;
}

/** Número digitado parece NACIONAL do país (sem o DDI)? Usado no aviso dos campos crus. */
export function looksLikeMissingDialCode(value: unknown, iso?: string | null): boolean {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("+") || raw.startsWith("00")) return false;
  const digits = onlyDigits(raw);
  if (digits.length < 6) return false;
  const c = getCountry(iso) || getCountry(DEFAULT_COUNTRY)!;
  if (digits.startsWith(c.dial) && digits.length > nationalLength(c.iso).max) return false;
  const { min, max } = nationalLength(c.iso);
  return digits.length >= Math.min(min, 8) && digits.length <= max;
}

// ---------------------------------------------------------------------------
// Nomes (idioma da tela) e busca sem acento
// ---------------------------------------------------------------------------

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

function getDisplayNames(uiLocale: string, type: "region" | "currency"): Intl.DisplayNames | null {
  const key = `${uiLocale}|${type}`;
  if (displayNamesCache.has(key)) return displayNamesCache.get(key)!;
  let dn: Intl.DisplayNames | null = null;
  try {
    dn = new Intl.DisplayNames([uiLocale], { type });
  } catch {
    dn = null;
  }
  displayNamesCache.set(key, dn);
  return dn;
}

export function countryName(iso: string, uiLocale: string): string {
  const up = String(iso || "").toUpperCase();
  if (up === "XK") {
    // Kosovo não é código ISO oficial: alguns runtimes não têm nome para ele.
    try {
      return getDisplayNames(uiLocale, "region")?.of(up) || "Kosovo";
    } catch {
      return "Kosovo";
    }
  }
  try {
    return getDisplayNames(uiLocale, "region")?.of(up) || up;
  } catch {
    return up;
  }
}

export function currencyName(code: string, uiLocale: string): string {
  try {
    return getDisplayNames(uiLocale, "currency")?.of(code) || code;
  } catch {
    return code;
  }
}

/** Minúsculas e sem acento ("México" → "mexico"). */
export function normalizeSearch(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface CountryOption {
  iso: string;
  dial: string;
  name: string;
}

const countryOptionsCache = new Map<string, CountryOption[]>();

/** Países ordenados pelo nome no idioma da tela. */
export function countryOptions(uiLocale: string): CountryOption[] {
  const cached = countryOptionsCache.get(uiLocale);
  if (cached) return cached;
  const list = COUNTRIES.map((c) => ({ iso: c.iso, dial: c.dial, name: countryName(c.iso, uiLocale) }));
  try {
    const collator = new Intl.Collator(uiLocale);
    list.sort((a, b) => collator.compare(a.name, b.name));
  } catch {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  countryOptionsCache.set(uiLocale, list);
  return list;
}

export interface CurrencyOption {
  code: string;
  name: string;
}

const currencyOptionsCache = new Map<string, CurrencyOption[]>();

/** Moedas aceitas pelo backend (∩ as que o navegador conhece), pelo nome. */
export function currencyOptions(uiLocale: string): CurrencyOption[] {
  const cached = currencyOptionsCache.get(uiLocale);
  if (cached) return cached;
  let codes: string[] = [...ISO_CURRENCIES];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("currency");
    if (Array.isArray(supported) && supported.length) {
      const set = new Set(supported);
      const inter = codes.filter((c) => set.has(c));
      if (inter.length) codes = inter;
    }
  } catch {
    // mantém a lista fixa
  }
  const list = codes.map((code) => ({ code, name: currencyName(code, uiLocale) }));
  try {
    const collator = new Intl.Collator(uiLocale);
    list.sort((a, b) => collator.compare(a.name, b.name));
  } catch {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  currencyOptionsCache.set(uiLocale, list);
  return list;
}

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

const COUNTRY_LOCALE_OVERRIDES: Record<string, string> = { PY: "es-PY" };
const countryLocaleCache = new Map<string, string>();

export function countryLocale(country?: string | null): string {
  const iso = String(country || DEFAULT_COUNTRY).toUpperCase();
  const cached = countryLocaleCache.get(iso);
  if (cached) return cached;
  let tag = "pt-BR";
  try {
    const base = COUNTRY_LOCALE_OVERRIDES[iso];
    if (base) tag = base;
    else {
      const max = new Intl.Locale("und", { region: iso }).maximize();
      tag = `${max.language}-${iso}`;
    }
    const withLatn = `${tag}-u-nu-latn`;
    new Intl.NumberFormat(withLatn);
    countryLocaleCache.set(iso, withLatn);
    return withLatn;
  } catch {
    countryLocaleCache.set(iso, "pt-BR-u-nu-latn");
    return "pt-BR-u-nu-latn";
  }
}

const moneyFormatterCache = new Map<string, Intl.NumberFormat>();

export interface MoneyOptions {
  currency?: string | null;
  country?: string | null;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * Dinheiro no formato do país. Moeda padrão do país → símbolo curto ("$ 1.234,50"
 * na AR, "R$ 1.234,50" no BR); outra moeda → símbolo completo ("US$ 1.234,50").
 * Valor vazio/inválido → "". Falha do Intl → "<ISO> 1234.50".
 */
export function formatMoney(value: unknown, opts: MoneyOptions = {}): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return "";
  const currency = String(opts.currency || DEFAULT_CURRENCY).toUpperCase();
  const country = String(opts.country || DEFAULT_COUNTRY).toUpperCase();
  const display = defaultCurrencyFor(country) === currency ? "narrowSymbol" : "symbol";
  const key = `${currency}|${country}|${display}|${opts.minimumFractionDigits ?? ""}|${opts.maximumFractionDigits ?? ""}`;
  try {
    let fmt = moneyFormatterCache.get(key);
    if (!fmt) {
      fmt = new Intl.NumberFormat(countryLocale(country), {
        style: "currency",
        currency,
        currencyDisplay: display,
        ...(opts.minimumFractionDigits !== undefined ? { minimumFractionDigits: opts.minimumFractionDigits } : {}),
        ...(opts.maximumFractionDigits !== undefined ? { maximumFractionDigits: opts.maximumFractionDigits } : {}),
      });
      moneyFormatterCache.set(key, fmt);
    }
    return fmt.format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Símbolo curto da moeda no formato do país ("R$", "$", "US$"). */
export function currencySymbol(currency?: string | null, country?: string | null): string {
  try {
    const parts = new Intl.NumberFormat(countryLocale(country), {
      style: "currency",
      currency: String(currency || DEFAULT_CURRENCY).toUpperCase(),
      currencyDisplay: defaultCurrencyFor(country) === String(currency || DEFAULT_CURRENCY).toUpperCase() ? "narrowSymbol" : "symbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value || String(currency || DEFAULT_CURRENCY);
  } catch {
    return String(currency || DEFAULT_CURRENCY);
  }
}

// ---------------------------------------------------------------------------
// Estado da Região no store (vindo do GET /tenants/:id)
// ---------------------------------------------------------------------------

export interface RegionDefaultsState {
  country: string;
  currency: string;
  language: string;
  /** O superadmin definiu alguma região padrão. */
  configured: boolean;
  /**
   * Quais campos o padrão geral define. Ausente (backend sem o campo) = tratar como
   * definido: `country/currency/language` acima já são o valor que vale.
   */
  has?: { country: boolean; currency: boolean; language: boolean };
}

export interface RegionState {
  /** Efetiva (empresa → padrão geral → BR/BRL/pt). */
  country: string;
  currency: string;
  language: string;
  /** A empresa ou o padrão geral definem idioma: só então a tela usa os textos da Região. */
  languageConfigured: boolean;
  /** Colunas cruas da empresa (null = herda o padrão geral). */
  own: { regionCountry: string | null; regionCurrency: string | null; regionLanguage: string | null };
  defaults: RegionDefaultsState;
  /** O backend conhece a Região (devolveu `regionEffective`). False = backend antigo. */
  supported: boolean;
}

export const FALLBACK_REGION: RegionState = {
  country: DEFAULT_COUNTRY,
  currency: DEFAULT_CURRENCY,
  language: "pt",
  languageConfigured: false,
  own: { regionCountry: null, regionCurrency: null, regionLanguage: null },
  defaults: { country: DEFAULT_COUNTRY, currency: DEFAULT_CURRENCY, language: "pt", configured: false },
  supported: false,
};

/**
 * Monta o estado da Região a partir da linha do `GET /tenants/:id` (ou da resposta
 * do PUT /tenantsRegion). Sem `regionEffective` (backend antigo) → null: quem chama
 * mantém o FALLBACK_REGION e esconde as telas novas.
 */
export function regionStateFromTenant(row: unknown): RegionState | null {
  const r = (row || {}) as Record<string, unknown>;
  const eff = r.regionEffective as Record<string, unknown> | undefined;
  if (!eff || typeof eff !== "object") return null;
  const def = (r.regionDefaults as Record<string, unknown> | undefined) || {};
  const str = (v: unknown, fb: string) => (typeof v === "string" && v ? v : fb);
  const own = (v: unknown) => (typeof v === "string" && v ? v : null);
  const has = def.has && typeof def.has === "object" ? (def.has as Record<string, unknown>) : null;
  return {
    country: str(eff.country, DEFAULT_COUNTRY),
    currency: str(eff.currency, DEFAULT_CURRENCY),
    language: str(eff.language, "pt"),
    languageConfigured: eff.languageConfigured === true,
    own: {
      regionCountry: own(r.regionCountry),
      regionCurrency: own(r.regionCurrency),
      regionLanguage: own(r.regionLanguage),
    },
    defaults: {
      country: str(def.country, DEFAULT_COUNTRY),
      currency: str(def.currency, DEFAULT_CURRENCY),
      language: str(def.language, "pt"),
      configured: def.configured === true,
      ...(has
        ? { has: { country: has.country === true, currency: has.currency === true, language: has.language === true } }
        : {}),
    },
    supported: true,
  };
}

/** Troca `{x}` por vars.x; `{{x}}` (variável do fluxo) fica literal. */
export function interpolateRegionText(template: string, vars?: Record<string, string | number | null | undefined>): string {
  if (!vars) return template;
  return template.replace(/\{\{[^{}]*\}\}|\{(\w+)\}/g, (match, name) => {
    if (!name) return match;
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}
