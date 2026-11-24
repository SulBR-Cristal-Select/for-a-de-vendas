import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  opportunityReportRows,
  filterOpportunityRows,
  opportunityReportOwners,
} from "./opportunity-report";
import { createERPClient, type ERPRow } from "../lib/erp-online";
import SulApp, { createAppState } from "./SulApp";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  notify: vi.fn(),
}));
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const customers = [
  { id: "c1", name: "Mercado A", code: "11" },
  { id: "c2", name: "Mercado B", code: "22" },
];
const users = [
  { id: a, name: "Pessoa A" },
  { id: b, name: "Pessoa B" },
];
const opportunity = (n: number): ERPRow => ({
  id: `o${n}`,
  name: `Negócio ${String(n).padStart(3, "0")}`,
  customerId: n % 2 ? "c2" : "c1",
  sellerId: n % 2 ? b : a,
  seller: n % 2 ? "Pessoa B" : "Pessoa A",
  status: ["Aberta", "Ganha", "Perdida"][n % 3],
  stage: "Proposta",
  date: "2026-10-25",
  value: n + 0.25,
});
const source = (opportunities: ERPRow[] = []) => ({ opportunities, customers, users });
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

describe("Oportunidades locais, sem misturar pedidos ou inferir responsável", () => {
  it("preserva todas as situações e etapas declaradas, inclusive desconhecido", () => {
    const input = source([
      opportunity(0),
      opportunity(1),
      opportunity(2),
      { id: "legado", status: null, stage: null },
    ]);
    expect(opportunityReportRows(input).map((r) => r["status"])).toEqual([
      "Aberta",
      "Ganha",
      "Perdida",
      null,
    ]);
  });
  it("clona as linhas, mantém IDs e não modifica o estado do workspace", () => {
    const input = source([opportunity(0)]),
      before = structuredClone(input),
      rows = opportunityReportRows(input);
    expect(rows[0]).not.toBe(input.opportunities[0]);
    expect(rows[0]?.["id"]).toBe("o0");
    expect(input).toEqual(before);
  });
  it("resolve o nome do cliente somente pelo ID já visível", () => {
    const rows = opportunityReportRows(
      source([
        opportunity(0),
        {
          ...opportunity(1),
          customerId: "sankhya:customer:141",
          customerSnapshot: { name: "Não associar" },
          customer: "Mercado A",
        },
      ]),
    );
    expect(rows[0]?.["customer"]).toBe("Mercado A");
    expect(rows[1]?.["customer"]).toBeUndefined();
  });
  it("combina cliente, responsável e situação pela identidade exata", () => {
    const rows = opportunityReportRows(
      source(Array.from({ length: 30 }, (_, i) => opportunity(i))),
    );
    expect(
      filterOpportunityRows(rows, { customer: "c1", seller: a, status: "Ganha" }).map(
        (r) => r["id"],
      ),
    ).toEqual(["o4", "o10", "o16", "o22", "o28"]);
    expect(filterOpportunityRows(rows, { customer: "c1", seller: b })).toEqual([]);
    expect(filterOpportunityRows(rows, { seller: "Pessoa A" })).toEqual([]);
  });
  it("homônimos não se fundem, responsáveis desconhecidos não viram a pessoa logada", () => {
    const rows = opportunityReportRows(
      source([
        opportunity(0),
        opportunity(1),
        { id: "sem-id", seller: "Homônimo", status: "Aberta" },
      ]),
    );
    expect(
      opportunityReportOwners(rows, [
        { id: a, name: "Homônimo" },
        { id: b, name: "Homônimo" },
      ]),
    ).toEqual([
      { value: a, label: "Homônimo" },
      { value: b, label: "Homônimo" },
    ]);
    expect(filterOpportunityRows(rows, { seller: a })).toHaveLength(1);
    expect(filterOpportunityRows(rows, { seller: "Homônimo" })).toEqual([]);
  });
  it("mantém o código de responsável ausente da lista de perfis sem adivinhar nome ou acesso", () => {
    const rows = opportunityReportRows(source([{ ...opportunity(0), sellerId: "owner-legado" }]));
    expect(opportunityReportOwners(rows, users)).toEqual([
      { value: "owner-legado", label: "owner-legado" },
    ]);
  });
  it("usa somente a data de abertura declarada e limites inclusivos", () => {
    const rows = opportunityReportRows(
      source([
        { ...opportunity(0), date: "2026-10-01" },
        opportunity(1),
        { ...opportunity(2), date: "2026-10-26", wonAt: "2026-10-25" },
      ]),
    );
    expect(
      filterOpportunityRows(rows, { from: "2026-10-01", to: "2026-10-25" }).map((r) => r["id"]),
    ).toEqual(["o0", "o1"]);
  });
  it.each([undefined, null, "", "2026-02-29", "25/10/2026", "2026-10-25T12:00:00Z"])(
    "não substitui abertura ausente/inválida por criação ou ganho: %s",
    (date) => {
      const rows = opportunityReportRows(
        source([{ ...opportunity(0), date, createdAt: "2026-10-25", wonAt: "2026-10-25" }]),
      );
      expect(filterOpportunityRows(rows, {})).toHaveLength(1);
      expect(filterOpportunityRows(rows, { from: "2026-10-01" })).toEqual([]);
    },
  );
  it("valor zero observado e valor ausente não são reescritos; ganha não vira pedido", () => {
    const input = source([
      { ...opportunity(0), value: 0 },
      { ...opportunity(1), value: null },
    ]);
    const rows = opportunityReportRows(input);
    expect(rows.map((r) => r["value"])).toEqual([0, null]);
    expect(rows[1]?.["status"]).toBe("Ganha");
    expect(input).not.toHaveProperty("orders");
  });
});

