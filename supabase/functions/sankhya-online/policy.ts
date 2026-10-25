import { SankhyaError } from './gateway.ts';

// Definições expressas pelo usuário em 23/10/2026, 19h19 (America/Sao_Paulo).
// Aplicam-se ao contexto do pedido; não alteram cadastro, carteira ou identidade.
export const COMMERCIAL_POLICY = Object.freeze({
  sharedPartnerCompany: 1 as const,
  saleOperationByCompany: Object.freeze({ 1: 1001, 4: 1001 }),
});

// Recorte dos relatórios confirmado em24/10/2026 às18h42 (America/Sao_Paulo).
// Não altera a política de criação/cotação de pedidos acima.
export const STANDARD_SALES_REPORT_POLICY = Object.freeze({
  movement: 'P' as const,
  operationCode: 1001 as const,
  natureCode: 10100000 as const,
  statusCode: 'L' as const,
  bonification: 'N' as const,
  devolution: 1 as const,
  dateField: 'DTNEG' as const,
});

// Faturamento confirmado em25/10/2026 às05h57 (America/Sao_Paulo).
// Notas V e pedidos P permanecem bases separadas; vínculo não soma os documentos.
export const STANDARD_BILLING_REPORT_POLICY = Object.freeze({
  movement: 'V' as const,
  dateField: 'DTFATUR' as const,
  statusCode: 'L' as const,
  fiscalStatusCode: 'A' as const,
  salesSignal: -1 as const,
  bonification: 'N' as const,
  devolution: 1 as const,
  origin: STANDARD_SALES_REPORT_POLICY,
});

// Conceitos confirmados em25/10/2026 às07h25 (America/Sao_Paulo).
export const CUSTOMER_INDICATOR_POLICY = Object.freeze({
  newCustomer: Object.freeze({ event: 'first-recorded-standard-purchase' as const, dateField: 'DTNEG' as const, origin: STANDARD_SALES_REPORT_POLICY }),
  activeCustomer: Object.freeze({ field: 'TGFPAR.ATIVO' as const, value: 'S' as const, ownership: 'current-CODVEND' as const, purchaseRequired: false }),
  coverage: Object.freeze({ source: 'workspace_records' as const, kind: 'activities' as const, status: 'Realizada' as const, dateField: 'data.date' as const, distinctCustomers: true, denominator: 'active-current-wallet' as const }),
});

export function partnerCompany(code: unknown): 1 | 4 {
  if (code === null) return COMMERCIAL_POLICY.sharedPartnerCompany;
  if (code === 1 || code === 4) return code;
  throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Filial fora do escopo autorizado.', 403);
}
export function saleOperation(company: unknown, type: unknown): number {
  if (type !== 'Venda' || (company !== 1 && company !== 4)) {
    throw new SankhyaError('ERP_CONTEXT_REQUIRED', 'Tipo de pedido sem contexto comercial ERP definido.', 400);
  }
  return COMMERCIAL_POLICY.saleOperationByCompany[company];
}
