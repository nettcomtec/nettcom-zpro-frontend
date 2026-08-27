"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Country data: [iso2, dialCode, name]
// ---------------------------------------------------------------------------
const COUNTRIES: [string, string, string][] = [
  ["BR", "55", "Brasil"],
  ["US", "1", "United States"],
  ["GB", "44", "United Kingdom"],
  ["PT", "351", "Portugal"],
  ["AR", "54", "Argentina"],
  ["MX", "52", "México"],
  ["CO", "57", "Colombia"],
  ["CL", "56", "Chile"],
  ["PE", "51", "Peru"],
  ["VE", "58", "Venezuela"],
  ["BO", "591", "Bolívia"],
  ["EC", "593", "Equador"],
  ["PY", "595", "Paraguai"],
  ["UY", "598", "Uruguai"],
  ["DE", "49", "Alemanha"],
  ["FR", "33", "França"],
  ["ES", "34", "Espanha"],
  ["IT", "39", "Itália"],
  ["NL", "31", "Holanda"],
  ["BE", "32", "Bélgica"],
  ["CH", "41", "Suíça"],
  ["AT", "43", "Áustria"],
  ["PL", "48", "Polônia"],
  ["SE", "46", "Suécia"],
  ["NO", "47", "Noruega"],
  ["DK", "45", "Dinamarca"],
  ["FI", "358", "Finlândia"],
  ["IE", "353", "Irlanda"],
  ["GR", "30", "Grécia"],
  ["RU", "7", "Rússia"],
  ["UA", "380", "Ucrânia"],
  ["TR", "90", "Turquia"],
  ["IN", "91", "Índia"],
  ["CN", "86", "China"],
  ["JP", "81", "Japão"],
  ["KR", "82", "Coreia do Sul"],
  ["ID", "62", "Indonésia"],
  ["PH", "63", "Filipinas"],
  ["TH", "66", "Tailândia"],
  ["VN", "84", "Vietnam"],
  ["MY", "60", "Malásia"],
  ["SG", "65", "Singapura"],
  ["PK", "92", "Paquistão"],
  ["BD", "880", "Bangladesh"],
  ["AU", "61", "Austrália"],
  ["NZ", "64", "Nova Zelândia"],
  ["ZA", "27", "África do Sul"],
  ["NG", "234", "Nigéria"],
  ["EG", "20", "Egito"],
  ["MA", "212", "Marrocos"],
  ["KE", "254", "Quênia"],
  ["GH", "233", "Gana"],
  ["AO", "244", "Angola"],
  ["MZ", "258", "Moçambique"],
  ["IL", "972", "Israel"],
  ["SA", "966", "Arábia Saudita"],
  ["AE", "971", "Emirados Árabes"],
  ["QA", "974", "Catar"],
  ["CA", "1", "Canadá"],
  ["MX", "52", "México"],
  ["CR", "506", "Costa Rica"],
  ["PA", "507", "Panamá"],
  ["CU", "53", "Cuba"],
  ["DO", "1809", "República Dominicana"],
  ["HT", "509", "Haiti"],
  ["GT", "502", "Guatemala"],
  ["BZ", "501", "Belize"],
  ["HN", "504", "Honduras"],
  ["SV", "503", "El Salvador"],
  ["NI", "505", "Nicarágua"],
  ["JM", "1876", "Jamaica"],
];

// Remove duplicates by iso2+dialCode
const UNIQUE_COUNTRIES = COUNTRIES.filter(
  (c, i, arr) => arr.findIndex((x) => x[0] === c[0] && x[1] === c[1]) === i
);

// Sort: longer dial codes first (to match most specific prefix on parse)
const SORTED_BY_DIAL_LEN = [...UNIQUE_COUNTRIES].sort(
  (a, b) => b[1].length - a[1].length
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function flagEmoji(iso2: string): string {
  return [...iso2.toUpperCase()]
    .map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
    .join("");
}

/** Resolve a country tuple by ISO2 (e.g. "BR", "ar"). Falls back to Brazil. */
function countryForIso(iso?: string | null): [string, string, string] {
  if (iso) {
    const found = UNIQUE_COUNTRIES.find((c) => c[0] === iso.toUpperCase());
    if (found) return found;
  }
  return UNIQUE_COUNTRIES[0]; // Brazil
}

/**
 * Given a raw number string (e.g. "5511999999999"), detect which country dial
 * code is the prefix. Returns [country, localPart]. When the value is empty or
 * no dial code matches, falls back to `defaultIso` (or Brazil).
 */
function parseNumberToCountry(
  raw: string | null | undefined,
  defaultIso?: string | null
): [[string, string, string], string] {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits) {
    for (const country of SORTED_BY_DIAL_LEN) {
      if (digits.startsWith(country[1])) {
        return [country, digits.slice(country[1].length)];
      }
    }
  }
  return [countryForIso(defaultIso), digits];
}

