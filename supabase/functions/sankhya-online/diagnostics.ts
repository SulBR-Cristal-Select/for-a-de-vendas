import { SankhyaError, type SankhyaGateway } from './gateway.ts';
import { STANDARD_SALES_REPORT_POLICY, STANDARD_BILLING_REPORT_POLICY } from './policy.ts';

type Row = Record<string, unknown>;
type Transport = Pick<SankhyaGateway, 'select'>;
const invalid = (): never => { throw new SankhyaError('INVALID_REQUEST', 'Consulta comercial de diagnóstico inválida.', 400); };
const unsupported = (): never => { throw new SankhyaError('ERP_CONTEXT_REQUIRED', 'Estrutura comercial do ERP não confirmada.', 502); };
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : invalid();
function keys(value: Row, allowed: readonly string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) invalid(); }
function integer(value: unknown, min = 1): number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= 2147483647 ? value : invalid(); }
function company(value: unknown): 1 | 4 { if (value !== 1 && value !== 4) throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Filial fora do escopo autorizado.', 403); return value; }
function day(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return invalid();
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : invalid();
}
const observation = () => ({ source: 'sankhya' as const, readOnly: true as const, readAt: new Date().toISOString() });
const incompatible = (): never => { throw new SankhyaError('ERP_INVALID_RESPONSE', 'Diagnóstico ERP inválido ou incompleto.', 502); };
function observedInteger(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value))) return incompatible();
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : incompatible();
}
function oneCount(rows: Row[], name: string): number { return rows.length === 1 ? observedInteger(rows[0]?.[name]) : incompatible(); }
const textTypes = ['VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR'];
const requiredColumns = {
  TGFCAB: { CODEMP: 'NUMBER', CODTIPOPER: 'NUMBER', CODNAT: 'NUMBER', NUNOTA: 'NUMBER', DHTIPOPER: 'DATE', DTNEG: 'DATE', TIPMOV: 'text', STATUSNOTA: 'text' },
  TGFTOP: { CODTIPOPER: 'NUMBER', DHALTER: 'DATE' },
} as const;
const optionalTop = ['DESCROPER', 'TIPMOV', 'ATIVO', 'GOLSINAL', 'GOLDEV', 'BONIFICACAO', 'ATUALCOM', 'ATUALFIN'] as const;
const metadataTables = ['TGFCAB', 'TGFTOP', 'TGFITE', 'TGFPAR', 'TGFNAT', 'TGFEST', 'TGFPRO'];
const metadataFields = [
  'CODEMP','TIPMOV','STATUSNOTA','DTNEG','DTFATUR','DTENTSAI','CODTIPOPER','DHTIPOPER','CODNAT','CODVEND','NUNOTA','VLRNOTA','PENDENTE','STATUSNFE',
  'DHALTER','DESCROPER','ATIVO','GOLSINAL','GOLDEV','BONIFICACAO','ATUALCOM','ATUALFIN',
  'SEQUENCIA','CODPROD','CODVOL','QTDNEG','VLRTOT','VLRDESC','VLRIPI','VLRSUBST',
  'CODPARC','CLIENTE','BLOQUEAR','DTCAD','DESCRNAT','ATIVA','ANALITICA','CODNATPAI','GRAU',
  'CODLOCAL','CONTROLE','TIPCONTEST','CODLOCALPADRAO',
];
const literals = (values: readonly string[]) => values.map(value => `'${value}'`).join(',');

async function requireDictionary(gateway: Transport) {
  const structure = await gateway.select("SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME IN ('TDDCAM','TDDOPC') AND COLUMN_NAME IN ('NUCAMPO','NOMETAB','NOMECAMPO','DESCRCAMPO','VALOR','OPCAO') ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 12 ROWS ONLY", 12);
  if (!['NUCAMPO','NOMETAB','NOMECAMPO','DESCRCAMPO'].every(name => structure.some(c => c['TABLE_NAME'] === 'TDDCAM' && c['COLUMN_NAME'] === name)) || !['NUCAMPO','VALOR','OPCAO'].every(name => structure.some(c => c['TABLE_NAME'] === 'TDDOPC' && c['COLUMN_NAME'] === name))) return unsupported();
}

