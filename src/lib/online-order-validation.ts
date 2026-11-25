import { erpDecimal, decimalUnits } from "./erp-decimal.ts";
/** Contrato estrutural local e de revalidação; nunca substitui a cotação no servidor. */
export function validateOnlineOrderShape(
  order: Record<string, unknown>,
  requireContext = true,
): void {
  const date = order["date"];
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number(date.slice(0, 4)) < 1 ||
    !Number.isFinite(Date.parse(date + "T00:00:00Z")) ||
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date
  )
    throw new Error("Data do pedido inválida.");
  if (requireContext) {
    const erp = order["erp"] as Record<string, unknown> | undefined;
    if (!erp || erp["companyCode"] !== 1) throw new Error("Somente filial 1 está habilitada.");
  }
  const items = order["items"];
  if (!Array.isArray(items) || items.length < 1 || items.length > 50)
    throw new Error("Pedido deve conter de um a cinquenta itens.");
  const ids = new Set<string>();
  for (const value of items) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Item ERP inválido.");
    const item = value as Record<string, unknown>,
      id = item["productId"];
    if (typeof id !== "string" || !/^sankhya:product:[1-9]\d*$/.test(id) || ids.has(id))
      throw new Error("Produto ERP ausente, misturado ou duplicado.");
    ids.add(id);
    const qty = item["qty"],
      price = item["price"],
      unit = item["unit"];
    const exact = (n: unknown, decimals: number, max: number) =>
      typeof n === "number" &&
      Number.isFinite(n) &&
      n > 0 &&
      n <= max &&
      erpDecimal(String(n)) !== null &&
      decimalUnits(String(n)) % 10n ** BigInt(9 - decimals) === 0n;
    if (
      !exact(qty, 5, 100000000) ||
      !exact(price, 2, 10000000000) ||
      typeof unit !== "string" ||
      unit.trim().length < 1 ||
      unit.length > 6
    )
      throw new Error("Quantidade, preço ou unidade fora do contrato ERP.");
  }
}
