import {
  consolidateCustomerRows,
  groupMatches,
  groupForCustomer,
  type CustomerGroup,
} from "../../../src/lib/customer-groups.ts";
import { foldERPText } from "../../../src/lib/erp-order.ts";
import { decimalUnits } from "../../../src/lib/erp-decimal.ts";
import { SankhyaError } from "./gateway.ts";
type Row = Record<string, unknown>;
export type GroupedWindowResult = Row & {
  items: Row[];
  total: number;
  readAt: string;
  companyCodes: number[];
  summary: Row;
};
/** Toda a base autorizada precede agrupamento, busca, ordenação e paginação. */
export async function groupedWindow(
  value: Row,
  groups: CustomerGroup[],
  read: (operation: string, query: Row) => Promise<Row>,
  complete = false,
): Promise<GroupedWindowResult> {
  const allowed = ["window", "sales-report", "billing-report", "wallet-report", "nonbuyers-report"];
  if (
    !value ||
    Object.keys(value).some((k) => !["operation", "query"].includes(k)) ||
    typeof value["operation"] !== "string" ||
    !allowed.includes(value["operation"]) ||
    !value["query"] ||
    typeof value["query"] !== "object"
  )
    throw new SankhyaError("INVALID_REQUEST", "Consulta consolidada inválida.", 400);
  const {
    offset,
    limit,
    search = "",
    sort = "name",
    direction = "asc",
    ...base
  } = value["query"] as Row;
  if (
    typeof offset !== "number" ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    offset > 2147483647 - limit ||
    typeof search !== "string" ||
    search.length > 120 ||
    typeof direction !== "string" ||
    !["asc", "desc"].includes(direction) ||
    typeof sort !== "string" ||
    ![
      "name",
      "code",
      "city",
      "state",
      "seller",
      "blocked",
      "source",
      "localStatus",
      "total",
      "count",
      "share",
      "walletCount",
      "buyerCount",
      "nonBuyerCount",
      "qty",
    ].includes(sort)
  )
    throw new SankhyaError("INVALID_REQUEST", "Janela consolidada inválida.", 400);
  const op = value["operation"],
    sales = op === "sales-report" || op === "billing-report";
  if (
    (op === "window" && base["resource"] !== "customers") ||
    (sales && base["groupBy"] !== "customer") ||
    base["customerId"]
  )
    throw new SankhyaError("INVALID_REQUEST", "Consulta não consolidável.", 400);
  if (!groups.length && !complete)
    return {
      ...((await read(op, value["query"] as Row)) as GroupedWindowResult),
      grouping: { source: "manual", composition: "current", identified: true },
    };
  const mode = sales ? "sales" : op === "window" ? "catalog" : "wallet";
  const reader = op === "nonbuyers-report" ? "wallet-report" : op;
  const rows: Row[] = [];
  let first: GroupedWindowResult | undefined;
  for (let next = 0; next <= 5000; next += 50) {
    const r = (await read(reader, {
      ...base,
      ...(op === "nonbuyers-report" || op === "wallet-report" ? { view: "customers" } : {}),
      offset: next,
      limit: 50,
      sort: "name",
      direction: "asc",
    })) as GroupedWindowResult;
    if (!first) {
      first = r;
      if (r["total"] > 5000)
        throw new SankhyaError(
          "ERP_CONTEXT_REQUIRED",
          "Base excede o limite seguro de consolidação.",
          502,
        );
    }
    if (
      r["total"] !== first["total"] ||
      JSON.stringify(r["summary"]) !== JSON.stringify(first["summary"])
    )
      throw new SankhyaError(
        "ERP_CONTEXT_REQUIRED",
        "Base mudou durante a consolidação. Tente novamente.",
        502,
      );
    rows.push(...r["items"]);
    if (rows.length >= r["total"]) break;
    if (!r["items"].length)
      throw new SankhyaError("ERP_INVALID_RESPONSE", "Janela incompleta.", 502);
  }
  if (
    !first ||
    rows.length !== first["total"] ||
    new Set(rows.map((r) => r["id"])).size !== rows.length
  )
    throw new SankhyaError("ERP_INVALID_RESPONSE", "Base incompleta ou duplicada.", 502);
  let combined = consolidateCustomerRows(rows, groups, mode);
  if (base["productMix"]) {
    for (const row of combined.filter((r) => r["isGroup"])) {
      const members = groups.find((g) => g.id === row["groupId"])!.memberIds;
      const union = await read("group-mix", {
        ...base,
        offset: 0,
        limit: 1,
        sort: "name",
        direction: "asc",
        memberIds: members,
      });
      const value = (union["items"] as Row[])[0];
      if (!value || value["count"] !== row["count"] || value["total"] !== row["total"])
        throw new SankhyaError("ERP_CONTEXT_REQUIRED", "Mix alterado durante a consolidação.", 502);
      row["qty"] = value["qty"];
    }
  }
  const summary = { ...first["summary"] };
  if (mode === "wallet") {
    const walletCount = combined.length,
      buyerCount = combined.filter((r) => r["bought"]).length;
    Object.assign(summary, { walletCount, buyerCount, nonBuyerCount: walletCount - buyerCount });
    if (op === "nonbuyers-report") {
      combined = combined.filter((r) => !r["bought"]);
      summary["customerCount"] = combined.length;
    }
  }

  if (op === "wallet-report" && base["view"] === "sellers") {
    const bySeller = new Map<number | null, Row>();
    for (const r of combined) {
      const seller = r["sellerCode"] == null ? null : Number(r["sellerCode"]);
      const current = bySeller.get(seller) ?? {
        id: `sankhya:wallet:seller:${seller ?? "unassigned"}`,
        name: r["seller"] ?? "Vários vendedores",
        code: seller === null ? null : String(seller),
        sellerCode: seller,
        walletCount: 0,
        buyerCount: 0,
        nonBuyerCount: 0,
        source: "observado",
        readOnly: true,
      };
      current["walletCount"] = Number(current["walletCount"]) + 1;
      const countKey = r["bought"] ? "buyerCount" : "nonBuyerCount";
      current[countKey] = Number(current[countKey]) + 1;
      bySeller.set(seller, current);
    }
    combined = [...bySeller.values()];
  }
  const unfiltered = combined.length,
    needle = foldERPText(search.trim());
  combined = combined.filter((r) => {
    const id = sales ? `sankhya:customer:${r["groupCode"]}` : r["id"];
    const group = r["isGroup"]
      ? groups.find((g) => g.id === r["groupId"])
      : groupForCustomer(groups, id);
    return (
      !needle ||
      (group && groupMatches(group, search)) ||
      foldERPText(
        [
          r["name"],
          r["code"],
          r["cnpj"],
          r["fantasy"],
          r["city"],
          r["state"],
          r["seller"],
          r["localStatus"],
        ].join(" "),
      ).includes(needle)
    );
  });
  const key = sort === "share" ? "total" : sort;
  combined.sort((a, b) => {
    const av = a[key],
      bv = b[key];
    if (av == null || bv == null)
      return av == null ? (bv == null ? String(a["id"]).localeCompare(String(b["id"])) : 1) : -1;
    const cmp =
      key === "total"
        ? decimalUnits(String(av)) < decimalUnits(String(bv))
          ? -1
          : decimalUnits(String(av)) > decimalUnits(String(bv))
            ? 1
            : 0
        : ["count", "code", "walletCount", "buyerCount", "nonBuyerCount", "qty"].includes(key)
          ? Number(av) - Number(bv)
          : foldERPText(String(av)).localeCompare(foldERPText(String(bv)), "en");
    return (direction === "desc" ? -cmp : cmp) || String(a["id"]).localeCompare(String(b["id"]));
  });
  return {
    ...first,
    summary,
    items: complete ? combined : combined.slice(offset, offset + limit),
    offset,
    total: combined.length,
    totalWithoutSearch: unfiltered,
    grouping: { source: "manual", composition: "current", identified: true },
    ...(sales ? { groupBy: "customer" } : {}),
    ...(op === "wallet-report" ? { view: base["view"] } : {}),
  };
}
