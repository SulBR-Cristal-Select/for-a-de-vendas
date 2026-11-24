import { describe, expect, it, vi } from 'vitest';
import { readDocument, readHistory, type HistoryInput, type DocumentInput } from '../../supabase/functions/sankhya-online/history';
import type { ReadScope } from '../../supabase/functions/sankhya-online/read-model';

const admin: ReadScope = { role: 'administrador' };
const query: HistoryInput = { resource: 'orders', offset: 0, limit: 20 };
const header = { NUNOTA: 72, NUMNOTA: 0, CODEMP: 1, CODPARC: 10, CODVEND: 9, APELIDO: 'Vendedor ERP', RAZAOSOCIAL: 'Cliente inativo', TIPMOV: 'P', STATUSNOTA: 'L', DOCUMENT_DATE: '2026-10-23', VLRNOTA: '1234.56', CODTIPOPER: 1001, DESCROPER: 'Descrição ERP', OPERATION_VERSION: '2025-01-01T01:02:03', CODTIPVENDA: 17, PAYMENT_VERSION: '2024-01-01T01:02:03', HAS_ORIGINS: 1, HAS_DESTINATIONS: 0 };
function transport(rows: Record<string, unknown>[] = [header], total = rows.length, without = total) {
  let calls = 0;
  return { select: vi.fn(async (sql: string, _limit: number) => sql.startsWith('SELECT COUNT(*) AS TOTAL') ? [{ TOTAL: calls++ === 0 ? total : without }] : rows) };
}

