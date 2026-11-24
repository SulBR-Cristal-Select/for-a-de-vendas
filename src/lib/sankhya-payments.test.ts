import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readEligiblePayment, readPaymentOptions, readPaymentRules } from '../../supabase/functions/sankhya-online/payments';
import { readRecord } from '../../supabase/functions/sankhya-online/read-model';
vi.mock('../../supabase/functions/sankhya-online/read-model', async original => ({ ...await original<Record<string, unknown>>(), readRecord: vi.fn() }));
const scope = { role: 'administrador' as const }, context = { partnerCode: 99000001, companyCode: 1 as const, date: '2026-10-23', creditBlocked: false };
const option = { CODTIPVENDA: 29, DESCRTIPVENDA: 'Condição sintética', ATIVO: 'S', CODTAB: null, VERSION: '2026-06-10T11:47:42', SUBTIPOVENDA: '2' };
const installment = { SEQUENCIA: 1, PRAZO: 21, PERCENTUAL: 100, CODEMP: 1, CODPARC: 0, TIPOEMP: 'E', TIPOPAR: 'N', BASEPRAZO: -1, VENCNAOUTIL: 0, SOMAPRAZOCLIENTE: 'N', HASFORMULA: 0 };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(readRecord).mockResolvedValue({ source: 'sankhya', readOnly: true, readAt: '2026-10-23T22:00:00Z', record: { id: 'sankhya:customer:99000001', active: true, erp: { partnerCode: 99000001, companyCode: 1, creditBlocked: false } } } as any); });
describe('Condições por parceiro e contexto, não lista global ativa', () => {
  it('usa grupo de autorização e versão não futura, sem filtrar filial por PPG.CODEMP', async () => {
    const g = { select: vi.fn().mockResolvedValue([option]) };
    expect(await readEligiblePayment(g, context, 29, scope)).toMatchObject({ code: 29, isCredit: true, tableCode: null });
    const sql = g.select.mock.calls[0]![0];
    expect(sql).toContain('INSTR(C.GRUPOAUTOR,TRIM(T.GRUPOAUTOR))>0');
    expect(sql).toContain('C.CODEMP=1'); expect(sql).toContain('OR C.CODEMP IS NULL');
    expect(sql).toContain('V.DHALTER<=LEAST(SYSDATE');
    expect(sql).not.toContain('G.CODEMP=4');
  });
  it('não inventa elegibilidade, nem classificação à vista para crédito desconhecido', async () => {
    const g = { select: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...option, SUBTIPOVENDA: '7' }]) };
    await expect(readEligiblePayment(g, context, 29, scope)).rejects.toMatchObject({ code: 'ERP_PAYMENT_SCOPE_UNAVAILABLE' });
    expect((await readEligiblePayment(g, context, 29, scope)).isCredit).toBeNull();
  });
  it('recusa prazo para parceiro bloqueado mesmo diante de resposta incompatível', async () => {
    const g = { select: vi.fn().mockResolvedValue([option]) };
    await expect(readEligiblePayment(g, { ...context, creditBlocked: true }, 29, scope)).rejects.toMatchObject({ code: 'ERP_PAYMENT_SCOPE_UNAVAILABLE' });
    expect(g.select.mock.calls[0]![0]).toContain("T.SUBTIPOVENDA='1'");
  });
  it('não completa subtipo, tabela ausente ou código de retorno diferente', async () => {
    for (const row of [{ ...option, SUBTIPOVENDA: null }, { ...option, CODTAB: undefined }, { ...option, CODTIPVENDA: 30 }]) {
      await expect(readEligiblePayment({ select: vi.fn().mockResolvedValue([row]) }, context, 29, scope)).rejects.toThrow();
    }
  });
  it('pagina opções com totais consistentes e busca normalizada no servidor', async () => {
    const g = { select: vi.fn().mockResolvedValueOnce([{ TOTAL: 12 }]).mockResolvedValueOnce([{ TOTAL: 1 }]).mockResolvedValueOnce([option]) };
    const r = await readPaymentOptions(g, { customerId: 'sankhya:customer:99000001', offset: 0, limit: 10, search: 'são_%', date: context.date }, scope);
    expect(r).toMatchObject({ total: 1, totalWithoutSearch: 12, offset: 0 });
    expect(r.items[0]).toMatchObject({ id: 'sankhya:payment:29', code: 29 });
    expect(g.select.mock.calls[1]![0]).toContain('SAO!_!%');
    expect(g.select.mock.calls[2]![1]).toBe(10);
  });
  it('não retorna primeira página parcial como lista completa', async () => {
    const g = { select: vi.fn().mockResolvedValueOnce([{ TOTAL: 2 }]).mockResolvedValueOnce([option]) };
    await expect(readPaymentOptions(g, { customerId: 'sankhya:customer:99000001', offset: 0, limit: 10 }, scope)).rejects.toMatchObject({ code: 'ERP_INVALID_RESPONSE' });
  });
  it('bloqueia filial3 e identidade ERP não configurada antes da consulta', async () => {
    const g = { select: vi.fn() };
    await expect(readEligiblePayment(g, { ...context, companyCode: 3 } as any, 29, scope)).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    await expect(readEligiblePayment(g, context, 29, { role: 'gestor' })).rejects.toMatchObject({ code: 'ERP_IDENTITY_REQUIRED' });
    expect(g.select).not.toHaveBeenCalled();
  });
});
describe('Parcelas originais sem financeiro ou correção por suposição', () => {
  it('preserva soma99,99, empresa literal1 com TIPOEMP E e parceiro literal0 com TIPOPAR N', async () => {
    const g = { select: vi.fn().mockResolvedValueOnce([option]).mockResolvedValueOnce([{ TOTAL: 3 }]).mockResolvedValueOnce([1,2,3].map(n => ({ ...installment, SEQUENCIA: n, PERCENTUAL: 33.33 }))) };
    const result = await readPaymentRules(g, context, 29, scope);
    expect(result.installments.map(p => p['percentage'])).toEqual([33.33,33.33,33.33]);
    expect(result.rules.original[0]).toMatchObject({ companyCode: 1, partnerCode: 0, companyType: 'E', partnerType: 'N' });
    expect(result.rules.financialGenerated).toBe(false);
  });
  it('não executa fórmula nem completa soma insuficiente', async () => {
    for (const row of [{ ...installment, HASFORMULA: 1 }, { ...installment, PERCENTUAL: 99.98 }]) {
      const g = { select: vi.fn().mockResolvedValueOnce([option]).mockResolvedValueOnce([{ TOTAL: 1 }]).mockResolvedValueOnce([row]) };
      await expect(readPaymentRules(g, context, 29, scope)).rejects.toMatchObject({ code: 'ERP_PAYMENT_SCOPE_UNAVAILABLE' });
    }
  });
  it('lê51 parcelas de uma condição em janelas50+1, sem percentuais fabricados', async () => {
    const g = { select: vi.fn().mockResolvedValueOnce([option]).mockResolvedValueOnce([{ TOTAL: 51 }]).mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => ({ ...installment, SEQUENCIA: i+1, PERCENTUAL: 1 }))).mockResolvedValueOnce([{ ...installment, SEQUENCIA: 51, PERCENTUAL: 50 }]) };
    const r = await readPaymentRules(g, context, 29, scope);
    expect(r.installments).toHaveLength(51);
    expect(g.select.mock.calls.map(c => c[1])).toEqual([2,1,50,1]);
  });
});
