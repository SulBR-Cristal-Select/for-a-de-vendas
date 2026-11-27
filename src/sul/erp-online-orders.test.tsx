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
import SulApp, {
  assertOrderMutation,
  createAppState,
  createMutationQueue,
  prepareOnlineOrder,
  quoteERPOrderItem,
  useERPOrderPayments,
  useERPOrderPrices,
  type OnlineOrderContext,
} from "./SulApp";
import type { ERPClient } from "./erp-hooks";
import type { ERPPrice } from "../lib/erp-online";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  notify: vi.fn(),
  Combobox: ({
    label,
    value,
    onValueChange,
    options,
    disabled,
  }: {
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    options: { value: string; label: string }[];
    disabled: boolean;
  }) => (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" />
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
// Este teste mantém o seletor sintético já usado para isolar preço/persistência.
// O seletor real e a filtragem remota são exercitados em erp-combobox.test.tsx.
vi.mock("./erp-combobox", async () => ({ ERPCombobox: (await import("@g4ai/ds")).Combobox }));
const customer = {
  id: "sankhya:customer:7",
  code: "7",
  name: "Cliente ERP",
  readOnly: true,
  erp: { source: "sankhya" },
};
const seller = {
  id: "sankhya:seller:8",
  code: "8",
  name: "Vendedor ERP",
  readOnly: true,
  erp: { source: "sankhya" },
};
const product = {
  id: "sankhya:product:9",
  code: "9",
  name: "Produto ERP",
  unit: "KG",
  price: null,
  readOnly: true,
  erp: { source: "sankhya", quantityDecimals: 5 },
};
const context: OnlineOrderContext = {
  customerId: customer.id,
  paymentCode: 31,
  sellerId: seller.id,
  type: "Venda",
  date: "2026-10-23",
};
const payment = { id: "sankhya:payment:31", code: 31, label: "Condição real 31", version: "v1" };
function preview(quantity = 1, amount = 12.34): ERPPrice {
  return {
    source: "sankhya",
    readOnly: true,
    readAt: "2026-10-23T20:00:00Z",
    customer,
    product,
    seller,
    companyCode: 1,
    operationCode: 1001,
    operationVersion: "v1",
    quantity,
    payment: { code: 31, label: payment.label, version: "v1" },
    price: {
      amount,
      unit: "KG",
      localCode: null,
      control: null,
      tableVersion: null,
      provider: "native-context-api",
    },
  };
}
function fakeClient() {
  return {
    window: vi.fn(async ({ resource }: Parameters<ERPClient["window"]>[0]) => ({
      items: resource === "customers" ? [customer] : resource === "products" ? [product] : [seller],
      total: 1,
    })),
    record: vi.fn(async ({ resource }: Parameters<ERPClient["window"]>[0]) => ({
      record: resource === "customers" ? customer : resource === "products" ? product : seller,
    })),
    paymentOptions: vi.fn(async () => ({
      items: [payment],
      total: 1,
      totalWithoutSearch: 1,
      offset: 0,
    })),
    price: vi.fn(async ({ quantity }: Parameters<ERPClient["price"]>[0]) => preview(quantity)),
  } as unknown as ERPClient;
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  location.hash = "";
});

