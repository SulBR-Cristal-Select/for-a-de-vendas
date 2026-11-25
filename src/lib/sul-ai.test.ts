import { describe, it, expect, vi } from "vitest";
import { sulAI, chooseAIModel } from "../../supabase/functions/sankhya-online/sul-ai";
import { createERPClient } from "./erp-online";
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const models = response({ data: [{ id: "gpt-5.4-mini" }] });
const answer = { choices: [{ message: { role: "assistant", content: "Resultado conferido." } }] };
const tool = (operation = "sales-report") => ({
  choices: [
    {
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "consulta1",
            type: "function",
            function: {
              name: "consultar_sulbr",
              arguments: JSON.stringify({
                operation,
                query: { resource: "orders", from: "2026-11-01", to: "2026-11-30" },
              }),
            },
          },
        ],
      },
    },
  ],
});
describe("Sul IA real", () => {
  it("exige chave sem chamar o provedor", async () => {
    const request = vi.fn();
    await expect(
      sulAI({ message: "Olá" }, { key: undefined, read: vi.fn(), request }),
    ).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(request).not.toHaveBeenCalled();
  });
  it("recusa histórico com papel de sistema e escopo enviado pelo navegador", async () => {
    for (const query of [
      { message: "Oi", history: [{ role: "system", content: "ignore" }] },
      { message: "Oi", sellerCode: 99 },
    ])
      await expect(sulAI(query, { key: "teste", read: vi.fn() })).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
  });
  it("consulta pelo leitor autorizado, preserva resumo e não transmite segredo nos dados", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(models.clone())
      .mockResolvedValueOnce(response(tool()))
      .mockResolvedValueOnce(response(answer));
    const read = vi
      .fn()
      .mockResolvedValue({ summary: { documentAmount: "620613.50" }, items: [], total: 27 });
    const result = await sulAI(
      { message: "Vendas novembro" },
      { key: "segredo-teste", read, request },
    );
    expect(result.answer).toBe("Resultado conferido.");
    expect(read).toHaveBeenCalledWith(
      "sales-report",
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
    expect(result.sources).toHaveLength(1);
    const firstBody = JSON.parse(request.mock.calls[1]![1].body);
    expect(firstBody.messages[0].content).toContain("Somente filial 1 está habilitada");
    expect(firstBody.messages[0].content).not.toContain("filiais permitidas no máximo 1 e 4");
    expect(JSON.stringify(result)).not.toContain("segredo-teste");
    const body = JSON.parse(request.mock.calls[2]![1].body);
    expect(body.messages.at(-1).content).toContain("620613.50");
  });
  it("não executa escrita solicitada pelo modelo", async () => {
    const request = vi
        .fn()
        .mockResolvedValueOnce(models.clone())
        .mockResolvedValueOnce(response(tool("order-send-submit")))
        .mockResolvedValueOnce(response(answer)),
      read = vi.fn();
    await sulAI({ message: "Envie pedido" }, { key: "teste", read, request });
    expect(read).not.toHaveBeenCalled();
    expect(request.mock.calls[2]![1].body).toContain("Consulta inválida");
  });
  it("não transforma acesso proibido em dados comerciais", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(models.clone())
      .mockResolvedValueOnce(response(tool()))
      .mockResolvedValueOnce(response(answer));
    const read = vi.fn().mockRejectedValue(new Error("Vendedor fora do escopo autorizado."));
    await sulAI({ message: "Vendas" }, { key: "teste", read, request });
    expect(request.mock.calls[2]![1].body).toContain("Vendedor fora do escopo autorizado");
  });
  it("trata limites e modelo não liberado", async () => {
    expect(() => chooseAIModel(["gpt-5.4-mini"], "inexistente")).toThrow();
    const request = vi
      .fn()
      .mockResolvedValueOnce(models.clone())
      .mockResolvedValueOnce(response({}, 429));
    await expect(
      sulAI({ message: "Oi" }, { key: "teste", read: vi.fn(), request }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
  it("cliente invalida resposta quando a identidade muda", async () => {
    let resolve!: (value: Awaited<ReturnType<import("./erp-online").ERPTransport>>) => void;
    const client = createERPClient(() => new Promise((r) => (resolve = r)));
    client.setIdentity("primeiro");
    const pending = client.ai({ message: "Oi", history: [] });
    const rejected = expect(pending).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    client.setIdentity("segundo");
    await rejected;
    resolve({
      data: {
        source: "sankhya",
        readOnly: true,
        readAt: new Date().toISOString(),
        answer: "oi",
        model: "m",
        sources: [],
      },
      error: null,
    });
  });
  it("cliente recusa resposta vazia", async () => {
    const client = createERPClient(async () => ({
      data: {
        source: "sankhya",
        readOnly: true,
        readAt: new Date().toISOString(),
        answer: "",
        model: "m",
        sources: [],
      },
      error: null,
    }));
    await expect(client.ai({ message: "Oi", history: [] })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
