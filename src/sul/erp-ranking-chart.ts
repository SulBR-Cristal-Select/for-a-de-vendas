import { useEffect, useState } from "react";
import { ERPOnlineError } from "../lib/erp-online";
import { decimalUnits, sumERPDecimals } from "../lib/erp-decimal";
import { exportERPRows, type ERPClient, type ERPReportSource } from "./erp-hooks";
import { salesChartCoordinate } from "./erp-sales-chart";
import type { ERPRankingQuery, ERPRankingSummary } from "../lib/erp-ranking";
type Context = { summary: ERPRankingSummary | undefined; source?: ERPReportSource };
type Point = { id: string; vendedor: string; Vendido: number; target: string | null };
export async function readRankingChart(
  client: ERPClient,
  context: Context,
  assertCurrent: () => void = () => {},
): Promise<Point[]> {
  const { summary, source } = context;
  if (!summary || !source || !("month" in source.query))
    throw new ERPOnlineError("INVALID_RESPONSE");
  if (summary.documentAmount === null || summary.documentCount === 0) return [];
  // Gráfico por filtros, independente da busca da tabela; totais sempre completos.
  const query = { ...source.query, search: "", sort: "rank", direction: "asc" } as Omit<
    ERPRankingQuery,
    "offset" | "limit"
  >;
  const rows = await exportERPRows(
    { client, resource: "orders", rankingReport: query, registerExport: false },
    query,
    [],
    assertCurrent,
  );
  if (
    rows.length !== summary.sellerCount ||
    rows.reduce((n, r) => n + Number(r["count"]), 0) !== summary.documentCount ||
    sumERPDecimals(rows.map((r) => String(r["total"]))) !== summary.documentAmount ||
    rows.filter((r) => r["target"] === null).length !== summary.targetMissingCount ||
    (summary.targetAmount !== null &&
      decimalUnits(sumERPDecimals(rows.map((r) => String(r["target"])))) !==
        decimalUnits(summary.targetAmount))
  )
    throw new ERPOnlineError("INVALID_RESPONSE");
  return rows.map((r) => ({
    id: String(r["id"]),
    vendedor: typeof r["name"] === "string" ? r["name"] : "Não extraído",
    Vendido: salesChartCoordinate(String(r["total"])),
    target: r["target"] as string | null,
  }));
}
export function useRankingChart(client: ERPClient | undefined, context: Context | undefined) {
  const [result, setResult] = useState<{ client: ERPClient; context: Context; rows: Point[] }>();
  useEffect(() => {
    if (!client || !context?.summary || !context.source) return;
    let alive = true;
    const check = () => {
      if (!alive) throw new ERPOnlineError("REQUEST_CANCELLED");
    };
    void readRankingChart(client, context, check)
      .then((rows) => {
        if (alive) setResult({ client, context, rows });
      })
      .catch(() => {
        if (alive) setResult({ client, context, rows: [] });
      });
    return () => {
      alive = false;
    };
  }, [client, context]);
  return result?.client === client && result?.context === context ? (result?.rows ?? []) : [];
}