describe("Contrato do formulário online sem catálogo persistido", () => {
  it("recusa preço sem contexto e nunca usa preço-base, zero ou vendedor Auth", async () => {
    const client = fakeClient();
    for (const patch of [
      { customerId: "" },
      { paymentCode: NaN },
      { sellerId: "auth-admin" },
      { type: "Bonificação" },
    ]) {
      await expect(quoteERPOrderItem(client, { ...context, ...patch }, product, 1)).rejects.toThrow(
        "Confirme cliente",
      );
    }
    await expect(quoteERPOrderItem(client, context, { ...product, unit: "" }, 1)).rejects.toThrow();
    expect(client.price).not.toHaveBeenCalled();
  });
  it("mantém quantidade DECQTD5 e moeda exatas, rejeitando preço acima de centavos", async () => {
    const client = fakeClient();
    const quote = await quoteERPOrderItem(client, context, product, 1.23456);
    expect(client.price).toHaveBeenCalledWith({
      ...{
        customerId: customer.id,
        productId: product.id,
        paymentCode: 31,
        sellerCode: 8,
        type: "Venda",
        date: context.date,
      },
      quantity: 1.23456,
      unit: "KG",
    });
    expect(quote.price.amount).toBe(12.34);
    vi.mocked(client.price).mockResolvedValue(preview(1, 12.345));
    await expect(quoteERPOrderItem(client, context, product, 1)).rejects.toThrow("Precisão");
    vi.mocked(client.price).mockResolvedValue(preview(1, 0));
    await expect(quoteERPOrderItem(client, context, product, 1)).rejects.toThrow("não confirmado");
  });
  it("ignora resposta de preço de contexto anterior inclusive após erro atual", async () => {
    let release!: (quote: ERPPrice) => void;
    const client = fakeClient();
    vi.mocked(client.price)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("Preço atual indisponível"));
    const items = [{ productId: product.id, qty: 1, unit: "KG", price: 12.34 }];
    const products = [product];
    const hook = renderHook(
      ({ selected }) => useERPOrderPrices(client, selected, items, products),
      { initialProps: { selected: context } },
    );
    hook.rerender({ selected: { ...context, paymentCode: 32 } });
    await waitFor(() => expect(hook.result.current?.error).toBe("Preço atual indisponível"));
    await act(async () => {
      release(preview());
    });
    expect(hook.result.current?.quotes).toBeUndefined();
    expect(hook.result.current?.error).toBe("Preço atual indisponível");
  });
  it("mantém condições por cliente e só pagina mediante rolagem explícita do menu", async () => {
    const client = fakeClient();
    vi.mocked(client.paymentOptions).mockResolvedValue({
      items: [payment],
      total: 80,
      totalWithoutSearch: 80,
      offset: 0,
    } as import("../lib/erp-online").ERPWindow<unknown>);
    const hook = renderHook(({ customerId }) => useERPOrderPayments(client, customerId), {
      initialProps: { customerId: customer.id },
    });
    await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
    expect(client.paymentOptions).toHaveBeenCalledTimes(1);
    const { container } = render(
      <div aria-label="Condição de pagamento">
        <input aria-label="Buscar em condição de pagamento" />
        <div role="listbox" />
      </div>,
    );
    const list = container.querySelector("[role=listbox]")!;
    Object.defineProperties(list, {
      clientHeight: { value: 50 },
      scrollHeight: { value: 100 },
      scrollTop: { value: 50 },
    });
    fireEvent.scroll(list);
    await waitFor(() =>
      expect(client.paymentOptions).toHaveBeenLastCalledWith({
        customerId: customer.id,
        offset: 1,
        limit: 50,
        search: "",
      }),
    );
    hook.rerender({ customerId: "manual" });
    expect(hook.result.current.rows).toEqual([]);
  });
  it("emite documento local com identidade estável e referências prefixadas sem snapshots fabricados", () => {
    const order = prepareOnlineOrder(
      {
        id: "uuid-local",
        seller: "auth-admin",
        items: [
          { productId: product.id, qty: 1.23456, price: 12.34, unit: "KG", erp: { errado: true } },
        ],
        freight: 0,
      },
      context,
      [preview(1.23456)],
    );
    expect(order.id).toBe("uuid-local");
    expect(order.customerId).toBe(customer.id);
    expect(order.payment).toBe(payment.label);
    expect(order.seller).toBe(seller.name);
    expect(order.sellerId).toBeUndefined();
    expect(order.erp).toEqual({
      source: "sankhya",
      mode: "online",
      companyCode: 1,
      operationCode: 1001,
      sellerCode: 8,
      payment: { code: 31 },
    });
    expect(order.items[0]).toEqual({
      productId: product.id,
      qty: 1.23456,
      price: 12.34,
      unit: "KG",
    });
    expect(order.customerSnapshot).toBeUndefined();
  });
  it("remove o acesso ao cadastro local de produto e preserva a consulta", async () => {
    location.hash = "#/produtos";
    render(
      <SulApp
        initialState={createAppState({
          products: [{ id: "existente", name: "Produto preservado", unit: "PC", price: 1 }],
        })}
        persist={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    expect(await screen.findByRole("link", { name: "Produto preservado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cadastrar produto" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Cadastrar produto local" }),
    ).not.toBeInTheDocument();
  });
  it("desativa a rota antiga de destaques e mantém a consulta de produtos", async () => {
    location.hash = "#/produtos/destaques";
    render(<SulApp initialState={createAppState()} persist={vi.fn()} onSignOut={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Produtos" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Destaques" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Novo destaque" })).not.toBeInTheDocument();
  });
  it("bloqueia novos destaques sem apagar os anteriores", async () => {
    const before = createAppState();
    before.collections["destaques"] = [{ id: "preservado", name: "Existente" }];
    const current = { current: before };
    const persist = vi.fn(async (value) => value);
    const queue = createMutationQueue(current, persist, vi.fn());
    await expect(
      queue((next) => next.collections["destaques"]?.push({ id: "novo", name: "Novo" })),
    ).rejects.toThrow("Criação de destaques desativada");
    expect(persist).not.toHaveBeenCalled();
    expect(current.current.collections["destaques"]).toEqual(before.collections["destaques"]);
  });
  it("bloqueia criação local antes da persistência sem remover produtos existentes", async () => {
    const before = createAppState({
      products: [{ id: "existente", name: "Preservado", price: 1 }],
    });
    const current = { current: before };
    const persist = vi.fn(async (value) => value);
    const queue = createMutationQueue(current, persist, vi.fn());
    await expect(
      queue((next) => next.products.push({ id: "novo", name: "Novo", price: 1 })),
    ).rejects.toThrow("Criação local de produtos desativada");
    expect(persist).not.toHaveBeenCalled();
    expect(current.current.products).toEqual(before.products);
    await expect(
      queue((next) => {
        const existing = next.products.find((row) => row.id === "existente");
        if (!existing) throw new Error("Produto existente ausente");
        existing.name = "Preservado editado";
      }),
    ).rejects.toThrow("somente para consulta");
    expect(persist).not.toHaveBeenCalled();
    expect(current.current.products).toHaveLength(1);
  });
  it("libera somente documentos online locais na fila, bloqueando catálogo e outros comandos ERP", async () => {
    const before = createAppState({ orders: [], customers: [], products: [] });
    const current = { current: before };
    const persist = vi.fn(async (value) => value);
    const queue = createMutationQueue(current, persist, vi.fn());
    const order = prepareOnlineOrder(
      { id: "uuid-local", items: [{ productId: product.id, qty: 1, price: 12.34, unit: "KG" }] },
      context,
      [preview()],
    );
    await queue((next) => next["orders"].push(order));
    expect(persist).toHaveBeenCalledTimes(1);
    expect(current.current["customers"]).toEqual([]);
    expect(current.current["products"]).toEqual([]);
    await expect(queue((next) => next["products"].push(product))).rejects.toThrow(
      "somente para consulta",
    );
    await expect(
      queue((next) => next["opportunities"].push({ id: "x", customerId: customer.id })),
    ).rejects.toThrow("somente para consulta");
    expect(() =>
      assertOrderMutation({ ...before, orders: [{ ...order, id: "sankhya:order:1" }] }, before),
    ).toThrow("inválido");
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it("gestor seleciona o cliente, o vendedor do cadastro é travado, cota e salva sem trocar a identidade Auth", async () => {
    location.hash = "#/pedidos/novo";
    const id = "00000000-0000-4000-8000-000000000001",
      team = { ...seller, id: "sankhya:seller:12", code: "12", name: "Integrante autorizado" },
      own = { ...customer, sellerCode: 12 };
    const state = createAppState({
      company: {
        userId: id,
        role: "Gestor",
        erpSeller: {
          userId: id,
          sellerId: seller.id,
          sellerCode: 8,
          companyCodes: [1],
          teamSellerCodes: [12],
        },
      },
      customers: [],
      products: [],
      orders: [],
    });
    const client = fakeClient(),
      persist = vi.fn(async (value) => value);
    vi.mocked(client.window).mockImplementation(
      async ({ resource }) =>
        ({
          items:
            resource === "customers" ? [own] : resource === "products" ? [product] : [seller, team],
          total: resource === "sellers" ? 2 : 1,
        }) as import("../lib/erp-online").ERPWindow<unknown>,
    );
    vi.mocked(client.record).mockImplementation(
      async ({ resource, id }) =>
        ({
          record:
            resource === "customers"
              ? own
              : resource === "products"
                ? product
                : Number(id) === 12
                  ? team
                  : seller,
        }) as import("../lib/erp-online").ERPRecord<unknown>,
    );
    vi.mocked(client.price).mockImplementation(async ({ quantity, sellerCode }) => ({
      ...preview(quantity),
      seller: sellerCode === 12 ? team : seller,
    }));
    render(
      <SulApp initialState={state} online={client} persist={persist} onSignOut={async () => {}} />,
    );
    await screen.findByRole("option", { name: "Cliente ERP (7)" });
    expect(screen.getByLabelText("Vendedor")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: own.id } });
    await waitFor(() =>
      expect(screen.getByLabelText("Condição de pagamento")).toHaveValue(payment.id),
    );
    expect(screen.getByLabelText("Vendedor")).toBeDisabled();
    expect(screen.getByLabelText("Vendedor")).toHaveValue(team.id);
    fireEvent.change(screen.getByLabelText("Vendedor"), { target: { value: seller.id } });
    expect(screen.getByLabelText("Cliente")).toHaveValue(own.id);
    expect(screen.getByLabelText("Vendedor")).toHaveValue(team.id);
    fireEvent.change(screen.getByLabelText("Produto"), { target: { value: product.id } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar produto/ }));
    await screen.findByText("Produto ERP", { selector: "strong" });
    fireEvent.click(screen.getByRole("button", { name: /Salvar pedido/ }));
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    expect(persist.mock.calls[0]![0].company.userId).toBe(id);
    expect(persist.mock.calls[0]![0].orders[0].erp.sellerCode).toBe(12);
    expect(client.price).toHaveBeenCalledWith(expect.objectContaining({ sellerCode: 12 }));
  });
  it("integra os seletores existentes, preço contextual e persistência sem baixar carteira", async () => {
    location.hash = "#/pedidos/novo";
    const state = createAppState({
      company: {
        userId: "00000000-0000-4000-8000-000000000001",
        erpSeller: {
          userId: "00000000-0000-4000-8000-000000000001",
          sellerId: seller.id,
          sellerCode: 8,
          companyCodes: [1],
        },
      },
      customers: [],
      products: [],
      orders: [],
    });
    const original = structuredClone(state);
    const client = fakeClient(),
      persist = vi.fn(async (value) => value);
    render(
      <SulApp initialState={state} online={client} persist={persist} onSignOut={async () => {}} />,
    );
    await screen.findByRole("option", { name: "Cliente ERP (7)" });
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: customer.id } });
    await screen.findByRole("option", { name: payment.label });
    fireEvent.change(screen.getByLabelText("Condição de pagamento"), {
      target: { value: payment.id },
    });
    expect((screen.getByLabelText("Vendedor") as HTMLSelectElement).value).toBe(seller.id);
    fireEvent.change(screen.getByLabelText("Produto"), { target: { value: product.id } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar produto/ }));
    await screen.findByText("Produto ERP", { selector: "strong" });
    await waitFor(() => expect(client.price).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Salvar pedido/ }));
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const saved = persist.mock.calls[0]![0];
    expect(saved["customers"]).toEqual([]);
    expect(saved["products"]).toEqual([]);
    expect(saved["orders"][0].erp.payment.code).toBe(31);
    expect(saved["orders"][0].payment).toBe(payment.label);
    expect(saved["orders"][0].items[0].price).toBe(12.34);
    expect(state).toEqual(original);
    expect(client.paymentOptions).toHaveBeenCalledTimes(1);
  });
  it("preserva criação manual sem consulta de preço ERP", async () => {
    location.hash = "#/pedidos/novo";
    const state = createAppState({
      customers: [{ id: "manual-c", name: "Cliente manual", code: "M" }],
      products: [{ id: "manual-p", code: "P", name: "Produto manual", price: 18.25 }],
      orders: [],
      payments: ["À vista manual"],
    });
    const persist = vi.fn(async (value) => value);
    render(<SulApp initialState={state} persist={persist} onSignOut={async () => {}} />);
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "manual-c" } });
    fireEvent.change(screen.getByLabelText("Condição de pagamento"), {
      target: { value: "À vista manual" },
    });
    fireEvent.change(screen.getByLabelText("Produto"), { target: { value: "manual-p" } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar produto/ }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar pedido/ }));
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    expect(persist.mock.calls[0]![0]["orders"][0]).toMatchObject({
      payment: "À vista manual",
      total: 18.25,
      items: [{ productId: "manual-p", price: 18.25, qty: 1 }],
    });
    expect(persist.mock.calls[0]![0]["orders"][0].erp).toBeUndefined();
  });
});

