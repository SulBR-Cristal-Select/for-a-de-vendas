import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import { scopeOf, sellerAllowed, sellerPredicate, type ReadScope } from "./read-model.ts";
import {
  RECEIVABLES_POLICY,
  validReceivablesQuery,
  decodeReceivables,
  type ERPReceivablesQuery,
  type ERPReceivablesWindow,
} from "../../../src/lib/erp-receivables.ts";
import { erpDecimal } from "../../../src/lib/erp-decimal.ts";
import { foldERPText } from "../../../src/lib/erp-order.ts";
const fail = (): never => {
  throw new SankhyaError("ERP_INVALID_RESPONSE", "Recebíveis ERP inválidos ou incompletos.", 502);
};
const context = (): never => {
  throw new SankhyaError(
    "ERP_CONTEXT_REQUIRED",
    "Campos nativos dos recebíveis não confirmados.",
    502,
  );
};
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const fold = (s: string) =>
  `ASCIISTR(TRANSLATE(UPPER(${s}),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN'))`;
function count(v: unknown): number {
  if (typeof v !== "number" && (typeof v !== "string" || !/^\d+$/.test(v))) return fail();
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : fail();
}
function code(v: unknown, min = 1) {
  const n = count(v);
  return n >= min && n <= 2147483647 ? n : fail();
}
const text = (v: unknown) => (v === null ? null : typeof v === "string" ? v : fail());
const money = (v: unknown) => (v === null ? null : (erpDecimal(v) ?? fail()));
/** Receitas não provisionadas dos clientes no escopo atual. Não é saldo,
 * faturamento ou comprovação de pagamento. NUFIN identifica cada desdobramento.
 */
