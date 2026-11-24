import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SulApp, { createAppState, businessDate } from "./SulApp";
import { indicatorFixture } from "../test/indicator-series-fixture";
import { closeBilledFixtures } from "../test/billed-orders-fixture";
import { readRanking } from "../../supabase/functions/sankhya-online/ranking";
import { readNonBuyers } from "../../supabase/functions/sankhya-online/nonbuyers";
import { readSalesReport } from "../../supabase/functions/sankhya-online/history";
import { readIndicatorSeries } from "../../supabase/functions/sankhya-online/indicator-series";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<typeof import("@g4ai/ds")>()),
  notify: vi.fn(),
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
function mount(fail = false) {
  location.hash = "#/indicadores";
  const f = indicatorFixture();
  f.order(1, "100.01");
  f.item(1, "9");
  f.order(2, "200.02", { seller: 12, customer: 2 });
  f.item(2, "19");
  f.transport.mockImplementation(async ({ operation, query: rawQuery }) => {
    const query = rawQuery as import("../test/erp-fixture-types").FixtureQuery;
    if (fail) return { data: null, error: { code: "ERP_UNAVAILABLE" } };
    try {
      const data =
        operation === "ranking-report"
          ? await readRanking(
              f.g,
              query,
              { role: "administrador" },
              async (month, companyCodes) => ({
                month,
                companyCodes,
                source: "local-canonical-targets",
                identity: "private-Auth-UUID-to-CODVEND",
                readOnly: true,
                targets: [],
              }),
            )
          : operation === "sales-report"
            ? await readSalesReport(
                f.g,
                query as unknown as Parameters<typeof readSalesReport>[1],
                { role: "administrador" },
              )
            : operation === "nonbuyers-report"
              ? await readNonBuyers(f.g, query, { role: "administrador" })
              : await readIndicatorSeries(
                  f.g,
                  query as unknown as Parameters<typeof readIndicatorSeries>[1],
                  { role: "administrador" },
                );
      return { data, error: null };
    } catch (e: unknown) {
      return {
        data: null,
        error: { code: e instanceof Error && "code" in e ? e.code : "ERP_UNAVAILABLE" },
      };
    }
  });
  const persist = vi.fn(),
    month = businessDate().slice(0, 7);
  render(
    <SulApp
      initialState={createAppState({
        orders: [
          {
            id: "manual",
            date: businessDate(),
            type: "Venda",
            status: "Concluído",
            seller: "VENDEDOR-LOCAL-FALSO",
            total: 99999,
          },
        ],
        targetPeriods: { [month]: { Homônimo: 99999 } },
        extraIndicators: [],
      })}
      online={f.client}
      persist={persist}
      onSignOut={vi.fn()}
    />,
  );
  return { ...f, persist };
}
describe("Painel mensal sem zeros ou totais financeiros locais", () => {
  it("usa cabeçalhos nativos e carteira atual, não soma de itens, metas por nome ou data de cadastro", async () => {
    const f = mount();
    await screen.findByText("R$ 300,03");
    await screen.findByText("1 de 1");
    await waitFor(() =>
      expect(
        f.transport.mock.calls.some(
          ([b]) => b.operation === "indicator-series" && b.query.series === "customers-seller-year",
        ),
      ).toBe(true),
    );
    expect(screen.queryByText("R$ 99.999,00")).not.toBeInTheDocument();
    expect(screen.queryByText(/Defina Comiss/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nenhum cliente cadastrado/)).not.toBeInTheDocument();
    expect(screen.queryByText("Todos os clientes compraram neste mês")).not.toBeInTheDocument();
    expect(screen.getByText(/Metas canônicas por vendedor/)).toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
    expect(
      f.transport.mock.calls
        .filter(([b]) => b.operation === "indicator-series")
        .every(([b]) =>
          ["wallet-seller", "commissions-seller", "customers-seller-year"].includes(b.query.series),
        ),
    ).toBe(true);
  });
  it("erro mantém desconhecido e não recorre aos valores locais nem ativa indicadores", async () => {
    const f = mount(true);
    await screen.findAllByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 99.999,00")).not.toBeInTheDocument();
    expect(screen.queryByText("VENDEDOR-LOCAL-FALSO")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
  });
});
