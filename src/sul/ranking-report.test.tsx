import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SulApp, { createAppState, businessDate } from "./SulApp";
import { rankingFixture } from "../test/ranking-fixture";
import { closeBilledFixtures } from "../test/billed-orders-fixture";
import { readRankingChart } from "./erp-ranking-chart";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<typeof import("@g4ai/ds")>()),
  notify: vi.fn(),
  BarChart: (p: { data: unknown }) => (
    <div data-testid="ranking-chart">{JSON.stringify(p.data)}</div>
  ),
}));
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
  closeBilledFixtures();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  location.hash = "";
});
function mount(page = "ranking", many = false, failed = false) {
  location.hash = "#/relatorios/" + page;
  const f = rankingFixture(many),
    persist = vi.fn();
  if (failed) f.transport.mockRejectedValue(Error("Falha sintética"));
  render(
    <SulApp
      initialState={createAppState({
        orders: [
          {
            id: "manual",
            seller: "MANUAL-NÃO-SOMAR",
            type: "Venda",
            status: "Concluído",
            total: 99999,
            date: businessDate(),
          },
        ],
        targetPeriods: { [businessDate().slice(0, 7)]: { Homônimo: 99999 } },
      })}
      online={f.client}
      persist={persist}
      onSignOut={vi.fn()}
    />,
  );
  return { ...f, persist };
}
describe("Ranking e meta por vendedor — estrutura existente, fonte por código", () => {
  it("usa pedidos padrão mensais e meta canônica sem procurar por nome no estado", async () => {
    const f = mount();
    const table = screen.getByRole("table", { name: "Ranking de vendedor / Meta" });
    await within(table).findByText("Homônimo");
    expect(within(table).getByText("R$ 50,00")).toBeInTheDocument();
    expect(within(table).getByText("R$ 100,00")).toBeInTheDocument();
    expect(within(table).getByText("50%")).toBeInTheDocument();
    expect(screen.queryByText("MANUAL-NÃO-SOMAR")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 99.999,00")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
    expect(
      f.transport.mock.calls.every(
        ([b]) => b.operation === "ranking-report" && b.query.month === businessDate().slice(0, 7),
      ),
    ).toBe(true);
  });
  it("posição da fonte não volta a zero em página remota ou busca", async () => {
    const f = mount("ranking", true);
    await screen.findByText("Vendedor ERP 1");
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), {
      target: { value: "Vendedor ERP 65" },
    });
    await screen.findByText("Vendedor ERP 65");
    const table = screen.getByRole("table", { name: "Ranking de vendedor / Meta" });
    expect(within(table).getByText("65")).toBeInTheDocument();
    expect(f.transport.mock.calls.some(([b]) => b.query.search === "Vendedor ERP 65")).toBe(true);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("meta por vendedor conserva tabela/gráfico e não confunde meta local por nome", async () => {
    const f = mount("meta-vendedor");
    const table = screen.getByRole("table", { name: "Meta por vendedor" });
    await within(table).findByText("Homônimo");
    expect(within(table).getByText("50%")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("ranking-chart")).toHaveTextContent('"Vendido":50'),
    );
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("gráfico e CSV completos65, além da página10, com fechamento coerente", async () => {
    const f = rankingFixture(true),
      query = { resource: "orders" as const, month: "2026-10", offset: 0, limit: 10 };
    const first = await f.client.rankingReport(query);
    const points = await readRankingChart(f.client, {
      summary: first.summary,
      source: { query, companyCodes: first.companyCodes },
    });
    expect(points).toHaveLength(65);
    expect(points[64]?.vendedor).toBe("Vendedor ERP 65");
    expect(points.every((x) => x.Vendido === 10 && x.target === null)).toBe(true);
  });
  it("exporta posição/código associado sem inventar metas0 ou misturar manuais", async () => {
    const create = vi.fn((_b: Blob) => "blob:ranking");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const f = mount("ranking", true);
    await screen.findByText("Vendedor ERP 1");
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const text = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(create.mock.calls[0]![0]);
    });
    expect(text.split("\r\n")).toHaveLength(66);
    expect(text).toContain("rank;name;total;count;clients;target;hit");
    expect(text).toContain('"65";"Vendedor ERP 65";"10";"1";"1";"null";"null"');
    expect(text).not.toContain("MANUAL");
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("falha não usa vendas ou metas do estado local", async () => {
    mount("ranking", false, true);
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("MANUAL-NÃO-SOMAR")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 99.999,00")).not.toBeInTheDocument();
  });
});
