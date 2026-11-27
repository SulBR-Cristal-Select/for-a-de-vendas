import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { useOnlineIndicators, collectIndicatorSeries } from "./online-indicators";
import type { ERPClient } from "./erp-hooks";
import { createERPClient, type ERPTransport } from "../lib/erp-online";
import {
  INDICATOR_SERIES,
  indicatorPeriod,
  type ERPIndicatorQuery,
} from "../lib/erp-indicator-series";
afterEach(cleanup);
function series(q: ERPIndicatorQuery) {
  return {
    source: "sankhya",
    readOnly: true,
    readAt: "2026-11-03T12:00:00Z",
    series: q.series,
    month: q.month,
    period: indicatorPeriod(q),
    companyCodes: [1],
    items: [],
    total: 0,
    totalWithoutSearch: 0,
    offset: q.offset,
    summary: {
      value: null,
      recordCount: 0,
      missingValueCount: 0,
      buyerCount: q.series === "wallet-seller" ? 0 : null,
      activeCount: q.series === "wallet-seller" ? 0 : null,
      newCount: null,
    },
    indicatorPolicy: {
      ...INDICATOR_SERIES[q.series],
      atomicSnapshot: false,
      quantitiesConverted: false,
      headerAndItemsAdded: false,
    },
  };
}
describe("Carregamento dos indicadores com concorrência limitada", () => {
  it("carrega séries sem esperar pelo ranking e limita a três requisições simultâneas", async () => {
    let finish!: (v: unknown) => void,
      active = 0,
      max = 0;
    const client = {
      rankingReport: vi.fn(() => {
        active++;
        max = Math.max(max, active);
        return new Promise((resolve) => {
          finish = (v) => {
            active--;
            resolve(v);
          };
        });
      }),
      indicatorSeries: vi.fn(async (q: ERPIndicatorQuery) => {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return series(q);
      }),
    } as unknown as ERPClient;
    const { result } = renderHook(() => useOnlineIndicators(client, "2026-11", "", [], "ator"));
    await waitFor(() => expect(result.current?.series["customers-seller-year"]).toBeDefined());
    expect(result.current?.ranking).toBeUndefined();
    expect(max).toBeLessThanOrEqual(3);
    await act(async () => finish({ items: [], summary: {} }));
    await waitFor(() => expect(result.current?.ranking).toBeDefined());
  });
  it("retira indicadores desmontados da fila sem abortar a leitura ativa nem bloquear a busca de cliente", async () => {
    let finish!: (value: { data: unknown; error: null }) => void;
    const transport = vi
      .fn<ERPTransport>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue({
        data: {
          source: "sankhya",
          readOnly: true,
          readAt: "2026-11-27T19:00:00Z",
          items: [],
          offset: 0,
          total: 0,
          totalWithoutSearch: 0,
        },
        error: null,
      });
    const client = createERPClient(transport);
    const active = client.record({ resource: "products", id: 11029 });
    const hook = renderHook(() => useOnlineIndicators(client, "2026-11", "", [], "bruna"));
    expect(transport).toHaveBeenCalledTimes(1);
    hook.unmount();
    const customer = client.window({ resource: "customers", search: "5261", offset: 0, limit: 50 });
    expect(transport.mock.calls[0]![1].aborted).toBe(false);
    finish({
      data: { source: "sankhya", readOnly: true, readAt: "2026-11-27T19:00:00Z", record: null },
      error: null,
    });
    await active;
    await customer;
    expect(transport.mock.calls.map(([body]) => body.operation)).toEqual(["record", "window"]);
  });
  it("interrompe paginação incompleta em vez de manter loop e resultados parciais", async () => {
    const client = {
      indicatorSeries: vi.fn(async (q: ERPIndicatorQuery) => ({
        ...series(q),
        total: 1,
        items: [],
      })),
    } as unknown as ERPClient;
    await expect(
      collectIndicatorSeries(client, {
        resource: "orders",
        series: "wallet-seller",
        month: "2026-11",
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(client.indicatorSeries).toHaveBeenCalledTimes(1);
  });
  it("não publica resposta da identidade anterior", async () => {
    let finish!: (v: unknown) => void;
    const client = {
      rankingReport: vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
      indicatorSeries: vi.fn(async (q: ERPIndicatorQuery) => series(q)),
    } as unknown as ERPClient;
    const { result, rerender } = renderHook(
      ({ identity }) => useOnlineIndicators(client, "2026-11", "", [], identity),
      { initialProps: { identity: "ator A" } },
    );
    const oldFinish = finish;
    rerender({ identity: "ator B" });
    await act(async () => oldFinish({ items: [{ name: "ator A" }] }));
    expect(result.current?.ranking).toBeUndefined();
  });
});
