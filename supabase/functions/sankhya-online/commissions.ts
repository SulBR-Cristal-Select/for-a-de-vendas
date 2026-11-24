import { salesOperationSQL } from "../../../src/lib/sales-operations.ts";
import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import { scopeOf, sellerAllowed, type ReadScope } from "./read-model.ts";
import { billingOriginFlags } from "./billing-source.ts";
import {
  COMMISSION_POLICY,
  validCommissionQuery,
  type ERPCommissionQuery,
} from "../../../src/lib/erp-commission.ts";
import { erpDecimal } from "../../../src/lib/erp-decimal.ts";
import { foldERPText } from "../../../src/lib/erp-order.ts";
type Row = Record<string, unknown>;
const fail = (): never => {
  throw new SankhyaError("ERP_INVALID_RESPONSE", "Comissões ERP inválidas ou incompletas.", 502);
};
const incomplete = (): never => {
  throw new SankhyaError(
    "ERP_CONTEXT_REQUIRED",
    "Contexto nativo da comissão não confirmado.",
    502,
  );
};
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const fold = (s: string) =>
  `ASCIISTR(TRANSLATE(UPPER(${s}),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN'))`;
function count(v: unknown, min = 0): number {
  if (typeof v !== "number" && (typeof v !== "string" || !/^\d+$/.test(v))) return fail();
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= min ? n : fail();
}
function code(v: unknown, min = 1): number {
  const n = count(v, min);
  return n <= 2147483647 ? n : fail();
}
const text = (v: unknown): string | null =>
  v === null ? null : typeof v === "string" ? v : fail();
const money = (v: unknown): string | null => (v === null ? null : (erpDecimal(v) ?? fail()));
export const COMMISSION_COLUMNS = {
  TGFCOM: { CODEMP: "NUMBER", CODVEND: "NUMBER", NUNOTAORIG: "NUMBER", VLRCOM: "money" },
  TGFCAB: {
    NUNOTA: "NUMBER",
    CODEMP: "NUMBER",
    CODPARC: "NUMBER",
    DTNEG: "DATE",
    VLRNOTA: "money",
    TIPMOV: "text",
    STATUSNOTA: "text",
    STATUSNFE: "text",
    CODTIPOPER: "NUMBER",
    DHTIPOPER: "DATE",
    CODNAT: "NUMBER",
  },
  TGFTOP: {
    CODTIPOPER: "NUMBER",
    DHALTER: "DATE",
    TIPMOV: "text",
    BONIFICACAO: "text",
    GOLDEV: "NUMBER",
    GOLSINAL: "NUMBER",
  },
  TGFVAR: { NUNOTA: "NUMBER", NUNOTAORIG: "NUMBER", SEQUENCIA: "NUMBER", SEQUENCIAORIG: "NUMBER" },
  TGFITE: { NUNOTA: "NUMBER", SEQUENCIA: "NUMBER" },
  TGFPAR: { CODPARC: "NUMBER", RAZAOSOCIAL: "text" },
  TGFVEN: { CODVEND: "NUMBER", APELIDO: "text" },
} as const;
/** Comissões nativas no recorte de venda padrão já aprovado. Uma origem não unívoca continua visível,
 * sem inventar pedido, ratear comissão nem usar o vendedor atual do cliente.
 * O período é a emissão da origem, não referência/fechamento/pagamento.
 */