describe("Feedbacks de cliente, tabela e inclusão de produto", () => {
  it("invalida valores na troca de cliente, preserva erro definitivo e recota ao voltar", async () => {
    location.hash = "#/pedidos/novo";
    const other = { ...customer, id: "sankhya:customer:10", code: "10", name: "Sem tabela" };
    const id = "00000000-0000-4000-8000-000000000001";
    const client = fakeClient(),
      persist = vi.fn(async (value) => value);
    let release!: (value: ERPPrice) => void;
    vi.mocked(client.window).mockImplementation(async ({ resource, filters }) => ({
      source: "sankhya" as const,
      readOnly: true as const,
      readAt: "2026-11-24T21:00:00Z",
      totalWithoutSearch: 1,
      offset: 0,
      limit: 50,
      items:
        resource === "customers"
          ? [customer, other]
          : resource === "sellers"
            ? [seller]
            : filters?.customerCode === 10
              ? []
              : [product],
      total:
        resource === "customers"
          ? 2
          : resource === "products" && filters?.customerCode === 10
            ? 0
            : 1,
      ...(resource === "products" && filters?.customerCode === 10
        ? { priceTableState: "missing" as const }
        : {}),
    }));
    vi.mocked(client.record).mockImplementation(async ({ resource, id }) => ({
      source: "sankhya" as const,
      readOnly: true as const,
      readAt: "2026-11-24T21:00:00Z",
      record:
        resource === "customers"
          ? id === other.id
            ? other
            : customer
          : resource === "products"
            ? product
            : seller,
    }));
    vi.mocked(client.price).mockImplementation(async ({ customerId, quantity }) => {
      if (customerId === other.id) throw new Error("Cliente sem tabela de preço associada");
      return preview(quantity);
    });
    render(
      <SulApp
        initialState={createAppState({
          company: {
            userId: id,
            erpSeller: { userId: id, sellerId: seller.id, sellerCode: 8, companyCodes: [1] },
          },
          customers: [],
          products: [],
          orders: [],
        })}
        online={client}
        persist={persist}
        onSignOut={vi.fn()}
      />,
    );
    await screen.findByRole("option", { name: "Cliente ERP (7)" });
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: customer.id } });
    await waitFor(() =>
      expect(screen.getByLabelText("Condição de pagamento")).toHaveValue(payment.id),
    );
    fireEvent.change(screen.getByLabelText("Produto"), { target: { value: product.id } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar produto/ }));
    await screen.findByText("Produto ERP", { selector: "strong" });
    await waitFor(() => expect(screen.getAllByText(/12,34/).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: other.id } });
    expect(screen.queryByText(/12,34/)).not.toBeInTheDocument();
    await screen.findByText(/não há produtos para listar/);
    fireEvent.click(screen.getByRole("button", { name: /Salvar pedido/ }));
    expect(await screen.findByText("Cliente sem tabela de preço associada")).toBeInTheDocument();
    expect(screen.queryByText(/Aguarde a confirmação/)).not.toBeInTheDocument();
    expect(persist).not.toHaveBeenCalled();
    vi.mocked(client.price).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: customer.id } });
    await waitFor(() => expect(release).toBeTypeOf("function"));
    expect(screen.queryByText(/12,34/)).not.toBeInTheDocument();
    await act(async () => {
      release(preview());
    });
    await waitFor(() => expect(screen.getAllByText(/12,34/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /Salvar pedido/ }));
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    expect(persist.mock.calls[0]![0].orders[0].customerId).toBe(customer.id);
  });
  it("diretoria sem vínculo usa vendedor do cliente e mantém autoria Auth", async () => {
    location.hash = "#/pedidos/novo";
    const id = "00000000-0000-4000-8000-000000000001";
    const client = fakeClient(),
      persist = vi.fn();
    const directorCustomer = { ...customer, sellerCode: 8 };
    vi.mocked(client.window).mockImplementation(
      async ({ resource }) =>
        ({
          items:
            resource === "customers"
              ? [directorCustomer]
              : resource === "products"
                ? [product]
                : [seller],
          total: 1,
        }) as import("../lib/erp-online").ERPWindow<unknown>,
    );
    vi.mocked(client.record).mockImplementation(
      async ({ resource }) =>
        ({
          record:
            resource === "customers"
              ? directorCustomer
              : resource === "products"
                ? product
                : seller,
        }) as Awaited<ReturnType<ERPClient["record"]>>,
    );
    render(
      <SulApp
        initialState={createAppState({
          company: { userId: id, role: "Administrador" },
          customers: [],
          products: [],
          orders: [],
        })}
        online={client}
        persist={persist}
        onSignOut={vi.fn()}
      />,
    );
    await screen.findByRole("option", { name: "Cliente ERP (7)" });
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: customer.id } });
    await waitFor(() => expect(screen.getByLabelText("Vendedor")).toHaveValue(seller.id));
    expect(screen.getByLabelText("Vendedor")).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByLabelText("Condição de pagamento")).toHaveValue(payment.id),
    );
    fireEvent.change(screen.getByLabelText("Produto"), { target: { value: product.id } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar produto/ }));
    await waitFor(() =>
      expect(client.price).toHaveBeenCalledWith(expect.objectContaining({ sellerCode: 8 })),
    );
    await screen.findAllByText(/12,34/);
    fireEvent.click(screen.getByRole("button", { name: /Salvar pedido/ }));
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    expect(persist.mock.calls[0]![0].company.userId).toBe(id);
    expect(persist.mock.calls[0]![0].orders[0].sellerId).toBeUndefined();
    expect(persist.mock.calls[0]![0].orders[0].erp.sellerCode).toBe(8);
  });
  it("gestor não filtra clientes por vendedor, e cliente de vendedor fora da equipe bloqueia o pedido", async () => {
    location.hash = "#/pedidos/novo";
    const id = "00000000-0000-4000-8000-000000000001",
      stranger = { ...customer, sellerCode: 99 };
    const state = createAppState({
        company: {
          userId: id,
          role: "Gestor",
          erpSeller: {
            userId: id,
            sellerId: seller.id,
            sellerCode: 8,
            companyCodes: [1],
            teamSellerCodes: [12],
          },
        },
        customers: [],
        products: [],
        orders: [],
      }),
      client = fakeClient(),
      persist = vi.fn();
    vi.mocked(client.window).mockImplementation(
      async ({ resource }) =>
        ({
          items:
            resource === "customers" ? [stranger] : resource === "products" ? [product] : [seller],
          total: 1,
        }) as import("../lib/erp-online").ERPWindow<unknown>,
    );
    render(<SulApp initialState={state} online={client} persist={persist} onSignOut={vi.fn()} />);
    await screen.findByRole("option", { name: "Cliente ERP (7)" });
    expect(client.window).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "customers" }),
      expect.any(AbortSignal),
    );
    expect(
      vi
        .mocked(client.window)
        .mock.calls.some(
          ([q]) => q.resource === "customers" && q.filters?.sellerCode !== undefined,
        ),
    ).toBe(false);
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: stranger.id } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar pedido/ }));
    expect(await screen.findByText(/não está na sua equipe/)).toBeInTheDocument();
    expect(screen.getByLabelText("Vendedor")).toBeDisabled();
    expect(persist).not.toHaveBeenCalled();
  });
  it("cliente sem tabela de preço não lista produtos e mostra o aviso na própria lista", async () => {
    location.hash = "#/pedidos/novo";
    const client = fakeClient(),
      persist = vi.fn();
    vi.mocked(client.window).mockImplementation(
      async ({ resource, filters }) =>
        ({
          priceTableState: resource === "products" && filters?.customerCode ? "missing" : undefined,
          items:
            resource === "customers"
              ? [customer]
              : resource === "sellers"
                ? [seller]
                : filters?.customerCode
                  ? []
                  : [product],
          total:
            resource === "customers" || resource === "sellers" ? 1 : filters?.customerCode ? 0 : 1,
        }) as import("../lib/erp-online").ERPWindow<unknown>,
    );
    const state = createAppState({
      company: {
        userId: "00000000-0000-4000-8000-000000000001",
        erpSeller: {
          userId: "00000000-0000-4000-8000-000000000001",
          sellerId: seller.id,
          sellerCode: 8,
          companyCodes: [1],
        },
      },
      customers: [],
      products: [],
      orders: [],
    });
    render(<SulApp initialState={state} online={client} persist={persist} onSignOut={vi.fn()} />);
    expect(screen.queryByText(/Cliente sem tabela de preço associada/)).not.toBeInTheDocument();
    await screen.findByRole("option", { name: "Cliente ERP (7)" });
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: customer.id } });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Cliente sem tabela de preço associada",
    );
    expect(screen.queryByRole("option", { name: /Produto ERP/ })).not.toBeInTheDocument();
  });
  it("não oferece produto local ou fixado fora da tabela para um cliente ERP", async () => {
    location.hash = "#/pedidos/novo";
    const client = fakeClient(),
      persist = vi.fn(),
      local = {
        id: "local",
        name: "Produto local fora da tabela",
        code: "LOCAL",
        unit: "PC",
        price: 10,
        source: "simulado",
      };
    const state = createAppState({ customers: [], products: [local], orders: [] });
    render(<SulApp initialState={state} online={client} persist={persist} onSignOut={vi.fn()} />);
    await screen.findByRole("option", { name: "Cliente ERP (7)" });
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: customer.id } });
    await waitFor(() =>
      expect(screen.getByLabelText("Condição de pagamento")).toHaveValue(payment.id),
    );
    expect(
      screen.queryByRole("option", { name: /Produto local fora da tabela/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Produto"), { target: { value: product.id } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar produto/ }));
    await screen.findByText(/Sua conta não possui vínculo operacional/);
    expect(client.price).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("Dados reais do cliente no detalhe do pedido", () => {
  it("consulta o cadastro ERP mesmo sem cliente persistido localmente", async () => {
    const id = "00000000-0000-4000-8000-000000000099";
    location.hash = `#/pedidos/${id}`;
    const client = fakeClient();
    vi.mocked(client.record).mockResolvedValue({
      source: "sankhya",
      readOnly: true,
      readAt: "2026-11-24T21:00:00Z",
      record: { ...customer, cnpj: "11.517.841/0049-31", city: "CURITIBA", state: "PR" },
    });
    render(
      <SulApp
        initialState={createAppState({
          customers: [],
          products: [],
          orders: [
            {
              id,
              number: 17,
              customerId: customer.id,
              customerName: customer.name,
              sellerId: seller.id,
              date: "2026-11-24",
              type: "Venda",
              status: "Concluído",
              items: [],
              total: 0,
              erp: { source: "sankhya", customer: { id: customer.id, name: customer.name } },
            },
          ],
        })}
        online={client}
        persist={vi.fn(async (value) => value)}
        onSignOut={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/11.517.841\/0049-31/)).toBeTruthy());
    expect(screen.getByText(/CURITIBA/)).toBeTruthy();
    expect(screen.queryByText(/CNPJ não extraído/)).toBeNull();
    expect(client.record).toHaveBeenCalledWith({ resource: "customers", id: customer.id });
  });
});
