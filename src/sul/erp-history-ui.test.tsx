import React, { useRef } from "react";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createERPClient, type ERPRow } from "../lib/erp-online";
import { exportERPRows, readERPDocument, useERPTable, type ERPQueryMetadata } from "./erp-hooks";
import SulApp, { createAppState } from "./SulApp";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  notify: vi.fn(),
}));
const observation = { source: "sankhya", readOnly: true, readAt: "2026-10-23T23:00:00.000Z" };
const id = "sankhya:order:991";
const header = {
  id,
  source: "observado",
  readOnly: true,
  number: "91",
  date: "2026-10-23",
  customerId: "sankhya:customer:141",
  customerName: "Cliente documental",
  sellerName: "Vendedor ERP",
  total: 99.17,
  status: "confirmado",
  operationName: "Venda normal",
  erp: {
    source: "sankhya",
    companyCode: 1,
    documentCode: 991,
    movement: "P",
    payment: { code: 29, label: "Prazo real" },
  },
};
function documentClient(size = 75) {
  const items = Array.from({ length: size }, (_, i) => ({
    id: `${id}:item:${i + 1}`,
    source: "observado",
    readOnly: true,
    productId: `sankhya:product:${i + 1}`,
    productName: `Produto documental ${i + 1}`,
    productCode: i + 1,
    unit: "PC",
    quantity: 2,
    unitPrice: 6,
    total: 10,
  }));
  const transport = vi.fn(async ({ query }: import("../test/erp-fixture-types").FixtureRequest) => {
    const offset = query.offset ?? 0,
      limit = query.limit ?? 50;
    return {
      error: null,
      data: {
        ...observation,
        record: header,
        items: items.slice(offset, offset + limit),
        total: size,
        totalWithoutSearch: size,
        offset,
        limit,
        hasMore: offset + limit < size,
      },
    };
  });
  return {
    client: createERPClient(transport as unknown as import("../lib/erp-online").ERPTransport),
    transport,
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  location.hash = "";
});
describe("Histórico documental transitório nas telas existentes", () => {
  it("recusa documento diferente e página incompleta no SDK", async () => {
    const wrong = createERPClient(async () => ({
      error: null,
      data: {
        ...observation,
        record: { ...header, id: "sankhya:order:992" },
        items: [],
        total: 0,
        totalWithoutSearch: 0,
        offset: 0,
        limit: 50,
        hasMore: false,
      },
    }));
    await expect(wrong.document({ id })).rejects.toThrow("Resposta ERP inválida");
    const { client, transport } = documentClient();
    transport.mockImplementationOnce(async () => ({
      error: null,
      data: {
        ...observation,
        record: header,
        items: [],
        total: 75,
        totalWithoutSearch: 75,
        offset: 0,
        limit: 50,
        hasMore: true,
      },
    }));
    await expect(client.document({ id })).rejects.toThrow("Resposta ERP inválida");
  });
  it("lê todos os itens em janelas de50 sem transformar preço histórico em atual", async () => {
    const { client, transport } = documentClient();
    const result = await readERPDocument(client, id, () => {});
    expect(result?.["items"]).toHaveLength(75);
    expect((result?.["items"] as ERPRow[])[0]).toMatchObject({
      qty: 2,
      price: 6,
      total: 10,
      name: "Produto documental 1",
      code: 1,
    });
    expect(result).toMatchObject({
      customerName: "Cliente documental",
      seller: "Vendedor ERP",
      total: 99.17,
    });
    expect(transport.mock.calls.map(([call]) => call.query.offset)).toEqual([0, 50]);
    expect(transport.mock.calls.every(([call]) => call.query.limit <= 50)).toBe(true);
  });
  it("não mostra conjunto parcial se o cabeçalho mudar entre páginas", async () => {
    const { client } = documentClient();
    const original = client.document.bind(client);
    vi.spyOn(client, "document").mockImplementation(async (query) => {
      const result = await original(query);
      return query.offset ? { ...result, record: { ...header, total: 123 } } : result;
    });
    await expect(readERPDocument(client, id, () => {})).rejects.toThrow("Resposta ERP inválida");
  });
  it("mantém P e V separados, fora dos pedidos locais, com contagens integrais", async () => {
    const transport = vi.fn(
      async ({ operation, query }: import("../test/erp-fixture-types").FixtureRequest) => {
        expect(operation).toBe("history");
        expect(query.customerId).toBe("sankhya:customer:141");
        const count = query.resource === "orders" ? 65 : 3;
        const rows = Array.from({ length: count }, (_, i) => ({
          ...header,
          id: `sankhya:${query.resource === "orders" ? "order" : "invoice"}:${i + 1}`,
        }));
        return {
          error: null,
          data: {
            ...observation,
            items: rows.slice(query.offset, query.offset + query.limit),
            total: count,
            totalWithoutSearch: count,
            offset: query.offset,
          },
        };
      },
    );
    const client = createERPClient(
        transport as unknown as import("../lib/erp-online").ERPTransport,
      ),
      local = [{ id: "local", total: 999 }];
    const hook = renderHook(() => {
      const metadata = useRef<Partial<Record<"orders", ERPQueryMetadata>>>({});
      return useERPTable(
        { client, resource: "orders", customerId: "sankhya:customer:141" },
        local,
        "",
        null,
        metadata,
      );
    });
    await waitFor(() => expect(hook.result.current.total).toBe(65));
    expect(hook.result.current.rows).toHaveLength(10);
    expect(hook.result.current.rows.some((row) => row["id"] === "local")).toBe(false);
    const invoices = await exportERPRows(
      { client, resource: "invoices" },
      { resource: "invoices", customerId: "sankhya:customer:141" },
      local,
      () => {},
    );
    expect(invoices).toHaveLength(3);
    expect(invoices[0]?.["value"]).toBe(99.17);
    expect(local).toEqual([{ id: "local", total: 999 }]);
  });
  it("reutiliza o detalhe existente com nomes e totais documentais, sem catálogo canônico", async () => {
    const { client } = documentClient(1),
      persist = vi.fn();
    const initial = createAppState({ orders: [], customers: [], products: [] });
    location.hash = "#/pedidos/" + id;
    render(<SulApp initialState={initial} persist={persist} online={client} onSignOut={vi.fn()} />);
    await screen.findByText("Cliente documental");
    expect(screen.getByText("Produto documental 1")).toBeTruthy();
    expect(screen.getByText("Vendedor ERP")).toBeTruthy();
    expect(screen.getByText("R$ 10,00")).toBeTruthy();
    expect(screen.queryByText("R$ 12,00")).toBeNull();
    expect(initial["customers"]).toEqual([]);
    expect(initial["products"]).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
  });
});
