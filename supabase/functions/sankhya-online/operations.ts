import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import type { ReadScope } from "./read-model.ts";
type Row = Record<string, unknown>;
type Input = { page?: number; pageSize?: 10 | 20 | 50 };
const invalid = (): never => {
  throw new SankhyaError("INVALID_REQUEST", "Parâmetros de consulta inválidos.", 400);
};
const count = (value: unknown): number => {
  if (typeof value !== "number" && typeof value !== "string")
    throw new SankhyaError("ERP_INVALID_RESPONSE", "Contagem ERP incompatível.");
  const result = Number(value);
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isSafeInteger(result) ||
    result < 0
  )
    throw new SankhyaError("ERP_INVALID_RESPONSE", "Contagem ERP incompatível.");
  return result;
};
// Candidatas observadas nas filiais autorizadas. Histórico não define TOP padrão.
const from = `TGFTOP T JOIN (SELECT CODTIPOPER,SUM(CASE WHEN CODEMP=1 THEN 1 ELSE 0 END) AS COMPANY_1,SUM(CASE WHEN CODEMP=4 THEN 1 ELSE 0 END) AS COMPANY_4 FROM TGFCAB WHERE CODEMP IN (1,4) AND TIPMOV='P' GROUP BY CODTIPOPER) U ON U.CODTIPOPER=T.CODTIPOPER`;
const where = `T.TIPMOV='P' AND T.ATIVO='S' AND T.DHALTER=(SELECT MAX(X.DHALTER) FROM TGFTOP X WHERE X.CODTIPOPER=T.CODTIPOPER AND X.DHALTER<=SYSDATE)`;
export async function readOperationOptions(
  gateway: Pick<SankhyaGateway, "select">,
  input: Input,
  scope: ReadScope,
) {
  if (scope.role !== "administrador")
    throw new SankhyaError("FORBIDDEN", "Operação reservada ao administrador.", 403);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["page", "pageSize"].includes(key))
  )
    invalid();
  const page = input.page ?? 1,
    size = input.pageSize ?? 20;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    ![10, 20, 50].includes(size) ||
    typeof size !== "number"
  )
    invalid();
  const offset = (page - 1) * size;
  if (!Number.isSafeInteger(offset) || offset > 2147483647 - size) invalid();
  const counts = await gateway.select(`SELECT COUNT(*) AS TOTAL FROM ${from} WHERE ${where}`, 1);
  if (counts.length !== 1)
    throw new SankhyaError("ERP_INVALID_RESPONSE", "Contagem ERP incompatível.");
  const total = count(counts[0]?.["TOTAL"]);
  const rows: Row[] = await gateway.select(
    `SELECT T.CODTIPOPER,T.DESCROPER,T.BONIFICACAO,TO_CHAR(T.DHALTER,'YYYY-MM-DD"T"HH24:MI:SS') AS VERSION_AT,U.COMPANY_1,U.COMPANY_4 FROM ${from} WHERE ${where} ORDER BY T.CODTIPOPER OFFSET ${offset} ROWS FETCH NEXT ${size} ROWS ONLY`,
    size,
  );
  if (rows.length !== Math.min(size, Math.max(0, total - offset)))
    throw new SankhyaError("ERP_INVALID_RESPONSE", "Página de operações ERP incompatível.");
  const items = rows.map((row) => {
    const code = count(row["CODTIPOPER"]);
    if (code < 1)
      throw new SankhyaError("ERP_INVALID_RESPONSE", "Código de operação ERP incompatível.");
    return {
      code,
      name: row["DESCROPER"] == null ? null : String(row["DESCROPER"]),
      bonusFlag: row["BONIFICACAO"] == null ? null : String(row["BONIFICACAO"]),
      version: row["VERSION_AT"] == null ? null : String(row["VERSION_AT"]),
      documentsByCompany: { "1": count(row["COMPANY_1"]), "4": count(row["COMPANY_4"]) },
    };
  });
  return {
    source: "sankhya" as const,
    readOnly: true as const,
    readAt: new Date().toISOString(),
    items,
    total,
    page,
    pageSize: size,
    hasMore: offset + items.length < total,
  };
}
