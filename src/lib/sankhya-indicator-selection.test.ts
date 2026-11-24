import { afterEach, describe, expect, it } from "vitest";
import { indicatorFixture } from "../test/indicator-series-fixture";
import { closeBilledFixtures } from "../test/billed-orders-fixture";
import { readIndicatorSeries } from "../../supabase/functions/sankhya-online/indicator-series";
import { decodeIndicatorSeries, type ERPIndicatorQuery } from "./erp-indicator-series";
const q = {
  resource: "orders" as const,
  month: "2026-10",
  series: "items-selected" as const,
  offset: 0,
  limit: 50,
  productId: "sankhya:product:100",
};
function fixture() {
  const f = indicatorFixture();
  f.db.exec("UPDATE TGFPAR SET ATIVO='S',CODEMP=1");
  return f;
}
afterEach(closeBilledFixtures);
describe("Recortes de indicadores — SQLite adaptado, não Oracle", () => {
  it("seleciona SKU no servidor, sem total do pedido, página local ou preço×quantidade", async () => {
    const f = fixture();
    f.order(1, "999999");
    f.item(1, "9.1234");
    f.item(1, "888", { sequence: 2, product: 101 });
    const r = await f.client.indicatorSeries(q);
    expect(r.selection).toEqual({ productId: q.productId });
    expect(r.summary.value).toBe("9.1234");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      groupCode: 100,
      value: "9.1234",
      quantity: "2",
      unit: "UN",
    });
  });
  it("categoria usa código atual e preserva valores/unidades por produto", async () => {
    const f = fixture();
    f.order(1);
    f.item(1, "9");
    f.item(1, "11", { sequence: 2, product: 101, unit: "KG" });
    const r = await f.client.indicatorSeries({
      ...q,
      productId: undefined,
      categoryCode: 1,
    } as unknown as import("./erp-indicator-series").ERPIndicatorQuery);
    expect(r.summary.value).toBe("20");
    expect(r.items.map((x) => [x.groupCode, x.quantity, x.unit])).toEqual([
      [100, "2", "UN"],
      [101, "2", "KG"],
    ]);
  });
  it("evolução do SKU é diária por DTNEG e ignora outros itens", async () => {
    const f = fixture();
    f.order(1);
    f.item(1, "9");
    f.order(2, "10", { date: "2026-10-26" });
    f.item(2, "11");
    f.item(2, "999", { sequence: 2, product: 101 });
    const r = await f.client.indicatorSeries({ ...q, series: "items-selected-day" });
    expect(r.items.map((x) => [x.label, x.value])).toEqual([
      ["2026-10-25", "9"],
      ["2026-10-26", "11"],
    ]);
  });
  it("positivação do produto mantém denominador atual, sem exigir compra de todos os clientes", async () => {
    const f = fixture();
    f.order(1);
    f.item(1);
    f.order(2);
    f.item(2);
    f.order(3, "10", { customer: 2, seller: 12 });
    f.item(3, "9", { product: 101 });
    const r = await f.client.indicatorSeries({ ...q, series: "wallet-selected-seller" });
    expect(r.summary).toMatchObject({ recordCount: 3, buyerCount: 1, activeCount: 3 });
    expect(r.items.find((x) => x.groupCode === 34)).toMatchObject({ count: 1, buyerCount: 1 });
    expect(r.items.find((x) => x.groupCode === 12)).toMatchObject({ count: 1, buyerCount: 0 });
  });
  it("positivação diária filtrada não soma cliente recorrente nem denominadores", async () => {
    const f = fixture();
    f.order(1);
    f.item(1);
    f.order(2, "10", { date: "2026-10-26" });
    f.item(2);
    f.order(3, "10", { customer: 2 });
    f.item(3, "9", { product: 101 });
    const r = await f.client.indicatorSeries({ ...q, series: "wallet-selected-day" });
    expect(r.total).toBe(31);
    expect(r.summary).toMatchObject({ recordCount: 3, buyerCount: 1 });
    expect(r.items.reduce((n, x) => n + x.buyerCount!, 0)).toBe(2);
    expect(r.items[24]?.buyerCount).toBe(1);
    expect(r.items[25]?.buyerCount).toBe(1);
  });
  it("cliente específico usa código, não homônimo, e carteira ativa atual", async () => {
    const f = fixture();
    f.order(1);
    f.item(1);
    const r = await f.client.indicatorSeries({
      resource: "orders",
      series: "wallet-customer",
      month: q.month,
      offset: 0,
      limit: 50,
      customerId: "sankhya:customer:2",
    });
    expect(r.summary).toMatchObject({ recordCount: 1, buyerCount: 0 });
    f.db.exec("UPDATE TGFPAR SET ATIVO='N' WHERE CODPARC=2");
    const empty = await f.client.indicatorSeries({
      resource: "orders",
      series: "wallet-customer",
      month: q.month,
      offset: 0,
      limit: 50,
      customerId: "sankhya:customer:2",
    });
    expect(empty.summary).toMatchObject({ recordCount: 0, buyerCount: 0 });
  });
  it("faturamento específico de cliente conta a nota integral uma vez, não seus produtos", async () => {
    const f = fixture();
    f.order(200);
    f.item(200);
    f.order(100, "50", { movement: "V", operation: 1101 });
    f.item(100);
    f.db.exec("INSERT INTO TGFVAR VALUES(100,200,1,1)");
    f.order(400, "10", { customer: 2 });
    f.item(400);
    f.order(300, "999", { movement: "V", operation: 1101, customer: 2 });
    f.item(300);
    f.db.exec("INSERT INTO TGFVAR VALUES(300,400,1,1)");
    const r = await f.client.indicatorSeries({
      resource: "orders",
      series: "billing-customer",
      month: q.month,
      offset: 0,
      limit: 50,
      customerId: "sankhya:customer:1",
    });
    expect(r.summary).toMatchObject({ recordCount: 1, value: "50" });
    expect(r.indicatorPolicy.dateField).toBe("TGFCAB.DTFATUR");
  });
  it("linha de outra filial não vira ausência de compra do produto", async () => {
    const f = fixture();
    f.order(1);
    f.item(1, "9", { company: 4 });
    await expect(
      readIndicatorSeries(
        f.g,
        { ...q, series: "wallet-selected-seller" },
        { role: "administrador" },
      ),
    ).rejects.toMatchObject({ code: "ERP_CONTEXT_REQUIRED" });
  });
  it("produto inexistente/fora do catálogo autorizado não vira total zero", async () => {
    const f = fixture();
    f.order(1);
    f.item(1);
    await expect(
      readIndicatorSeries(
        f.g,
        { ...q, productId: "sankhya:product:999" },
        { role: "administrador" },
      ),
    ).rejects.toMatchObject({ code: "ERP_SCOPE_FORBIDDEN" });
  });
  it("recorte conhecido sem compra padrão no mês tem zero observado, não dado local", async () => {
    const f = fixture();
    f.order(1, "10", { date: "2026-09-30" });
    f.item(1);
    const r = await f.client.indicatorSeries(q);
    expect(r.summary).toMatchObject({ value: "0", recordCount: 0 });
    expect(r.items).toEqual([]);
  });
  it("SDK rejeita alteração do recorte ou SKU retornado", async () => {
    const f = fixture();
    f.order(1);
    f.item(1);
    const r = await f.client.indicatorSeries(q);
    for (const mutate of [
      (x: {
        selection: { productId?: string };
        items: {
          groupCode: number;
          id: string;
          label: string;
          activeCount: number;
          count: number;
        }[];
        indicatorPolicy: { countsAdditive: boolean };
        summary: { buyerCount: number };
        total: number;
      }) => (x.selection.productId = "sankhya:product:101"),
      (x: {
        selection: { productId?: string };
        items: {
          groupCode: number;
          id: string;
          label: string;
          activeCount: number;
          count: number;
        }[];
        indicatorPolicy: { countsAdditive: boolean };
        summary: { buyerCount: number };
        total: number;
      }) => {
        x.items[0]!.groupCode = 101;
        x.items[0]!.id = "sankhya:indicator:items-selected:101";
      },
    ]) {
      const x = structuredClone(r);
      mutate(x as unknown as Parameters<typeof mutate>[0]);
      expect(() =>
        decodeIndicatorSeries(x, q, () => {
          throw Error("inválido");
        }),
      ).toThrow();
    }
  });
  it("recortes ausentes, conflitantes e injetados falham antes da rede", async () => {
    const f = fixture();
    for (const patch of [
      { productId: undefined },
      { productId: "manual:100" },
      { categoryCode: 1 },
      { productId: "sankhya:product:0" },
      { productId: "sankhya:product:100 OR 1=1" },
      { series: "items-day" },
      { series: "billing-customer" },
      { customerId: "sankhya:customer:1" },
    ])
      await expect(
        f.client.indicatorSeries({ ...q, ...patch } as ERPIndicatorQuery),
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("escopo privado de vendedor/equipe continua aplicado antes de consultar", async () => {
    const f = fixture();
    f.order(1);
    f.item(1);
    await expect(
      readIndicatorSeries(
        f.g,
        { ...q, sellerCode: 12 },
        { role: "vendedor", sellerCode: 34, companyCodes: [1] },
      ),
    ).rejects.toMatchObject({ code: "ERP_SCOPE_FORBIDDEN" });
    await expect(readIndicatorSeries(f.g, q, { role: "vendedor" })).rejects.toMatchObject({
      code: "ERP_IDENTITY_REQUIRED",
    });
  });
});
