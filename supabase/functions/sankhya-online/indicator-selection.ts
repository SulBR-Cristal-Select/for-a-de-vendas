import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import { currentCustomerWhere, scopeOf, type ReadScope } from "./read-model.ts";
import {
  validIndicatorSelection,
  type IndicatorSelection,
} from "../../../src/lib/erp-indicator-series.ts";
const invalid = (): never => {
  throw new SankhyaError("INVALID_REQUEST", "Recorte do indicador inválido.", 400);
};
export function checkedSelection(v: IndicatorSelection) {
  if (!validIndicatorSelection(v)) return invalid();
  return v;
}
export function itemSelection(s: IndicatorSelection, item = "I", product = "PR") {
  checkedSelection(s);
  return s.productId
    ? `${item}.CODPROD=${Number(s.productId.slice(16))}`
    : s.categoryCode !== undefined
      ? `${product}.CODGRUPOPROD=${s.categoryCode}`
      : "1=1";
}
export function purchaseSelection(s: IndicatorSelection) {
  checkedSelection(s);
  return s.productId || s.categoryCode !== undefined
    ? `EXISTS(SELECT 1 FROM TGFITE SI LEFT JOIN TGFPRO SP ON SP.CODPROD=SI.CODPROD WHERE SI.NUNOTA=C.NUNOTA AND SI.CODEMP=C.CODEMP AND ${itemSelection(s, "SI", "SP")})`
    : "1=1";
}
export function uncertainSelection(s: IndicatorSelection) {
  checkedSelection(s);
  return s.productId || s.categoryCode !== undefined
    ? `EXISTS(SELECT 1 FROM TGFITE UI LEFT JOIN TGFPRO UP ON UP.CODPROD=UI.CODPROD WHERE UI.NUNOTA=C.NUNOTA AND (UI.CODEMP IS NULL OR UI.CODEMP<>C.CODEMP OR UI.CODPROD IS NULL${s.categoryCode !== undefined ? " OR UP.CODPROD IS NULL" : ""}))`
    : "1=0";
}
/** Valida identidade do recorte no catálogo autorizado, sem ler preço ou copiar cadastros. */
export async function verifyIndicatorSelection(
  g: Pick<SankhyaGateway, "select">,
  s: IndicatorSelection,
  scope: ReadScope,
) {
  checkedSelection(s);
  const allowed = scopeOf(scope);
  let sql: string;
  if (s.customerId) {
    const where = allowed.companies
      .map((c) => "(" + currentCustomerWhere(scope, c, false).join(" AND ") + ")")
      .join(" OR ");
    sql = `SELECT COUNT(*) AS MATCH_COUNT FROM TGFPAR P WHERE (${where}) AND P.CODPARC=${Number(s.customerId.slice(17))}`;
  } else {
    const needed =
      s.categoryCode !== undefined
        ? { TGFPRO: ["CODPROD", "CODGRUPOPROD"], TGFGRU: ["CODGRUPOPROD"] }
        : { TGFPRO: ["CODPROD"] };
    const columns = await g.select(
      `SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE ${Object.entries(needed)
        .map(
          ([t, ns]) =>
            `(TABLE_NAME='${t}' AND COLUMN_NAME IN (${ns.map((n) => `'${n}'`).join(",")}))`,
        )
        .join(" OR ")} ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 4 ROWS ONLY`,
      4,
    );
    if (
      Object.entries(needed).some(([t, ns]) =>
        ns.some(
          (n) =>
            !columns.some(
              (c) => c["TABLE_NAME"] === t && c["COLUMN_NAME"] === n && c["DATA_TYPE"] === "NUMBER",
            ),
        ),
      )
    )
      throw new SankhyaError("ERP_CONTEXT_REQUIRED", "Estrutura do recorte não confirmada.", 502);
    const eligible = `EXISTS(SELECT 1 FROM TGFITE E JOIN TGFCAB H ON H.NUNOTA=E.NUNOTA WHERE E.CODPROD=R.CODPROD AND H.CODEMP IN (${allowed.companies.join(",")}) AND H.TIPMOV IN ('P','V'))`;
    sql = s.productId
      ? `SELECT COUNT(*) AS MATCH_COUNT FROM TGFPRO R WHERE R.CODPROD=${Number(s.productId.slice(16))} AND ${eligible}`
      : `SELECT COUNT(*) AS MATCH_COUNT FROM TGFGRU G WHERE G.CODGRUPOPROD=${s.categoryCode} AND EXISTS(SELECT 1 FROM TGFPRO R WHERE R.CODGRUPOPROD=G.CODGRUPOPROD AND ${eligible})`;
  }
  const rows = await g.select(sql, 1);
  if (rows.length !== 1 || !(rows[0]!["MATCH_COUNT"] === 1 || rows[0]!["MATCH_COUNT"] === "1"))
    throw new SankhyaError(
      "ERP_SCOPE_FORBIDDEN",
      "Recorte não encontrado de forma única no catálogo autorizado.",
      403,
    );
}
