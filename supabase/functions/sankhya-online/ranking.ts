import { scopeOf, sellerAllowed } from "./read-model.ts";
import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import { readRankingSales, type SalesReportInput } from "./history.ts";
import type { ReadScope } from "./read-model.ts";
import {
  RANKING_POLICY,
  TARGET_REASONS,
  rankingPeriod,
  rankingProgress,
  validRankingQuery,
  type ERPRankingQuery,
} from "../../../src/lib/erp-ranking.ts";
import {
  decimalUnits,
  erpDecimal,
  formatERPShare,
  sumERPDecimals,
} from "../../../src/lib/erp-decimal.ts";
import { foldERPText } from "../../../src/lib/erp-order.ts";
type Row = Record<string, unknown>;
type TargetReader = (month: string, companies: number[]) => Promise<unknown>;
const incompatible = (): never => {
  throw new SankhyaError(
    "ERP_INVALID_RESPONSE",
    "Resposta comercial incompleta ou divergente.",
    502,
  );
};
const obj = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
/** Consulta transitória: fonte P já validada e metas canônicas por UUID em RPC privado.
 * Coleta apenas grupos de vendedores, em janelas de50; não copia pedidos ou metas.
 */
export async function readRanking(
  g: Pick<SankhyaGateway, "select">,
  value: unknown,
  scope: ReadScope,
  targets: TargetReader,
) {
  if (!obj(value) || !validRankingQuery(value as ERPRankingQuery))
    throw new SankhyaError("INVALID_REQUEST", "Parâmetros mensais inválidos.", 400);
  const q = value as ERPRankingQuery,
    period = rankingPeriod(q),
    rows: Row[] = [];
  const query: SalesReportInput = {
    resource: "orders",
    groupBy: "seller",
    offset: 0,
    limit: 50,
    sort: "total",
    direction: "desc",
    from: period.from,
    to: period.to,
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.sellerCode !== undefined ? { sellerCode: q.sellerCode } : {}),
    ...(q.companyCode !== undefined ? { companyCode: q.companyCode } : {}),
  };
  const first = await readRankingSales(g, query, scope),
    key = JSON.stringify([first.total, first.summary, first.companyCodes]);
  if (first.total > 10000)
    throw new SankhyaError(
      "ERP_CONTEXT_REQUIRED",
      "Recorte de vendedores excede o limite de consulta.",
      502,
    );
  rows.push(...first.items);
  for (let offset = 50; offset < first.total; offset += 50) {
    const w = await readRankingSales(g, { ...query, offset }, scope);
    if (JSON.stringify([w.total, w.summary, w.companyCodes]) !== key)
      throw new SankhyaError(
        "ERP_INVALID_RESPONSE",
        "A fonte mudou durante a leitura. Consulte novamente.",
        502,
      );
    rows.push(...w.items);
  }
  if (
    rows.length !== first.total ||
    new Set(rows.map((r) => r["id"])).size !== rows.length ||
    new Set(rows.map((r) => r["rank"])).size !== rows.length ||
    rows.some(
      (r) =>
        typeof r["rank"] !== "number" ||
        r["rank"] < 1 ||
        r["rank"] > rows.length ||
        typeof r["clients"] !== "number" ||
        r["clients"] < 1 ||
        r["clients"] > Number(r["count"]),
    ) ||
    rows.reduce((n, r) => n + Number(r["count"]), 0) !== first.summary.documentCount ||
    (first.summary.documentAmount !== null &&
      sumERPDecimals(rows.map((r) => String(r["total"]))) !== first.summary.documentAmount)
  )
    return incompatible();
  const data = await targets(q.month, first.companyCodes);
  if (
    !obj(data) ||
    data["source"] !== "local-canonical-targets" ||
    data["identity"] !== "private-Auth-UUID-to-CODVEND" ||
    data["readOnly"] !== true ||
    data["month"] !== q.month ||
    !Array.isArray(data["companyCodes"]) ||
    JSON.stringify([...data["companyCodes"]].sort()) !==
      JSON.stringify([...first.companyCodes].sort()) ||
    !Array.isArray(data["targets"])
  )
    return incompatible();
  const mapped = new Map<number, Row>();
  for (const t of data["targets"]) {
    if (
      !obj(t) ||
      Object.keys(t).some((k) => !["sellerCode", "amount", "reason"].includes(k)) ||
      typeof t["sellerCode"] !== "number" ||
      !Number.isSafeInteger(t["sellerCode"]) ||
      t["sellerCode"] < 1 ||
      t["sellerCode"] > 2147483647 ||
      mapped.has(t["sellerCode"]) ||
      (t["amount"] === null
        ? !(TARGET_REASONS as readonly unknown[]).includes(t["reason"])
        : typeof t["amount"] !== "string" ||
          erpDecimal(t["amount"]) !== t["amount"] ||
          decimalUnits(t["amount"]) < 0n ||
          t["reason"] !== null)
    )
      return incompatible();
    mapped.set(t["sellerCode"], t);
  }
  if (period.targetsComparable) {
    const authorized = scopeOf(scope);
    for (const [seller, t] of mapped) {
      if (
        t["amount"] === null ||
        (q.sellerCode !== undefined && q.sellerCode !== seller) ||
        !sellerAllowed(authorized, seller) ||
        rows.some((r) => r["groupCode"] === seller)
      )
        continue;
      const names = await g.select(
        `SELECT V.CODVEND,V.APELIDO FROM TGFVEN V WHERE V.CODVEND=${seller} FETCH FIRST 1 ROWS ONLY`,
        1,
      );
      if (names.length !== 1 || Number(names[0]!["CODVEND"]) !== seller) continue;
      rows.push({
        id: `sankhya:sales:seller:${seller}`,
        groupCode: seller,
        name: names[0]!["APELIDO"],
        count: 0,
        clients: 0,
        total: "0",
        rank: rows.length + 1,
      });
    }
    rows.sort((a, b) => {
      if (a["total"] === null || b["total"] === null) return a["total"] === null ? 1 : -1;
      const d = decimalUnits(String(b["total"])) - decimalUnits(String(a["total"]));
      return (d < 0n ? -1 : d > 0n ? 1 : 0) || Number(a["groupCode"]) - Number(b["groupCode"]);
    });
    rows.forEach((r, i) => (r["rank"] = i + 1));
  }
  const all = rows.map((r) => {
    const link = mapped.get(Number(r["groupCode"])),
      target = period.targetsComparable ? (link?.["amount"] ?? null) : null,
      reason = period.targetsComparable
        ? (link?.["reason"] ?? (link ? null : "ERP_BINDING_UNAVAILABLE"))
        : q.customerId
          ? "TARGET_CUSTOMER_SCOPE_MISMATCH"
          : "TARGET_PERIOD_MISMATCH";
    return {
      id: `sankhya:ranking:seller:${r["groupCode"] ?? "unknown"}`,
      source: "observado",
      readOnly: true,
      name: r["name"],
      sellerCode: r["groupCode"],
      count: r["count"],
      clients: r["clients"],
      total: r["total"],
      rank: first.summary.missingAmountCount ? null : r["rank"],
      target,
      targetReason: reason,
      hit:
        target !== null && decimalUnits(String(target)) > 0n
          ? formatERPShare(r["total"], target)
          : null,
      progress: rankingProgress(r["total"], target),
    };
  });
  const missing = all.filter((r) => r.target === null).length,
    summary = {
      ...first.summary,
      sellerCount: all.length,
      targetMissingCount: missing,
      targetAmount:
        all.length && !missing ? sumERPDecimals(all.map((r) => String(r.target))) : null,
    };
  const search = foldERPText(q.search ?? ""),
    filtered = all.filter(
      (r) =>
        !search ||
        foldERPText(String(r.name ?? "")).includes(search) ||
        String(r.sellerCode ?? "").includes(search),
    ),
    sort = q.sort ?? "rank",
    direction = q.direction ?? "asc";
  const compare = (a: (typeof all)[number], b: (typeof all)[number]): number => {
    const v = (r: typeof a): unknown =>
      sort === "hit" || sort === "progress"
        ? r.target !== null && decimalUnits(String(r.target)) > 0n && r.total !== null
          ? r
          : null
        : (r as Row)[sort];
    const x = v(a),
      y = v(b);
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
    if (y === null || y === undefined) return -1;
    let result: number;
    if (sort === "hit" || sort === "progress") {
      const n =
        decimalUnits(String(a.total)) * decimalUnits(String(b.target)) -
        decimalUnits(String(b.total)) * decimalUnits(String(a.target));
      result = n < 0n ? -1 : n > 0n ? 1 : 0;
    } else if (sort === "total" || sort === "target") {
      const n = decimalUnits(String(x)) - decimalUnits(String(y));
      result = n < 0n ? -1 : n > 0n ? 1 : 0;
    } else
      result =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "pt-BR");
    return direction === "desc" ? -result : result;
  };
  filtered.sort(
    (a, b) =>
      compare(a, b) ||
      (a.sellerCode === null
        ? 1
        : b.sellerCode === null
          ? -1
          : Number(a.sellerCode) - Number(b.sellerCode)),
  );
  return {
    source: "sankhya" as const,
    readOnly: true as const,
    readAt: first.readAt,
    items: filtered.slice(q.offset, q.offset + q.limit),
    total: filtered.length,
    totalWithoutSearch: all.length,
    offset: q.offset,
    companyCodes: first.companyCodes,
    rankingPolicy: RANKING_POLICY,
    month: q.month,
    period,
    summary,
  };
}
