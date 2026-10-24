import { SankhyaError } from './gateway.ts';
// Dicionário técnico fixo: não aceita tabelas/SQL arbitrários e nunca inclui TSIUSU.
const allowed = new Set(['TGFCPL','TGFPAR','TGFPRO','TGFVEN','TGFVOA','TGFPEM','TGFTPV','TGFPPG','TGFTOP','TGFCAB','TGFITE','TGFVAR','TGFVOL','TGFTAB','TGFNTA','TGFEXC','TSICID','TSIBAI','TSIEND','TSIUFS','TGFGRU']);
export function metadataQuery(table: unknown, after: unknown = ''): string {
  if (typeof table !== 'string' || !allowed.has(table) || typeof after !== 'string' || !/^[A-Z0-9_]{0,40}$/.test(after)) {
    throw new SankhyaError('INVALID_METADATA_REQUEST', 'Consulta de campos não autorizada.', 400);
  }
  // Oracle trata a string vazia como NULL; o primeiro recorte não pode compará-la.
  const cursor = after ? ` AND COLUMN_NAME>'${after}'` : '';
  return `SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,NULLABLE FROM (SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,NULLABLE FROM USER_TAB_COLUMNS WHERE TABLE_NAME='${table}'${cursor} ORDER BY COLUMN_NAME) WHERE ROWNUM<=50`;
}
