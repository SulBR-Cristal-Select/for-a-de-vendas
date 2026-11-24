/** Calendário seg–sex, sem feriados: não há calendário de feriados confirmado. */
export function businessDate(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
function countBusinessDays(month: string, from: number, until: number): number {
  const [year, number] = month.split("-").map(Number) as [number, number];
  let count = 0;
  for (let day = from; day <= until; day++) {
    const date = new Date(0);
    date.setUTCFullYear(year, number - 1, day);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}
function validMonth(month: string): boolean {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) && Number(month.slice(0, 4)) > 0;
}
function lastDay(month: string): number {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const date = new Date(0);
  date.setUTCFullYear(year, number, 0);
  return date.getUTCDate();
}
export function monthBusinessDays(month: string): number {
  return validMonth(month) ? countBusinessDays(month, 1, lastDay(month)) : 0;
}
/** Restantes incluindo hoje, mantido para os consumidores desse contrato. */
export function remainingBusinessDays(month: string, now = new Date()): number | null {
  const today = businessDate(now);
  return validMonth(month) && today.slice(0, 7) === month
    ? countBusinessDays(month, Number(today.slice(8)), lastDay(month))
    : null;
}
/** Hoje incluído no acumulado; mês fechado integral, mês futuro ainda sem dias decorridos. */
export function elapsedBusinessDays(month: string, now = new Date()): number {
  if (!validMonth(month)) return 0;
  const today = businessDate(now);
  if (month < today.slice(0, 7)) return monthBusinessDays(month);
  if (month > today.slice(0, 7)) return 0;
  return countBusinessDays(month, 1, Number(today.slice(8)));
}
export function proratedMonthlyTarget(
  target: number | null,
  month: string,
  now = new Date(),
): number | null {
  const total = monthBusinessDays(month);
  if (target === null || !Number.isFinite(target) || target < 0 || total === 0) return null;
  const elapsed = elapsedBusinessDays(month, now);
  if (elapsed === total) return target;
  return Math.round((target * 100 * elapsed) / total) / 100;
}
