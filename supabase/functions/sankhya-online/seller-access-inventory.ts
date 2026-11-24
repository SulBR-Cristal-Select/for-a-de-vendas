import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import type { ReadScope } from "./read-model.ts";
type Row = Record<string, unknown>;
const invalid = (): never => {
  throw new SankhyaError("INVALID_REQUEST", "Inventário de vendedores inválido.", 400);
};
const incompatible = (): never => {
  throw new SankhyaError(
    "ERP_CONTEXT_REQUIRED",
    "Cadastro de vendedores incompleto ou alterado durante a leitura.",
    502,
  );
};
function number(v: unknown, nullable = false): number | null {
  if (nullable && (v === null || v === undefined || v === "")) return null;
  if (typeof v !== "number" && (typeof v !== "string" || !/^\d+$/.test(v))) return incompatible();
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 && n <= 2147483647 ? n : incompatible();
}
function text(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" ? v.trim() || null : incompatible();
}
/** Cadastro administrativo somente leitura. Nunca consulta senha, usuário Auth ou dados comerciais. */
export async function readSellerAccessInventory(
  g: Pick<SankhyaGateway, "select">,
  value: unknown,
  scope: ReadScope,
) {
  if (scope.role !== "administrador")
    throw new SankhyaError("FORBIDDEN", "Inventário reservado ao administrador.", 403);
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const q = value as Row;
  if (
    Object.keys(q).some((k) => !["kind", "offset", "limit"].includes(k)) ||
    q["kind"] !== "seller-access-inventory" ||
    typeof q["offset"] !== "number" ||
    !Number.isSafeInteger(q["offset"]) ||
    q["offset"] < 0 ||
    q["offset"] > 10000 ||
    q["limit"] !== 50
  )
    return invalid();
  const numeric = ["CODVEND", "CODEMP", "CODGER", "CODUSU", "CODPARC"],
    strings = ["APELIDO", "EMAIL", "ATIVO", "TIPVEND"];
  const meta = await g.select(
    "SELECT COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME='TGFVEN' AND COLUMN_NAME IN ('CODVEND','CODEMP','CODGER','CODUSU','CODPARC','APELIDO','EMAIL','ATIVO','TIPVEND') ORDER BY COLUMN_NAME FETCH FIRST 9 ROWS ONLY",
    9,
  );
  if (
    meta.length !== 9 ||
    !numeric.every((k) =>
      meta.some((r) => r["COLUMN_NAME"] === k && r["DATA_TYPE"] === "NUMBER"),
    ) ||
    !strings.every((k) =>
      meta.some(
        (r) =>
          r["COLUMN_NAME"] === k &&
          ["VARCHAR2", "NVARCHAR2", "CHAR", "NCHAR"].includes(String(r["DATA_TYPE"])),
      ),
    )
  )
    return incompatible();
  const where = "P.CODVEND>0 AND (P.CODEMP IN (1,4) OR P.CODEMP IS NULL)";
  const counts = await g.select(
    `SELECT COUNT(*) AS TOTAL,COUNT(DISTINCT P.CODVEND) AS DISTINCT_CODES FROM TGFVEN P WHERE ${where}`,
    1,
  );
  if (counts.length !== 1) return incompatible();
  const total = number(counts[0]?.["TOTAL"]);
  if (total === null || total !== number(counts[0]?.["DISTINCT_CODES"]) || total > 10000)
    return incompatible();
  const rows = await g.select(
    `SELECT P.CODVEND,P.APELIDO,P.EMAIL,P.ATIVO,P.TIPVEND,P.CODEMP,P.CODGER,P.CODUSU,P.CODPARC FROM TGFVEN P WHERE ${where} ORDER BY P.CODVEND OFFSET ${q["offset"]} ROWS FETCH NEXT 50 ROWS ONLY`,
    50,
  );
  if (rows.length !== Math.min(50, Math.max(0, total - q["offset"]))) return incompatible();
  let last = 0;
  const items = rows.map((r) => {
    const code = number(r["CODVEND"]);
    if (code === null || code < 1 || code <= last) return incompatible();
    last = code;
    const companyCode = number(r["CODEMP"], true);
    if (companyCode !== null && companyCode !== 1 && companyCode !== 4) return incompatible();
    const email = text(r["EMAIL"]);
    return {
      code,
      name: text(r["APELIDO"]),
      email,
      emailValid:
        email !== null &&
        email.length <= 254 &&
        /^[^\s@;,<>]+@[^\s@;,<>]+\.[^\s@;,<>]+$/.test(email),
      active: text(r["ATIVO"]),
      type: text(r["TIPVEND"]),
      companyCode,
      managerCode: number(r["CODGER"], true),
      userCode: number(r["CODUSU"], true),
      partnerCode: number(r["CODPARC"], true),
    };
  });
  return {
    source: "sankhya" as const,
    readOnly: true as const,
    supported: true as const,
    readAt: new Date().toISOString(),
    companyCodes: [1, 4],
    includesInactive: true,
    sharedCompanyIsAuthorization: false,
    emailField: "TGFVEN.EMAIL",
    offset: q["offset"],
    limit: 50,
    total,
    hasMore: q["offset"] + items.length < total,
    items,
  };
}
