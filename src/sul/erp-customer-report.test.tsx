import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createERPClient, type ERPRow } from "../lib/erp-online";
import { compareERP, foldERPText } from "../lib/erp-order";
import {
  customerReportFilters,
  localCustomerReportRows,
  remoteCustomerReport,
} from "./erp-customer-report";
import SulApp, { createAppState } from "./SulApp";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  notify: vi.fn(),
}));
const observation = { source: "sankhya", readOnly: true, readAt: "2026-10-25T11:05:00.000Z" };
const customer = (n: number): ERPRow => ({
  id: `sankhya:customer:${n}`,
  code: String(n),
  name: `Cliente ${String(n).padStart(3, "0")}`,
  city: n % 2 ? "MARINGÁ" : "CURITIBA",
  state: "PR",
  active: n % 3 !== 0,
  sellerCode: n % 2 ? 34 : 12,
  readOnly: true,
  erp: { source: "sankhya" },
});
function fakeERP(rows: ERPRow[]) {
  const sellers = [
    { id: "sankhya:seller:34", name: "Mesmo nome", code: 34 },
    { id: "sankhya:seller:12", name: "Mesmo nome", code: 12 },
  ];
  const transport = vi.fn(
    async ({ operation, query }: import("../test/erp-fixture-types").FixtureRequest) => {
      const source = query.resource === "sellers" ? sellers : rows;
      if (operation === "record")
        return {
          error: null,
          data: {
            ...observation,
            record:
              source.find((row) => row["id"] === query.id || row["code"] === query.id) || null,
          },
        };
      let selected: ERPRow[] = source.filter(
        (row: ERPRow) =>
          (!query.filters?.customerCode ||
            row["id"] === `sankhya:customer:${query.filters.customerCode}`) &&
          (!query.filters?.sellerCode || row["sellerCode"] === query.filters.sellerCode) &&
          (!query.filters?.active ||
            query.filters.active === "all" ||
            row["active"] === (query.filters.active === "S")),
      );
      const totalWithoutSearch = selected.length;
      if (query.search)
        selected = selected.filter((row) =>
          foldERPText(
            Object.values(row)
              .filter((value) => typeof value !== "object")
              .join(" "),
          ).includes(foldERPText(query.search)),
        );
      selected.sort(
        compareERP(
          (query.sort || "code") as import("../lib/erp-order").ERPSortKey,
          query.direction,
        ),
      );
      return {
        error: null,
        data: {
          ...observation,
          items: selected.slice(query.offset, query.offset + query.limit),
          offset: query.offset,
          total: selected.length,
          totalWithoutSearch,
        },
      };
    },
  );
  return {
    client: createERPClient(transport as unknown as import("../lib/erp-online").ERPTransport),
    transport,
  };
}
function mount(rows: ERPRow[], local: ERPRow[] = []) {
  location.hash = "#/relatorios/clientes";
  const { client, transport } = fakeERP(rows),
    persist = vi.fn(async (next) => next);
  const state = createAppState({ customers: local });
  const view = render(
    <SulApp initialState={state} online={client} persist={persist} onSignOut={async () => {}} />,
  );
  return { ...view, client, transport, persist, state };
}
// JSDOM não implementa os métodos nativos de <dialog>; não substituir o Drawer real.
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

describe("Filtros por identidade, sem venda inferida nem carteira copiada", () => {
  it("envia códigos e cadastro inteiro, sem somar as duas filiais", () => {
    expect(
      customerReportFilters({
        customer: "sankhya:customer:141",
        seller: "sankhya:seller:34",
        status: "N",
      }),
    ).toEqual({ active: "N", customerCode: 141, sellerCode: 34 });
    expect(customerReportFilters({})).toEqual({ active: "all" });
    expect(customerReportFilters({ seller: "Mesmo nome" }).sellerCode).toBeNaN();
  });
  it("não associa manual a ERP por nome, documento, bloqueio ou ausência de ATIVO", () => {
    const rows = [
      { id: "manual", name: "Mesmo nome", seller: "Mesmo nome", blocked: false },
      { id: "manual2", sellerCode: 34, active: true },
      customer(1),
    ];
    expect(localCustomerReportRows(rows, {})).toHaveLength(2);
    expect(localCustomerReportRows(rows, { seller: "sankhya:seller:34", status: "S" })).toEqual([
      rows[1],
    ]);
    expect(localCustomerReportRows(rows, { status: "N" })).toEqual([]);
    expect(remoteCustomerReport({ customer: "manual" })).toBe(false);
  });
});

