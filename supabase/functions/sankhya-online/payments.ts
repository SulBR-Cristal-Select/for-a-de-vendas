import { SankhyaError, type SankhyaGateway } from './gateway.ts';
import { readRecord, scopeOf, sellerPredicate, type ReadScope } from './read-model.ts';
import { partnerCompany } from './policy.ts';
import { foldERPText } from '../../../src/lib/erp-order.ts';
type Transport = Pick<SankhyaGateway, 'select'>;
type Row = Record<string, unknown>;
export type PaymentContext = { partnerCode: number; companyCode: 1 | 4; date: string; creditBlocked: boolean };
export type PaymentOption = { id: string; code: number; label: string; version: string; subtype: string; isCredit: boolean | null; tableCode: number | null };
const fail = (code = 'ERP_INVALID_RESPONSE', message = 'Condição de pagamento ERP não confirmada.'): never => { throw new SankhyaError(code, message, 502); };
const integer = (v: unknown, min = 0): number => {
  if (!(typeof v === 'number' || typeof v === 'string' && /^\d+$/.test(v))) return fail();
  const n = Number(v); if (!Number.isSafeInteger(n) || n < min || n > 9999999999) return fail(); return n;
};
const text = (v: unknown): string => typeof v === 'string' && v.trim() ? v : fail();
const literal = (v: string) => "'" + v.replaceAll("'", "''") + "'";
function dateValue(value?: unknown): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (key: string) => parts.find(p => p.type === key)?.value;
  const day = value ?? `${part('year')}-${part('month')}-${part('day')}`;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day + 'T00:00:00Z')) || new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day) throw new SankhyaError('INVALID_REQUEST', 'Data comercial inválida.', 400);
  return day;
}
function predicate(context: PaymentContext, scope: ReadScope): string {
  const allowed = scopeOf(scope);
  if (!allowed.companies.includes(context.companyCode)) throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Filial fora do escopo autorizado.', 403);
  const clause = sellerPredicate(allowed, 'C.CODVEND'), seller = clause ? ` AND ${clause}` : '';
  integer(context.partnerCode, 1);
  if (![1, 4].includes(context.companyCode)) throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Filial fora do escopo autorizado.', 403);
  const day = dateValue(context.date);
  const asOf = `LEAST(SYSDATE,TO_DATE('${day} 23:59:59','YYYY-MM-DD HH24:MI:SS'))`;
  // Grupo é um código do cadastro, nunca nome/e-mail. PPG.CODEMP não filtra a filial:
  // TIPOEMP=E usa a empresa do cabeçalho, conforme documentação e dicionário reais.
  return `C.CODPARC=${context.partnerCode} AND (C.CODEMP=${context.companyCode}${context.companyCode === 1 ? ' OR C.CODEMP IS NULL' : ''}) AND C.ATIVO='S' AND C.CLIENTE='S'${seller} AND T.ATIVO='S' AND T.DHALTER=(SELECT MAX(V.DHALTER) FROM TGFTPV V WHERE V.CODTIPVENDA=T.CODTIPVENDA AND V.DHALTER<=${asOf}) AND (TRIM(T.GRUPOAUTOR) IS NULL OR (LENGTH(TRIM(T.GRUPOAUTOR))=1 AND INSTR(C.GRUPOAUTOR,TRIM(T.GRUPOAUTOR))>0))${context.creditBlocked ? " AND T.SUBTIPOVENDA='1'" : ''} AND EXISTS(SELECT 1 FROM TGFPPG G WHERE G.CODTIPVENDA=T.CODTIPVENDA)`;
}
function mapPayment(row: Row): PaymentOption {
  const code = integer(row['CODTIPVENDA'], 1), subtype = text(row['SUBTIPOVENDA']);
  if (row['ATIVO'] !== 'S' || row['CODTAB'] === undefined) return fail();
  if (!/^[1-8]$/.test(subtype)) return fail();
  const version = text(row['VERSION']);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(version)) return fail();
  // Só a classificação à vista é confirmada como exceção ao bloqueio a prazo.
  // Outros subtipos não viram "à vista" por nome, parcelas ou ausência de flag.
  return { id: `sankhya:payment:${code}`, code, label: text(row['DESCRTIPVENDA']), version, subtype, isCredit: subtype === '1' ? false : ['2','3','4','5'].includes(subtype) ? true : null, tableCode: row['CODTAB'] === null ? null : integer(row['CODTAB']) };
}
const paymentFields = "T.CODTIPVENDA,T.DESCRTIPVENDA,T.ATIVO,T.CODTAB,TO_CHAR(T.DHALTER,'YYYY-MM-DD\"T\"HH24:MI:SS') AS VERSION,T.SUBTIPOVENDA";
export async function readEligiblePayment(gateway: Transport, context: PaymentContext, code: number, scope: ReadScope): Promise<PaymentOption> {
  integer(code, 1);
  const rows = await gateway.select(`SELECT ${paymentFields} FROM TGFTPV T JOIN TGFPAR C ON C.CODPARC=${context.partnerCode} WHERE ${predicate(context, scope)} AND T.CODTIPVENDA=${code} FETCH FIRST 2 ROWS ONLY`, 2);
  if (rows.length !== 1) throw new SankhyaError('ERP_PAYMENT_SCOPE_UNAVAILABLE', 'Condição de pagamento não autorizada para este parceiro e contexto.', 400);
  const payment = mapPayment(rows[0]!);
  if (payment.code !== code || context.creditBlocked && payment.isCredit !== false) throw new SankhyaError('ERP_PAYMENT_SCOPE_UNAVAILABLE', 'Condição de pagamento não autorizada para este parceiro e contexto.', 400);
  return payment;
}
export async function readPaymentOptions(gateway: Transport, input: { customerId: string; offset: number; limit: number; search?: string; date?: string }, scope: ReadScope) {
  scopeOf(scope);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['customerId','offset','limit','search','date'].includes(k)) || typeof input.customerId !== 'string' || !/^sankhya:customer:[1-9]\d*$/.test(input.customerId) || !Number.isSafeInteger(input.offset) || input.offset < 0 || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50 || input.search !== undefined && (typeof input.search !== 'string' || input.search.length > 100)) throw new SankhyaError('INVALID_REQUEST', 'Consulta de condições inválida.', 400);
  const customer = (await readRecord(gateway, { resource: 'customers', id: input.customerId }, scope)).record;
  if (!customer || customer['active'] !== true) throw new SankhyaError('ERP_CONTEXT_REQUIRED', 'Cliente ERP ativo necessário.', 400);
  const erp = customer['erp'] as Row;
  const context: PaymentContext = { partnerCode: integer(erp['partnerCode'], 1), companyCode: partnerCompany(erp['companyCode']), date: dateValue(input.date), creditBlocked: erp['creditBlocked'] === true };
  const base = `FROM TGFTPV T JOIN TGFPAR C ON C.CODPARC=${context.partnerCode} WHERE ${predicate(context, scope)}`;
  const needle = foldERPText(input.search?.trim() ?? '');
  const folded = "ASCIISTR(TRANSLATE(UPPER(T.DESCRTIPVENDA),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN'))";
  const escaped = needle.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_');
  const search = needle ? ` AND (${folded} LIKE ${literal('%' + escaped + '%')} ESCAPE '!' OR TO_CHAR(T.CODTIPVENDA) LIKE ${literal('%' + escaped + '%')} ESCAPE '!')` : '';
  const count = async (suffix: string) => {
    const r = await gateway.select(`SELECT COUNT(*) AS TOTAL ${base}${suffix}`, 1);
    if (r.length !== 1) return fail(); return integer(r[0]!['TOTAL']);
  };
  const totalWithoutSearch = await count(''), total = needle ? await count(search) : totalWithoutSearch;
  const rows = await gateway.select(`SELECT ${paymentFields} ${base}${search} ORDER BY NLSSORT(${folded},'NLS_SORT=BINARY'),T.CODTIPVENDA OFFSET ${input.offset} ROWS FETCH NEXT ${input.limit} ROWS ONLY`, input.limit);
  if (rows.length !== Math.min(input.limit, Math.max(0, total - input.offset))) return fail();
  return { source: 'sankhya' as const, readOnly: true as const, readAt: new Date().toISOString(), items: rows.map(mapPayment), total, totalWithoutSearch, offset: input.offset };
}
function percentage(v: unknown): { value: number; units: bigint } {
  const s = typeof v === 'number' || typeof v === 'string' ? String(v) : '';
  const m = /^(\d{1,3})(?:\.(\d{1,7}))?$/.exec(s);
  if (!m) return fail();
  const units = BigInt(m[1]!) * 10000000n + BigInt((m[2] || '').padEnd(7, '0'));
  if (units <= 0n || units > 1000000000n) return fail();
  return { value: Number(s), units };
}
export async function readPaymentRules(gateway: Transport, context: PaymentContext, code: number, scope: ReadScope) {
  const option = await readEligiblePayment(gateway, context, code, scope);
  const counts = await gateway.select(`SELECT COUNT(*) AS TOTAL FROM TGFPPG WHERE CODTIPVENDA=${code}`, 1);
  if (counts.length !== 1) return fail();
  const total = integer(counts[0]!['TOTAL'], 1);
  if (total > 60) throw new SankhyaError('ERP_PAYMENT_SCOPE_UNAVAILABLE', 'Parcelamento fora do contrato comercial suportado.', 400);
  const installments: Row[] = [], rules: Row[] = [], sequences = new Set<number>(); let sum = 0n;
  for (let offset = 0; offset < total; offset += 50) {
    const limit = Math.min(50, total - offset);
    const rows = await gateway.select(`SELECT SEQUENCIA,PRAZO,PERCENTUAL,CODEMP,CODPARC,TIPOEMP,TIPOPAR,BASEPRAZO,VENCNAOUTIL,SOMAPRAZOCLIENTE,CASE WHEN FORMULA IS NULL THEN 0 ELSE 1 END AS HASFORMULA FROM TGFPPG WHERE CODTIPVENDA=${code} ORDER BY SEQUENCIA OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`, limit);
    if (rows.length !== limit) return fail();
    for (const row of rows) {
      const sequence = integer(row['SEQUENCIA'], 1), days = integer(row['PRAZO']), p = percentage(row['PERCENTUAL']);
      if (sequence > 99 || days > 99999 || sequences.has(sequence)) return fail();
      if (integer(row['HASFORMULA']) !== 0) throw new SankhyaError('ERP_PAYMENT_SCOPE_UNAVAILABLE', 'Fórmula financeira não executada por este aplicativo.', 400);
      if (!['C','E','N','X'].includes(String(row['TIPOEMP'])) || !['C','D','N','T','V','X'].includes(String(row['TIPOPAR'])) || !['N','S'].includes(String(row['SOMAPRAZOCLIENTE']))) return fail();
      sequences.add(sequence); sum += p.units;
      installments.push({ sequence, days, percentage: p.value });
      rules.push({ sequence, companyCode: row['CODEMP'] === null ? null : integer(row['CODEMP']), partnerCode: row['CODPARC'] === null ? null : integer(row['CODPARC']), companyType: row['TIPOEMP'], partnerType: row['TIPOPAR'], baseTerm: row['BASEPRAZO'], nonBusinessDay: row['VENCNAOUTIL'], addCustomerTerm: row['SOMAPRAZOCLIENTE'], hasFormula: false });
    }
  }
  if (sum < 999900000n || sum > 1000000000n) return fail('ERP_PAYMENT_SCOPE_UNAVAILABLE', 'Percentuais originais de pagamento fora do contrato suportado.');
  return { code: option.code, label: option.label, version: option.version, isCredit: option.isCredit, installments, rules: { subtype: option.subtype, original: rules, hasFormula: false, financialGenerated: false } };
}
