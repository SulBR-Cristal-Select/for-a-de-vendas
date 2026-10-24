import { SankhyaError, type SankhyaGateway } from './gateway.ts';
import type { ReadScope } from './read-model.ts';
import { foldERPText } from '../../../src/lib/erp-order.ts';

type Row = Record<string, unknown>;
type Transport = Pick<SankhyaGateway, 'select'>;
export type HistoryInput = { resource: 'orders' | 'invoices'; offset: number; limit: number; customerId?: string; search?: string; sort?: string; direction?: 'asc' | 'desc'; from?: string; to?: string; companyCode?: 1 | 4 };
export type DocumentInput = { id: string; offset?: number; limit?: number };
const invalid = (): never => { throw new SankhyaError('INVALID_REQUEST', 'Parâmetros de histórico inválidos.', 400); };
const incompatible = (): never => { throw new SankhyaError('ERP_INVALID_RESPONSE', 'Resposta de histórico ERP incompatível.'); };
function keys(value: unknown, allowed: string[]): asserts value is Row {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) invalid();
}
const integer = (v: unknown, min = 1): number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= 2147483647 ? v : invalid();
function identifier(v: unknown, prefix: string): number {
  if (typeof v !== 'string' || !v.startsWith(prefix) || !/^[1-9]\d{0,9}$/.test(v.slice(prefix.length))) return invalid();
  return integer(Number(v.slice(prefix.length)));
}
function windowOf(offset: unknown, limit: unknown) {
  const start = integer(offset, 0), size = integer(limit);
  if (size > 50 || start > 2147483647 - size) invalid();
  return { offset: start, limit: size };
}
function scopeOf(scope: ReadScope) {
  const fail = (): never => { throw new SankhyaError('ERP_IDENTITY_REQUIRED', 'Vínculo explícito de vendedor e filial ERP necessário.', 403); };
  if (!scope || !['administrador', 'gestor', 'vendedor'].includes(scope.role)) return fail();
  if (scope.role === 'administrador') return { companies: [1, 4], seller: null };
  if (!Number.isSafeInteger(scope.sellerCode) || scope.sellerCode! <= 0 || scope.sellerCode! > 2147483647 || !Array.isArray(scope.companyCodes) || !scope.companyCodes.length || scope.companyCodes.some(c => c !== 1 && c !== 4)) return fail();
  return { companies: [...new Set(scope.companyCodes)], seller: scope.sellerCode! };
}
const text = (v: unknown): string | null => v == null ? null : typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER) ? String(v) : incompatible();
function numeric(v: unknown): number | null {
  if (v == null || v === '') return null;
  if ((typeof v !== 'number' && typeof v !== 'string') || (typeof v === 'string' && !/^-?\d+(?:\.\d+)?$/.test(v))) return incompatible();
  const n = Number(v);
  // Inteiros inseguros não podem ser apresentados como valores exatos.
  if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) return incompatible();
  return n;
}
function code(v: unknown): number {
  const n = numeric(v);
  return n !== null && Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : incompatible();
}
function nullableCode(v: unknown): number | null {
  const n = numeric(v);
  return n === null || (Number.isSafeInteger(n) && n >= 0 && n <= 2147483647) ? n : incompatible();
}
function flag(v: unknown): boolean | null {
  const n = numeric(v);
  return n === null ? null : n === 0 ? false : n === 1 ? true : incompatible();
}
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;
const foldSQL = (s: string) => `ASCIISTR(TRANSLATE(UPPER(${s}),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN'))`;
function searchText(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > 120 || /[\x00-\x1f;]|--|\/\*|\*\//.test(value) || /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|GRANT|EXECUTE|CALL|DBMS_|UTL_)\b/i.test(value)) return invalid();
  return value.trim();
}
function dateInput(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return invalid();
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) return invalid();
  return value;
}
const fromSQL = 'TGFCAB C JOIN TGFPAR P ON P.CODPARC=C.CODPARC LEFT JOIN TGFVEN V ON V.CODVEND=C.CODVEND LEFT JOIN TGFTOP T ON T.CODTIPOPER=C.CODTIPOPER AND C.DHTIPOPER=T.DHALTER LEFT JOIN TGFTPV TPV ON TPV.CODTIPVENDA=C.CODTIPVENDA AND C.DHTIPVENDA=TPV.DHALTER';
const fields = `C.NUNOTA,C.NUMNOTA,C.CODEMP,C.CODPARC,C.CODVEND,C.TIPMOV,C.STATUSNOTA,TO_CHAR(C.DTNEG,'YYYY-MM-DD') AS DOCUMENT_DATE,C.VLRNOTA,C.CODTIPOPER,TO_CHAR(C.DHTIPOPER,'YYYY-MM-DD"T"HH24:MI:SS') AS OPERATION_VERSION,C.CODTIPVENDA,TO_CHAR(C.DHTIPVENDA,'YYYY-MM-DD"T"HH24:MI:SS') AS PAYMENT_VERSION,P.RAZAOSOCIAL,V.APELIDO,T.DESCROPER,CASE WHEN EXISTS (SELECT 1 FROM TGFVAR R WHERE R.NUNOTA=C.NUNOTA) THEN 1 ELSE 0 END AS HAS_ORIGINS,CASE WHEN EXISTS (SELECT 1 FROM TGFVAR R WHERE R.NUNOTAORIG=C.NUNOTA) THEN 1 ELSE 0 END AS HAS_DESTINATIONS`;
function baseWhere(scope: ReturnType<typeof scopeOf>, movement: 'P' | 'V', companies = scope.companies): string[] {
  const list = companies.join(',');
  // Sem filtro ATIVO: cadastros hoje inativos continuam compondo o histórico.
  const where = [`C.TIPMOV='${movement}'`, `C.CODEMP IN (${list})`, "P.CLIENTE='S'", `(P.CODEMP IN (${list}) OR (P.CODEMP IS NULL AND EXISTS (SELECT 1 FROM TGFCAB H WHERE H.CODPARC=P.CODPARC AND H.CODEMP IN (${list}) AND H.TIPMOV IN ('P','V'))))`];
  if (scope.seller !== null) where.push(`P.CODVEND=${scope.seller}`);
  return where;
}
async function count(g: Transport, from: string, where: string[]) {
  const rows = await g.select(`SELECT COUNT(*) AS TOTAL FROM ${from} WHERE ${where.join(' AND ')}`, 1);
  const n = rows.length === 1 ? numeric(rows[0]?.['TOTAL']) : null;
  return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : incompatible();
}
function verifyPage(rows: Row[], total: number, offset: number, limit: number) {
  if (rows.length !== Math.min(limit, Math.max(0, total - offset))) incompatible();
}
const observed = () => ({ source: 'sankhya' as const, readOnly: true as const, readAt: new Date().toISOString() });
function documentDTO(row: Row, movement: 'P' | 'V', companies: number[]) {
  const documentCode = code(row['NUNOTA']), companyCode = code(row['CODEMP']), customerCode = code(row['CODPARC']);
  if (row['TIPMOV'] !== movement || !companies.includes(companyCode)) incompatible();
  const operationCode = nullableCode(row['CODTIPOPER']), statusCode = text(row['STATUSNOTA']);
  return {
    source: 'observado' as const, readOnly: true as const,
    id: `sankhya:${movement === 'P' ? 'order' : 'invoice'}:${documentCode}`,
    number: text(row['NUMNOTA']), date: text(row['DOCUMENT_DATE']),
    customerId: `sankhya:customer:${customerCode}`, customerName: text(row['RAZAOSOCIAL']),
    sellerCode: nullableCode(row['CODVEND']), sellerName: text(row['APELIDO']), total: numeric(row['VLRNOTA']),
    status: statusCode === 'L' ? 'confirmado' as const : null,
    operationName: operationCode === 1001 ? 'Venda normal' : text(row['DESCROPER']),
    erp: { source: 'sankhya' as const, companyCode, documentCode, movement, operationCode,
      operationVersion: text(row['OPERATION_VERSION']), paymentCode: nullableCode(row['CODTIPVENDA']),
      paymentVersion: text(row['PAYMENT_VERSION']), statusCode,
      // Somente existência de relações ERP; não infere pedido local, entrega ou faturamento completo.
      hasOrigins: flag(row['HAS_ORIGINS']), hasDestinations: flag(row['HAS_DESTINATIONS']) },
  };
}
const sorts: Record<string, string> = { code: 'C.NUNOTA', number: 'C.NUMNOTA', date: 'C.DTNEG', customer: foldSQL('P.RAZAOSOCIAL'), seller: foldSQL('V.APELIDO'), total: 'C.VLRNOTA', status: 'C.STATUSNOTA', operation: foldSQL('T.DESCROPER'), company: 'C.CODEMP' };
export async function readHistory(gateway: Transport, input: HistoryInput, scope: ReadScope) {
  keys(input, ['resource', 'offset', 'limit', 'customerId', 'search', 'sort', 'direction', 'from', 'to', 'companyCode']);
  if (input.resource !== 'orders' && input.resource !== 'invoices') invalid();
  const allowed = scopeOf(scope), page = windowOf(input.offset, input.limit), movement = input.resource === 'orders' ? 'P' : 'V';
  let companies = allowed.companies;
  if (input.companyCode !== undefined) {
    integer(input.companyCode);
    if (!companies.includes(input.companyCode)) throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Filial fora do escopo autorizado.', 403);
    companies = [input.companyCode];
  }
  const sort = input.sort ?? 'date', direction = input.direction ?? 'desc';
  if (typeof sort !== 'string' || !Object.hasOwn(sorts, sort) || !['asc', 'desc'].includes(direction)) invalid();
  const start = dateInput(input.from), end = dateInput(input.to), search = searchText(input.search);
  if (start && end && start > end) invalid();
  const where = baseWhere(allowed, movement, companies);
  if (input.customerId !== undefined) where.push(`P.CODPARC=${identifier(input.customerId, 'sankhya:customer:')}`);
  if (start) where.push(`C.DTNEG>=TO_DATE(${literal(start)},'YYYY-MM-DD')`);
  if (end) where.push(`C.DTNEG<TO_DATE(${literal(end)},'YYYY-MM-DD')+1`);
  const withoutSearch = [...where];
  if (search) {
    const term = literal('%' + foldERPText(search).replace(/[!%_]/g, c => '!' + c) + '%');
    where.push(`(${['TO_CHAR(C.NUNOTA)', 'TO_CHAR(C.NUMNOTA)', 'P.RAZAOSOCIAL', 'V.APELIDO', 'T.DESCROPER', 'C.STATUSNOTA'].map(f => `${foldSQL(f)} LIKE ${term} ESCAPE '!'`).join(' OR ')})`);
  }
  const total = await count(gateway, fromSQL, where);
  const totalWithoutSearch = search ? await count(gateway, fromSQL, withoutSearch) : total;
  const order = `${sorts[sort]} ${direction.toUpperCase()} NULLS LAST${sort !== 'code' ? `,C.NUNOTA ${direction.toUpperCase()} NULLS LAST` : ''}`;
  const rows = await gateway.select(`SELECT ${fields} FROM ${fromSQL} WHERE ${where.join(' AND ')} ORDER BY ${order} OFFSET ${page.offset} ROWS FETCH NEXT ${page.limit} ROWS ONLY`, page.limit);
  verifyPage(rows, total, page.offset, page.limit);
  return { ...observed(), items: rows.map(r => documentDTO(r, movement, companies)), total, totalWithoutSearch, offset: page.offset };
}
export async function readDocument(gateway: Transport, input: DocumentInput, scope: ReadScope) {
  keys(input, ['id', 'offset', 'limit']);
  const allowed = scopeOf(scope), page = windowOf(input.offset ?? 0, input.limit ?? 50);
  if (typeof input.id !== 'string' || !/^sankhya:(order|invoice):[1-9]\d{0,9}$/.test(input.id)) invalid();
  const movement = input.id.startsWith('sankhya:order:') ? 'P' : 'V';
  const id = identifier(input.id, movement === 'P' ? 'sankhya:order:' : 'sankhya:invoice:');
  const where = [...baseWhere(allowed, movement), `C.NUNOTA=${id}`];
  const rows = await gateway.select(`SELECT ${fields} FROM ${fromSQL} WHERE ${where.join(' AND ')} ORDER BY C.NUNOTA FETCH FIRST 1 ROWS ONLY`, 1);
  if (rows.length > 1) incompatible();
  if (!rows.length) return { ...observed(), record: null, items: [], total: 0, totalWithoutSearch: 0, offset: page.offset, limit: page.limit, hasMore: false };
  const record = documentDTO(rows[0]!, movement, allowed.companies);
  if (record.erp.documentCode !== id) incompatible();
  // Reaplica o escopo nas consultas de itens; nenhuma leitura por NUNOTA solto.
  const itemFrom = `TGFITE I JOIN TGFCAB C ON C.NUNOTA=I.NUNOTA JOIN TGFPAR P ON P.CODPARC=C.CODPARC LEFT JOIN TGFPRO PR ON PR.CODPROD=I.CODPROD`;
  const total = await count(gateway, itemFrom, where);
  const items = await gateway.select(`SELECT I.NUNOTA,I.SEQUENCIA,I.CODPROD,PR.DESCRPROD,I.CODVOL,I.QTDNEG,I.VLRUNIT,I.VLRTOT FROM ${itemFrom} WHERE ${where.join(' AND ')} ORDER BY I.SEQUENCIA ASC OFFSET ${page.offset} ROWS FETCH NEXT ${page.limit} ROWS ONLY`, page.limit);
  verifyPage(items, total, page.offset, page.limit);
  return { ...observed(), record, items: items.map(r => {
    if (code(r['NUNOTA']) !== id) incompatible();
    const sequence = numeric(r['SEQUENCIA']);
    if (sequence === null || !Number.isSafeInteger(sequence)) incompatible();
    const productCode = numeric(r['CODPROD']);
    if (productCode !== null) code(productCode);
    return { source: 'observado' as const, readOnly: true as const, id: `${input.id}:item:${sequence}`, sequence,
      productId: productCode === null ? null : `sankhya:product:${productCode}`, productCode, productName: text(r['DESCRPROD']),
      unit: text(r['CODVOL']), quantity: numeric(r['QTDNEG']), unitPrice: numeric(r['VLRUNIT']), total: numeric(r['VLRTOT']) };
  }), total, totalWithoutSearch: total, offset: page.offset, limit: page.limit, hasMore: page.offset + items.length < total };
}
