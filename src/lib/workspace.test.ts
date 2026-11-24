import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  callback: null as null | ((event: string, session: { user: { id: string } } | null) => void),
}));
vi.mock("./supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    auth: {
      onAuthStateChange: (fn: typeof mocks.callback) => {
        mocks.callback = fn;
      },
    },
  },
}));
beforeEach(() => {
  vi.resetModules();
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
  mocks.callback = null;
});
describe("Contrato autenticado do workspace", () => {
  it("exige carregar uma revisão antes de salvar", async () => {
    const { saveWorkspace } = await import("./workspace");
    await expect(saveWorkspace({})).rejects.toThrow("Carregue os dados autenticados");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("envia revisão e UUID e devolve apenas o estado confirmado pelo servidor", async () => {
    const { loadWorkspace, saveWorkspace } = await import("./workspace");
    mocks.rpc.mockResolvedValueOnce({ data: { state: { orders: [] }, revision: 7 }, error: null });
    expect(await loadWorkspace()).toEqual({ orders: [] });
    mocks.rpc.mockResolvedValueOnce({
      data: { state: { total: 123.45 }, revision: 8 },
      error: null,
    });
    expect(await saveWorkspace({ total: 0 })).toEqual({ total: 123.45 });
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_workspace", {
      p_state: { total: 0 },
      p_expected_revision: 7,
      p_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });
  it("preserva UUID e revisão após falha de rede, e bloqueia alteração diferente", async () => {
    const { loadWorkspace, saveWorkspace } = await import("./workspace");
    mocks.rpc.mockResolvedValueOnce({ data: { state: {}, revision: 2 }, error: null });
    await loadWorkspace();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Falha de rede", code: "" } });
    await expect(saveWorkspace({ orders: [1] })).rejects.toThrow("Falha de rede");
    const args = mocks.rpc.mock.calls[1]?.[1];
    await expect(saveWorkspace({ orders: [2] })).rejects.toThrow("sem confirmação");
    mocks.rpc.mockResolvedValueOnce({ data: { state: { orders: [1] }, revision: 3 }, error: null });
    await saveWorkspace({ orders: [1] });
    expect(mocks.rpc.mock.calls[2]?.[1]).toEqual(args);
  });
  it("traduz acesso pendente sem criar um estado substituto", async () => {
    const { loadWorkspace } = await import("./workspace");
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "MEMBERSHIP_PENDING", code: "42501" },
    });
    await expect(loadWorkspace()).rejects.toMatchObject({
      code: "MEMBERSHIP_PENDING",
      message: expect.stringContaining("pendente de ativação"),
    });
  });
  it.each(["40001", "PT409"])("invalida revisão quando há conflito %s", async (code) => {
    const { loadWorkspace, saveWorkspace } = await import("./workspace");
    mocks.rpc.mockResolvedValueOnce({ data: { state: {}, revision: 1 }, error: null });
    await loadWorkspace();
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: code === "PT409" ? "Revisão desatualizada" : "REVISION_CONFLICT", code },
    });
    await expect(saveWorkspace({})).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(saveWorkspace({})).rejects.toThrow("Carregue os dados autenticados");
  });
  it("não aceita resposta sem revisão íntegra", async () => {
    const { loadWorkspace } = await import("./workspace");
    mocks.rpc.mockResolvedValueOnce({ data: { state: {}, revision: "1" }, error: null });
    await expect(loadWorkspace()).rejects.toThrow("estado inválido");
  });
  it("limpa revisão ao sair da conta", async () => {
    const { loadWorkspace, saveWorkspace } = await import("./workspace");
    mocks.rpc.mockResolvedValueOnce({ data: { state: {}, revision: 1 }, error: null });
    await loadWorkspace();
    mocks.callback?.("SIGNED_OUT", null);
    await expect(saveWorkspace({})).rejects.toThrow("Carregue os dados autenticados");
  });
});

