import { validateCustomerGroup, type CustomerGroup } from "./customer-groups";
import { withERPReadLock } from "./erp-read-lock";
import { isSalesOperation } from "./sales-operations";
import {
  decodeIndicatorSeries,
  validIndicatorQuery,
  type ERPIndicatorQuery,
  type ERPIndicatorWindow,
} from "./erp-indicator-series";
import {
  decodeRanking,
  validRankingQuery,
  type ERPRankingQuery,
  type ERPRankingWindow,
} from "./erp-ranking";
import {
  decodeReceivables,
  validReceivablesQuery,
  type ERPReceivablesQuery,
  type ERPReceivablesWindow,
} from "./erp-receivables";
import { BILLED_ORDERS_POLICY } from "./erp-billed-orders";
import {
  decodeCommission,
  validCommissionQuery,
  type ERPCommissionQuery,
  type ERPCommissionWindow,
} from "./erp-commission";
import { decodeStock, validStockQuery, type ERPStockQuery, type ERPStockWindow } from "./erp-stock";
import {
  decodeWallet,
  validWalletQuery,
  type ERPWalletQuery,
  type ERPWalletWindow,
} from "./erp-wallet";
import type { ERPSortKey } from "./erp-order";
import { erpDecimal, sumERPDecimals } from "./erp-decimal";
// Leitura online apenas. A identidade abaixo invalida trabalho; a sessão Supabase autentica.
export type ERPResource = "customers" | "products" | "sellers";
export type ERPRow = Record<string, unknown>;
export type ERPPageQuery = {
  resource: ERPResource;
  page?: number;
  pageSize?: 10 | 20 | 50;
  search?: string;
  sort?: ERPSortKey;
  direction?: "asc" | "desc";
  filters?: {
    companyCode?: number;
    sellerCode?: number;
    managerCode?: number;
    categoryCode?: number;
    categoryName?: string;
    cityCode?: number;
    customerCode?: number;
    active?: "S" | "N" | "all";
  };
};
export type ERPWindowQuery = Omit<ERPPageQuery, "page" | "pageSize"> & {
  offset: number;
  limit: number;
};
export type ERPRecordQuery = { resource: ERPResource; id: number | string };
export type ERPFacetQuery = ERPPageQuery & { facet: "category" | "seller" | "company" | "city" };
export type ERPObservation = { source: "sankhya"; readOnly: true; readAt: string };
export type ERPWindow<T = ERPRow> = ERPObservation & {
  items: T[];
  total: number;
  totalWithoutSearch: number;
  offset: number;
  priceTableState?: "missing" | "unavailable" | "empty";
};
export type ERPPage<T = ERPRow> = ERPObservation & {
  items: T[];
  total: number;
  totalWithoutSearch: number;
  page: number;
  pageSize: 10 | 20 | 50;
  hasMore: boolean;
};
export type ERPRecord<T = ERPRow> = ERPObservation & { record: T | null };
export type ERPHistoryQuery = {
  resource: "orders" | "invoices";
  offset: number;
  limit: number;
  customerId?: string;
  search?: string;
  sort?: string;
  direction?: "asc" | "desc";
  from?: string;
  to?: string;
  companyCode?: 1 | 4;
};
export type ERPSalesQuery = ERPHistoryQuery & {
  resource: "orders";
  sellerCode?: number;
  groupBy?: "seller" | "customer";
  status?: "confirmado";
  productMix?: true;
};
export type ERPBillingQuery = Omit<ERPSalesQuery, "resource" | "productMix"> & {
  resource: "invoices";
};
export type ERPSalesSummary = {
  documentCount: number;
  documentAmount: string | null;
  missingAmountCount: number;
  amountField: "TGFCAB.VLRNOTA";
  headerCountedOnce: true;
  atomicSnapshot: false;
};
export type ERPSalesWindow = ERPWindow & {
  summary: ERPSalesSummary;
  groupBy: "seller" | "customer" | null;
  companyCodes: (1 | 4)[];
};
export type ERPOrderItemsQuery = Omit<ERPSalesQuery, "groupBy" | "productMix"> & {
  productReport?: true;
};
export type ERPNonBuyersQuery = {
  resource: "customers";
  month: string;
  offset: number;
  limit: number;
  search?: string;
  sort?: string;
  direction?: "asc" | "desc";
  customerId?: string;
  sellerCode?: number;
  status?: "confirmado";
};
export type ERPNonBuyersSummary = {
  month: string;
  from: string;
  until: string;
  customerCount: number;
  walletCount: number;
  currentWallet: true;
  activeField: "TGFPAR.ATIVO";
  activeValue: "S";
  sellerAttribution: "current-CODVEND";
  historyCompanyCodes: (1 | 4)[];
  atomicSnapshot: false;
};
export type ERPNonBuyersWindow = ERPWindow & {
  summary: ERPNonBuyersSummary;
  companyCodes: (1 | 4)[];
};
export type ERPItemSummary = {
  lineCount: number;
  subtotal: string | null;
  missingSubtotalCount: number;
  quantityField: "TGFITE.QTDNEG";
  unitPriceField: "TGFITE.VLRUNIT";
  subtotalField: "TGFITE.VLRTOT";
  calculatedSubtotal: false;
  headerAmountsAdded: false;
  atomicSnapshot: false;
};
export type ERPOrderItemsWindow = ERPWindow & { summary: ERPItemSummary; companyCodes: (1 | 4)[] };
export type ERPDocumentQuery = { resource?: never; id: string; offset?: number; limit?: number };
export type ERPDocument = ERPObservation & {
  record: ERPRow | null;
  items: ERPRow[];
  total: number;
  totalWithoutSearch: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};
