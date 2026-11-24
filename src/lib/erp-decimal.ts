// Totais nativos textuais. Não usa ponto flutuante nem altera valores persistidos.
export function erpDecimal(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const n = value.startsWith("-.")
    ? "-0" + value.slice(1)
    : value.startsWith(".")
      ? "0" + value
      : value;
  return /^-?(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(n) && n.length <= 40 ? n : null;
}
export function decimalUnits(value: string): bigint {
  const n = erpDecimal(value);
  if (n === null) throw new RangeError("Decimal ERP inválido.");
  const negative = n.startsWith("-"),
    [whole, fraction = ""] = (negative ? n.slice(1) : n).split(".");
  const units = BigInt(whole!) * 1000000000n + BigInt(fraction.padEnd(9, "0"));
  return negative ? -units : units;
}
export function sumERPDecimals(values: readonly string[]): string {
  const units = values.reduce((sum, value) => sum + decimalUnits(value), 0n),
    absolute = units < 0n ? -units : units;
  const fraction = String(absolute % 1000000000n)
    .padStart(9, "0")
    .replace(/0+$/, "");
  return `${units < 0n ? "-" : ""}${absolute / 1000000000n}${fraction ? "." + fraction : ""}`;
}
/** Participação racional, arredondada apenas para a apresentação existente sem casas. */
export function formatERPShare(value: unknown, total: unknown): string | null {
  if (erpDecimal(value) === null || erpDecimal(total) === null) return null;
  const numerator = decimalUnits(value as string) * 100n,
    denominator = decimalUnits(total as string);
  if (denominator === 0n) return null;
  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator,
    d = denominator < 0n ? -denominator : denominator;
  const rounded = (2n * a + d) / (2n * d);
  return `${negative ? "-" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(rounded)}%`;
}
/** Mantém as zero casas existentes da tabela; CSV/DTO continuam textuais e exatos. */
export function formatERPQuantity(value: unknown): string | null {
  if (erpDecimal(value) === null) return null;
  const units = decimalUnits(value as string),
    absolute = units < 0n ? -units : units;
  return `${units < 0n ? "-" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format((absolute + 500000000n) / 1000000000n)}`;
}
/** Arredondamento exclusivamente de apresentação (duas casas), inclusive ticket racional. */
export function formatERPAmount(value: unknown, divisor = 1): string | null {
  if (erpDecimal(value) === null || !Number.isSafeInteger(divisor) || divisor < 1) return null;
  const units = decimalUnits(value as string),
    absolute = units < 0n ? -units : units;
  const denominator = BigInt(divisor) * 10000000n;
  const cents = (absolute + denominator / 2n) / denominator;
  const whole = String(cents / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${units < 0n && cents !== 0n ? "-" : ""}R$ ${whole},${String(cents % 100n).padStart(2, "0")}`;
}
