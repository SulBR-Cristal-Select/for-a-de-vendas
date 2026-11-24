import indexSource from '../../supabase/functions/sankhya-online/index.ts?raw';
import { describe, expect, it, vi } from 'vitest';
import { readCategories, readFacets, readPage, readRecord, readWindow, type WindowInput, type PageInput, type ReadScope } from '../../supabase/functions/sankhya-online/read-model';

const admin: ReadScope = { role: 'administrador' };
const seller: ReadScope = { role: 'vendedor', sellerCode: 12, companyCodes: [1] };
function transport(rows: Record<string, unknown>[] = [], total = 103, withoutSearch = 207) {
  let counts = 0;
  return { select: vi.fn(async (sql: string, _limit: number) => /^SELECT COUNT\(\*\) AS TOTAL/.test(sql) ? [{ TOTAL: counts++ === 0 ? total : withoutSearch }] : rows) };
}
const query = { resource: 'customers' as const };

describe('modelo Sankhya somente leitura', () => {
  it('busca de cliente na carteira de um vendedor não casa pelo apelido dele e aceita CNPJ com máscara', async () => {
    const g = transport([]);
    await readWindow(g, { resource: 'customers', offset: 0, limit: 50, search: 'sul', filters: { sellerCode: 12 } }, seller);
    const sql = g.select.mock.calls.map(c => c[0]).join('\n');
    expect(sql).not.toContain('V.APELIDO)');
    const h = transport([]);
    await readWindow(h, { resource: 'customers', offset: 0, limit: 50, search: '11.517.841/0049-31' }, admin);
    expect(h.select.mock.calls.map(c => c[0]).join('\n')).toContain("P.CGC_CPF LIKE '%11517841004931%'");
    const nome = transport([]);
    await readWindow(nome, { resource: 'customers', offset: 0, limit: 50, search: 'ahmad' }, admin);
    expect(nome.select.mock.calls.map(c => c[0]).join('\n')).not.toContain('P.CGC_CPF LIKE');
  });
  it('pagina no banco, conta universo integral e mantém desempate estável', async () => {
    const g = transport([{ CODPARC: 10, RAZAOSOCIAL: 'Cliente', ATIVO: 'S', CODEMP: null }]);
    const result = await readPage(g, { ...query, page: 3, pageSize: 50, sort: 'name', search: "D'Água_50%" }, admin);
    expect(result).toMatchObject({ total: 103, totalWithoutSearch: 207, page: 3, pageSize: 50, hasMore: true, source: 'sankhya', readOnly: true });
    const [count, unsearched, data] = g.select.mock.calls.map(c => c[0]);
    expect(count).toContain('COUNT(*) AS TOTAL');
    expect(count).not.toContain('ROWNUM');
    expect(count).toContain("D''AGUA!_50!%");
    expect(count).toContain('ASCIISTR(TRANSLATE(UPPER(C.NOMECID)');
    expect(count).toContain('ASCIISTR(TRANSLATE(UPPER(V.APELIDO)');
    expect(unsearched).not.toContain(' LIKE ');
    expect(data).toContain("ORDER BY NLSSORT(ASCIISTR(TRANSLATE(UPPER(P.RAZAOSOCIAL),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN')),'NLS_SORT=BINARY') ASC NULLS LAST,P.CODPARC ASC NULLS LAST OFFSET 100 ROWS FETCH NEXT 50 ROWS ONLY");
    expect(g.select.mock.calls.map(c => c[1])).toEqual([1, 1, 50]);
  });
  it.each([{}, { CODEMP: undefined }, { CODEMP: '' }])('não transforma filial não recebida em nulo explícito: %j', async fields => {
    await expect(readRecord(transport([{ CODPARC: 10, ...fields }]), { resource: 'customers', id: 10 }, admin)).rejects.toMatchObject({ code: 'ERP_INVALID_RESPONSE' });
  });
  it('usa CODEMP explícito ou prova documental apenas quando CODEMP nulo', async () => {
    const g = transport(); await readPage(g, query, admin);
    const sql = g.select.mock.calls[1]![0];
    expect(sql).toContain("P.CLIENTE='S'"); expect(sql).toContain("P.ATIVO='S'");
    expect(sql).toContain("P.CODEMP IN (1) OR (P.CODEMP IS NULL AND EXISTS");
    expect(sql).toContain("H.CODEMP IN (1) AND H.TIPMOV IN ('P','V')");
    expect(sql).not.toMatch(/P.CODVEND=\d/);
  });
  it.each(['vendedor', 'gestor'] as const)('%s exige vínculo e não amplia a carteira', async role => {
    const missing = transport();
    await expect(readPage(missing, query, { role })).rejects.toMatchObject({ code: 'ERP_IDENTITY_REQUIRED' });
    expect(missing.select).not.toHaveBeenCalled();
    for (const scope of [{ role, sellerCode: 12, companyCodes: [] }, { role, sellerCode: 12, companyCodes: [3] }]) {
      await expect(readPage(missing, query, scope as ReadScope)).rejects.toMatchObject({ code: 'ERP_IDENTITY_REQUIRED' });
    }
    const g = transport(); await readPage(g, query, { ...seller, role });
    expect(g.select.mock.calls[0]![0]).toContain('P.CODVEND=12');
    expect(g.select.mock.calls[0]![0]).toContain('P.CODEMP IN (1)');
    await expect(readPage(g, { ...query, filters: { sellerCode: 13 } }, { ...seller, role })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    await expect(readPage(g, { ...query, filters: { companyCode: 4 } }, { ...seller, role })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
  });
  it('detalhe permite cliente inativo sem gerar contexto, atribuição ou bloqueio geral', async () => {
    const g = transport([{ CODPARC: 10, RAZAOSOCIAL: 'Cliente', NOMEPARC: 'Loja', CODVEND: 9, APELIDO: 'ERP', CODEMP: null, BLOQUEAR: 'S', ATIVO: 'N', UF: 'RS', TIPO: 'Rua', NOMEEND: 'Central' }]);
    const result = await readRecord(g, { resource: 'customers', id: 'sankhya:customer:10' }, admin);
    expect(result.record).toMatchObject({ id: 'sankhya:customer:10', name: 'Cliente', fantasy: 'Loja', active: false, state: 'RS', address: 'Rua Central', sellerCode: 9, creditBlocked: true, erp: { source: 'sankhya', companyCode: null, sellerCode: 9, contexts: [] } });
    expect(result.record).not.toHaveProperty('blocked'); expect(result.record).not.toHaveProperty('sellerId');
    const sql = g.select.mock.calls[0]![0];
    expect(sql).not.toContain("P.ATIVO='S'"); expect(sql).toContain('P.CODPARC=10');
    expect(sql).toContain('U.CODUF=C.UF'); expect(sql).not.toContain('C.UF=U.UF');
  });
  it('produtos abrangem usos sem inferir preço ou conversão, preservando DECQTD', async () => {
    const g = transport([{ CODPROD: 33, DESCRPROD: 'Produto', CODVOL: 'KG', DECQTD: 4, AGRUPMIN: null, BLOQVENDAFRAC: 'N', ATIVO: 'S', CODGRUPOPROD: 500, DESCRGRUPOPROD: 'Grupo' }]);
    const result = await readPage(g, { resource: 'products', filters: { companyCode: 1, categoryCode: 500 } }, seller);
    expect(result.items[0]).toMatchObject({ id: 'sankhya:product:33', price: null, unit: 'KG', category: 'Grupo', categoryCode: 500, source: 'observado', erp: { quantityDecimals: 4, contexts: [], source: 'sankhya' } });
    expect(result.items[0]).toHaveProperty('multiple', null);
    expect(result.items[0]!.erp).toMatchObject({ fractionBlocked: false });
    const sql = g.select.mock.calls[1]![0];
    expect(sql).toContain('TGFITE I JOIN TGFCAB H ON H.NUNOTA=I.NUNOTA');
    expect(sql).toContain('I.CODPROD=P.CODPROD AND H.CODEMP IN (1)');
    // Listagens de produtos: somente "Usado como: Venda (fabricação própria)"; a leitura de um registro não filtra.
    expect(sql).toContain("P.USOPROD='V'");
    const detail = transport([{ CODPROD: 33, AGRUPMIN: null, BLOQVENDAFRAC: 'N', ATIVO: 'N' }]);
    await readRecord(detail, { resource: 'products', id: 33 }, seller);
    expect(detail.select.mock.calls[0]![0]).not.toContain("P.ATIVO='S'");
    expect(detail.select.mock.calls[0]![0]).toContain('H.CODEMP IN (1)');
    expect(detail.select.mock.calls[0]![0]).not.toContain('USOPROD');
  });
  it('não trata regra de quantidade ausente como agrupamento zero ou permissão fracionada', async () => {
    const g = transport([{ CODPROD: 33, DECQTD: 5, ATIVO: 'S' }]);
    await expect(readRecord(g, { resource: 'products', id: 33 }, admin)).rejects.toMatchObject({ code: 'ERP_INVALID_RESPONSE' });
    const configured = transport([{ CODPROD: 33, DECQTD: 5, AGRUPMIN: 0.3, BLOQVENDAFRAC: 'S', ATIVO: 'S' }]);
    expect((await readRecord(configured, { resource: 'products', id: 33 }, admin)).record).toMatchObject({ multiple: 0.3, erp: { quantityDecimals: 5, fractionBlocked: true } });
  });
  it('vendedores ativos preservam códigos distintos sem usuários Auth', async () => {
    const g = transport([{ CODVEND: 10, APELIDO: 'Mesmo nome', ATIVO: 'S' }, { CODVEND: 11, APELIDO: 'Mesmo nome', ATIVO: 'S' }]);
    const result = await readPage(g, { resource: 'sellers' }, admin);
    expect(result.items.map(r => r.code)).toEqual([10, 11]);
    expect(result.items[0]).toHaveProperty('id', 'sankhya:seller:10'); expect(result.items[0]).not.toHaveProperty('email');
    expect(g.select.mock.calls[0]![0]).toContain("P.ATIVO='S'");
    expect(g.select.mock.calls[0]![0]).toContain('P.CODEMP IS NULL');
  });
  it('mantém dados de endereço e crédito sem trocar RG por inscrição estadual', async () => {
    const g = transport([{ CODPARC: 10, CODEMP: null, TIPPESSOA: 'F', IDENTINSCESTAD: 'RG', LIMCRED: 2000, TIPO: 'Rua', NOMEEND: 'Central', NUMEND: '12', COMPLEMENTO: 'Sala 1', NOMEBAI: 'Centro' }]);
    const result = await readRecord(g, { resource: 'customers', id: 10 }, admin);
    expect(result.record).toMatchObject({ source: 'observado', ie: null, credit: 2000, address: 'Rua Central, 12, Sala 1, Centro' });
  });
  it('categorias vêm do agrupamento integral com total e continuação próprios', async () => {
    const g = transport([{ CODE: 500, NAME: 'Grupo', RECORD_COUNT: 80 }], 70);
    const result = await readCategories(g, { page: 2, pageSize: 10, sort: 'name' }, admin);
    expect(result).toMatchObject({ items: [{ code: 500, name: 'Grupo', count: 80 }], total: 70, totalWithoutSearch: 70, hasMore: true });
    expect(g.select.mock.calls[0]![0]).toContain('GROUP BY P.CODGRUPOPROD,G.DESCRGRUPOPROD');
    expect(g.select.mock.calls[0]![0]).not.toContain('FETCH');
    expect(g.select.mock.calls[1]![0]).toContain('ORDER BY NAME ASC NULLS LAST,CODE ASC OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY');
  });
  it('facetas respeitam carteira e busca e não têm cursor vazio Oracle', async () => {
    const g = transport([{ CODE: 12, NAME: 'Vendedor', RECORD_COUNT: 3 }]);
    await readFacets(g, { ...query, facet: 'seller', search: 'Loja' }, seller);
    for (const [sql, limit] of g.select.mock.calls) { expect(sql).toContain('P.CODVEND=12'); expect(sql).not.toContain("= ''"); expect(limit).toBeLessThanOrEqual(50); }
    expect(g.select.mock.calls[0]![0]).toContain(' LIKE ');
    expect(g.select.mock.calls[1]![0]).not.toContain(' LIKE ');
  });
  it.each([
    { pageSize: 51 }, { pageSize: '10' }, { page: 0 }, { page: 1.1 }, { page: 2147483647 },
    { sort: 'name; DELETE' }, { direction: 'desc nulls first' }, { sql: 'SELECT 1' }, { role: 'administrador' }, { sellerCode: 10 },
    { filters: { sql: 'x' } }, { search: "'; DROP TABLE X" }, { search: 'x'.repeat(121) }, { resource: 'orders' },
    { filters: { companyCode: 3 } }, { filters: { sellerCode: "1 OR 1=1" } }, { filters: { categoryCode: 500 } },
  ])('recusa entrada inválida antes do transporte: %j', async bad => {
    const g = transport(); await expect(readPage(g, { ...query, ...bad } as PageInput, admin)).rejects.toBeDefined(); expect(g.select).not.toHaveBeenCalled();
  });
  it.each(['sankhya:customer:1 OR 1=1', 'sankhya:product:10', '', '0', '-1', '1.5', 0, NaN])('recusa ID inválido %s', async id => {
    const g = transport(); await expect(readRecord(g, { resource: 'customers', id }, admin)).rejects.toBeDefined(); expect(g.select).not.toHaveBeenCalled();
  });
  it.each([10, 20, 50] as const)('aceita somente página de tamanho %s e devolve ausência explícita', async pageSize => {
    const g = transport([], 0); const result = await readPage(g, { ...query, pageSize, search: '' }, admin);
    expect(result).toMatchObject({ total: 0, hasMore: false, items: [] });
    expect(g.select.mock.calls[1]![1]).toBe(pageSize);
    expect((await readRecord(g, { resource: 'customers', id: 10 }, admin)).record).toBeNull();
  });
  it('recusa contagem incompatível em vez de substituir por base vazia', async () => {
    const g = { select: vi.fn(async () => []) };
    await expect(readPage(g, query, admin)).rejects.toMatchObject({ code: 'ERP_INVALID_RESPONSE' });
  });
});

describe('janela ERP autenticada e limitada', () => {
  it('offset arbitrário com contagens reais, escapes e categoria exata', async () => {
    const g = transport([{ CODPROD: 7, DECQTD: 5, AGRUPMIN: null, BLOQVENDAFRAC: 'N', SORT_VALUE: "D'AGUA" }], 9, 31);
    const result = await readWindow(g, { resource: 'products', offset: 3, limit: 2, search: "D'Água_50%", sort: 'category', direction: 'desc', filters: { categoryName: "D'Água_50%", categoryCode: 8 } }, admin);
    expect(result).toMatchObject({ source: 'sankhya', readOnly: true, offset: 3, total: 9, totalWithoutSearch: 31, items: [{ _sortValue: "D'AGUA", erp: { quantityDecimals: 5 } }] });
    expect(result.readAt).toMatch(/^\d{4}-/);
    const sql = g.select.mock.calls[2]![0];
    expect(sql).toContain("G.DESCRGRUPOPROD='D''Água_50%'");
    expect(sql).toContain('P.CODGRUPOPROD=8');
    expect(sql).toContain('AS SORT_VALUE');
    expect(sql).toContain("NLS_SORT=BINARY'");
    expect(sql).toContain('DESC NULLS LAST,P.CODPROD DESC NULLS LAST OFFSET 3 ROWS FETCH NEXT 2 ROWS ONLY');
    expect(g.select.mock.calls.map(c => c[1])).toEqual([1, 1, 2]);
    expect(g.select.mock.calls[1]![0]).not.toContain(' LIKE ');
  });
  it.each([1, 7, 50])('aceita limite %s sem carregar base', async limit => {
    const g = transport([], 0);
    const result = await readWindow(g, { ...query, offset: 17, limit }, admin);
    expect(result).toMatchObject({ items: [], offset: 17, total: 0, totalWithoutSearch: 0 });
    expect(g.select.mock.calls[1]![0]).toContain(`OFFSET 17 ROWS FETCH NEXT ${limit} ROWS ONLY`);
    expect(g.select.mock.calls[1]![1]).toBe(limit);
  });
  it.each([
    { offset: -1 }, { offset: 0.5 }, { offset: '0' }, { offset: 2147483647 }, { limit: 0 }, { limit: 51 }, { limit: 1.2 }, { limit: '2' },
    { page: 1 }, { pageSize: 10 }, { sort: ['name'] }, { sort: 'constructor' }, { sort: 'category' }, { direction: 'DESC' }, { sql: 'SELECT' },
    { filters: { categoryName: 'x' } }, { filters: { companyCode: 3 } },
  ])('recusa janela inválida antes do transporte %j', async bad => {
    const g = transport();
    await expect(readWindow(g, { ...query, offset: 0, limit: 5, ...bad } as WindowInput, admin)).rejects.toBeDefined();
    expect(g.select).not.toHaveBeenCalled();
  });
  it.each(['vendedor', 'gestor'] as const)('janela %s não substitui vínculo nem amplia carteira', async role => {
    const g = transport();
    await expect(readWindow(g, { ...query, offset: 0, limit: 1 }, { role })).rejects.toMatchObject({ code: 'ERP_IDENTITY_REQUIRED' });
    expect(g.select).not.toHaveBeenCalled();
    await readWindow(g, { ...query, offset: 0, limit: 1 }, { ...seller, role });
    for (const [sql] of g.select.mock.calls) { expect(sql).toContain('P.CODVEND=12'); expect(sql).toContain('P.CODEMP IN (1)'); }
    await expect(readWindow(g, { ...query, offset: 0, limit: 1, filters: { sellerCode: 13 } }, { ...seller, role })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
  });
  it.each([
    ['customers', ['code', 'name', 'city', 'state', 'seller', 'blocked', 'source']],
    ['products', ['icon', 'code', 'name', 'category', 'unit', 'price', 'source']],
    ['sellers', ['code', 'name', 'source']],
  ] as const)('whitelist e NULLS LAST para %s', async (resource, sorts) => {
    for (const sort of sorts) for (const direction of ['asc', 'desc'] as const) {
      const g = transport([{ CODEMP: null, AGRUPMIN: null, BLOQVENDAFRAC: 'N', SORT_VALUE: sort === 'code' ? 42 : null }]);
      const result = await readWindow(g, { resource, sort, direction, offset: 0, limit: 1 }, admin);
      expect(result.items[0]!._sortValue).toBe(sort === 'code' ? 42 : null);
      const sql = g.select.mock.calls[1]![0];
      expect(sql).toContain(`${direction.toUpperCase()} NULLS LAST`);
      if (resource === 'sellers') expect(sql).toContain('P.CODVEND<>0');
      if (sort === 'blocked') { expect(sql).toContain('CAST(NULL AS NUMBER) AS SORT_VALUE'); expect(result.items[0]).not.toHaveProperty('blocked'); }
      if (sort === 'price') expect(result.items[0]).toHaveProperty('price', null);
    }
  });
  it.each(["'; DROP TABLE X", '--', 'x'.repeat(121), '', 7])('categoria inválida %j', async categoryName => {
    const g = transport();
    await expect(readWindow(g, { resource: 'products', filters: { categoryName }, offset: 0, limit: 1 } as WindowInput, admin)).rejects.toBeDefined();
    expect(g.select).not.toHaveBeenCalled();
  });
});

describe('roteamento sem substituição da sessão comercial', () => {
  it('janela usa o mesmo scope somente depois de actor, nunca dentro do probe', () => {
    const probeStart = indexSource.indexOf("if (input.operation === 'probe')");
    const route = indexSource.indexOf("if (input.operation === 'window')");
    const auth = indexSource.lastIndexOf('const profile = await actor(request);', route);
    expect(probeStart).toBeGreaterThan(0); expect(auth).toBeGreaterThan(probeStart); expect(route).toBeGreaterThan(auth);
    const probe = indexSource.slice(probeStart, auth);
    expect(probe).not.toMatch(/readWindow|readPage|readRecord|readFacets|commercialGateway/);
    expect(probe).toContain("input.check !== 'schema'");
    expect(indexSource.slice(auth)).toContain('const scope = actorScope(profile)');
    expect(indexSource.slice(route)).toContain('readWindow(commercialGateway, input.query, scope)');
    expect(indexSource.slice(auth)).not.toContain('maintenance(request)');
  });
});


describe('produtos da tabela de preço do cliente', () => {
  it('customerCode em produtos restringe à tabela do cadastro e da condição fixa, na vigência mais recente', async () => {
    const g = transport([]);
    await readPage(g, { resource: 'products', filters: { customerCode: 131 } }, seller).catch(() => undefined);
    const sql = g.select.mock.calls.map(c => c[0]).find(q => String(q).includes('TGFEXC')) as string;
    expect(sql).toContain("P.USOPROD='V'");
    expect(sql).toContain('PA.CODPARC=131');
    expect(sql).toContain('L.SUGTIPNEGSAID');
    expect(sql).toContain("E.TIPO='V'");
    expect(sql).toContain('V.RN=1');
  });
});
describe('cadastro atual no relatório de clientes', () => {
  it.each(['all', 'S', 'N'] as const)('filtra ATIVO=%s sem trocar a carteira nem o histórico autorizado', async active => {
    const g = transport([{ CODPARC: 10, CODEMP: null, ATIVO: active === 'all' ? null : active }], 1);
    const result = await readWindow(g, { resource: 'customers', offset: 0, limit: 10, filters: { active, customerCode: 10, sellerCode: 12 } }, seller);
    expect(result.items[0]).toMatchObject({ id: 'sankhya:customer:10', active: active === 'all' ? null : active === 'S' });
    for (const [sql, limit] of g.select.mock.calls) {
      expect(sql).toContain('P.CODVEND=12'); expect(sql).toContain('P.CODPARC=10');
      expect(sql).toContain('P.CODEMP IN (1)'); expect(limit).toBeLessThanOrEqual(50);
      if (active === 'all') expect(sql).not.toMatch(/P\.ATIVO=/);
      else expect(sql).toContain(`P.ATIVO='${active}'`);
    }
  });
  it('gestor só reduz o escopo explícito; o filtro não concede outro vendedor', async () => {
    const g = transport([], 0), scope = { role: 'gestor' as const, sellerCode: 34, companyCodes: [1, 4], teamSellerCodes: [12] };
    await readWindow(g, { resource: 'customers', offset: 0, limit: 50, filters: { active: 'all', sellerCode: 12 } }, scope);
    expect(g.select.mock.calls[0]![0]).toContain('P.CODVEND IN (34,12)');
    expect(g.select.mock.calls[0]![0]).toContain('P.CODVEND=12');
    g.select.mockClear();
    await expect(readWindow(g, { resource: 'customers', offset: 0, limit: 10, filters: { active: 'all', sellerCode: 99 } }, scope)).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    expect(g.select).not.toHaveBeenCalled();
  });
  it.each([
    { filters: { active: 'Ativo' } }, { filters: { active: null } }, { filters: { active: true } },
    { filters: { customerCode: 0 } }, { filters: { customerCode: '10' } }, { filters: { customerCode: 1.5 } },
    { filters: { customerCode: 2147483648 } }, { filters: { customerCode: '1 OR 1=1' } },
    { resource: 'products', filters: { active: 'all' } }, { resource: 'sellers', filters: { active: 'N' } },
    { resource: 'sellers', filters: { customerCode: 10 } },
  ])('recusa filtro incompatível sem consultar o ERP: %j', async bad => {
    const g = transport();
    await expect(readWindow(g, { resource: 'customers', offset: 0, limit: 10, ...bad } as WindowInput, admin)).rejects.toBeDefined();
    expect(g.select).not.toHaveBeenCalled();
  });
});

describe('diagnóstico explícito de catálogo vazio',()=>{
  it.each([[0,0,'missing'],[1,0,'unavailable'],[1,1,'empty']] as const)('associação %s e vigência %s resultam em %s',async(associated,current,state)=>{
    const g={select:vi.fn(async(sql:string)=>sql.startsWith('SELECT COUNT(*) AS TOTAL')?[{TOTAL:0}]:sql.startsWith('WITH C AS')?[{ASSOCIATED:associated,CURRENT_TABLES:current}]:sql.startsWith('SELECT P.CODPARC')?[{CODPARC:131,CODEMP:null,ATIVO:'S'}]:[])};
    expect(await readWindow(g,{resource:'products',filters:{customerCode:131},offset:0,limit:50},admin)).toMatchObject({total:0,priceTableState:state});
  });
  it('zero resultados de busca não prova ausência de tabela',async()=>{
    const g=transport([],0,10);expect(await readWindow(g,{resource:'products',filters:{customerCode:131},search:'inexistente',offset:0,limit:50},admin)).not.toHaveProperty('priceTableState');expect(g.select.mock.calls).toHaveLength(3);
  });
});