export type ERPPriceQuery = {
  resource?: never;
  customerId: string;
  productId: string;
  paymentCode: number;
  type: "Venda";
  sellerCode?: number;
  quantity?: number;
  unit?: string;
  date?: string;
};
export type ERPPaymentQuery = {
  resource?: never;
  customerId: string;
  offset: number;
  limit: number;
  search?: string;
  date?: string;
};
export type ERPPrice = ERPObservation & {
  customer: ERPRow;
  product: ERPRow;
  seller: ERPRow;
  companyCode: 1 | 4;
  operationCode: 1001;
  operationVersion: string;
  quantity: number;
  payment: { code: number; label: string; version: string };
  price: {
    amount: number;
    unit: string;
    localCode: number | null;
    control: string | null;
    tableVersion: number | null;
    provider: "native-context-api";
  };
};
export type ERPOperation =
  | "sul-ai"
  | "customer-groups"
  | "customer-group-save"
  | "grouped-window"
  | "page"
  | "window"
  | "record"
  | "facets"
  | "history"
  | "sales-report"
  | "billing-report"
  | "billed-orders-report"
  | "order-items-report"
  | "nonbuyers-report"
  | "wallet-report"
  | "stock-report"
  | "receivables-report"
  | "ranking-report"
  | "indicator-series"
  | "commission-report"
  | "document"
  | "price-query"
  | "payment-options";
type ERPGroupedQuery = {
  operation: "window" | "wallet-report" | "nonbuyers-report" | "sales-report" | "billing-report";
  query: Record<string, unknown>;
};
type ERPQuery =
  | Record<string, unknown>
  | ERPIndicatorQuery
  | ERPRankingQuery
  | ERPReceivablesQuery
  | ERPCommissionQuery
  | ERPStockQuery
  | ERPWalletQuery
  | ERPPageQuery
  | ERPWindowQuery
  | ERPRecordQuery
  | ERPFacetQuery
  | ERPHistoryQuery
  | ERPSalesQuery
  | ERPBillingQuery
  | ERPOrderItemsQuery
  | ERPNonBuyersQuery
  | ERPDocumentQuery
  | ERPPriceQuery
  | ERPPaymentQuery;