/** Consultas fixas encaminhadas exclusivamente pelo dicionário administrativo. */
export async function readCommercialDiagnostic(gateway: Transport, value: unknown) {
  const input = object(value);
  if (input['kind'] === 'stock-overview') {
    keys(input, ['kind', 'companyCode']);
    const companyCode = company(input['companyCode']);
    const columns = await gateway.select("SELECT COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME='TGFEST' AND COLUMN_NAME IN ('CODEMP','CODPROD') ORDER BY COLUMN_NAME FETCH FIRST 2 ROWS ONLY", 2);
    if (columns.length !== 2 || !['CODEMP','CODPROD'].every(name => columns.some(c => c['COLUMN_NAME'] === name && c['DATA_TYPE'] === 'NUMBER'))) return unsupported();
    const totals = await gateway.select(`SELECT COUNT(*) AS CONTEXT_ROWS,COUNT(DISTINCT CODPROD) AS PRODUCT_COUNT FROM TGFEST WHERE CODEMP=${companyCode}`, 1);
    const contextRows = oneCount(totals, 'CONTEXT_ROWS'), productCount = oneCount(totals, 'PRODUCT_COUNT');
    if (contextRows < productCount || (contextRows === 0) !== (productCount === 0)) return incompatible();
    const sample = productCount === 0 ? [] : await gateway.select(`SELECT DISTINCT CODPROD FROM TGFEST WHERE CODEMP=${companyCode} ORDER BY CODPROD FETCH FIRST 2 ROWS ONLY`, 2);
    const productSample = sample.map(row => observedInteger(row['CODPROD']));
    if (productSample.length !== Math.min(productCount, 2) || productSample.some(code => code < 1 || code > 2147483647) || new Set(productSample).size !== productSample.length) return incompatible();
    return { ...observation(), supported: true, companyCode, contextRows, productCount, productSample, hasMore: productCount > productSample.length, variantSelected: false, balanceQueried: false, priceQueried: false };
  }
  if (input['kind'] === 'stock-context') {
    keys(input, ['kind', 'companyCode', 'productCode']);
    const companyCode = company(input['companyCode']), productCode = integer(input['productCode']);
    const columns = await gateway.select("SELECT COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME='TGFEST' AND COLUMN_NAME IN ('CODEMP','CODPROD','CODLOCAL','CONTROLE') ORDER BY COLUMN_NAME FETCH FIRST 4 ROWS ONLY", 4);
    if (columns.length !== 4 || !['CODEMP','CODPROD','CODLOCAL'].every(name => columns.some(c => c['COLUMN_NAME'] === name && c['DATA_TYPE'] === 'NUMBER')) || !columns.some(c => c['COLUMN_NAME'] === 'CONTROLE' && textTypes.includes(String(c['DATA_TYPE'])))) return unsupported();
    const variants = await gateway.select(`SELECT DISTINCT CODLOCAL,CONTROLE FROM TGFEST WHERE CODEMP=${companyCode} AND CODPROD=${productCode} ORDER BY CODLOCAL,CONTROLE FETCH FIRST 2 ROWS ONLY`, 2);
    return { ...observation(), supported: true, companyCode, productCode, columns, variants, cardinality: variants.length === 0 ? 'absent' : variants.length === 1 ? 'single' : 'multiple', minimumVariants: variants.length, hasMore: variants.length === 2, priceQueried: false };
  }
  if (input['kind'] !== 'analytics') return invalid();
  if (input['section'] === 'billing') return readBillingDiagnostic(gateway, input);
  if (input['section'] === 'metadata') {
    keys(input, ['kind', 'section', 'after']);
    const after = input['after'] ?? '';
    if (typeof after !== 'string' || !/^(?:[A-Z0-9_]{1,40}\.[A-Z0-9_]{1,40})?$/.test(after)) return invalid();
    // Cursor técnico validado, nunca tabela/campo ou SQL escolhido pelo navegador.
    const cursor = after ? ` AND D.TABLE_NAME||'.'||D.COLUMN_NAME>'${after}'` : '';
    const fields = await gateway.select(`SELECT D.TABLE_NAME,D.COLUMN_NAME,D.DATA_TYPE,D.NULLABLE FROM USER_TAB_COLUMNS D WHERE D.TABLE_NAME IN (${literals(metadataTables)}) AND (D.COLUMN_NAME IN (${literals(metadataFields)}) OR D.COLUMN_NAME LIKE '%ABC%')${cursor} ORDER BY D.TABLE_NAME,D.COLUMN_NAME FETCH FIRST 50 ROWS ONLY`, 50);
    const last = fields.at(-1);
    return { ...observation(), supported: true, fields, next: fields.length === 50 && last ? `${last['TABLE_NAME']}.${last['COLUMN_NAME']}` : null, hasMore: fields.length === 50 };
  }
  if (input['section'] === 'definitions') {
    keys(input, ['kind', 'section', 'after']);
    const after = input['after'] ?? '';
    if (typeof after !== 'string' || !/^(?:[A-Z0-9_]{1,40}\.[A-Z0-9_]{1,40})?$/.test(after)) return invalid();
    await requireDictionary(gateway);
    const cursor = after ? ` AND C.NOMETAB||'.'||C.NOMECAMPO>'${after}'` : '';
    // Cinquenta campos por página; opções são lidas separadamente com o NUCAMPO confirmado.
    const fields = await gateway.select(`SELECT C.NOMETAB AS TABLE_NAME,C.NOMECAMPO AS FIELD_NAME,C.DESCRCAMPO AS DESCRIPTION,C.NUCAMPO FROM TDDCAM C JOIN USER_TAB_COLUMNS D ON D.TABLE_NAME=C.NOMETAB AND D.COLUMN_NAME=C.NOMECAMPO WHERE C.NOMETAB IN ('TGFTOP','TGFCAB','TGFPAR','TGFPRO','TGFNAT') AND (C.NOMECAMPO IN ('GOLSINAL','GOLDEV','BONIFICACAO','ATUALCOM','ATUALFIN','STATUSNOTA','STATUSNFE','DTNEG','DTFATUR','DTENTSAI','DTCAD','TIPCONTEST','CODLOCALPADRAO','ATIVA','ANALITICA') OR C.NOMECAMPO LIKE '%ABC%')${cursor} ORDER BY C.NOMETAB,C.NOMECAMPO FETCH FIRST 50 ROWS ONLY`, 50);
    const last = fields.at(-1);
    // Não consulta VALOR/OPCAO por campo sem paginação: um campo pode ter muitas opções.
    return { ...observation(), supported: true, fields, next: fields.length === 50 && last ? `${last['TABLE_NAME']}.${last['FIELD_NAME']}` : null, hasMore: fields.length === 50 };
  }
  if (input['section'] === 'options') {
    keys(input, ['kind', 'section', 'fieldId', 'offset']);
    const fieldId = integer(input['fieldId']), offset = integer(input['offset'] ?? 0, 0);
    if (offset > 2147483597) return invalid();
    await requireDictionary(gateway);
    const options = await gateway.select(`SELECT C.NOMETAB AS TABLE_NAME,C.NOMECAMPO AS FIELD_NAME,O.VALOR AS CODE_VALUE,O.OPCAO AS DESCRIPTION FROM TDDCAM C JOIN TDDOPC O ON O.NUCAMPO=C.NUCAMPO JOIN USER_TAB_COLUMNS D ON D.TABLE_NAME=C.NOMETAB AND D.COLUMN_NAME=C.NOMECAMPO WHERE C.NUCAMPO=${fieldId} AND C.NOMETAB IN ('TGFTOP','TGFCAB','TGFPAR','TGFPRO','TGFNAT') AND (C.NOMECAMPO IN ('GOLSINAL','GOLDEV','BONIFICACAO','ATUALCOM','ATUALFIN','STATUSNOTA','STATUSNFE','DTNEG','DTFATUR','DTENTSAI','DTCAD','TIPCONTEST','CODLOCALPADRAO','ATIVA','ANALITICA') OR C.NOMECAMPO LIKE '%ABC%') ORDER BY O.VALOR,O.OPCAO OFFSET ${offset} ROWS FETCH NEXT 50 ROWS ONLY`, 50);
    return { ...observation(), supported: true, options, fieldId, offset, hasMore: options.length === 50 };
  }
  if (input['section'] !== 'operations') return invalid();
  keys(input, ['kind', 'section', 'companyCode', 'from', 'to', 'offset', 'standardSales']);
  if (input['standardSales'] !== undefined && typeof input['standardSales'] !== 'boolean') return invalid();
  const standardSales = input['standardSales'] === true;
  const companyCode = company(input['companyCode']), from = day(input['from']), to = day(input['to']), offset = integer(input['offset'] ?? 0, 0);
  const span = Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z');
  if (span < 0 || span > 366 * 86400000 || offset > 2147483597) return invalid();
  const required = Object.values(requiredColumns).flatMap(fields => Object.keys(fields));
  const columns = await gateway.select(`SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME IN ('TGFCAB','TGFTOP') AND COLUMN_NAME IN (${literals([...new Set([...required, ...optionalTop])])}) ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 50 ROWS ONLY`, 50);
  for (const [table, fields] of Object.entries(requiredColumns)) for (const [name, type] of Object.entries(fields)) {
    if (!columns.some(c => c['TABLE_NAME'] === table && c['COLUMN_NAME'] === name && (type === 'text' ? textTypes.includes(String(c['DATA_TYPE'])) : c['DATA_TYPE'] === type))) return unsupported();
  }
  const extras = optionalTop.filter(name => columns.some(c => c['TABLE_NAME'] === 'TGFTOP' && c['COLUMN_NAME'] === name && (c['DATA_TYPE'] === 'NUMBER' || textTypes.includes(String(c['DATA_TYPE'])))));
  const report = STANDARD_SALES_REPORT_POLICY;
  const join = 'TGFCAB H LEFT JOIN TGFTOP T ON T.CODTIPOPER=H.CODTIPOPER AND T.DHALTER=H.DHTIPOPER';
  const period = `H.CODEMP=${companyCode} AND H.DTNEG>=TO_DATE('${from}','YYYY-MM-DD') AND H.DTNEG<TO_DATE('${to}','YYYY-MM-DD')+1`;
  const base = standardSales ? `${period} AND H.TIPMOV='${report.movement}' AND H.CODTIPOPER=${report.operationCode} AND H.CODNAT=${report.natureCode} AND H.STATUSNOTA='${report.statusCode}'` : `${period} AND H.TIPMOV IN ('P','V')`;
  if (standardSales) {
    if (!columns.some(c => c['TABLE_NAME'] === 'TGFTOP' && c['COLUMN_NAME'] === 'GOLDEV' && c['DATA_TYPE'] === 'NUMBER') || !['BONIFICACAO','TIPMOV'].every(name => columns.some(c => c['TABLE_NAME'] === 'TGFTOP' && c['COLUMN_NAME'] === name && textTypes.includes(String(c['DATA_TYPE']))))) return unsupported();
    const missing = await gateway.select(`SELECT COUNT(*) AS MISSING_CONTEXT_COUNT FROM ${join} WHERE ${base} AND (T.CODTIPOPER IS NULL OR T.BONIFICACAO IS NULL OR T.BONIFICACAO NOT IN ('N','S') OR T.GOLDEV IS NULL OR T.GOLDEV NOT IN (-1,1) OR T.TIPMOV IS NULL OR T.TIPMOV<>'${report.movement}')`, 1);
    if (oneCount(missing, 'MISSING_CONTEXT_COUNT') !== 0) return unsupported();
  }
  const where = standardSales ? `${base} AND T.TIPMOV='${report.movement}' AND T.BONIFICACAO='${report.bonification}' AND T.GOLDEV=${report.devolution}` : base;
  const dimensions = ['H.CODEMP','H.TIPMOV','H.STATUSNOTA','H.CODTIPOPER',`TO_CHAR(H.DHTIPOPER,'YYYY-MM-DD"T"HH24:MI:SS')`,'H.CODNAT',...extras.map(name => `T.${name}`)];
  const select = ['H.CODEMP','H.TIPMOV','H.STATUSNOTA','H.CODTIPOPER',`${dimensions[4]} AS OPERATION_VERSION`,'H.CODNAT',...extras.map(name => `T.${name} AS TOP_${name}`)];
  const rows = await gateway.select(`SELECT ${select.join(',')},COUNT(*) AS DOCUMENT_COUNT,TO_CHAR(MIN(H.DTNEG),'YYYY-MM-DD') AS FIRST_DATE,TO_CHAR(MAX(H.DTNEG),'YYYY-MM-DD') AS LAST_DATE FROM ${join} WHERE ${where} GROUP BY ${dimensions.join(',')} ORDER BY H.TIPMOV,H.CODTIPOPER,OPERATION_VERSION,H.CODNAT,H.STATUSNOTA OFFSET ${offset} ROWS FETCH NEXT 50 ROWS ONLY`, 50);
  return { ...observation(), supported: true, companyCode, from, to, dateField: 'DTNEG', observedTopFields: extras, rows, offset, hasMore: rows.length === 50, rulesInferred: false, ...(standardSales ? { salesPolicy: report } : {}) };
}

