import { SankhyaError } from './gateway.ts';

// Definições expressas pelo usuário em 23/10/2026, 19h19 (America/Sao_Paulo).
// Aplicam-se ao contexto do pedido; não alteram cadastro, carteira ou identidade.
export const COMMERCIAL_POLICY = Object.freeze({
  sharedPartnerCompany: 1 as const,
  saleOperationByCompany: Object.freeze({ 1: 1001, 4: 1001 }),
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
