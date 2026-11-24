import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import { scopeOf, type ReadScope } from "./read-model.ts";
import { erpDecimal } from "../../../src/lib/erp-decimal.ts";
import { foldERPText } from "../../../src/lib/erp-order.ts";
type Row = Record<string, unknown>;
const invalid = (): never => {
  throw new SankhyaError("INVALID_REQUEST", "Parâmetros de consulta inválidos.", 400);
};
const incompatible = (): never => {
  throw new SankhyaError("ERP_INVALID_RESPONSE", "Resposta ERP inválida ou incompleta.", 502);
};
const context = (): never => {
  throw new SankhyaError(
    "ERP_CONTEXT_REQUIRED",
    "Estrutura do estoque nativo não confirmada.",
    502,
  );
};
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;
const fold = (s: string) =>
  `ASCIISTR(TRANSLATE(UPPER(${s}),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN'))`;
function count(v: unknown, min = 0): number {
  if (typeof v !== "number" && (typeof v !== "string" || !/^\d+$/.test(v))) return incompatible();
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= min ? n : incompatible();
}
function code(v: unknown, min = 0): number {
  const n = count(v, min);
  return n <= 2147483647 ? n : incompatible();
}
function text(v: unknown): string | null {
  return v === null ? null : typeof v === "string" ? v : incompatible();
}
function decimal(v: unknown): string | null {
  if (v === null) return null;
  const n = erpDecimal(v);
  return n === null ? incompatible() : n;
}
/** Estoque registrado por contexto completo. ESTOQUE-RESERVADO não é apuração nativa de disponível. */
export async function readStock(
  gateway: Pick<SankhyaGateway, "select">,
  value: unknown,
  trustedScope: ReadScope,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const q = value as Row;
  if (
    Object.keys(q).some(
      (k) =>
        !["resource", "offset", "limit", "search", "sort", "direction", "companyCode"].includes(k),
    ) ||
    q["resource"] !== "products"
  )
    return invalid();
  const scope = scopeOf(trustedScope),
    offset = q["offset"],
    limit = q["limit"],
    sort = q["sort"] ?? "code",
    dir = q["direction"] ?? "asc",
    search = q["search"] ?? "";
  if (
    typeof offset !== "number" ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    offset > 2147483647 - limit ||
    typeof sort !== "string" ||
    ![
      "code",
      "name",
      "stock",
      "companyCode",
      "localCode",
      "control",
      "partnerCode",
      "stockType",
      "unit",
      "reserved",
    ].includes(sort) ||
    typeof dir !== "string" ||
    !["asc", "desc"].includes(dir) ||
    typeof search !== "string" ||
    search.length > 120 ||
    /[;]|--|\/\*|\*\//.test(search) ||
    Array.from(search).some((character) => character.charCodeAt(0) < 32) ||
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|EXECUTE|CALL|DBMS_|UTL_)\b/i.test(search)
  )
    return invalid();
  let companies = scope.companies;
  if (q["companyCode"] !== undefined) {
    if (q["companyCode"] !== 1 && q["companyCode"] !== 4) return invalid();
    if (!companies.includes(q["companyCode"]))
      throw new SankhyaError("ERP_SCOPE_FORBIDDEN", "Filial fora do escopo autorizado.", 403);
    companies = [q["companyCode"]];
  }
  const required = {
    TGFEST: {
      CODEMP: "number",
      CODPROD: "number",
      CODLOCAL: "number",
      CONTROLE: "text",
      CODPARC: "number",
      TIPO: "text",
      ESTOQUE: "number",
      RESERVADO: "number",
    },
    TGFPRO: { CODPROD: "number", DESCRPROD: "text", CODVOL: "text" },
  } as const;
  const columns = await gateway.select(
    "SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME IN ('TGFEST','TGFPRO') AND COLUMN_NAME IN ('CODEMP','CODPROD','CODLOCAL','CONTROLE','CODPARC','TIPO','ESTOQUE','RESERVADO','DESCRPROD','CODVOL') ORDER BY TABLE_NAME,COLUMN_NAME FETCH FIRST 30 ROWS ONLY",
    30,
  );
  for (const [t, fields] of Object.entries(required))
    for (const [n, type] of Object.entries(fields))
      if (
        !columns.some(
          (c) =>
            c["TABLE_NAME"] === t &&
            c["COLUMN_NAME"] === n &&
            (type === "number"
              ? ["NUMBER", "FLOAT", "BINARY_FLOAT", "BINARY_DOUBLE"]
              : ["CHAR", "NCHAR", "VARCHAR2", "NVARCHAR2"]
            ).includes(String(c["DATA_TYPE"])),
        )
      )
        return context();
  const cte = `WITH Q AS (SELECT E.CODEMP,E.CODPROD,E.CODLOCAL,E.CONTROLE,E.CODPARC,E.TIPO,E.ESTOQUE,E.RESERVADO,P.DESCRPROD,P.CODVOL FROM TGFEST E LEFT JOIN TGFPRO P ON P.CODPROD=E.CODPROD WHERE E.CODEMP IN (${companies.join(",")}))`;
  const totals = await gateway.select(`${cte} SELECT COUNT(*) AS TOTAL FROM Q`, 1);
  if (totals.length !== 1) return incompatible();
  const unfiltered = count(totals[0]!["TOTAL"]);
  const duplicates = await gateway.select(
    `${cte} SELECT COUNT(*) AS DUPLICATES FROM (SELECT CODEMP,CODPROD,CODLOCAL,CONTROLE,CODPARC,TIPO FROM Q GROUP BY CODEMP,CODPROD,CODLOCAL,CONTROLE,CODPARC,TIPO HAVING COUNT(*)>1)`,
    1,
  );
  if (duplicates.length !== 1 || count(duplicates[0]!["DUPLICATES"]) !== 0) return context();
  const where = search.trim()
    ? ` WHERE (${[fold("Q.DESCRPROD"), fold("TO_CHAR(Q.CODPROD)")].map((f) => `${f} LIKE ${literal("%" + foldERPText(search.trim()).replace(/[!%_]/g, (c) => "!" + c) + "%")} ESCAPE '!'`).join(" OR ")})`
    : "";
  const filtered = where
    ? await gateway.select(`${cte} SELECT COUNT(*) AS TOTAL FROM Q${where}`, 1)
    : totals;
  if (filtered.length !== 1) return incompatible();
  const total = count(filtered[0]!["TOTAL"]);
  if (total > unfiltered) return incompatible();
  const sorts: Record<string, string> = {
    code: "Q.CODPROD",
    name: `NLSSORT(${fold("Q.DESCRPROD")},'NLS_SORT=BINARY')`,
    stock: "Q.ESTOQUE",
    reserved: "Q.RESERVADO",
    companyCode: "Q.CODEMP",
    localCode: "Q.CODLOCAL",
    partnerCode: "Q.CODPARC",
    control: "NLSSORT(Q.CONTROLE,'NLS_SORT=BINARY')",
    stockType: "NLSSORT(Q.TIPO,'NLS_SORT=BINARY')",
    unit: "NLSSORT(Q.CODVOL,'NLS_SORT=BINARY')",
  };
  const primary = sorts[sort]!,
    direction = dir.toUpperCase();
  const rows = await gateway.select(
    `${cte} SELECT Q.CODEMP,Q.CODPROD,Q.CODLOCAL,Q.CONTROLE,Q.CODPARC,Q.TIPO,Q.DESCRPROD,Q.CODVOL,TO_CHAR(Q.ESTOQUE,'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS STOCK,TO_CHAR(Q.RESERVADO,'TM9','NLS_NUMERIC_CHARACTERS=''.,''') AS RESERVED FROM Q${where} ORDER BY ${primary} ${direction} NULLS LAST,Q.CODPROD ${direction},Q.CODEMP ${direction},Q.CODLOCAL ${direction},Q.CONTROLE ${direction},Q.CODPARC ${direction},Q.TIPO ${direction} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,
    limit,
  );
  if (rows.length !== Math.min(limit, Math.max(0, total - offset))) return incompatible();
  const seen = new Set<string>();
  const items = rows.map((r) => {
    const company = code(r["CODEMP"], 1),
      product = code(r["CODPROD"], 1),
      local = code(r["CODLOCAL"]),
      partner = code(r["CODPARC"]),
      control = text(r["CONTROLE"]),
      type = text(r["TIPO"]),
      unit = text(r["CODVOL"]);
    if (
      !companies.includes(company) ||
      control === null ||
      type === null ||
      type.trim() === "" ||
      unit === null ||
      unit.trim() === ""
    )
      return context();
    const id =
      "sankhya:stock:" +
      encodeURIComponent(JSON.stringify([company, product, local, control, partner, type]));
    if (seen.has(id)) return incompatible();
    seen.add(id);
    return {
      id,
      code: String(product),
      name: text(r["DESCRPROD"]),
      companyCode: company,
      localCode: local,
      control,
      partnerCode: partner,
      stockType: type,
      unit,
      stock: decimal(r["STOCK"]),
      reserved: decimal(r["RESERVED"]),
      available: null,
      source: "observado" as const,
      readOnly: true as const,
    };
  });
  return {
    source: "sankhya" as const,
    readOnly: true as const,
    readAt: new Date().toISOString(),
    items,
    total,
    totalWithoutSearch: unfiltered,
    offset,
    companyCodes: companies,
    stockPolicy: {
      field: "TGFEST.ESTOQUE",
      reservedField: "TGFEST.RESERVADO",
      available: false,
      availableReason: "ERP_AVAILABLE_STOCK_NOT_CONFIRMED",
      calculatedBalance: false,
      quantitiesConverted: false,
      contextsAggregated: false,
      atomicSnapshot: false,
    },
  };
}
