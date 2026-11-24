// Contrato puro de ordenação; não importa SDK, estado da aplicação ou backend.
export type ERPSortKey =
  | "code"
  | "name"
  | "city"
  | "state"
  | "seller"
  | "blocked"
  | "source"
  | "icon"
  | "category"
  | "unit"
  | "price";
export type ERPDirection = "asc" | "desc";
type OrderRow = Record<string, unknown>;
type SortValue = string | number | null;
const accents = "ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ";
const replacements = "AAAAAEEEEIIIIOOOOOUUUUCN";
/** Equivalente a ASCIISTR(TRANSLATE(UPPER(...))) por unidades UTF-16. */
export function foldERPText(value: string): string {
  const upper = value.toUpperCase();
  let result = "";
  for (let i = 0; i < upper.length; i++) {
    const char = upper[i]!,
      index = accents.indexOf(char);
    const translated = index < 0 ? char : replacements[index]!;
    const code = translated.charCodeAt(0);
    result += code <= 127 ? translated : "\\" + code.toString(16).toUpperCase().padStart(4, "0");
  }
  return result;
}
function codeValue(value: unknown): SortValue {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value);
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text))) return Number(text);
  return foldERPText(text);
}
function primary(row: OrderRow, key: ERPSortKey): SortValue {
  if (Object.hasOwn(row, "_sortValue")) {
    const value = row["_sortValue"];
    if (value === undefined || value === null || value === "") return null;
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string"
        ? value
        : null;
  }
  const value = row[key];
  if (key === "code") return codeValue(value);
  if (value === undefined || value === null || value === "") return null;
  if (key === "blocked" || key === "price") {
    const number = typeof value === "boolean" ? Number(value) : Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return foldERPText(String(value));
}
function isERP(row: OrderRow): boolean {
  const erp = row["erp"];
  return (
    row["source"] === "sankhya" ||
    (typeof row["id"] === "string" && row["id"].startsWith("sankhya:")) ||
    !!(erp && typeof erp === "object" && "source" in erp && erp.source === "sankhya")
  );
}
function compareValue(a: SortValue, b: SortValue, direction: number): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a !== typeof b) return (typeof a === "number" ? -1 : 1) * direction;
  return (a < b ? -1 : 1) * direction;
}
/** NULLS LAST nos dois sentidos; sort estável preserva a ordem entre locais empatados. */
export function compareERP(key: ERPSortKey, dir: ERPDirection = "asc") {
  const direction = dir === "desc" ? -1 : 1;
  return (a: OrderRow, b: OrderRow): number => {
    const order = compareValue(primary(a, key), primary(b, key), direction);
    if (order) return order;
    const aERP = isERP(a),
      bERP = isERP(b);
    if (aERP !== bERP) return aERP ? 1 : -1;
    return aERP ? compareValue(codeValue(a["code"]), codeValue(b["code"]), direction) : 0;
  };
}
