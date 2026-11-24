import type { ERPNonBuyersQuery } from "../lib/erp-online";
import { salesReportQuery, type SalesSelection } from "./erp-sales-report";
/** A tela existente escolhe o mês por Emissão; não interpreta intervalo entre meses
 * como ausência de compra em apenas um deles, nem completa datas inválidas.
 */
export function nonBuyersQuery(
  filters: SalesSelection,
  defaultMonth: string,
): Omit<ERPNonBuyersQuery, "offset" | "limit"> {
  const sale = salesReportQuery(filters, "nenhum");
  let month = filters.from?.slice(0, 7) || filters.to?.slice(0, 7) || defaultMonth;
  for (const day of [filters.from, filters.to])
    if (
      day &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(Date.parse(day + "T00:00:00Z")) ||
        new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day ||
        day.slice(0, 7) !== month)
    )
      month = "invalid";
  if (filters.from && filters.to && filters.from > filters.to) month = "invalid";
  return {
    resource: "customers",
    month,
    ...(sale.customerId !== undefined ? { customerId: sale.customerId } : {}),
    ...(sale.sellerCode !== undefined ? { sellerCode: sale.sellerCode } : {}),
    ...(sale.status !== undefined ? { status: sale.status } : {}),
  };
}
