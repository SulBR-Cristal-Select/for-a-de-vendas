import { describe, expect, it } from 'vitest';
import { COMMERCIAL_POLICY, partnerCompany, saleOperation } from '../../supabase/functions/sankhya-online/policy';

describe('Definições comerciais expressas, sem remapear cadastro ou carteira', () => {
  it('usa filial 1 apenas para CODEMP explicitamente nulo', () => {
    expect(partnerCompany(null)).toBe(1);
    expect(partnerCompany(1)).toBe(1);
    expect(partnerCompany(4)).toBe(4);
  });
  it.each([3, 2, 0, undefined, '1', false])('não transforma %s em compartilhado', value => {
    expect(() => partnerCompany(value)).toThrow('escopo');
  });
  it('usa TOP1001 para Venda nas duas filiais por escolha explícita, não por frequência', () => {
    expect(saleOperation(1, 'Venda')).toBe(1001);
    expect(saleOperation(4, 'Venda')).toBe(1001);
    expect(Object.isFrozen(COMMERCIAL_POLICY.saleOperationByCompany)).toBe(true);
  });
  it.each(['Bonificação', 'Venda - Cupom Fiscal', 'Venda - Raslog', '', undefined])('não amplia a autorização para %s', type => {
    expect(() => saleOperation(1, type)).toThrow('contexto');
  });
  it('não aceita a empresa tenant como filial ERP', () => {
    expect(() => saleOperation(432299, 'Venda')).toThrow();
  });
});
