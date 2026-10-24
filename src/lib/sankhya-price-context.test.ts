import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPrice, exactNativeAmount, currentCommercialDay } from '../../supabase/functions/sankhya-online/price-context';
import { readRecord } from '../../supabase/functions/sankhya-online/read-model';
vi.mock('../../supabase/functions/sankhya-online/read-model', () => ({ readRecord: vi.fn() }));
const query = { customerId: 'sankhya:customer:141', productId: 'sankhya:product:11240', paymentCode: 29, type: 'Venda' as const };
let customer: any, product: any;
function gateway() {
  return {
    select: vi.fn(async (sql: string) => sql.includes('FROM TGFTPV') ? [{ CODTIPVENDA: 29, CODTAB: null, ATIVO: 'S', DESCRTIPVENDA: 'Condição do teste', SUBTIPOVENDA: '2', VERSION: '2026-06-10T11:47:42' }] : sql.includes('TGFEXC') ? [{ CODLOCAL: 0, CONTROLE: ' ' }] : [{ CODTIPOPER: 1001, ATIVO: 'S', TIPMOV: 'P', OPERATION_VERSION: '2026-07-21T08:04:13' }]),
    contextPrices: vi.fn(async () => ({ precos: [{ codigoProduto: 11240, unidade: 'PC', codigoLocalEstoque: 0, controle: ' ', valor: '10.56' }] })),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  customer = { id: query.customerId, active: true, readOnly: true, erp: { source: 'sankhya', partnerCode: 141, companyCode: null, sellerCode: 14, tableCode: 68, creditBlocked: false } };
  product = { id: query.productId, active: true, readOnly: true, unit: 'PC', price: null, erp: { source: 'sankhya', productCode: 11240, quantityDecimals: 5 } };
  vi.mocked(readRecord).mockImplementation(async (_g, q) => ({ source: 'sankhya', readOnly: true, readAt: '2026-10-23T22:00:00Z', record: q.resource === 'customers' ? customer : q.resource === 'products' ? product : { active: true, id: 'sankhya:seller:14', erp: { source: 'sankhya', sellerCode: 14 } } } as any));
});
describe('Preço nativo contextual, nunca preço-base ou catálogo aproximado', () => {
  it('usa filial1 só no contexto compartilhado, TOP1001 e vendedor real, preservando controle espaço', async () => {
    const g = gateway(), result = await readPrice(g, query, { role: 'administrador' });
    expect(result).toMatchObject({ companyCode: 1, operationCode: 1001, price: { amount: 10.56, unit: 'PC', localCode: 0, control: ' ', tableVersion: null } });
    expect(g.contextPrices).toHaveBeenCalledWith({ codigoEmpresa: 1, codigoCliente: 141, codigoVendedor: 14, codigoTipoOperacao: 1001, codigoTipoNegociacao: 29, dataNegociacao: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), produtos: [{ codigoProduto: 11240, unidade: 'PC', quantidade: 1, codigoLocalEstoque: 0, controle: ' ' }] });
    expect(customer.erp.companyCode).toBeNull();
  });
  it('não substitui filial4 do cadastro pela política dos compartilhados', async () => {
    customer.erp.companyCode = 4;
    expect((await readPrice(gateway(), query, { role: 'administrador' })).companyCode).toBe(4);
  });
  it('não remapeia empresa3 nem aceita override de contexto do navegador', async () => {
    const g = gateway(); customer.erp.companyCode = 3;
    await expect(readPrice(g, query, { role: 'administrador' })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    await expect(readPrice(g, { ...query, companyCode: 1 } as any, { role: 'administrador' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it('exige o vendedor ERP existente; não substitui código0 pelo administrador', async () => {
    const g = gateway(); customer.erp.sellerCode = 0;
    await expect(readPrice(g, query, { role: 'administrador' })).rejects.toThrow();
    expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it('não ultrapassa o vínculo explícito de filial e vendedor', async () => {
    const g = gateway();
    await expect(readPrice(g, query, { role: 'vendedor', sellerCode: 14, companyCodes: [4] })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    await expect(readPrice(g, { ...query, sellerCode: 15 }, { role: 'gestor', sellerCode: 14, companyCodes: [1] })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it('não escolhe entre preços duplicados no mesmo contexto nem completa preço ausente', async () => {
    const g = gateway(); g.contextPrices.mockResolvedValueOnce({ precos: [] }).mockResolvedValueOnce({ precos: [{ codigoProduto: 11240, unidade: 'PC', codigoLocalEstoque: 0, controle: ' ', valor: '10.56' }, { codigoProduto: 11240, unidade: 'PC', codigoLocalEstoque: 0, controle: ' ', valor: '12.00' }] });
    await expect(readPrice(g, query, { role: 'administrador' })).rejects.toMatchObject({ code: 'ERP_PRICE_AMBIGUOUS', nativeFormat: { kind: 'empty_prices', context: { candidates: 0 } } });
    await expect(readPrice(g, query, { role: 'administrador' })).rejects.toMatchObject({ code: 'ERP_PRICE_AMBIGUOUS', nativeFormat: { kind: 'context_mismatch', context: { candidates: 2, productMatches: 2 } } });
  });
  it('colapsa apenas repetição integral do objeto e não funde versões nem preços diferentes', async () => {
    const g = gateway(), native = { codigoProduto: 11240, unidade: 'PC', codigoLocalEstoque: 0, controle: ' ', valor: '10.56' };
    g.contextPrices.mockResolvedValueOnce({ precos: [native, { ...native }] });
    expect((await readPrice(g, query, { role: 'administrador' })).price.amount).toBe(10.56);
    g.contextPrices.mockResolvedValueOnce({ precos: [{ ...native, versao: 1 }, { ...native, versao: 2 }] } as any);
    await expect(readPrice(g, query, { role: 'administrador' })).rejects.toMatchObject({ nativeFormat: { context: { distinctMatches: 2, priceValuesEqual: true } } });
  });
  it('aceita cinco casas apenas na precisão do produto e não converte unidade por nome', async () => {
    const g = gateway(); await readPrice(g, { ...query, quantity: 1.23456 }, { role: 'administrador' });
    await expect(readPrice(g, { ...query, quantity: 1.234567 }, { role: 'administrador' })).rejects.toThrow('precisão');
    await expect(readPrice(g, { ...query, unit: 'UN' }, { role: 'administrador' })).rejects.toThrow('precisão');
    expect(g.contextPrices).toHaveBeenCalledTimes(1);
  });
  it('reconsulta a cada leitura e valida versão ativa sem voltar a uma antiga', async () => {
    const g = gateway(); await readPrice(g, query, { role: 'administrador' }); await readPrice(g, query, { role: 'administrador' });
    expect(g.contextPrices).toHaveBeenCalledTimes(2);
    expect(g.select.mock.calls.filter(([sql]) => !sql.includes('TGFEXC')).every(([sql]) => sql.includes('MAX(') && sql.includes('<=LEAST(SYSDATE'))).toBe(true);
    const variantSQL = g.select.mock.calls.find(([sql]) => sql.includes('TGFEXC'))![0];
    expect(variantSQL).toContain("T.CODTAB IN (68) AND N.ATIVO='S'");
    expect(variantSQL).toContain('T.DTVIGOR<=LEAST(SYSDATE');
    expect(variantSQL).not.toContain('VLRVENDA');
    g.select.mockResolvedValueOnce([{ CODTIPVENDA: 29, CODTAB: null, ATIVO: 'N', DESCRTIPVENDA: 'Inativa', SUBTIPOVENDA: '2', VERSION: '2026-10-23T00:00:00' }]);
    await expect(readPrice(g, query, { role: 'administrador' })).rejects.toThrow('confirmada');
    expect(g.contextPrices).toHaveBeenCalledTimes(2);
  });
});
describe('Data comercial explícita, sem depender do fuso UTC da Edge', () => {
  it('mantém o dia brasileiro antes da meia-noite local', () => {
    expect(currentCommercialDay(new Date('2026-10-24T01:00:00Z'))).toBe('2026-10-23');
    expect(currentCommercialDay(new Date('2026-10-24T03:00:00Z'))).toBe('2026-10-24');
  });
});
describe('Literal monetário exato do provedor', () => {
  it.each(['10.56', '0.14528', '1e-9', '10.560000000'])('preserva %s sem reduzir centavos da unidade', value => expect(exactNativeAmount(value)).toBe(Number(value)));
  it.each(['90071992547409.91', '1.0000000001', '1e99', '0', '-1', 'NaN', null])('recusa %s, não arredonda silenciosamente', value => expect(() => exactNativeAmount(value)).toThrow());
});