describe("Relatório de clientes pelos controles originais", () => {
  it("lê a primeira página e o cadastro inativo sem gravar, carregar histórico ou produtos", async () => {
    const { transport, persist, state } = mount(
      Array.from({ length: 75 }, (_, i) => customer(i + 1)),
    );
    await screen.findByText("Cliente 003");
    expect(screen.queryByText("Cliente 011")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Colunas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeInTheDocument();
    expect(
      transport.mock.calls.every(
        ([body]) =>
          body.operation === "window" &&
          body.query.resource === "customers" &&
          body.query.filters?.active === "all" &&
          body.query.limit <= 50,
      ),
    ).toBe(true);
    expect(state["customers"]).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
  });
  it("busca cidade no servidor, mantém o campo e ordena o universo remoto", async () => {
    const { transport, persist } = mount(Array.from({ length: 25 }, (_, i) => customer(i + 1)));
    await screen.findByText("Cliente 001");
    const input = screen.getByPlaceholderText("Filtrar…");
    fireEvent.change(input, { target: { value: "MARINGA" } });
    expect(input).toBeInTheDocument();
    await waitFor(() => expect(transport.mock.calls.at(-1)?.[0].query.search).toBe("MARINGA"));
    await screen.findByText("Cliente 019");
    expect(screen.queryByText("Cliente 002")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Razão social/ }));
    await waitFor(() => expect(transport.mock.calls.at(-1)?.[0].query.sort).toBe("name"));
    expect(persist).not.toHaveBeenCalled();
  });
  it("filtra cliente pelo código no seletor real e não consulta produtos", async () => {
    const { transport } = mount(Array.from({ length: 25 }, (_, i) => customer(i + 1)));
    await screen.findByText("Cliente 001");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Cliente" }));
    fireEvent.click(await screen.findByRole("option", { name: "Cliente 013 (13)" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() =>
      expect(transport.mock.calls.some(([body]) => body.query.filters?.customerCode === 13)).toBe(
        true,
      ),
    );
    await screen.findByText("Cliente 013");
    expect(screen.queryByText("Cliente 001")).not.toBeInTheDocument();
    expect(transport.mock.calls.every(([body]) => body.query.resource !== "products")).toBe(true);
  });
  it("filtra vendedor por ID técnico mesmo com rótulos idênticos", async () => {
    const { transport } = mount(Array.from({ length: 25 }, (_, i) => customer(i + 1)));
    await screen.findByText("Cliente 001");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Vendedor" }));
    const options = await screen.findAllByRole("option", { name: "Mesmo nome" });
    fireEvent.click(options[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() =>
      expect(transport.mock.calls.some(([body]) => body.query.filters?.sellerCode === 34)).toBe(
        true,
      ),
    );
    await screen.findByText("Cliente 001");
    expect(screen.queryByText("Cliente 002")).not.toBeInTheDocument();
  });
  it("mantém situação como código nativo e não usa bloqueio financeiro como inatividade", async () => {
    const { transport } = mount(Array.from({ length: 25 }, (_, i) => customer(i + 1)));
    await screen.findByText("Cliente 001");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Situação" }));
    const option = await screen.findByRole("option", { name: "N" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() =>
      expect(transport.mock.calls.some(([body]) => body.query.filters?.active === "N")).toBe(true),
    );
    await screen.findByText("Cliente 003");
    expect(screen.queryByText("Cliente 001")).not.toBeInTheDocument();
  });
  it("exporta todas as páginas filtradas, com as três colunas já existentes", async () => {
    const { transport, persist } = mount(Array.from({ length: 75 }, (_, i) => customer(i + 1)));
    const create = vi.fn((_blob: Blob | MediaSource) => "blob:relatorio");
    const Original = URL;
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
    const blob = create.mock.calls[0]![0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text.split("\r\n")).toHaveLength(76);
    expect(text).toContain("name;city;state");
    expect(text).toContain("Cliente 075");
    expect(text).not.toContain("sellerCode");
    expect(text).not.toContain("[object Object]");
    expect(transport.mock.calls.every(([body]) => body.query.limit <= 50)).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });
  it("não conserva a carteira antiga quando o servidor falha após nova busca", async () => {
    const { transport } = mount(Array.from({ length: 25 }, (_, i) => customer(i + 1)));
    await screen.findByText("Cliente 001");
    transport.mockRejectedValue(new Error("Consulta indisponível no teste"));
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "outro" } });
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("Cliente 001")).not.toBeInTheDocument();
  });
  it("seleciona cadastro manual sem enviá-lo como código ERP", async () => {
    const { transport, persist } = mount(
      [customer(1)],
      [{ id: "manual", name: "Loja manual", code: "M", city: "Cidade local", state: "PR" }],
    );
    await screen.findByText("Cliente 001");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Cliente" }));
    fireEvent.click(await screen.findByRole("option", { name: "Loja manual (M)" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await screen.findByText("Loja manual");
    expect(screen.queryByText("Cliente 001")).not.toBeInTheDocument();
    expect(
      transport.mock.calls.some(([body]) => body.query.filters?.customerCode !== undefined),
    ).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });
});