export async function readCommissions(
  gateway: Pick<SankhyaGateway, "select">,
  value: unknown,
  trusted: ReadScope,
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !validCommissionQuery(value as ERPCommissionQuery)
  )
    throw new SankhyaError("INVALID_REQUEST", "Consulta de comissões inválida.", 400);
  const q = value as ERPCommissionQuery,
    scope = scopeOf(trusted),
    companies = scope.companies.join(",");
  const read = async (stage: string, sql: string, limit: number) => {
    try {
      return await gateway.select(sql, limit);
    } catch (e) {
      if (e instanceof SankhyaError)
        throw new SankhyaError(e.code, e.message, e.status, e.upstreamStatus, {
          kind: "commission-query-stage",
          fields: [],
          hint: stage,
        });
      throw e;
    }
  };
  if (q.sellerCode !== undefined && !sellerAllowed(scope, q.sellerCode))
    throw new SankhyaError("ERP_SCOPE_FORBIDDEN", "Vendedor fora do escopo autorizado.", 403);
  const selected = Object.entries(COMMISSION_COLUMNS)
    .map(
      ([table, cols]) =>
        `(TABLE_NAME=${lit(table)} AND COLUMN_NAME IN (${Object.keys(cols).map(lit).join(",")}))`,
    )
    .join(" OR ");
  const cols = await read(
    "metadata",
    `SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE ${selected} ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 50 ROWS ONLY`,
    50,
  );
  for (const [table, fields] of Object.entries(COMMISSION_COLUMNS))
    for (const [name, type] of Object.entries(fields))
      if (
        !cols.some(
          (r) =>
            r["TABLE_NAME"] === table &&
            r["COLUMN_NAME"] === name &&
            (type === "money"
              ? ["NUMBER", "FLOAT"].includes(String(r["DATA_TYPE"]))
              : type === "text"
                ? ["VARCHAR2", "CHAR", "NVARCHAR2", "NCHAR"].includes(String(r["DATA_TYPE"]))
                : r["DATA_TYPE"] === type),
        )
      )
        return incomplete();
  const filters = [`C.CODEMP IN (${companies})`];
  if (scope.sellers !== null) filters.push(`M.CODVEND IN (${scope.sellers.join(",")})`);
  if (q.sellerCode !== undefined) filters.push(`M.CODVEND=${q.sellerCode}`);
  if (q.status === "confirmado") filters.push("C.STATUSNOTA='L'");
  if (q.customerId !== undefined) filters.push(`C.CODPARC=${Number(q.customerId.slice(17))}`);
  const period = [
    ...(q.from ? [`C.DTNEG>=TO_DATE('${q.from}','YYYY-MM-DD')`] : []),
    ...(q.to ? [`C.DTNEG<TO_DATE('${q.to}','YYYY-MM-DD')+1`] : []),
  ];
  if (period.length) filters.push(`(C.DTNEG IS NULL OR (${period.join(" AND ")}))`);
  const flags = billingOriginFlags("C");
  const standard = `C.TIPMOV='P' AND ${salesOperationSQL("C.CODTIPOPER")} AND C.CODNAT=10100000 AND C.STATUSNOTA='L' AND T.TIPMOV='P' AND T.BONIFICACAO='N' AND T.GOLDEV=1`;
  const invoice = `C.TIPMOV='V' AND C.STATUSNOTA='L' AND C.STATUSNFE='A' AND T.TIPMOV='V' AND T.BONIFICACAO='N' AND T.GOLDEV=1 AND T.GOLSINAL=-1 AND ${flags.HAS_STANDARD_ORIGIN} AND NOT ${flags.HAS_OTHER_ORIGIN} AND NOT ${flags.HAS_UNRESOLVED_ORIGIN} AND NOT ${flags.HAS_UNLINKED_ITEM} AND ${flags.HAS_ITEMS} AND NOT ${flags.HAS_CROSS_COMPANY_ORIGIN}`;
  const uniqueRoot =
    "(SELECT COUNT(DISTINCT R.NUNOTAORIG) FROM TGFVAR R WHERE R.NUNOTA=C.NUNOTA)=1";
  const root = `CASE WHEN ${standard} THEN C.NUNOTA WHEN ${invoice} AND ${uniqueRoot} THEN (SELECT MIN(R.NUNOTAORIG) FROM TGFVAR R WHERE R.NUNOTA=C.NUNOTA) END`;
  const cte = `WITH B AS (SELECT ROWIDTOCHAR(M.ROWID) AS ENTRY_KEY,M.VLRCOM AS NATIVE_AMOUNT,M.CODVEND,M.CODEMP AS DIRECT_COMPANY,C.NUNOTA AS ORIGIN_CODE,C.CODEMP AS ORIGIN_COMPANY,C.CODPARC AS ORIGIN_CUSTOMER,C.DTNEG AS ORIGIN_DATE,${root} AS ROOT_CODE,ROWNUM AS QUERY_BARRIER FROM TGFCOM M JOIN TGFCAB C ON C.NUNOTA=M.NUNOTAORIG LEFT JOIN TGFTOP T ON T.CODTIPOPER=C.CODTIPOPER AND T.DHALTER=C.DHTIPOPER WHERE ${filters.join(" AND ")} AND ((${standard}) OR (${invoice}))), X AS (SELECT B.*,CASE WHEN B.ROOT_CODE IS NULL THEN -B.ORIGIN_CODE ELSE B.ROOT_CODE END AS GROUP_KEY,H.NUNOTA AS ORDER_CODE,H.CODEMP AS ORDER_COMPANY,H.CODPARC AS ORDER_CUSTOMER,H.DTNEG AS ORDER_DATE,H.VLRNOTA AS ORDER_AMOUNT,P.RAZAOSOCIAL,V.APELIDO FROM B LEFT JOIN TGFCAB H ON H.NUNOTA=B.ROOT_CODE LEFT JOIN TGFPAR P ON P.CODPARC=B.ORIGIN_CUSTOMER LEFT JOIN TGFVEN V ON V.CODVEND=B.CODVEND WHERE B.QUERY_BARRIER>0)`;
  const integrity = await read(
    "source-integrity",
    `${cte} SELECT COUNT(*) AS ENTRY_COUNT,COUNT(DISTINCT ENTRY_KEY) AS UNIQUE_ENTRIES,COUNT(CASE WHEN DIRECT_COMPANY IS NOT NULL AND DIRECT_COMPANY<>ORIGIN_COMPANY OR CODVEND IS NULL OR CODVEND<0 OR CODVEND>2147483647 OR ORIGIN_CUSTOMER IS NULL OR ROOT_CODE IS NOT NULL AND (ORDER_CODE IS NULL OR ORDER_COMPANY<>ORIGIN_COMPANY OR ORDER_CUSTOMER<>ORIGIN_CUSTOMER)${period.length ? " OR ORIGIN_DATE IS NULL" : ""} THEN 1 END) AS UNKNOWN_CONTEXT FROM X`,
    1,
  );
  if (integrity.length !== 1) return fail();
  const all = count(integrity[0]!["ENTRY_COUNT"]);
  if (count(integrity[0]!["UNIQUE_ENTRIES"]) !== all || count(integrity[0]!["UNKNOWN_CONTEXT"]) > 0)
    return incomplete();
  const sellers = q.view === "sellers";
  const grouped = `${cte}, G AS (SELECT ${sellers ? "CODVEND AS GROUP_KEY,MAX(APELIDO) AS LABEL" : "GROUP_KEY,MAX(ORDER_CODE) AS ORDER_CODE,MAX(ORIGIN_CODE) AS ORIGIN_CODE,MAX(ORIGIN_COMPANY) AS COMPANY_CODE,MAX(ORIGIN_CUSTOMER) AS CUSTOMER_CODE,MAX(RAZAOSOCIAL) AS LABEL,MAX(CASE WHEN ROOT_CODE IS NOT NULL THEN ORDER_DATE ELSE ORIGIN_DATE END) AS EMISSION,MAX(ORDER_AMOUNT) AS ORDER_AMOUNT"},COUNT(*) AS ENTRY_COUNT,COUNT(CASE WHEN NATIVE_AMOUNT IS NULL THEN 1 END) AS MISSING_AMOUNT,SUM(NATIVE_AMOUNT) AS COMMISSION FROM X GROUP BY ${sellers ? "CODVEND" : "GROUP_KEY"})`;
  const search = q.search?.trim(),
    pattern = search ? lit("%" + foldERPText(search).replace(/[!%_]/g, (c) => "!" + c) + "%") : "";
  const where = search
    ? ` WHERE (${[fold("G.LABEL"), fold("TO_CHAR(G.GROUP_KEY)"), ...(sellers ? [] : [fold("CASE WHEN G.GROUP_KEY<0 THEN 'Não atribuído (origem '||TO_CHAR(G.ORIGIN_CODE)||')' ELSE TO_CHAR(G.ORDER_CODE) END")])].map((f) => `${f} LIKE ${pattern} ESCAPE '!'`).join(" OR ")})`
    : "";
  const unfiltered = await read(
    "group-count",
    `${grouped} SELECT COUNT(*) AS GROUP_COUNT FROM G`,
    1,
  );
  if (unfiltered.length !== 1) return fail();
  const totalWithoutSearch = count(unfiltered[0]!["GROUP_COUNT"]);
  const selectedGroups = `${grouped}, F AS (SELECT G.* FROM G${where})`;
  const key = sellers ? "X.CODVEND" : "X.GROUP_KEY";
  const stats = await read(
    "selected-summary",
    `${selectedGroups} SELECT COUNT(DISTINCT F.GROUP_KEY) AS GROUP_COUNT,COUNT(*) AS ENTRY_COUNT,COUNT(CASE WHEN X.NATIVE_AMOUNT IS NULL THEN 1 END) AS MISSING_AMOUNT,TO_CHAR(SUM(X.NATIVE_AMOUNT),'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS NATIVE_AMOUNT,COUNT(CASE WHEN X.ROOT_CODE IS NULL THEN 1 END) AS UNASSIGNED_COUNT,COUNT(CASE WHEN X.ROOT_CODE IS NULL AND X.NATIVE_AMOUNT IS NULL THEN 1 END) AS UNASSIGNED_MISSING,TO_CHAR(SUM(CASE WHEN X.ROOT_CODE IS NULL THEN X.NATIVE_AMOUNT END),'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS UNASSIGNED_AMOUNT FROM X JOIN F ON F.GROUP_KEY=${key}`,
    1,
  );
  if (stats.length !== 1) return fail();
  const st = stats[0]!,
    total = count(st["GROUP_COUNT"]),
    entryCount = count(st["ENTRY_COUNT"]),
    missing = count(st["MISSING_AMOUNT"]),
    unassigned = count(st["UNASSIGNED_COUNT"]),
    unassignedMissing = count(st["UNASSIGNED_MISSING"]);
  if (
    total > totalWithoutSearch ||
    totalWithoutSearch > all ||
    entryCount > all ||
    missing > entryCount ||
    unassigned > entryCount ||
    unassignedMissing > unassigned
  )
    return fail();
  const summary = {
    entryCount,
    missingAmountCount: missing,
    amount: missing ? null : money(st["NATIVE_AMOUNT"]),
    unassignedEntryCount: unassigned,
    unassignedAmount: unassignedMissing ? null : money(st["UNASSIGNED_AMOUNT"]),
  };
  const sort = q.sort ?? (sellers ? "name" : "number"),
    direction = (q.direction ?? "asc").toUpperCase(),
    sortField =
      sort === "value" || sort === "commission"
        ? "G.COMMISSION"
        : sort === "date"
          ? "G.EMISSION"
          : sort === "number"
            ? "G.GROUP_KEY"
            : sort === "total"
              ? "G.ORDER_AMOUNT"
              : `NLSSORT(${fold("G.LABEL")},'NLS_SORT=BINARY')`;
  const native = await read(
    "page",
    `${grouped} SELECT G.*,TO_CHAR(G.COMMISSION,'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS AMOUNT_TEXT${sellers ? "" : ",TO_CHAR(G.ORDER_AMOUNT,'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS ORDER_AMOUNT_TEXT,TO_CHAR(G.EMISSION,'YYYY-MM-DD') AS DATE_TEXT"} FROM G${where} ORDER BY ${sortField} ${direction} NULLS LAST,G.GROUP_KEY ${direction} OFFSET ${q.offset} ROWS FETCH NEXT ${q.limit} ROWS ONLY`,
    q.limit,
  );
  if (native.length !== Math.min(q.limit, Math.max(0, total - q.offset))) return fail();
  const ids = new Set<string>();
  const items = native.map((r) => {
    const n = count(r["ENTRY_COUNT"], 1),
      absent = count(r["MISSING_AMOUNT"]),
      commission = absent ? null : money(r["AMOUNT_TEXT"]);
    if (absent > n || n > entryCount || (!absent && commission === null)) return fail();
    let item: Row;
    if (sellers) {
      const sellerCode = code(r["GROUP_KEY"], 0);
      if (
        !sellerAllowed(scope, sellerCode) ||
        (q.sellerCode !== undefined && sellerCode !== q.sellerCode)
      )
        return fail();
      item = {
        id: `sankhya:commission:seller:${sellerCode}`,
        sellerCode,
        name: text(r["LABEL"]),
        value: commission,
      };
    } else {
      const assigned = r["ORDER_CODE"] !== null,
        documentCode = code(assigned ? r["ORDER_CODE"] : r["ORIGIN_CODE"]),
        companyCode = code(r["COMPANY_CODE"]),
        customerCode = code(r["CUSTOMER_CODE"]);
      if (
        !scope.companies.includes(companyCode) ||
        (q.customerId !== undefined && q.customerId !== `sankhya:customer:${customerCode}`)
      )
        return fail();
      item = {
        id: `sankhya:commission:${assigned ? "order" : "unassigned-origin"}:${documentCode}`,
        documentCode,
        assigned,
        companyCode,
        number: assigned ? String(documentCode) : `Não atribuído (origem ${documentCode})`,
        customerId: `sankhya:customer:${customerCode}`,
        customerName: text(r["LABEL"]),
        date: text(r["DATE_TEXT"]),
        total: assigned ? money(r["ORDER_AMOUNT_TEXT"]) : null,
      };
    }
    if (ids.has(String(item["id"]))) return fail();
    ids.add(String(item["id"]));
    return {
      ...item,
      entryCount: n,
      missingAmountCount: absent,
      commission,
      source: "observado" as const,
      readOnly: true as const,
    };
  });
  return {
    source: "sankhya" as const,
    readOnly: true as const,
    readAt: new Date().toISOString(),
    view: q.view,
    companyCodes: scope.companies as (1 | 4)[],
    commissionPolicy: COMMISSION_POLICY,
    summary,
    items,
    total,
    totalWithoutSearch,
    offset: q.offset,
  };
}
