import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPrice, exactNativeAmount, currentCommercialDay } from '../../supabase/functions/sankhya-online/price-context';
import { readRecord } from '../../supabase/functions/sankhya-online/read-model';
vi.mock('../../supabase/functions/sankhya-online/read-model', async original => ({ ...await original<Record<string, unknown>>(), readRecord: vi.fn() }));
const query = { customerId: 'sankhya:customer:141', productId: 'sankhya:product:11240', paymentCode: 29, type: 'Venda' as const };
let customer: any, product: any;
function gateway() {
  return {
    select: vi.fn<(sql: string, limit?: number) => Promise<Record<string, unknown>[]>>(async (sql: string) => sql.includes('FROM TGFTPV') ? [{ CODTIPVENDA: 29, CODTAB: null, ATIVO: 'S', DESCRTIPVENDA: 'Condição do teste', SUBTIPOVENDA: '2', VERSION: '2026-06-10T11:47:42' }] : sql.includes('TGFEXC') ? [{ CODLOCAL: 0, CONTROLE: ' ' }] : [{ CODTIPOPER: 1001, ATIVO: 'S', TIPMOV: 'P', OPERATION_VERSION: '2026-07-21T08:04:13' }]),
    contextPrices: vi.fn(async () => ({ precos: [{ codigoProduto: 11240, unidade: 'PC', codigoLocalEstoque: 0, controle: ' ', valor: '10.56' }] })),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  customer = { id: query.customerId, active: true, readOnly: true, erp: { source: 'sankhya', partnerCode: 141, companyCode: null, sellerCode: 14, tableCode: 68, creditBlocked: false } };
  product = { id: query.productId, active: true, readOnly: true, unit: 'PC', price: null, erp: { source: 'sankhya', productCode: 11240, quantityDecimals: 5 } };
  vi.mocked(readRecord).mockImplementation(async (_g, q) => ({ source: 'sankhya', readOnly: true, readAt: '2026-10-23T22:00:00Z', record: q.resource === 'customers' ? customer : q.resource === 'products' ? product : { active: true, id: `sankhya:seller:${q.id}`, erp: { source: 'sankhya', sellerCode: q.id } } } as any));
});
describe('Preço nativo contextual, nunca preço-base ou catálogo aproximado', () => {
  it('gestor cota para integrante explicitamente autorizado, não por nome ou carteira',async()=>{
    const g=gateway();const result=await readPrice(g,{...query,sellerCode:12},{role:'gestor',sellerCode:14,companyCodes:[1],teamSellerCodes:[12]});
    expect(result.seller.id).toBe('sankhya:seller:12');expect(g.contextPrices).toHaveBeenCalledWith(expect.objectContaining({codigoVendedor:12}));
  });
  it('usa filial1 só no contexto compartilhado, TOP1001 e vendedor real, preservando controle espaço', async () => {
    const g = gateway(), result = await readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] });
    expect(result).toMatchObject({ companyCode: 1, operationCode: 1001, price: { amount: 10.56, unit: 'PC', localCode: 0, control: ' ', tableVersion: null } });
    expect(g.contextPrices).toHaveBeenCalledWith({ codigoEmpresa: 1, codigoCliente: 141, codigoVendedor: 14, codigoTipoOperacao: 1001, codigoTipoNegociacao: 29, dataNegociacao: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), produtos: [{ codigoProduto: 11240, unidade: 'PC', quantidade: 1, codigoLocalEstoque: 0, controle: ' ' }] });
    expect(customer.erp.companyCode).toBeNull();
  });
  it('não substitui filial4 do cadastro pela política dos compartilhados', async () => {
    customer.erp.companyCode = 4;
    expect((await readPrice(gateway(), query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).companyCode).toBe(4);
  });
  it('não remapeia empresa3 nem aceita override de contexto do navegador', async () => {
    const g = gateway(); customer.erp.companyCode = 3;
    await expect(readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    await expect(readPrice(g, { ...query, companyCode: 1 } as any, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it('usa vendedor do Auth mesmo quando o cadastro do cliente tem vendedor0', async () => {
    const g = gateway(); customer.erp.sellerCode = 0;
    await readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] });
    expect(g.contextPrices).toHaveBeenCalledWith(expect.objectContaining({ codigoVendedor: 14 }));
    expect(customer.erp.sellerCode).toBe(0);
  });
  it('não ultrapassa o vínculo explícito de filial e vendedor', async () => {
    const g = gateway();
    await expect(readPrice(g, query, { role: 'vendedor', sellerCode: 14, companyCodes: [4] })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    await expect(readPrice(g, { ...query, sellerCode: 15 }, { role: 'gestor', sellerCode: 14, companyCodes: [1] })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it('não escolhe entre preços duplicados no mesmo contexto nem completa preço ausente', async () => {
    const g = gateway(); g.contextPrices.mockResolvedValueOnce({ precos: [] }).mockResolvedValueOnce({ precos: [{ codigoProduto: 11240, unidade: 'PC', codigoLocalEstoque: 0, controle: ' ', valor: '10.56' }, { codigoProduto: 11240, unidade: 'PC', codigoLocalEstoque: 0, controle: ' ', valor: '12.00' }] });
    await expect(readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toMatchObject({ code: 'ERP_PRICE_AMBIGUOUS', nativeFormat: { kind: 'empty_prices', context: { candidates: 0 } } });
    await expect(readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toMatchObject({ code: 'ERP_PRICE_AMBIGUOUS', nativeFormat: { kind: 'context_mismatch', context: { candidates: 2, productMatches: 2 } } });
  });
  it('colapsa apenas repetição integral do objeto e não funde versões nem preços diferentes', async () => {
    const g = gateway(), native = { codigoProduto: 11240, unidade: 'PC', codigoLocalEstoque: 0, controle: ' ', valor: '10.56' };
    g.contextPrices.mockResolvedValueOnce({ precos: [native, { ...native }] });
    expect((await readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).price.amount).toBe(10.56);
    g.contextPrices.mockResolvedValueOnce({ precos: [{ ...native, versao: 1 }, { ...native, versao: 2 }] } as any);
    await expect(readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toMatchObject({ nativeFormat: { context: { distinctMatches: 2, priceValuesEqual: true } } });
  });
  it('aceita cinco casas apenas na precisão do produto e não converte unidade por nome', async () => {
    const g = gateway(); await readPrice(g, { ...query, quantity: 1.23456 }, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] });
    await expect(readPrice(g, { ...query, quantity: 1.234567 }, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toThrow('precisão');
    await expect(readPrice(g, { ...query, unit: 'UN' }, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toThrow('precisão');
    expect(g.contextPrices).toHaveBeenCalledTimes(1);
  });
  it('reconsulta a cada leitura e valida versão ativa sem voltar a uma antiga', async () => {
    const g = gateway(); await readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] }); await readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] });
    expect(g.contextPrices).toHaveBeenCalledTimes(2);
    expect(g.select.mock.calls.filter(([sql]) => !sql.includes('TGFEXC')).every(([sql]) => sql.includes('MAX(') && sql.includes('<=LEAST(SYSDATE'))).toBe(true);
    const variantSQL = g.select.mock.calls.find(([sql]) => sql.includes('TGFEXC'))![0];
    expect(variantSQL).toContain("T.CODTAB IN (68) AND N.ATIVO='S'");
    expect(variantSQL).toContain('T.DTVIGOR<=LEAST(SYSDATE');
    expect(variantSQL).not.toContain('VLRVENDA');
    g.select.mockResolvedValueOnce([{ CODTIPVENDA: 29, CODTAB: null, ATIVO: 'N', DESCRTIPVENDA: 'Inativa', SUBTIPOVENDA: '2', VERSION: '2026-10-23T00:00:00' }]);
    await expect(readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toThrow('confirmada');
    expect(g.contextPrices).toHaveBeenCalledTimes(2);
  });
});
describe('Local e controle reais sem exigir tabela no cliente', () => {
  const columns = [{ COLUMN_NAME: 'CODEMP', DATA_TYPE: 'NUMBER' }, { COLUMN_NAME: 'CODPROD', DATA_TYPE: 'NUMBER' }, { COLUMN_NAME: 'CODLOCAL', DATA_TYPE: 'NUMBER' }, { COLUMN_NAME: 'CONTROLE', DATA_TYPE: 'VARCHAR2' }];
  function stockGateway(rows: Record<string, unknown>[] = [{ CODLOCAL: 0, CONTROLE: ' ' }], schema = columns) {
    const g = gateway(), original = g.select.getMockImplementation()!;
    g.select.mockImplementation(async (sql, limit) => sql.includes('FROM USER_TAB_COLUMNS') ? schema : sql.includes('FROM TGFEST') ? rows : original(sql, limit));
    customer.erp.companyCode = 4; customer.erp.tableCode = null;
    return g;
  }
  it('usa exclusivamente local/controle únicos do produto na filial, sem escolher tabela ou consultar valor SQL', async () => {
    const g = stockGateway([{ CODLOCAL: 81, CONTROLE: 'LOTE-REAL' }]);
    g.contextPrices.mockResolvedValueOnce({ precos: [{ codigoProduto: 11240, unidade: 'PC', codigoLocalEstoque: 81, controle: 'LOTE-REAL', valor: '12.34' }] });
    const r = await readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] });
    expect(r).toMatchObject({ companyCode: 4, price: { amount: 12.34, localCode: 81, control: 'LOTE-REAL', provider: 'native-context-api', tableVersion: null } });
    const [sql, limit] = g.select.mock.calls.find(([s]) => s.includes('FROM TGFEST'))!;
    expect(sql).toContain('CODEMP=4 AND CODPROD=11240'); expect(sql).toContain('SELECT DISTINCT CODLOCAL,CONTROLE'); expect(sql).toContain('FETCH FIRST 2 ROWS ONLY'); expect(limit).toBe(2);
    expect(sql).not.toMatch(/VLRVENDA|PRECO|RESERVADO|ESTOQUE[><=]/i);
    expect(g.select.mock.calls.some(([s]) => s.includes('TGFEXC'))).toBe(false);
    expect(g.contextPrices).toHaveBeenCalledWith(expect.objectContaining({ codigoEmpresa: 4, produtos: [{ codigoProduto: 11240, unidade: 'PC', quantidade: 1, codigoLocalEstoque: 81, controle: 'LOTE-REAL' }] }));
  });
  it.each([{ rows: [] }, { rows: [{ CODLOCAL: 1, CONTROLE: 'A' }, { CODLOCAL: 2, CONTROLE: 'B' }] }])('recusa ausência ou ambiguidade de contexto, sem inventar local0: %j', async ({ rows }) => {
    const g = stockGateway(rows);
    await expect(readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toMatchObject({ code: 'ERP_PRICE_AMBIGUOUS' });
    expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it('confere metadados antes de consultar o estoque', async () => {
    const g = stockGateway([], columns.filter(c => c.COLUMN_NAME !== 'CONTROLE'));
    await expect(readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toMatchObject({ code: 'ERP_CONTEXT_REQUIRED' });
    expect(g.select.mock.calls.some(([s]) => s.includes('FROM USER_TAB_COLUMNS'))).toBe(true);
    expect(g.select.mock.calls.some(([s]) => s.includes('FROM TGFEST'))).toBe(false); expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it('não interpreta coluna de código com tipo incompatível', async () => {
    const g = stockGateway([], columns.map(c => c.COLUMN_NAME === 'CODLOCAL' ? { ...c, DATA_TYPE: 'VARCHAR2' } : c));
    await expect(readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toMatchObject({ code: 'ERP_CONTEXT_REQUIRED' });
    expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it.each([{ CODLOCAL: null, CONTROLE: ' ' }, { CODLOCAL: -1, CONTROLE: ' ' }, { CODLOCAL: ' ', CONTROLE: ' ' }, { CODLOCAL: 0, CONTROLE: null }])('recusa contexto incompleto sem completar valores: %j', async row => {
    const g = stockGateway([row]);
    await expect(readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toMatchObject({ code: 'ERP_CONTEXT_REQUIRED' }); expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it('não contorna ambiguidade de tabela atribuída procurando outro contexto no estoque', async () => {
    const g = gateway(), original = g.select.getMockImplementation()!;
    g.select.mockImplementation(async (sql, limit) => sql.includes('TGFEXC') ? [{ CODLOCAL: 1, CONTROLE: 'A' }, { CODLOCAL: 2, CONTROLE: 'B' }] : original(sql, limit));
    await expect(readPrice(g, query, { role: 'administrador', sellerCode: 14, companyCodes: [1, 4] })).rejects.toMatchObject({ code: 'ERP_PRICE_AMBIGUOUS' });
    expect(g.select.mock.calls.some(([s]) => s.includes('FROM TGFEST') || s.includes('FROM USER_TAB_COLUMNS'))).toBe(false); expect(g.contextPrices).not.toHaveBeenCalled();
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

describe('Preço com vendedor da sessão autenticada', () => {
  it.each(['administrador', 'gestor', 'vendedor'] as const)('não usa vendedor do cliente nem body para%s sem vínculo', async role => {
    const g = gateway();
    await expect(readPrice(g, { ...query, sellerCode: 14 }, { role })).rejects.toMatchObject({ code: 'ERP_IDENTITY_REQUIRED' });
    expect(readRecord).not.toHaveBeenCalled(); expect(g.select).not.toHaveBeenCalled(); expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it('cota duas identidades diferentes sem herdar o vendedor do cliente ou consulta anterior', async () => {
    const g = gateway(); customer.erp.sellerCode = 0;
    for (const sellerCode of [12, 34]) {
      await readPrice(g, query, { role: 'administrador', sellerCode, companyCodes: [1, 4] });
      expect(g.contextPrices).toHaveBeenLastCalledWith(expect.objectContaining({ codigoVendedor: sellerCode }));
    }
    expect(customer.erp.sellerCode).toBe(0);
  });
  it.each(['administrador', 'gestor', 'vendedor'] as const)('recusa trocar vendedor antes de consultar ERP:%s', async role => {
    const g = gateway();
    await expect(readPrice(g, { ...query, sellerCode: 5 }, { role, sellerCode: 12, companyCodes: [1] })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    expect(readRecord).not.toHaveBeenCalled(); expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it('não dá filial4 ao administrador com vínculo comercial restrito à1', async () => {
    customer.erp.companyCode = 4;
    await expect(readPrice(gateway(), query, { role: 'administrador', sellerCode: 12, companyCodes: [1] })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
  });
});
