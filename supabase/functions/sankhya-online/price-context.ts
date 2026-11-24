import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import { readRecord, type ReadScope } from "./read-model.ts";
import { partnerCompany, saleOperation } from "./policy.ts";
import { validQuantity } from "../../../src/lib/erp-commercial.ts";
import { readEligiblePayment } from "./payments.ts";
import { operationSeller } from "./identity.ts";

type Row = Record<string, unknown>;
type Transport = Pick<SankhyaGateway, "select" | "contextPrices">;
export type PriceInput = {
  customerId: string;
  productId: string;
  paymentCode: number;
  type: "Venda";
  sellerCode?: number;
  quantity?: number;
  unit?: string;
  date?: string;
};
const fail = (code: string, message: string, status = 400): never => {
  throw new SankhyaError(code, message, status);
};
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : fail("ERP_INVALID_RESPONSE", "Resposta de preço ERP incompatível.", 502);
const integer = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
    ? value
    : fail("INVALID_REQUEST", "Código de consulta inválido.");
function responseCode(value: unknown): number {
  if (typeof value === "string" && /^[1-9]\d{0,9}$/.test(value)) value = Number(value);
  return integer(value);
}
export function exactNativeAmount(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number")
    return fail("ERP_INVALID_RESPONSE", "Preço ERP não representável.", 502);
  const text = String(value),
    match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) return fail("ERP_INVALID_RESPONSE", "Preço ERP não representável.", 502);
  const exponent = Number(match[3] || 0),
    fraction = match[2] || "";
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 30)
    return fail("ERP_INVALID_RESPONSE", "Preço ERP não representável.", 502);
  let scale = fraction.length - exponent,
    coefficient = BigInt(match[1]! + fraction);
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale--;
  }
  if (scale > 9 || coefficient <= 0n || coefficient > BigInt(Number.MAX_SAFE_INTEGER))
    return fail("ERP_INVALID_RESPONSE", "Preço ERP não representável.", 502);
  const result = Number(text);
  if (!Number.isFinite(result) || result <= 0)
    return fail("ERP_INVALID_RESPONSE", "Preço ERP não representável.", 502);
  // Conferência decimal, inclusive quando Number.toString usa notação exponencial.
  const check = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(result));
  if (!check) return fail("ERP_INVALID_RESPONSE", "Preço ERP não representável.", 502);
  let checkScale = (check[2] || "").length - Number(check[3] || 0),
    checkCoefficient = BigInt(check[1]! + (check[2] || ""));
  if (checkScale < 0) {
    checkCoefficient *= 10n ** BigInt(-checkScale);
    checkScale = 0;
  }
  while (checkScale > 0 && checkCoefficient % 10n === 0n) {
    checkCoefficient /= 10n;
    checkScale--;
  }
  if (checkScale !== scale || checkCoefficient !== coefficient)
    return fail("ERP_INVALID_RESPONSE", "Preço ERP não representável.", 502);
  return result;
}
export function currentCommercialDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = get("year"),
    month = get("month"),
    day = get("day");
  if (!year || !month || !day)
    return fail("ERP_CONTEXT_REQUIRED", "Data comercial não confirmada.");
  return `${year}-${month}-${day}`;
}
export async function readPrice(gateway: Transport, input: PriceInput, scope: ReadScope) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (k) =>
        ![
          "customerId",
          "productId",
          "paymentCode",
          "type",
          "sellerCode",
          "quantity",
          "unit",
          "date",
        ].includes(k),
    ) ||
    typeof input.customerId !== "string" ||
    typeof input.productId !== "string" ||
    input.type !== "Venda"
  )
    return fail("INVALID_REQUEST", "Contexto comercial inválido.");
  const sellerCode = operationSeller(scope, input.sellerCode);
  const paymentCode = integer(input.paymentCode),
    quantity = input.quantity ?? 1;
  const observedCustomer = await readRecord(
    gateway,
    { resource: "customers", id: input.customerId },
    scope,
  );
  const customer = observedCustomer.record;
  if (!customer || customer.active !== true)
    return fail("ERP_CONTEXT_REQUIRED", "Cliente ativo não confirmado no ERP.");
  const customerERP = object(customer.erp),
    companyCode = partnerCompany(customerERP["companyCode"]);
  if (scope.role === "gestor" && customerERP["sellerCode"] !== sellerCode)
    return fail(
      "ERP_CUSTOMER_SELLER_MISMATCH",
      "O vendedor do pedido deve ser o vendedor cadastrado no cliente.",
      400,
    );
  if (!scope.companyCodes?.includes(companyCode))
    return fail("ERP_SCOPE_FORBIDDEN", "Filial fora do escopo autorizado.", 403);
  const sellerResult = await readRecord(gateway, { resource: "sellers", id: sellerCode }, scope);
  if (
    !sellerResult.record ||
    sellerResult.record.active !== true ||
    sellerResult.record.id !== `sankhya:seller:${sellerCode}` ||
    object(sellerResult.record.erp)["sellerCode"] !== sellerCode
  )
    return fail("ERP_CONTEXT_REQUIRED", "Vendedor ativo não confirmado no ERP.");
  const productResult = await readRecord(
    gateway,
    { resource: "products", id: input.productId },
    scope,
  );
  const product = productResult.record;
  if (!product || product.active !== true)
    return fail("ERP_CONTEXT_REQUIRED", "Produto ativo não confirmado no ERP.");
  const baseUnit = "unit" in product ? product.unit : undefined;
  const unit = input.unit ?? baseUnit;
  if (typeof unit !== "string" || unit !== baseUnit || !validQuantity(product, quantity, unit))
    return fail("ERP_CONTEXT_REQUIRED", "Quantidade ou unidade sem precisão ERP comprovada.");
  if (
    input.date !== undefined &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      !Number.isFinite(Date.parse(input.date + "T00:00:00Z")) ||
      new Date(input.date + "T00:00:00Z").toISOString().slice(0, 10) !== input.date)
  )
    return fail("INVALID_REQUEST", "Data comercial inválida.");
  const date = input.date ?? currentCommercialDay();
  const asOf = `LEAST(SYSDATE,TO_DATE('${date} 23:59:59','YYYY-MM-DD HH24:MI:SS'))`;
  if (typeof customerERP["creditBlocked"] !== "boolean")
    return fail("ERP_CONTEXT_REQUIRED", "Bloqueio a prazo do parceiro não confirmado.");
  const term = await readEligiblePayment(
    gateway,
    {
      partnerCode: integer(customerERP["partnerCode"]),
      companyCode,
      date,
      creditBlocked: customerERP["creditBlocked"],
    },
    paymentCode,
    scope,
  );
  const operationCode = saleOperation(companyCode, input.type),
    productERP = object(product.erp),
    productCode = integer(productERP["productCode"]);
  const operations = await gateway.select(
    `SELECT CODTIPOPER,ATIVO,TIPMOV,TO_CHAR(DHALTER,'YYYY-MM-DD"T"HH24:MI:SS') AS OPERATION_VERSION FROM TGFTOP O WHERE O.CODTIPOPER=${operationCode} AND O.DHALTER=(SELECT MAX(T.DHALTER) FROM TGFTOP T WHERE T.CODTIPOPER=O.CODTIPOPER AND T.DHALTER<=${asOf}) FETCH FIRST 2 ROWS ONLY`,
    2,
  );
  if (
    operations.length !== 1 ||
    Number(operations[0]!["CODTIPOPER"]) !== operationCode ||
    operations[0]!["ATIVO"] !== "S" ||
    operations[0]!["TIPMOV"] !== "P" ||
    typeof operations[0]!["OPERATION_VERSION"] !== "string"
  )
    return fail("ERP_CONTEXT_REQUIRED", "TOP de venda ativa e vigente não confirmada.");
  // Resolve apenas local/controle reais. O valor continua vindo exclusivamente do motor nativo.
  const tables = [
    ...new Set(
      [customerERP["tableCode"], term.tableCode]
        .filter((v) => v !== null && v !== 0)
        .map((v) => responseCode(v)),
    ),
  ];
  // Sem tabela de preço associada (cliente e condição), a cotação não é ambiguidade: é ausência de negócio.
  if (!tables.length)
    return fail("ERP_PRICE_TABLE_MISSING", "Cliente sem tabela de preço associada.", 400);
  const variants = await gateway.select(
    `WITH V AS (SELECT T.NUTAB,ROW_NUMBER() OVER (PARTITION BY T.CODTAB ORDER BY T.DTVIGOR DESC,T.DTALTER DESC,T.NUTAB DESC) AS RN FROM TGFTAB T JOIN TGFNTA N ON N.CODTAB=T.CODTAB WHERE T.CODTAB IN (${tables.join(",")}) AND N.ATIVO='S' AND T.DTVIGOR<=${asOf} AND (T.DTALTER IS NULL OR T.DTALTER<=${asOf})) SELECT DISTINCT E.CODLOCAL,E.CONTROLE FROM TGFEXC E JOIN V ON V.NUTAB=E.NUTAB AND V.RN=1 WHERE E.CODPROD=${productCode} AND E.TIPO='V' ORDER BY E.CODLOCAL,E.CONTROLE FETCH FIRST 2 ROWS ONLY`,
    2,
  );
  if (variants.length === 0)
    return fail(
      "ERP_PRODUCT_PRICE_UNAVAILABLE",
      "Produto sem preço vigente na tabela associada.",
      400,
    );
  if (variants.length !== 1)
    return fail("ERP_PRICE_AMBIGUOUS", "Local e controle sem contexto único de preço.", 502);
  const rawLocal = variants[0]!["CODLOCAL"],
    localCode = Number(rawLocal),
    control = variants[0]!["CONTROLE"];
  if (
    !(typeof rawLocal === "number" || (typeof rawLocal === "string" && /^\d+$/.test(rawLocal))) ||
    !Number.isSafeInteger(localCode) ||
    localCode < 0 ||
    typeof control !== "string" ||
    control.length > 17
  )
    return fail("ERP_CONTEXT_REQUIRED", "Local ou controle ERP não confirmado.");
  const native = await gateway.contextPrices({
    codigoEmpresa: companyCode,
    codigoCliente: integer(customerERP["partnerCode"]),
    codigoVendedor: sellerCode,
    codigoTipoOperacao: operationCode,
    codigoTipoNegociacao: paymentCode,
    dataNegociacao: date,
    produtos: [
      {
        codigoProduto: productCode,
        unidade: unit,
        quantidade: quantity,
        codigoLocalEstoque: localCode,
        controle: control,
      },
    ],
  });
  if (!Array.isArray(native["precos"]))
    return fail("ERP_INVALID_RESPONSE", "Preço contextual não confirmado.", 502);
  const candidates = native["precos"].map(object),
    sameProduct = candidates.filter((p) => responseCode(p["codigoProduto"]) === productCode);
  const matching = sameProduct.filter(
    (p) =>
      (p["unidade"] === undefined || p["unidade"] === unit) &&
      (p["codigoLocalEstoque"] === undefined || p["codigoLocalEstoque"] === localCode) &&
      (p["controle"] === undefined || p["controle"] === control),
  );
  // Somente repetição integral do mesmo objeto de transporte; nunca deduzir igualdade por nome, preço ou código isolado.
  const distinctMatching = [...new Map(matching.map((p) => [JSON.stringify(p), p])).values()];
  if (distinctMatching.length !== 1)
    throw new SankhyaError(
      "ERP_PRICE_AMBIGUOUS",
      "Preço sem contexto único de produto, unidade, local e controle.",
      502,
      undefined,
      {
        kind: candidates.length ? "context_mismatch" : "empty_prices",
        fields: [],
        context: {
          candidates: candidates.length,
          productMatches: sameProduct.length,
          distinctMatches: distinctMatching.length,
          candidateFields: [...new Set(sameProduct.flatMap((p) => Object.keys(p)))]
            .filter((k) => /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(k))
            .slice(0, 30),
          priceValuesEqual:
            sameProduct.length > 0 &&
            sameProduct.every((p) => String(p["valor"]) === String(sameProduct[0]!["valor"])),
          unitMatches: sameProduct.filter(
            (p) => p["unidade"] === undefined || p["unidade"] === unit,
          ).length,
          localMatches: sameProduct.filter(
            (p) => p["codigoLocalEstoque"] === undefined || p["codigoLocalEstoque"] === localCode,
          ).length,
          controlMatches: sameProduct.filter(
            (p) => p["controle"] === undefined || p["controle"] === control,
          ).length,
          units: [
            ...new Set(
              sameProduct.map((p) =>
                typeof p["unidade"] === "string" && p["unidade"].length <= 12 ? p["unidade"] : null,
              ),
            ),
          ],
          localTypes: [
            ...new Set(
              sameProduct.map((p) =>
                p["codigoLocalEstoque"] === null ? "null" : typeof p["codigoLocalEstoque"],
              ),
            ),
          ],
          controlTypes: [
            ...new Set(
              sameProduct.map((p) => (p["controle"] === null ? "null" : typeof p["controle"])),
            ),
          ],
          controlLengths: [
            ...new Set(
              sameProduct
                .filter((p) => typeof p["controle"] === "string")
                .map((p) => (p["controle"] as string).length),
            ),
          ],
        },
      },
    );
  const selected = distinctMatching[0]!,
    price = exactNativeAmount(selected["valor"]);
  const local = selected["codigoLocalEstoque"];
  if (
    local !== undefined &&
    (typeof local !== "number" || !Number.isSafeInteger(local) || local < 0)
  )
    return fail("ERP_INVALID_RESPONSE", "Local de preço ERP incompatível.", 502);
  if (
    selected["controle"] !== undefined &&
    (typeof selected["controle"] !== "string" || selected["controle"].length > 17)
  )
    return fail("ERP_INVALID_RESPONSE", "Controle de preço ERP incompatível.", 502);
  return {
    source: "sankhya" as const,
    readOnly: true as const,
    readAt: new Date().toISOString(),
    customer,
    product,
    seller: sellerResult.record,
    companyCode,
    operationCode,
    operationVersion: operations[0]!["OPERATION_VERSION"],
    quantity,
    payment: { code: paymentCode, label: term.label, version: term.version },
    price: {
      amount: price,
      unit,
      localCode: local ?? null,
      control: selected["controle"] ?? null,
      tableVersion: null,
      provider: "native-context-api",
    },
  };
}
