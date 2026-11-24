import React, { useRef } from "react";
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
import { afterEach, describe, expect, it, vi } from "vitest";
import { createERPClient, erpClient, type ERPRow, type ERPWindowQuery } from "../lib/erp-online";
import { compareERP, foldERPText } from "../lib/erp-order";
import {
  allCategoryLabels,
  exportERPRows,
  useERPRecord,
  useERPTable,
  type ERPClient,
  type ERPDescriptor,
  type ERPQueryMetadata,
} from "./erp-hooks";
import SulApp, { createAppState, createMutationQueue } from "./SulApp";

vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  notify: vi.fn(),
}));
import { notify } from "@g4ai/ds";
import WorkspaceRoot from "./WorkspaceRoot";
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  load: vi.fn(),
}));
vi.mock("../lib/supabase", () => ({
  supabase: { auth: { getSession: auth.getSession, onAuthStateChange: auth.onAuthStateChange } },
}));
vi.mock("../lib/workspace", () => ({
  loadWorkspace: auth.load,
  saveWorkspace: vi.fn(),
  WorkspaceError: class extends Error {},
}));
const readAt = "2026-10-23T19:37:00.000Z";
const observation = { source: "sankhya", readOnly: true, readAt } as const;
const customer = (id: number, name = `Cliente ${String(id).padStart(3, "0")}`): ERPRow => ({
  id: `sankhya:customer:${id}`,
  code: String(id),
  name,
  fantasy: name,
  source: "observado",
  readOnly: true,
  erp: { source: "sankhya", readOnly: true, partnerCode: id },
});
const product = (id: number, name = `Produto ${id}`): ERPRow => ({
  id: `sankhya:product:${id}`,
  code: String(id),
  name,
  unit: "CX",
  category: "Categoria exata",
  price: null,
  source: "observado",
  readOnly: true,
  erp: { source: "sankhya", readOnly: true, productCode: id },
});
function fakeERP(rows: ERPRow[]) {
  const transport = vi.fn(
    async ({ operation, query }: import("../test/erp-fixture-types").FixtureRequest) => {
      if (operation === "record")
        return {
          error: null,
          data: { ...observation, record: rows.find((row) => row["id"] === query.id) || null },
        };
      if (operation === "facets") {
        const facets = Array.from({ length: 65 }, (_, i) => ({
          code: i + 1,
          name: i === 64 ? "Categoria distante" : `Categoria ${i + 1}`,
          count: 1,
        }));
        const offset = (query.page - 1) * query.pageSize;
        return {
          error: null,
          data: {
            ...observation,
            items: facets.slice(offset, offset + query.pageSize),
            page: query.page,
            pageSize: query.pageSize,
            total: facets.length,
            totalWithoutSearch: facets.length,
            hasMore: offset + query.pageSize < facets.length,
          },
        };
      }
      let filtered = rows.filter(
        (row) => !query.filters?.categoryName || row["category"] === query.filters.categoryName,
      );
      const totalWithoutSearch = filtered.length;
      if (query.search)
        filtered = filtered.filter((row) =>
          foldERPText(
            Object.values(row)
              .filter((value) => typeof value !== "object")
              .join(" "),
          ).includes(foldERPText(query.search)),
        );
      filtered.sort(
        compareERP(
          (query.sort || "code") as import("../lib/erp-order").ERPSortKey,
          query.direction,
        ),
      );
      return {
        error: null,
        data: {
          ...observation,
          items: filtered.slice(query.offset, query.offset + query.limit),
          offset: query.offset,
          total: filtered.length,
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
type TableProps = {
  search: string;
  sort: { key: string; dir: "asc" | "desc" } | null;
  remote?: ERPDescriptor;
};
function tableHook(descriptor: ERPDescriptor, rows: ERPRow[] = []) {
  const initialProps: TableProps = { search: "", sort: null };
  return renderHook(
    ({ search, sort, remote = descriptor }: TableProps) => {
      const metadata = useRef<Partial<Record<"customers" | "products", ERPQueryMetadata>>>({});
      return { ...useERPTable(remote, rows, search, sort, metadata), metadata };
    },
    { initialProps },
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  location.hash = "";
});

describe("Paginação transitória de cadastros online", () => {
  it("busca cidade sem acento também nos cadastros manuais, sem mudar o filtro para só nome", async () => {
    const { client } = fakeERP([{ ...customer(1, "Loja ERP"), city: "SÃO PAULO" }]);
    const hook = tableHook({ client, resource: "customers" }, [
      { id: "manual", name: "Loja manual", city: "SÃO PAULO" },
    ]);
    await waitFor(() => expect(hook.result.current.total).toBe(2));
    hook.rerender({ search: "SAO PAULO", sort: null });
    await waitFor(() => expect(hook.result.current.total).toBe(2));
    expect(hook.result.current.rows).toHaveLength(2);
  });
  it("usa contagens completas e páginas 10/20/50 sem inserir ERP no estado manual", async () => {
    const { client, transport } = fakeERP(Array.from({ length: 75 }, (_, i) => customer(i + 1)));
    const locals = [{ id: "manual", code: "M", name: "Manual", source: "registrado" }];
    const original = structuredClone(locals);
    const hook = tableHook({ client, resource: "customers" }, locals);
    expect(hook.result.current.total).toBeUndefined();
    await waitFor(() => expect(hook.result.current.total).toBe(76));
    expect(hook.result.current.rows).toHaveLength(10);
    expect(hook.result.current.rows[0]?.["id"]).toBe("manual");
    act(() => hook.result.current.setPage(3));
    expect(hook.result.current.rows).toEqual([]);
    await waitFor(() => expect(hook.result.current.rows[0]?.["code"]).toBe("20"));
    act(() => hook.result.current.setPageSize(20));
    await waitFor(() => expect(hook.result.current.rows).toHaveLength(20));
    act(() => hook.result.current.setPageSize(50));
    await waitFor(() => expect(hook.result.current.rows).toHaveLength(50));
    expect(locals).toEqual(original);
    expect(
      transport.mock.calls.every(([body]) => body.operation !== "window" || body.query.limit <= 50),
    ).toBe(true);
  });
  it("ordena manuais e ERP juntos pelo comparador do servidor e reseta página", async () => {
    const { client } = fakeERP(Array.from({ length: 25 }, (_, i) => customer(i + 1)));
    const hook = tableHook({ client, resource: "customers" }, [
      { id: "manual", code: "M", name: "Cliente 015a" },
    ]);
    await waitFor(() => expect(hook.result.current.total).toBe(26));
    act(() => hook.result.current.setPage(3));
    await waitFor(() => expect(hook.result.current.page).toBe(3));
    hook.rerender({ search: "", sort: { key: "name", dir: "asc" } });
    expect(hook.result.current.page).toBe(1);
    await waitFor(() => expect(hook.result.current.rows[0]?.["name"]).toBe("Cliente 001"));
    act(() => hook.result.current.setPage(2));
    await waitFor(() =>
      expect(hook.result.current.rows.some((row) => row["id"] === "manual")).toBe(true),
    );
    const expected = [
      customer(11),
      customer(12),
      customer(13),
      customer(14),
      customer(15),
      { id: "manual", code: "M", name: "Cliente 015a" },
      customer(16),
      customer(17),
      customer(18),
      customer(19),
    ];
    expect(hook.result.current.rows.map((row) => row["id"])).toEqual(
      expected.map((row) => row["id"]),
    );
  });
  it("aplica debounce, filtro exato de categoria e descarta linhas antigas no erro", async () => {
    const { client, transport } = fakeERP(Array.from({ length: 23 }, (_, i) => product(i + 1)));
    const descriptor: ERPDescriptor = {
      client,
      resource: "products",
      categoryName: "Categoria exata",
    };
    const hook = tableHook(descriptor);
    await waitFor(() => expect(hook.result.current.total).toBe(23));
    act(() => hook.result.current.setPage(2));
    await waitFor(() => expect(hook.result.current.rows[0]?.["code"]).toBe("11"));
    hook.rerender({ search: "Produto 21", sort: null, remote: descriptor });
    expect(hook.result.current.page).toBe(1);
    expect(hook.result.current.rows).toEqual([]);
    expect(hook.result.current.totalWithoutSearch).toBe(23);
    await waitFor(() => expect(hook.result.current.total).toBe(1));
    expect(transport.mock.calls.at(-1)?.[0].query.filters).toEqual({
      categoryName: "Categoria exata",
    });
    transport.mockRejectedValue(new Error("Falha controlada"));
    hook.rerender({ search: "Produto 22", sort: null, remote: descriptor });
    await waitFor(() => expect(hook.result.current.error).toBeDefined());
    expect(hook.result.current.rows).toEqual([]);
    expect(hook.result.current.total).toBeUndefined();
    expect(hook.result.current.totalWithoutSearch).toBeUndefined();
    expect(hook.result.current.error).not.toHaveProperty("onRetry");
  });
  it("não aceita respostas de uma consulta anterior nem depois da desmontagem", async () => {
    let release!: (value: import("../lib/erp-online").ERPWindow<unknown>) => void;
    const first = new Promise<import("../lib/erp-online").ERPWindow<unknown>>((resolve) => {
      release = resolve;
    });
    const old = fakeERP([]).client;
    vi.spyOn(old, "window").mockImplementation(() => first);
    const fresh = fakeERP([customer(99, "Atual")]).client;
    const hook = tableHook({ client: old, resource: "customers" });
    hook.rerender({ search: "", sort: null, remote: { client: fresh, resource: "customers" } });
    await waitFor(() => expect(hook.result.current.rows[0]?.["name"]).toBe("Atual"));
    await act(async () => {
      release({
        ...observation,
        offset: 0,
        items: [customer(1, "Antigo")],
        total: 1,
        totalWithoutSearch: 1,
      });
      await first;
    });
    expect(hook.result.current.rows[0]?.["name"]).toBe("Atual");
    const exportRows = hook.result.current.metadata.current.customers!.exportRows;
    hook.unmount();
    await expect(exportRows()).rejects.toThrow("Consulta cancelada");
  });
});

describe("Facetas e exportação sem carteira em cache", () => {
  it("obtém todas as categorias por facetas paginadas, não por produtos", async () => {
    const { client, transport } = fakeERP([]);
    const names = await allCategoryLabels(client);
    expect(names).toHaveLength(65);
    expect(names).toContain("Categoria distante");
    expect(transport.mock.calls.map(([body]) => body.operation)).toEqual(["facets", "facets"]);
  });
  it("exporta o universo filtrado e ordenado inteiro, não somente a página", async () => {
    const { client, transport } = fakeERP(Array.from({ length: 75 }, (_, i) => customer(i + 1)));
    const hook = tableHook({ client, resource: "customers" }, [
      { id: "manual", code: "M", name: "Manual" },
    ]);
    await waitFor(() => expect(hook.result.current.rows).toHaveLength(10));
    const result = await hook.result.current.metadata.current.customers!.exportRows();
    expect(result).toHaveLength(76);
    expect(result[0]?.["id"]).toBe("manual");
    expect(result.at(-1)?.["code"]).toBe("75");
    expect(
      transport.mock.calls
        .filter(([body]) => body.operation === "window")
        .every(([body]) => body.query.limit <= 50),
    ).toBe(true);
  });
  it("recusa exportação parcial se a contagem mudar ou houver falha", async () => {
    const { client } = fakeERP(Array.from({ length: 65 }, (_, i) => customer(i + 1)));
    const window = client.window.bind(client);
    vi.spyOn(client, "window").mockImplementation(async (query: ERPWindowQuery) => {
      const result = await window(query);
      return query.offset > 0 ? { ...result, total: 66 } : result;
    });
    await expect(
      exportERPRows({ client, resource: "customers" }, { resource: "customers" }, [], () => {}),
    ).rejects.toThrow("Resposta ERP inválida");
    vi.mocked(client.window).mockRejectedValue(new Error("Falha controlada"));
    await expect(
      exportERPRows({ client, resource: "customers" }, { resource: "customers" }, [], () => {}),
    ).rejects.toThrow("Falha controlada");
  });
  it("cancela CSV iniciado se o filtro atual mudar", async () => {
    const { client } = fakeERP([customer(1)]);
    const descriptor: ERPDescriptor = { client, resource: "customers" };
    const hook = tableHook(descriptor);
    await waitFor(() => expect(hook.result.current.total).toBe(1));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const window = client.window.bind(client);
    vi.spyOn(client, "window").mockImplementation(async (q) => {
      await gate;
      return window(q);
    });
    const pending = hook.result.current.metadata.current.customers!.exportRows();
    const rejected = expect(pending).rejects.toThrow("Consulta cancelada");
    hook.rerender({ search: "outro", sort: null, remote: descriptor });
    release();
    await rejected;
  });
});

describe("Ficha online separada da persistência manual", () => {
  it("consulta por ID em cada montagem/reabertura e não reutiliza ficha anterior", async () => {
    const { client, transport } = fakeERP([product(1), product(2)]);
    const first = renderHook(({ id }) => useERPRecord(client, "products", id), {
      initialProps: { id: "sankhya:product:1" },
    });
    expect(first.result.current.record).toBeUndefined();
    await waitFor(() => expect(first.result.current.record?.["code"]).toBe("1"));
    first.rerender({ id: "sankhya:product:2" });
    expect(first.result.current.record).toBeUndefined();
    await waitFor(() => expect(first.result.current.record?.["code"]).toBe("2"));
    first.unmount();
    const reopened = renderHook(() => useERPRecord(client, "products", "sankhya:product:1"));
    expect(reopened.result.current.record).toBeUndefined();
    await waitFor(() => expect(reopened.result.current.record?.["code"]).toBe("1"));
    expect(transport.mock.calls.filter(([body]) => body.operation === "record")).toHaveLength(3);
  });
  it("rejeita novas linhas transitórias/readOnly e referências ERP fora do canônico antes de persistir", async () => {
    const state = { current: createAppState() },
      persist = vi.fn(async (next) => next);
    const queue = createMutationQueue(state, persist, vi.fn());
    await expect(
      queue((db) => {
        db["customers"].push({ ...customer(1), id: "sankhya:customer:1" });
      }),
    ).rejects.toThrow("somente para consulta");
    await expect(
      queue((db) => {
        db["products"].push({ id: "transitorio", readOnly: true });
      }),
    ).rejects.toThrow("somente para consulta");
    await expect(
      queue((db) => {
        db["orders"].push({ id: "manual", customerId: "sankhya:customer:1" });
      }),
    ).rejects.toThrow("somente para consulta");
    expect(persist).not.toHaveBeenCalled();
    await queue((db) => {
      db["customers"].push({ id: "manual", name: "Manual" });
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(state.current["customers"]).toEqual([
      { id: "manual", name: "Manual", source: "registrado" },
    ]);
  });
  it("monta os campos reais do produto somente depois da resposta e recusa salvar no RPC manual", async () => {
    location.hash = "#/produtos/sankhya:product:7";
    const { client } = fakeERP([product(7, "Descrição da origem")]);
    const persist = vi.fn(async (next) => next);
    render(
      <SulApp
        initialState={createAppState()}
        online={client}
        persist={persist}
        onSignOut={async () => {}}
      />,
    );
    expect(screen.queryByDisplayValue("Descrição da origem")).not.toBeInTheDocument();
    await screen.findByDisplayValue("Descrição da origem");
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/ }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("Cadastro ERP disponível somente para consulta."),
    );
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("Identidade da sessão na raiz", () => {
  it("invalida por usuário/nulo em sessão inicial, troca e desmontagem sem usar tokens", async () => {
    let changed!: (event: string, next: { user: { id: string } } | null) => void;
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "auth-a" } } },
      error: null,
    });
    auth.onAuthStateChange.mockImplementation((callback) => {
      changed = callback;
      return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    });
    auth.load.mockImplementation(() => new Promise(() => {}));
    const identity = vi.spyOn(erpClient, "setIdentity");
    const root = render(<WorkspaceRoot />);
    await waitFor(() => expect(identity).toHaveBeenCalledWith("auth-a"));
    act(() => changed("SIGNED_IN", { user: { id: "auth-b" } }));
    expect(identity).toHaveBeenLastCalledWith("auth-b");
    act(() => changed("SIGNED_OUT", null));
    expect(identity).toHaveBeenLastCalledWith(null);
    root.unmount();
    expect(auth.unsubscribe).toHaveBeenCalled();
    expect(identity).toHaveBeenLastCalledWith(null);
  });
  it("não restaura sessão inicial atrasada depois de um evento Auth mais recente", async () => {
    let release!: (value: unknown) => void,
      changed!: (event: string, next: { user: { id: string } } | null) => void;
    auth.getSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    auth.onAuthStateChange.mockImplementation((callback) => {
      changed = callback;
      return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    });
    auth.load.mockImplementation(() => new Promise(() => {}));
    const identity = vi.spyOn(erpClient, "setIdentity");
    render(<WorkspaceRoot />);
    act(() => changed("SIGNED_IN", { user: { id: "auth-atual" } }));
    await act(async () => {
      release({ data: { session: { user: { id: "auth-antigo" } } }, error: null });
    });
    expect(identity).toHaveBeenLastCalledWith("auth-atual");
    expect(identity).not.toHaveBeenCalledWith("auth-antigo");
  });
});

describe("Integração dos componentes existentes sem estruturas visuais novas", () => {
  it("mantém a busca montada durante debounce e solicita ordenação ao universo remoto", async () => {
    location.hash = "#/clientes";
    const { client, transport } = fakeERP(Array.from({ length: 25 }, (_, i) => customer(i + 1)));
    const persist = vi.fn(async (next) => next);
    render(
      <SulApp
        initialState={createAppState()}
        online={client}
        persist={persist}
        onSignOut={async () => {}}
      />,
    );
    await screen.findByText("Cliente 001", { selector: "a" });
    const input = screen.getByPlaceholderText("Filtrar…");
    input.focus();
    fireEvent.change(input, { target: { value: "Cliente 02" } });
    expect(input).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
    await waitFor(() => expect(transport.mock.calls.at(-1)?.[0].query.search).toBe("Cliente 02"));
    await screen.findByText("Cliente 020", { selector: "a" });
    fireEvent.click(screen.getByRole("button", { name: /Razão social/ }));
    await waitFor(() => expect(transport.mock.calls.at(-1)?.[0].query.sort).toBe("name"));
    expect(transport.mock.calls.at(-1)?.[0].query.direction).toBe("asc");
    expect(persist).not.toHaveBeenCalled();
  });
  it("mostra os indicadores históricos e limite disponível como Não extraído na ficha ERP", async () => {
    location.hash = "#/clientes/sankhya:customer:7";
    const { client } = fakeERP([{ ...customer(7), credit: 800 }]);
    render(
      <SulApp
        initialState={createAppState({
          orders: [
            {
              id: "local",
              customerId: "sankhya:customer:7",
              type: "Venda",
              status: "Concluído",
              total: 9000,
            },
          ],
        })}
        online={client}
        persist={vi.fn()}
        onSignOut={async () => {}}
      />,
    );
    await screen.findByText("Compras no arquivo");
    for (const label of ["Compras no arquivo", "Pedidos de venda", "Ticket médio"]) {
      const node = screen.getByText(label).closest(".surface-card") as HTMLElement;
      expect(within(node).getByText("Não extraído")).toBeInTheDocument();
    }
    expect(screen.queryByText(/9.000/)).not.toBeInTheDocument();
    const available = screen.getByText("Limite disponível").parentElement!;
    expect(within(available).getByText("Não extraído")).toBeInTheDocument();
  });
  it("recusa excluir produto remoto sem emitir sucesso nem persistir", async () => {
    location.hash = "#/produtos/sankhya:product:7";
    const { client } = fakeERP([product(7)]);
    const persist = vi.fn();
    render(
      <SulApp
        initialState={createAppState()}
        online={client}
        persist={persist}
        onSignOut={async () => {}}
      />,
    );
    await screen.findByDisplayValue("Produto 7");
    fireEvent.click(screen.getByRole("button", { name: "Opções do produto" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Excluir produto" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar no sistema" }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("Cadastro ERP disponível somente para consulta."),
    );
    expect(notify).not.toHaveBeenCalledWith("Alteração confirmada");
    expect(persist).not.toHaveBeenCalled();
    expect(location.hash).toBe("#/produtos/sankhya:product:7");
  });
});

describe("CSV e categoria pelos controles originais", () => {
  function downloadSpy() {
    const create = vi.fn((_blob: Blob | MediaSource) => "blob:teste-csv");
    const OriginalURL = URL;
    vi.stubGlobal(
      "URL",
      class extends OriginalURL {
        static override createObjectURL = create;
        static override revokeObjectURL = vi.fn();
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    return { create, click };
  }
  it("baixa CSV com as mesmas colunas/formato e todas as páginas da busca atual", async () => {
    location.hash = "#/clientes";
    const { client } = fakeERP(Array.from({ length: 75 }, (_, i) => customer(i + 1)));
    const { create, click } = downloadSpy();
    render(
      <SulApp
        initialState={createAppState()}
        online={client}
        persist={vi.fn()}
        onSignOut={async () => {}}
      />,
    );
    await screen.findByText("Cliente 001", { selector: "a" });
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(click).toHaveBeenCalledTimes(1);
    const blob = create.mock.calls[0]?.[0] as unknown as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text.split("\r\n")).toHaveLength(76);
    expect(text.replace(/^\uFEFF/, "").split("\r\n")[0]).toBe(
      "code;name;fantasy;cnpj;city;state;seller;source",
    );
    expect(text).toContain('"75";"Cliente 075"');
    expect(notify).toHaveBeenCalledWith("Recorte exportado em CSV");
  });
  it("não cria arquivo parcial nem informa sucesso quando a exportação falha", async () => {
    location.hash = "#/clientes";
    const { client } = fakeERP([customer(1)]);
    const { create, click } = downloadSpy();
    render(
      <SulApp
        initialState={createAppState()}
        online={client}
        persist={vi.fn()}
        onSignOut={async () => {}}
      />,
    );
    await screen.findByText("Cliente 001", { selector: "a" });
    vi.spyOn(client, "window").mockRejectedValue(new Error("Falha controlada no CSV"));
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Falha controlada no CSV"));
    expect(create).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith("Recorte exportado em CSV");
  });
  it("preserva o seletor e envia categoryName exato obtido de faceta distante", async () => {
    location.hash = "#/produtos";
    const { client, transport } = fakeERP([product(1)]);
    render(
      <SulApp
        initialState={createAppState({
          products: [{ id: "manual", code: "M", name: "Manual", category: "Categoria manual" }],
        })}
        online={client}
        persist={vi.fn()}
        onSignOut={async () => {}}
      />,
    );
    await screen.findByText("Produto 1", { selector: "a" });
    await waitFor(() =>
      expect(transport.mock.calls.filter(([body]) => body.operation === "facets")).toHaveLength(2),
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Categoria" }));
    expect(await screen.findByRole("option", { name: "Categoria manual" })).toBeInTheDocument();
    const option = await screen.findByRole("option", { name: "Categoria distante" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    await waitFor(() =>
      expect(
        transport.mock.calls.some(
          ([body]) =>
            body.operation === "window" &&
            body.query.filters?.categoryName === "Categoria distante",
        ),
      ).toBe(true),
    );
    expect(screen.getByRole("combobox", { name: "Categoria" })).toHaveTextContent(
      "Categoria distante",
    );
  });
});

describe("Defesas contra mutação remota fora da ficha", () => {
  it("não confunde texto livre manual com referência de entidade ERP", async () => {
    const state = { current: createAppState() },
      persist = vi.fn(async (next: Record<string, unknown>) => next);
    const queue = createMutationQueue(state, persist, vi.fn());
    await queue((next) => {
      next["company"].name = "sankhya:customer:7";
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(state.current["company"].name).toBe("sankhya:customer:7");
  });
  it("impede exclusão ou remarcação de linha ERP já existente no canônico", async () => {
    const before = createAppState({ customers: [customer(7)] }),
      state = { current: before },
      persist = vi.fn();
    const queue = createMutationQueue(state, persist, vi.fn());
    await expect(
      queue((next) => {
        next["customers"] = [];
      }),
    ).rejects.toThrow("somente para consulta");
    await expect(
      queue((next) => {
        next["customers"][0]!.source = "registrado";
      }),
    ).rejects.toThrow("somente para consulta");
    expect(persist).not.toHaveBeenCalled();
    expect(state.current).toBe(before);
  });
  it("recusa vínculo local vindo da ficha ERP antes de enviar RPC ou informar sucesso", async () => {
    location.hash = "#/clientes/vinculos?cliente=sankhya:customer:7";
    const persist = vi.fn();
    render(<SulApp initialState={createAppState()} persist={persist} onSignOut={async () => {}} />);
    const value = screen.getByRole("combobox", { name: "Valor" });
    fireEvent.click(value);
    const option = await screen.findByRole("option", { name: "BAFFA" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar vínculo local" }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("Cadastro ERP disponível somente para consulta."),
    );
    expect(persist).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith("Vínculos alterados somente no protótipo");
  });
});
