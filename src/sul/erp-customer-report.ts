import type { ERPPageQuery, ERPRow } from '../lib/erp-online';
import { manualRows } from './erp-hooks';

export type CustomerReportSelection = { customer?: string; seller?: string; status?: string };
const code = (id: string, kind: 'customer' | 'seller'): number => {
  const value = new RegExp(`^sankhya:${kind}:([1-9]\\d*)$`).exec(id)?.[1];
  // Nunca retirar silenciosamente um filtro inválido e consultar a carteira inteira.
  return value ? Number(value) : NaN;
};
export function customerReportFilters(selection: CustomerReportSelection): NonNullable<ERPPageQuery['filters']> {
  return {
    active: (selection.status || 'all') as 'S' | 'N' | 'all',
    ...(selection.customer ? { customerCode: code(selection.customer, 'customer') } : {}),
    ...(selection.seller ? { sellerCode: code(selection.seller, 'seller') } : {}),
  };
}
export function localCustomerReportRows(rows: ERPRow[], selection: CustomerReportSelection): ERPRow[] {
  return manualRows(rows).filter(row =>
    (!selection.customer || row['id'] === selection.customer) &&
    (!selection.seller || row['sellerCode'] === code(selection.seller, 'seller')) &&
    (!selection.status || selection.status === 'S' && row['active'] === true || selection.status === 'N' && row['active'] === false));
}
export function remoteCustomerReport(selection: CustomerReportSelection): boolean {
  return !selection.customer || selection.customer.startsWith('sankhya:customer:');
}