function mount(rows: ERPRow[] = Array.from({ length: 30 }, (_, i) => opportunity(i))) {
  location.hash = "#/relatorios/funil";
  const state = createAppState({
      ...source(rows),
      orders: [
        {
          id: "pedido",
          seller: "NÃO USAR PEDIDOS",
          status: "Concluído",
          type: "Venda",
          total: 999999,
        },
      ],
      activities: [{ id: "atividade", name: "NÃO USAR ATIVIDADE", status: "Realizada" }],
      company: { userId: a, user: "Usuário sem oportunidade", role: "Administrador" },
    }),
    before = structuredClone(state),
    persist = vi.fn(async (next) => next),
    transport = vi.fn();
  render(
    <SulApp
      initialState={state}
      persist={persist}
      online={createERPClient(transport)}
      onSignOut={async () => {}}
    />,
  );
  return { state, before, persist, transport };
}
function downloads() {
  const create = vi.fn((_blob: Blob | MediaSource) => "blob:funil"),
    Original = URL;
  vi.stubGlobal(
    "URL",
    class extends Original {
      static override createObjectURL = create;
      static override revokeObjectURL = vi.fn();
    },
  );
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
async function choose(label: string, option: string) {
  fireEvent.click(await screen.findByRole("combobox", { name: label }));
  const item = await screen.findByRole("option", { name: option });
  if (label === "Situação") fireEvent.pointerDown(item, { pointerType: "mouse" });
  fireEvent.click(item);
}

describe("Relatório Funil com os mesmos sete campos e controles", () => {
  it("lê oportunidades, não pedidos/atividades, sem ERP ou persistência", async () => {
    const f = mount();
    expect(screen.getByText("Negócio 000")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((x) => x.textContent)).toEqual([
      "Oportunidade",
      "Cliente",
      "Valor",
      "Situação",
      "Vendedor",
      "Etapa",
      "Abertura",
    ]);
    expect(screen.queryByText("NÃO USAR PEDIDOS")).not.toBeInTheDocument();
    expect(screen.queryByText("NÃO USAR ATIVIDADE")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeInTheDocument(),
    );
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.state).toEqual(f.before);
  });
  it("aplica os três filtros existentes e exporta somente o recorte por IDs", async () => {
    const f = mount(),
      create = downloads();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    await choose("Cliente", "Mercado A (11)");
    await choose("Vendedor", "Pessoa A");
    await choose("Situação", "Ganha");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await screen.findByText("Negócio 004");
    expect(screen.queryByText("Negócio 000")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    const text = await csvText(create);
    expect(text.split("\r\n")).toHaveLength(6);
    expect(text).toContain("Negócio 028");
    expect(text).not.toContain("Negócio 001");
    expect(f.state).toEqual(f.before);
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("as opções de responsável e situação vêm das oportunidades, não dos pedidos ou usuário logado", async () => {
    const f = mount();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "Vendedor" }));
    expect(await screen.findByRole("option", { name: "Pessoa A" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "NÃO USAR PEDIDOS" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Usuário sem oportunidade" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Pessoa A" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Situação" }));
    expect(await screen.findByRole("option", { name: "Aberta" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Concluído" })).not.toBeInTheDocument();
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("busca o cliente por nome resolvido por ID e exporta as15 linhas ordenadas, além da página10", async () => {
    const f = mount(),
      create = downloads();
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "MERCADO B" } });
    expect(screen.queryByText("Negócio 000")).not.toBeInTheDocument();
    const sort = screen.getByRole("button", { name: /Ordenar por Oportunidade/ });
    fireEvent.click(sort);
    fireEvent.click(sort);
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    const text = await csvText(create),
      lines = text.split("\r\n");
    expect(lines).toHaveLength(16);
    expect(lines[0]).toBe("name;customer;value;status;seller;stage;date");
    expect(lines[1]).toContain("Negócio 029");
    expect(lines.at(-1)).toContain("Negócio 001");
    expect(text).not.toContain("undefined");
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("limpa os filtros e restaura a coleção visível sem alterar o workspace", async () => {
    const f = mount();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    await choose("Cliente", "Mercado B (22)");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await screen.findByText("Negócio 001");
    expect(screen.queryByText("Negócio 000")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await screen.findByText("Negócio 000");
    expect(f.state).toEqual(f.before);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("vazio local não vira venda, financeiro ou consulta ERP; CSV mantém somente cabeçalhos", async () => {
    const f = mount([]),
      create = downloads();
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    const text = await csvText(create);
    expect(text.split("\r\n")).toHaveLength(1);
    expect(text).toBe("name;customer;value;status;seller;stage;date");
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
  });
});
