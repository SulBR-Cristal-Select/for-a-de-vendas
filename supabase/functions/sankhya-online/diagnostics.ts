import { SankhyaError, type SankhyaGateway } from './gateway.ts';

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

/** Somente os dois diagnósticos fixos encaminhados pelo dicionário administrativo. */
export async function readCommercialDiagnostic(gateway: Transport, value: unknown) {
  const input = object(value);
  if (input['kind'] === 'stock-context') {
    keys(input, ['kind', 'companyCode', 'productCode']);
    const companyCode = company(input['companyCode']), productCode = integer(input['productCode']);
    const columns = await gateway.select("SELECT COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME='TGFEST' AND COLUMN_NAME IN ('CODEMP','CODPROD','CODLOCAL','CONTROLE') ORDER BY COLUMN_NAME FETCH FIRST 4 ROWS ONLY", 4);
    if (columns.length !== 4 || !['CODEMP','CODPROD','CODLOCAL'].every(name => columns.some(c => c['COLUMN_NAME'] === name && c['DATA_TYPE'] === 'NUMBER')) || !columns.some(c => c['COLUMN_NAME'] === 'CONTROLE' && textTypes.includes(String(c['DATA_TYPE'])))) return unsupported();
    const variants = await gateway.select(`SELECT DISTINCT CODLOCAL,CONTROLE FROM TGFEST WHERE CODEMP=${companyCode} AND CODPROD=${productCode} ORDER BY CODLOCAL,CONTROLE FETCH FIRST 2 ROWS ONLY`, 2);
    return { ...observation(), supported: true, companyCode, productCode, columns, variants, cardinality: variants.length === 0 ? 'absent' : variants.length === 1 ? 'single' : 'multiple', minimumVariants: variants.length, hasMore: variants.length === 2, priceQueried: false };
  }
  if (input['kind'] !== 'analytics') return invalid();
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
  keys(input, ['kind', 'section', 'companyCode', 'from', 'to', 'offset']);
  const companyCode = company(input['companyCode']), from = day(input['from']), to = day(input['to']), offset = integer(input['offset'] ?? 0, 0);
  const span = Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z');
  if (span < 0 || span > 366 * 86400000 || offset > 2147483597) return invalid();
  const required = Object.values(requiredColumns).flatMap(fields => Object.keys(fields));
  const columns = await gateway.select(`SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME IN ('TGFCAB','TGFTOP') AND COLUMN_NAME IN (${literals([...new Set([...required, ...optionalTop])])}) ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 50 ROWS ONLY`, 50);
  for (const [table, fields] of Object.entries(requiredColumns)) for (const [name, type] of Object.entries(fields)) {
    if (!columns.some(c => c['TABLE_NAME'] === table && c['COLUMN_NAME'] === name && (type === 'text' ? textTypes.includes(String(c['DATA_TYPE'])) : c['DATA_TYPE'] === type))) return unsupported();
  }
  const extras = optionalTop.filter(name => columns.some(c => c['TABLE_NAME'] === 'TGFTOP' && c['COLUMN_NAME'] === name && (c['DATA_TYPE'] === 'NUMBER' || textTypes.includes(String(c['DATA_TYPE'])))));
  const dimensions = ['H.CODEMP','H.TIPMOV','H.STATUSNOTA','H.CODTIPOPER',`TO_CHAR(H.DHTIPOPER,'YYYY-MM-DD"T"HH24:MI:SS')`,'H.CODNAT',...extras.map(name => `T.${name}`)];
  const select = ['H.CODEMP','H.TIPMOV','H.STATUSNOTA','H.CODTIPOPER',`${dimensions[4]} AS OPERATION_VERSION`,'H.CODNAT',...extras.map(name => `T.${name} AS TOP_${name}`)];
  const rows = await gateway.select(`SELECT ${select.join(',')},COUNT(*) AS DOCUMENT_COUNT,TO_CHAR(MIN(H.DTNEG),'YYYY-MM-DD') AS FIRST_DATE,TO_CHAR(MAX(H.DTNEG),'YYYY-MM-DD') AS LAST_DATE FROM TGFCAB H LEFT JOIN TGFTOP T ON T.CODTIPOPER=H.CODTIPOPER AND T.DHALTER=H.DHTIPOPER WHERE H.CODEMP=${companyCode} AND H.TIPMOV IN ('P','V') AND H.DTNEG>=TO_DATE('${from}','YYYY-MM-DD') AND H.DTNEG<TO_DATE('${to}','YYYY-MM-DD')+1 GROUP BY ${dimensions.join(',')} ORDER BY H.TIPMOV,H.CODTIPOPER,OPERATION_VERSION,H.CODNAT,H.STATUSNOTA OFFSET ${offset} ROWS FETCH NEXT 50 ROWS ONLY`, 50);
  return { ...observation(), supported: true, companyCode, from, to, dateField: 'DTNEG', observedTopFields: extras, rows, offset, hasMore: rows.length === 50, rulesInferred: false };
}
