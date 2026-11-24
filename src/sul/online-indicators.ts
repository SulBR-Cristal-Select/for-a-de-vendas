import { useEffect, useState } from "react";
import { ERPOnlineError } from "../lib/erp-online";
import type { ERPClient } from "./erp-hooks";
import {
  decodeIndicatorSeries,
  type ERPIndicatorQuery,
  type ERPIndicatorWindow,
  type IndicatorSeries,
} from "../lib/erp-indicator-series";
import type { ERPRankingWindow } from "../lib/erp-ranking";
import { requiredIndicatorSeries } from "./indicator-bindings";
export type OnlineIndicators = {
  ranking?: ERPRankingWindow;
  series: Partial<Record<IndicatorSeries, ERPIndicatorWindow>>;
  errors: Record<string, string>;
};
const invalid = (): never => {
  throw new ERPOnlineError("INVALID_RESPONSE");
};
/** Somente agregados transitórios, até50 grupos por requisição. Sem gravação/fallback local. */
export async function collectIndicatorSeries(
  client: ERPClient,
  q: Omit<ERPIndicatorQuery, "offset" | "limit">,
  check: () => void = () => {},
): Promise<ERPIndicatorWindow> {
  const rows: ERPIndicatorWindow["items"] = [];
  let first: ERPIndicatorWindow | undefined, key: string | undefined;
  for (let offset = 0; ; offset += 50) {
    check();
    const r = await client.indicatorSeries({ ...q, offset, limit: 50 });
    check();
    const signature = JSON.stringify([
      r.summary,
      r.total,
      r.month,
      r.period,
      r.indicatorPolicy,
      r.companyCodes,
      r.selection,
    ]);
    if (key !== undefined && key !== signature) invalid();
    key = signature;
    first ??= r;
    if (r.total > 10000) throw new ERPOnlineError("INVALID_RESPONSE");
    if (r.items.length !== Math.min(50, Math.max(0, r.total - offset))) invalid();
    rows.push(...r.items);
    if (rows.length >= r.total) break;
  }
  const complete = { ...first!, items: rows, offset: 0 };
  decodeIndicatorSeries(complete, { ...q, offset: 0, limit: 50 }, invalid);
  return complete;
}
export function useOnlineIndicators(
  client: ERPClient | undefined,
  month: string,
  seller: string,
  names: readonly string[],
  identity: string,
) {
  const key = JSON.stringify([month, seller, [...new Set(names)].sort(), identity]),
    [result, setResult] = useState<{ client: ERPClient; key: string; data: OnlineIndicators }>();
  useEffect(() => {
    if (!client) return;
    let alive = true;
    const data: OnlineIndicators = { series: {}, errors: {} };
    const check = () => {
      if (!alive) throw new ERPOnlineError("REQUEST_CANCELLED");
    };
    const publish = () => {
      if (alive)
        setResult({
          client,
          key,
          data: { ...data, series: { ...data.series }, errors: { ...data.errors } },
        });
    };
    // identity só invalida trabalho; o Auth e o escopo real continuam no servidor.
    let sellerCode: number | undefined;
    if (seller) {
      const m = /^sankhya:seller:([1-9]\d{0,9})$/.exec(seller);
      if (!m || Number(m[1]) > 2147483647) {
        data.errors["ranking"] = "Filtro de vendedor ERP inválido.";
        for (const s of requiredIndicatorSeries(names)) data.errors[s] = data.errors["ranking"];
        publish();
        return;
      }
      sellerCode = Number(m[1]);
    }
    // Até três consultas independentes: uma série lenta não bloqueia todas as demais.
    const jobs = [
      async () => {
        try {
          const ranking = await client.rankingReport({
            resource: "orders",
            month,
            offset: 0,
            limit: 50,
            ...(sellerCode === undefined ? {} : { sellerCode }),
          });
          check();
          data.ranking = ranking;
        } catch (e) {
          if (!alive) return;
          data.errors["ranking"] = e instanceof Error ? e.message : "Consulta nativa indisponível.";
        }
        publish();
      },
      ...requiredIndicatorSeries(names).map((series) => async () => {
        try {
          data.series[series] = await collectIndicatorSeries(
            client,
            {
              resource: "orders",
              month,
              series,
              ...(sellerCode === undefined ? {} : { sellerCode }),
            },
            check,
          );
        } catch (e) {
          if (!alive) return;
          data.errors[series] = e instanceof Error ? e.message : "Consulta nativa indisponível.";
        }
        publish();
      }),
    ];
    let next = 0;
    const worker = async () => {
      while (alive) {
        const job = jobs[next++];
        if (!job) return;
        check();
        await job();
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [client, key]);
  return result?.client === client && result?.key === key ? result.data : undefined;
}
