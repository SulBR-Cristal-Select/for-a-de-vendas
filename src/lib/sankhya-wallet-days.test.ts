import { afterEach, describe, expect, it } from "vitest";
import { indicatorFixture } from "../test/indicator-series-fixture";
import { closeBilledFixtures } from "../test/billed-orders-fixture";
import { readIndicatorSeries } from "../../supabase/functions/sankhya-online/indicator-series";
import { decodeIndicatorSeries } from "./erp-indicator-series";
const q = {
  resource: "orders" as const,
  month: "2026-10",
  series: "wallet-day" as const,
  offset: 0,
  limit: 50,
};
function fixture() {
  const f = indicatorFixture();
  f.db.exec("UPDATE TGFPAR SET ATIVO='S',CODEMP=1");
  return f;
}
afterEach(closeBilledFixtures);
describe("Positivação diária — SQLite adaptado, não Oracle", () => {
  it("cliente repetido conta uma vez no dia e pode reaparecer noutro, sem soma mensal", async () => {
    const f = fixture();
    f.order(1);
    f.order(2);
    f.order(3, "10", { date: "2026-10-26" });
    const r = await f.client.indicatorSeries(q);
    expect(r.items).toHaveLength(31);
    expect(r.summary).toMatchObject({ recordCount: 3, activeCount: 3, buyerCount: 1 });
    expect(r.items[24]).toMatchObject({ label: "2026-10-25", count: 3, buyerCount: 1 });
    expect(r.items[25]?.buyerCount).toBe(1);
    expect(r.items.reduce((n, x) => n + x.buyerCount!, 0)).toBe(2);
    expect(r.indicatorPolicy).toMatchObject({
      countsAdditive: false,
      sellerField: "TGFPAR.CODVEND",
      dateField: "TGFCAB.DTNEG",
    });
  });
  it("zero diário exige leitura completa; carteira vazia não inventa denominador", async () => {
    const f = indicatorFixture();
    const r = await f.client.indicatorSeries(q);
    expect(r.summary).toMatchObject({ recordCount: 0, activeCount: 0, buyerCount: 0 });
    expect(r.items.every((x) => x.count === 0 && x.buyerCount === 0 && x.activeCount === 0)).toBe(
      true,
    );
  });
  it("não distribui compras pelos outros dias e preserva fronteiras do mês", async () => {
    const f = fixture();
    f.order(1, "10", { date: "2026-10-01 00:00:00" });
    f.order(2, "10", { date: "2026-10-31 23:59:59" });
    f.order(3, "10", { date: "2026-11-01" });
    f.order(4, "10", { date: "2026-09-30" });
    const r = await f.client.indicatorSeries(q);
    expect(r.items[0]?.buyerCount).toBe(1);
    expect(r.items[30]?.buyerCount).toBe(1);
    expect(r.items.slice(1, 30).every((x) => x.buyerCount === 0)).toBe(true);
    expect(r.summary.buyerCount).toBe(1);
  });
  it("cliente inativo e outras operações não positivam a carteira atual", async () => {
    const f = fixture();
    f.db.exec("UPDATE TGFPAR SET ATIVO='N' WHERE CODPARC=1");
    f.order(1);
    f.order(2, "10", { customer: 2, operation: 1003 });
    f.order(3, "10", { customer: 2, movement: "V", operation: 1101 });
    const r = await f.client.indicatorSeries(q);
    expect(r.summary).toMatchObject({ recordCount: 2, buyerCount: 0 });
    expect(r.items.every((x) => x.buyerCount === 0)).toBe(true);
  });
  it("filiais autorizadas não duplicam cliente compartilhado", async () => {
    const f = fixture();
    f.db.exec("UPDATE TGFPAR SET CODEMP=NULL WHERE CODPARC=1");
    f.order(1);
    f.order(2, "10", { company: 4 });
    f.order(3, "10", { company: 2, customer: 2 });
    const r = await f.client.indicatorSeries(q);
    expect(r.summary).toMatchObject({ recordCount: 3, buyerCount: 1 });
    expect(r.items[24]?.buyerCount).toBe(1);
  });
  it("filtro e equipe usam dono atual da carteira, não vendedor histórico nem homônimo", async () => {
    const f = fixture();
    f.order(1, "10", { seller: 12 });
    f.order(2, "10", { customer: 2, seller: 34 });
    const admin = await f.client.indicatorSeries({ ...q, sellerCode: 34 });
    expect(admin.summary).toMatchObject({ recordCount: 1, buyerCount: 1 });
    const own = await readIndicatorSeries(f.g, q, {
      role: "vendedor",
      sellerCode: 12,
      companyCodes: [1],
    });
    expect(own.summary).toMatchObject({ recordCount: 1, buyerCount: 1 });
    await expect(
      readIndicatorSeries(
        f.g,
        { ...q, sellerCode: 34 },
        { role: "vendedor", sellerCode: 12, companyCodes: [1] },
      ),
    ).rejects.toMatchObject({ code: "ERP_SCOPE_FORBIDDEN" });
    const team = await readIndicatorSeries(f.g, q, {
      role: "gestor",
      sellerCode: 34,
      companyCodes: [1],
      teamSellerCodes: [12],
    });
    expect(team.summary.recordCount).toBe(2);
  });
  it("data ausente de comprador mensal também bloqueia série diária inteira", async () => {
    const f = fixture();
    f.order(1);
    f.order(2, "10", { date: null });
    await expect(readIndicatorSeries(f.g, q, { role: "administrador" })).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
  });
  it("TOP histórica ausente não vira dia vazio", async () => {
    const f = fixture();
    f.order(1, "10", { version: "2025-01-01" });
    await expect(readIndicatorSeries(f.g, q, { role: "administrador" })).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
  });
  it("junção duplicada de TOP não vira compradores zero ou soma válida", async () => {
    const f = fixture();
    f.order(1);
    f.db.exec("INSERT INTO TGFTOP SELECT * FROM TGFTOP WHERE CODTIPOPER=1001");
    await expect(readIndicatorSeries(f.g, q, { role: "administrador" })).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
  });
  it("detecta alteração entre qualificação mensal e agrupamento diário", async () => {
    const f = fixture();
    f.order(1);
    const original = f.g.select.getMockImplementation()!;
    f.g.select.mockImplementation(async (sql, limit) => {
      if (sql.includes("AS DAY_VALUE")) f.order(2, "10", { date: "2026-10-26" });
      return original(sql, limit);
    });
    await expect(readIndicatorSeries(f.g, q, { role: "administrador" })).rejects.toMatchObject({
      code: "ERP_CONTEXT_REQUIRED",
    });
  });
  it("calendário bissexto e janelas pequenas não somam denominadores", async () => {
    const f = fixture();
    const a = await f.client.indicatorSeries({ ...q, month: "2024-02", limit: 10 }),
      b = await f.client.indicatorSeries({ ...q, month: "2024-02", offset: 10, limit: 50 });
    expect(a.total).toBe(29);
    expect(a.items[0]?.label).toBe("2024-02-01");
    expect(b.items.at(-1)?.label).toBe("2024-02-29");
    expect(new Set([...a.items, ...b.items].map((x) => x.id)).size).toBe(29);
    expect(a.summary.recordCount).toBe(3);
    expect(b.summary).toEqual(a.summary);
  });
  it("decoder rejeita soma aditiva, data fora do calendário e denominador alterado", async () => {
    const f = fixture();
    f.order(1);
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
      }) => (x.indicatorPolicy.countsAdditive = true),
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
      }) => (x.items[0]!.activeCount = 2),
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
      }) => (x.items[0]!.count = 2),
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
      }) => (x.summary.buyerCount = 2),
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
      }) => (x.total = 30),
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
        x.items[0]!.label = "2026-10-02";
        x.items[0]!.groupCode = 20261002;
        x.items[0]!.id = "sankhya:indicator:wallet-day:20261002";
      },
    ]) {
      const x = structuredClone(r);
      mutate(x as unknown as Parameters<typeof mutate>[0]);
      expect(() =>
        decodeIndicatorSeries(x, q, () => {
          throw Error("inválido");
        }),
      ).toThrow("inválido");
    }
  });
  it("consulta inválida e vendedor proibido falham antes da rede SQL", async () => {
    const f = fixture();
    for (const change of [
      { month: "2026-13" },
      { sellerCode: 0 },
      { limit: 51 },
      { sql: "SELECT" },
    ])
      await expect(
        f.client.indicatorSeries({
          ...q,
          ...change,
        } as unknown as import("./erp-indicator-series").ERPIndicatorQuery),
      ).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
    expect(f.transport).not.toHaveBeenCalled();
    await expect(readIndicatorSeries(f.g, q, { role: "vendedor" })).rejects.toMatchObject({
      code: "ERP_IDENTITY_REQUIRED",
    });
    expect(f.g.select).not.toHaveBeenCalled();
  });
});
