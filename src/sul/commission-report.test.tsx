import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SulApp, { createAppState } from "./SulApp";
import { createERPClient, type ERPRow } from "../lib/erp-online";
import { COMMISSION_POLICY } from "../lib/erp-commission";
import { sumERPDecimals } from "../lib/erp-decimal";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<typeof import("@g4ai/ds")>()),
  notify: vi.fn(),
}));
function mockERP() {
  const base = { source: "observado", readOnly: true, missingAmountCount: 0 };
  const orders: ERPRow[] = [
    {
      ...base,
      id: "sankhya:commission:order:101",
      documentCode: 101,
      assigned: true,
      companyCode: 1,
      number: "101",
      customerId: "sankhya:customer:1",
      customerName: "Cliente documental",
      date: "2026-10-20",
      total: "100",
      commission: "0.125",
      entryCount: 1,
    },
    {
      ...base,
      id: "sankhya:commission:unassigned-origin:301",
      documentCode: 301,
      assigned: false,
      companyCode: 1,
      number: "Não atribuído (origem 301)",
      customerId: "sankhya:customer:1",
      customerName: "Cliente documental",
      date: "2026-10-20",
      total: null,
      commission: "0.375",
      entryCount: 1,
    },
    {
      ...base,
      id: "sankhya:commission:unassigned-origin:401",
      documentCode: 401,
      assigned: false,
      companyCode: 1,
      number: "Não atribuído (origem 401)",
      customerId: "sankhya:customer:1",
      customerName: "Cliente documental",
      date: "2026-10-20",
      total: null,
      commission: "-0.25",
      entryCount: 1,
    },
  ];
  const sellers: ERPRow[] = [
    {
      ...base,
      id: "sankhya:commission:seller:12",
      sellerCode: 12,
      name: "Homônimo",
      commission: "0.125",
      value: "0.125",
      entryCount: 1,
    },
    {
      ...base,
      id: "sankhya:commission:seller:34",
      sellerCode: 34,
      name: "Homônimo",
      commission: "0.125",
      value: "0.125",
      entryCount: 2,
    },
  ];
  const transport = vi.fn(
    async ({ operation, query }: import("../test/erp-fixture-types").FixtureRequest) => {
      if (operation !== "commission-report") throw Error("Operação não prevista");
      const all = query.view === "sellers" ? sellers : orders,
        rows = all.filter(
          (r) =>
            !query.search ||
            Object.values(r).some((v) => typeof v === "string" && v.includes(query.search)),
        );
      return {
        error: null,
        data: {
          source: "sankhya",
          readOnly: true,
          readAt: "2026-10-26T16:51:00.000Z",
          view: query.view,
          commissionPolicy: COMMISSION_POLICY,
          companyCodes: [1, 4],
          items: rows.slice(query.offset, query.offset + query.limit),
          offset: query.offset,
          total: rows.length,
          totalWithoutSearch: all.length,
          summary: {
            entryCount: rows.reduce((n, r) => n + Number(r["entryCount"]), 0),
            missingAmountCount: 0,
            amount: rows.length ? sumERPDecimals(rows.map((r) => String(r["commission"]))) : null,
            unassignedEntryCount:
              query.view === "sellers" ? 2 : rows.filter((r) => !r["assigned"]).length,
            unassignedAmount: "0.125",
          },
        },
      };
    },
  );
  return {
    client: createERPClient(transport as unknown as import("../lib/erp-online").ERPTransport),
    transport,
  };
}
function mount(route = "comissoes") {
  location.hash = "#/relatorios/" + route;
  const f = mockERP(),
    state = createAppState({
      orders: [
        {
          id: "manual",
          number: "MANUAL-NÃO-SOMAR",
          type: "Venda",
          status: "Concluído",
          total: 99999,
        },
      ],
    }),
    persist = vi.fn();
  render(<SulApp initialState={state} persist={persist} online={f.client} onSignOut={vi.fn()} />);
  return { ...f, state, persist };
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
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
describe("Duas vistas existentes de comissão — sem novas ações de tela", () => {
  it("carrega valores nativos e homônimos, sem dados manuais ou persistência", async () => {
    const f = mount();
    await waitFor(() => expect(screen.getAllByText("Homônimo")).toHaveLength(2));
    expect(screen.getAllByText("R$ 0,13")).toHaveLength(2);
    expect(screen.getByText(/Lançamentos no recorte: 3/)).toBeInTheDocument();
    expect(
      f.transport.mock.calls.every(
        ([b]) => b.operation === "commission-report" && b.query.view === "sellers",
      ),
    ).toBe(true);
    expect(f.state["orders"]).toHaveLength(1);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("pedido atribuído e origens não atribuídas permanecem distintos; ajuste nativo mantém sinal", async () => {
    const f = mount("comissoes-pedido");
    await screen.findByText("Não atribuído (origem 301)");
    expect(screen.getByText("Não atribuído (origem 401)")).toBeInTheDocument();
    expect(screen.getByText("-R$ 0,25")).toBeInTheDocument();
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
    expect(screen.getByText(/sem rateio ou total de pedido presumido/)).toBeInTheDocument();
    expect(screen.queryByText("MANUAL-NÃO-SOMAR")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("CSV original conserva os cinco campos, negativos e valores sem arredondar", async () => {
    const create = vi.fn((_b: Blob) => "blob:commission");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const f = mount("comissoes-pedido");
    await screen.findByText("Não atribuído (origem 301)");
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(create.mock.calls[0]![0]);
    });
    expect(csv).toContain("date;number;customer;total;commission");
    expect(csv).toContain('"0.375"');
    expect(csv).toContain('"-0.25"');
    expect(csv).toContain("Não atribuído (origem 301)");
    expect(csv).not.toContain("99999");
    expect(csv.split("\r\n")).toHaveLength(4);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("falha não mostra comissão zero nem retorna aos pedidos locais", async () => {
    const f = mockERP();
    f.transport.mockRejectedValue(Error("Falha sintética"));
    location.hash = "#/relatorios/comissoes";
    render(
      <SulApp
        initialState={createAppState()}
        online={f.client}
        persist={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
  });
});
