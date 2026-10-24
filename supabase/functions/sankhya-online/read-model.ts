import { SankhyaError, type SankhyaGateway } from './gateway.ts';
import { foldERPText } from '../../../src/lib/erp-order.ts';

// Escopo fornecido exclusivamente pelo servidor após autenticação; nunca copiar do corpo HTTP.
export type ReadScope = { role: 'administrador' | 'gestor' | 'vendedor'; sellerCode?: number; companyCodes?: readonly number[]; teamSellerCodes?: readonly number[] };
export type Resource = 'customers' | 'products' | 'sellers';
export type SortKey = 'code' | 'name' | 'city' | 'state' | 'seller' | 'blocked' | 'source' | 'icon' | 'category' | 'unit' | 'price';
export type WindowInput = Omit<PageInput, 'page' | 'pageSize'> & { offset: number; limit: number };
export type PageInput = { resource: Resource; page?: number; pageSize?: 10 | 20 | 50; search?: string; sort?: SortKey; direction?: 'asc' | 'desc'; filters?: { companyCode?: number; sellerCode?: number; managerCode?: number; categoryCode?: number; categoryName?: string; cityCode?: number } };
export type RecordInput = { resource: Resource; id: number | string };
export type FacetInput = PageInput & { facet: 'category' | 'seller' | 'company' | 'city' };
type Row = Record<string, unknown>;
type Transport = Pick<SankhyaGateway, 'select'>;
const invalid = (): never => { throw new SankhyaError('INVALID_REQUEST', 'Parâmetros de consulta inválidos.', 400); };
const identity = (): never => { throw new SankhyaError('ERP_IDENTITY_REQUIRED', 'Vínculo explícito de vendedor e filial ERP necessário.', 403); };
const integer = (n: unknown, min = 1): number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= 2147483647 ? n : invalid();
function keys(value: unknown, allowed: readonly string[]): asserts value is Row {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) invalid();
}
export function scopeOf(scope: ReadScope): { companies: number[]; seller: number | null; sellers: readonly number[] | null } {
  if (!scope || !['administrador', 'gestor', 'vendedor'].includes(scope.role)) return identity();
  if (scope.role === 'administrador') return { companies: [1, 4], seller: null, sellers: null };
  if (!Number.isSafeInteger(scope.sellerCode) || scope.sellerCode! <= 0 || scope.sellerCode! > 2147483647 ||
    !Array.isArray(scope.companyCodes) || scope.companyCodes.length < 1 || scope.companyCodes.length > 2 ||
    scope.companyCodes.some(c => c !== 1 && c !== 4) || new Set(scope.companyCodes).size !== scope.companyCodes.length) return identity();
  const team = scope.teamSellerCodes ?? [];
  if (!Array.isArray(team) || team.length > 49 || new Set(team).size !== team.length ||
    team.some(c => !Number.isSafeInteger(c) || c < 1 || c > 2147483647 || c === scope.sellerCode) ||
    scope.role !== 'gestor' && team.length > 0) return identity();
  // Somente o vínculo privado pode fornecer equipe; CODGER/histórico não concedem acesso automaticamente.
  return { companies: [...scope.companyCodes], seller: scope.sellerCode!, sellers: [scope.sellerCode!, ...team] };
}
export function sellerAllowed(scope: ReturnType<typeof scopeOf>, code: number): boolean {
  return scope.sellers === null || scope.sellers.includes(code);
}
export function sellerPredicate(scope: ReturnType<typeof scopeOf>, column: 'P.CODVEND' | 'C.CODVEND'): string | undefined {
  return scope.sellers === null ? undefined : scope.sellers.length === 1
    ? `${column}=${scope.sellers[0]}` : `${column} IN (${scope.sellers.join(',')})`;
}
function resource(value: unknown): Resource { if (!['customers', 'products', 'sellers'].includes(String(value)) || typeof value !== 'string') return invalid(); return value as Resource; }
function searchText(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > 120 || /[\x00-\x1f;]|--|\/\*|\*\//.test(value) || /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|GRANT|EXECUTE|CALL|DBMS_|UTL_)\b/i.test(value)) return invalid();
  return value.trim();
}
const literal = (s: string): string => `'${s.replace(/'/g, "''")}'`;
function like(s: string): string { return literal('%' + foldERPText(s).replace(/[!%_]/g, c => '!' + c) + '%'); }
const config = {
  customers: { from: 'TGFPAR P LEFT JOIN TGFVEN V ON V.CODVEND=P.CODVEND LEFT JOIN TSICID C ON C.CODCID=P.CODCID LEFT JOIN TSIUFS U ON U.CODUF=C.UF LEFT JOIN TSIEND E ON E.CODEND=P.CODEND LEFT JOIN TSIBAI B ON B.CODBAI=P.CODBAI', id: 'P.CODPARC', name: 'P.RAZAOSOCIAL', fields: 'P.CODPARC,P.RAZAOSOCIAL,P.NOMEPARC,P.CGC_CPF,P.TIPPESSOA,P.CODVEND,P.CODTAB,P.CODEMP,P.ATIVO,P.CLIENTE,P.BLOQUEAR,P.CODCID,P.CODEND,P.CODBAI,P.NUMEND,P.COMPLEMENTO,P.CEP,P.TELEFONE,P.EMAIL,P.IDENTINSCESTAD,P.LIMCRED,V.APELIDO,C.NOMECID,U.UF,E.NOMEEND,E.TIPO,B.NOMEBAI', searches: ['P.RAZAOSOCIAL', 'P.NOMEPARC', 'P.CGC_CPF', 'TO_CHAR(P.CODPARC)', 'P.IDENTINSCESTAD', 'C.NOMECID', 'U.UF', 'V.APELIDO', 'P.EMAIL', 'P.TELEFONE', 'P.CEP', 'E.NOMEEND', 'P.NUMEND', 'P.COMPLEMENTO', 'B.NOMEBAI', "'observado'"] },
  products: { from: 'TGFPRO P LEFT JOIN TGFGRU G ON G.CODGRUPOPROD=P.CODGRUPOPROD', id: 'P.CODPROD', name: 'P.DESCRPROD', fields: 'P.CODPROD,P.DESCRPROD,P.REFERENCIA,P.CODGRUPOPROD,P.CODVOL,P.ATIVO,P.DECQTD,P.AGRUPMIN,P.BLOQVENDAFRAC,G.DESCRGRUPOPROD', searches: ['P.DESCRPROD', 'P.REFERENCIA', 'TO_CHAR(P.CODPROD)', 'G.DESCRGRUPOPROD', 'P.CODVOL', "'observado'"] },
  sellers: { from: 'TGFVEN P', id: 'P.CODVEND', name: 'P.APELIDO', fields: 'P.CODVEND,P.APELIDO,P.TIPVEND,P.CODGER,P.CODEMP,P.ATIVO', searches: ['P.APELIDO', 'TO_CHAR(P.CODVEND)', "'observado'"] },
};
const foldSQL = (field: string) => `ASCIISTR(TRANSLATE(UPPER(${field}),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN'))`;
const sortFields: Record<Resource, Partial<Record<SortKey, string>>> = {
  customers: { code: 'P.CODPARC', name: foldSQL('P.RAZAOSOCIAL'), city: foldSQL('C.NOMECID'), state: foldSQL('U.UF'), seller: foldSQL('V.APELIDO'), blocked: 'CAST(NULL AS NUMBER)', source: foldSQL("'observado'") },
  products: { icon: 'CAST(NULL AS VARCHAR2(1))', code: 'P.CODPROD', name: foldSQL('P.DESCRPROD'), category: foldSQL('G.DESCRGRUPOPROD'), unit: foldSQL('P.CODVOL'), price: 'CAST(NULL AS NUMBER)', source: foldSQL("'observado'") },
  sellers: { code: 'P.CODVEND', name: foldSQL('P.APELIDO'), source: foldSQL("'observado'") },
};
function baseWhere(r: Resource, scope: ReturnType<typeof scopeOf>, active: boolean, companies = scope.companies): string[] {
  const list = companies.join(',');
  const where = active ? ["P.ATIVO='S'"] : [];
  if (r === 'customers') {
    where.push("P.CLIENTE='S'", `(P.CODEMP IN (${list}) OR (P.CODEMP IS NULL AND EXISTS (SELECT 1 FROM TGFCAB H WHERE H.CODPARC=P.CODPARC AND H.CODEMP IN (${list}) AND H.TIPMOV IN ('P','V'))))`);
    const seller = sellerPredicate(scope, 'P.CODVEND'); if (seller) where.push(seller);
  } else if (r === 'products') {
    where.push(`EXISTS (SELECT 1 FROM TGFITE I JOIN TGFCAB H ON H.NUNOTA=I.NUNOTA WHERE I.CODPROD=P.CODPROD AND H.CODEMP IN (${list}) AND H.TIPMOV IN ('P','V'))`);
  } else {
    // Cadastro compartilhado permite listar o vendedor, nunca conceder carteira.
    where.push(`P.CODVEND<>0`, `(P.CODEMP IN (${list}) OR P.CODEMP IS NULL)`);
    const seller = sellerPredicate(scope, 'P.CODVEND'); if (seller) where.push(seller);
  }
  return where;
}
function queryParts(input: PageInput & Partial<WindowInput>, trustedScope: ReadScope, extraKeys: string[] = [], window = false) {
  keys(input, ['resource', ...(window ? ['offset', 'limit'] : ['page', 'pageSize']), 'search', 'sort', 'direction', 'filters', ...extraKeys]);
  const r = resource(input.resource), scope = scopeOf(trustedScope);
  const page = input.page === undefined ? 1 : integer(input.page);
  const size = window ? integer(input.limit) : input.pageSize ?? 20;
  if (window ? size > 50 : ![10, 20, 50].includes(size)) invalid();
  const offset = window ? integer(input.offset, 0) : (page - 1) * size;
  if (!Number.isSafeInteger(offset) || offset > 2147483647 - size) invalid();
  const sort = input.sort ?? 'code', direction = input.direction ?? 'asc';
  if (typeof sort !== 'string' || !Object.hasOwn(sortFields[r], sort) || !['asc', 'desc'].includes(direction)) invalid();
  const filters = input.filters ?? {};
  keys(filters, ['companyCode', 'sellerCode', 'managerCode', 'categoryCode', 'categoryName', 'cityCode']);
  let companies = scope.companies;
  if (filters.companyCode !== undefined) {
    const company = integer(filters.companyCode);
    if (!companies.includes(company)) throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Filial fora do escopo autorizado.', 403);
    companies = [company];
  }
  const where = baseWhere(r, scope, true, companies);
  if (filters.sellerCode !== undefined) {
    const seller = integer(filters.sellerCode);
    if (r === 'products') invalid();
    if (!sellerAllowed(scope, seller)) throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Vendedor fora do escopo autorizado.', 403);
    where.push(`${r === 'customers' ? 'P.CODVEND' : config.sellers.id}=${seller}`);
  }
  if (filters.managerCode !== undefined) {
    if (r !== 'sellers') invalid();
    const manager = integer(filters.managerCode);
    if (trustedScope.role !== 'administrador' && (trustedScope.role !== 'gestor' || manager !== scope.seller))
      throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Vendedor fora do escopo autorizado.', 403);
    where.push(`P.CODGER=${manager}`);
  }
  if (filters.categoryCode !== undefined) { if (r !== 'products') invalid(); where.push(`P.CODGRUPOPROD=${integer(filters.categoryCode, 0)}`); }
  if (filters.categoryName !== undefined) {
    if (r !== 'products' || typeof filters.categoryName !== 'string' || !filters.categoryName.length || filters.categoryName.length > 120) invalid();
    searchText(filters.categoryName);
    where.push(`G.DESCRGRUPOPROD=${literal(filters.categoryName)}`);
  }
  if (filters.cityCode !== undefined) { if (r !== 'customers') invalid(); where.push(`P.CODCID=${integer(filters.cityCode, 0)}`); }
  const search = searchText(input.search), withoutSearch = [...where];
  if (search) where.push(`(${config[r].searches.map(field => `${foldSQL(field)} LIKE ${like(search)} ESCAPE '!'`).join(' OR ')})`);
  const c = config[r];
  const sortValue = sortFields[r][sort]!;
  const numeric = ['code', 'blocked', 'price'].includes(sort);
  const ordered = numeric ? sortValue : `NLSSORT(${sortValue},'NLS_SORT=BINARY')`;
  const order = `${ordered} ${direction.toUpperCase()} NULLS LAST${sort !== 'code' ? `,${c.id} ${direction.toUpperCase()} NULLS LAST` : ''}`;
  return { r, c, page, size, offset, where, withoutSearch, order, sortValue, numeric };
}
async function count(gateway: Transport, from: string, where: string[]): Promise<number> {
  const rows = await gateway.select(`SELECT COUNT(*) AS TOTAL FROM ${from} WHERE ${where.join(' AND ')}`, 1);
  return total(rows);
}
function total(rows: Row[]): number {
  const value = rows[0]?.['TOTAL'];
  if (rows.length !== 1 || value === null || value === undefined || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new SankhyaError('ERP_INVALID_RESPONSE', 'Contagem ERP incompatível.');
  return Number(value);
}
const text = (v: unknown): string | null => v === undefined || v === null ? null : String(v);
const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const result = Number(v);
  if (!Number.isFinite(result)) throw new SankhyaError('ERP_INVALID_RESPONSE', 'Valor numérico ERP incompatível.');
  return result;
};
function dto(r: Resource, row: Row) {
  if (r === 'customers' && (row['CODEMP'] === undefined || row['CODEMP'] === '')) throw new SankhyaError('ERP_INVALID_RESPONSE', 'Filial ERP não confirmada.');
  const common = { source: 'observado', readOnly: true, active: row['ATIVO'] === 'S' };
  if (r === 'customers') return { ...common, id: `sankhya:customer:${row['CODPARC']}`, code: text(row['CODPARC']), name: text(row['RAZAOSOCIAL']), fantasy: text(row['NOMEPARC']), cnpj: text(row['CGC_CPF']), ie: row['TIPPESSOA'] === 'J' ? text(row['IDENTINSCESTAD']) : null, credit: num(row['LIMCRED']), city: text(row['NOMECID']), state: text(row['UF']), district: text(row['NOMEBAI']), address: [[row['TIPO'], row['NOMEEND']].filter(Boolean).join(' '), row['NUMEND'], row['COMPLEMENTO'], row['NOMEBAI']].filter(Boolean).join(', ') || null, number: text(row['NUMEND']), complement: text(row['COMPLEMENTO']), cep: text(row['CEP']), phone: text(row['TELEFONE']), email: text(row['EMAIL']), seller: text(row['APELIDO']), sellerCode: num(row['CODVEND']), creditBlocked: row['BLOQUEAR'] === 'S', erp: { source: 'sankhya', readOnly: true, partnerCode: num(row['CODPARC']), sellerCode: num(row['CODVEND']), companyCode: num(row['CODEMP']), tableCode: num(row['CODTAB']), personType: text(row['TIPPESSOA']), creditBlocked: row['BLOQUEAR'] === 'S', contexts: [] } };
  if (r === 'products') {
    if (row['AGRUPMIN'] === undefined || ![null, 'S', 'N'].includes(row['BLOQVENDAFRAC'] as null | string)) throw new SankhyaError('ERP_INVALID_RESPONSE', 'Regras de quantidade ERP não confirmadas.');
    const grouping = num(row['AGRUPMIN']);
    if (grouping !== null && grouping < 0) throw new SankhyaError('ERP_INVALID_RESPONSE', 'Agrupamento ERP inválido.');
    return { ...common, id: `sankhya:product:${row['CODPROD']}`, code: text(row['CODPROD']), name: text(row['DESCRPROD']), reference: text(row['REFERENCIA']), category: text(row['DESCRGRUPOPROD']), categoryCode: num(row['CODGRUPOPROD']), categoryName: text(row['DESCRGRUPOPROD']), unit: text(row['CODVOL']), price: null, multiple: grouping === 0 ? null : grouping, erp: { source: 'sankhya', readOnly: true, productCode: num(row['CODPROD']), quantityDecimals: num(row['DECQTD']), fractionBlocked: row['BLOQVENDAFRAC'] === 'S', contexts: [] } };
  }
  return { ...common, id: `sankhya:seller:${row['CODVEND']}`, code: num(row['CODVEND']), name: text(row['APELIDO']), erp: { source: 'sankhya', readOnly: true, sellerCode: num(row['CODVEND']), managerCode: num(row['CODGER']), companyCode: num(row['CODEMP']), sellerType: text(row['TIPVEND']) } };
}
const observed = () => ({ source: 'sankhya' as const, readOnly: true as const, readAt: new Date().toISOString() });
export async function readPage(gateway: Transport, input: PageInput, scope: ReadScope) {
  const q = queryParts(input, scope);
  const filteredTotal = await count(gateway, q.c.from, q.where);
  const totalWithoutSearch = q.where.length === q.withoutSearch.length ? filteredTotal : await count(gateway, q.c.from, q.withoutSearch);
  const rows = await gateway.select(`SELECT ${q.c.fields},${q.sortValue} AS SORT_VALUE FROM ${q.c.from} WHERE ${q.where.join(' AND ')} ORDER BY ${q.order} OFFSET ${q.offset} ROWS FETCH NEXT ${q.size} ROWS ONLY`, q.size);
  return { ...observed(), items: rows.map(row => ({ ...dto(q.r, row), _sortValue: q.numeric ? num(row['SORT_VALUE']) : text(row['SORT_VALUE']) })), page: q.page, pageSize: q.size, total: filteredTotal, totalWithoutSearch, hasMore: q.offset + rows.length < filteredTotal };
}
export async function readWindow(gateway: Transport, input: WindowInput, scope: ReadScope) {
  const q = queryParts(input, scope, [], true);
  const filteredTotal = await count(gateway, q.c.from, q.where);
  const totalWithoutSearch = q.where.length === q.withoutSearch.length ? filteredTotal : await count(gateway, q.c.from, q.withoutSearch);
  const rows = await gateway.select(`SELECT ${q.c.fields},${q.sortValue} AS SORT_VALUE FROM ${q.c.from} WHERE ${q.where.join(' AND ')} ORDER BY ${q.order} OFFSET ${q.offset} ROWS FETCH NEXT ${q.size} ROWS ONLY`, q.size);
  return { ...observed(), items: rows.map(row => ({ ...dto(q.r, row), _sortValue: q.numeric ? num(row['SORT_VALUE']) : text(row['SORT_VALUE']) })), total: filteredTotal, totalWithoutSearch, offset: q.offset };
}
export async function readRecord(gateway: Transport, input: RecordInput, scope: ReadScope) {
  keys(input, ['resource', 'id']);
  const r = resource(input.resource), allowed = scopeOf(scope), c = config[r];
  let id: unknown = input.id;
  if (typeof id === 'string') {
    const prefix = r === 'customers' ? 'sankhya:customer:' : r === 'products' ? 'sankhya:product:' : '';
    const rawId = prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id;
    if (!/^[1-9]\d{0,9}$/.test(rawId)) invalid();
    id = Number(rawId);
  }
  const code = integer(id), where = baseWhere(r, allowed, r === 'sellers');
  where.push(`${c.id}=${code}`);
  const rows = await gateway.select(`SELECT ${c.fields} FROM ${c.from} WHERE ${where.join(' AND ')} ORDER BY ${c.id} FETCH FIRST 1 ROWS ONLY`, 1);
  return { ...observed(), record: rows.length ? dto(r, rows[0]!) : null };
}
// Facetas são consultas agrupadas paginadas no universo completo, nunca deduzidas da página de cadastros.
export async function readFacets(gateway: Transport, input: FacetInput, scope: ReadScope) {
  const q = queryParts(input, scope, ['facet']);
  let code: string, label: string;
  if (input.facet === 'category' && q.r === 'products') { code = 'P.CODGRUPOPROD'; label = 'G.DESCRGRUPOPROD'; }
  else if (input.facet === 'seller' && q.r === 'customers') { code = 'P.CODVEND'; label = 'V.APELIDO'; }
  else if (input.facet === 'city' && q.r === 'customers') { code = 'P.CODCID'; label = 'C.NOMECID'; }
  else if (input.facet === 'company' && q.r === 'sellers') { code = 'P.CODEMP'; label = 'TO_CHAR(P.CODEMP)'; }
  else return invalid();
  const grouped = (where: string[]) => `SELECT ${code} AS CODE,${label} AS NAME,COUNT(*) AS RECORD_COUNT FROM ${q.c.from} WHERE ${[...where, `${code} IS NOT NULL`].join(' AND ')} GROUP BY ${code},${label}`;
  const filteredTotal = total(await gateway.select(`SELECT COUNT(*) AS TOTAL FROM (${grouped(q.where)}) F`, 1));
  const totalWithoutSearch = q.where.length === q.withoutSearch.length ? filteredTotal : total(await gateway.select(`SELECT COUNT(*) AS TOTAL FROM (${grouped(q.withoutSearch)}) F`, 1));
  const rows = await gateway.select(`SELECT CODE,NAME,RECORD_COUNT FROM (${grouped(q.where)}) F ORDER BY ${input.sort === 'name' ? `NAME ${(input.direction ?? 'asc').toUpperCase()} NULLS LAST,` : ''}CODE ${(input.direction ?? 'asc').toUpperCase()} OFFSET ${q.offset} ROWS FETCH NEXT ${q.size} ROWS ONLY`, q.size);
  return { ...observed(), items: rows.map(row => ({ code: num(row['CODE']), name: text(row['NAME']), count: num(row['RECORD_COUNT']) })), page: q.page, pageSize: q.size, total: filteredTotal, totalWithoutSearch, hasMore: q.offset + rows.length < filteredTotal };
}
export function readCategories(gateway: Transport, input: Omit<PageInput, 'resource'>, scope: ReadScope) {
  keys(input, ['page', 'pageSize', 'search', 'sort', 'direction', 'filters']);
  return readFacets(gateway, { ...input, resource: 'products', facet: 'category' }, scope);
}
