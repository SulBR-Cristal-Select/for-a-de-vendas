import { decimalUnits, erpDecimal, sumERPDecimals } from "./erp-decimal.ts";

export const SUBMISSION_HASH_FORMAT = "sha256-json-numerico-v1" as const;
export type FreightType = "C" | "F";
export type SubmissionPhase =
  "inclusao_incerta" | "incluido" | "confirmacao_incerta" | "confirmacao_falhou" | "confirmado";
/** Única persistência adicional: recibo aprovado no plano; não contém respostas da API. */
export type SubmissionReceipt = {
  id: string;
  hash: string;
  approvedBy: string;
  approvedAt: string;
  phase: SubmissionPhase;
  nunota: number | null;
  status: string | null;
  checkedAt: string | null;
  errorCode: string | null;
};
export type CanonicalItem = {
  sequencia: number;
  codigo_produto: number;
  descricao: string;
  marca: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  codigo_estoque: number;
  controle: string;
  percentual_desconto: 0;
  origens: Record<string, "cadastro" | "usuario">;
};
export type CanonicalOrder = {
  pedido_id: string;
  tipo: "venda";
  codigo_empresa: 1 | 4;
  codigo_parceiro: number;
  codigo_vendedor: number;
  codigo_top: 1001;
  codigo_condicao: number;
  codigo_natureza: 10100000;
  tipo_agenda: string;
  tipo_movimento: "P";
  data_negociacao: string;
  data_prevista: string;
  numero_externo: string;
  frete_codigo: FreightType;
  itens: CanonicalItem[];
  total: number;
};
export type Canonical = {
  schema_version: "1.1";
  analise_id: string;
  modo: "envio";
  estado: "pronto_para_confirmar" | "aprovado";
  fonte: { tipo: "texto"; referencia: string; numero_externo: string };
  cliente: {
    codigo_sankhya: number;
    nome: string;
    cnpj: string;
    uf: string;
    origem: "cadastro";
    codigo_condicao: number;
    tipo_agenda: string;
  };
  pedidos_fiscais: [CanonicalOrder];
  validacoes: { regra: string; status: "ok"; mensagem: string; evidencias: string[] }[];
  pendencias: [];
  aprovacao: {
    versao: 1;
    acao: "incluir_e_confirmar";
    hash_formato: typeof SUBMISSION_HASH_FORMAT;
    status: "pendente" | "aprovado";
    hash_conteudo?: string;
    aprovado_por?: string;
    aprovado_em?: string;
  };
};
export type SubmissionReview = {
  orderId: string;
  fingerprint: string;
  hash: string;
  canonical: Canonical;
  receipt: SubmissionReceipt | null;
};
export type SubmissionResult = { orderId: string; receipt: SubmissionReceipt; verified: boolean };
export type InclusionPayload = {
  nota: {
    cabecalho: Record<string, Record<string, string>>;
    itens: { INFORMARPRECO: "True"; item: Record<string, Record<string, string>>[] };
  };
};
export type Row = Record<string, unknown>;
export function record(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Estrutura do pedido inválida.");
  return value as Row;
}
export function positiveCode(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw new Error("Código comercial inválido.");
  return value;
}
export function requiredText(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error("Campo obrigatório do pedido não confirmado.");
  return value;
}
export function decimalText(value: unknown): string {
  if (erpDecimal(value) === null) throw new Error("Valor decimal do pedido inválido.");
  return value as string;
}
/** O schema1.1 exige números JSON; toda conta fica em BigInt e a serialização deve voltar ao decimal exato. */
export function canonicalDecimal(value: number): string {
  const text = String(value),
    expanded = erpDecimal(text) === null ? value.toFixed(9) : text;
  if (erpDecimal(expanded) === null || Number(expanded) !== value)
    throw new Error("Número canônico incompatível.");
  return expanded;
}
function exactNumber(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || decimalUnits(canonicalDecimal(n)) !== decimalUnits(value))
    throw new Error("Valor não representável no contrato canônico sem perda.");
  return n;
}
export function businessDay(value: unknown): string {
  const date = requiredText(value);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date + "T00:00:00Z")) ||
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date
  )
    throw new Error("Data do pedido inválida.");
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Número não finito.");
    // Mesmo limiar/expoente de json.dumps do validador Python, após normalizar floats inteiros.
    if (!Number.isInteger(value) && Math.abs(value) < 0.0001)
      return value.toExponential().replace(/e([+-])(\d)$/, "e$10$2");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
  const row = record(value);
  return (
    "{" +
    Object.keys(row)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonicalJSON(row[k]))
      .join(",") +
    "}"
  );
}
export async function canonicalHash(canonical: Canonical): Promise<string> {
  const { aprovacao, estado: _state, ...base } = canonical;
  const signed = {
    ...base,
    versao_aprovada: aprovacao.versao,
    acao_aprovada: aprovacao.acao,
    formato_hash: aprovacao.hash_formato,
  };
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJSON(signed))),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
/** Montagem determinística a partir do pedido salvo e cadastro conferido no servidor. */
export function makeCanonical(
  saved: Row,
  customer: { cnpj: string; uf: string },
  freight: FreightType,
): Canonical {
  if (!["C", "F"].includes(freight)) throw new Error("Escolha CIF ou FOB.");
  const id = requiredText(saved["id"]),
    erp = record(saved["erp"]),
    buyer = record(erp["customer"]),
    payment = record(erp["payment"]);
  const company = positiveCode(erp["companyCode"]);
  if (
    erp["source"] !== "sankhya" ||
    erp["mode"] !== "online" ||
    company !== 1 ||
    erp["operationCode"] !== 1001 ||
    saved["type"] !== "Venda" ||
    saved["status"] === "Cancelado"
  )
    throw new Error("Pedido fora do contrato de venda padrão.");
  const partner = positiveCode(buyer["partnerCode"]),
    condition = positiveCode(payment["code"]);
  if (
    saved["customerId"] !== `sankhya:customer:${partner}` ||
    !/^\d{14}$/.test(customer.cnpj) ||
    !/^[A-Z]{2}$/.test(customer.uf)
  )
    throw new Error("Cliente do pedido não confirmado.");
  const agenda = /^([1-4]) - (IMEDIATO|AGENDADO|FOB|ANTECIPADO)$/.exec(
    requiredText(saved["agenda"]),
  );
  if (!agenda || ["IMEDIATO", "AGENDADO", "FOB", "ANTECIPADO"][Number(agenda[1]) - 1] !== agenda[2])
    throw new Error("Tipo de Agenda inválido.");
  if (!Array.isArray(saved["items"]) || !saved["items"].length || saved["items"].length > 50)
    throw new Error("Pedido deve conter de um a cinquenta itens.");
  const ids = new Set<number>();
  const items = saved["items"].map((raw, index): CanonicalItem => {
    const item = record(raw),
      snapshot = record(item["erp"]),
      product = record(snapshot["product"]);
    const productCode = positiveCode(product["productCode"]),
      local = snapshot["localCode"],
      control = snapshot["control"];
    if (
      ids.has(productCode) ||
      item["productId"] !== `sankhya:product:${productCode}` ||
      snapshot["source"] !== "sankhya" ||
      snapshot["mode"] !== "online" ||
      snapshot["companyCode"] !== company ||
      typeof local !== "number" ||
      !Number.isSafeInteger(local) ||
      local < 0 ||
      typeof control !== "string" ||
      control.length > 17 ||
      Array.from(control).some((character) => character.charCodeAt(0) < 32)
    )
      throw new Error("Produto, local ou controle não confirmado.");
    ids.add(productCode);
    const qty = decimalText(item["qty"]),
      price = decimalText(item["price"]),
      total = decimalText(item["total"]);
    const q = decimalUnits(qty),
      p = decimalUnits(price),
      t = decimalUnits(total);
    if (
      q <= 0n ||
      p <= 0n ||
      t <= 0n ||
      q % 10000n !== 0n ||
      t % 10000000n !== 0n ||
      q * p !== t * 1000000000n
    )
      throw new Error("Quantidade, preço ou total exigem arredondamento incompatível.");
    const unit = requiredText(item["unit"]);
    if (unit.length > 12) throw new Error("Unidade inválida.");
    return {
      sequencia: index + 1,
      codigo_produto: productCode,
      descricao: requiredText(product["name"]),
      marca: "",
      unidade: unit,
      quantidade: exactNumber(qty),
      valor_unitario: exactNumber(price),
      valor_total: exactNumber(total),
      codigo_estoque: local,
      controle: control,
      percentual_desconto: 0,
      origens: {
        produto: "cadastro",
        unidade: "cadastro",
        quantidade: "usuario",
        preco: "cadastro",
        estoque: "cadastro",
      },
    };
  });
  const total = decimalText(saved["total"]);
  if (
    decimalUnits(total) !==
    decimalUnits(sumERPDecimals(items.map((i) => canonicalDecimal(i.valor_total))))
  )
    throw new Error("Total do pedido difere dos itens.");
  const external = requiredText(saved["clientOrder"]);
  const order: CanonicalOrder = {
    pedido_id: id,
    tipo: "venda",
    codigo_empresa: company as 1 | 4,
    codigo_parceiro: partner,
    codigo_vendedor: positiveCode(erp["sellerCode"]),
    codigo_top: 1001,
    codigo_condicao: condition,
    codigo_natureza: 10100000,
    tipo_agenda: agenda[1]!,
    tipo_movimento: "P",
    data_negociacao: businessDay(saved["date"]),
    data_prevista: businessDay(saved["delivery"]),
    numero_externo: external,
    frete_codigo: freight,
    itens: items,
    total: exactNumber(total),
  };
  return {
    schema_version: "1.1",
    analise_id: id,
    modo: "envio",
    estado: "pronto_para_confirmar",
    fonte: { tipo: "texto", referencia: `pedido-local:${id}`, numero_externo: external },
    cliente: {
      codigo_sankhya: partner,
      nome: requiredText(buyer["name"]),
      cnpj: customer.cnpj,
      uf: customer.uf,
      origem: "cadastro",
      codigo_condicao: condition,
      tipo_agenda: order.tipo_agenda,
    },
    pedidos_fiscais: [order],
    validacoes: [
      {
        regra: "pedido_local_online",
        status: "ok",
        mensagem: "Pedido salvo, contexto nativo e cadastro conferidos.",
        evidencias: [
          "Auth/owner",
          "TGFCPL.SUGTIPNEGSAID",
          "TGFPAR.AD_STATUS_PEDIDO",
          "TGFNAT",
          "price-query",
        ],
      },
    ],
    pendencias: [],
    aprovacao: {
      versao: 1,
      acao: "incluir_e_confirmar",
      hash_formato: SUBMISSION_HASH_FORMAT,
      status: "pendente",
    },
  };
}
/** Equivalente ao construtor da skill2.0.2; controle do contexto nativo também é preservado. */
export async function inclusionPayload(canonical: Canonical): Promise<InclusionPayload> {
  const approval = canonical.aprovacao;
  if (
    canonical.schema_version !== "1.1" ||
    canonical.modo !== "envio" ||
    canonical.estado !== "aprovado" ||
    approval.status !== "aprovado" ||
    approval.acao !== "incluir_e_confirmar" ||
    !approval.aprovado_por ||
    !approval.aprovado_em ||
    approval.hash_formato !== SUBMISSION_HASH_FORMAT ||
    approval.hash_conteudo !== (await canonicalHash(canonical)) ||
    canonical.pedidos_fiscais.length !== 1 ||
    canonical.pendencias.length
  )
    throw new Error("Aprovação do pedido inválida.");
  const p = canonical.pedidos_fiscais[0],
    field = (v: string | number) => ({ $: String(v) });
  return {
    nota: {
      cabecalho: {
        NUNOTA: {},
        CODEMP: field(p.codigo_empresa),
        CODPARC: field(p.codigo_parceiro),
        CODVEND: field(p.codigo_vendedor),
        CODTIPOPER: field(p.codigo_top),
        CODTIPVENDA: field(p.codigo_condicao),
        TIPMOV: field("P"),
        DTNEG: field(p.data_negociacao),
        DTPREVENT: field(p.data_prevista),
        NUMPEDIDO2: field(p.numero_externo),
        CIF_FOB: field(p.frete_codigo),
        AD_STATUS_PEDIDO: field(p.tipo_agenda),
        CODNAT: field(p.codigo_natureza),
      },
      itens: {
        INFORMARPRECO: "True",
        item: p.itens.map((i) => ({
          NUNOTA: {},
          CODPROD: field(i.codigo_produto),
          QTDNEG: field(canonicalDecimal(i.quantidade)),
          CODVOL: field(i.unidade),
          CODLOCALORIG: field(i.codigo_estoque),
          ...(i.controle.trim() ? { CONTROLE: field(i.controle) } : {}),
          VLRUNIT: field(canonicalDecimal(i.valor_unitario)),
          PERCDESC: field(0),
          IGNOREDESCPROMOQTD: field("True"),
        })),
      },
    },
  };
}
