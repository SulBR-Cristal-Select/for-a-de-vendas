import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Combobox } from "@g4ai/ds";
import {
  createERPClient,
  type ERPRow,
  type ERPTransport,
  type ERPWindowQuery,
  type ERPRecordQuery,
} from "../lib/erp-online";
import { useERPOrderLookups } from "./erp-order-lookups";

type CorpoTeste = Parameters<ERPTransport>[0] & { query: ERPWindowQuery & ERPRecordQuery };
type RespostaTeste = {
  error: null;
  data: {
    source: string;
    readOnly: boolean;
    readAt: string;
    record?: ERPRow | null;
    items?: ERPRow[];
    offset?: number;
    total?: number;
    totalWithoutSearch?: number;
  };
};

const observacao = { source: "sankhya", readOnly: true, readAt: "2026-10-23T22:35:00.000Z" };
const singular = { customers: "customer", products: "product", sellers: "seller" } as const;
const linha = (resource: keyof typeof singular, numero: number): ERPRow => ({
  id: `sankhya:${singular[resource]}:${numero}`,
  name: `Nome ${String(numero).padStart(3, "0")}`,
  source: "observado",
  readOnly: true,
  erp: { source: "sankhya" },
});
function preparar() {
  const transporte = vi.fn(async ({ operation, query }: CorpoTeste): Promise<RespostaTeste> => {
    if (operation === "record") {
      const numero = Number(String(query.id).split(":").at(-1));
      return { error: null, data: { ...observacao, record: linha(query.resource, numero) } };
    }
    let rows = Array.from({ length: 125 }, (_, indice) => linha(query.resource, indice + 1));
    if (query.search) rows = rows.filter((row) => String(row["name"]).includes(query.search!));
    return {
      error: null,
      data: {
        ...observacao,
        items: rows.slice(query.offset, query.offset + query.limit),
        offset: query.offset,
        total: rows.length,
        totalWithoutSearch: 125,
      },
    };
  });
  return { client: createERPClient((corpo) => transporte(corpo as CorpoTeste)), transporte };
}
function campo(rotulo = "Cliente") {
  const popup = document.createElement("div");
  popup.setAttribute("aria-label", rotulo);
  const input = document.createElement("input");
  input.setAttribute("aria-label", `Buscar em ${rotulo.toLocaleLowerCase("pt-BR")}`);
  const lista = document.createElement("div");
  lista.setAttribute("role", "listbox");
  Object.defineProperties(lista, { clientHeight: { value: 100 }, scrollHeight: { value: 400 } });
  popup.append(input, lista);
  document.body.append(popup);
  return { popup, input, lista };
}
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Consultas transitórias dos Combobox de pedido", () => {
  it("não consulta nem falha sem cliente ERP", () => {
    const { result } = renderHook(() => useERPOrderLookups(undefined, "", []));
    expect(result.current.customers).toEqual([]);
    expect(result.current.products).toEqual([]);
    expect(result.current.sellers).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
  it("consulta três janelas de 50 uma por vez, sem persistência", async () => {
    const { client, transporte } = preparar();
    const gravar = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useERPOrderLookups(client, "", []));
    expect(transporte).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(transporte).toHaveBeenCalledTimes(3);
    expect(result.current.customers).toHaveLength(50);
    expect(result.current.products).toHaveLength(50);
    expect(result.current.sellers).toHaveLength(50);
    for (const [corpo] of transporte.mock.calls)
      expect(corpo.query).toMatchObject({ offset: 0, limit: 50, sort: "name", direction: "asc" });
    expect(gravar).not.toHaveBeenCalled();
  });
  it("busca fora da primeira página com debounce, sem aceitar entradas de outros campos", async () => {
    const { client, transporte } = preparar();
    const { result } = renderHook(() => useERPOrderLookups(client, "", []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { input } = campo();
    fireEvent.input(input, { target: { value: "124" } });
    expect(result.current.customers).toEqual([]);
    await waitFor(() => expect(result.current.customers[0]?.["id"]).toBe("sankhya:customer:124"));
    expect(transporte.mock.calls.at(-1)?.[0].query).toMatchObject({
      search: "124",
      offset: 0,
      limit: 50,
    });
    const estranho = campo("Outro");
    fireEvent.input(estranho.input, { target: { value: "ignorar" } });
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(transporte).toHaveBeenCalledTimes(4);
  });
  it("anexa só ao chegar ao fim do listbox correspondente e reinicia o offset ao buscar", async () => {
    const { client, transporte } = preparar();
    const { result } = renderHook(() => useERPOrderLookups(client, "", []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { input, lista } = campo();
    fireEvent.scroll(lista);
    expect(transporte).toHaveBeenCalledTimes(3);
    lista.scrollTop = 300;
    fireEvent.scroll(lista);
    fireEvent.scroll(lista);
    await waitFor(() => expect(result.current.customers).toHaveLength(100));
    expect(transporte).toHaveBeenCalledTimes(4);
    expect(transporte.mock.calls.at(-1)?.[0].query.offset).toBe(50);
    fireEvent.input(input, { target: { value: "125" } });
    await waitFor(() => expect(result.current.customers).toHaveLength(1));
    expect(transporte.mock.calls.at(-1)?.[0].query.offset).toBe(0);
  });
  it("ignora respostas atrasadas e limpa a consulta quando ocorre erro", async () => {
    const { client, transporte } = preparar();
    const { result } = renderHook(() => useERPOrderLookups(client, "", []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let concluir!: (resultado: RespostaTeste) => void;
    transporte.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          concluir = resolve;
        }),
    );
    const { input } = campo();
    fireEvent.input(input, { target: { value: "atrasada" } });
    await waitFor(() => expect(concluir).toBeTypeOf("function"));
    fireEvent.input(input, { target: { value: "124" } });
    expect(result.current.customers).toEqual([]);
    await act(async () =>
      concluir({
        error: null,
        data: { ...observacao, items: [], offset: 0, total: 0, totalWithoutSearch: 125 },
      }),
    );
    await waitFor(() => expect(result.current.customers[0]?.["id"]).toBe("sankhya:customer:124"));
    transporte.mockRejectedValueOnce(new Error("Falha controlada"));
    fireEvent.input(input, { target: { value: "falha" } });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.customers).toEqual([]);
    expect(result.current.totals["customers"]).toBeUndefined();
  });
  it("retém somente cliente/carrinho selecionados via record sem mudar DTO e descarta os removidos", async () => {
    const { client, transporte } = preparar();
    const { result, rerender } = renderHook(
      ({ cliente, produtos }) => useERPOrderLookups(client, cliente, produtos),
      { initialProps: { cliente: "sankhya:customer:900", produtos: ["sankhya:product:901"] } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.customers).toContainEqual(linha("customers", 900));
    expect(result.current.products).toContainEqual(linha("products", 901));
    const { input } = campo();
    fireEvent.input(input, { target: { value: "124" } });
    await waitFor(() => expect(result.current.customers).toHaveLength(2));
    expect(result.current.customers).toContainEqual(linha("customers", 900));
    rerender({ cliente: "", produtos: [] });
    await waitFor(() => expect(result.current.customers).toHaveLength(1));
    // A lista de produtos é recarregada quando o cliente muda (filtro por tabela de preço).
    await waitFor(() => expect(result.current.products).toHaveLength(50));
    expect(transporte.mock.calls.filter(([corpo]) => corpo.operation === "record")).toHaveLength(2);
  });
  it("mantém vendedor da sessão fora da busca e não o substitui pelo vendedor do cliente", async () => {
    const { client, transporte } = preparar();
    transporte.mockImplementationOnce(async ({ query }: CorpoTeste) => ({
      error: null,
      data: {
        ...observacao,
        items: [{ ...linha("customers", 1), sellerCode: 900 }],
        offset: 0,
        total: 1,
        totalWithoutSearch: 1,
      },
    }));
    const { result } = renderHook(() => useERPOrderLookups(client, "sankhya:customer:1", [], "sankhya:seller:901"));
    // O cliente aponta900; somente o vínculo da sessão901 deve ficar retido.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sellers).toHaveLength(51);
    expect(
      transporte.mock.calls.some(
        ([corpo]) =>
          corpo.operation === "record" &&
          corpo.query.resource === "sellers" &&
          corpo.query.id === 901,
      ),
    ).toBe(true);
    expect(new Set(result.current.sellers.map((row) => row["id"])).size).toBe(51);
  });
  it("não deduplica vendedores com nome/email iguais nem aceita identificador ERP adulterado", async () => {
    const { client, transporte } = preparar();
    const original = transporte.getMockImplementation()!;
    transporte.mockImplementation(async (corpo: CorpoTeste) => {
      const resposta = await original(corpo);
      if (corpo.query.resource === "sellers" && corpo.operation === "window")
        resposta.data.items = resposta.data.items!.map((row: ERPRow) => ({
          ...row,
          name: "Mesmo vendedor",
          email: "mesmo@exemplo.com",
        }));
      return resposta;
    });
    const { result } = renderHook(() =>
      useERPOrderLookups(client, "sankhya:customer:1 OR 1=1", ["manual", "sankhya:product:0"]),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sellers).toHaveLength(50);
    expect(transporte.mock.calls.filter(([corpo]) => corpo.operation === "record")).toHaveLength(0);
  });
  it("ignora record selecionado atrasado e respostas de janela após desmontagem", async () => {
    const { client, transporte } = preparar();
    const original = transporte.getMockImplementation()!;
    let concluir!: (resposta: RespostaTeste) => void;
    transporte.mockImplementation((corpo: CorpoTeste) =>
      corpo.operation === "record"
        ? new Promise((resolve) => {
            concluir = resolve;
          })
        : original(corpo),
    );
    const { result, rerender, unmount } = renderHook(
      ({ cliente }) => useERPOrderLookups(client, cliente, []),
      { initialProps: { cliente: "sankhya:customer:900" } },
    );
    await waitFor(() => expect(concluir).toBeTypeOf("function"));
    rerender({ cliente: "" });
    await act(async () =>
      concluir({ error: null, data: { ...observacao, record: linha("customers", 900) } }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.customers.some((row) => row["id"] === "sankhya:customer:900")).toBe(
      false,
    );
    let terminar!: (resposta: RespostaTeste) => void;
    transporte.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          terminar = resolve;
        }),
    );
    const { lista } = campo();
    lista.scrollTop = 300;
    fireEvent.scroll(lista);
    await waitFor(() => expect(terminar).toBeTypeOf("function"));
    unmount();
    await act(async () =>
      terminar({
        error: null,
        data: {
          ...observacao,
          items: Array.from({ length: 50 }, (_, indice) => linha("customers", indice + 51)),
          offset: 50,
          total: 125,
          totalWithoutSearch: 125,
        },
      }),
    );
  });
  it("remove listeners/timer e ignora trabalho pendente ao desmontar ou trocar cliente", async () => {
    const { client, transporte } = preparar();
    const { result, rerender, unmount } = renderHook(
      ({ atual }) => useERPOrderLookups(atual, "", []),
      { initialProps: { atual: client as typeof client | undefined } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { input, lista } = campo();
    fireEvent.input(input, { target: { value: "124" } });
    rerender({ atual: undefined });
    expect(result.current.customers).toEqual([]);
    unmount();
    fireEvent.input(input, { target: { value: "125" } });
    lista.scrollTop = 300;
    fireEvent.scroll(lista);
    await new Promise((resolve) => setTimeout(resolve, 240));
    expect(transporte).toHaveBeenCalledTimes(3);
  });
  it("reconhece o popup real do DS sem trocar componentes, foco ou abertura", async () => {
    const { client } = preparar();
    function Formulario() {
      const dados = useERPOrderLookups(client, "", []);
      return (
        <Combobox
          label="Cliente"
          value=""
          onValueChange={() => {}}
          options={dados.customers.map((row) => ({
            value: String(row["id"]),
            label: String(row["name"]),
          }))}
        />
      );
    }
    render(<Formulario />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Cliente" })).toBeTruthy());
    fireEvent.click(screen.getByRole("combobox", { name: "Cliente" }));
    const input = await screen.findByLabelText("Buscar em cliente");
    fireEvent.input(input, { target: { value: "Nome 124" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "Nome 124" })).toBeTruthy());
  });
});

describe('Regressões do contexto comercial do pedido', () => {
  it('filtra a carteira pelo vendedor antes da seleção do cliente e refaz a consulta na troca', async () => {
    const {client,transporte}=preparar();
    const hook=renderHook(({seller})=>useERPOrderLookups(client,'',[],seller),{initialProps:{seller:'sankhya:seller:8'}});
    await waitFor(()=>expect(hook.result.current.loading).toBe(false));
    expect(transporte).toHaveBeenCalledWith(expect.objectContaining({operation:'window',query:expect.objectContaining({resource:'customers',filters:{sellerCode:8}})}));
    hook.rerender({seller:'sankhya:seller:12'});
    await waitFor(()=>expect(transporte).toHaveBeenCalledWith(expect.objectContaining({operation:'window',query:expect.objectContaining({resource:'customers',filters:{sellerCode:12},search:'',offset:0})})));
  });
  it('não publica produtos da tabela anterior enquanto a nova consulta está pendente', async () => {
    const {client,transporte}=preparar();const original=transporte.getMockImplementation()!;
    let release: (()=>void)|undefined;
    transporte.mockImplementation(async body=>{
      if(body.operation==='window' && body.query.resource==='products' && body.query.filters?.customerCode===2)await new Promise<void>(resolve=>{release=resolve;});
      return original(body);
    });
    const hook=renderHook(({customer})=>useERPOrderLookups(client,customer,[]),{initialProps:{customer:'sankhya:customer:1'}});
    await waitFor(()=>expect(hook.result.current.products).toHaveLength(50));
    hook.rerender({customer:'sankhya:customer:2'});
    expect(hook.result.current.products).toEqual([]);
    expect(hook.result.current.loading).toBe(true);
    await act(async()=>release?.());
    await waitFor(()=>expect(hook.result.current.products).toHaveLength(50));
  });
});
