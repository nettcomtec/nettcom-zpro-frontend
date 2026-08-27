// Helpers para birthdayDate de contato. O campo pode chegar do backend em
// formatos diferentes dependendo de como foi gravado historicamente:
//   - "YYYY-MM-DD"
//   - ISO completo "YYYY-MM-DDTHH:mm:ss.sssZ"
//   - JS Date.toString() em inglês ("Fri Apr 06 1984 21:00:00 GMT-0300 (Brasilia Standard Time)")
// Estes helpers normalizam todos os 3 casos sem shift de fuso (parse como
// data LOCAL pra YYYY-MM-DD, evitando o bug pt-BR "1 dia antes").

export function parseBirthday(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Datas com barra/traço (A/B/AAAA). Espelha o back (utils/birthdayDateZPRO):
  // 1a parte e mes valido (<=12) -> MM/DD (igual ao new Date dos casos ambiguos);
  // senao DD/MM (BR). Sem isso, "25/12/1990" (dia>12) e "15-06-1990" caem no
  // new Date abaixo como Invalid Date -> null -> idade "—" e somem do filtro.
  const dm = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dm) {
    const a = Number(dm[1]);
    const b = Number(dm[2]);
    let year = Number(dm[3]);
    if (dm[3].length === 2) year = year <= 49 ? 2000 + year : 1900 + year;
    const month = a >= 1 && a <= 12 ? a : b;
    const day = a >= 1 && a <= 12 ? b : a;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
    return null;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatBirthdayDisplay(
  raw: string | null | undefined,
  fallback: string = "—",
): string {
  const d = parseBirthday(raw);
  if (!d) return raw ? String(raw) : fallback;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Valor pra <input type="date"> — sempre YYYY-MM-DD.
export function formatBirthdayInput(raw: string | null | undefined): string {
  const d = parseBirthday(raw);
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function calculateAge(raw: string | null | undefined): number | null {
  const birth = parseBirthday(raw);
  if (!birth) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function daysUntilBirthday(raw: string | null | undefined): number {
  const birth = parseBirthday(raw);
  if (!birth) return 999;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
  }
  return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