// Valores monetários vindos de TO_CHAR no ERP, nunca números binários nem preço calculado.
function billingDecimal(value: unknown): string {
  if (typeof value !== 'string') return incompatible();
  const decimal = value.startsWith('-.') ? '-0' + value.slice(1) : value.startsWith('.') ? '0' + value : value;
  return /^-?(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(decimal) && decimal.length <= 40 ? decimal : incompatible();
}
function sumBillingDecimals(values: string[]): string {
  const units = values.reduce((sum, value) => {
    const negative = value.startsWith('-'), [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
    const n = BigInt(whole!) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
    return sum + (negative ? -n : n);
  }, 0n);
  const negative = units < 0n, absolute = negative ? -units : units;
  const fraction = String(absolute % 1000000000n).padStart(9, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${absolute / 1000000000n}${fraction ? '.' + fraction : ''}`;
}
async function readBillingDiagnostic(gateway: Transport, input: Row) {
  keys(input, ['kind', 'section', 'companyCode', 'from', 'to', 'offset']);
  const companyCode = company(input['companyCode']), from = day(input['from']), to = day(input['to']), offset = integer(input['offset'] ?? 0, 0);
  const span = Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z');
  if (span < 0 || span > 366 * 86400000 || offset > 2147483597) return invalid();
  const required = {
    TGFCAB: { CODEMP:'NUMBER',NUNOTA:'NUMBER',CODTIPOPER:'NUMBER',DHTIPOPER:'DATE',CODNAT:'NUMBER',DTFATUR:'DATE',TIPMOV:'text',STATUSNOTA:'text',STATUSNFE:'text',VLRNOTA:'NUMBER' },
    TGFTOP: { CODTIPOPER:'NUMBER',DHALTER:'DATE',TIPMOV:'text',GOLSINAL:'NUMBER',GOLDEV:'NUMBER',BONIFICACAO:'text' },
    TGFVAR: { NUNOTA:'NUMBER',NUNOTAORIG:'NUMBER',SEQUENCIA:'NUMBER',SEQUENCIAORIG:'NUMBER' },
    TGFITE: { NUNOTA:'NUMBER',SEQUENCIA:'NUMBER' },
  } as const;
  const names = [...new Set(Object.values(required).flatMap(fields => Object.keys(fields)))];
  const columns = await gateway.select(`SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME IN (${literals(Object.keys(required))}) AND COLUMN_NAME IN (${literals(names)}) ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 50 ROWS ONLY`, 50);
  for (const [table, fields] of Object.entries(required)) for (const [name, type] of Object.entries(fields))
    if (!columns.some(c => c['TABLE_NAME'] === table && c['COLUMN_NAME'] === name && (type === 'text' ? textTypes.includes(String(c['DATA_TYPE'])) : c['DATA_TYPE'] === type || table === 'TGFCAB' && name === 'VLRNOTA' && c['DATA_TYPE'] === 'FLOAT'))) return unsupported();
  const p = STANDARD_BILLING_REPORT_POLICY, sale = p.origin;
  const join = 'TGFCAB H LEFT JOIN TGFTOP T ON T.CODTIPOPER=H.CODTIPOPER AND T.DHALTER=H.DHTIPOPER';
  const candidate = `H.CODEMP=${companyCode} AND H.TIPMOV='${p.movement}' AND H.STATUSNOTA='${p.statusCode}' AND H.STATUSNFE='${p.fiscalStatusCode}'`;
  const period = `${candidate} AND H.DTFATUR>=TO_DATE('${from}','YYYY-MM-DD') AND H.DTFATUR<TO_DATE('${to}','YYYY-MM-DD')+1`;
  const invalidTop = "T.CODTIPOPER IS NULL OR T.TIPMOV IS NULL OR T.TIPMOV<>'V' OR T.GOLSINAL IS NULL OR T.GOLSINAL NOT IN (-1,0,1) OR T.GOLDEV IS NULL OR T.GOLDEV NOT IN (-1,1) OR T.BONIFICACAO IS NULL OR T.BONIFICACAO NOT IN ('N','S')";
  const commercial = `T.TIPMOV='V' AND T.GOLSINAL=${p.salesSignal} AND T.GOLDEV=${p.devolution} AND T.BONIFICACAO='${p.bonification}'`;
  const counts = await gateway.select(`SELECT COUNT(*) AS APPROVED_DOCUMENT_COUNT,COUNT(CASE WHEN ${invalidTop} THEN 1 END) AS MISSING_CONTEXT_COUNT,COUNT(CASE WHEN ${commercial} THEN 1 END) AS COMMERCIAL_DOCUMENT_COUNT FROM ${join} WHERE ${period}`, 1);
  const approvedDocumentCount = oneCount(counts, 'APPROVED_DOCUMENT_COUNT'), commercialDocumentCount = oneCount(counts, 'COMMERCIAL_DOCUMENT_COUNT');
  const missingContextCount = oneCount(counts, 'MISSING_CONTEXT_COUNT');
  if (commercialDocumentCount > approvedDocumentCount || missingContextCount > approvedDocumentCount) return incompatible();
  if (missingContextCount !== 0) return unsupported();
  // Sem data não há como atribuir mês. Esse contador não pertence ao período selecionado.
  const undated = await gateway.select(`SELECT COUNT(*) AS UNDATED_DOCUMENT_COUNT FROM ${join} WHERE ${candidate} AND H.DTFATUR IS NULL AND ((${commercial}) OR (${invalidTop}))`, 1);
  const undatedDocumentCount = oneCount(undated, 'UNDATED_DOCUMENT_COUNT');
  const originJoin = 'TGFVAR R LEFT JOIN TGFCAB P ON P.NUNOTA=R.NUNOTAORIG LEFT JOIN TGFTOP O ON O.CODTIPOPER=P.CODTIPOPER AND O.DHALTER=P.DHTIPOPER';
  const standard = `P.TIPMOV='${sale.movement}' AND P.CODTIPOPER=${sale.operationCode} AND P.CODNAT=${sale.natureCode} AND P.STATUSNOTA='${sale.statusCode}' AND O.TIPMOV='P' AND O.BONIFICACAO='N' AND O.GOLDEV=1`;
  const unknown = "P.NUNOTA IS NULL OR P.TIPMOV IS NULL OR P.TIPMOV<>'P' OR P.CODNAT IS NULL OR P.STATUSNOTA IS NULL OR O.CODTIPOPER IS NULL OR O.TIPMOV IS NULL OR O.TIPMOV<>P.TIPMOV OR O.BONIFICACAO IS NULL OR O.BONIFICACAO NOT IN ('N','S') OR O.GOLDEV IS NULL OR O.GOLDEV NOT IN (-1,1) OR NOT EXISTS(SELECT 1 FROM TGFITE PI WHERE PI.NUNOTA=P.NUNOTA AND PI.SEQUENCIA=R.SEQUENCIAORIG) OR NOT EXISTS(SELECT 1 FROM TGFITE DI WHERE DI.NUNOTA=R.NUNOTA AND DI.SEQUENCIA=R.SEQUENCIA)";
  const flags = {
    HAS_STANDARD_ORIGIN: `EXISTS(SELECT 1 FROM ${originJoin} WHERE R.NUNOTA=H.NUNOTA AND ${standard})`,
    HAS_OTHER_ORIGIN: `EXISTS(SELECT 1 FROM ${originJoin} WHERE R.NUNOTA=H.NUNOTA AND CASE WHEN ${standard} THEN 1 ELSE 0 END=0)`,
    HAS_UNRESOLVED_ORIGIN: `EXISTS(SELECT 1 FROM ${originJoin} WHERE R.NUNOTA=H.NUNOTA AND (${unknown}))`,
    HAS_UNLINKED_ITEM: 'EXISTS(SELECT 1 FROM TGFITE I WHERE I.NUNOTA=H.NUNOTA AND NOT EXISTS(SELECT 1 FROM TGFVAR R WHERE R.NUNOTA=I.NUNOTA AND R.SEQUENCIA=I.SEQUENCIA))',
    HAS_ITEMS: 'EXISTS(SELECT 1 FROM TGFITE I WHERE I.NUNOTA=H.NUNOTA)',
    HAS_CROSS_COMPANY_ORIGIN: `EXISTS(SELECT 1 FROM ${originJoin} WHERE R.NUNOTA=H.NUNOTA AND (P.CODEMP IS NULL OR P.CODEMP<>H.CODEMP))`,
  };
  const dimensions = ['CODTIPOPER','OPERATION_VERSION','CODNAT',...Object.keys(flags)];
  const detail = `SELECT H.NUNOTA,H.CODTIPOPER,TO_CHAR(H.DHTIPOPER,'YYYY-MM-DD"T"HH24:MI:SS') AS OPERATION_VERSION,H.CODNAT,H.VLRNOTA,H.DTFATUR,${Object.entries(flags).map(([name, sql]) => `CASE WHEN ${sql} THEN 1 ELSE 0 END AS ${name}`).join(',')} FROM ${join} WHERE ${period} AND ${commercial}`;
  // A consulta externa contém uma linha por cabeçalho, sem multiplicar valores por TGFVAR/itens.
  const sql = `SELECT ${dimensions.join(',')},COUNT(*) AS DOCUMENT_COUNT,SUM(CASE WHEN VLRNOTA IS NULL THEN 1 ELSE 0 END) AS MISSING_AMOUNT_COUNT,TO_CHAR(SUM(VLRNOTA),'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS DOCUMENT_AMOUNT,TO_CHAR(MIN(DTFATUR),'YYYY-MM-DD') AS FIRST_DATE,TO_CHAR(MAX(DTFATUR),'YYYY-MM-DD') AS LAST_DATE FROM (${detail}) D GROUP BY ${dimensions.join(',')} ORDER BY ${dimensions.join(',')} OFFSET ${offset} ROWS FETCH NEXT 50 ROWS ONLY`;
  const nativeRows = await gateway.select(sql, 50);
  const rows = nativeRows.map(row => {
    const flag = (name: string) => { const n = observedInteger(row[name]); return n === 0 ? false : n === 1 ? true : incompatible(); };
    const count = observedInteger(row['DOCUMENT_COUNT']), missingAmount = observedInteger(row['MISSING_AMOUNT_COUNT']);
    if (count < 1 || missingAmount > count) return incompatible();
    const observedDay = (value: unknown): string => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return incompatible();
      const d = new Date(value + 'T00:00:00Z');
      return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10) === value ? value : incompatible();
    };
    const first = observedDay(row['FIRST_DATE']), last = observedDay(row['LAST_DATE']);
    if (first < from || last > to || first > last) return incompatible();
    const standardOrigin = flag('HAS_STANDARD_ORIGIN'), otherOrigin = flag('HAS_OTHER_ORIGIN'), unresolvedOrigin = flag('HAS_UNRESOLVED_ORIGIN'), unlinkedItem = flag('HAS_UNLINKED_ITEM'), hasItems = flag('HAS_ITEMS'), crossCompanyOrigin = flag('HAS_CROSS_COMPANY_ORIGIN');
    const eligible = standardOrigin && !otherOrigin && !unresolvedOrigin && !unlinkedItem && hasItems && !crossCompanyOrigin && missingAmount === 0;
    const amount = row['DOCUMENT_AMOUNT'] === null && missingAmount === count ? null : billingDecimal(row['DOCUMENT_AMOUNT']);
    return { ...row, documentCount: count, missingAmountCount: missingAmount, documentAmount: amount, standardOrigin, otherOrigin, unresolvedOrigin, unlinkedItem, hasItems, crossCompanyOrigin, eligible };
  });
  const hasMore = rows.length === 50;
  const pageDocumentCount = rows.reduce((n,r)=>n+r.documentCount,0);
  if (!Number.isSafeInteger(pageDocumentCount) || pageDocumentCount > commercialDocumentCount || offset === 0 && !hasMore && pageDocumentCount !== commercialDocumentCount) return incompatible();
  // Origem mista/indireta/incompleta não é excluída silenciosamente nem vira zero financeiro.
  const unresolved = rows.some(r => r.unresolvedOrigin || r.standardOrigin && (!r.eligible));
  // DTFATUR nula não pertence ao período escolhido. O diagnóstico histórico é informativo, sem fallback de data.
  const complete = offset === 0 && !hasMore && !unresolved;
  return { ...observation(), supported:true, companyCode,from,to,offset,hasMore,dateField:p.dateField,billingPolicy:p,
    linkMode:'direct-item-reference' as const,approvedDocumentCount,commercialDocumentCount,atomicSnapshot:false,headerCountedOnce:true,quantitiesAllocated:false,undatedDocumentCount,undatedScope:'all-dates' as const,undatedTreatment:'excluded-without-date-fallback' as const,
    qualificationComplete:complete,rows,totals:complete ? { documentCount:rows.filter(r=>r.eligible).reduce((n,r)=>n+r.documentCount,0),documentAmount:sumBillingDecimals(rows.filter(r=>r.eligible).map(r=>r.documentAmount!)),amountField:'TGFCAB.VLRNOTA' } : null,
    rulesInferred:false,ordersAdded:false };
}