describe('histórico Sankhya segregado e somente leitura', () => {
  it('preserva número ERP, vendedores reais, versões e semântica explícita da TOP 1001', async () => {
    const g = transport();
    const result = await readHistory(g, query, admin);
    expect(result).toMatchObject({ source: 'sankhya', readOnly: true, offset: 0, total: 1, totalWithoutSearch: 1 });
    expect(result.items[0]).toEqual({ source: 'observado', readOnly: true, id: 'sankhya:order:72', number: '0', date: '2026-10-23', customerId: 'sankhya:customer:10', customerName: 'Cliente inativo', sellerCode: 9, sellerName: 'Vendedor ERP', total: 1234.56, status: 'confirmado', operationName: 'Venda normal', erp: { source: 'sankhya', companyCode: 1, documentCode: 72, movement: 'P', operationCode: 1001, operationVersion: header.OPERATION_VERSION, paymentCode: 17, paymentVersion: header.PAYMENT_VERSION, statusCode: 'L', hasOrigins: true, hasDestinations: false } });
    expect(result.items[0]).not.toHaveProperty('sellerId');
    expect(result.items[0]).not.toHaveProperty('freight');
    expect(result.items[0]).not.toHaveProperty('discount');
    expect(result.readAt).toMatch(/^\d{4}-/);
    const sql = g.select.mock.calls[1]![0];
    expect(sql).toContain('C.DHTIPOPER=T.DHALTER');
    expect(sql).toContain('C.DHTIPVENDA=TPV.DHALTER');
    expect(sql).not.toContain('MAX(');
    expect(sql).toContain('EXISTS (SELECT 1 FROM TGFVAR R WHERE R.NUNOTA=C.NUNOTA)');
    expect(sql).not.toContain('JOIN TGFVAR');
    expect(sql).not.toContain('SUM(');
  });
  it.each(['orders', 'invoices'] as const)('segrega %s sem somar pedidos e notas', async resource => {
    const movement = resource === 'orders' ? 'P' : 'V';
    const g = transport([{ ...header, TIPMOV: movement }]);
    const result = await readHistory(g, { ...query, resource }, admin);
    expect(result.items[0]?.erp.movement).toBe(movement);
    expect(result.items[0]?.id).toBe(`sankhya:${resource === 'orders' ? 'order' : 'invoice'}:72`);
    for (const [sql] of g.select.mock.calls) {
      expect(sql).toContain(`C.TIPMOV='${movement}'`);
      expect(sql).toContain('C.CODEMP IN (1)');
      expect(sql).toContain("P.CLIENTE='S'");
      expect(sql).toContain('P.CODEMP IN (1) OR (P.CODEMP IS NULL AND EXISTS');
      expect(sql).toContain("H.CODEMP IN (1) AND H.TIPMOV IN ('P','V')");
      expect(sql).not.toContain('ATIVO');
    }
  });
  it('usa carteira atual e vínculo servidor inclusive para gestor; não CODVEND do documento', async () => {
    for (const role of ['gestor', 'vendedor'] as const) {
      const g = transport();
      await readHistory(g, query, { role, sellerCode: 12, companyCodes: [1] });
      for (const [sql] of g.select.mock.calls) {
        expect(sql).toContain('P.CODVEND=12');
        expect(sql).not.toContain('C.CODVEND=12');
        expect(sql).not.toContain('CODGER');
        expect(sql).toContain('C.CODEMP IN (1)');
      }
      for (const bad of [{ role }, { role, sellerCode: 0, companyCodes: [1] }, { role, sellerCode: 12, companyCodes: [3] }, { role, sellerCode: 12, companyCodes: [] }]) {
        const blocked = transport();
        await expect(readHistory(blocked, query, bad as ReadScope)).rejects.toMatchObject({ code: 'ERP_IDENTITY_REQUIRED' });
        expect(blocked.select).not.toHaveBeenCalled();
      }
      const blocked = transport();
      await expect(readHistory(blocked, { ...query, companyCode: 4 }, { role, sellerCode: 12, companyCodes: [1] })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
      expect(blocked.select).not.toHaveBeenCalled();
    }
  });
  it('pagina arbitrariamente e conta ambos universos com desempate NUNOTA e datas inclusivas', async () => {
    const g = transport([header], 101, 203);
    const result = await readHistory(g, { ...query, offset: 100, limit: 1, customerId: 'sankhya:customer:10', companyCode: 1, search: "D'Água_50%", sort: 'customer', direction: 'asc', from: '2026-10-01', to: '2026-10-23' }, admin);
    expect(result).toMatchObject({ total: 101, totalWithoutSearch: 203, offset: 100 });
    const [filtered, all, data] = g.select.mock.calls.map(c => c[0]);
    expect(filtered).toContain("D''AGUA!_50!%");
    expect(all).not.toContain(' LIKE ');
    expect(all).not.toContain('FETCH');
    for (const sql of [filtered, all, data]) {
      expect(sql).toContain('P.CODPARC=10');
      expect(sql).toContain('C.CODEMP IN (1)');
      expect(sql).toContain("C.DTNEG>=TO_DATE('2026-10-01','YYYY-MM-DD')");
      expect(sql).toContain("C.DTNEG<TO_DATE('2026-10-23','YYYY-MM-DD')+1");
    }
    expect(data).toContain(',C.NUNOTA ASC NULLS LAST OFFSET 100 ROWS FETCH NEXT 1 ROWS ONLY');
    expect(g.select.mock.calls.map(c => c[1])).toEqual([1, 1, 1]);
  });
  it('preserva desconhecidos como null, códigos brutos e nomes ERP sem inferir status', async () => {
    const g = transport([{ ...header, NUMNOTA: null, STATUSNOTA: 'A', CODTIPOPER: 999, DESCROPER: 'Bonificação orçamento entrega', VLRNOTA: null, CODVEND: null, APELIDO: null, CODTIPVENDA: null, PAYMENT_VERSION: null }]);
    const item = (await readHistory(g, query, admin)).items[0];
    expect(item).toMatchObject({ number: null, total: null, sellerCode: null, sellerName: null, operationName: 'Bonificação orçamento entrega', status: null, erp: { statusCode: 'A', paymentCode: null, paymentVersion: null } });
    expect(item).not.toHaveProperty('cancelled');
    expect(item).not.toHaveProperty('delivered');
  });
  it.each([
    { resource: 'customers' }, { offset: -1 }, { offset: 0.5 }, { offset: 2147483647 }, { limit: 51 }, { limit: 0 }, { limit: '20' },
    { companyCode: 3 }, { customerId: 'sankhya:customer:0' }, { customerId: 'sankhya:order:10' }, { customerId: 'sankhya:customer:1 OR 1=1' },
    { search: 'a; DROP' }, { search: '--' }, { search: 'x'.repeat(121) }, { search: '\u0000' }, { sort: '__proto__' }, { sort: 'date;SELECT' }, { direction: 'ASC' },
    { from: '2026-02-30' }, { from: '2026-10-24', to: '2026-10-23' }, { to: '23/10/2026' }, { sql: 'x' }, { sellerCode: 12 }, { role: 'administrador' },
  ])('recusa entrada inválida antes de consultar: %j', async bad => {
    const g = transport();
    await expect(readHistory(g, { ...query, ...bad } as HistoryInput, admin)).rejects.toBeDefined();
    expect(g.select).not.toHaveBeenCalled();
  });
  it.each([null, '', ' ', true, '1e4', '1,00', Infinity, NaN, '9007199254740993'])('recusa contagem não exata: %s', async total => {
    const g = { select: vi.fn(async () => [{ TOTAL: total }]) };
    await expect(readHistory(g, query, admin)).rejects.toMatchObject({ code: 'ERP_INVALID_RESPONSE' });
  });
  it.each([{ VLRNOTA: 'NaN' }, { VLRNOTA: true }, { VLRNOTA: '9007199254740993' }, { CODEMP: 3 }, { NUNOTA: null }, { TIPMOV: 'V' }, { CODPARC: 0 }, { CODVEND: 1.5 }, { CODTIPOPER: -1 }, { CODTIPVENDA: true }, { HAS_ORIGINS: 2 }, { NUMNOTA: Infinity }])('recusa cabeçalho incompatível: %j', async bad => {
    await expect(readHistory(transport([{ ...header, ...bad }]), query, admin)).rejects.toMatchObject({ code: 'ERP_INVALID_RESPONSE' });
  });
  it('não disfarça página incompleta como universo completo', async () => {
    await expect(readHistory(transport([header], 40), query, admin)).rejects.toMatchObject({ code: 'ERP_INVALID_RESPONSE' });
    const empty = await readHistory(transport([], 0), query, admin);
    expect(empty).toMatchObject({ items: [], total: 0, totalWithoutSearch: 0 });
  });
});

describe('documento ERP com itens realmente paginados', () => {
  const item = { NUNOTA: 72, SEQUENCIA: 51, CODPROD: 8, DESCRPROD: 'Produto', CODVOL: 'CX', QTDNEG: '2.5', VLRUNIT: '10.40', VLRTOT: 26 };
  function detailTransport(items: Record<string, unknown>[] = [item], total = 51) {
    return { select: vi.fn(async (sql: string, _limit: number) => sql.startsWith('SELECT COUNT(*)') ? [{ TOTAL: total }] : sql.startsWith('SELECT I.') ? items : [header]) };
  }
  it('mantém cabeçalho e conta todos os itens sem fingir completude', async () => {
    const g = detailTransport();
    const result = await readDocument(g, { id: 'sankhya:order:72', offset: 50, limit: 1 }, { role: 'gestor', sellerCode: 12, companyCodes: [1] });
    expect(result).toMatchObject({ record: { id: 'sankhya:order:72', number: '0', total: 1234.56 }, total: 51, totalWithoutSearch: 51, offset: 50, limit: 1, hasMore: false });
    expect(result.items).toEqual([{ source: 'observado', readOnly: true, id: 'sankhya:order:72:item:51', sequence: 51, productId: 'sankhya:product:8', productCode: 8, productName: 'Produto', unit: 'CX', quantity: 2.5, unitPrice: 10.4, total: 26 }]);
    for (const [sql] of g.select.mock.calls) {
      expect(sql).toContain('C.NUNOTA=72');
      expect(sql).toContain('P.CODVEND=12');
      expect(sql).toContain('C.CODEMP IN (1)');
      expect(sql).toContain("C.TIPMOV='P'");
    }
    expect(g.select.mock.calls[2]![0]).toContain('ORDER BY I.SEQUENCIA ASC OFFSET 50 ROWS FETCH NEXT 1 ROWS ONLY');
    expect(g.select.mock.calls[1]![0]).not.toContain('FETCH');
  });
  it('expõe continuação real e valores desconhecidos sem zeros inventados', async () => {
    const g = detailTransport([{ ...item, QTDNEG: null, VLRUNIT: null, VLRTOT: null }], 2);
    const result = await readDocument(g, { id: 'sankhya:order:72', limit: 1 }, admin);
    expect(result).toMatchObject({ offset: 0, limit: 1, total: 2, hasMore: true, items: [{ quantity: null, unitPrice: null, total: null }] });
  });
  it('ausência ou fora de escopo não dispara consulta de itens', async () => {
    const g = { select: vi.fn(async (_sql: string, _limit: number) => []) };
    expect(await readDocument(g, { id: 'sankhya:invoice:72' }, admin)).toMatchObject({ record: null, items: [], total: 0, offset: 0, limit: 50, hasMore: false });
    expect(g.select).toHaveBeenCalledTimes(1);
    expect(g.select.mock.calls[0]![0]).toContain("C.TIPMOV='V'");
  });
  it.each([{ id: 'sankhya:customer:72' }, { id: 'sankhya:order:0' }, { id: 'sankhya:order:2147483648' }, { id: 'sankhya:order:1 OR 1=1' }, { limit: 51 }, { offset: -1 }, { companyCode: 1 }])('recusa documento inválido: %j', async bad => {
    const g = detailTransport();
    await expect(readDocument(g, { id: 'sankhya:order:72', ...bad } as DocumentInput, admin)).rejects.toBeDefined();
    expect(g.select).not.toHaveBeenCalled();
  });
  it.each([{ NUNOTA: 73 }, { SEQUENCIA: null }, { SEQUENCIA: 1.5 }, { QTDNEG: 'infinito' }, { CODPROD: '9007199254740993' }])('recusa item incompatível: %j', async bad => {
    await expect(readDocument(detailTransport([{ ...item, ...bad }], 1), { id: 'sankhya:order:72', limit: 1 }, admin)).rejects.toMatchObject({ code: 'ERP_INVALID_RESPONSE' });
  });
});
