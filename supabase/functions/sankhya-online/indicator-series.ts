import { groupedWindow } from "./group-window.ts";
import type { CustomerGroup } from "../../../src/lib/customer-groups.ts";
import { verifyIndicatorSelection } from "./indicator-selection.ts";
import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import {
  readBillingReport,
  readBillingDays,
  readSalesDays,
  readOrderItemsReport,
} from "./history.ts";
import { readWallet, readWalletDays, readIndicatorWallet } from "./nonbuyers.ts";
import { readCommissions } from "./commissions.ts";
import { readCustomerMetrics } from "./customer-metrics.ts";
import type { ReadScope } from "./read-model.ts";
import {
  INDICATOR_SERIES,
  indicatorSelection,
  indicatorPeriod,
  validIndicatorQuery,
  type ERPIndicatorQuery,
  type IndicatorPoint,
  type IndicatorSummary,
} from "../../../src/lib/erp-indicator-series.ts";
type Row = Record<string, unknown>;
/** Reutiliza leitores fixos. Nenhum SQL, nome de campo ou vínculo vem do navegador. */
export async function readIndicatorSeries(
  g: Pick<SankhyaGateway, "select">,
  value: unknown,
  scope: ReadScope,
  groups: CustomerGroup[] = [],
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !validIndicatorQuery(value as ERPIndicatorQuery)
  )
    throw new SankhyaError("INVALID_REQUEST", "Consulta de indicador inválida.", 400);
  const q = value as ERPIndicatorQuery,
    spec = INDICATOR_SERIES[q.series],
    period = indicatorPeriod(q),
    seller = q.sellerCode === undefined ? {} : { sellerCode: q.sellerCode };
  const selection = indicatorSelection(q);
  if ("selection" in spec) await verifyIndicatorSelection(g, selection, scope);
  const base = {
    resource: "orders" as const,
    offset: q.offset,
    limit: q.limit,
    from: period.from,
    to: period.to,
    ...seller,
    ...(q.customerId ? { customerId: q.customerId } : {}),
  };
  let readAt: string,
    total: number,
    companyCodes: number[],
    items: IndicatorPoint[],
    summary: IndicatorSummary;
  const point = (
    code: unknown,
    label: unknown,
    count: unknown,
    value: unknown = null,
    missing: unknown = 0,
    extras: Partial<IndicatorPoint> = {},
  ): IndicatorPoint => ({
    id: `sankhya:indicator:${q.series}:${code ?? "unknown"}`,
    groupCode: code as number | null,
    label: label as string | null,
    count: count as number,
    value: value as string | null,
    missingValueCount: missing as number,
    quantity: null,
    unit: null,
    buyerCount: null,
    activeCount: null,
    newCount: null,
    ...extras,
  });
  if (spec.family === "items") {
    const r = await readOrderItemsReport(
      g,
      { ...base, productReport: true, sort: "code", direction: "asc" },
      scope,
      spec.dimension,
      selection,
    );
    readAt = r.readAt;
    total = r.total;
    companyCodes = r.companyCodes;
    summary = {
      value: r.summary.subtotal,
      recordCount: r.summary.lineCount,
      missingValueCount: r.summary.missingSubtotalCount,
      buyerCount: null,
      activeCount: null,
      newCount: null,
    };
    items = r.items.map((x: Row) =>
      point(
        x["groupCode"] ?? (typeof x["code"] === "string" ? Number(x["code"]) : null),
        x["name"],
        x["lineCount"],
        x["total"],
        x["missingSubtotalCount"],
        { quantity: x["qty"] as string | null, unit: x["unit"] as string | null },
      ),
    );
  } else if (spec.family === "billing" || spec.family === "sales") {
    const input = {
      ...base,
      resource: "invoices" as const,
      groupBy: "seller" as const,
      sort: "name",
      direction: "asc" as const,
    };
    const r =
      spec.family === "sales"
        ? await readSalesDays(g, { ...input, resource: "orders" }, scope)
        : spec.dimension === "day"
          ? await readBillingDays(g, input, scope)
          : await readBillingReport(g, input, scope);
    readAt = r.readAt;
    total = r.total;
    companyCodes = r.companyCodes;
    summary = {
      value: r.summary.documentAmount,
      recordCount: r.summary.documentCount,
      missingValueCount: r.summary.missingAmountCount,
      buyerCount: null,
      activeCount: null,
      newCount: null,
    };
    items = r.items.map((x: Row) =>
      point(x["groupCode"], x["name"], x["count"], x["total"], x["missingAmountCount"]),
    );
  } else if (spec.family === "commissions") {
    const r = await readCommissions(
      g,
      { ...base, view: "sellers", sort: "name", direction: "asc" },
      scope,
    );
    readAt = r.readAt;
    total = r.total;
    companyCodes = r.companyCodes;
    summary = {
      value: r.summary.amount,
      recordCount: r.summary.entryCount,
      missingValueCount: r.summary.missingAmountCount,
      buyerCount: null,
      activeCount: null,
      newCount: null,
    };
    items = r.items.map((x: Row) =>
      point(x["sellerCode"], x["name"], x["entryCount"], x["commission"], x["missingAmountCount"]),
    );
  } else if (spec.family === "wallet") {
    const walletQuery = {
      resource: "customers",
      view: "sellers",
      month: q.month,
      offset: q.offset,
      limit: q.limit,
      sort: "code",
      direction: "asc",
      ...seller,
      ...(q.customerId ? { customerId: q.customerId } : {}),
    };
    const r =
      groups.length && !q.customerId
        ? spec.dimension === "day"
          ? await readIndicatorWallet(g, walletQuery, scope, "day", selection, groups)
          : await groupedWindow(
              { operation: "wallet-report", query: { ...walletQuery, offset: 0, limit: 50 } },
              groups,
              async (_op, query) => readIndicatorWallet(g, query, scope, "customer", selection),
              true,
            ).then((r) => ({
              ...r,
              items: (r["items"] as Row[])
                .sort((a: Row, b: Row) => Number(a["sellerCode"]) - Number(b["sellerCode"]))
                .slice(q.offset, q.offset + q.limit),
            }))
        : "selection" in spec
          ? await readIndicatorWallet(g, walletQuery, scope, spec.dimension, selection)
          : spec.dimension === "day"
            ? await readWalletDays(
                g,
                {
                  resource: "customers",
                  month: q.month,
                  offset: q.offset,
                  limit: q.limit,
                  ...seller,
                },
                scope,
              )
            : await readWallet(
                g,
                {
                  resource: "customers",
                  view: "sellers",
                  month: q.month,
                  offset: q.offset,
                  limit: q.limit,
                  sort: "code",
                  direction: "asc",
                  ...seller,
                },
                scope,
              );
    readAt = r.readAt;
    total = r.total;
    companyCodes = r.companyCodes;
    if (!("buyerCount" in r.summary))
      throw new SankhyaError("ERP_INVALID_RESPONSE", "Carteira incompleta.", 502);
    summary = {
      value: null,
      recordCount: r.summary.walletCount as number,
      missingValueCount: 0,
      buyerCount: r.summary.buyerCount as number,
      activeCount: r.summary.walletCount as number,
      newCount: null,
    };
    items = r.items.map((x: Row) =>
      point(
        spec.dimension === "day" ? x["dayCode"] : x["sellerCode"],
        spec.dimension === "day" ? x["day"] : x["name"],
        x["walletCount"],
        null,
        0,
        { buyerCount: x["buyerCount"] as number, activeCount: x["walletCount"] as number },
      ),
    );
  } else {
    const r = await readCustomerMetrics(
      g,
      {
        kind: "analytics",
        section: "customers",
        from: period.from,
        to: period.to,
        offset: q.offset,
        ...seller,
      },
      scope,
      true,
      groups,
    );
    readAt = r.readAt;
    total = r.groupCount!;
    companyCodes = r.companyCodes!;
    summary = {
      value: null,
      recordCount: r.totals.customerCount,
      missingValueCount: 0,
      buyerCount: null,
      activeCount: r.totals.activeCustomerCount,
      newCount: r.totals.newCustomerCount,
    };
    items = r.rows
      .slice(0, q.limit)
      .map((x) =>
        point(
          x.sellerCode,
          x.sellerCode === null ? null : "Vendedor ERP " + x.sellerCode,
          x.customerCount,
          null,
          0,
          { activeCount: x.activeCustomerCount, newCount: x.newCustomerCount },
        ),
      );
  }
  return {
    ...("selection" in spec ? { selection } : {}),
    source: "sankhya" as const,
    readOnly: true as const,
    readAt,
    series: q.series,
    month: q.month,
    period,
    companyCodes,
    items,
    total,
    totalWithoutSearch: total,
    offset: q.offset,
    summary,
    indicatorPolicy: {
      ...spec,
      atomicSnapshot: false as const,
      quantitiesConverted: false as const,
      headerAndItemsAdded: false as const,
    },
  };
}
