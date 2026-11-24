import { describe, expect, it, vi } from "vitest";
import {
  canonicalHash,
  canonicalDecimal,
  inclusionPayload,
  type Canonical,
  type SubmissionReceipt,
  type SubmissionReview,
} from "./erp-submission-contract";
import { createSubmissionClient, decodeSubmissionReceipt } from "./erp-submission";
import { SankhyaGateway } from "../../supabase/functions/sankhya-online/gateway";
import {
  canonicalFixture,
  fixtureActorId as actorId,
  fixtureOrderId as orderId,
  fixtureRequestId as requestId,
  fixtureFingerprint as fingerprint,
} from "../test/submission-fixture";
import vectors from "../test/fixtures/submission-golden.json";
const receipt = (hash: string): SubmissionReceipt => ({
  id: requestId,
  hash,
  approvedBy: actorId,
  approvedAt: "2026-10-26T11:56:00Z",
  phase: "confirmado",
  nunota: 101,
  status: "L",
  checkedAt: "2026-10-26T11:56:01Z",
  errorCode: null,
});
async function review(): Promise<SubmissionReview> {
  const canonical = canonicalFixture();
  return { orderId, fingerprint, hash: await canonicalHash(canonical), canonical, receipt: null };
}
describe("equivalência com skill Pedidos2.0.2", () => {
  it.each(vectors)("hash e payload conferidos pelo Python/schema: $name", async (vector) => {
    expect(vector.schemaValidado).toBe(true);
    const c = vector.canonical as unknown as Canonical;
    expect(await canonicalHash(c)).toBe(vector.hashPython);
    const actual = await inclusionPayload(c),
      expected = structuredClone(vector.payloadPython);
    for (const item of expected.nota.itens.item) {
      for (const field of ["QTDNEG", "VLRUNIT"] as const)
        item[field].$ = canonicalDecimal(Number(item[field].$));
    }
    const controls = actual.nota.itens.item.map((i) => i["CONTROLE"]);
    for (const item of actual.nota.itens.item) delete item["CONTROLE"];
    expect(actual).toEqual(expected);
    expect(controls).toEqual(
      c.pedidos_fiscais[0].itens.map((i) => (i.controle.trim() ? { $: i.controle } : undefined)),
    );
  });
  it("aprovação e estado não mudam o hash de conteúdo, mas frete muda", async () => {
    const c = canonicalFixture(),
      hash = await canonicalHash(c);
    c.estado = "aprovado";
    c.aprovacao.status = "aprovado";
    expect(await canonicalHash(c)).toBe(hash);
    c.pedidos_fiscais[0].frete_codigo = "F";
    expect(await canonicalHash(c)).not.toBe(hash);
  });
});
describe("cliente de envio sem repetição automática", () => {
  it("não envia sem identidade autenticada", async () => {
    const transport = vi.fn(),
      client = createSubmissionClient(transport);
    await expect(client.review(orderId, "C")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("conferir é leitura; aprovação envia só os identificadores/hash/código de frete", async () => {
    const view = await review(),
      transport = vi
        .fn()
        .mockResolvedValueOnce({ data: view, error: null })
        .mockResolvedValueOnce({
          data: { orderId, receipt: receipt(view.hash), verified: true },
          error: null,
        }),
      client = createSubmissionClient(transport);
    client.setIdentity(actorId);
    const r = await client.review(orderId, "C");
    expect(transport.mock.calls[0]?.[0].operation).toBe("order-send-review");
    const sent = await client.submit(r, { approved: true, requestId });
    expect(sent.verified).toBe(true);
    expect(transport.mock.calls[1]?.[0]).toEqual({
      operation: "order-send-submit",
      query: { orderId, freightType: "C", hash: view.hash, fingerprint, requestId, approved: true },
    });
  });
  it("hash incompatível não permite mostrar aprovação", async () => {
    const view = await review(),
      client = createSubmissionClient(async () => ({
        data: { ...view, hash: "b".repeat(64) },
        error: null,
      }));
    client.setIdentity(actorId);
    await expect(client.review(orderId, "C")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("troca de conta descarta resposta da conferência anterior", async () => {
    let finish!: (v: { data: unknown; error: unknown }) => void;
    const client = createSubmissionClient(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    client.setIdentity(actorId);
    const pending = client.review(orderId, "C");
    client.setIdentity(null);
    finish({ data: await review(), error: null });
    await expect(pending).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  });
  it("falha de rede não repete inclusão e preserva a identificação", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("rede")),
      client = createSubmissionClient(transport);
    client.setIdentity(actorId);
    await expect(client.submit(await review(), { approved: true, requestId })).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0].query.requestId).toBe(requestId);
  });
  it("statusL sem conferência não vira recibo confirmado", async () => {
    const view = await review();
    expect(() => decodeSubmissionReceipt({ ...receipt(view.hash), checkedAt: null })).toThrow();
  });
  it("campos fora do recibo aprovado são recusados", async () => {
    const view = await review();
    expect(() =>
      decodeSubmissionReceipt({ ...receipt(view.hash), respostaCompleta: {} }),
    ).toThrow();
  });
  it("resposta sanitizada não propaga detalhes de erro do provedor", async () => {
    const client = createSubmissionClient(async () => ({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ code: "ERP_ORDER_DIVERGED", message: "detalhe interno não exibir" }),
          { status: 409 },
        ),
      },
    }));
    client.setIdentity(actorId);
    await expect(client.review(orderId, "C")).rejects.toThrow("Pedido ERP diverge");
  });
});
describe("transporte específico de inclusão/confirmação", () => {
  function gateway(response: () => Promise<Response>) {
    const fetcher = vi.fn(response),
      g = new SankhyaGateway(() => undefined, fetcher as typeof fetch);
    vi.spyOn(g, "authenticate").mockResolvedValue("token-sintetico");
    vi.spyOn(g, "ensureCompanyScope").mockResolvedValue([1, 4]);
    return { g, fetcher };
  }
  async function payload() {
    return inclusionPayload(vectors[0]!.canonical as unknown as Canonical);
  }
  it("usa somente CACSP.incluirNota e preço informado", async () => {
    const { g, fetcher } = gateway(
      async () =>
        new Response(
          JSON.stringify({ status: "1", responseBody: { pk: { NUNOTA: { $: "101" } } } }),
        ),
    );
    expect(await g.includeOrder(await payload())).toBe(101);
    const args = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(args[0]).toContain("/mgecom/service.sbr?serviceName=CACSP.incluirNota");
    const body = JSON.parse(String(args[1].body));
    expect(body.requestBody.nota.itens.INFORMARPRECO).toBe("True");
    expect(JSON.stringify(body)).not.toMatch(/faturar|OBSERVACAO/);
  });
  it("confirma o mesmo NUNOTA sem faturar", async () => {
    const { g, fetcher } = gateway(
      async () => new Response(JSON.stringify({ status: "1", responseBody: {} })),
    );
    await g.confirmOrder(101);
    const args = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(args[0]).toContain("serviceName=CACSP.confirmarNota");
    expect(JSON.parse(String(args[1].body)).requestBody.nota.NUNOTA).toEqual({ $: "101" });
  });
  it("HTTP200 sem NUNOTA é incerto", async () => {
    const { g } = gateway(
      async () => new Response(JSON.stringify({ status: "1", responseBody: {} })),
    );
    await expect(g.includeOrder(await payload())).rejects.toMatchObject({
      code: "ERP_INCLUSION_UNCERTAIN",
    });
  });
  it("timeout não é repetido", async () => {
    const { g, fetcher } = gateway(async () => {
      throw new Error("timeout");
    });
    await expect(g.includeOrder(await payload())).rejects.toMatchObject({
      code: "ERP_INCLUSION_UNCERTAIN",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("recusa explícita e resposta incompatível são distintas", async () => {
    const { g } = gateway(async () => new Response(JSON.stringify({ status: "0" })));
    await expect(g.confirmOrder(101)).rejects.toMatchObject({ code: "ERP_CONFIRMATION_REJECTED" });
    const h = gateway(async () => new Response(JSON.stringify({ status: "estranho" })));
    await expect(h.g.confirmOrder(101)).rejects.toMatchObject({
      code: "ERP_CONFIRMATION_UNCERTAIN",
    });
  });
  it("não aceita movimentos ou campos extras", async () => {
    const { g, fetcher } = gateway(async () => new Response("{}"));
    const p = await payload();
    p.nota.cabecalho["OBSERVACAO"] = { $: "indevido" };
    await expect(g.includeOrder(p)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