describe("Congelamento e revalidação online com JWT do usuário", () => {
  const state = () => ({
    company: {
      id: "432299",
      userId: "00000000-0000-4000-8000-000000000001",
      role: "Administrador",
    },
    customers: [],
    products: [],
    orders: [
      {
        id: "pedido-local",
        customerId: "sankhya:customer:99000001",
        erp: { source: "sankhya", mode: "online" },
        items: [{ productId: "sankhya:product:99000002", qty: 1, price: 10.56 }],
      },
    ],
  });
  async function load() {
    const w = await import("./workspace");
    mocks.rpc.mockResolvedValueOnce({ data: { state: state(), revision: 20 }, error: null });
    await w.loadWorkspace();
    return w;
  }
  it("reserva estado, UUID e revisão antes da consulta e usa a mesma transação na RPC", async () => {
    const w = await load(),
      next = state();
    let resolve!: (r: unknown) => void;
    mocks.invoke.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    mocks.rpc.mockResolvedValueOnce({ data: { state: state(), revision: 21 }, error: null });
    const save = w.saveWorkspace(next),
      call = mocks.invoke.mock.calls[0]![1];
    next.orders[0]!.items[0]!.qty = 999;
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(call.body.operation).toBe("prepare-order-save");
    expect(call.body.query.state.orders[0].items[0].qty).toBe(1);
    resolve({ data: { ready: true }, error: null });
    await save;
    expect(mocks.rpc.mock.calls[1]![1]).toEqual({
      p_state: call.body.query.state,
      p_expected_revision: 20,
      p_request_id: call.body.query.requestId,
    });
  });
  it("reenvia UUID/revisão após falha de transporte na revalidação, sem salvar antes", async () => {
    const w = await load();
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error("Falha de rede") });
    await expect(w.saveWorkspace(state())).rejects.toMatchObject({
      code: "ERP_REVALIDATION_UNAVAILABLE",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const first = mocks.invoke.mock.calls[0]![1].body.query;
    mocks.invoke.mockResolvedValueOnce({ data: { ready: true }, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: { state: state(), revision: 21 }, error: null });
    await w.saveWorkspace(state());
    expect(mocks.invoke.mock.calls[1]![1].body.query).toEqual(first);
  });
  it("erro comercial definitivo antes de submeter a RPC permite corrigir o formulário", async () => {
    const w = await load();
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ code: "ERP_PRICE_CHANGED", message: "Preço alterado" }),
          { status: 409 },
        ),
      },
    });
    await expect(w.saveWorkspace(state())).rejects.toMatchObject({ code: "ERP_PRICE_CHANGED" });
    const id = mocks.invoke.mock.calls[0]![1].body.query.requestId;
    const next = state();
    next.orders[0]!.items[0]!.price = 11.75;
    mocks.invoke.mockResolvedValueOnce({ data: { ready: true }, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: { state: next, revision: 21 }, error: null });
    await w.saveWorkspace(next);
    expect(mocks.invoke.mock.calls[1]![1].body.query.requestId).not.toBe(id);
  });
  it("resposta perdida da gravação mantém conteúdo e UUID até o reenvio confirmado", async () => {
    const w = await load();
    mocks.invoke.mockResolvedValue({ data: { ready: true }, error: null });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "", message: "Resposta de gravação perdida" },
    });
    await expect(w.saveWorkspace(state())).rejects.toThrow("perdida");
    const args = mocks.rpc.mock.calls[1]![1],
      changed = state();
    changed.orders[0]!.items[0]!.qty = 2;
    await expect(w.saveWorkspace(changed)).rejects.toThrow("sem confirmação");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    mocks.rpc.mockResolvedValueOnce({ data: { state: state(), revision: 21 }, error: null });
    await w.saveWorkspace(state());
    expect(mocks.rpc.mock.calls[2]![1]).toEqual(args);
  });
  it("invalida revisão no conflito409 do preflight sem enviar save_workspace", async () => {
    const w = await load();
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ code: "REVISION_CONFLICT", message: "Recarregue antes de salvar." }),
          { status: 409 },
        ),
      },
    });
    await expect(w.saveWorkspace(state())).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(w.saveWorkspace(state())).rejects.toThrow("Carregue os dados autenticados");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("troca de sessão enquanto aguarda prova impede submeter a gravação", async () => {
    const w = await load();
    let resolve!: (r: unknown) => void;
    mocks.invoke.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const save = w.saveWorkspace(state());
    mocks.callback?.("SIGNED_OUT", null);
    resolve({ data: { ready: true }, error: null });
    await expect(save).rejects.toThrow("sessão mudou");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