/** Format local number visually with spaces: e.g. "11999999999" → "11 99999-9999" */
function formatLocal(local: string): string {
  const d = local.replace(/\D/g, "");
  if (d.length === 0) return "";
  // Generic grouping: area(2) + up to 5 + up to 4
  if (d.length <= 2) return d;
  if (d.length <= 7) return `${d.slice(0, 2)} ${d.slice(2)}`;
  if (d.length <= 11) return `${d.slice(0, 2)} ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  return d; // too long, show raw
}

// ---------------------------------------------------------------------------
// PhoneInput component
// ---------------------------------------------------------------------------
export interface PhoneInputProps {
  value?: string | null; // full normalized number, e.g. "5511999999999"
  onChange?: (value: string) => void; // called with full normalized number
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  defaultCountry?: string; // ISO2 (e.g. "BR", "AR") — initial country when value is empty
}

export function PhoneInput({
  value: rawValue,
  onChange,
  placeholder,
  className,
  disabled,
  defaultCountry,
}: PhoneInputProps) {
  const value = rawValue ?? "";
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Parse initial value into (country, localPart)
  const parsed = React.useMemo(() => parseNumberToCountry(value, defaultCountry), [value, defaultCountry]);
  const [selectedCountry, setSelectedCountry] = React.useState<[string, string, string]>(parsed[0]);
  const [localNumber, setLocalNumber] = React.useState(parsed[1]);

  // Sync when value changes externally (e.g. form.reset)
  const prevValue = React.useRef(value);
  React.useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value;
      const [c, local] = parseNumberToCountry(value, defaultCountry);
      setSelectedCountry(c);
      setLocalNumber(local);
    }
  }, [value, defaultCountry]);

  // When the default country arrives/changes and no number was typed yet,
  // adopt it as the selected country (per-page multi-country default).
  React.useEffect(() => {
    if (!value.replace(/\D/g, "")) {
      setSelectedCountry(countryForIso(defaultCountry));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCountry]);

  // Focus search when popover opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  const filtered = UNIQUE_COUNTRIES.filter(
    (c) =>
      c[2].toLowerCase().includes(search.toLowerCase()) ||
      c[1].includes(search) ||
      c[0].toLowerCase().includes(search.toLowerCase())
  );

  function handleCountrySelect(country: [string, string, string]) {
    setSelectedCountry(country);
    setOpen(false);
    // Rebuild full value
    const digits = localNumber.replace(/\D/g, "");
    onChange?.(country[1] + digits);
  }

  function handleLocalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "");
    setLocalNumber(digits);
    onChange?.(selectedCountry[1] + digits);
  }

  const displayValue = formatLocal(localNumber);

  return (
    <div className={cn("flex h-9 rounded-md border border-input bg-background shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-ring/40 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20", className)}>
      {/* Country selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="flex items-center gap-1.5 pl-3 pr-2 text-sm border-r border-input hover:bg-accent transition-colors rounded-l-md focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-base leading-none">{flagEmoji(selectedCountry[0])}</span>
            <span className="text-muted-foreground tabular-nums">+{selectedCountry[1]}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          {/* Search */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar país ou DDI..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {/* Country list */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhum país encontrado</p>
            )}
            {filtered.map((country) => (
              <button
                key={country[0] + country[1]}
                type="button"
                onClick={() => handleCountrySelect(country)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
                  selectedCountry[0] === country[0] && selectedCountry[1] === country[1] && "bg-accent"
                )}
              >
                <span className="text-base">{flagEmoji(country[0])}</span>
                <span className="flex-1 truncate">{country[2]}</span>
                <span className="text-muted-foreground tabular-nums text-xs">+{country[1]}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Number input */}
      <input
        type="tel"
        inputMode="numeric"
        disabled={disabled}
        value={displayValue}
        onChange={handleLocalChange}
        placeholder={placeholder ?? "11 99999-9999"}
        className="flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 rounded-r-md"
      />
    </div>
  );
}
