import type { ERPSalesQuery } from '../lib/erp-online';
export type SalesSelection = { customer?: string; seller?: string; status?: string; from?: string; to?: string };
export function salesReportQuery(selection: SalesSelection, grouping: string): Omit<ERPSalesQuery, 'resource' | 'offset' | 'limit'> {
  const seller = selection.seller ? /^sankhya:seller:([1-9]\d*)$/.exec(selection.seller)?.[1] : undefined;
  return {
    ...(selection.customer ? { customerId: selection.customer } : {}),
    ...(selection.seller ? { sellerCode: seller ? Number(seller) : NaN } : {}),
    ...(selection.status ? { status: selection.status as 'confirmado' } : {}),
    ...(selection.from ? { from: selection.from } : {}),
    ...(selection.to ? { to: selection.to } : {}),
    ...(grouping !== 'nenhum' ? { groupBy: (grouping === 'vendedor' ? 'seller' : grouping === 'cliente' ? 'customer' : grouping) as 'seller' | 'customer' } : {}),
  };
}