export async function readReceivables(
  gateway: Pick<SankhyaGateway, "select">,
  value: unknown,
  trusted: ReadScope,
): Promise<ERPReceivablesWindow> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !validReceivablesQuery(value as ERPReceivablesQuery)
  )
    throw new SankhyaError("INVALID_REQUEST", "Consulta de títulos inválida.", 400);
  const q = value as ERPReceivablesQuery,
    scope = scopeOf(trusted);
  let companies = scope.companies;
  if (q.companyCode !== undefined) {
    if (!companies.includes(q.companyCode))
      throw new SankhyaError("ERP_SCOPE_FORBIDDEN", "Filial fora do escopo autorizado.", 403);
    companies = [q.companyCode];
  }
  if (q.sellerCode !== undefined && !sellerAllowed(scope, q.sellerCode))
    throw new SankhyaError("ERP_SCOPE_FORBIDDEN", "Vendedor fora do escopo autorizado.", 403);
  const read = async (stage: string, sql: string, limit: number) => {
    try {
      return await gateway.select(sql, limit);
    } catch (e) {
      if (e instanceof SankhyaError)
        throw new SankhyaError(e.code, e.message, e.status, e.upstreamStatus, {
          kind: "receivables-query-stage",
          fields: [],
          hint: stage,
        });
      throw e;
    }
  };
  const required = {
    TGFFIN: {
      NUFIN: "number",
      CODEMP: "number",
      CODPARC: "number",
      CODVEND: "number",
      RECDESP: "number",
      PROVISAO: "text",
      DTVENC: "date",
      DHBAIXA: "date",
      VLRDESDOB: "money",
      NUMNOTA: "number",
    },
    TGFPAR: {
      CODPARC: "number",
      CODEMP: "number",
      CODVEND: "number",
      CLIENTE: "text",
      RAZAOSOCIAL: "text",
    },
  };
  const meta = await read(
    "metadata",
    `SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE ${Object.entries(required)
      .map(
        ([t, cols]) =>
          `(TABLE_NAME='${t}' AND COLUMN_NAME IN (${Object.keys(cols).map(lit).join(",")}))`,
      )
      .join(" OR ")} ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 30 ROWS ONLY`,
    30,
  );
  for (const [t, cols] of Object.entries(required))
    for (const [n, type] of Object.entries(cols))
      if (
        !meta.some(
          (r) =>
            r["TABLE_NAME"] === t &&
            r["COLUMN_NAME"] === n &&
            (type === "text"
              ? ["VARCHAR2", "NVARCHAR2", "CHAR", "NCHAR"].includes(String(r["DATA_TYPE"]))
              : type === "date"
                ? r["DATA_TYPE"] === "DATE"
                : type === "money"
                  ? ["NUMBER", "FLOAT"].includes(String(r["DATA_TYPE"]))
                  : r["DATA_TYPE"] === "NUMBER"),
        )
      )
        return context();
  const base = [
    `F.CODEMP IN (${companies.join(",")})`,
    "F.RECDESP=1",
    "F.PROVISAO='N'",
    "P.CLIENTE='S'",
    `(P.CODEMP IN (${companies.join(",")}) OR (P.CODEMP IS NULL AND EXISTS(SELECT 1 FROM TGFCAB H WHERE H.CODPARC=P.CODPARC AND H.CODEMP IN (${companies.join(",")}) AND H.TIPMOV IN ('P','V'))))`,
  ];
  const owner = sellerPredicate(scope, "P.CODVEND");
  if (owner) base.push(owner);
  if (q.customerId) base.push(`P.CODPARC=${Number(q.customerId.slice(17))}`);
  if (q.sellerCode !== undefined) base.push(`F.CODVEND=${q.sellerCode}`);
  if (q.from) base.push(`F.DTVENC>=TO_DATE(${lit(q.from)},'YYYY-MM-DD')`);
  if (q.to) base.push(`F.DTVENC<TO_DATE(${lit(q.to)},'YYYY-MM-DD')+1`);
  if (q.settlement) base.push(`F.DHBAIXA IS ${q.settlement === "registrada" ? "NOT " : ""}NULL`);
  const where = [...base],
    status = "CASE WHEN F.DHBAIXA IS NULL THEN 'Sem baixa registrada' ELSE 'Baixa registrada' END",
    source = "TGFFIN F JOIN TGFPAR P ON P.CODPARC=F.CODPARC";
  if (q.search?.trim()) {
    const pattern = lit("%" + foldERPText(q.search.trim()).replace(/[!%_]/g, (c) => "!" + c) + "%");
    where.push(
      `(${["P.RAZAOSOCIAL", "TO_CHAR(F.NUFIN)", "TO_CHAR(F.NUMNOTA)", status].map((f) => `${fold(f)} LIKE ${pattern} ESCAPE '!'`).join(" OR ")})`,
    );
  }
  const sums = await read(
    "selected-summary",
    `SELECT COUNT(*) AS RECORD_COUNT,COUNT(DISTINCT F.NUFIN) AS UNIQUE_COUNT,COUNT(CASE WHEN F.VLRDESDOB IS NULL THEN 1 END) AS MISSING_AMOUNT,TO_CHAR(SUM(F.VLRDESDOB),'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS AMOUNT FROM ${source} WHERE ${where.join(" AND ")}`,
    1,
  );
  if (sums.length !== 1) return fail();
  const s = sums[0]!,
    total = count(s["RECORD_COUNT"]),
    missingAmountCount = count(s["MISSING_AMOUNT"]);
  if (count(s["UNIQUE_COUNT"]) !== total || missingAmountCount > total) return fail();
  const amount = missingAmountCount
    ? null
    : total === 0 && s["AMOUNT"] === null
      ? "0"
      : money(s["AMOUNT"]);
  if (!missingAmountCount && amount === null) return fail();
  let unfiltered = total;
  if (where.length !== base.length) {
    const r = await read(
      "unfiltered-count",
      `SELECT COUNT(*) AS RECORD_COUNT FROM ${source} WHERE ${base.join(" AND ")}`,
      1,
    );
    if (r.length !== 1) return fail();
    unfiltered = count(r[0]!["RECORD_COUNT"]);
  }
  if (total > unfiltered) return fail();
  const sorts: Record<string, string> = {
      customer: fold("P.RAZAOSOCIAL"),
      due: "F.DTVENC",
      value: "F.VLRDESDOB",
      status,
      document: "F.NUMNOTA",
      code: "F.NUFIN",
    },
    dir = (q.direction ?? "asc").toUpperCase();
  const rows = await read(
    "page",
    `SELECT F.NUFIN,F.CODEMP,F.CODPARC,F.CODVEND,P.RAZAOSOCIAL,TO_CHAR(F.NUMNOTA) AS DOCUMENT_NUMBER,TO_CHAR(F.DTVENC,'YYYY-MM-DD') AS DUE_DATE,TO_CHAR(F.DHBAIXA,'YYYY-MM-DD') AS SETTLEMENT_DATE,TO_CHAR(F.VLRDESDOB,'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS AMOUNT FROM ${source} WHERE ${where.join(" AND ")} ORDER BY ${sorts[q.sort ?? "due"]} ${dir} NULLS LAST,F.NUFIN ${dir} OFFSET ${q.offset} ROWS FETCH NEXT ${q.limit} ROWS ONLY`,
    q.limit,
  );
  const items = rows.map((r) => {
    const settled = text(r["SETTLEMENT_DATE"]);
    return {
      id: "sankhya:receivable:" + code(r["NUFIN"]),
      companyCode: code(r["CODEMP"]),
      customerId: "sankhya:customer:" + code(r["CODPARC"]),
      sellerCode: r["CODVEND"] === null ? null : code(r["CODVEND"], 0),
      customerName: text(r["RAZAOSOCIAL"]),
      due: text(r["DUE_DATE"]),
      value: money(r["AMOUNT"]),
      settlementDate: settled,
      status: settled === null ? "Sem baixa registrada" : "Baixa registrada",
      document: text(r["DOCUMENT_NUMBER"]),
      source: "observado" as const,
      readOnly: true as const,
    };
  });
  if (items.length !== Math.min(q.limit, Math.max(0, total - q.offset))) return fail();
  const result: ERPReceivablesWindow = {
    source: "sankhya",
    readOnly: true,
    readAt: new Date().toISOString(),
    items,
    total,
    totalWithoutSearch: unfiltered,
    offset: q.offset,
    companyCodes: companies as (1 | 4)[],
    receivablesPolicy: RECEIVABLES_POLICY,
    summary: {
      recordCount: total,
      missingAmountCount,
      amount,
      amountField: "TGFFIN.VLRDESDOB",
      headerCountedOnce: true,
      atomicSnapshot: false,
    },
  };
  decodeReceivables(result as unknown as Record<string, unknown>, q, fail);
  return result;
}
