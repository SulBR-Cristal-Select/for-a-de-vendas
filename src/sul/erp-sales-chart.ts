import { useEffect, useState } from 'react';
import { ERPOnlineError, type ERPSalesSummary } from '../lib/erp-online';
import { decimalUnits, erpDecimal, sumERPDecimals } from '../lib/erp-decimal';
import type { ERPClient, ERPReportSource } from './erp-hooks';

export type SalesChartContext = { summary: ERPSalesSummary | undefined; source?: ERPReportSource };
export type SalesChartPoint = { id: string; vendedor: string; total: number; nativeTotal: string };
const invalid = () => new ERPOnlineError('INVALID_RESPONSE');
const companies = (value: readonly number[]) => [...value].sort().join(',');

/** O DS aceita apenas coordenadas numéricas; este valor nunca é usado para somar dinheiro. */
export function salesChartCoordinate(text: string): number {
  if (erpDecimal(text) === null) throw invalid();
  const coordinate = Number(text);
  if (!Number.isFinite(coordinate)) throw invalid();
  const roundTrip = erpDecimal(String(coordinate)) ?? erpDecimal(coordinate.toFixed(9));
  if (roundTrip === null || decimalUnits(roundTrip) !== decimalUnits(text)) throw invalid();
  return coordinate === 0 ? 0 : coordinate;
}

/** Só agregados por código, em janelas <=50; nenhum histórico/carteira é copiado para o workspace. */
export async function readERPSalesChart(client: ERPClient, context: SalesChartContext, assertCurrent: () => void = () => {}): Promise<SalesChartPoint[]> {
  const { summary, source } = context;
  if (!summary || !source || source.query.resource !== 'orders') throw invalid();
  if (summary.documentAmount === null || summary.missingAmountCount > 0 || summary.documentCount === 0) return [];
  const points: SalesChartPoint[] = [], ids = new Set<unknown>();
  let total: number | undefined, unfiltered: number | undefined, count = 0n;
  for (let offset = 0;; offset += 50) {
    assertCurrent();
    const window = await client.salesReport({ ...source.query, resource:'orders', groupBy:'seller', sort:'name', direction:'asc', offset, limit:50 });
    assertCurrent();
    if (JSON.stringify(window.summary) !== JSON.stringify(summary) || companies(window.companyCodes) !== companies(source.companyCodes)
      || (total !== undefined && (total !== window.total || unfiltered !== window.totalWithoutSearch))) throw invalid();
    total = window.total; unfiltered = window.totalWithoutSearch;
    if (window.groupBy !== 'seller' || total > summary.documentCount || !window.items.length) throw invalid();
    for (const row of window.items) {
      const id = row['id'], amount = row['total'], records = row['count'];
      if (typeof id !== 'string' || ids.has(id) || row['groupBy'] !== 'seller' || erpDecimal(amount) === null || !Number.isSafeInteger(records) || (records as number) < 1) throw invalid();
      ids.add(id); count += BigInt(records as number);
      points.push({ id, vendedor:typeof row['name'] === 'string' ? row['name'] : 'Não extraído', nativeTotal:amount as string, total:salesChartCoordinate(amount as string) });
    }
    if (points.length >= total) break;
  }
  if (points.length !== total || count !== BigInt(summary.documentCount) || decimalUnits(sumERPDecimals(points.map(p => p.nativeTotal))) !== decimalUnits(summary.documentAmount)) throw invalid();
  return points;
}

/** Resposta anterior nunca sobrevive a uma nova fonte/identidade nem a uma falha. */
export function useERPSalesChart(client: ERPClient | undefined, context: SalesChartContext | undefined): SalesChartPoint[] {
  const [result, setResult] = useState<{ client: ERPClient; context: SalesChartContext; rows: SalesChartPoint[] }>();
  useEffect(() => {
    if (!client || !context?.source || !context.summary) return;
    let alive = true;
    const assertCurrent = () => { if (!alive) throw new ERPOnlineError('REQUEST_CANCELLED'); };
    void readERPSalesChart(client, context, assertCurrent).then(rows => { if (alive) setResult({client,context,rows}); })
      .catch(() => { if (alive) setResult({client,context,rows:[]}); });
    return () => { alive = false; };
  }, [client, context]);
  return result?.client === client && result?.context === context ? result?.rows || [] : [];
}