export type ERPTransport = (
  body: { operation: ERPOperation; query: ERPQuery },
  signal: AbortSignal,
) => Promise<{ data: unknown; error: unknown }>;
const messages = {
  AI_NOT_CONFIGURED: "Chave da Sul IA não configurada.",
  AI_UNAVAILABLE: "Sul IA indisponível. Confira a chave, os limites de uso ou tente novamente.",
  AI_INVALID_RESPONSE: "Resposta da Sul IA inválida ou incompleta.",
  AUTH_REQUIRED: "Sessão não autorizada. Entre novamente.",
  MEMBERSHIP_PENDING: "Acesso pendente de ativação pelo administrador.",
  PROFILE_UNAVAILABLE: "Não foi possível validar o acesso da conta.",
  INVALID_REQUEST: "Parâmetros de consulta inválidos.",
  INVALID_RESPONSE: "Resposta ERP inválida ou incompleta.",
  REQUEST_CANCELLED: "Consulta cancelada por troca de sessão.",
  ERP_IDENTITY_REQUIRED: "Vínculo ERP necessário para esta consulta.",
  ERP_SCOPE_FORBIDDEN: "Consulta fora do escopo autorizado.",
  UNAUTHORIZED: "Sessão não autorizada. Entre novamente.",
  FORBIDDEN: "Consulta não autorizada.",
  ERP_UNAVAILABLE: "Consulta ERP indisponível. Tente novamente.",
  ERP_CONTEXT_REQUIRED: "Contexto comercial ERP incompleto ou não confirmado.",
  ERP_CUSTOMER_SELLER_MISMATCH: "O vendedor do pedido deve ser o vendedor cadastrado no cliente.",
  ERP_PRODUCT_PRICE_UNAVAILABLE: "Produto sem preço vigente na tabela associada.",
  ERP_PRICE_AMBIGUOUS: "Preço ERP sem contexto único confirmado.",
  ERP_PRICE_TABLE_MISSING: "Cliente sem tabela de preço associada; cotação indisponível.",
  ERP_INVALID_RESPONSE: "Resposta ERP inválida ou incompleta.",
  ERP_PRICE_QUERY_FAILED: "Não foi possível confirmar o preço no ERP.",
  ERP_PAYMENT_SCOPE_UNAVAILABLE: "Condição de pagamento sem elegibilidade ERP comprovada.",
} as const;
export class ERPOnlineError extends Error {
  readonly code: string;
  constructor(code: string) {
    const safe = Object.hasOwn(messages, code)
      ? (code as keyof typeof messages)
      : "ERP_UNAVAILABLE";
    super(messages[safe]);
    this.name = "ERPOnlineError";
    this.code = safe;
  }
}
const object = (value: unknown): value is ERPRow =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const natural = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function invalid(): never {
  throw new ERPOnlineError("INVALID_RESPONSE");
}
function observation(data: unknown): asserts data is ERPRow & ERPObservation {
  if (
    !object(data) ||
    data["source"] !== "sankhya" ||
    data["readOnly"] !== true ||
    typeof data["readAt"] !== "string"
  )
    invalid();
  const timestamp = data["readAt"];
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ||
    !Number.isFinite(Date.parse(timestamp))
  )
    invalid();
  const day = timestamp.slice(0, 10);
  if (new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) invalid();
}
function decode(operation: ERPOperation, data: unknown, query: ERPQuery): ERPRow {
  observation(data);
  if (operation === "sul-ai") {
    if (
      typeof data["answer"] !== "string" ||
      !data["answer"].trim() ||
      data["answer"].length > 16000 ||
      typeof data["model"] !== "string" ||
      !Array.isArray(data["sources"])
    )
      invalid();
    return data;
  }
  if (operation === "customer-groups") {
    if (!Array.isArray(data["groups"])) invalid();
    const seen = new Set<string>(),
      members = new Set<string>();
    for (const g of data["groups"]) {
      if (
        !object(g) ||
        typeof g["id"] !== "string" ||
        seen.has(g["id"]) ||
        typeof g["name"] !== "string" ||
        !g["name"].trim() ||
        !natural(g["version"]) ||
        typeof g["editable"] !== "boolean" ||
        !Array.isArray(g["memberIds"]) ||
        !g["memberIds"].length ||
        !Array.isArray(g["members"]) ||
        g["members"].length !== g["memberIds"].length
      )
        invalid();
      seen.add(g["id"]);
      for (const [i, id] of g["memberIds"].entries()) {
        if (
          typeof id !== "string" ||
          !/^sankhya:customer:[1-9]\d*$/.test(id) ||
          members.has(id) ||
          !object(g["members"][i]) ||
          g["members"][i]["id"] !== id
        )
          invalid();
        members.add(id);
      }
    }
    return data;
  }
  if (operation === "customer-group-save") {
    const r = data["result"];
    if (
      !object(r) ||
      r["saved"] !== true ||
      r["id"] !== (query as ERPRow)["id"] ||
      r["version"] !== Number((query as ERPRow)["version"]) + 1
    )
      invalid();
    return data;
  }
  if (operation === "grouped-window") {
    const q = (query as ERPGroupedQuery).query,
      items = data["items"],
      total = data["total"],
      unfiltered = data["totalWithoutSearch"],
      grouping = data["grouping"];
    if (
      !Array.isArray(items) ||
      !natural(total) ||
      !natural(unfiltered) ||
      total > unfiltered ||
      data["offset"] !== q["offset"] ||
      items.length !== Math.min(Number(q["limit"]), Math.max(0, total - Number(q["offset"]))) ||
      !object(grouping) ||
      grouping["source"] !== "manual" ||
      grouping["composition"] !== "current" ||
      grouping["identified"] !== true
    )
      invalid();
    const ids = new Set<string>();
    for (const r of items) {
      if (!object(r) || typeof r["id"] !== "string" || ids.has(r["id"])) invalid();
      ids.add(r["id"]);
      if (
        r["isGroup"] === true &&
        (r["id"] !== `customer-group:${r["groupId"]}` ||
          typeof r["name"] !== "string" ||
          !r["name"].includes(" · Agrupamento · ") ||
          !natural(r["memberCount"]) ||
          !Array.isArray(r["memberIds"]) ||
          !r["memberIds"].length ||
          r["memberIds"].length > Number(r["memberCount"]))
      )
        invalid();
    }
    return data;
  }
  if (operation === "price-query") {
    const q = query as ERPPriceQuery,
      price = data["price"],
      payment = data["payment"];
    if (
      !object(price) ||
      !object(payment) ||
      !object(data["customer"]) ||
      !object(data["product"]) ||
      !object(data["seller"])
    )
      invalid();
    if (
      data["customer"]["id"] !== q.customerId ||
      data["product"]["id"] !== q.productId ||
      (data["companyCode"] !== 1 && data["companyCode"] !== 4) ||
      data["operationCode"] !== 1001 ||
      data["quantity"] !== (q.quantity ?? 1) ||
      payment["code"] !== q.paymentCode ||
      typeof payment["label"] !== "string" ||
      typeof payment["version"] !== "string" ||
      typeof data["operationVersion"] !== "string"
    )
      invalid();
    if (
      typeof price["amount"] !== "number" ||
      !Number.isFinite(price["amount"]) ||
      price["amount"] <= 0 ||
      typeof price["unit"] !== "string" ||
      !price["unit"].trim() ||
      (q.unit !== undefined && price["unit"] !== q.unit) ||
      price["provider"] !== "native-context-api" ||
      (price["localCode"] !== null && !natural(price["localCode"])) ||
      (price["control"] !== null && typeof price["control"] !== "string") ||
      (price["tableVersion"] !== null && !natural(price["tableVersion"]))
    )
      invalid();
    return data;
  }
  if (operation === "document") {
    const q = query as ERPDocumentQuery,
      items = data["items"],
      total = data["total"];
    const offset = q.offset ?? 0,
      limit = q.limit ?? 50,
      record = data["record"];
    if (record !== null && (!object(record) || record["id"] !== q.id)) invalid();
    if (
      !Array.isArray(items) ||
      !items.every(object) ||
      !natural(total) ||
      data["totalWithoutSearch"] !== total ||
      data["offset"] !== offset ||
      data["limit"] !== limit ||
      data["hasMore"] !== offset + items.length < total ||
      items.length !== Math.min(limit, Math.max(0, total - offset)) ||
      (record === null && total !== 0)
    )
      invalid();
    if (
      items.some(
        (item) => typeof item["id"] !== "string" || !item["id"].startsWith(q.id + ":item:"),
      )
    )
      invalid();
    return data;
  }
  if (operation === "record") {
    if (data["record"] !== null && !object(data["record"])) invalid();
    return data;
  }
  if (
    data["priceTableState"] !== undefined &&
    (!["missing", "unavailable", "empty"].includes(String(data["priceTableState"])) ||
      operation !== "window" ||
      (query as ERPWindowQuery).resource !== "products" ||
      !(query as ERPWindowQuery).filters?.customerCode ||
      data["totalWithoutSearch"] !== 0)
  )
    invalid();
  const items = data["items"],
    total = data["total"],
    unfiltered = data["totalWithoutSearch"];
  if (
    !Array.isArray(items) ||
    !items.every(object) ||
    !natural(total) ||
    !natural(unfiltered) ||
    total > unfiltered
  )
    invalid();
  let offset: number, limit: number;
  if (
    operation === "window" ||
    operation === "history" ||
    operation === "sales-report" ||
    operation === "billing-report" ||
    operation === "billed-orders-report" ||
    operation === "order-items-report" ||
    operation === "nonbuyers-report" ||
    operation === "wallet-report" ||
    operation === "stock-report" ||
    operation === "commission-report" ||
    operation === "indicator-series" ||
    operation === "ranking-report" ||
    operation === "receivables-report" ||
    operation === "payment-options"
  ) {
    const q = query as ERPWindowQuery | ERPHistoryQuery | ERPPaymentQuery;
    if (data["offset"] !== q.offset) invalid();
    offset = q.offset;
    limit = q.limit;
  } else {
    const q = query as ERPPageQuery;
    if (data["page"] !== (q.page ?? 1) || data["pageSize"] !== (q.pageSize ?? 20)) invalid();
    offset = ((q.page ?? 1) - 1) * (q.pageSize ?? 20);
    limit = q.pageSize ?? 20;
    if (data["hasMore"] !== offset + items.length < total) invalid();
  }
  if (items.length !== Math.min(limit, Math.max(0, total - offset))) invalid();
  if (operation === "indicator-series")
    decodeIndicatorSeries(data, query as ERPIndicatorQuery, invalid);
  if (operation === "ranking-report") decodeRanking(data, query as ERPRankingQuery, invalid);
  if (operation === "receivables-report")
    decodeReceivables(data, query as ERPReceivablesQuery, invalid);
  if (operation === "commission-report")
    decodeCommission(data, query as ERPCommissionQuery, invalid);
  if (operation === "stock-report") decodeStock(data, query as ERPStockQuery, invalid);
  if (operation === "wallet-report") decodeWallet(data, query as ERPWalletQuery, invalid);
  if (operation === "nonbuyers-report") {
    const q = query as ERPNonBuyersQuery,
      s = data["summary"],
      cs = data["companyCodes"],
      p = data["salesPolicy"];
    const y = Number(q.month.slice(0, 4)),
      m = Number(q.month.slice(5)),
      until =
        m === 12
          ? `${String(y + 1).padStart(4, "0")}-01-01`
          : `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-01`;
    if (
      !object(s) ||
      s["month"] !== q.month ||
      s["from"] !== q.month + "-01" ||
      s["until"] !== until ||
      s["customerCount"] !== unfiltered ||
      !natural(s["walletCount"]) ||
      s["walletCount"] < unfiltered ||
      s["currentWallet"] !== true ||
      s["activeField"] !== "TGFPAR.ATIVO" ||
      s["activeValue"] !== "S" ||
      s["sellerAttribution"] !== "current-CODVEND" ||
      s["atomicSnapshot"] !== false
    )
      invalid();
    if (
      !Array.isArray(cs) ||
      !cs.length ||
      cs.length > 2 ||
      new Set(cs).size !== cs.length ||
      cs.some((c) => c !== 1 && c !== 4) ||
      JSON.stringify(s["historyCompanyCodes"]) !== JSON.stringify(cs)
    )
      invalid();
    if (
      !object(p) ||
      p["movement"] !== "P" ||
      p["operationCode"] !== 1001 ||
      p["natureCode"] !== 10100000 ||
      p["statusCode"] !== "L" ||
      p["bonification"] !== "N" ||
      p["devolution"] !== 1 ||
      p["dateField"] !== "DTNEG"
    )
      invalid();
    if (new Set(items.map((r) => r["id"])).size !== items.length) invalid();
    for (const r of items) {
      const code = r["code"],
        seller = r["sellerCode"];
      if (
        typeof code !== "string" ||
        !/^sankhya:customer:[1-9]\d{0,9}$/.test(String(r["id"])) ||
        r["id"] !== `sankhya:customer:${code}` ||
        !natural(Number(code)) ||
        Number(code) < 1 ||
        Number(code) > 2147483647 ||
        String(Number(code)) !== code ||
        r["source"] !== "observado" ||
        r["readOnly"] !== true ||
        (r["name"] !== null && typeof r["name"] !== "string") ||
        (r["seller"] !== null && typeof r["seller"] !== "string") ||
        (seller !== null && (!natural(seller) || seller > 2147483647)) ||
        r["localStatus"] !== "Sem compra no mês " + q.month ||
        (q.customerId !== undefined && r["id"] !== q.customerId) ||
        (q.sellerCode !== undefined && seller !== q.sellerCode)
      )
        invalid();
    }
  }
  if (operation === "order-items-report") {
    const q = query as ERPOrderItemsQuery,
      summary = data["summary"],
      policy = data["salesPolicy"],
      companies = data["companyCodes"],
      products = q.productReport === true,
      aggregation = data["productAggregation"];
    if (
      products
        ? !object(aggregation) ||
          aggregation["field"] !== "TGFITE.CODPROD" ||
          aggregation["mixedUnits"] !== "unavailable" ||
          aggregation["quantitiesConverted"] !== false ||
          aggregation["subtotalReconstructed"] !== false ||
          data["groupBy"] !== "product"
        : aggregation !== undefined || data["groupBy"] !== undefined
    )
      invalid();
    if (
      !object(summary) ||
      !natural(summary["lineCount"]) ||
      (products ? total > summary["lineCount"] : summary["lineCount"] !== total) ||
      !natural(summary["missingSubtotalCount"]) ||
      summary["missingSubtotalCount"] > summary["lineCount"] ||
      summary["quantityField"] !== "TGFITE.QTDNEG" ||
      summary["unitPriceField"] !== "TGFITE.VLRUNIT" ||
      summary["subtotalField"] !== "TGFITE.VLRTOT" ||
      summary["calculatedSubtotal"] !== false ||
      summary["headerAmountsAdded"] !== false ||
      summary["atomicSnapshot"] !== false
    )
      invalid();
    if (
      summary["missingSubtotalCount"]
        ? summary["subtotal"] !== null
        : typeof summary["subtotal"] !== "string" ||
          erpDecimal(summary["subtotal"]) !== summary["subtotal"]
    )
      invalid();
    if (total === 0 && summary["subtotal"] !== "0") invalid();
    if (
      !object(policy) ||
      policy["movement"] !== "P" ||
      policy["operationCode"] !== 1001 ||
      policy["natureCode"] !== 10100000 ||
      policy["statusCode"] !== "L" ||
      policy["dateField"] !== "DTNEG" ||
      policy["bonification"] !== "N" ||
      policy["devolution"] !== 1
    )
      invalid();
    if (
      !Array.isArray(companies) ||
      !companies.length ||
      new Set(companies).size !== companies.length ||
      companies.some((c) => c !== 1 && c !== 4) ||
      (q.companyCode !== undefined && (companies.length !== 1 || companies[0] !== q.companyCode))
    )
      invalid();
    if (new Set(items.map((r) => r["id"])).size !== items.length) invalid();
    for (const row of items) {
      if (products) {
        const code = row["code"],
          lc = row["lineCount"],
          mq = row["missingQuantityCount"],
          mu = row["missingUnitCount"],
          uc = row["unitCount"],
          ms = row["missingSubtotalCount"];
        if (
          typeof code !== "string" ||
          !/^([1-9]\d{0,9})$/.test(code) ||
          Number(code) > 2147483647 ||
          row["id"] !== `sankhya:items:product:${code}` ||
          row["productId"] !== `sankhya:product:${code}` ||
          row["source"] !== "observado" ||
          row["readOnly"] !== true ||
          (row["name"] !== null && typeof row["name"] !== "string") ||
          !natural(lc) ||
          lc < 1 ||
          ![mq, mu, uc, ms].every((n) => natural(n) && n <= lc)
        )
          invalid();
        const unitKnown = uc === 1 && mu === 0,
          qtyKnown = unitKnown && mq === 0;
        if (
          unitKnown
            ? typeof row["unit"] !== "string" || row["unit"].trim() === ""
            : row["unit"] !== null
        )
          invalid();
        if (
          qtyKnown
            ? typeof row["qty"] !== "string" || erpDecimal(row["qty"]) !== row["qty"]
            : row["qty"] !== null
        )
          invalid();
        if (
          ms
            ? row["total"] !== null
            : typeof row["total"] !== "string" || erpDecimal(row["total"]) !== row["total"]
        )
          invalid();
        continue;
      }
      const e = row["erp"];
      if (
        !object(e) ||
        !natural(e["documentCode"]) ||
        e["documentCode"] < 1 ||
        e["documentCode"] > 2147483647 ||
        typeof e["sequence"] !== "number" ||
        !Number.isInteger(e["sequence"]) ||
        e["sequence"] < -2147483648 ||
        e["sequence"] > 2147483647 ||
        !companies.includes(e["companyCode"]) ||
        e["itemCompanyCode"] !== e["companyCode"] ||
        e["movement"] !== "P" ||
        !isSalesOperation(e["operationCode"]) ||
        e["natureCode"] !== 10100000 ||
        e["statusCode"] !== "L" ||
        e["dateField"] !== "DTNEG" ||
        row["id"] !== `sankhya:order:${e["documentCode"]}:item:${e["sequence"]}` ||
        row["source"] !== "observado" ||
        row["readOnly"] !== true
      )
        invalid();
      for (const key of ["price", "qty", "total"])
        if (
          row[key] !== null &&
          (typeof row[key] !== "string" || erpDecimal(row[key]) !== row[key])
        )
          invalid();
      for (const key of ["name", "number", "customer", "unit"])
        if (row[key] !== null && typeof row[key] !== "string") invalid();
      if (
        typeof row["productId"] !== "string" ||
        !/^sankhya:product:[1-9]\d{0,9}$/.test(row["productId"]) ||
        typeof row["customerId"] !== "string" ||
        !/^sankhya:customer:[1-9]\d{0,9}$/.test(row["customerId"])
      )
        invalid();
      if (
        (row["sellerCode"] !== null &&
          (!natural(row["sellerCode"]) || row["sellerCode"] > 2147483647)) ||
        Number(row["productId"].slice(16)) > 2147483647 ||
        Number(row["customerId"].slice(17)) > 2147483647
      )
        invalid();
      const day = row["date"];
      if (
        day !== null &&
        (typeof day !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
          !Number.isFinite(Date.parse(day + "T00:00:00Z")) ||
          new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day)
      )
        invalid();
      if (
        (q.customerId !== undefined && row["customerId"] !== q.customerId) ||
        (q.sellerCode !== undefined && row["sellerCode"] !== q.sellerCode) ||
        (q.from && (!day || String(day) < q.from)) ||
        (q.to && (!day || String(day) > q.to))
      )
        invalid();
    }
    if (
      offset === 0 &&
      items.length === total &&
      ((products
        ? items.reduce((n, r) => n + Number(r["missingSubtotalCount"]), 0)
        : items.filter((r) => r["total"] === null).length) !== summary["missingSubtotalCount"] ||
        (products &&
          items.reduce((n, r) => n + Number(r["lineCount"]), 0) !== summary["lineCount"]) ||
        (summary["subtotal"] !== null &&
          sumERPDecimals(items.map((r) => String(r["total"]))) !== summary["subtotal"]))
    )
      invalid();
  }
  if (
    operation === "sales-report" ||
    operation === "billing-report" ||
    operation === "billed-orders-report"
  ) {
    const billing = operation === "billing-report",
      billed = operation === "billed-orders-report";
    const q = query as ERPSalesQuery,
      summary = data["summary"],
      policy = data[billing ? "billingPolicy" : "salesPolicy"],
      companies = data["companyCodes"];
    const mix = q.productMix === true,
      productPolicy = data["productCountPolicy"];
    if (
      mix
        ? billing ||
          q.groupBy !== "customer" ||
          !object(productPolicy) ||
          productPolicy["field"] !== "TGFITE.CODPROD" ||
          productPolicy["distinctPerCustomer"] !== true ||
          productPolicy["quantitiesAdded"] !== false ||
          productPolicy["missingItems"] !== "unavailable"
        : productPolicy !== undefined
    )
      invalid();
    if (
      !object(summary) ||
      !natural(summary["documentCount"]) ||
      !natural(summary["missingAmountCount"]) ||
      summary["missingAmountCount"] > summary["documentCount"] ||
      summary["amountField"] !== "TGFCAB.VLRNOTA" ||
      summary["headerCountedOnce"] !== true ||
      summary["atomicSnapshot"] !== false
    )
      invalid();
    const amount = summary["documentAmount"];
    if (
      summary["missingAmountCount"]
        ? amount !== null
        : typeof amount !== "string" || erpDecimal(amount) !== amount
    )
      invalid();
    if (
      data["groupBy"] !== (q.groupBy ?? null) ||
      (!q.groupBy && total !== summary["documentCount"]) ||
      (q.groupBy && total > summary["documentCount"])
    )
      invalid();
    if (
      !Array.isArray(companies) ||
      !companies.length ||
      new Set(companies).size !== companies.length ||
      companies.some((c) => c !== 1 && c !== 4) ||
      (q.companyCode !== undefined && (companies.length !== 1 || companies[0] !== q.companyCode))
    )
      invalid();
    const sale = billing && object(policy) ? policy["origin"] : policy;
    if (
      !object(sale) ||
      sale["movement"] !== "P" ||
      sale["operationCode"] !== 1001 ||
      sale["natureCode"] !== 10100000 ||
      sale["statusCode"] !== "L" ||
      sale["dateField"] !== "DTNEG" ||
      sale["bonification"] !== "N" ||
      sale["devolution"] !== 1
    )
      invalid();
    if (
      billing &&
      (!object(policy) ||
        policy["movement"] !== "V" ||
        policy["dateField"] !== "DTFATUR" ||
        policy["statusCode"] !== "L" ||
        policy["fiscalStatusCode"] !== "A" ||
        policy["salesSignal"] !== -1 ||
        policy["bonification"] !== "N" ||
        policy["devolution"] !== 1 ||
        data["linkMode"] !== "direct-item-reference" ||
        data["quantitiesAllocated"] !== false ||
        data["ordersAdded"] !== false ||
        data["undatedTreatment"] !== "excluded-without-date-fallback")
    )
      invalid();
    if (billed) {
      const p = data["billedOrdersPolicy"],
        c = data["billedOrdersSummary"];
      if (
        !object(p) ||
        Object.entries(BILLED_ORDERS_POLICY).some(([k, v]) => p[k] !== v) ||
        !object(c) ||
        !natural(c["invoiceLinks"]) ||
        c["invoiceLinks"] < summary["documentCount"] ||
        !natural(c["unattributedOrders"]) ||
        c["unattributedOrders"] > summary["documentCount"] ||
        (c["assignedInvoiceAmount"] === null) !==
          (c["unattributedOrders"] === summary["documentCount"]) ||
        (c["assignedInvoiceAmount"] !== null &&
          (typeof c["assignedInvoiceAmount"] !== "string" ||
            erpDecimal(c["assignedInvoiceAmount"]) !== c["assignedInvoiceAmount"]))
      )
        invalid();
    }
    if (new Set(items.map((row) => row["id"])).size !== items.length) invalid();
    for (const row of items) {
      if (
        row["total"] !== null &&
        (typeof row["total"] !== "string" || erpDecimal(row["total"]) !== row["total"])
      )
        invalid();
      if (q.groupBy) {
        if (
          !natural(row["count"]) ||
          row["count"] < 1 ||
          row["groupBy"] !== q.groupBy ||
          !(row["groupCode"] === null || natural(row["groupCode"])) ||
          row["id"] !==
            `sankhya:${billing ? "billing" : "sales"}:${q.groupBy}:${row["groupCode"] ?? "unknown"}` ||
          (mix && row["qty"] !== null && (!natural(row["qty"]) || row["qty"] < 1))
        )
          invalid();
      } else {
        if (billed) {
          const f = row["billingFacts"];
          if (
            !object(f) ||
            !natural(f["invoiceCount"]) ||
            f["invoiceCount"] < 1 ||
            !natural(f["sharedInvoiceCount"]) ||
            f["sharedInvoiceCount"] > f["invoiceCount"] ||
            !natural(f["missingAmountCount"]) ||
            f["missingAmountCount"] > f["invoiceCount"] ||
            !natural(f["unqualifiedInvoiceCount"]) ||
            !natural(f["missingNumberCount"]) ||
            f["missingNumberCount"] > f["invoiceCount"] ||
            (f["sharedInvoiceCount"] > 0 ||
            f["missingAmountCount"] > 0 ||
            f["unqualifiedInvoiceCount"] > 0
              ? row["invoiced"] !== null
              : typeof row["invoiced"] !== "string" ||
                erpDecimal(row["invoiced"]) !== row["invoiced"]) ||
            (f["missingNumberCount"] > 0
              ? row["nf"] !== null
              : typeof row["nf"] !== "string" || !/^\d+(?:, \d+)*$/.test(row["nf"]))
          )
            invalid();
        }
        const erp = row["erp"];
        if (
          !object(erp) ||
          erp["movement"] !== (billing ? "V" : "P") ||
          (billing
            ? !natural(erp["operationCode"]) ||
              erp["operationCode"] < 1 ||
              erp["dateField"] !== "DTFATUR" ||
              erp["fiscalStatusCode"] !== "A"
            : !isSalesOperation(erp["operationCode"])) ||
          erp["statusCode"] !== "L" ||
          !companies.includes(erp["companyCode"]) ||
          row["id"] !== `sankhya:${billing ? "invoice" : "order"}:${erp["documentCode"]}` ||
          (q.customerId && row["customerId"] !== q.customerId) ||
          (q.sellerCode !== undefined && row["sellerCode"] !== q.sellerCode)
        )
          invalid();
      }
    }
    if (billed && !q.groupBy && offset === 0 && items.length === total) {
      const c = data["billedOrdersSummary"] as {
        invoiceLinks: number;
        unattributedOrders: number;
        assignedInvoiceAmount: string | null;
      };
      const known = items.filter((r) => r["invoiced"] !== null);
      const links = items.reduce(
        (n, r) => n + Number((r["billingFacts"] as Record<string, unknown>)["invoiceCount"]),
        0,
      );
      if (
        !natural(links) ||
        links !== c.invoiceLinks ||
        items.length - known.length !== c.unattributedOrders ||
        (known.length > 0 &&
          sumERPDecimals(known.map((r) => String(r["invoiced"]))) !== c.assignedInvoiceAmount)
      )
        invalid();
    }
  }
  return data;
}
async function errorCode(value: unknown): Promise<string> {
  if (!object(value)) return "ERP_UNAVAILABLE";
  if (typeof value["code"] === "string") return value["code"];
  if (object(value["error"])) return errorCode(value["error"]);
  // FunctionsHttpError mantém o envelope de erro na Response, nunca na mensagem pública.
  const context = value["context"];
  if (context instanceof Response) {
    try {
      return await errorCode(await context.clone().json());
    } catch {
      return "ERP_UNAVAILABLE";
    }
  }
  return "ERP_UNAVAILABLE";
}
const normalTransport: ERPTransport = async (body, signal) => {
  const { supabase } = await import("./supabase");
  if (signal.aborted) throw new ERPOnlineError("REQUEST_CANCELLED");
  return supabase.functions.invoke("sankhya-online", { body, signal });
};
export function createERPClient(transport: ERPTransport = normalTransport) {
  let identity: string | null = null,
    generation = 0;
  const pending = new Set<AbortController>();
  // Limite de leituras da integração comprovado no ERP; FIFO sem retry nem cache.
  let activeReads = 0;
  const waitingReads: (() => void)[] = [];
  function limitedTransport(
    body: Parameters<ERPTransport>[0],
    signal: AbortSignal,
    superseded?: AbortSignal,
  ): ReturnType<ERPTransport> {
    return new Promise((resolve, reject) => {
      const start = () => {
        signal.removeEventListener("abort", cancel);
        superseded?.removeEventListener("abort", cancel);
        if (signal.aborted || superseded?.aborted) {
          reject(new ERPOnlineError("REQUEST_CANCELLED"));
          return;
        }
        activeReads++;
        let result: ReturnType<ERPTransport>;
        try {
          result =
            transport === normalTransport
              ? withERPReadLock(() => transport(body, signal), signal, superseded).catch(
                  (error) => {
                    if (signal.aborted || superseded?.aborted)
                      throw new ERPOnlineError("REQUEST_CANCELLED");
                    throw error;
                  },
                )
              : transport(body, signal);
        } catch (error) {
          result = Promise.reject(error);
        }
        void Promise.resolve(result)
          .then(resolve, reject)
          .finally(() => {
            activeReads--;
            while (activeReads < 1 && waitingReads.length) waitingReads.shift()!();
          });
      };
      const cancel = () => {
        const index = waitingReads.indexOf(start);
        if (index !== -1) waitingReads.splice(index, 1);
        signal.removeEventListener("abort", cancel);
        superseded?.removeEventListener("abort", cancel);
        reject(new ERPOnlineError("REQUEST_CANCELLED"));
      };
      if (signal.aborted || superseded?.aborted) {
        cancel();
        return;
      }
      if (activeReads < 1) start();
      else {
        waitingReads.push(start);
        signal.addEventListener("abort", cancel, { once: true });
        superseded?.addEventListener("abort", cancel, { once: true });
      }
    });
  }
  function setIdentity(uid: string | null): void {
    if (uid === identity) return;
    identity = uid;
    generation++;
    for (const controller of pending) controller.abort();
    pending.clear();
  }
  async function request<T>(
    operation: ERPOperation,
    query: ERPQuery,
    superseded?: AbortSignal,
  ): Promise<T> {
    if (!query) throw new ERPOnlineError("INVALID_REQUEST");
    if (operation === "customer-group-save") {
      try {
        validateCustomerGroup(query);
      } catch {
        throw new ERPOnlineError("INVALID_REQUEST");
      }
    }

    if (
      "month" in query &&
      operation !== "indicator-series" &&
      operation !== "ranking-report" &&
      operation !== "nonbuyers-report" &&
      operation !== "wallet-report"
    )
      throw new ERPOnlineError("INVALID_REQUEST");
    if (operation === "commission-report" && !validCommissionQuery(query as ERPCommissionQuery))
      throw new ERPOnlineError("INVALID_REQUEST");
    if (operation === "stock-report" && !validStockQuery(query as ERPStockQuery))
      throw new ERPOnlineError("INVALID_REQUEST");
    if (operation === "indicator-series" && !validIndicatorQuery(query as ERPIndicatorQuery))
      throw new ERPOnlineError("INVALID_REQUEST");
    if (operation === "ranking-report" && !validRankingQuery(query as ERPRankingQuery))
      throw new ERPOnlineError("INVALID_REQUEST");
    if (operation === "receivables-report" && !validReceivablesQuery(query as ERPReceivablesQuery))
      throw new ERPOnlineError("INVALID_REQUEST");
    if (operation === "wallet-report" && !validWalletQuery(query as ERPWalletQuery))
      throw new ERPOnlineError("INVALID_REQUEST");
    if (operation === "nonbuyers-report") {
      const q = query as ERPNonBuyersQuery;
      if (
        Object.keys(q).some(
          (k) =>
            ![
              "resource",
              "month",
              "offset",
              "limit",
              "search",
              "sort",
              "direction",
              "customerId",
              "sellerCode",
              "status",
            ].includes(k),
        ) ||
        q.resource !== "customers" ||
        typeof q.month !== "string" ||
        !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(q.month) ||
        Number(q.month.slice(0, 4)) < 1 ||
        Number(q.month.slice(0, 4)) > 9998 ||
        (q.customerId !== undefined &&
          (!/^sankhya:customer:[1-9]\d{0,9}$/.test(String(q.customerId)) ||
            Number(q.customerId.slice(17)) > 2147483647)) ||
        (q.sellerCode !== undefined &&
          (!natural(q.sellerCode) || q.sellerCode < 1 || q.sellerCode > 2147483647)) ||
        (q.status !== undefined && q.status !== "confirmado") ||
        (q.sort !== undefined && !["code", "name", "seller", "localStatus"].includes(q.sort)) ||
        (q.direction !== undefined && !["asc", "desc"].includes(q.direction)) ||
        (q.search !== undefined &&
          (typeof q.search !== "string" ||
            q.search.length > 120 ||
            /[;]|--|\/\*|\*\//.test(q.search) ||
            Array.from(q.search).some((character) => character.charCodeAt(0) < 32)))
      )
        throw new ERPOnlineError("INVALID_REQUEST");
    }
    const productReport = (query as { productReport?: unknown }).productReport;
    if (
      productReport !== undefined &&
      (operation !== "order-items-report" || productReport !== true)
    )
      throw new ERPOnlineError("INVALID_REQUEST");
    const mix = (query as { productMix?: unknown; groupBy?: unknown }).productMix;
    if (
      mix !== undefined &&
      (operation !== "sales-report" ||
        mix !== true ||
        (query as ERPSalesQuery).groupBy !== "customer")
    )
      throw new ERPOnlineError("INVALID_REQUEST");
    if (operation === "document") {
      const q = query as ERPDocumentQuery;
      if (
        !/^sankhya:(order|invoice):[1-9]\d*$/.test(q.id) ||
        !natural(q.offset ?? 0) ||
        !natural(q.limit ?? 50) ||
        (q.limit ?? 50) < 1 ||
        (q.limit ?? 50) > 50
      )
        throw new ERPOnlineError("INVALID_REQUEST");
    } else if (operation === "price-query" || operation === "payment-options") {
      const q = query as ERPPriceQuery | ERPPaymentQuery;
      if (typeof q.customerId !== "string" || !/^sankhya:customer:[1-9]\d*$/.test(q.customerId))
        throw new ERPOnlineError("INVALID_REQUEST");
      if (operation === "price-query") {
        const p = q as ERPPriceQuery;
        if (
          !/^sankhya:product:[1-9]\d*$/.test(p.productId) ||
          !natural(p.paymentCode) ||
          p.paymentCode < 1 ||
          p.type !== "Venda"
        )
          throw new ERPOnlineError("INVALID_REQUEST");
      }
    } else if (
      !["sul-ai", "customer-groups", "customer-group-save", "grouped-window"].includes(operation) &&
      !(
        operation === "billing-report"
          ? ["invoices"]
          : operation === "sales-report" ||
              operation === "billed-orders-report" ||
              operation === "order-items-report" ||
              operation === "commission-report" ||
              operation === "indicator-series" ||
              operation === "ranking-report" ||
              operation === "receivables-report"
            ? ["orders"]
            : operation === "history"
              ? ["orders", "invoices"]
              : ["customers", "products", "sellers"]
      ).includes(String(query.resource))
    )
      throw new ERPOnlineError("INVALID_REQUEST");
    if (
      operation === "window" ||
      operation === "history" ||
      operation === "sales-report" ||
      operation === "billing-report" ||
      operation === "billed-orders-report" ||
      operation === "order-items-report" ||
      operation === "nonbuyers-report" ||
      operation === "wallet-report" ||
      operation === "stock-report" ||
      operation === "commission-report" ||
      operation === "indicator-series" ||
      operation === "ranking-report" ||
      operation === "receivables-report" ||
      operation === "payment-options"
    ) {
      const q = query as ERPWindowQuery | ERPHistoryQuery | ERPPaymentQuery;
      if (!natural(q.offset) || !natural(q.limit) || q.limit < 1 || q.limit > 50)
        throw new ERPOnlineError("INVALID_REQUEST");
    }
    const current = generation,
      controller = new AbortController();
    pending.add(controller);
    const assertCurrent = () => {
      if (current !== generation || controller.signal.aborted)
        throw new ERPOnlineError("REQUEST_CANCELLED");
    };
    let onAbort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(new ERPOnlineError("REQUEST_CANCELLED"));
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const result = await Promise.race([
        limitedTransport({ operation, query }, controller.signal, superseded),
        cancelled,
      ]);
      assertCurrent();
      if (result.error || (object(result.data) && result.data["error"])) {
        const code = await Promise.race([errorCode(result.error || result.data), cancelled]);
        assertCurrent();
        throw new ERPOnlineError(code);
      }
      assertCurrent();
      return decode(operation, result.data, query) as T;
    } catch (error) {
      assertCurrent();
      if (error instanceof ERPOnlineError) throw error;
      throw new ERPOnlineError("ERP_UNAVAILABLE");
    } finally {
      pending.delete(controller);
      controller.signal.removeEventListener("abort", onAbort);
    }
  }
  return {
    setIdentity,
    customerGroupingEnabled: false,
    ai: (query: { message: string; history: { role: "user" | "assistant"; content: string }[] }) =>
      request<ERPObservation & { answer: string; model: string; sources: ERPRow[] }>(
        "sul-ai",
        query,
      ),
    customerGroups: () => request<{ groups: CustomerGroup[] }>("customer-groups", {}),
    saveCustomerGroup: (query: ReturnType<typeof validateCustomerGroup>) =>
      request<{ result: { saved: true; id: string; version: number } }>(
        "customer-group-save",
        query,
      ),
    groupedWindow: (query: ERPGroupedQuery) =>
      request<ERPWindow & { summary?: ERPSalesSummary; companyCodes?: (1 | 4)[] }>(
        "grouped-window",
        query,
      ),
    page: <T = ERPRow>(query: ERPPageQuery) => request<ERPPage<T>>("page", query),
    window: <T = ERPRow>(query: ERPWindowQuery, superseded?: AbortSignal) =>
      request<ERPWindow<T>>("window", query, superseded),
    record: <T = ERPRow>(query: ERPRecordQuery) => request<ERPRecord<T>>("record", query),
    facets: <T = ERPRow>(query: ERPFacetQuery) => request<ERPPage<T>>("facets", query),
    history: <T = ERPRow>(query: ERPHistoryQuery) => request<ERPWindow<T>>("history", query),
    salesReport: (query: ERPSalesQuery) => request<ERPSalesWindow>("sales-report", query),
    orderItemsReport: (query: ERPOrderItemsQuery) =>
      request<ERPOrderItemsWindow>("order-items-report", query),
    commissionReport: (query: ERPCommissionQuery) =>
      request<ERPCommissionWindow>("commission-report", query),
    stockReport: (query: ERPStockQuery) => request<ERPStockWindow>("stock-report", query),
    walletReport: (query: ERPWalletQuery) => request<ERPWalletWindow>("wallet-report", query),
    nonBuyersReport: (query: ERPNonBuyersQuery) =>
      request<ERPNonBuyersWindow>("nonbuyers-report", query),
    indicatorSeries: (query: ERPIndicatorQuery) =>
      request<ERPIndicatorWindow>("indicator-series", query),
    rankingReport: (query: ERPRankingQuery) => request<ERPRankingWindow>("ranking-report", query),
    receivablesReport: (query: ERPReceivablesQuery) =>
      request<ERPReceivablesWindow>("receivables-report", query),
    billedOrdersReport: (query: ERPSalesQuery) =>
      request<
        ERPSalesWindow & {
          billedOrdersPolicy: typeof BILLED_ORDERS_POLICY;
          billedOrdersSummary: {
            invoiceLinks: number;
            unattributedOrders: number;
            assignedInvoiceAmount: string | null;
          };
        }
      >("billed-orders-report", query),
    billingReport: (query: ERPBillingQuery) => request<ERPSalesWindow>("billing-report", query),
    document: (query: ERPDocumentQuery) => request<ERPDocument>("document", query),
    price: (query: ERPPriceQuery) => request<ERPPrice>("price-query", query),
    paymentOptions: <T = ERPRow>(query: ERPPaymentQuery) =>
      request<ERPWindow<T>>("payment-options", query),
  };
}
export const erpClient = Object.assign(createERPClient(), { customerGroupingEnabled: true });
