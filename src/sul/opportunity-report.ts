import type { ERPRow } from "../lib/erp-online";
import { completionOwners, filterCompletions } from "./completion-report";

/** Oportunidades locais já isoladas pelo servidor; não converte ganho em venda ERP. */
export function opportunityReportRows(source: {
  opportunities: ERPRow[];
  customers: ERPRow[];
}): ERPRow[] {
  const names = new Map(source.customers.map((row) => [row["id"], row["name"]]));
  return source.opportunities.map((row) => ({ ...row, customer: names.get(row["customerId"]) }));
}
// Mesmos guardas de IDs e data declarada, sem a seleção Realizada da outra coleção.
export const filterOpportunityRows = filterCompletions;
export const opportunityReportOwners = completionOwners;
