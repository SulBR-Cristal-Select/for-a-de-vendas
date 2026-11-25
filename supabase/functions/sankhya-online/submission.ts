import { checkOrderRegistry } from "./registry-validation.ts";
import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import { actorScope, operationSeller, loggedSeller, type CommercialActor } from "./identity.ts";
import { readPrice } from "./price-context.ts";
import { readRecord } from "./read-model.ts";
import type { RPC } from "./transactions.ts";
import {
  canonicalDecimal,
  canonicalHash,
  inclusionPayload,
  makeCanonical,
  record,
  positiveCode,
  requiredText,
  type Canonical,
  type CanonicalOrder,
  type FreightType,
  type Row,
  type SubmissionReceipt,
  type SubmissionReview,
  type SubmissionResult,
} from "../../../src/lib/erp-submission-contract.ts";
import { decimalUnits, erpDecimal } from "../../../src/lib/erp-decimal.ts";

type Gateway = Pick<SankhyaGateway, "select" | "contextPrices" | "includeOrder" | "confirmOrder">;
export type ReceiptWriter = (
  args: Row,
) => Promise<{ acquired: boolean; receipt: SubmissionReceipt }>;
export type SubmissionDeps = {
  gateway: Gateway;
  actor: CommercialActor;
  rpc: RPC;
  write: ReceiptWriter;
  now?: () => string;
};
const fail = (code: string, message: string, status = 409): never => {
  throw new SankhyaError(code, message, status);
};
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const digest = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const literal = (v: string) => "'" + v.replace(/'/g, "''") + "'";
const now = (d: SubmissionDeps) => (d.now ?? (() => new Date().toISOString()))();
const safeError = (e: unknown) =>
  e instanceof SankhyaError && /^[A-Z][A-Z0-9_]{0,63}$/.test(e.code)
    ? e.code
    : "ERP_SUBMISSION_UNCERTAIN";
function request(value: unknown, operation: "review" | "submit" | "status") {
  const input = record(value),
    allowed =
      operation === "status"
        ? ["orderId"]
        : operation === "review"
          ? ["orderId", "freightType"]
          : ["orderId", "freightType", "hash", "fingerprint", "requestId", "approved"];
  if (Object.keys(input).some((k) => !allowed.includes(k)) || !uuid(input["orderId"]))
    return fail("INVALID_REQUEST", "Parâmetros de envio inválidos.", 400);
  if (operation !== "status" && !["C", "F"].includes(String(input["freightType"])))
    return fail("INVALID_REQUEST", "Escolha CIF ou FOB.", 400);
  if (
    operation === "submit" &&
    (!digest(input["hash"]) ||
      !digest(input["fingerprint"]) ||
      !uuid(input["requestId"]) ||
      input["approved"] !== true)
  )
    return fail("INVALID_REQUEST", "Aprovação explícita da conferência atual necessária.", 400);
  return input as Row & {
    orderId: string;
    freightType: FreightType;
    hash: string;
    fingerprint: string;
    requestId: string;
  };
}
async function load(d: SubmissionDeps, id: string) {
  const scope = actorScope(d.actor);
  loggedSeller(scope);
  const response = await d.rpc("erp_submission_read", { p_order_id: id });
  if (response.error) {
    const e = record(response.error);
    if (e["code"] === "42501")
      return fail("FORBIDDEN", "Pedido fora do vínculo comercial do titular.", 403);
    if (e["code"] === "PT409")
      return fail("REVISION_CONFLICT", "Pedido alterado; confira novamente.");
    return fail(
      "ERP_SUBMISSION_UNAVAILABLE",
      "Não foi possível recuperar o pedido para envio.",
      503,
    );
  }
  const result = record(response.data),
    order = record(result["order"]),
    erp = record(order["erp"]);
  if (order["id"] !== id || order["sellerId"] !== d.actor.id || !digest(result["fingerprint"]))
    return fail("ERP_INVALID_RESPONSE", "Pedido do servidor incompatível.", 502);
  operationSeller(scope, erp["sellerCode"]);
  if (erp["companyCode"] !== 1 || !scope.companyCodes?.includes(erp["companyCode"] as 1 | 4))
    return fail("ERP_SCOPE_FORBIDDEN", "Filial fora do acesso do titular.", 403);
  return {
    order,
    fingerprint: result["fingerprint"],
    receipt: (order["receipt"] ?? null) as SubmissionReceipt | null,
  };
}
async function prepare(
  d: SubmissionDeps,
  order: Row,
  freight: FreightType,
  reprice: boolean,
): Promise<Canonical> {
  const scope = actorScope(d.actor),
    erp = record(order["erp"]),
    items = order["items"];
  if (!Array.isArray(items) || !items.length || items.length > 50)
    return fail("ERP_CONTEXT_REQUIRED", "Pedido precisa ter de um a cinquenta itens.", 400);
  let buyer: Row | undefined;
  if (reprice) {
    for (const raw of items) {
      const item = record(raw),
        snapshot = record(item["erp"]);
      const quote = await readPrice(
        d.gateway,
        {
          customerId: requiredText(order["customerId"]),
          productId: requiredText(item["productId"]),
          type: "Venda",
          paymentCode: positiveCode(record(erp["payment"])["code"]),
          date: requiredText(order["date"]),
          quantity: Number(item["qty"]),
          unit: requiredText(item["unit"]),
          sellerCode: operationSeller(scope, erp["sellerCode"]),
        },
        scope,
      );
      if (
        quote.companyCode !== erp["companyCode"] ||
        quote.operationCode !== erp["operationCode"] ||
        quote.operationVersion !== erp["operationVersion"] ||
        quote.payment.version !== record(erp["payment"])["version"] ||
        quote.price.localCode !== snapshot["localCode"] ||
        quote.price.control !== snapshot["control"] ||
        erpDecimal(String(quote.price.amount)) === null ||
        decimalUnits(String(quote.price.amount)) !== decimalUnits(String(item["price"]))
      )
        return fail(
          "ERP_PRICE_CHANGED",
          "Contexto ou preço mudou desde o salvamento. Atualize o pedido antes de aprovar.",
        );
      buyer ??= record(quote.customer);
    }
  } else {
    const result = await readRecord(
      d.gateway,
      { resource: "customers", id: requiredText(order["customerId"]) },
      scope,
    );
    if (!result.record)
      return fail("ERP_CONTEXT_REQUIRED", "Cadastro do cliente não está disponível.", 400);
    buyer = record(result.record);
  }
  let canonical: Canonical;
  try {
    canonical = makeCanonical(
      order,
      { cnpj: String(buyer?.["cnpj"] ?? ""), uf: String(buyer?.["state"] ?? "") },
      freight,
    );
  } catch (e) {
    return fail("ERP_CONTEXT_REQUIRED", e instanceof Error ? e.message : "Pedido incompleto.", 400);
  }
  if (canonical.pedidos_fiscais[0].numero_externo.length > 15)
    return fail(
      "ERP_EXTERNAL_NUMBER_TOO_LONG",
      "O Nº Pedido do Cliente excede 15 caracteres (limite do Sankhya). Ajuste o pedido antes de enviar; nenhum envio foi feito.",
      400,
    );
  await checkOrderRegistry(d.gateway, canonical.pedidos_fiscais[0]);
  return canonical;
}
const money = (alias: string, field: string) =>
  `TO_CHAR(${alias}.${field},'TM9','NLS_NUMERIC_CHARACTERS = ''.,''') ${field}`;
async function headers(d: SubmissionDeps, p: CanonicalOrder, nunota?: number): Promise<Row[]> {
  const where = nunota
    ? `C.NUNOTA=${positiveCode(nunota)}`
    : `C.CODPARC=${p.codigo_parceiro} AND C.NUMPEDIDO2=${literal(p.numero_externo)}`;
  const rows = await d.gateway.select(
    `SELECT C.NUNOTA,C.CODEMP,C.CODPARC,C.CODVEND,C.CODTIPOPER,C.CODTIPVENDA,C.CODNAT,C.AD_STATUS_PEDIDO,C.TIPMOV,
TO_CHAR(C.DTNEG,'DD/MM/YYYY') DTNEG,TO_CHAR(C.DTPREVENT,'DD/MM/YYYY') DTPREVENT,C.NUMPEDIDO2,C.CIF_FOB,C.STATUSNOTA,${money("C", "VLRNOTA")},
CASE WHEN C.OBSERVACAO IS NULL OR LENGTH(TRIM(C.OBSERVACAO))=0 THEN 'S' ELSE 'N' END OBSERVACAO_VAZIA
FROM TGFCAB C WHERE C.CODEMP=${p.codigo_empresa} AND C.TIPMOV='P' AND ${where} AND ROWNUM<=50`,
    50,
  );
  if (rows.length >= 50)
    return fail("ERP_ORDER_AMBIGUOUS", "Número externo com candidatos demais; não reenviar.");
  return rows;
}
async function verify(
  d: SubmissionDeps,
  p: CanonicalOrder,
  cab: Row,
): Promise<{ nunota: number; status: string }> {
  const numeric: Record<string, number> = {
    CODEMP: p.codigo_empresa,
    CODPARC: p.codigo_parceiro,
    CODVEND: p.codigo_vendedor,
    CODTIPOPER: p.codigo_top,
    CODTIPVENDA: p.codigo_condicao,
    CODNAT: p.codigo_natureza,
  };
  const texts: Record<string, string> = {
    TIPMOV: "P",
    DTNEG: p.data_negociacao,
    DTPREVENT: p.data_prevista,
    NUMPEDIDO2: p.numero_externo,
    CIF_FOB: p.frete_codigo,
    AD_STATUS_PEDIDO: p.tipo_agenda,
  };
  if (
    Object.entries(numeric).some(([k, v]) => Number(cab[k]) !== v) ||
    Object.entries(texts).some(
      ([k, v]) => typeof cab[k] !== "string" || cab[k].trim() !== v.trim(),
    ) ||
    cab["OBSERVACAO_VAZIA"] !== "S" ||
    erpDecimal(cab["VLRNOTA"]) === null ||
    decimalUnits(cab["VLRNOTA"] as string) !== decimalUnits(canonicalDecimal(p.total))
  )
    return fail(
      "ERP_ORDER_DIVERGED",
      "Pedido no ERP diverge da versão aprovada; não confirmar nem reincluir.",
    );
  const nunota = positiveCode(Number(cab["NUNOTA"]));
  const rows = await d.gateway.select(
    `SELECT I.CODPROD,I.CODVOL,I.CODLOCALORIG,I.CONTROLE,${money("I", "QTDNEG")},${money("I", "VLRUNIT")},${money("I", "VLRTOT")},${money("I", "PERCDESC")}
FROM TGFITE I WHERE I.NUNOTA=${nunota} AND ROWNUM<=50 ORDER BY I.SEQUENCIA`,
    50,
  );
  if (rows.length === 50) {
    const extra = await d.gateway.select(
      `SELECT X.NUNOTA FROM (SELECT I.NUNOTA,ROW_NUMBER() OVER(ORDER BY I.SEQUENCIA) RN FROM TGFITE I WHERE I.NUNOTA=${nunota}) X WHERE X.RN=51 AND ROWNUM<=1`,
      1,
    );
    if (extra.length)
      return fail("ERP_ORDER_DIVERGED", "Pedido ERP contém itens além da versão aprovada.");
  }
  const signature = (
    product: number,
    unit: string,
    local: number,
    control: string,
    qty: string,
    price: string,
    total: string,
    discount: string,
  ) =>
    JSON.stringify([
      product,
      unit.trim(),
      local,
      control,
      decimalUnits(qty).toString(),
      decimalUnits(price).toString(),
      decimalUnits(total).toString(),
      decimalUnits(discount).toString(),
    ]);
  let actual: string[];
  try {
    actual = rows
      .map((r) => {
        if (
          typeof r["CONTROLE"] !== "string" ||
          typeof r["CODVOL"] !== "string" ||
          r["CODLOCALORIG"] === null ||
          !Number.isSafeInteger(Number(r["CODLOCALORIG"]))
        )
          throw new Error();
        const approved = p.itens.find((i) => i.codigo_produto === Number(r["CODPROD"])),
          local =
            approved?.codigo_estoque === 0 && Number(r["CODLOCALORIG"]) > 0
              ? 0
              : Number(r["CODLOCALORIG"]);
        return signature(
          positiveCode(Number(r["CODPROD"])),
          r["CODVOL"],
          local,
          r["CONTROLE"],
          String(r["QTDNEG"]),
          String(r["VLRUNIT"]),
          String(r["VLRTOT"]),
          String(r["PERCDESC"]),
        );
      })
      .sort();
  } catch {
    return fail("ERP_ORDER_DIVERGED", "Itens ERP sem correspondência exata com a aprovação.");
  }
  const expected = p.itens
    .map((i) =>
      signature(
        i.codigo_produto,
        i.unidade,
        i.codigo_estoque,
        i.controle,
        canonicalDecimal(i.quantidade),
        canonicalDecimal(i.valor_unitario),
        canonicalDecimal(i.valor_total),
        "0",
      ),
    )
    .sort();
  if (
    JSON.stringify(actual) !== JSON.stringify(expected) ||
    typeof cab["STATUSNOTA"] !== "string" ||
    !/^[A-Z]$/.test(cab["STATUSNOTA"])
  )
    return fail(
      "ERP_ORDER_DIVERGED",
      "Itens ou status ERP divergentes; não confirmar nem reincluir.",
    );
  return { nunota, status: cab["STATUSNOTA"] };
}
export async function reviewSubmission(
  d: SubmissionDeps,
  input: unknown,
): Promise<SubmissionReview> {
  const q = request(input, "review"),
    saved = await load(d, q.orderId);
  if (saved.receipt && saved.order["freightType"] !== q.freightType)
    return fail("ERP_APPROVAL_CHANGED", "CIF/FOB não pode mudar após iniciar o envio.");
  const canonical = await prepare(d, saved.order, q.freightType, !saved.receipt),
    hash = await canonicalHash(canonical);
  if (saved.receipt?.hash && saved.receipt.hash !== hash)
    return fail(
      "ERP_APPROVAL_CHANGED",
      "A versão atual não corresponde à aprovação preservada. Não reenviar.",
    );
  return {
    orderId: q.orderId,
    fingerprint: saved.fingerprint,
    hash,
    canonical,
    receipt: saved.receipt,
  };
}
export async function submissionStatus(d: SubmissionDeps, input: unknown) {
  const q = request(input, "status"),
    saved = await load(d, q.orderId);
  return { orderId: q.orderId, receipt: saved.receipt };
}
export async function submitOrder(d: SubmissionDeps, input: unknown): Promise<SubmissionResult> {
  const q = request(input, "submit"),
    saved = await load(d, q.orderId);
  if (q.fingerprint !== saved.fingerprint)
    return fail("REVISION_CONFLICT", "Pedido alterado desde a conferência.");
  if (saved.receipt && saved.order["freightType"] !== q.freightType)
    return fail("ERP_APPROVAL_CHANGED", "CIF/FOB não pode mudar após iniciar o envio.");
  const canonical = await prepare(d, saved.order, q.freightType, !saved.receipt),
    hash = await canonicalHash(canonical),
    p = canonical.pedidos_fiscais[0];
  if (q.hash !== hash || (saved.receipt && saved.receipt.hash !== hash))
    return fail("ERP_APPROVAL_CHANGED", "Conteúdo diferente da conferência aprovada.");
  let receipt: SubmissionReceipt = saved.receipt ?? {
    id: q.requestId,
    hash,
    approvedBy: d.actor.id,
    approvedAt: now(d),
    phase: "inclusao_incerta",
    nunota: null,
    status: null,
    checkedAt: null,
    errorCode: null,
  };
  const result = (verified = false): SubmissionResult => ({
    orderId: q.orderId,
    receipt,
    verified,
  });
  const save = async (next: SubmissionReceipt, expected: string | null) => {
    const value = await d.write({
      p_actor_id: d.actor.id,
      p_order_id: q.orderId,
      p_fingerprint: saved.fingerprint,
      p_freight_type: q.freightType,
      p_expected_phase: expected,
      p_receipt: next,
    });
    receipt = value.receipt;
    return value.acquired;
  };
  // Consulta antes da primeira inclusão e de qualquer retomada. Nunca usa Observação como marcador.
  const candidates = await headers(d, p);
  if (candidates.length > 1)
    return fail(
      "ERP_ORDER_AMBIGUOUS",
      "Mais de um pedido possui o número externo; não incluir nem confirmar.",
    );
  let observed: cabResult | undefined;
  if (candidates[0]) observed = await verify(d, p, candidates[0]);
  if (saved.receipt) {
    if (!observed) return result(); // Sem prova de ausência de efeito: a inclusão NÃO é repetida.
    if (receipt.nunota !== null && receipt.nunota !== observed.nunota)
      return fail("ERP_ORDER_DIVERGED", "NUNOTA difere do recibo preservado.");
  } else {
    if (!(await save(receipt, null))) return result(); // Outra chamada ganhou a aquisição; esta não escreve no ERP.
    if (!observed) {
      canonical.estado = "aprovado";
      canonical.aprovacao = {
        ...canonical.aprovacao,
        status: "aprovado",
        hash_conteudo: hash,
        aprovado_por: receipt.approvedBy,
        aprovado_em: receipt.approvedAt,
      };
      try {
        const nunota = await d.gateway.includeOrder(await inclusionPayload(canonical));
        await save({ ...receipt, phase: "incluido", nunota, errorCode: null }, "inclusao_incerta");
        const rows = await headers(d, p, nunota);
        if (rows.length !== 1 || Number(rows[0]?.["NUNOTA"]) !== nunota) return result();
        observed = await verify(d, p, rows[0]!);
      } catch (error) {
        await save({ ...receipt, errorCode: safeError(error) }, receipt.phase);
        return result();
      }
    }
  }
  if (!observed) return result();
  if (receipt.phase === "confirmado" && observed.status !== "L")
    return fail("ERP_ORDER_DIVERGED", "Status ERP regrediu após a confirmação; não repetir.");
  if (observed.status === "L") {
    await save(
      {
        ...receipt,
        phase: "confirmado",
        nunota: observed.nunota,
        status: "L",
        checkedAt: now(d),
        errorCode: null,
      },
      receipt.phase,
    );
    return result(true);
  }
  if (!["A", "P"].includes(observed.status))
    return fail("ERP_ORDER_DIVERGED", "Status ERP não permite confirmação.");
  if (receipt.phase === "confirmacao_incerta") return result(); // Timeout não autoriza uma nova confirmação automática.
  if (receipt.phase === "inclusao_incerta") {
    if (
      !(await save(
        {
          ...receipt,
          phase: "incluido",
          nunota: observed.nunota,
          status: observed.status,
          checkedAt: now(d),
          errorCode: null,
        },
        "inclusao_incerta",
      ))
    )
      return result();
  }
  await checkOrderRegistry(d.gateway, p);
  if (
    !(await save(
      {
        ...receipt,
        phase: "confirmacao_incerta",
        nunota: observed.nunota,
        status: observed.status,
        checkedAt: now(d),
        errorCode: null,
      },
      receipt.phase,
    ))
  )
    return result();
  try {
    await d.gateway.confirmOrder(observed.nunota);
    const rows = await headers(d, p, observed.nunota);
    if (rows.length !== 1) return result();
    const checked = await verify(d, p, rows[0]!);
    if (checked.nunota !== observed.nunota || checked.status !== "L") return result();
    await save(
      { ...receipt, phase: "confirmado", status: "L", checkedAt: now(d), errorCode: null },
      "confirmacao_incerta",
    );
    return result(true);
  } catch (error) {
    await save(
      {
        ...receipt,
        phase:
          error instanceof SankhyaError && error.code === "ERP_CONFIRMATION_REJECTED"
            ? "confirmacao_falhou"
            : "confirmacao_incerta",
        errorCode: safeError(error),
      },
      "confirmacao_incerta",
    );
    return result();
  }
}
type cabResult = { nunota: number; status: string };
