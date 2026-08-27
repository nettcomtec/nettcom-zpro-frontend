/**
 * Helpers de data para `closingForecast` (previsão de fechamento das oportunidades).
 *
 * `closingForecast` representa um DIA no calendário, não um instante: é gravado
 * como meia-noite UTC do dia escolhido e sempre renderizado em UTC
 * (`formatDateUTC` no kanban, `sameUTCDate` no calendário).
 *
 * Comparar esse valor com `new Date()` local desloca o dia em 1 para fusos
 * negativos (Brasil = UTC-3), fazendo o alerta dizer "hoje" para uma data que
 * o card exibe como amanhã. As funções abaixo normalizam ambos os lados para
 * um "dia civil" antes de comparar.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Dia civil de um valor gravado em UTC (closingForecast). */
export function civilDayFromUTC(value?: string | Date | null): number | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Dia civil de um Date interpretado no fuso do usuário (hoje, célula do calendário). */
export function civilDayFromLocal(date: Date = new Date()): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Dias inteiros até a previsão de fechamento.
 * 0 = vence hoje, 1 = amanhã, negativo = vencida. `null` quando não há data.
 */
export function daysUntilClosing(
  value?: string | Date | null,
  now: Date = new Date()
): number | null {
  const forecast = civilDayFromUTC(value);
  if (forecast === null) return null;
  return Math.round((forecast - civilDayFromLocal(now)) / MS_PER_DAY);
}

/** `closingForecast` gravado -> "YYYY-MM-DD" para `<input type="date">`. */
export function closingForecastToDateInput(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

/** "YYYY-MM-DD" do `<input type="date">` -> ISO em meia-noite UTC para gravar. */
export function dateInputToClosingForecastISO(dateInput?: string | null): string | null {
  if (!dateInput) return null;
  const [y, m, d] = dateInput.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toISOString();
}
