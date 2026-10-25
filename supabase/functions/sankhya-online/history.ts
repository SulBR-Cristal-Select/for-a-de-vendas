import { SankhyaError, type SankhyaGateway } from './gateway.ts';
import { scopeOf, sellerAllowed, sellerPredicate, type ReadScope } from './read-model.ts';
import { foldERPText } from '../../../src/lib/erp-order.ts';
import { STANDARD_SALES_REPORT_POLICY, STANDARD_BILLING_REPORT_POLICY } from './policy.ts';
import { BILLING_COLUMNS, billingOriginFlags } from './billing-source.ts';
import { erpDecimal, sumERPDecimals, decimalUnits } from '../../../src/lib/erp-decimal.ts';

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
  const seller = sellerPredicate(scope, 'P.CODVEND'); if (seller) where.push(seller);
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
function documentDTO(row: Row, movement: 'P' | 'V', companies: number[], exact?: { total: string | null }) {
  const documentCode = code(row['NUNOTA']), companyCode = code(row['CODEMP']), customerCode = code(row['CODPARC']);
  if (row['TIPMOV'] !== movement || !companies.includes(companyCode)) incompatible();
  const operationCode = nullableCode(row['CODTIPOPER']), statusCode = text(row['STATUSNOTA']);
  return {
    source: 'observado' as const, readOnly: true as const,
    id: `sankhya:${movement === 'P' ? 'order' : 'invoice'}:${documentCode}`,
    number: text(row['NUMNOTA']), date: text(row['DOCUMENT_DATE']),
    customerId: `sankhya:customer:${customerCode}`, customerName: text(row['RAZAOSOCIAL']),
    sellerCode: nullableCode(row['CODVEND']), sellerName: text(row['APELIDO']), total: exact ? exact.total : numeric(row['VLRNOTA']),
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

type CommercialReportInput = HistoryInput & { sellerCode?: number; groupBy?: 'seller' | 'customer'; status?: 'confirmado' };
export type SalesReportInput = CommercialReportInput & { resource: 'orders' };
export type BillingReportInput = CommercialReportInput & { resource: 'invoices' };
const unsupportedSales = (): never => { throw new SankhyaError('ERP_CONTEXT_REQUIRED', 'Estrutura comercial do ERP não confirmada.'); };
const salesAmount = (value: unknown): string => erpDecimal(value) ?? incompatible();
function salesCount(row: Row | undefined, field: string): number {
  const n = numeric(row?.[field]);
  return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : incompatible();
}
const salesAggregate = `COUNT(*) AS DOCUMENT_COUNT,COUNT(DISTINCT C.NUNOTA) AS UNIQUE_DOCUMENT_COUNT,COUNT(CASE WHEN C.VLRNOTA IS NULL THEN 1 END) AS MISSING_AMOUNT_COUNT,TO_CHAR(SUM(C.VLRNOTA),'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS DOCUMENT_AMOUNT`;
function salesSummary(row: Row | undefined) {
  const documentCount = salesCount(row, 'DOCUMENT_COUNT'), missingAmountCount = salesCount(row, 'MISSING_AMOUNT_COUNT');
  if (salesCount(row, 'UNIQUE_DOCUMENT_COUNT') !== documentCount || missingAmountCount > documentCount) return incompatible();
  const documentAmount = missingAmountCount ? null : documentCount === 0 && row?.['DOCUMENT_AMOUNT'] === null ? '0' : salesAmount(row?.['DOCUMENT_AMOUNT']);
  if (documentCount === 0 && documentAmount !== '0') return incompatible();
  return { documentCount, documentAmount, missingAmountCount, amountField: 'TGFCAB.VLRNOTA' as const, headerCountedOnce: true as const, atomicSnapshot: false as const };
}

/** Relatório fixo de venda padrão. Não amplia o histórico genérico nem aceita SQL do navegador. */
export async function readSalesReport(gateway: Transport, input: SalesReportInput, scope: ReadScope) { return readCommercialReport(gateway,input,scope,false); }
export async function readBillingReport(gateway: Transport, input: BillingReportInput, scope: ReadScope) { return readCommercialReport(gateway,input,scope,true); }
async function readCommercialReport(gateway: Transport, input: CommercialReportInput, scope: ReadScope, billing: boolean) {
  keys(input, ['resource','offset','limit','customerId','sellerCode','status','search','sort','direction','from','to','companyCode','groupBy']);
  if (input.resource !== (billing ? 'invoices' : 'orders') || input.groupBy !== undefined && !['seller','customer'].includes(input.groupBy) || input.status !== undefined && input.status !== 'confirmado') return invalid();
  const allowed = scopeOf(scope), page = windowOf(input.offset, input.limit), policy = STANDARD_SALES_REPORT_POLICY, bp = STANDARD_BILLING_REPORT_POLICY, movement = billing ? 'V' : 'P', dateField = billing ? 'DTFATUR' : 'DTNEG';
  let companies = allowed.companies;
  if (input.companyCode !== undefined) {
    integer(input.companyCode);
    if (!companies.includes(input.companyCode)) throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Filial fora do escopo autorizado.', 403);
    companies = [input.companyCode];
  }
  const group = input.groupBy, sort = input.sort ?? (group ? 'name' : 'date'), direction = input.direction ?? (group ? 'asc' : 'desc');
  const groupCode = group === 'seller' ? 'C.CODVEND' : 'C.CODPARC', groupName = group === 'seller' ? 'V.APELIDO' : 'P.RAZAOSOCIAL';
  const groupSorts: Record<string,string> = { name: foldSQL(groupName), count: 'COUNT(*)', total: 'SUM(C.VLRNOTA)' };
  const reportSorts = billing ? { ...sorts,date:'C.DTFATUR',number:'C.NUNOTA',nf:'C.NUMNOTA',invoiced:'C.VLRNOTA' } : sorts;
  if (typeof sort !== 'string' || !Object.hasOwn(group ? groupSorts : reportSorts, sort) || !['asc','desc'].includes(direction)) return invalid();
  const start = dateInput(input.from), end = dateInput(input.to), search = searchText(input.search);
  if (start && end && start > end) return invalid();
  const candidate = [...baseWhere(allowed, movement, companies), ...(billing ? [`C.STATUSNOTA='${bp.statusCode}'`,`C.STATUSNFE='${bp.fiscalStatusCode}'`,'C.DTFATUR IS NOT NULL'] : [`C.CODTIPOPER=${policy.operationCode}`, `C.CODNAT=${policy.natureCode}`, `C.STATUSNOTA='${policy.statusCode}'`])];
  if (input.customerId !== undefined) candidate.push(`P.CODPARC=${identifier(input.customerId, 'sankhya:customer:')}`);
  if (input.sellerCode !== undefined) {
    const selected = integer(input.sellerCode);
    if (!sellerAllowed(allowed, selected)) throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Vendedor fora do escopo autorizado.', 403);
    candidate.push(`C.CODVEND=${selected}`);
  }
  if (start) candidate.push(`C.${dateField}>=TO_DATE(${literal(start)},'YYYY-MM-DD')`);
  if (end) candidate.push(`C.${dateField}<TO_DATE(${literal(end)},'YYYY-MM-DD')+1`);
  const required: Record<string, Record<string,string>> = {
    TGFCAB: { CODEMP:'NUMBER',NUNOTA:'NUMBER',CODTIPOPER:'NUMBER',DHTIPOPER:'DATE',CODNAT:'NUMBER',DTNEG:'DATE',TIPMOV:'text',STATUSNOTA:'text',VLRNOTA:'amount',CODPARC:'NUMBER',CODVEND:'NUMBER' },
    TGFTOP: { CODTIPOPER:'NUMBER',DHALTER:'DATE',TIPMOV:'text',BONIFICACAO:'text',GOLDEV:'NUMBER' },
    TGFPAR: { CODPARC:'NUMBER',CODVEND:'NUMBER',CODEMP:'NUMBER',CLIENTE:'text' },
  };
  if (billing) {
    for (const [table,columns] of Object.entries(BILLING_COLUMNS)) required[table] = { ...required[table],...columns };
    required['TGFCAB']!['VLRNOTA'] = 'amount';
  }
  const metadataWhere = Object.entries(required).map(([table, columns]) => `(TABLE_NAME='${table}' AND COLUMN_NAME IN (${Object.keys(columns).map(literal).join(',')}))`).join(' OR ');
  const metadata = await gateway.select(`SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE ${metadataWhere} ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 50 ROWS ONLY`, 50);
  for (const [table, columns] of Object.entries(required)) for (const [name, type] of Object.entries(columns)) {
    if (!metadata.some(r => r['TABLE_NAME'] === table && r['COLUMN_NAME'] === name && (type === 'text' ? ['CHAR','VARCHAR2','NCHAR','NVARCHAR2'].includes(String(r['DATA_TYPE'])) : type === 'amount' ? ['NUMBER','FLOAT'].includes(String(r['DATA_TYPE'])) : r['DATA_TYPE'] === type))) return unsupportedSales();
  }
  const invalidTop = billing
    ? "T.CODTIPOPER IS NULL OR T.TIPMOV IS NULL OR T.TIPMOV<>'V' OR T.GOLSINAL IS NULL OR T.GOLSINAL NOT IN (-1,0,1) OR T.BONIFICACAO IS NULL OR T.BONIFICACAO NOT IN ('N','S') OR T.GOLDEV IS NULL OR T.GOLDEV NOT IN (-1,1)"
    : "T.CODTIPOPER IS NULL OR T.TIPMOV IS NULL OR T.TIPMOV<>'P' OR T.BONIFICACAO IS NULL OR T.BONIFICACAO NOT IN ('N','S') OR T.GOLDEV IS NULL OR T.GOLDEV NOT IN (-1,1)";
  const missing = await gateway.select(`SELECT COUNT(*) AS MISSING_CONTEXT_COUNT FROM ${fromSQL} WHERE ${candidate.join(' AND ')} AND (${invalidTop})`, 1);
  if (missing.length !== 1) return incompatible();
  if (salesCount(missing[0], 'MISSING_CONTEXT_COUNT') !== 0) return unsupportedSales();
  const commercial = billing ? [`T.TIPMOV='V'`,`T.GOLSINAL=${bp.salesSignal}`,`T.BONIFICACAO='${bp.bonification}'`,`T.GOLDEV=${bp.devolution}`] : [`T.TIPMOV='${policy.movement}'`, `T.BONIFICACAO='${policy.bonification}'`, `T.GOLDEV=${policy.devolution}`];
  const withoutSearch = [...candidate, ...commercial];
  if (billing) {
    const f = billingOriginFlags('C');
    const uncertainty = `(${f.HAS_UNRESOLVED_ORIGIN}) OR ((${f.HAS_STANDARD_ORIGIN}) AND ((${f.HAS_OTHER_ORIGIN}) OR (${f.HAS_UNLINKED_ITEM}) OR NOT (${f.HAS_ITEMS}) OR (${f.HAS_CROSS_COMPANY_ORIGIN}) OR C.VLRNOTA IS NULL))`;
    const unknown = await gateway.select(`SELECT COUNT(*) AS MISSING_CONTEXT_COUNT FROM ${fromSQL} WHERE ${withoutSearch.join(' AND ')} AND (${uncertainty})`,1);
    if (unknown.length !== 1) return incompatible();
    if (salesCount(unknown[0],'MISSING_CONTEXT_COUNT') !== 0) return unsupportedSales();
    withoutSearch.push(`(${f.HAS_STANDARD_ORIGIN})`,`NOT (${f.HAS_OTHER_ORIGIN})`,`NOT (${f.HAS_UNRESOLVED_ORIGIN})`,`NOT (${f.HAS_UNLINKED_ITEM})`,`(${f.HAS_ITEMS})`,`NOT (${f.HAS_CROSS_COMPANY_ORIGIN})`);
  }
  const where = [...withoutSearch];
  if (search) {
    const term = literal('%' + foldERPText(search).replace(/[!%_]/g, c => '!' + c) + '%');
    where.push(`(${['TO_CHAR(C.NUNOTA)','TO_CHAR(C.NUMNOTA)','P.RAZAOSOCIAL','V.APELIDO','T.DESCROPER','C.STATUSNOTA'].map(f => `${foldSQL(f)} LIKE ${term} ESCAPE '!'`).join(' OR ')})`);
  }
  const summaryRows = await gateway.select(`SELECT ${salesAggregate} FROM ${fromSQL} WHERE ${where.join(' AND ')}`, 1);
  if (summaryRows.length !== 1) return incompatible();
  const summary = salesSummary(summaryRows[0]);
  const groupedFrom = (conditions: string[]) => `(SELECT ${groupCode},${groupName} FROM ${fromSQL} WHERE ${conditions.join(' AND ')} GROUP BY ${groupCode},${groupName}) G`;
  const total = group ? await count(gateway, groupedFrom(where), ['1=1']) : summary.documentCount;
  const totalWithoutSearch = search ? await count(gateway, group ? groupedFrom(withoutSearch) : fromSQL, group ? ['1=1'] : withoutSearch) : total;
  if (total > totalWithoutSearch || group && total > summary.documentCount) return incompatible();
  let items: Row[];
  if (group) {
    const rows = await gateway.select(`SELECT ${groupCode} AS GROUP_CODE,${groupName} AS GROUP_NAME,${salesAggregate} FROM ${fromSQL} WHERE ${where.join(' AND ')} GROUP BY ${groupCode},${groupName} ORDER BY ${groupSorts[sort]} ${direction.toUpperCase()} NULLS LAST,${groupCode} ${direction.toUpperCase()} NULLS LAST OFFSET ${page.offset} ROWS FETCH NEXT ${page.limit} ROWS ONLY`, page.limit);
    items = rows.map(r => {
      const code = nullableCode(r['GROUP_CODE']), subtotal = salesSummary(r);
      if (subtotal.documentCount < 1) return incompatible();
      return { id: `sankhya:${billing ? 'billing' : 'sales'}:${group}:${code ?? 'unknown'}`, source:'observado',readOnly:true,name:text(r['GROUP_NAME']),count:subtotal.documentCount,total:subtotal.documentAmount,groupCode:code,groupBy:group,missingAmountCount:subtotal.missingAmountCount };
    });
  } else {
    const order = `${reportSorts[sort]} ${direction.toUpperCase()} NULLS LAST${sort !== 'code' ? `,C.NUNOTA ${direction.toUpperCase()} NULLS LAST` : ''}`;
    const reportFields = billing ? fields.replace("TO_CHAR(C.DTNEG,'YYYY-MM-DD') AS DOCUMENT_DATE","TO_CHAR(C.DTFATUR,'YYYY-MM-DD') AS DOCUMENT_DATE") + ',C.STATUSNFE' : fields;
    const rows = await gateway.select(`SELECT ${reportFields},TO_CHAR(C.VLRNOTA,'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS DOCUMENT_AMOUNT FROM ${fromSQL} WHERE ${where.join(' AND ')} ORDER BY ${order} OFFSET ${page.offset} ROWS FETCH NEXT ${page.limit} ROWS ONLY`, page.limit);
    items = rows.map(r => {
      if ((!billing && code(r['CODTIPOPER']) !== 1001) || r['STATUSNOTA'] !== 'L' || billing && r['STATUSNFE'] !== 'A') return incompatible();
      const item = documentDTO(r,movement,companies,{total:r['DOCUMENT_AMOUNT'] === null ? null : salesAmount(r['DOCUMENT_AMOUNT'])});
      if (input.customerId && item.customerId !== input.customerId || input.sellerCode !== undefined && item.sellerCode !== input.sellerCode || start && (!item.date || item.date < start) || end && (!item.date || item.date > end)) return incompatible();
      return billing ? { ...item,nf:item.number,invoiced:item.total,erp:{...item.erp,dateField:'DTFATUR',fiscalStatusCode:text(r['STATUSNFE'])} } : item;
    });
  }
  verifyPage(items,total,page.offset,page.limit);
  if (new Set(items.map(r => r['id'])).size !== items.length) return incompatible();
  if (page.offset === 0 && items.length === total) {
    const n = group ? items.reduce((s,r) => s + Number(r['count']),0) : items.length;
    if (n !== summary.documentCount) return incompatible();
    if (summary.documentAmount !== null) {
      if (items.some(r => r['total'] === null) || decimalUnits(sumERPDecimals(items.map(r => salesAmount(r['total'])))) !== decimalUnits(summary.documentAmount)) return incompatible();
    }
  }
  return { ...observed(),items,total,totalWithoutSearch,offset:page.offset,summary,...(billing ? {billingPolicy:bp,linkMode:'direct-item-reference',quantitiesAllocated:false,ordersAdded:false,undatedTreatment:'excluded-without-date-fallback'} : {salesPolicy:policy}),companyCodes:companies,groupBy:group ?? null };
}
