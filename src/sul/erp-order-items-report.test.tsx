import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createERPClient, type ERPRow } from "../lib/erp-online";
import { decimalUnits, formatERPQuantity, sumERPDecimals } from "../lib/erp-decimal";
import {
  readERPProductsChart,
  useERPProductsChart,
  type ProductsChartContext,
} from "./erp-products-chart";
import { foldERPText } from "../lib/erp-order";
import { STANDARD_SALES_REPORT_POLICY } from "../../supabase/functions/sankhya-online/policy";
import { exportERPRows, useERPTable, type ERPQueryRef } from "./erp-hooks";
import SulApp, { createAppState } from "./SulApp";
const productBarSpy = vi.hoisted(() => vi.fn());
vi.mock("@g4ai/ds", async (original) => {
  const o = await original<typeof import("@g4ai/ds")>();
  return {
    ...o,
    notify: vi.fn(),
    BarList: (props: React.ComponentProps<typeof o.BarList>) => {
      productBarSpy(props);
      return <o.BarList {...props} />;
    },
  };
});
const observation = { source: "sankhya", readOnly: true, readAt: "2026-10-25T16:00:00.000Z" };
const line = (n: number): ERPRow => ({
  id: `sankhya:order:700:item:${n}`,
  source: "observado",
  readOnly: true,
  name: `Produto ERP ${String(n).padStart(3, "0")}`,
  date: "2026-10-25",
  number: "1234",
  customer: `Cliente ${(n % 2) + 1}`,
  customerId: `sankhya:customer:${(n % 2) + 1}`,
  sellerCode: n % 2 ? 34 : 12,
  productId: `sankhya:product:${n}`,
  unit: n % 2 ? "PC" : "CX",
  price: "0.1",
  qty: "2",
  total: "0.99",
  erp: {
    source: "sankhya",
    documentCode: 700,
    sequence: n,
    companyCode: 1,
    itemCompanyCode: 1,
    movement: "P",
    operationCode: 1001,
    natureCode: 10100000,
    statusCode: "L",
    dateField: "DTNEG",
  },
});
function fake(rows = Array.from({ length: 65 }, (_, n) => line(n + 1))) {
  const customers = [1, 2].map((n) => ({
      id: `sankhya:customer:${n}`,
      code: String(n),
      name: `Cliente ${n}`,
      active: true,
    })),
    sellers = [12, 34].map((n) => ({
      id: `sankhya:seller:${n}`,
      code: n,
      name: `Representante ${n}`,
    }));
  const transport = vi.fn(
    async ({ operation, query }: import("../test/erp-fixture-types").FixtureRequest) => {
      if (operation === "record") {
        const r = query.resource === "sellers" ? sellers : customers;
        return {
          error: null,
          data: { ...observation, record: r.find((x) => x.id === query.id) || null },
        };
      }
      if (operation === "window") {
        const r = query.resource === "sellers" ? sellers : customers;
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
      if (!["order-items-report", "sales-report"].includes(operation))
        throw Error("Operação indevida no relatório");
      let selected = rows.filter(
        (r) =>
          (!query.customerId || r["customerId"] === query.customerId) &&
          (!query.sellerCode || r["sellerCode"] === query.sellerCode) &&
          (!query.from || String(r["date"]) >= query.from) &&
          (!query.to || String(r["date"]) <= query.to),
      );
      if (operation === "sales-report") {
        if (query.groupBy !== "customer") throw Error("Agrupamento indevido no gerencial");
        const headers = [
          ...new Map(selected.map((r) => [(r["erp"] as ERPRow)["documentCode"], r])).values(),
        ];
        const groupHeaders = (source: ERPRow[]): ERPRow[] => {
          const m = new Map<string, ERPRow[]>();
          for (const r of source) {
            const id = String(r["customerId"]);
            m.set(id, [...(m.get(id) || []), r]);
          }
          return [...m].map(([id, rs]) => {
            const code = Number(id.split(":").at(-1));
            return {
              id: `sankhya:sales:customer:${code}`,
              groupBy: "customer",
              groupCode: code,
              name: rs[0]!["customer"],
              count: rs.length,
              total: rs.some((r) => r["testHeaderTotal"] === null)
                ? null
                : sumERPDecimals(rs.map((r) => String(r["testHeaderTotal"] ?? "10.01"))),
            };
          });
        };
        const totalWithoutSearch = groupHeaders(headers).length,
          filtered = query.search
            ? headers.filter((r) =>
                foldERPText(String(r["customer"])).includes(foldERPText(query.search)),
              )
            : headers,
          missing = filtered.filter((r) => r["testHeaderTotal"] === null).length;
        let output = groupHeaders(filtered);
        if (query.sort)
          output = [...output].sort((a, b) => {
            const x = a[query.sort],
              y = b[query.sort];
            if (x === null) return y === null ? 0 : 1;
            if (y === null) return -1;
            return (
              (query.sort === "total"
                ? decimalUnits(String(x)) < decimalUnits(String(y))
                  ? -1
                  : decimalUnits(String(x)) > decimalUnits(String(y))
                    ? 1
                    : 0
                : String(x).localeCompare(String(y), "pt-BR", { numeric: true })) *
              (query.direction === "desc" ? -1 : 1)
            );
          });
        return {
          error: null,
          data: {
            ...observation,
            items: output.slice(query.offset, query.offset + query.limit),
            total: output.length,
            totalWithoutSearch,
            offset: query.offset,
            companyCodes: [1],
            groupBy: "customer",
            salesPolicy: STANDARD_SALES_REPORT_POLICY,
            summary: {
              documentCount: filtered.length,
              documentAmount: missing
                ? null
                : sumERPDecimals(filtered.map((r) => String(r["testHeaderTotal"] ?? "10.01"))),
              missingAmountCount: missing,
              amountField: "TGFCAB.VLRNOTA",
              headerCountedOnce: true,
              atomicSnapshot: false,
            },
          },
        };
      }
      const group = (data: ERPRow[]): ERPRow[] => {
        if (!query.productReport) return data;
        const m = new Map<string, ERPRow[]>();
        for (const r of data) {
          const id = String(r["productId"]);
          m.set(id, [...(m.get(id) || []), r]);
        }
        return [...m].map(([id, rs]) => {
          const code = id.split(":").at(-1)!,
            units = new Set(rs.filter((r) => r["unit"] !== null).map((r) => String(r["unit"]))),
            mq = rs.filter((r) => r["qty"] === null).length,
            mu = rs.filter((r) => r["unit"] === null || String(r["unit"]).trim() === "").length,
            ms = rs.filter((r) => r["total"] === null).length;
          const unit = units.size === 1 && !mu ? [...units][0]! : null;
          return {
            id: `sankhya:items:product:${code}`,
            source: "observado",
            readOnly: true,
            productId: id,
            code,
            name: rs[0]!["name"],
            qty: unit !== null && !mq ? sumERPDecimals(rs.map((r) => String(r["qty"]))) : null,
            total: ms ? null : sumERPDecimals(rs.map((r) => String(r["total"]))),
            unit,
            lineCount: rs.length,
            missingSubtotalCount: ms,
            missingQuantityCount: mq,
            missingUnitCount: mu,
            unitCount: units.size,
          };
        });
      };
      const unfiltered = group(selected).length;
      if (query.search)
        selected = selected.filter((r) =>
          foldERPText(
            (query.productReport
              ? [r["name"], String(r["productId"]).split(":").at(-1)]
              : [r["name"], r["customer"], r["number"]]
            ).join(" "),
          ).includes(foldERPText(query.search)),
        );
      const missing = selected.filter((r) => r["total"] === null).length,
        summary = {
          lineCount: selected.length,
          subtotal: missing ? null : sumERPDecimals(selected.map((r) => String(r["total"]))),
          missingSubtotalCount: missing,
          quantityField: "TGFITE.QTDNEG",
          unitPriceField: "TGFITE.VLRUNIT",
          subtotalField: "TGFITE.VLRTOT",
          calculatedSubtotal: false,
          headerAmountsAdded: false,
          atomicSnapshot: false,
        };
      let output = group(selected);
      if (query.sort)
        output = [...output].sort((a, b) => {
          const x = a[query.sort],
            y = b[query.sort];
          if (x === null) return y === null ? 0 : 1;
          if (y === null) return -1;
          const n =
            ["qty", "total"].includes(query.sort) && typeof x === "string" && typeof y === "string"
              ? decimalUnits(x) < decimalUnits(y)
                ? -1
                : decimalUnits(x) > decimalUnits(y)
                  ? 1
                  : 0
              : String(x).localeCompare(String(y), "pt-BR", { numeric: true });
          return n * (query.direction === "desc" ? -1 : 1);
        });
      return {
        error: null,
        data: {
          ...observation,
          items: output.slice(query.offset, query.offset + query.limit),
          total: output.length,
          totalWithoutSearch: unfiltered,
          offset: query.offset,
          companyCodes: [1],
          salesPolicy: STANDARD_SALES_REPORT_POLICY,
          summary,
          ...(query.productReport
            ? {
                groupBy: "product",
                productAggregation: {
                  field: "TGFITE.CODPROD",
                  mixedUnits: "unavailable",
                  quantitiesConverted: false,
                  subtotalReconstructed: false,
                },
              }
            : {}),
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
function mount(rows?: ERPRow[], route = "produtos-pedido") {
  location.hash = "#/relatorios/" + route;
  const f = fake(rows),
    state = createAppState({
      orders: [
        {
          id: "manual",
          date: "2026-10-25",
          number: "NÃO-MISTURAR",
          type: "Venda",
          status: "Concluído",
          items: [{ productId: "manual-produto", price: 999, qty: 2 }],
        },
      ],
      products: [{ id: "manual-produto", name: "PRODUTO MANUAL NÃO USAR" }],
    }),
    persist = vi.fn();
  render(<SulApp initialState={state} online={f.client} persist={persist} onSignOut={vi.fn()} />);
  return { ...f, persist, state };
}
beforeEach(() => {
  productBarSpy.mockClear();
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
function downloads() {
  const create = vi.fn((_blob: Blob) => "blob:itens");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return create;
}
async function csvText(create: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  const blob = create.mock.calls[0]![0] as Blob;
  return new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(blob);
  });
}

describe("Produtos por pedidos na interface existente", () => {
  it("sete colunas, subtotal nativo e nenhuma mistura manual, cotação ou gravação", async () => {
    const f = mount();
    await screen.findByText("Produto ERP 001");
    expect(screen.getAllByRole("columnheader").map((x) => x.textContent)).toEqual([
      "Produto",
      "Emissão",
      "Pedido",
      "Cliente",
      "Preço unitário",
      "Quantidade",
      "Subtotal",
    ]);
    expect(screen.getAllByText("R$ 0,99")).toHaveLength(10);
    expect(screen.queryByText("R$ 0,20")).not.toBeInTheDocument();
    expect(screen.queryByText("PRODUTO MANUAL NÃO USAR")).not.toBeInTheDocument();
    expect(
      f.transport.mock.calls.every(
        ([q]) => q.operation === "order-items-report" && q.query.limit <= 50,
      ),
    ).toBe(true);
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.state["products"]).toHaveLength(1);
  });
  it("busca no ERP e mantém o campo disponível, sem buscar catálogo para recompor nome", async () => {
    const f = mount();
    await screen.findByText("Produto ERP 001");
    const input = screen.getByPlaceholderText("Filtrar…");
    fireEvent.change(input, { target: { value: "Produto ERP 065" } });
    await screen.findByText("Produto ERP 065");
    expect(screen.queryByText("Produto ERP 001")).not.toBeInTheDocument();
    expect(input).toBeInTheDocument();
    expect(f.transport.mock.calls.at(-1)?.[0].query.search).toBe("Produto ERP 065");
  });
  it("cliente/vendedor/situação existentes filtram por código, não selecionam identidade para vender", async () => {
    const f = mount();
    await screen.findByText("Produto ERP 001");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Cliente" }));
    fireEvent.click(await screen.findByRole("option", { name: "Cliente 1 (1)" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Vendedor" }));
    fireEvent.click(await screen.findByRole("option", { name: "Representante 12" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Situação" }));
    const option = await screen.findByRole("option", { name: "confirmado" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() =>
      expect(f.transport.mock.calls.at(-1)?.[0].query).toMatchObject({
        customerId: "sankhya:customer:1",
        sellerCode: 12,
        status: "confirmado",
      }),
    );
    await screen.findByText("Produto ERP 002");
    expect(screen.queryByText("Produto ERP 001")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("CSV integral mantém65 linhas, sete campos e subtotal do ERP, não preço×quantidade", async () => {
    const create = downloads(),
      f = mount();
    await screen.findByText("Produto ERP 001");
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    const text = await csvText(create);
    expect(text.split("\r\n")).toHaveLength(66);
    expect(text).toContain("name;date;number;customer;price;qty;total");
    expect(text).toContain("Produto ERP 065");
    expect(text).toContain('"0.1";"2";"0.99"');
    expect(text).not.toContain("NÃO-MISTURAR");
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("CSV respeita busca e ordenação do cabeçalho em todo o recorte", async () => {
    const create = downloads();
    mount();
    await screen.findByText("Produto ERP 001");
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "Cliente 1" } });
    await screen.findByText("Produto ERP 002");
    const sort = screen.getByRole("button", { name: /Ordenar por Produto/ });
    fireEvent.click(sort);
    fireEvent.click(sort);
    await screen.findByText("Produto ERP 064");
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    const lines = (await csvText(create)).split("\r\n");
    expect(lines).toHaveLength(33);
    expect(lines[1]).toContain("Produto ERP 064");
    expect(lines.at(-1)).toContain("Produto ERP 002");
  });
  it("ausência de subtotal/preço/quantidade não vira zero nem recálculo", async () => {
    const f = mount([{ ...line(1), price: null, qty: null, total: null }]);
    await screen.findByText("Produto ERP 001");
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("erro remoto não usa dados manuais nem mantém linhas antigas", async () => {
    const f = mount();
    await screen.findByText("Produto ERP 001");
    f.transport.mockRejectedValue(new Error("falha sintética"));
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "novo" } });
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("Produto ERP 001")).not.toBeInTheDocument();
    expect(screen.queryByText("PRODUTO MANUAL NÃO USAR")).not.toBeInTheDocument();
  });
});
describe("Contrato nativo do leitor de itens e CSV coerente", () => {
  it("recusa política, dinheiro binário, identidades e recomposição adulterados", async () => {
    const f = fake([line(1)]),
      base = await f.client.orderItemsReport({ resource: "orders", offset: 0, limit: 10 });
    for (const change of [
      { salesPolicy: null },
      { summary: { ...base.summary, calculatedSubtotal: true } },
      { summary: { ...base.summary, headerAmountsAdded: true } },
      { summary: { ...base.summary, subtotal: 0.99 } },
      { items: [{ ...line(1), price: 0.1 }] },
      { items: [{ ...line(1), qty: 2 }] },
      { items: [{ ...line(1), id: "sankhya:order:999:item:1" }] },
      { items: [{ ...line(1), erp: { ...(line(1)["erp"] as ERPRow), movement: "V" } }] },
      { items: [{ ...line(1), erp: { ...(line(1)["erp"] as ERPRow), itemCompanyCode: 4 } }] },
      { items: [{ ...line(1), date: "2026-02-30" }] },
    ]) {
      const client = createERPClient(async () => ({ error: null, data: { ...base, ...change } }));
      await expect(
        client.orderItemsReport({ resource: "orders", offset: 0, limit: 10 }),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });
  it("recusa alteração do subtotal com mesma contagem entre janelas do CSV", async () => {
    const f = fake(),
      original = f.client.orderItemsReport.bind(f.client);
    vi.spyOn(f.client, "orderItemsReport").mockImplementation(async (q) => {
      const r = await original(q);
      return q.offset ? { ...r, summary: { ...r.summary, subtotal: "999" } } : r;
    });
    await expect(
      exportERPRows(
        { client: f.client, resource: "orders", orderItemsReport: {} },
        { resource: "orders" },
        [],
        () => {},
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

const soldRows = (): ERPRow[] =>
  Array.from({ length: 65 }, (_, n) => ({ ...line(n + 1), unit: "PC" }));
const soldQuery = { resource: "orders", offset: 0, limit: 10, productReport: true } as const;
async function productsContext(f: ReturnType<typeof fake>): Promise<ProductsChartContext> {
  const w = await f.client.orderItemsReport(soldQuery);
  return { summary: w.summary, source: { query: soldQuery, companyCodes: w.companyCodes } };
}
const bars = () =>
  productBarSpy.mock.calls.at(-1)?.[0].items as {
    id: string;
    label: string;
    value: number;
    nativeQuantity: string;
    nativeTotal: string;
  }[];
describe("Produtos mais vendidos na estrutura existente", () => {
  it("busca por nome de cliente não vira filtro oculto do agregado", async () => {
    mount(soldRows(), "produtos");
    await waitFor(() => expect(bars()).toHaveLength(65));
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "Cliente 1" } });
    await waitFor(() => {
      expect(bars()).toEqual([]);
      expect(screen.queryByText("Produto ERP 001")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
  });
  it("quatro colunas,65 agregados no gráfico e apenas10 na tabela, sem manuais ou mês presumido", async () => {
    const f = mount(soldRows(), "produtos");
    await waitFor(() => expect(bars()).toHaveLength(65));
    expect(screen.getAllByRole("columnheader").map((x) => x.textContent)).toEqual([
      "Código",
      "Categorias e produtos",
      "Quantidade vendida",
      "Valor vendido",
    ]);
    expect(screen.queryByText("PRODUTO MANUAL NÃO USAR")).not.toBeInTheDocument();
    expect(
      f.transport.mock.calls.every(
        ([b]) =>
          b.operation === "order-items-report" &&
          b.query.productReport === true &&
          b.query.from === undefined &&
          b.query.limit <= 50,
      ),
    ).toBe(true);
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.state["products"]).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
    await waitFor(() =>
      expect(f.transport.mock.calls.some(([b]) => b.query.offset === 10)).toBe(true),
    );
  });
  it("65 linhas do mesmo SKU viram um agregado, não65 produtos nem preço×quantidade", async () => {
    const rows = soldRows().map((r, n) => ({
      ...r,
      productId: "sankhya:product:1",
      name: "Mesmo produto",
      qty: "0.1",
      erp: { ...(r["erp"] as ERPRow), sequence: n + 1 },
    }));
    const f = mount(rows, "produtos");
    await screen.findByText("R$ 64,35");
    await waitFor(() => expect(bars()).toHaveLength(1));
    expect(bars()[0]).toMatchObject({ nativeQuantity: "6.5", value: 6.5 });
    expect(screen.queryByText("R$ 0,65")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("busca recompõe tabela/gráfico pelo mesmo recorte integral", async () => {
    mount(soldRows(), "produtos");
    await waitFor(() => expect(bars()).toHaveLength(65));
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), {
      target: { value: "Produto ERP 065" },
    });
    await waitFor(() => expect(bars()).toHaveLength(1));
    expect(bars()[0]?.label).toBe("Produto ERP 065");
    expect(screen.queryByText("Produto ERP 001")).not.toBeInTheDocument();
  });
  it("filtros existentes cliente/vendedor/situação não viram identidade comercial", async () => {
    const f = mount(soldRows(), "produtos");
    await waitFor(() => expect(bars()).toHaveLength(65));
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Cliente" }));
    fireEvent.click(await screen.findByRole("option", { name: "Cliente 1 (1)" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Vendedor" }));
    fireEvent.click(await screen.findByRole("option", { name: "Representante 12" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Situação" }));
    const option = await screen.findByRole("option", { name: "confirmado" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() => expect(bars()).toHaveLength(32));
    expect(f.transport.mock.calls.at(-1)?.[0].query).toMatchObject({
      customerId: "sankhya:customer:1",
      sellerCode: 12,
      status: "confirmado",
      productReport: true,
    });
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("unidades mistas no SKU deixam quantidade indisponível, preservando subtotal", async () => {
    const rows = [
      { ...line(1), productId: "sankhya:product:1", name: "Misto", unit: "PC" },
      { ...line(2), productId: "sankhya:product:1", name: "Misto", unit: "CX" },
    ];
    mount(rows, "produtos");
    await screen.findByText("R$ 1,98");
    expect(screen.getByText("Não extraído")).toBeInTheDocument();
    await waitFor(() => expect(bars()).toEqual([]));
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  });
  it("ordena por quantidade no servidor, mantendo gráfico integral", async () => {
    const f = mount(soldRows(), "produtos");
    await waitFor(() => expect(bars()).toHaveLength(65));
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Quantidade vendida/ }));
    await waitFor(() =>
      expect(
        f.transport.mock.calls.some(([b]) => b.query.sort === "qty" && b.query.limit === 10),
      ).toBe(true),
    );
    await waitFor(() => expect(bars()).toHaveLength(65));
  });
  it("CSV de65 grupos usa quatro campos e totais textuais nativos", async () => {
    const create = downloads(),
      f = mount(soldRows(), "produtos");
    await waitFor(() => expect(bars()).toHaveLength(65));
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    const text = await csvText(create);
    expect(text.split("\r\n")).toHaveLength(66);
    expect(text).toContain("code;name;qty;total");
    expect(text).toContain('"65";"Produto ERP 065";"2";"0.99"');
    expect(text).not.toContain("NÃO-MISTURAR");
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("falha remota não conserva gráfico/valores antigos nem mostra dinheiro zero", async () => {
    const f = mount(soldRows(), "produtos");
    await waitFor(() => expect(bars()).toHaveLength(65));
    f.transport.mockRejectedValue(Error("falha sintética"));
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "novo" } });
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(bars()).toEqual([]);
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
  });
});
describe("Quantidade textual, contrato do agregado e gráfico completo", () => {
  it("sem cliente/fonte não tenta renderizar resultado inexistente", () => {
    const hook = renderHook(() => useERPProductsChart(undefined, undefined));
    expect(hook.result.current).toEqual([]);
  });
  it.each([
    ["6.5", "7"],
    ["0.12345", "0"],
    ["-0.12345", "-0"],
    ["9007199254740993.1", "9.007.199.254.740.993"],
    [null, null],
    ["NaN", null],
  ])("apresentação existente sem ponto flutuante: %s", (value, expected) => {
    expect(formatERPQuantity(value)).toBe(expected);
  });
  it("SDK aceita muitas ausências financeiras em um só grupo, sem confundir linhas e produtos", async () => {
    const f = fake(
      Array.from({ length: 3 }, (_, n) => ({
        ...line(n + 1),
        productId: "sankhya:product:1",
        name: "Produto",
        unit: "PC",
        total: null,
      })),
    );
    const r = await f.client.orderItemsReport(soldQuery);
    expect(r.total).toBe(1);
    expect(r.summary.missingSubtotalCount).toBe(3);
    expect(r.items[0]?.["qty"]).toBe("6");
  });
  it.each([
    { qty: 2 },
    { qty: "1e2" },
    { code: "0" },
    { id: "sankhya:items:product:999" },
    { unit: null },
    { missingQuantityCount: 999 },
  ])("SDK recusa agregado incompatível: %j", async (change) => {
    const f = fake([{ ...line(1), unit: "PC" }]),
      r = await f.client.orderItemsReport(soldQuery),
      c = createERPClient(async () => ({
        error: null,
        data: { ...r, items: [{ ...r.items[0], ...change }] },
      }));
    await expect(c.orderItemsReport(soldQuery)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("política de conversão ou recomposição não pode ser inventada", async () => {
    const f = fake(soldRows()),
      r = await f.client.orderItemsReport(soldQuery),
      c = createERPClient(async () => ({
        error: null,
        data: {
          ...r,
          productAggregation: {
            field: "TGFITE.CODPROD",
            mixedUnits: "unavailable",
            quantitiesConverted: true,
            subtotalReconstructed: false,
          },
        },
      }));
    await expect(c.orderItemsReport(soldQuery)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("gráfico lê65 grupos em janelas50/15 e confere o subtotal integral", async () => {
    const f = fake(soldRows()),
      c = await productsContext(f);
    f.transport.mockClear();
    const points = await readERPProductsChart(f.client, c);
    expect(points).toHaveLength(65);
    expect(sumERPDecimals(points.map((p) => p.nativeTotal))).toBe("64.35");
    expect(
      f.transport.mock.calls.map(([b]) => [b.query.offset, b.query.limit, b.query.productReport]),
    ).toEqual([
      [0, 50, true],
      [50, 50, true],
    ]);
  });
  it.each(["unidades", "homonimos", "quantidade_ausente", "quantidade_negativa"] as const)(
    "gráfico não representa %s como zero ou comparação válida",
    async (broken) => {
      const rows: ERPRow[] = [
        { ...line(1), unit: "PC" },
        { ...line(2), unit: "PC" },
      ];
      if (broken === "unidades") rows[1]!["unit"] = "CX";
      if (broken === "homonimos") rows[1]!["name"] = rows[0]!["name"];
      if (broken === "quantidade_ausente") rows[1]!["qty"] = null;
      if (broken === "quantidade_negativa") rows[1]!["qty"] = "-1";
      const f = fake(rows),
        c = await productsContext(f);
      expect(await readERPProductsChart(f.client, c)).toEqual([]);
    },
  );
  it.each(["resumo", "filiais", "duplicado", "subtotal"] as const)(
    "gráfico recusa divergência de %s, sem parcial",
    async (broken) => {
      const f = fake(soldRows()),
        c = await productsContext(f),
        original = f.client.orderItemsReport.bind(f.client);
      vi.spyOn(f.client, "orderItemsReport").mockImplementation(async (q) => {
        const w = await original(q);
        return broken === "resumo"
          ? { ...w, summary: { ...w.summary, subtotal: "9" } }
          : broken === "filiais"
            ? { ...w, companyCodes: [4] }
            : broken === "duplicado" && q.offset
              ? {
                  ...w,
                  items: [{ ...w.items[0], id: "sankhya:items:product:1" }, ...w.items.slice(1)],
                }
              : broken === "subtotal"
                ? { ...w, items: w.items.map((r, n) => (n ? r : { ...r, total: "9" })) }
                : w;
      });
      await expect(readERPProductsChart(f.client, c)).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    },
  );
  it("fonte invalidada não recupera resposta assíncrona do gráfico anterior", async () => {
    const f = fake(soldRows()),
      c = await productsContext(f),
      original = f.client.orderItemsReport.bind(f.client);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(f.client, "orderItemsReport").mockImplementation(async (q) => {
      await gate;
      return original(q);
    });
    const hook = renderHook(
      ({ context }: { context: ProductsChartContext | undefined }) =>
        useERPProductsChart(f.client, context),
      { initialProps: { context: c as ProductsChartContext | undefined } },
    );
    hook.rerender({ context: undefined });
    await act(async () => {
      release();
      await gate;
    });
    expect(hook.result.current).toEqual([]);
  });
  it("fonte sem productReport não consulta outro universo", async () => {
    const f = fake(soldRows()),
      c = await productsContext(f);
    f.transport.mockClear();
    await expect(
      readERPProductsChart(f.client, {
        summary: c.summary,
        source: { query: { resource: "orders" }, companyCodes: [1] },
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(f.transport).not.toHaveBeenCalled();
  });
});

const managementRows = (n = 65): ERPRow[] =>
  soldRows()
    .slice(0, n)
    .map((r, i) => ({
      ...r,
      id: `sankhya:order:${i + 1}:item:1`,
      customerId: `sankhya:customer:${i + 1}`,
      customer: `Cliente gerencial ${String(i + 1).padStart(3, "0")}`,
      testHeaderTotal: "10.01",
      erp: { ...(r["erp"] as ERPRow), documentCode: i + 1, sequence: 1 },
    }));
const managementTables = () => {
  const [products, customers] = screen.getAllByRole("table");
  return { products: products!, customers: customers! };
};
async function managementReady(rows = managementRows()) {
  const f = mount(rows, "gerencial");
  await screen.findByText("Cliente gerencial 001");
  await screen.findByText("Produto ERP 001");
  return f;
}
describe("Gerencial com cabeçalhos e itens em quadros independentes", () => {
  it("preserva dois quadros de duas colunas, sem KPI/controles novos ou dados manuais", async () => {
    const f = await managementReady(),
      t = managementTables();
    expect(
      within(t.products)
        .getAllByRole("columnheader")
        .map((x) => x.textContent),
    ).toEqual(["Produto", "Quantidade"]);
    expect(
      within(t.customers)
        .getAllByRole("columnheader")
        .map((x) => x.textContent),
    ).toEqual(["Razão social", "Valor em pedidos"]);
    expect(screen.getAllByPlaceholderText("Filtrar…")).toHaveLength(1);
    expect(screen.queryByText("Pedidos no recorte filtrado")).not.toBeInTheDocument();
    expect(screen.queryByText("PRODUTO MANUAL NÃO USAR")).not.toBeInTheDocument();
    expect(f.transport.mock.calls.map(([b]) => b.operation).sort()).toEqual([
      "order-items-report",
      "sales-report",
    ]);
    expect(
      f.transport.mock.calls.every(
        ([b]) => b.query.from === undefined && b.query.to === undefined && b.query.limit <= 50,
      ),
    ).toBe(true);
    expect(f.state["products"]).toHaveLength(1);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("um cabeçalho com três itens não triplica valor nem usa preço×quantidade", async () => {
    const rows = managementRows(3).map((r) => ({
      ...r,
      productId: "sankhya:product:1",
      name: "Produto ERP 001",
      customerId: "sankhya:customer:1",
      customer: "Cliente gerencial 001",
      qty: "0.1",
      erp: { ...(r["erp"] as ERPRow), documentCode: 1 },
    }));
    await managementReady(rows);
    const t = managementTables();
    expect(within(t.customers).getAllByText("R$ 10,01")).toHaveLength(1);
    expect(within(t.products).getByText("0.3")).toBeInTheDocument();
    expect(screen.queryByText("R$ 30,03")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 2,97")).not.toBeInTheDocument();
  });
  it("clientes homônimos continuam duas linhas por código", async () => {
    mount(
      managementRows(2).map((r) => ({ ...r, customer: "Homônimo cadastral" })),
      "gerencial",
    );
    await screen.findAllByText("Homônimo cadastral");
    expect(within(managementTables().customers).getAllByText("Homônimo cadastral")).toHaveLength(2);
  });
  it.each([{ testHeaderTotal: null }, { qty: null }, { total: null }])(
    "ausências são independentes, sem zero ou recomposição: %j",
    async (missing) => {
      const f = await managementReady([{ ...managementRows(1)[0]!, ...missing }]),
        t = managementTables();
      if (Object.hasOwn(missing, "testHeaderTotal"))
        expect(within(t.customers).getByText("Não extraído")).toBeInTheDocument();
      else expect(within(t.customers).getByText("R$ 10,01")).toBeInTheDocument();
      if (Object.hasOwn(missing, "qty"))
        expect(within(t.products).getByText("Não extraído")).toBeInTheDocument();
      else expect(within(t.products).getByText("2")).toBeInTheDocument();
      expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
      expect(f.persist).not.toHaveBeenCalled();
    },
  );
  it("mesmo SKU com PC/CX não converte quantidade nem afeta o valor de cabeçalhos", async () => {
    const rows = managementRows(2).map((r, i) => ({
      ...r,
      productId: "sankhya:product:1",
      name: "Produto ERP 001",
      unit: i ? "CX" : "PC",
    }));
    await managementReady(rows);
    expect(within(managementTables().products).getByText("Não extraído")).toBeInTheDocument();
    expect(within(managementTables().customers).getAllByText("R$ 10,01")).toHaveLength(2);
  });
  it("página2 de clientes não pagina o quadro de produtos", async () => {
    const f = await managementReady();
    const before = f.transport.mock.calls.length;
    fireEvent.click(screen.getAllByRole("button", { name: "Próxima página" })[1]!);
    await screen.findByText("Cliente gerencial 011");
    expect(screen.getByText("Produto ERP 001")).toBeInTheDocument();
    expect(
      f.transport.mock.calls
        .slice(before)
        .every(([b]) => b.operation === "sales-report" && b.query.offset === 10),
    ).toBe(true);
  });
  it("busca principal não altera os produtos filtrados pelo drawer existente", async () => {
    const f = await managementReady(),
      before = f.transport.mock.calls.length;
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), {
      target: { value: "Cliente gerencial 065" },
    });
    await screen.findByText("Cliente gerencial 065");
    expect(screen.getByText("Produto ERP 001")).toBeInTheDocument();
    expect(
      f.transport.mock.calls
        .slice(before)
        .every(
          ([b]) => b.operation === "sales-report" && b.query.search === "Cliente gerencial 065",
        ),
    ).toBe(true);
  });
  it("CSV65 continua de clientes após paginar produtos, nunca é sobrescrito pelo segundo quadro", async () => {
    const create = downloads(),
      f = await managementReady();
    fireEvent.click(screen.getAllByRole("button", { name: "Próxima página" })[0]!);
    await screen.findByText("Produto ERP 011");
    const before = f.transport.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    const text = await csvText(create);
    expect(text.split("\r\n")).toHaveLength(66);
    expect(text).toContain("name;total");
    expect(text).toContain('"Cliente gerencial 065";"10.01"');
    expect(text).not.toContain("Produto ERP");
    expect(
      f.transport.mock.calls
        .slice(before)
        .map(([b]) => [b.operation, b.query.groupBy, b.query.offset, b.query.limit]),
    ).toEqual([
      ["sales-report", "customer", 0, 50],
      ["sales-report", "customer", 50, 50],
      ["sales-report", "customer", 0, 1],
    ]);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("CSV mantém busca e ordem da tabela principal após ordenar produtos", async () => {
    const create = downloads(),
      f = await managementReady();
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Quantidade/ }));
    await waitFor(() =>
      expect(
        f.transport.mock.calls.some(
          ([b]) => b.operation === "order-items-report" && b.query.sort === "qty",
        ),
      ).toBe(true),
    );
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), {
      target: { value: "Cliente gerencial 06" },
    });
    await screen.findByText("Cliente gerencial 060");
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Razão social/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Razão social/ }));
    await waitFor(() => expect(f.transport.mock.calls.at(-1)?.[0].query.direction).toBe("desc"));
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    const lines = (await csvText(create)).split("\r\n");
    expect(lines).toHaveLength(7);
    expect(lines[1]).toContain("Cliente gerencial 065");
    expect(lines.at(-1)).toContain("Cliente gerencial 060");
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("filtros por IDs/confirmado chegam aos dois leitores, sem trocar identidade ou persistir", async () => {
    const rows = soldRows()
        .slice(0, 4)
        .map((r, i) => ({
          ...r,
          testHeaderTotal: "10.01",
          erp: { ...(r["erp"] as ERPRow), documentCode: i + 1 },
        })),
      f = mount(rows, "gerencial");
    await screen.findByText("Cliente 1");
    await screen.findByText("Produto ERP 001");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Cliente" }));
    fireEvent.click(await screen.findByRole("option", { name: "Cliente 1 (1)" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Vendedor" }));
    fireEvent.click(await screen.findByRole("option", { name: "Representante 12" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Situação" }));
    const option = await screen.findByRole("option", { name: "confirmado" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    const before = f.transport.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await screen.findByText("R$ 20,02");
    expect(screen.queryByText("Produto ERP 001")).not.toBeInTheDocument();
    expect(screen.getByText("Produto ERP 002")).toBeInTheDocument();
    expect(new Set(f.transport.mock.calls.slice(before).map(([b]) => b.operation))).toEqual(
      new Set(["sales-report", "order-items-report"]),
    );
    expect(
      f.transport.mock.calls
        .slice(before)
        .every(
          ([b]) =>
            b.query.customerId === "sankhya:customer:1" &&
            b.query.sellerCode === 12 &&
            b.query.status === "confirmado",
        ),
    ).toBe(true);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("erro na tabela de clientes não usa manuais nem apaga produtos de outro recorte ainda válido", async () => {
    const f = await managementReady(),
      original = f.transport.getMockImplementation()!;
    f.transport.mockImplementation(async (b) => {
      if (b.operation === "sales-report") throw Error("falha sintética");
      return original(b);
    });
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "novo" } });
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("Cliente gerencial 001")).not.toBeInTheDocument();
    expect(screen.getByText("Produto ERP 001")).toBeInTheDocument();
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("falha do quadro de produtos não sobrescreve CSV nem valor de clientes", async () => {
    const create = downloads(),
      f = await managementReady(),
      original = f.transport.getMockImplementation()!;
    f.transport.mockImplementation(async (b) => {
      if (b.operation === "order-items-report") throw Error("falha sintética");
      return original(b);
    });
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Quantidade/ }));
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("Produto ERP 001")).not.toBeInTheDocument();
    expect(screen.getByText("Cliente gerencial 001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(await csvText(create)).toContain("Cliente gerencial 065");
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("sem dados não cria KPI, quantidades ou valores zero artificiais", async () => {
    const f = mount([], "gerencial");
    await waitFor(() => expect(f.transport).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("quadro sem exportação não registra nem remove o metadado do principal ao mudar ou desmontar", async () => {
    const f = fake(managementRows()),
      meta: ERPQueryRef = { current: {} },
      p = renderHook(() =>
        useERPTable(
          { client: f.client, resource: "orders", salesReport: { groupBy: "customer" } },
          [],
          "",
          null,
          meta,
        ),
      );
    const owner = meta.current.orders;
    expect(owner).toBeDefined();
    const secondary = renderHook(
      ({ search }) =>
        useERPTable(
          {
            client: f.client,
            resource: "orders",
            orderItemsReport: { productReport: true },
            registerExport: false,
          },
          [],
          search,
          null,
          meta,
        ),
      { initialProps: { search: "" } },
    );
    secondary.rerender({ search: "Produto ERP 065" });
    expect(meta.current.orders).toBe(owner);
    secondary.unmount();
    expect(meta.current.orders).toBe(owner);
    p.unmount();
    expect(meta.current.orders).toBeUndefined();
  });
});
