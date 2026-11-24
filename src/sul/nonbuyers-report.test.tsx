import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createERPClient, type ERPRow, type ERPNonBuyersQuery } from "../lib/erp-online";
import { compareERP, foldERPText, type ERPSortKey } from "../lib/erp-order";
import { STANDARD_SALES_REPORT_POLICY } from "../../supabase/functions/sankhya-online/policy";
import { nonBuyersQuery } from "./nonbuyers-report";
import { exportERPRows } from "./erp-hooks";
import SulApp, { businessDate, createAppState } from "./SulApp";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  notify: vi.fn(),
}));
const month = businessDate().slice(0, 7),
  observation = { source: "sankhya", readOnly: true, readAt: "2026-10-26T06:23:00.000Z" };
const customer = (n: number): ERPRow => ({
  id: `sankhya:customer:${n}`,
  code: String(n),
  name: `Cliente ${String(n).padStart(3, "0")}`,
  seller: "Mesmo nome",
  sellerCode: n % 2 ? 12 : 34,
  localStatus: "Sem compra no mês " + month,
  source: "observado",
  readOnly: true,
});
function windowData(rows: ERPRow[], q: ERPNonBuyersQuery) {
  const from = q.month + "-01",
    y = Number(q.month.slice(0, 4)),
    m = Number(q.month.slice(5)),
    until = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  let selected = rows.filter(
    (r) =>
      (!q.customerId || r["id"] === q.customerId) &&
      (q.sellerCode === undefined || r["sellerCode"] === q.sellerCode),
  );
  const unfiltered = selected.length;
  const search = q.search;
  if (search)
    selected = selected.filter((r) =>
      foldERPText([r["name"], r["code"], r["seller"], r["localStatus"]].join(" ")).includes(
        foldERPText(search),
      ),
    );
  selected.sort(compareERP((q.sort || "name") as ERPSortKey, q.direction));
  return {
    ...observation,
    items: selected.slice(q.offset, q.offset + q.limit),
    offset: q.offset,
    total: selected.length,
    totalWithoutSearch: unfiltered,
    companyCodes: [1, 4],
    salesPolicy: STANDARD_SALES_REPORT_POLICY,
    summary: {
      month: q.month,
      from,
      until,
      customerCount: unfiltered,
      walletCount: 100,
      currentWallet: true,
      activeField: "TGFPAR.ATIVO",
      activeValue: "S",
      sellerAttribution: "current-CODVEND",
      historyCompanyCodes: [1, 4],
      atomicSnapshot: false,
    },
  };
}
function fakeERP(rows: ERPRow[]) {
  const transport = vi.fn(
    async ({ operation, query: q }: import("../test/erp-fixture-types").FixtureRequest) => {
      if (operation === "nonbuyers-report")
        return {
          error: null,
          data: windowData(rows, q as unknown as Parameters<typeof windowData>[1]),
        };
      const items =
        q.resource === "sellers"
          ? [
              { id: "sankhya:seller:12", code: 12, name: "Mesmo nome" },
              { id: "sankhya:seller:34", code: 34, name: "Mesmo nome" },
            ]
          : rows;
      if (operation === "record")
        return {
          error: null,
          data: { ...observation, record: items.find((r) => r["id"] === q.id) ?? null },
        };
      return {
        error: null,
        data: {
          ...observation,
          items: items.slice(q.offset, q.offset + q.limit),
          offset: q.offset,
          total: items.length,
          totalWithoutSearch: items.length,
        },
      };
    },
  );
  return {
    transport,
    client: createERPClient(transport as unknown as import("../lib/erp-online").ERPTransport),
  };
}
function mount(rows: ERPRow[], local: ERPRow[] = []) {
  location.hash = "#/relatorios/nao-compraram";
  const { client, transport } = fakeERP(rows),
    persist = vi.fn(async (next) => next),
    state = createAppState({ customers: local });
  return {
    ...render(
      <SulApp initialState={state} online={client} persist={persist} onSignOut={async () => {}} />,
    ),
    client,
    transport,
    persist,
    state,
  };
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  location.hash = "";
});
describe("clientes sem compra: tela e CSV, sem controle novo", () => {
  it("usa o mês existente, mantém quatro colunas e não replica clientes/pedidos", async () => {
    const { transport, persist, state } = mount(
      Array.from({ length: 65 }, (_, n) => customer(n + 1)),
    );
    await screen.findByText("Cliente 001");
    expect(screen.queryByText("Cliente 011")).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    expect(screen.getByText(/Total: 65 cliente/)).toBeInTheDocument();
    expect(
      transport.mock.calls.every(
        ([b]) =>
          b.operation === "nonbuyers-report" && b.query.month === month && b.query.limit <= 50,
      ),
    ).toBe(true);
    expect(state["customers"]).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
  });
  it("não mescla cadastro manual por nome e não o considera sem compra ERP", async () => {
    mount([customer(1)], [{ id: "manual", name: "Manual", code: "M" }]);
    await screen.findByText("Cliente 001");
    expect(screen.queryByText("Manual")).not.toBeInTheDocument();
  });
  it("pagina no servidor, sem repetir página1", async () => {
    const { transport } = mount(Array.from({ length: 65 }, (_, n) => customer(n + 1)));
    await screen.findByText("Cliente 001");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await screen.findByText("Cliente 011");
    expect(screen.queryByText("Cliente 001")).not.toBeInTheDocument();
    expect(transport.mock.calls.at(-1)?.[0].query.offset).toBe(10);
  });
  it("busca e ordena o universo, não a página", async () => {
    const { transport } = mount(Array.from({ length: 65 }, (_, n) => customer(n + 1)));
    await screen.findByText("Cliente 001");
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "065" } });
    await screen.findByText("Cliente 065");
    expect(screen.queryByText("Cliente 001")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Código/ }));
    await waitFor(() => expect(transport.mock.calls.at(-1)?.[0].query.sort).toBe("code"));
  });
  it("filtra cliente pelo seletor existente e código, sem produtos/cotação", async () => {
    const { transport } = mount(Array.from({ length: 25 }, (_, n) => customer(n + 1)));
    await screen.findByText("Cliente 001");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Cliente" }));
    fireEvent.click(await screen.findByRole("option", { name: "Cliente 013 (13)" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() =>
      expect(
        transport.mock.calls.some(
          ([b]) =>
            b.operation === "nonbuyers-report" && b.query.customerId === "sankhya:customer:13",
        ),
      ).toBe(true),
    );
    await screen.findByText("Cliente 013");
    expect(screen.queryByText("Cliente 001")).not.toBeInTheDocument();
    expect(transport.mock.calls.every(([b]) => b.query.resource !== "products")).toBe(true);
  });
  it("exporta65 em50/15/fechamento1 nas quatro colunas existentes", async () => {
    const { transport, persist } = mount(Array.from({ length: 65 }, (_, n) => customer(n + 1)));
    const create = vi.fn((_blob: Blob | MediaSource) => "blob:naocompra"),
      Original = URL;
    vi.stubGlobal(
      "URL",
      class extends Original {
        static override createObjectURL = create;
        static override revokeObjectURL = vi.fn();
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await screen.findByText("Cliente 001");
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const blob = create.mock.calls[0]![0] as Blob,
      text = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.readAsText(blob);
      });
    expect(text.split("\r\n")).toHaveLength(66);
    expect(text).toContain("name;code;seller;localStatus");
    expect(text).toContain("Cliente 065");
    expect(transport.mock.calls.slice(-3).map(([b]) => [b.query.offset, b.query.limit])).toEqual([
      [0, 50],
      [50, 50],
      [0, 1],
    ]);
    expect(persist).not.toHaveBeenCalled();
  });
  it("erro após busca remove linhas e total antigos; não usa dados locais como fallback", async () => {
    const { transport } = mount(Array.from({ length: 25 }, (_, n) => customer(n + 1)));
    await screen.findByText("Cliente 001");
    transport.mockRejectedValue(new Error("Falha de teste"));
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "outro" } });
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("Cliente 001")).not.toBeInTheDocument();
    expect(screen.queryByText(/Total: 25 cliente/)).not.toBeInTheDocument();
  });
});
describe("contrato do mês, escopo e consistência do SDK", () => {
  it("passa códigos e mês, não nome/e-mail nem dia presumido", () => {
    expect(
      nonBuyersQuery(
        {
          customer: "sankhya:customer:141",
          seller: "sankhya:seller:12",
          status: "confirmado",
          from: "2026-09-05",
          to: "2026-09-28",
        },
        month,
      ),
    ).toEqual({
      resource: "customers",
      month: "2026-09",
      customerId: "sankhya:customer:141",
      sellerCode: 12,
      status: "confirmado",
    });
  });
  it.each([
    { from: "2026-02-30" },
    { from: "2026-09-10", to: "2026-10-02" },
    { from: "2026-09-28", to: "2026-09-01" },
  ])("não ignora data inválida ou intervalo incompatível: %j", (f) =>
    expect(nonBuyersQuery(f, month).month).toBe("invalid"),
  );
  it.each([
    { month: "2026-13" },
    { month: "0000-01" },
    { resource: "orders" },
    { sellerCode: NaN },
    { customerId: "manual" },
    { status: "Pendente" },
    { limit: 51 },
    { sql: "SELECT 1" },
  ])("recusa antes do transporte: %j", async (patch) => {
    const t = vi.fn(),
      c = createERPClient(t);
    await expect(
      c.nonBuyersReport({ ...queryDefault(), ...patch } as ERPNonBuyersQuery),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(t).not.toHaveBeenCalled();
  });
  it.each([
    "month",
    "customerCount",
    "activeValue",
    "currentWallet",
    "historyCompanyCodes",
    "atomicSnapshot",
  ])("recusa metadado incompatível: %s", async (key) => {
    const q = queryDefault(),
      d = windowData([customer(1)], q);
    (d.summary as Record<string, unknown>)[key] = null;
    const c = createERPClient(async () => ({ error: null, data: d }));
    await expect(c.nonBuyersReport(q)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("não confunde zero observado com fonte indisponível", async () => {
    const c = createERPClient(async () => ({ error: null, data: windowData([], queryDefault()) }));
    expect(await c.nonBuyersReport(queryDefault())).toMatchObject({
      total: 0,
      items: [],
      summary: { customerCount: 0 },
    });
  });
  it("exportação recusa mudança de resumo/escopo entre janelas e nunca funde manuais", async () => {
    const rows = Array.from({ length: 65 }, (_, n) => customer(n + 1));
    let calls = 0;
    const c = createERPClient(async ({ query: q }) => {
      const d = windowData(rows, q as ERPNonBuyersQuery);
      if (++calls > 1) d.summary.walletCount = 99;
      return { error: null, data: d };
    });
    await expect(
      exportERPRows(
        { client: c, resource: "customers", nonBuyersReport: { month } },
        queryDefault(),
        [{ id: "manual" }],
        () => {},
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    const ok = fakeERP([customer(1)]).client;
    expect(
      await exportERPRows(
        { client: ok, resource: "customers", nonBuyersReport: { month } },
        queryDefault(),
        [{ id: "manual" }],
        () => {},
      ),
    ).toHaveLength(1);
  });
});
function queryDefault(): ERPNonBuyersQuery {
  return { resource: "customers", month, offset: 0, limit: 10 };
}
