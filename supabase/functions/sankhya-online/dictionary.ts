import { SankhyaError, type SankhyaGateway } from './gateway.ts';
import type { ReadScope } from './read-model.ts';
import { readCommercialDiagnostic } from './diagnostics.ts';
import { readCustomerMetrics } from './customer-metrics.ts';
type Transport = Pick<SankhyaGateway, 'select'>;
export async function readCommercialDictionary(gateway: Transport, value: unknown, scope: ReadScope) {
  if (scope.role !== 'administrador') throw new SankhyaError('ERP_IDENTITY_REQUIRED', 'Vínculo ERP explícito necessário.', 403);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SankhyaError('INVALID_REQUEST', 'Consulta de dicionário inválida.', 400);
  const input = value as Record<string, unknown>;
  if (input['kind'] === 'analytics' && input['section'] === 'customers') return readCustomerMetrics(gateway, input, scope);
  if (input['kind'] === 'stock-context' || input['kind'] === 'stock-overview' || input['kind'] === 'analytics') return readCommercialDiagnostic(gateway, input);
  if (Object.keys(input).some(k => k !== 'kind') || typeof input['kind'] !== 'string' || !['payments','products','eligibility'].includes(input['kind'])) throw new SankhyaError('INVALID_REQUEST', 'Consulta de dicionário inválida.', 400);
  const columns = await gateway.select("SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME IN ('TDDCAM','TDDOPC') AND COLUMN_NAME IN ('NUCAMPO','NOMETAB','NOMECAMPO','VALOR','OPCAO','DESCRCAMPO') ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 20 ROWS ONLY", 20);
  const has = (table: string, field: string) => columns.some(r => r['TABLE_NAME'] === table && r['COLUMN_NAME'] === field);
  const supported = ['NUCAMPO','NOMETAB','NOMECAMPO'].every(f => has('TDDCAM', f)) && ['NUCAMPO','VALOR','OPCAO'].every(f => has('TDDOPC', f));
  const observation = { source: 'sankhya' as const, readOnly: true as const, readAt: new Date().toISOString() };
  if (!supported) return { ...observation, supported: false, columns, options: [], hasMore: false };
  if (input['kind'] === 'eligibility') {
    if (!has('TDDCAM', 'DESCRCAMPO')) throw new SankhyaError('ERP_INVALID_RESPONSE', 'Descrição das regras ERP não confirmada.', 502);
    const fields = await gateway.select("SELECT C.NOMETAB AS TABLE_NAME,C.NOMECAMPO AS FIELD_NAME,C.DESCRCAMPO AS DESCRIPTION,D.DATA_TYPE,O.VALOR AS CODE_VALUE,O.OPCAO AS VALUE_DESCRIPTION FROM TDDCAM C JOIN USER_TAB_COLUMNS D ON D.TABLE_NAME=C.NOMETAB AND D.COLUMN_NAME=C.NOMECAMPO LEFT JOIN TDDOPC O ON O.NUCAMPO=C.NUCAMPO WHERE C.NOMETAB IN ('TGFPAR','TGFTPV','TGFPRO') AND (C.NOMECAMPO IN ('SUBTIPOVENDA','GRUPOAUTOR','MULTIPVENDA','AGRUPMIN','DECQTD','BLOQVENDAFRAC','PRAZOPAG','VALPRAZO','USACREDFLEX') OR UPPER(C.DESCRCAMPO) LIKE '%AUTORIZA%' OR UPPER(C.DESCRCAMPO) LIKE '%FRACION%' OR UPPER(C.DESCRCAMPO) LIKE '%AGRUPAMENTO%') ORDER BY C.NOMETAB,C.NOMECAMPO,O.VALOR FETCH FIRST 50 ROWS ONLY", 50);
    return { ...observation, supported: true, columns, fields, hasMore: fields.length === 50 };
  }
  if (input['kind'] === 'products') {
    const description = has('TDDCAM', 'DESCRCAMPO') ? 'C.DESCRCAMPO' : 'CAST(NULL AS VARCHAR2(1))';
    const fields = await gateway.select(`SELECT C.NOMECAMPO,${description} AS DESCRIPTION FROM TDDCAM C WHERE C.NOMETAB='TGFPRO' AND (C.NOMECAMPO LIKE '%MULT%' OR C.NOMECAMPO LIKE '%QTDMIN%' OR C.NOMECAMPO LIKE '%QTDVEN%' OR C.NOMECAMPO='DECQTD') ORDER BY C.NOMECAMPO FETCH FIRST 50 ROWS ONLY`, 50);
    return { ...observation, supported: true, columns, fields, hasMore: fields.length === 50 };
  }
  const options = await gateway.select("SELECT C.NOMECAMPO AS FIELD_NAME,O.VALOR AS CODE_VALUE,O.OPCAO AS DESCRIPTION FROM TDDCAM C JOIN TDDOPC O ON O.NUCAMPO=C.NUCAMPO WHERE C.NOMETAB='TGFPPG' AND C.NOMECAMPO IN ('TIPOEMP','TIPOPAR','BASEPRAZO','VENCNAOUTIL','SOMAPRAZOCLIENTE') ORDER BY C.NOMECAMPO,O.VALOR FETCH FIRST 50 ROWS ONLY", 50);
  return { ...observation, supported: true, columns, options, hasMore: options.length === 50 };
}
