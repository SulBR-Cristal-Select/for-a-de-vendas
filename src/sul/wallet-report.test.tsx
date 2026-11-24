import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SulApp, { businessDate, createAppState } from "./SulApp";
import { createERPClient, type ERPRow } from "../lib/erp-online";
import type { ERPWalletQuery } from "../lib/erp-wallet";
import { STANDARD_SALES_REPORT_POLICY } from "../../supabase/functions/sankhya-online/policy";
import { exportERPRows } from "./erp-hooks";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  notify: vi.fn(),
}));
const month = businessDate().slice(0, 7),
  q: ERPWalletQuery = { resource: "customers", view: "sellers", month, offset: 0, limit: 10 };
const seller = (code: number): ERPRow => ({
  id: `sankhya:wallet:seller:${code}`,
  code: String(code),
  name: "Vendedor " + code,
  sellerCode: code,
  walletCount: 10,
  buyerCount: 3,
  nonBuyerCount: 7,
  source: "observado",
  readOnly: true,
});
function data(rows: ERPRow[], query: ERPWalletQuery) {
  const y = Number(query.month.slice(0, 4)),
    m = Number(query.month.slice(5)),
    until =
      m === 12
        ? `${String(y + 1).padStart(4, "0")}-01-01`
        : `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-01`;
  let selected = rows.filter((r) => !query.search || String(r["name"]).includes(query.search));
  if (query.sort === "code")
    selected = selected.sort(
      (a, b) => (Number(a["code"]) - Number(b["code"])) * (query.direction === "desc" ? -1 : 1),
    );
  return {
    source: "sankhya",
    readOnly: true,
    readAt: "2026-10-26T14:33:00.000Z",
    items: selected.slice(query.offset, query.offset + query.limit),
    offset: query.offset,
    total: selected.length,
    totalWithoutSearch: rows.length,
    view: query.view,
    companyCodes: [1, 4],
    salesPolicy: STANDARD_SALES_REPORT_POLICY,
    summary: {
      month: query.month,
      from: query.month + "-01",
      until,
      walletCount: rows.reduce((n, r) => n + Number(r["walletCount"]), 0),
      buyerCount: rows.reduce((n, r) => n + Number(r["buyerCount"]), 0),
      nonBuyerCount: rows.reduce((n, r) => n + Number(r["nonBuyerCount"]), 0),
      currentWallet: true,
      activeField: "TGFPAR.ATIVO",
      activeValue: "S",
      sellerAttribution: "current-CODVEND",
      historyCompanyCodes: [1, 4],
      beforeSearch: true,
      atomicSnapshot: false,
    },
  };
}
function setup(rows: ERPRow[]) {
  location.hash = "#/relatorios/carteira-vendedor";
  const transport = vi.fn(
      async ({ operation, query }: import("../test/erp-fixture-types").FixtureRequest) => ({
        error: null,
        data:
          operation === "wallet-report"
            ? data(rows, query as unknown as ERPWalletQuery)
            : {
                source: "sankhya",
                readOnly: true,
                readAt: "2026-10-26T14:33:00.000Z",
                items: [],
                offset: query.offset,
                total: 0,
                totalWithoutSearch: 0,
              },
      }),
    ),
    client = createERPClient(transport as unknown as import("../lib/erp-online").ERPTransport),
    persist = vi.fn(async (next) => next),
    state = createAppState();
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
describe("Carteira por vendedor: tabela autorizada, SDK e exportação", () => {
  it("mostra cinco colunas autorizadas e totais integrais sem persistir carteira", async () => {
    const { transport, persist, state } = setup(
      Array.from({ length: 65 }, (_, n) => seller(n + 1)),
    );
    await screen.findByText("Vendedor 1");
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
    expect(screen.queryByText("Vendedor 11")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Carteira ativa: 650; compradores: 195; sem compra: 455; positivação: 30%/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ver plano observado")).not.toBeInTheDocument();
    expect(
      transport.mock.calls.every(
        ([b]) =>
          b.operation === "wallet-report" && b.query.view === "sellers" && b.query.limit <= 50,
      ),
    ).toBe(true);
    expect(state["customers"]).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
  });
  it("pagina e busca no servidor sem manter resumo obsoleto", async () => {
    const { transport } = setup(Array.from({ length: 65 }, (_, n) => seller(n + 1)));
    await screen.findByText("Vendedor 1");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await screen.findByText("Vendedor 11");
    expect(transport.mock.calls.at(-1)?.[0].query.offset).toBe(10);
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "Vendedor 65" } });
    await screen.findByText("Vendedor 65");
    expect(screen.queryByText("Vendedor 11")).not.toBeInTheDocument();
  });
  it("falha de fonte remove linhas e denominador anteriores", async () => {
    const { transport } = setup(Array.from({ length: 25 }, (_, n) => seller(n + 12)));
    await screen.findByText("Vendedor 12");
    transport.mockRejectedValue(new Error("Falha sintética"));
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "erro" } });
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("Vendedor 12")).not.toBeInTheDocument();
    expect(screen.queryByText(/Carteira ativa: 250;/)).not.toBeInTheDocument();
  });
  it("CSV integral usa janelas50/15 e conferência final, sem cadastros manuais", async () => {
    const rows = Array.from({ length: 65 }, (_, n) => seller(n + 1)),
      transport = vi.fn(async ({ query }: import("../test/erp-fixture-types").FixtureRequest) => ({
        error: null,
        data: data(rows, query as unknown as ERPWalletQuery),
      })),
      client = createERPClient(transport as unknown as import("../lib/erp-online").ERPTransport);
    const result = await exportERPRows(
      { client, resource: "customers", walletReport: { view: "sellers", month } },
      q,
      [{ id: "manual" }],
      () => {},
    );
    expect(result).toHaveLength(65);
    expect(transport.mock.calls.map(([b]) => [b.query.offset, b.query.limit])).toEqual([
      [0, 50],
      [50, 50],
      [0, 1],
    ]);
  });
  it("CSV recusa mudança de contagem entre páginas", async () => {
    let calls = 0;
    const rows = Array.from({ length: 65 }, (_, n) => seller(n + 1)),
      client = createERPClient(async ({ query: rawQuery }) => {
        const query = rawQuery as ERPWalletQuery;
        const d = data(rows, query as unknown as ERPWalletQuery);
        if (++calls > 1) d.summary.walletCount++;
        return { error: null, data: d };
      });
    await expect(
      exportERPRows(
        { client, resource: "customers", walletReport: { view: "sellers", month } },
        q,
        [],
        () => {},
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it.each([
    { view: "all" },
    { month: "2026-13" },
    { sellerCode: 0 },
    { customerId: "manual" },
    { sql: "SELECT 1" },
    { resource: "orders" },
    { sort: "total" },
    { limit: 51 },
  ])("entrada inválida não chega ao transporte: %j", async (patch) => {
    const t = vi.fn(),
      c = createERPClient(t);
    await expect(c.walletReport({ ...q, ...patch } as ERPWalletQuery)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(t).not.toHaveBeenCalled();
  });
  it.each([
    "walletCount",
    "buyerCount",
    "nonBuyerCount",
    "beforeSearch",
    "activeValue",
    "historyCompanyCodes",
  ])("metadado divergente não vira sucesso: %s", async (field) => {
    const d = data([seller(12)], q);
    (d.summary as Record<string, unknown>)[field] = null;
    const c = createERPClient(async () => ({ data: d, error: null }));
    await expect(c.walletReport(q)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("não aceita nome/código/recibo de outra visão", async () => {
    const d = data([seller(12)], q);
    d.items[0]!["id"] = "sankhya:customer:12";
    const c = createERPClient(async () => ({ data: d, error: null }));
    await expect(c.walletReport(q)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("troca de identidade cancela resposta em voo, não autentica outro usuário", async () => {
    let done!: (v: Awaited<ReturnType<import("../lib/erp-online").ERPTransport>>) => void;
    const c = createERPClient(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    c.setIdentity("primeiro");
    const pending = c.walletReport(q);
    c.setIdentity("segundo");
    done({ data: data([], q), error: null });
    await expect(pending).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  });
});
