import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createERPClient, type ERPRow } from "../lib/erp-online";
import { sumERPDecimals } from "../lib/erp-decimal";
import { foldERPText } from "../lib/erp-order";
import { STANDARD_BILLING_REPORT_POLICY } from "../../supabase/functions/sankhya-online/policy";
import { salesReportQuery } from "./erp-sales-report";
import { exportERPRows } from "./erp-hooks";
import SulApp, { createAppState } from "./SulApp";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  notify: vi.fn(),
}));
const observation = { source: "sankhya", readOnly: true, readAt: "2026-10-25T13:28:00.000Z" };
function order(id: number): ERPRow {
  return {
    id: `sankhya:invoice:${id}`,
    source: "observado",
    readOnly: true,
    number: String(id + 500),
    nf: String(id + 500),
    invoiced: "0.1",
    date: "2026-10-25",
    customerId: `sankhya:customer:${(id % 2) + 1}`,
    customerName: `Cliente documental ${(id % 2) + 1}`,
    sellerCode: id % 2 ? 34 : 12,
    sellerName: "Homônimo",
    total: "0.1",
    status: "confirmado",
    operationName: "Venda normal",
    erp: {
      source: "sankhya",
      companyCode: 1,
      documentCode: id,
      movement: "V",
      operationCode: 1101,
      statusCode: "L",
      fiscalStatusCode: "A",
      dateField: "DTFATUR",
    },
  };
}
function fakeERP(rows = Array.from({ length: 65 }, (_, i) => order(i + 1))) {
  const customers = [1, 2].map((n) => ({
    id: `sankhya:customer:${n}`,
    code: String(n),
    name: `Cliente documental ${n}`,
    active: true,
  }));
  const sellers = [34, 12].map((n) => ({ id: `sankhya:seller:${n}`, code: n, name: "Homônimo" }));
  const transport = vi.fn(
    async ({ operation, query }: import("../test/erp-fixture-types").FixtureRequest) => {
      if (operation === "record") {
        const r = query.resource === "sellers" ? sellers : customers;
        return {
          error: null,
          data: {
            ...observation,
            record: r.find((x) => x.id === query.id || x.code === query.id) || null,
          },
        };
      }
      if (operation === "window") {
        const r = [...(query.resource === "sellers" ? sellers : customers)].sort(
          (a, b) => Number(a.code) - Number(b.code),
        );
        return {
          error: null,
          data: {
            ...observation,
            items: r.slice(query.offset, query.offset + query.limit),
            offset: query.offset,
            total: r.length,
            totalWithoutSearch: r.length,
          },
        };
      }
      if (operation !== "billing-report") throw Error("Operação não esperada no relatório");
      let filtered = rows.filter(
        (r) =>
          (!query.customerId || r["customerId"] === query.customerId) &&
          (!query.sellerCode || r["sellerCode"] === query.sellerCode) &&
          (!query.from || String(r["date"]) >= query.from) &&
          (!query.to || String(r["date"]) <= query.to),
      );
      const group = (source: ERPRow[]): ERPRow[] => {
        if (!query.groupBy) return source;
        const groups = new Map<unknown, ERPRow[]>();
        for (const r of source) {
          const code =
            query.groupBy === "seller"
              ? r["sellerCode"]
              : Number(String(r["customerId"]).split(":").at(-1));
          groups.set(code, [...(groups.get(code) || []), r]);
        }
        return [...groups].map(([code, records]) => ({
          id: `sankhya:billing:${query.groupBy}:${code}`,
          groupBy: query.groupBy,
          groupCode: code,
          name: query.groupBy === "seller" ? "Homônimo" : `Cliente documental ${code}`,
          count: records.length,
          total: sumERPDecimals(records.map((r) => String(r["total"]))),
        }));
      };
      const totalWithoutSearch = group(filtered).length;
      if (query.search)
        filtered = filtered.filter((r) =>
          foldERPText([r["number"], r["customerName"], r["sellerName"]].join(" ")).includes(
            foldERPText(query.search),
          ),
        );
      const missing = filtered.filter((r) => r["total"] === null).length;
      const summary = {
        documentCount: filtered.length,
        documentAmount: missing ? null : sumERPDecimals(filtered.map((r) => String(r["total"]))),
        missingAmountCount: missing,
        amountField: "TGFCAB.VLRNOTA",
        headerCountedOnce: true,
        atomicSnapshot: false,
      };
      let selected = group(filtered);
      if (query.sort) {
        const key =
          query.sort === "customer"
            ? "customerName"
            : query.sort === "seller"
              ? "sellerName"
              : query.sort;
        selected = [...selected].sort(
          (a, b) =>
            String(a[key]).localeCompare(String(b[key]), "pt-BR", { numeric: true }) *
            (query.direction === "desc" ? -1 : 1),
        );
      }
      return {
        error: null,
        data: {
          ...observation,
          items: selected.slice(query.offset, query.offset + query.limit),
          total: selected.length,
          totalWithoutSearch,
          offset: query.offset,
          summary,
          billingPolicy: STANDARD_BILLING_REPORT_POLICY,
          linkMode: "direct-item-reference",
          quantitiesAllocated: false,
          ordersAdded: false,
          undatedTreatment: "excluded-without-date-fallback",
          companyCodes: [1],
          groupBy: query.groupBy ?? null,
        },
      };
    },
  );
  return {
    client: createERPClient(transport as unknown as import("../lib/erp-online").ERPTransport),
    transport,
    rows,
  };
}
function mount(rows?: ERPRow[]) {
  location.hash = "#/relatorios/faturamento";
  const f = fakeERP(rows);
  const state = createAppState({
    orders: [
      {
        id: "manual",
        number: "MANUAL-NÃO-SOMAR",
        total: 999999,
        type: "Venda",
        status: "Concluído",
        seller: "Homônimo",
      },
    ],
  });
  const persist = vi.fn();
  const view = render(
    <SulApp initialState={state} online={f.client} persist={persist} onSignOut={vi.fn()} />,
  );
  return { ...view, ...f, persist, state };
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
async function selectGroup(label: string) {
  fireEvent.click(screen.getByRole("combobox", { name: "Agrupar por" }));
  const option = await screen.findByRole("option", { name: label });
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}
describe("Faturamento na estrutura existente, com textos autorizados", () => {
  it("usa notasV e KPIs integrais, sem chamar notas de pedidos ou usar locais", async () => {
    const f = mount();
    await screen.findByText("R$ 6,50");
    expect(screen.getByText("Notas no recorte filtrado")).toBeInTheDocument();
    expect(screen.getByText("Ticket médio em notas")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Documento ERP/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Faturamento/ })).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("501")).toBeInTheDocument();
    expect(screen.queryByText("#MANUAL-NÃO-SOMAR")).not.toBeInTheDocument();
    expect(screen.queryByText(/integração fiscal não está configurada/)).not.toBeInTheDocument();
    expect(
      f.transport.mock.calls.every(
        ([b]) =>
          b.operation === "billing-report" &&
          b.query.resource === "invoices" &&
          b.query.limit <= 50,
      ),
    ).toBe(true);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("agrupamentos continuam por código; cabeçalho Notas e KPI não conta grupos", async () => {
    const f = mount();
    await screen.findByText("R$ 6,50");
    await selectGroup("Vendedor");
    await waitFor(() => expect(f.transport.mock.calls.at(-1)?.[0].query.groupBy).toBe("seller"));
    await waitFor(() => expect(screen.getAllByText("Homônimo")).toHaveLength(2));
    expect(screen.getByRole("columnheader", { name: /Notas/ })).toBeInTheDocument();
    expect(screen.getByText("R$ 6,50")).toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("filtro de cliente usa o código técnico no controle real", async () => {
    const f = mount();
    await screen.findByText("R$ 6,50");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Cliente" }));
    fireEvent.click(await screen.findByRole("option", { name: "Cliente documental 1 (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await screen.findByText("R$ 3,20");
    expect(f.transport.mock.calls.at(-1)?.[0].query.customerId).toBe("sankhya:customer:1");
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("exporta todas as65 notas em nove colunas, preservando ID ERP e número fiscal separados", async () => {
    const create = vi.fn((_blob: Blob) => "blob:fiscal");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const f = mount();
    await screen.findByText("R$ 6,50");
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const text = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(create.mock.calls[0]![0]);
    });
    expect(text.split("\r\n")).toHaveLength(66);
    expect(text).toContain("number;date;customer;seller;delivery;total;cargoStatus;invoiced;nf");
    expect(text).toContain('"65";"2026-10-25"');
    expect(text).toContain('"565"');
    expect(text).not.toContain("MANUAL-NÃO-SOMAR");
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("falha de qualificação não usa pedidos locais, notas genéricas, zero ou valor antigo", async () => {
    const f = mount();
    await screen.findByText("R$ 6,50");
    f.transport.mockRejectedValue(new Error("Incerteza sintética"));
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "outro" } });
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("R$ 6,50")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("SDK recusa política ou identificação de pedido no faturamento", async () => {
    const f = fakeERP([order(1)]);
    const q = { resource: "invoices" as const, offset: 0, limit: 10 };
    const original = await f.client.billingReport(q);
    for (const bad of [
      { billingPolicy: { ...STANDARD_BILLING_REPORT_POLICY, dateField: "DTNEG" } },
      { quantitiesAllocated: true },
      { items: [{ ...order(1), erp: { ...(order(1)["erp"] as ERPRow), movement: "P" } }] },
    ]) {
      const c = createERPClient(async () => ({ error: null, data: { ...original, ...bad } }));
      await expect(c.billingReport(q)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });
  it("ficha fiscal reutilizada identifica Nota fiscal, sem permitir gravação", async () => {
    location.hash = "#/pedidos/sankhya:invoice:1";
    const row = order(1),
      client = createERPClient(async () => ({
        error: null,
        data: {
          ...observation,
          record: row,
          items: [],
          total: 0,
          totalWithoutSearch: 0,
          offset: 0,
          limit: 50,
          hasMore: false,
        },
      })),
      persist = vi.fn();
    render(
      <SulApp
        initialState={createAppState()}
        online={client}
        persist={persist}
        onSignOut={vi.fn()}
      />,
    );
    await screen.findByText("Nota fiscal #501");
    expect(persist).not.toHaveBeenCalled();
  });
});
