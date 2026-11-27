import { validateOnlineOrderShape } from "../lib/online-order-validation";
import { useERPCatalogPrices } from "./erp-catalog-prices";
import { useCustomerPerformance, customerPerformancePeriods } from "./customer-performance";
const customerNativeEnd = (month: string) => customerPerformancePeriods(month).year.to;
import CustomerGroups from "./CustomerGroups";
import AIAnswer from "./AIAnswer";
import { groupForCustomer, groupLabel } from "../lib/customer-groups";
import { businessDate, proratedMonthlyTarget } from "../lib/business-month";
import { SelectedIndicators } from "./SelectedIndicators";
import { useOnlineIndicators } from "./online-indicators";
import { useRankingChart } from "./erp-ranking-chart";
import type { ERPRankingSummary } from "../lib/erp-ranking";
import type { ERPCommissionSummary } from "../lib/erp-commission";
import type { ERPWalletSummary } from "../lib/erp-wallet";
import { formatERPShare } from "../lib/erp-decimal";
import { FileText as $s } from "lucide-react";
import {
  ArrowLeft as gm,
  Download as vm,
  ArrowRight as Jr,
  Plus as Sa,
  Printer as td,
  Trash as Ws,
  Check as ka,
  FileCheck as Cm,
  Pencil as tl,
  Link2 as Jc,
  Package as du,
  ChevronRight as so,
  Target as od,
  Lock as Im,
  ListFilter as ed,
  Layers as Xl,
  Settings as ad,
  Users as Wl,
  ClipboardList as ym,
  Building2 as qs,
  Mail as Lm,
  Globe as Qc,
  CreditCard as Kc,
  ShieldCheck as Mm,
  ChartNoAxesCombined as Yc,
  Truck as nd,
  Sparkles as al,
  Send as Nm,
  ChartColumn as zs,
  Handshake as Sm,
  Search as tr,
} from "lucide-react";
import { Pagination as GI, Spinner as LoadingSpinner } from "@g4ai/ds";
import React, { useRef, useEffect } from "react";
import {
  commercialItem,
  commercialPaymentOptions,
  commercialTotal,
  isERP,
  prepareCommercialOrder,
  quantityRules,
  validQuantity,
} from "../lib/erp-commercial";
import * as runtime from "react/jsx-runtime";
import {
  Badge as bi,
  Button as Ft,
  PageHeading as Hp,
  PageToolbar as nv,
  TableToolbar as cv,
  DataTable as s1,
  Empty as hn,
  Drawer as xb,
  Select as ho,
  Tabs as of,
  Page as fa,
  ActionMenu as Il,
  KpiGrid as _i,
  ChartCard as cs,
  DatePicker as Jd,
  Callout as Gu,
  Card as Vt,
  Section as Ot,
  FieldGrid as Vi,
  IconButton as wR,
  NumberField as Hr,
  TextField as vr,
  TextareaField as $u,
  PropertyList as _o,
  KpiCard as Ha,
  Checkbox as Yy,
  CurrencyField as Up,
  KanbanBoard as c1,
  KanbanColumn as i1,
  KanbanCard as u1,
  BarChart as Qy,
  Modal as gb,
  SettingsLayout as uv,
  SettingsSection as nf,
  Switch as zu,
  AppShell as l1,
  Sidebar as t1,
  ThemeToggle as n0,
  ConfirmDialog as HR,
  formatCurrency as Vd,
  formatDate as oI,
  formatNumber as na,
  normalize as ol,
  notify as go,
  useSort as UI,
  usePagination as zI,
  BarList as Zy,
  ProductMark as rv,
} from "@g4ai/ds";
import catalogo from "./catalogo.json";
import {
  assertManualMutation,
  manualRows,
  useERPCategories,
  useERPRecord,
  useERPDocument,
  useERPTable,
} from "./erp-hooks";
import type { ERPClient, ERPQueryRef, ERPReportSource } from "./erp-hooks";
import { useERPCustomerReportLookups, useERPOrderLookups } from "./erp-order-lookups";
import {
  customerReportFilters,
  localCustomerReportRows,
  remoteCustomerReport,
} from "./erp-customer-report";
import { completionOwners, completionRecords, filterCompletions } from "./completion-report";
import {
  opportunityReportRows,
  filterOpportunityRows,
  opportunityReportOwners,
} from "./opportunity-report";
import { salesReportQuery } from "./erp-sales-report";
import { nonBuyersQuery } from "./nonbuyers-report";
import { useERPSalesChart, salesChartCoordinate } from "./erp-sales-chart";
import { useERPProductsChart } from "./erp-products-chart";
import { formatERPAmount, formatERPQuantity } from "../lib/erp-decimal";
import { ERPCombobox as Sl } from "./erp-combobox";
import type {
  ERPPrice,
  ERPRow,
  ERPSalesSummary,
  ERPItemSummary,
  ERPNonBuyersSummary,
} from "../lib/erp-online";
import { workspaceERPSeller } from "../lib/erp-identity";
import type { SubmissionClient } from "../lib/erp-submission";
import OrderSubmission from "./OrderSubmission";
import "./sul.css";

type RefPrice = ERPRow & { productId: string; price: number };
type Entity = ERPRow & {
  id: string;
  name?: string | undefined;
  code?: string | undefined;
  source?: string | undefined;
  status?: string | undefined;
  date?: string | undefined;
  seller?: string | undefined;
  customerId?: string | undefined;
  sellerId?: string | undefined;
  value?: number | null | undefined;
  notes?: string | undefined;
};
type Customer = Entity & {
  fantasy?: string | undefined;
  address?: string | undefined;
  cep?: string | undefined;
  email?: string | undefined;
  credit?: number | undefined;
  portal?: boolean | undefined;
  priceTableMatch?: string | undefined;
  name?: string | undefined;
  cnpj?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  blocked?: boolean | undefined;
  createdAt?: string | undefined;
  priceTables?: string[] | undefined;
  tags?: string[] | undefined;
  categories?: string[] | undefined;
  payments?: string[] | undefined;
  refItems?: RefPrice[] | undefined;
  __priceList?: RefPrice[] | undefined;
  refProduct?: string | undefined;
  refPrice?: number | undefined;
};
type Product = Entity & {
  multiple?: number | undefined;
  variants?: string[] | undefined;
  ipi?: number | undefined;
  ncm?: string | undefined;
  weight?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  length?: number | undefined;
  dimensionMode?: string | undefined;
  variantLabel?: string | undefined;
  priceSource?: string | undefined;
  categorySource?: string | undefined;
  name?: string | undefined;
  category?: string | undefined;
  price?: number | null | undefined;
  commission?: number | undefined;
  stock?: number | undefined;
  unit?: string | undefined;
};
type Order = Entity & {
  number?: string | number | undefined;
  agenda?: string | undefined;
  grossWeight?: number | undefined;
  freight?: number | undefined;
  customerId: string;
  seller?: string | undefined;
  date?: string | undefined;
  type?: string | undefined;
  items?: OrderItem[] | undefined;
  total?: number | undefined;
  delivery?: string | undefined;
  cargoStatus?: string | undefined;
  integration?: string | undefined;
  invoiced?: number | null | undefined;
  readOnly?: boolean | undefined;
  erp?: {
    source?: string | undefined;
    mode?: string | undefined;
    companyCode: number;
    operationCode: number;
    sellerCode: number;
    payment?: { code: number } | undefined;
    movement?: string | undefined;
  };
};
type CollectionRow = Entity & { kind?: string | undefined; required?: boolean | undefined };
type Chat = Entity & { question: string; answer: string; model?: string | undefined };
export type AppState = ERPRow & {
  company: ERPRow & {
    name: string;
    id: string;
    user: string;
    role: string;
    plan: string;
    integration: string;
    credits: number;
    userId?: string | undefined;
    email?: string | undefined;
  };
  config: ERPRow & {
    recentDays: number;
    oldDays: number;
    checkinDistance: number;
    stock: boolean;
    portal: boolean;
    pay: boolean;
    duplicateDocument: boolean;
    zeroPriceBlocked: boolean;
    freightRequired: boolean;
  };
  collections: Record<string, CollectionRow[]>;
  customers: Customer[];
  products: Product[];
  orders: Order[];
  opportunities: (Entity & { stage?: string | undefined; total?: number | undefined })[];
  tasks: Entity[];
  activities: Entity[];
  routes: Entity[];
  titles: (Entity & { due?: string | undefined })[];
  emails: Entity[];
  invoices: (Entity & { orderId?: string | undefined; number?: string | undefined })[];
  stages: string[];
  payments: string[];
  reports: (Entity & { name: string })[];
  indicators: Record<string, string[]>;
  extraIndicators: string[];
  panels: string[];
  activePanel: string;
  targets: Record<string, number>;
  targetPeriods?: Record<string, Record<string, number>> | undefined;
  priceTablesBase: Record<string, Record<string, number>>;
  logs: Entity[];
  chats: Chat[];
  users: (Entity & { name?: string | undefined; active?: boolean | undefined })[];
  teams: Entity[];
  carriers: Entity[];
  policy: Entity[];
  userBindings?: ERPRow[] | undefined;
};
const asRecord = (value: unknown): ERPRow =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as ERPRow) : {};

type FormValues = ERPRow & {
  id?: string | undefined;
  name?: string | undefined;
  code?: string | undefined;
  cnpj?: string | undefined;
  customerId?: string | undefined;
  __priceList?: RefPrice[] | undefined;
  priceTableMatch?: string | undefined;
  refItems?: RefPrice[] | undefined;
  refProductId?: string | undefined;
  refPrice?: number | undefined;
  value?: number | null | undefined;
};
type EditorSpec = {
  title: string;
  allocateIdentity?: boolean;
  values?: ERPRow;
  fields: {
    key: string;
    label: string;
    required?: boolean | undefined;
    kind?: string | undefined;
    type?: string | undefined;
    options?: string[] | { value: string; label: string }[] | "PRODUCTS" | undefined;
  }[];
  save: (values: FormValues) => Promise<unknown>;
  validate?: (values: FormValues) => string | undefined;
};
type ConfirmationSpec = {
  title: string;
  run: () => unknown | Promise<unknown>;
  description: string;
};
type AppContext = {
  db: ReturnType<typeof createAppState>;
  online: ERPClient | undefined;
  submission: SubmissionClient | undefined;
  refresh: () => Promise<ReturnType<typeof createAppState>>;
  queryMetadata: ERPQueryRef;
  update: ReturnType<typeof createMutationQueue>;
  editor: React.Dispatch<React.SetStateAction<EditorSpec | null>>;
  confirm: (title: string, run: ConfirmationSpec["run"], description?: string) => void;
  onSignOut: () => Promise<void>;
  path: string;
};
const He = React;
const b = runtime;
export { businessDate, monthBusinessDays, remainingBusinessDays } from "../lib/business-month";
export function percentageChange(previous: number, current: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}
type CSVColumn<Row extends ERPRow> = {
  key: string;
  get?: (row: Row) => unknown | undefined;
  cell?: (row: Row) => unknown | undefined;
};
export function invoicedOrders<Order extends { id: string }>(
  orders: Order[],
  invoices: { orderId?: string | undefined }[],
): Order[] {
  const ids = new Set(
    invoices
      .map((invoice) => invoice.orderId)
      .filter((value): value is NonNullable<typeof value> => !!value),
  );
  return orders.filter((order) => ids.has(order.id));
}
export function csvRows<Row extends ERPRow>(rows: Row[], columns: CSVColumn<Row>[]): ERPRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => {
        let value = column.get ? column.get(row) : row[column.key];
        if (value === undefined && column.cell) {
          const derived = column.cell(row);
          if (["string", "number", "boolean"].includes(typeof derived)) value = derived;
        }
        return [column.key, value];
      }),
    ),
  );
}
export function businessMonthLabel(month: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T12:00:00Z"));
}
export function createAppState<Remote extends ERPRow = ERPRow>(
  remote: Remote = {} as Remote,
): AppState & Remote {
  const base = structuredClone(catalogo) as AppState;
  return {
    ...base,
    ...remote,
    company: { ...base["company"], ...asRecord(remote["company"]) },
    config: { ...base["config"], ...asRecord(remote["config"]) },
    collections: {
      ...base["collections"],
      ...(asRecord(remote["collections"]) as Record<string, CollectionRow[]>),
    },
  };
}
// A identidade pertence ao formulário, não ao tamanho da carteira visível.
export function createEditorValues<Values extends ERPRow = ERPRow>(
  values: Values = {} as Values,
): Values & { id: string } {
  return {
    ...values,
    id: typeof values["id"] === "string" && values["id"] ? values["id"] : crypto.randomUUID(),
  };
}
export function technicalCode(prefix: string, id: string): string {
  return `${prefix}-${id}`;
}
export const userBindingRoles = ["Administrador", "Gestor", "Vendedor"];
export function openUserBindingEditor(
  editor: (spec: EditorSpec) => void,
  update: (mutator: (draft: ReturnType<typeof createAppState>) => unknown) => Promise<unknown>,
): void {
  editor({
    title: "Adicionar registro local",
    allocateIdentity: true,
    fields: [
      { key: "name", label: "Nome / descrição", required: true },
      { key: "email", label: "E-mail", type: "email", required: true },
      { key: "role", label: "Papel", options: userBindingRoles, required: true },
    ],
    save: async (form) =>
      await update((state) => {
        state["userBindings"] = [
          {
            id: form["id"],
            name: String(form["name"] || "").trim(),
            email: String(form["email"] || "")
              .trim()
              .toLowerCase(),
            role: form["role"],
          },
        ];
      }),
  });
}
type TargetState = {
  targetPeriods?: Record<string, Record<string, number>> | undefined;
  targets?: Record<string, number> | undefined;
};
export function monthlyTargets(db: TargetState, month: string): Record<string, number> {
  return db.targetPeriods?.[month] || {};
}
export function setMonthlyTarget(
  db: TargetState,
  month: string,
  seller: string,
  value: number,
): void {
  db.targetPeriods ||= {};
  db.targetPeriods[month] ||= {};
  db.targetPeriods[month][seller] = Number(value);
  if (month === businessDate().slice(0, 7)) db.targets = { ...db.targetPeriods[month] };
}
export function activityOwner(
  db: {
    company: { userId?: string | undefined };
    customers: { id: string; sellerId?: string | undefined }[];
  },
  customerId: string,
): string | undefined {
  return customerId
    ? db.customers.find((customer) => customer.id === customerId)?.sellerId
    : db["company"].userId;
}
export function customerPriceTables(
  db: { company?: { role?: string | undefined } | undefined },
  existing: { priceTables?: string[] | undefined } | undefined,
  match: string,
): string[] {
  return ["administrador", "gestor"].includes(String(db.company?.role).toLowerCase())
    ? match
      ? [match]
      : []
    : [...(existing?.priceTables || [])];
}
// O único desvio da guarda de cadastros é o documento local online: o RPC valida
// referências e cria snapshots. Nenhum cadastro transitório entra no estado global.
export function assertOrderMutation(next: AppState, before: AppState): void {
  const document = (order: Order): order is Order & { erp: NonNullable<Order["erp"]> } =>
    order?.erp?.source === "sankhya" && order.erp.mode === "online";
  for (const order of next["orders"] || []) {
    if (!document(order)) continue;
    validateOnlineOrderShape(order, true);
    if (
      typeof order.id !== "string" ||
      order.id.startsWith("sankhya:") ||
      order.readOnly === true ||
      !/^sankhya:customer:[1-9]\d*$/.test(order.customerId) ||
      order.erp.companyCode !== 1 ||
      order.erp.operationCode !== 1001 ||
      !Number.isSafeInteger(order.erp.sellerCode) ||
      order.erp.sellerCode < 1 ||
      !Number.isSafeInteger(order.erp.payment?.code) ||
      (order.erp.payment?.code ?? 0) < 1 ||
      !Array.isArray(order.items) ||
      !order.items.length ||
      order.items.some((item) => !/^sankhya:product:[1-9]\d*$/.test(item.productId))
    )
      throw new Error("Documento ERP online inválido.");
  }
  const referencesOnly = (order: Order) => {
    if (!document(order)) return order;
    const { erp: _erp, customerSnapshot: _customer, ...local } = order;
    return {
      ...local,
      customerId: "referencia-online",
      items: (order.items || []).map((item) => {
        const { erp: _itemERP, productSnapshot: _product, ...fields } = item;
        return { ...fields, productId: "referencia-online" };
      }),
    };
  };
  assertManualMutation(
    { ...next, orders: (next["orders"] || []).map(referencesOnly) },
    { ...before, orders: (before["orders"] || []).map(referencesOnly) },
  );
  const existingProducts = new Set((before.products || []).map((product) => product.id));
  if (
    (next.products || []).some(
      (product) => !product.id.startsWith("sankhya:") && !existingProducts.has(product.id),
    )
  )
    throw new Error("Criação local de produtos desativada. Utilize o catálogo ERP.");
  const existingHighlights = new Set(
    (before.collections?.["destaques"] || []).map((row) => row.id),
  );
  if ((next.collections?.["destaques"] || []).some((row) => !existingHighlights.has(row.id)))
    throw new Error("Criação de destaques desativada.");
  if (JSON.stringify(next.products || []) !== JSON.stringify(before.products || []))
    throw new Error("Cadastro de produtos disponível somente para consulta.");
  for (const key of Object.keys(next.collections || {}).filter((key) =>
    key.startsWith("produtos/"),
  )) {
    if (
      JSON.stringify(next.collections?.[key] || []) !==
      JSON.stringify(before.collections?.[key] || [])
    )
      throw new Error("Configuração de produtos disponível somente para consulta.");
  }
}
const orderError = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível confirmar o contexto comercial.";
export function useERPOrderPayments(client: ERPClient | undefined, customerId: string) {
  const [result, setResult] = React.useState<{
    client: ERPClient;
    customerId: string;
    rows: ERPRow[];
    error?: string | undefined;
  }>();
  const current = useRef({ client, customerId });
  current.current = { client, customerId };
  useEffect(() => {
    if (!client || !/^sankhya:customer:[1-9]\d*$/.test(customerId)) return;
    let alive = true,
      generation = 0,
      search = "",
      offset = 0,
      total = 0,
      busy = false,
      rows: ERPRow[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const valid = (version: number) =>
      alive &&
      generation === version &&
      current.current.client === client &&
      current.current.customerId === customerId;
    async function load(append = false) {
      if (busy) return;
      busy = true;
      const version = generation;
      try {
        const page = await client!.paymentOptions({ customerId, offset, limit: 50, search });
        if (!valid(version)) return;
        rows = append ? [...rows, ...page.items] : page.items;
        offset += page.items.length;
        total = page.total;
        setResult({ client: client!, customerId, rows });
      } catch (error) {
        if (valid(version)) {
          rows = [];
          setResult({ client: client!, customerId, rows, error: orderError(error) });
        }
      } finally {
        if (valid(version)) busy = false;
      }
    }
    function popup(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return null;
      const found = target.closest<HTMLElement>('[aria-label="Condição de pagamento"]');
      return found?.tagName !== "BUTTON" &&
        found?.querySelector('input[aria-label="Buscar em condição de pagamento"]')
        ? found
        : null;
    }
    function input(event: Event) {
      const field = event.target;
      if (!(field instanceof HTMLInputElement) || !popup(field) || field.value === search) return;
      search = field.value;
      generation++;
      busy = false;
      rows = [];
      offset = 0;
      total = 0;
      setResult({ client: client!, customerId, rows });
      clearTimeout(timer);
      timer = setTimeout(() => {
        void load();
      }, 180);
    }
    function scroll(event: Event) {
      const list = event.target;
      if (
        list instanceof HTMLElement &&
        list.getAttribute("role") === "listbox" &&
        popup(list) &&
        list.scrollHeight > list.clientHeight &&
        list.scrollTop + list.clientHeight >= list.scrollHeight - 4 &&
        offset < total
      )
        void load(true);
    }
    document.addEventListener("input", input, true);
    document.addEventListener("focusin", input, true);
    document.addEventListener("scroll", scroll, true);
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("input", input, true);
      document.removeEventListener("focusin", input, true);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [client, customerId]);
  const valid = result?.client === client && result?.customerId === customerId ? result : undefined;
  return { rows: valid?.rows || [], error: valid?.error };
}
export type OnlineOrderContext = {
  customerId: string;
  paymentCode: number;
  sellerId: string;
  type: string;
  date: string;
};
export async function quoteERPOrderItem(
  client: ERPClient,
  context: OnlineOrderContext,
  product: ERPRow | undefined,
  quantity: number,
  unit: unknown = product?.["unit"],
): Promise<ERPPrice> {
  const sellerCode = Number(/^sankhya:seller:([1-9]\d*)$/.exec(context.sellerId)?.[1]);
  if (
    !/^sankhya:customer:[1-9]\d*$/.test(context.customerId) ||
    !Number.isSafeInteger(context.paymentCode) ||
    context.paymentCode < 1 ||
    !Number.isSafeInteger(sellerCode) ||
    sellerCode < 1 ||
    context.type !== "Venda" ||
    typeof product?.["id"] !== "string" ||
    typeof unit !== "string" ||
    !unit ||
    !validQuantity(product, quantity, unit)
  )
    throw new Error(
      "Confirme cliente, condição de pagamento, vendedor ERP, unidade e quantidade antes de consultar o preço.",
    );
  const quote = await client.price({
    customerId: context.customerId,
    productId: product["id"],
    paymentCode: context.paymentCode,
    type: "Venda",
    sellerCode,
    quantity,
    unit,
    date: context.date,
  });
  if (
    quote.seller["id"] !== context.sellerId ||
    quote.quantity !== quantity ||
    quote.price.unit !== unit ||
    quote.customer["id"] !== context.customerId ||
    quote.product["id"] !== product["id"] ||
    quote.payment.code !== context.paymentCode
  )
    throw new Error("O preço retornado não corresponde ao contexto selecionado.");
  if (quote.price.amount <= 0) throw new Error("Preço ERP não confirmado.");
  // Valida centavos sem arredondar nem transformar preço ausente em zero.
  commercialTotal([{ qty: quantity, price: quote.price.amount }]);
  return quote;
}
type OrderItem = ERPRow & {
  productId: string;
  qty: number;
  price?: number | undefined;
  unit?: string | undefined;
  id?: string | undefined;
  name?: string | undefined;
  code?: string | undefined;
  total?: number | undefined;
  erp?: ERPRow & {
    productName?: string | undefined;
    productCode?: string | undefined;
    product?: ERPRow & {
      name?: string | undefined;
      code?: string | undefined;
      productCode?: string | undefined;
    };
  };
};
type OrderDraft = ERPRow & {
  items: OrderItem[];
  seller?: string | undefined;
  sellerId?: string | undefined;
  customerSnapshot?: ERPRow | undefined;
  freight?: number | undefined;
};
export function prepareOnlineOrder<Order extends OrderDraft>(
  order: Order,
  context: OnlineOrderContext,
  quotes: ERPPrice[],
): Omit<Order, "items"> & {
  customerId: string;
  seller: string;
  payment: string;
  items: OrderItem[];
  total: number;
  erp: {
    source: string;
    mode: string;
    companyCode: number;
    operationCode: number;
    sellerCode: number;
    payment: { code: number };
  };
  sellerId?: string | undefined;
  customerSnapshot?: ERPRow | undefined;
} {
  validateOnlineOrderShape({ ...order, date: context.date }, false);
  const first = quotes[0];
  if (context.type !== "Venda")
    throw new Error("Tipo de pedido ERP não autorizado neste contexto.");
  if (!first || quotes.length !== order.items.length)
    throw new Error("Aguarde a confirmação de todos os preços no contexto atual.");
  order.items.forEach((item, index) => {
    const quote = quotes[index];
    if (
      !quote ||
      quote.customer["id"] !== context.customerId ||
      quote.product["id"] !== item.productId ||
      quote.seller["id"] !== context.sellerId ||
      quote.payment.code !== context.paymentCode ||
      quote.companyCode !== 1 ||
      quote.companyCode !== first.companyCode ||
      quote.operationCode !== 1001 ||
      quote.operationVersion !== first.operationVersion ||
      quote.payment.version !== first.payment.version ||
      quote.payment.label !== first.payment.label ||
      quote.quantity !== item.qty ||
      quote.price.amount !== item.price ||
      quote.price.unit !== item.unit
    )
      throw new Error("Contexto comercial mudou; confirme os preços antes de salvar.");
  });
  return {
    ...order,
    date: context.date,
    customerId: context.customerId,
    seller: String(first.seller["name"] || order.seller),
    payment: first.payment.label,
    items: order.items.map((item) => ({
      productId: item.productId,
      qty: item.qty,
      price: item.price,
      unit: item.unit,
    })),
    total: commercialTotal(order.items, order.freight ?? 0),
    erp: {
      source: "sankhya",
      mode: "online",
      companyCode: first.companyCode,
      operationCode: 1001,
      sellerCode: Number(context.sellerId.split(":")[2]),
      payment: { code: first.payment.code },
    },
  };
}
export function useERPOrderPrices(
  client: ERPClient | undefined,
  context: OnlineOrderContext,
  items: OrderItem[],
  products: ERPRow[],
) {
  const productKey = JSON.stringify(
    products.filter((product) => items.some((item) => item.productId === product["id"])),
  );
  const key = JSON.stringify([
    context,
    items.map((item) => [item.productId, item.qty, item.unit]),
    productKey,
  ]);
  const current = useRef({ client, key });
  current.current = { client, key };
  const [state, setState] = React.useState<{
    client: ERPClient;
    key: string;
    quotes?: ERPPrice[] | undefined;
    error?: string | undefined;
  }>();
  useEffect(() => {
    if (!client || !context.customerId.startsWith("sankhya:")) return;
    let alive = true;
    void Promise.all(
      items.map((item) =>
        quoteERPOrderItem(
          client,
          context,
          products.find((product) => product["id"] === item.productId),
          item.qty,
          item.unit,
        ),
      ),
    )
      .then((quotes) => {
        if (alive && current.current.client === client && current.current.key === key)
          setState({ client, key, quotes });
      })
      .catch((error) => {
        if (alive && current.current.client === client && current.current.key === key)
          setState({ client, key, error: orderError(error) });
      });
    return () => {
      alive = false;
    };
  }, [client, key]);
  return state?.client === client && state?.key === key ? state : undefined;
}
export function createMutationQueue<State extends ERPRow>(
  current: {
    current: State;
  },
  persist: SulAppProps["persist"],
  commit: (confirmed: AppState & State) => void,
  reload?: () => Promise<ERPRow>,
) {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = (mutator: (draft: AppState & State) => unknown): Promise<AppState & State> => {
    const pending = tail.then(async () => {
      const before = current.current;
      const next = structuredClone(before) as AppState & State;
      mutator(next);
      try {
        assertOrderMutation(next, before as AppState);
      } catch (error) {
        go(error instanceof Error ? error.message : String(error));
        throw error;
      }
      const record = (value: unknown): ERPRow | undefined =>
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? (value as ERPRow)
          : undefined;
      const mark = (value: unknown, previous: unknown): void => {
        if (Array.isArray(value)) {
          const priorRows: unknown[] = Array.isArray(previous) ? previous : [];
          for (const element of value as unknown[]) {
            const row = record(element);
            const prior = priorRows.find((item) => record(item)?.["id"] === row?.["id"]);
            if (row?.["id"] && JSON.stringify(row) !== JSON.stringify(prior))
              row["source"] = "registrado";
            mark(element, prior);
          }
        } else {
          const row = record(value),
            prior = record(previous);
          if (!row) return;
          for (const key of Object.keys(row))
            if (
              key !== "userBindings" &&
              key !== "erp" &&
              key !== "customerSnapshot" &&
              key !== "productSnapshot"
            )
              mark(row[key], prior?.[key]);
        }
      };
      mark(next, before);
      try {
        const confirmed = createAppState(await persist(next)) as AppState & State;
        current.current = confirmed;
        commit(confirmed);
        return confirmed;
      } catch (error) {
        go(error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente.");
        throw error;
      }
    });
    tail = pending.catch(() => undefined);
    return pending;
  };
  return Object.assign(enqueue, {
    refresh: () => {
      const pending = tail.then(async () => {
        if (!reload) throw new Error("Recarga autenticada indisponível.");
        const confirmed = createAppState(await reload()) as AppState & State;
        current.current = confirmed;
        commit(confirmed);
        return confirmed;
      });
      tail = pending.catch(() => undefined);
      return pending;
    },
  });
}
const bo = businessDate(),
  pa = "N\xE3o extra\xEDdo",
  Xu = <Value,>(e: Value): Value => JSON.parse(JSON.stringify(e)),
  rt = (e: number | string | null | undefined) =>
    e == null ? pa : typeof e === "string" ? (formatERPAmount(e) ?? pa) : Vd(e),
  xo = (e: string | Date | null | undefined) => (e ? oI(e) : pa),
  La = (e: (string | { value: string; label: string })[]) =>
    e.map((t) => (typeof t == "string" ? { value: t, label: t || "Todos" } : t)),
  zp = (e: { customers: Customer[] }, t: unknown) => e.customers.find((a) => a.id === t),
  Un = (e: { customers: Customer[] }, t: unknown) => zp(e, t)?.name || "Cliente indispon\xEDvel",
  Ur = (e: { products: Product[] }, t: unknown) => e.products.find((a) => a.id === t),
  Zo = (e: ERPRow[], t: string) => e.reduce((a, o) => a + (Number(o[t]) || 0), 0),
  y5 = (e: number) => Math.round(e * 100),
  d1 = (items: unknown[], freight = 0) => commercialTotal(items, freight),
  I5 = He.createContext<AppContext | null>(null),
  useSulContext = (): AppContext => {
    const context = He.useContext(I5);
    if (!context) throw new Error("Contexto SulBR indisponível.");
    return context;
  };
function sellerNames(db: ReturnType<typeof createAppState>): string[] {
  return [
    ...new Set<string>(
      [
        db["company"].user,
        ...((db["users"] || []) as { active?: boolean | undefined; name: string }[])
          .filter((u) => u.active !== false)
          .map((u) => u.name),
      ].filter((value): value is NonNullable<typeof value> => !!value),
    ),
  ];
}
function qr({ row: e }: { row?: { source?: string | undefined } | undefined }) {
  const source = e?.source;
  return b.jsx(bi, {
    tone: source === "simulado" ? "warn" : "neutral",
    children:
      source === "simulado"
        ? "Simulado"
        : source === "observado"
          ? "Observado"
          : source === "servidor"
            ? "Registrado"
            : "Cadastrado",
  });
}
function qn({ value: e }: { value?: string | undefined }) {
  return (0, b.jsx)(bi, {
    tone: ["Conclu\xEDdo", "Realizada", "Ganha", "Integrado", "Ativo"].includes(e || "")
      ? "ok"
      : ["Cancelado", "Perdida", "Bloqueado"].includes(e || "")
        ? "bad"
        : "neutral",
    children: e || pa,
  });
}
function xt({ children: e, ...t }: React.ComponentProps<typeof Ft>) {
  return (0, b.jsx)(Ft, { variant: "ghost", ...t, children: e });
}
function oz({ to: e, label: t = "Voltar" }: { to: string; label?: string | undefined }) {
  return (0, b.jsxs)(xt, { href: "#" + e, children: [(0, b.jsx)(gm, {}), t] });
}
function Xt({ children: e }: React.PropsWithChildren) {
  return (0, b.jsx)("p", {
    className: "text-caption text-muted leading-relaxed",
    children: e,
  });
}
function Ua({
  title: e,
  description: t,
  actions: a,
  back: o,
}: {
  title: string;
  description?: string | undefined;
  actions?: React.ReactNode | undefined;
  back?: { label: string; to: string } | undefined;
}) {
  return (0, b.jsx)(Hp, {
    title: e,
    description: t,
    crumbs: o ? [{ label: o.label, href: "#" + o.to }] : void 0,
    actions: a,
  });
}
function bn(e: string) {
  location.hash = e;
}
function L5<Row extends ERPRow>(e: Row[], t: string): Row[] {
  return e.filter((a) =>
    ol(
      Object.values(a)
        .filter((o) => typeof o != "object")
        .join(" "),
    ).includes(ol(t)),
  );
}
function RecordsTable({
  rows: e,
  columns: t,
  label: a,
  onRowClick: o,
  empty: n,
  toolbar: r = !0,
  actions: l,
  q: s,
  onQuery: i,
  remote,
  exportRef,
  onStatus,
}: {
  rows: ERPRow[];
  columns: TableColumn[];
  label?: string | undefined;
  onRowClick?: ((row: ViewRow) => void) | undefined;
  empty?: string | undefined;
  toolbar?: boolean | undefined;
  actions?: React.ReactNode | undefined;
  q?: string | undefined;
  onQuery?: (query: string) => void | undefined;
  remote?: Parameters<typeof useERPTable>[0] | undefined;
  exportRef?: React.MutableRefObject<(() => ERPRow[]) | undefined>;
  onStatus?: (status: { loading: boolean; error: boolean }) => void | undefined;
}) {
  const [u, c] = (0, He.useState)(""),
    f = s ?? u,
    d = L5(e, f),
    m = (0, He.useMemo)(
      () =>
        Object.fromEntries(
          t.map((x) => [
            x.key,
            x.get ||
              ((v: ERPRow) => {
                const value = v[x.key];
                return typeof value === "string" || typeof value === "number" ? value : "";
              }),
          ]),
        ),
      [t],
    ),
    p = UI(remote ? [] : d, m),
    local = zI(p.rows, 10, { resetKey: f }),
    context = useSulContext(),
    onlinePage = useERPTable(remote, e, f, p.sort, context.queryMetadata),
    y = remote ? onlinePage : local,
    tableLoading = !!remote && !!onlinePage.loading,
    tableError = !!remote && !!onlinePage.error,
    C = t.map((x) => ({
      ...x,
      sortKey: x.action || x.selection ? void 0 : x.key,
    }));
  He.useEffect(() => {
    onStatus?.({ loading: tableLoading, error: tableError });
  }, [tableLoading, tableError]);
  if (exportRef) exportRef.current = () => p.rows;
  return (0, b.jsxs)("div", {
    className: "space-y-3",
    children: [
      r &&
        (0, b.jsx)(nv, {
          children: (0, b.jsx)(cv, {
            query: f,
            onQuery: i || c,
            shown: remote ? (onlinePage.total ?? pa) : d.length,
            total: remote ? (onlinePage.totalWithoutSearch ?? pa) : e.length,
            noun: "registro",
            hideSearch: !1,
            dirty: !!f,
            onClear: () => (i ? i("") : c("")),
            children: l,
          }),
        }),
      (0, b.jsx)(s1, {
        label: a || "Registros",
        columns: C,
        rows: y.rows,
        rowKey: (x: ERPRow) => String(x["id"]),
        rowLabel: (x: ERPRow) => String(x["name"] || x["number"] || x["id"]),
        onRowClick: o,
        sort: p,
        loading: remote ? onlinePage.loading : !1,
        error: remote ? onlinePage.error : void 0,
        empty: (0, b.jsx)(hn, {
          framed: !1,
          title: n || "Nenhum registro neste recorte",
          hint: f
            ? "Tente outro termo de busca."
            : "Nenhum dado disponível para os filtros selecionados.",
          action: f
            ? (0, b.jsx)(xt, {
                onClick: () => (i ? i("") : c("")),
                children: "Limpar busca",
              })
            : void 0,
        }),
      }),
      (0, b.jsx)(GI, {
        page: y.page,
        pageCount: y.pageCount,
        onPage: y.setPage,
        total: y.total,
        pageSize: y.pageSize,
        pageSizeOptions: [10, 20, 50],
        onPageSizeChange: y.setPageSize,
      }),
    ],
  });
}
type TableColumn = ERPRow & {
  key: string;
  header: string;
  cell?: (row: ViewRow) => React.ReactNode | undefined;
  get?: (row: ERPRow) => string | number | Date | null | undefined;
  action?: boolean | undefined;
  selection?: boolean | undefined;
};
type ViewRow = ERPRow & { [K in keyof Entity]?: Entity[K] | undefined } & {
  customerName?: string | undefined;
  type?: string | undefined;
  delivery?: string | undefined;
  cargoStatus?: string | undefined;
  total?: number | string | null | undefined;
  price?: number | string | null | undefined;
  qty?: number | undefined;
  invoiced?: number | null | undefined;
  items?: OrderItem[] | undefined;
  ant?: number | undefined;
  atual?: number | undefined;
  pct?: number | null | undefined;
  fat?: number | undefined;
  createdAt?: string | undefined;
  due?: string | undefined;
  blocked?: boolean | undefined;
  priceTables?: string[] | undefined;
  tags?: string[] | undefined;
  category?: string | undefined;
  rank?: number | undefined;
  target?: number | string | null | undefined;
  hit?: number | undefined;
  localStatus?: string | undefined;
  last?: string | null | undefined;
  days?: number | null | undefined;
  curve?: string | undefined;
  share?: number | undefined;
  stock?: number | null | undefined;
  base?: number | undefined;
  subtotal?: number | undefined;
  progress?: number | undefined;
  commission?: number | undefined;
  start?: string | undefined;
  end?: string | undefined;
  required?: boolean | undefined;
  stage?: string | undefined;
  count?: number | undefined;
  number?: string | number | undefined;
};
function z(
  e: string,
  t: string,
  a: TableColumn["cell"] = undefined,
  o: Partial<TableColumn> = {},
): TableColumn {
  return {
    key: e,
    header: t,
    cell:
      a ||
      ((n) => {
        const value = n[e];
        return typeof value === "string" || typeof value === "number" ? value : pa;
      }),
    ...o,
  };
}
function Gp({
  rows: e,
  name: t,
  columns: a,
  remoteResource,
  transformRows,
  localRows,
}: {
  rows: ERPRow[];
  name?: string | undefined;
  columns?: string[] | undefined;
  remoteResource?: keyof ERPQueryRef["current"] | undefined;
  transformRows?: ((rows: ERPRow[]) => ERPRow[]) | undefined;
  localRows?: React.MutableRefObject<(() => ERPRow[]) | undefined>;
}) {
  const { online, queryMetadata } = useSulContext();
  return (0, b.jsxs)(xt, {
    onClick: async () => {
      try {
        let rows = localRows?.current?.() || e;
        if (online && remoteResource) {
          const metadata = queryMetadata.current[remoteResource as keyof ERPQueryRef["current"]];
          if (!metadata) throw new Error("Consulta ERP indisponível. Tente novamente.");
          rows = await metadata.exportRows();
        }
        if (transformRows) rows = transformRows(rows);
        const o = a || Object.keys(rows[0] || {}).filter((s) => !["items", "variants"].includes(s)),
          n = (s: unknown) => '"' + String(s ?? "").replaceAll('"', '""') + '"',
          r =
            "\uFEFF" +
            [
              o.join(";"),
              ...rows.map((s) =>
                o.map((i) => n(typeof s[i] == "object" ? JSON.stringify(s[i]) : s[i])).join(";"),
              ),
            ].join(`\r
`),
          l = document.createElement("a");
        {
          l.href = URL.createObjectURL(new Blob([r], { type: "text/csv;charset=utf-8" }));
          l.download = (t || "recorte") + ".csv";
          l.click();
          setTimeout(() => URL.revokeObjectURL(l.href), 2e3);
          go("Recorte exportado em CSV");
        }
      } catch (error) {
        go(error instanceof Error ? error.message : String(error));
      }
    },
    children: [(0, b.jsx)(vm, {}), "Exportar CSV"],
  });
}
function w5<Row extends ERPRow>(
  e: Row[],
  initial?: Partial<{ seller: string; status: string; customer: string; from: string; to: string }>,
) {
  const [t, a] = (0, He.useState)(!1),
    [o, n] = (0, He.useState)({
      seller: "",
      status: "",
      customer: "",
      from: "",
      to: "",
      ...initial,
    }),
    r = e.filter(
      (l) =>
        (!o.seller || l["seller"] === o.seller) &&
        (!o.status || l["status"] === o.status) &&
        (!o.customer || l["customerId"] === o.customer) &&
        (!l["date"] ||
          ((!o.from || String(l["date"]) >= o.from) && (!o.to || String(l["date"]) <= o.to))),
    );
  return { open: t, setOpen: a, f: o, setF: n, rows: r };
}
function E5({
  filter: e,
  rows: t,
  customerReport = false,
  salesReport = false,
  billingReport = false,
  receivablesReport = false,
  localOwners,
}: {
  filter: ReturnType<typeof w5>;
  rows: ERPRow[];
  customerReport?: boolean | undefined;
  salesReport?: boolean | undefined;
  billingReport?: boolean | undefined;
  receivablesReport?: boolean | undefined;
  localOwners?: { value: string; label: string }[] | undefined;
}) {
  const { db: a, online } = useSulContext(),
    [o, n] = (0, He.useState)(e.f);
  const remoteFilters = customerReport || salesReport || receivablesReport;
  const lookups = useERPCustomerReportLookups(
    remoteFilters && e.open ? online : undefined,
    o.customer || "",
    o.seller || "",
  );
  const lookupError = lookups.customers.error || lookups.sellers.error;
  (0, He.useEffect)(() => {
    if (lookupError) go(lookupError);
  }, [lookupError]);
  (0, He.useEffect)(() => {
    {
      if (e.open) {
        n(e.f);
      }
    }
  }, [e.open]);
  const r = (l: string, s: string) => n((i) => ({ ...i, [l]: s }));
  return (0, b.jsx)(xb, {
    open: e.open,
    onClose: () => e.setOpen(!1),
    title: "Filtros",
    kicker: billingReport || receivablesReport ? "Consulta ERP" : "Consulta local",
    footer: (0, b.jsxs)(b.Fragment, {
      children: [
        (0, b.jsx)(xt, {
          onClick: () => {
            {
              e.setF({ seller: "", status: "", customer: "", from: "", to: "" });
              e.setOpen(!1);
            }
          },
          children: "Limpar filtros",
        }),
        (0, b.jsx)(Ft, {
          onClick: () => {
            {
              e.setF(o);
              e.setOpen(!1);
            }
          },
          children: "Aplicar filtros",
        }),
      ],
    }),
    children: (0, b.jsxs)("div", {
      className: "space-y-5",
      children: [
        (0, b.jsx)(Sl, {
          label: "Cliente",
          placeholder: "Todos os clientes",
          value: o.customer,
          onValueChange: (l: string) => r("customer", l),
          options: (salesReport || receivablesReport
            ? lookups.customers.rows
            : customerReport
              ? [...manualRows(a["customers"]), ...lookups.customers.rows]
              : a["customers"]
          ).map((l) => ({
            value: l["id"],
            label: l["name"] + " (" + l["code"] + ")",
          })),
          remote: remoteFilters ? lookups.customers.matches : undefined,
        }),
        (0, b.jsx)(Sl, {
          label: "Vendedor",
          placeholder: "Todos os vendedores",
          value: o.seller,
          onValueChange: (l: string) => r("seller", l),
          options: localOwners
            ? La(["", ...localOwners])
            : remoteFilters
              ? La([
                  "",
                  ...lookups.sellers.rows.map((l) => ({
                    value: String(l["id"]),
                    label: String(l["name"]),
                  })),
                ])
              : La(["", ...new Set(a["orders"].map((l) => l.seller || "")), a["company"].user]),
          remote: remoteFilters ? lookups.sellers.matches : undefined,
        }),
        (0, b.jsx)(ho, {
          label: "Situa\xE7\xE3o",
          value: o.status,
          onValueChange: (l: string) => r("status", l),
          options: La([
            "",
            ...new Set<string>(
              t
                .map((l) => String(l["status"]))
                .filter((value): value is NonNullable<typeof value> => !!value),
            ),
          ]),
        }),
        (0, b.jsx)(Xt, {
          children: receivablesReport
            ? "Os filtros consultam recebíveis no ERP; baixa registrada não comprova quitação integral."
            : billingReport
              ? "Os filtros consultam as notas fiscais do ERP."
              : "Os filtros consultam os registros salvos na SulBR.",
        }),
      ],
    }),
  });
}
function jp(e: ReturnType<typeof createAppState>, billing = false) {
  return [
    z(
      "number",
      billing ? "Documento ERP" : "Pedido",
      (t) =>
        (0, b.jsxs)("div", {
          className: "space-y-1",
          children: [
            (0, b.jsxs)("a", {
              className: "font-medium ds-link",
              href: "#/pedidos/" + t.id,
              children: ["#", t.number],
            }),
            (0, b.jsx)("div", { children: (0, b.jsx)(qr, { row: t }) }),
          ],
        }),
      { primary: !0 },
    ),
    z("date", billing ? "Faturamento" : "Emiss\xE3o", (t) => xo(t.date)),
    z("customer", "Cliente", (t) => t.customerName || Un(e, t.customerId), {
      wide: !0,
      get: (t) => String(t["customerName"] || Un(e, t["customerId"])),
    }),
    z("seller", "Vendedor"),
    z("delivery", "data_entrega", (t) => xo(t.delivery)),
    z(
      "total",
      "Total",
      (t) =>
        (0, b.jsx)("strong", {
          className: "tabular-nums",
          children: rt(t.total),
        }),
      { align: "right" },
    ),
    z("cargoStatus", billing ? "Status da carga" : "Status", (t) =>
      t.cargoStatus ? (0, b.jsx)(qn, { value: t.cargoStatus }) : pa,
    ),
  ];
}
function Ui({ area: e, items: t }: { area: string; items: [string, string][] }) {
  const { path: a } = useSulContext();
  return (0, b.jsx)(of, {
    label: "Se\xE7\xF5es de " + e,
    items: t.map(([o, n]) => ({ id: o, label: n, href: "#" + o })),
    value: t.find(([o]) => a === o || a.startsWith(o + "/"))?.[0] || t[0]?.[0],
  });
}
function DashboardPage() {
  const { db: e, update: t, editor: a, online } = useSulContext(),
    [o, n] = (0, He.useState)(businessDate().slice(0, 7)),
    [r, l] = (0, He.useState)(""),
    [s, i] = (0, He.useState)(e["activePanel"] || "Painel Sul");
  const native = useOnlineIndicators(
    online,
    o,
    r,
    e["extraIndicators"],
    String(e["company"].userId),
  );
  const customerNative = useCustomerPerformance(online, o, r, String(e["company"].userId));
  const nativeVendors = new Map<number, string>();
  for (const row of native?.ranking?.items ?? []) {
    const c = row["sellerCode"];
    if (typeof c === "number" && c > 0)
      nativeVendors.set(c, String(row["name"] ?? "Vendedor ERP " + c));
  }
  for (const row of native?.series["wallet-seller"]?.items ?? []) {
    if (row.groupCode !== null && row.groupCode > 0)
      nativeVendors.set(row.groupCode, row.label ?? "Vendedor ERP " + row.groupCode);
  }
  const nativeNonBuyers = He.useMemo(
    () =>
      online
        ? {
            client: online,
            resource: "customers",
            nonBuyersReport: nonBuyersQuery({ seller: r }, o),
            registerExport: false,
          }
        : undefined,
    [online, o, r],
  );
  const ano = o.slice(0, 4),
    mes = o.slice(5, 7);
  const mesAnt = String(Number(ano) - 1) + "-" + mes;
  const u = (online ? [] : e["orders"]).filter(
    (p) => p.date && p.date.startsWith(o) && (!r || p.seller === r),
  );
  const c = u.filter((p) => p.type === "Venda" && p.status === "Conclu\xEDdo");
  const uAnt = (online ? [] : e["orders"]).filter(
    (p) => p.date && p.date.startsWith(mesAnt) && (!r || p.seller === r),
  );
  const cAnt = uAnt.filter((p) => p.type === "Venda" && p.status === "Conclu\xEDdo");
  let f: number | string | null = Zo(c, "total");
  const fAnt = Zo(cAnt, "total");
  let meta = online
    ? null
    : Object.values(monthlyTargets(e, o)).reduce((p, y) => p + (Number(y) || 0), 0);
  let ating = (meta ?? 0) > 0 ? (Number(f) / Number(meta)) * 100 : null;
  let base: number | null = e["customers"].filter((p) => !p.blocked).length;
  const compraram = new Set(c.map((p) => p.customerId));
  let atendidos: number | null = compraram.size;
  let naoCompraram = e["customers"]
    .filter((p) => !p.blocked && !compraram.has(p.id))
    .sort((p, y) => String(p.name).localeCompare(String(y.name)));
  let novos = e["customers"].filter((p) => p.createdAt && String(p.createdAt).startsWith(ano));
  let novosFat: number | null = Zo(
    e["orders"].filter(
      (p) =>
        p.date?.startsWith(ano) &&
        novos.some((y) => y.id === p.customerId) &&
        p.type === "Venda" &&
        p.status === "Conclu\xEDdo",
    ),
    "total",
  );
  let comissaoMes: number | string | null = c.reduce(
    (p, y) =>
      p +
      (y.items || []).reduce((S, L) => {
        const prod = Ur(e, L.productId);
        const base: number = L.qty * (L.price ?? 0);
        const pct = prod && prod.commission != null ? prod.commission : 0;
        return S + (base * pct) / 100;
      }, 0),
    0,
  );
  let temComissao = (e["products"] || []).some((p) => p.commission != null);
  let acumCliente: { label: unknown; value: number; id?: unknown | undefined }[] = e["customers"]
    .filter((p) => !p.blocked)
    .map((p) => ({
      label: Un(e, p.id),
      value: Zo(
        e["orders"].filter(
          (y) => y.customerId === p.id && y.type === "Venda" && y.status === "Conclu\xEDdo",
        ),
        "total",
      ),
    }))
    .filter((p) => p.value > 0)
    .sort((p, y) => y.value - p.value);
  let clientesPerf: {
    id: string;
    name: unknown;
    atual: unknown;
    ant: unknown;
    pct: number | null;
  }[] = e["customers"]
    .filter((p) => !p.blocked)
    .map((p) => {
      const atual = Zo(
          c.filter((y) => y.customerId === p.id),
          "total",
        ),
        ant = Zo(
          cAnt.filter((y) => y.customerId === p.id),
          "total",
        );
      return {
        id: p.id,
        name: p.name,
        atual,
        ant,
        pct: percentageChange(ant, atual),
      };
    })
    .filter((p) => p.atual > 0 || p.ant > 0)
    .sort((p, y) => y.atual - p.atual);
  let nativeNewCount = null,
    nativeAbsent = null;
  if (online) {
    f = native?.ranking?.summary.documentAmount ?? null;
    meta =
      native?.ranking?.summary.targetAmount != null
        ? Number(native!.ranking!.summary.targetAmount)
        : null;
    ating = null;
    base = native?.series["wallet-seller"]?.summary.recordCount ?? null;
    atendidos = native?.series["wallet-seller"]?.summary.buyerCount ?? null;
    nativeAbsent = base !== null && atendidos !== null ? base - atendidos : null;
    comissaoMes = native?.series["commissions-seller"]?.summary.value ?? null;
    temComissao = comissaoMes !== null;
    nativeNewCount = native?.series["customers-seller-year"]?.summary.newCount ?? null;
    novosFat = null;
    novos = [];
    naoCompraram = [];
    acumCliente = (customerNative?.accumulated ?? [])
      .filter((row) => row["total"] !== null)
      .map((row) => ({ id: row["id"], label: row["name"], value: Number(row["total"]) }));
    clientesPerf = customerNative?.performance ?? [];
  }
  meta = proratedMonthlyTarget(meta ?? null, o);
  if ((meta ?? 0) > 0 && f != null) ating = (Number(f) / Number(meta)) * 100;
  const MESES: Record<string, string> = {
    "01": "janeiro",
    "02": "fevereiro",
    "03": "mar\xE7o",
    "04": "abril",
    "05": "maio",
    "06": "junho",
    "07": "julho",
    "08": "agosto",
    "09": "setembro",
    10: "outubro",
    11: "novembro",
    12: "dezembro",
  };
  const nomeMes = MESES[mes] || mes;
  const spin = (0, b.jsx)(LoadingSpinner, { size: "md", label: "Carregando" });
  const waitSeries = (k: import("../lib/erp-indicator-series").IndicatorSeries) =>
    !!online && !native?.series?.[k] && !native?.errors?.[k];
  const waitRanking = !!online && !native?.ranking && !native?.errors?.["ranking"];
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "Indicadores",
        description: "Radar de vendas \xB7 " + nomeMes + " de " + ano,
        actions: (0, b.jsxs)(Ft, {
          href: "#/relatorios",
          children: ["Ver relat\xF3rios", (0, b.jsx)(Jr, {})],
        }),
      }),
      (0, b.jsx)(Ui, {
        area: "indicadores",
        items: [
          ["/indicadores", "Pain\xE9is"],
          ["/relatorios", "Relat\xF3rios"],
        ],
      }),
      (0, b.jsxs)("div", {
        className: "dashboard-filters flex flex-wrap items-end gap-4",
        children: [
          (0, b.jsx)(ho, {
            label: "Painel",
            value: s,
            options: La(e["panels"]),
            onValueChange: i,
          }),
          (0, b.jsx)(ho, {
            label: "M\xEAs",
            value: o,
            options: monthOptions(e["orders"]),
            onValueChange: n,
          }),
          (0, b.jsx)(Sl, {
            label: "Vendedor",
            value: r,
            placeholder: "Todos os vendedores",
            options: online
              ? [
                  { value: "", label: "Todos os vendedores" },
                  ...[...nativeVendors]
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([code, name]) => ({
                      value: "sankhya:seller:" + code,
                      label: name + " [" + code + "]",
                    })),
                ]
              : La(["", ...new Set(e["orders"].map((p) => p.seller || ""))]),
            onValueChange: (p: string) => l(String(p)),
          }),
          (0, b.jsx)(Il, {
            label: "Op\xE7\xF5es do painel",
            actions: [
              {
                label: "Definir metas",
                onSelect: () =>
                  a({
                    title: "Definir meta",
                    fields: [
                      {
                        key: "seller",
                        label: "Vendedor",
                        required: !0,
                        options: sellerNames(e),
                      },
                      {
                        key: "target",
                        label: "Meta do m\xEAs (R$)",
                        kind: "currency",
                        required: !0,
                      },
                    ],
                    save: async (p) =>
                      await t((y) => {
                        setMonthlyTarget(y, o, String(p["seller"]), Number(p["target"]));
                      }),
                  }),
              },
            ],
          }),
        ],
      }),
      (0, b.jsxs)(_i, {
        children: [
          (0, b.jsx)(Ha, {
            label: "Meta do m\u00EAs",
            value: (meta ?? 0) > 0 ? rt(meta) : "\u2014",
            hint: online
              ? "Metas canônicas por vendedor (RPC); proporção de dias úteis quando parcial."
              : "Soma das metas dos vendedores",
          }),
          (0, b.jsx)(Ha, {
            label: "Vendido",
            value: waitRanking ? spin : rt(f),
            hint: online
              ? "Pedidos padrão por DTNEG no mês selecionado; não é faturamento."
              : "Pedidos conclu\xEDdos do tipo Venda",
          }),
          (0, b.jsx)(Ha, {
            label: "Atingimento",
            value: ating != null ? na(Number(ating)) + "%" : "\u2014",
            hint: online
              ? "Comparado à meta proporcional aos dias úteis decorridos."
              : Number(meta) > 0
                ? rt(Math.max(0, Number(meta) - Number(f))) + " restantes"
                : "Defina metas por vendedor",
          }),
          (0, b.jsx)(Ha, {
            label: "Clientes atendidos",
            value:
              online && (atendidos === null || base === null)
                ? waitSeries("wallet-seller")
                  ? spin
                  : pa
                : na(Number(atendidos)) + " de " + na(Number(base)),
            hint: online
              ? base !== null && atendidos !== null
                ? (formatERPShare(String(atendidos), String(base)) ?? pa) +
                  " da carteira atual ATIVO=S"
                : "Carteira nativa ainda indisponível"
              : Number(base) > 0
                ? na((Number(atendidos) / Number(base)) * 100) + "% da base"
                : "",
          }),
          (0, b.jsx)(Ha, {
            label: "Sem compra no m\u00EAs",
            value: online
              ? nativeAbsent === null
                ? waitSeries("wallet-seller")
                  ? spin
                  : pa
                : na(nativeAbsent)
              : na(naoCompraram.length),
            hint: online
              ? "Carteira atual ativa sem compra padrão no mês; filiais não são somadas."
              : "Clientes da base sem pedido no m\u00EAs",
          }),
          (0, b.jsx)(Ha, {
            label: "Comiss\u00E3o do m\u00EAs",
            value: temComissao
              ? rt(comissaoMes)
              : online && waitSeries("commissions-seller")
                ? spin
                : "\u2014",
            hint: online
              ? "Livro TGFCOM por emissão da origem; não comprova pagamento."
              : temComissao
                ? "Comiss\xE3o dos itens com % definida no produto"
                : "Defina Comiss\xE3o (%) na ficha dos produtos",
          }),
          (0, b.jsx)(Ha, {
            label: "Novos clientes " + ano,
            value: online
              ? nativeNewCount === null
                ? waitSeries("customers-seller-year")
                  ? spin
                  : pa
                : na(nativeNewCount)
              : na(novos.length),
            hint: online
              ? "Primeira compra padrão histórica no ano, não data de cadastro. Financeiro do grupo não conectado."
              : "Faturamento no ano: " + rt(novosFat),
          }),
        ],
      }),
      online &&
        (0, b.jsx)(SelectedIndicators, {
          names: e["extraIndicators"],
          data: native,
          db: e,
          month: o,
          seller: r,
          client: online,
        }),
      (Number(meta) > 0 || ating != null) &&
        (0, b.jsx)(cs, {
          title: "Acompanhamento da meta",
          description:
            na(Number(ating)) +
            "% de " +
            rt(meta) +
            " \xB7 " +
            (Number(ating) >= 100
              ? "meta batida"
              : rt(Math.max(0, Number(meta) - Number(f))) + " restantes"),
          children: (0, b.jsx)("div", {
            style: {
              height: 14,
              background: "rgba(0,0,0,.08)",
              borderRadius: 7,
              overflow: "hidden",
            },
            children: (0, b.jsx)("div", {
              style: {
                height: 14,
                width: Math.min(100, ating || 0) + "%",
                background: Number(ating) >= 100 ? "var(--ds-ok)" : "var(--ds-accent)",
                borderRadius: 7,
              },
            }),
          }),
        }),
      (0, b.jsx)(cs, {
        title: "Performance de clientes",
        description:
          "Comparativo com " +
          (MESES[mesAnt.slice(5, 7)] || mesAnt) +
          " de " +
          mesAnt.slice(0, 4) +
          " \xB7 seta verde = cresceu, vermelha = caiu" +
          (online
            ? " · meses completos · histórico disponível no ERP; sem registros não comprova ausência histórica"
            : ""),
        children: clientesPerf.length
          ? (0, b.jsx)(RecordsTable, {
              toolbar: !1,
              rows: clientesPerf,
              columns: [
                z("name", "Cliente", void 0, { primary: !0, wide: !0 }),
                z(
                  "ant",
                  MESES[mesAnt.slice(5, 7)] + " de " + mesAnt.slice(0, 4),
                  (p) => rt(p.ant),
                  { align: "right" },
                ),
                z("atual", nomeMes, (p) => rt(p.atual), { align: "right" }),
                z(
                  "pct",
                  "Varia\xE7\xE3o",
                  (p) => {
                    if (p.pct == null) return "\u2014";
                    const subiu = p.pct >= 0;
                    return (0, b.jsxs)("span", {
                      style: {
                        fontWeight: 600,
                        color: subiu ? "var(--ds-ok)" : "var(--ds-rose)",
                      },
                      children: [na(Math.abs(p.pct)) + "% ", subiu ? "\u2191" : "\u2193"],
                    });
                  },
                  { align: "right" },
                ),
              ],
            })
          : (0, b.jsx)(hn, {
              title: online
                ? (customerNative?.errors["performance"] ??
                  (customerNative?.performance
                    ? "Nenhuma venda registrada nos dois períodos"
                    : "Carregando comparativo de clientes"))
                : "Nenhum cliente comprou neste m\u00EAs",
              framed: !1,
            }),
      }),
      (0, b.jsxs)("div", {
        className: "grid gap-6 lg:grid-cols-2",
        children: [
          (0, b.jsx)(cs, {
            title: "Acumulado por cliente",
            description: online
              ? "Vendas padrão de janeiro até o fim do mês selecionado · histórico disponível no ERP"
              : "Total hist\xF3rico de vendas conclu\xEDdas por cliente",
            action: (0, b.jsx)(xt, {
              href:
                "#/relatorios/gerencial?de=" +
                ano +
                "-01-01&ate=" +
                customerNativeEnd(o) +
                (r ? "&vendedor=" + encodeURIComponent(r) : ""),
              children: "Detalhar",
            }),
            children: acumCliente.length
              ? (0, b.jsx)("div", {
                  style: online ? { maxHeight: 420, overflowY: "auto" } : undefined,
                  children: (0, b.jsx)(Zy, { items: acumCliente, format: Vd }),
                })
              : (0, b.jsx)(hn, {
                  title: online
                    ? (customerNative?.errors["accumulated"] ??
                      (customerNative?.accumulated
                        ? "Nenhuma venda registrada no ano selecionado"
                        : "Carregando acumulado por cliente"))
                    : "Sem vendas neste recorte",
                  framed: !1,
                }),
          }),
          (0, b.jsx)(cs, {
            title: "Novos clientes de " + ano,
            description: online
              ? "Primeira compra padrão histórica no ano; detalhamento financeiro não conectado"
              : "Cadastrados neste ano \xB7 faturamento alcan\xE7ado no ano",
            action: (0, b.jsx)(xt, {
              href: "#/clientes",
              children: "Ver clientes",
            }),
            children: novos.length
              ? (0, b.jsxs)(b.Fragment, {
                  children: [
                    (0, b.jsx)(Xt, {
                      children:
                        novos.length +
                        " novo(s) cliente(s) \xB7 faturamento no ano: " +
                        rt(novosFat),
                    }),
                    (0, b.jsx)(RecordsTable, {
                      toolbar: !1,
                      rows: novos.map((p) => {
                        const fat = Zo(
                          e["orders"].filter(
                            (y) =>
                              y.date?.startsWith(ano) &&
                              y.customerId === p.id &&
                              y.type === "Venda" &&
                              y.status === "Conclu\xEDdo",
                          ),
                          "total",
                        );
                        return {
                          id: p.id,
                          name: p.name,
                          code: p.code,
                          createdAt: p.createdAt,
                          fat,
                        };
                      }),
                      columns: [
                        z("name", "Cliente", void 0, { primary: !0, wide: !0 }),
                        z("code", "C\u00F3digo"),
                        z("createdAt", "Cadastro", (p) => xo(p.createdAt)),
                        z("fat", "Faturamento no ano", (p) => rt(p.fat), {
                          align: "right",
                        }),
                      ],
                    }),
                  ],
                })
              : (0, b.jsx)(hn, {
                  title: online
                    ? "Detalhamento das primeiras compras ainda não conectado"
                    : "Nenhum cliente cadastrado em " + ano,
                  framed: !1,
                }),
          }),
          (0, b.jsx)(cs, {
            title: "Clientes que n\xE3o compraram em " + nomeMes,
            action: (0, b.jsx)(xt, {
              href: "#/relatorios/nao-compraram",
              children: "Detalhar",
            }),
            children: online
              ? (0, b.jsx)(RecordsTable, {
                  toolbar: false,
                  rows: [],
                  remote: nativeNonBuyers,
                  label: "Carteira sem compra no mês",
                  columns: [
                    z("name", "Cliente", undefined, { primary: true, wide: true }),
                    z("code", "Código"),
                    z("seller", "Vendedor"),
                  ],
                })
              : naoCompraram.length
                ? (0, b.jsx)(RecordsTable, {
                    toolbar: !1,
                    rows: naoCompraram.map((p) => ({
                      id: p.id,
                      name: p.name,
                      code: p.code,
                      seller: p.seller,
                    })),
                    columns: [
                      z("name", "Cliente", void 0, { primary: !0, wide: !0 }),
                      z("code", "C\u00F3digo"),
                      z("seller", "Vendedor"),
                    ],
                  })
                : (0, b.jsx)(hn, {
                    title: "Todos os clientes compraram neste m\u00EAs",
                    framed: !1,
                  }),
          }),
        ],
      }),
    ],
  });
}
function IndicatorCatalogPage() {
  const { db: e, update: t } = useSulContext(),
    [a, o] = (0, He.useState)(""),
    n = Object.entries(e["indicators"] as Record<string, string[]>).flatMap(([r, l]) =>
      l.map((s) => ({ id: s, name: s, group: r })),
    );
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "Cat\xE1logo de indicadores",
        description: "27 indicadores observados na interface",
        back: { label: "Pain\xE9is", to: "/indicadores" },
      }),
      (0, b.jsx)(RecordsTable, {
        rows: n,
        q: a,
        onQuery: o,
        columns: [
          z("name", "Indicador", void 0, { primary: !0, wide: !0 }),
          z("group", "Grupo"),
          z(
            "add",
            "Adicionar",
            (r) =>
              (0, b.jsxs)(xt, {
                disabled: e["extraIndicators"].includes(r.name || ""),
                disabledReason: "O indicador j\xE1 est\xE1 neste painel",
                onClick: async () => {
                  {
                    await t((l) => l["extraIndicators"].push(r.name || ""));
                    go("Indicador adicionado ao painel");
                  }
                },
                children: [(0, b.jsx)(Sa, {}), "Adicionar"],
              }),
            { action: !0 },
          ),
        ],
      }),
    ],
  });
}
function OrdersPage() {
  const { db: e } = useSulContext(),
    t = w5(e["orders"]);
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "Pedidos",
        description: "Pedidos e or\xE7amentos \xB7 somente o recorte recuperado",
        actions: (0, b.jsxs)(Ft, {
          href: "#/pedidos/novo",
          children: [(0, b.jsx)(Sa, {}), "Criar Pedido"],
        }),
      }),
      (0, b.jsx)(Ui, {
        area: "pedidos",
        items: [
          ["/pedidos", "Pedidos"],
          ["/config/pedidos/campos", "Configura\xE7\xF5es"],
        ],
      }),
      (0, b.jsx)(RecordsTable, {
        rows: t.rows,
        columns: jp(e),
        label: "Pedidos",
        onRowClick: (a: ViewRow) => bn("/pedidos/" + a["id"]),
        actions: (0, b.jsxs)(b.Fragment, {
          children: [
            (0, b.jsx)(Jd, {
              label: "Emiss\xE3o de",
              value: t.f.from,
              onValueChange: (a: string) => t.setF({ ...t.f, from: a }),
              now: bo,
              clearable: !0,
            }),
            (0, b.jsx)(Jd, {
              label: "Emiss\xE3o at\xE9",
              value: t.f.to,
              onValueChange: (a: string) => t.setF({ ...t.f, to: a }),
              now: bo,
              clearable: !0,
            }),
            (0, b.jsx)(ho, {
              label: "Vendedor",
              size: "compact",
              value: t.f.seller,
              onValueChange: (a: string) => t.setF({ ...t.f, seller: a }),
              options: La([
                "",
                ...new Set(e["orders"].map((a) => a.seller || "")),
                e["company"].user,
              ]),
            }),
            (0, b.jsx)(ho, {
              label: "Status",
              size: "compact",
              value: t.f.status,
              onValueChange: (a: string) => t.setF({ ...t.f, status: a }),
              options: La([
                "",
                ...new Set<string>(
                  e["orders"]
                    .map((a) => a.status)
                    .filter((value): value is NonNullable<typeof value> => !!value),
                ),
              ]),
            }),
            (0, b.jsx)(Gp, {
              rows: t.rows,
              name: "pedidos-sulbr",
              columns: [
                "number",
                "date",
                "customerId",
                "seller",
                "payment",
                "total",
                "status",
                "cargoStatus",
                "source",
              ],
            }),
            (0, b.jsxs)(xt, {
              onClick: () => {
                if (t.rows[0]) {
                  bn("/pedidos/" + t.rows[0]["id"]);
                }
              },
              children: [(0, b.jsx)(td, {}), "Visualizar pedido"],
            }),
          ],
        }),
      }),
    ],
  });
}
function OrderEditor() {
  const savingOrder = useRef(false);
  const [orderId] = React.useState(() => crypto.randomUUID());
  const { db: base, update: t, path: a, online } = useSulContext(),
    o = new URLSearchParams(location.hash.split("?")[1] || ""),
    [n, r] = (0, He.useState)(o.get("cliente") || ""),
    [l, s] = (0, He.useState)(base["company"].user),
    [i, u] = (0, He.useState)(""),
    [c, f] = (0, He.useState)("Venda"),
    [d, m] = (0, He.useState)(bo),
    [p, y] = (0, He.useState)("1 - IMEDIATO"),
    [C, x] = (0, He.useState)("Conclu\xEDdo"),
    [v, g] = (0, He.useState)(""),
    [h, S] = He.useState<
      { productId: string; qty: number; price?: number | undefined; unit: string }[]
    >([]),
    [L, I] = (0, He.useState)(0),
    [R, E] = (0, He.useState)(""),
    [OBS, OBSs] = (0, He.useState)(""),
    [k, M] = (0, He.useState)(""),
    [A, N] = (0, He.useState)("");
  const actorSeller = workspaceERPSeller(base["company"]);
  const directorOrder = base["company"].role === "Administrador";
  const managerOrder = base["company"].role === "Gestor";
  const permittedSellers = actorSeller
    ? [actorSeller.sellerCode, ...(managerOrder ? (actorSeller.teamSellerCodes ?? []) : [])]
    : [];
  // Gestor: o vendedor é sempre o cadastrado no cliente e não pode ser trocado (evita vender um cliente em nome de outro vendedor).
  const sellerLocked = !!(online && (directorOrder || (managerOrder && actorSeller)));
  const [customerSeller, setCustomerSeller] = He.useState({ customerId: "" } as {
    customerId: string;
    code?: number | undefined;
  });
  const lockedCode =
    sellerLocked && customerSeller.customerId === n ? customerSeller.code : undefined;
  const operatingSeller = sellerLocked
    ? n && lockedCode !== undefined && (directorOrder || permittedSellers.includes(lockedCode))
      ? `sankhya:seller:${lockedCode}`
      : ""
    : actorSeller?.sellerId || "";
  const lookupSeller = sellerLocked
    ? operatingSeller
    : operatingSeller || (/^sankhya:seller:[1-9]\d*$/.test(l) ? l : "");
  // Gestor vê a carteira inteira autorizada (null = sem filtro de vendedor); o vendedor da venda vem do cliente escolhido.
  const lookups = useERPOrderLookups(
    online,
    n,
    [...h.map((item) => item.productId), v],
    lookupSeller,
    sellerLocked ? null : undefined,
    { deferProductsUntilCustomer: true, lockedSeller: sellerLocked },
  );
  useEffect(() => {
    if (!sellerLocked) return;
    const row = lookups.customers.find((c) => c["id"] === n);
    if (!n || !row) return;
    const code =
      typeof row["sellerCode"] === "number"
        ? row["sellerCode"]
        : (row["erp"] as { sellerCode?: number | undefined } | undefined)?.sellerCode;
    setCustomerSeller((prev: { customerId: string; code?: number | undefined }) =>
      prev.customerId === n && prev.code === code
        ? prev
        : { customerId: n, ...(typeof code === "number" ? { code } : {}) },
    );
  }, [sellerLocked, n, lookups.customers]);
  // Visão transitória só no formulário: os arrays canônicos permanecem intactos.
  const e = React.useMemo(
    () =>
      online
        ? {
            ...base,
            customers: [...manualRows(base["customers"]), ...lookups.customers] as Customer[],
            products: [...manualRows(base["products"]), ...lookups.products] as Product[],
          }
        : base,
    [base, online, lookups.customers, lookups.products],
  );
  const onlineOrder = !!online && n.startsWith("sankhya:customer:");
  // Catálogo vazio não prova ausência de tabela: usar o estado comercial devolvido pelo servidor.
  const noPriceTable = onlineOrder && lookups.priceTableState === "missing";
  const catalogUnavailable = onlineOrder && lookups.priceTableState === "unavailable";
  const paymentMenu = useERPOrderPayments(online, n);
  const [paymentChoice, setPaymentChoice] = React.useState<{ customerId: string; row: ERPRow }>();
  const selectedPayment =
    paymentChoice && paymentChoice.customerId === n && paymentChoice.row["id"] === i
      ? paymentChoice.row
      : undefined;
  // Condição de pagamento fixa do cadastro do cliente: a consulta devolve somente ela.
  useEffect(() => {
    if (!onlineOrder || paymentMenu.rows.length !== 1) return;
    const only = paymentMenu.rows[0]!;
    if (
      i === String(only["id"]) &&
      paymentChoice?.customerId === n &&
      paymentChoice?.row["id"] === only["id"]
    )
      return;
    u(String(only["id"]));
    setPaymentChoice({ customerId: n, row: only });
  }, [onlineOrder, n, paymentMenu.rows, i]);
  const context: OnlineOrderContext = {
    customerId: n,
    paymentCode: Number(selectedPayment?.["code"]),
    sellerId: onlineOrder ? operatingSeller : l,
    type: c,
    date: businessDate(),
  };
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const catalogPrices = useERPCatalogPrices(
    onlineOrder ? online : undefined,
    {
      customerId: n,
      paymentCode: context.paymentCode,
      type: "Venda",
      sellerCode: Number(operatingSeller.split(":")[2]),
      date: context.date,
    },
    lookups.products.filter((row) => lookups.matches.products.ids.has(String(row["id"]))),
    catalogOpen && !lookups.matches.products.loading,
  );
  const prices = useERPOrderPrices(onlineOrder ? online : undefined, context, h, e["products"]);
  // Valores antigos permanecem somente como rascunho interno, nunca como preço confirmado.
  const priceFailure = noPriceTable
    ? "Cliente sem tabela de preço associada"
    : catalogUnavailable
      ? "Tabela de preço sem versão ativa e vigente."
      : prices?.error;
  const pricesConfirmed =
    !onlineOrder || (!priceFailure && !!prices?.quotes && prices.quotes.length === h.length);
  const priceLabel = priceFailure ? "Preço indisponível" : "Preço pendente";
  const itemPrice = (index: number) =>
    onlineOrder
      ? pricesConfirmed
        ? prices?.quotes?.[index]?.price.amount
        : undefined
      : h[index]?.price;
  const quotedItems = h.map(
    (
      item: { productId: string; qty: number; unit: string; price?: number | undefined },
      index: number,
    ) => ({
      ...item,
      price: itemPrice(index),
    }),
  );
  const contextKey = JSON.stringify([context, v]);
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;
  const adding = useRef(false);
  useEffect(() => {
    if (lookups.error || paymentMenu.error || prices?.error)
      N(lookups.error?.message || paymentMenu.error || prices?.error || "");
  }, [lookups.error?.message, paymentMenu.error, prices?.error]);
  useEffect(() => {
    if (!prices?.quotes?.length) return;
    if (!lookups.error && !paymentMenu.error) N("");
    const next = h.map((item, index: number) => ({
      ...item,
      price: prices.quotes![index]!.price.amount,
      unit: prices.quotes![index]!.price.unit,
    }));
    if (JSON.stringify(next) !== JSON.stringify(h)) S(next);
  }, [prices]);
  useEffect(
    () => () => {
      activeContext.current = "";
    },
    [],
  );
  const O = async () => {
    const product = Ur(e, v);
    if (!product || adding.current) return;
    if (h.find((item) => item.productId === v)) {
      N("O produto já está no pedido. Ajuste a quantidade no item.");
      return;
    }
    if (onlineOrder) {
      if (!operatingSeller && sellerLocked && n) {
        N(
          lockedCode === undefined
            ? "Este cliente não tem vendedor cadastrado no ERP; não é possível criar o pedido."
            : "O vendedor cadastrado neste cliente não está na sua equipe; não é possível criar o pedido.",
        );
        return;
      }
      if (!operatingSeller) {
        N(
          "Sua conta não possui vínculo operacional de vendedor ERP. Selecionar um vendedor para consultar a carteira não concede permissão para criar pedidos.",
        );
        return;
      }
      if (!isERP(product)) {
        N(
          "Para um cliente ERP, selecione um produto autorizado da tabela do cliente. Produtos locais não podem ser enviados ao Sankhya.",
        );
        return;
      }
      const key = contextKey;
      adding.current = true;
      try {
        const quote = await quoteERPOrderItem(online!, context, product, 1);
        if (activeContext.current !== key) return;
        S((items) =>
          items.some((item) => item.productId === product["id"])
            ? items
            : [
                ...items,
                {
                  productId: product.id,
                  qty: quote.quantity,
                  price: quote.price.amount,
                  unit: quote.price.unit,
                },
              ],
        );
        g("");
        if (!lookups.error && !paymentMenu.error) N("");
      } catch (error) {
        if (activeContext.current === key) N(orderError(error));
      } finally {
        adding.current = false;
      }
      return;
    }
    if (
      !isERP(product) &&
      !isERP(zp(e, n)) &&
      (product.price == null || (product.price <= 0 && e["config"].zeroPriceBlocked))
    ) {
      N("Defina um preço positivo na ficha do produto antes de usá-lo.");
      return;
    }
    try {
      S([...h, commercialItem(e, n, v, businessDate()) as OrderItem & { unit: string }]);
      g("");
      N("");
    } catch (error) {
      N(orderError(error));
    }
  };
  useEffect(() => {
    if (onlineOrder || (!isERP(zp(e, n)) && !h.some((item) => isERP(Ur(e, item.productId)))))
      return;
    try {
      const next = h.map(
        (item) =>
          commercialItem(e, n, item.productId, businessDate(), item) as OrderItem & {
            unit: string;
          },
      );
      if (JSON.stringify(next) !== JSON.stringify(h)) S(next);
      N("");
    } catch (error) {
      N(orderError(error));
    }
  }, [n, base["erpCommercial"]]);
  const total = (items: unknown[], freight = 0): number | undefined => {
    try {
      return d1(items, freight);
    } catch {
      return undefined;
    }
  };
  async function B(): Promise<void> {
    if (savingOrder.current) return;
    if (onlineOrder && priceFailure) {
      N(priceFailure);
      return;
    }
    if (sellerLocked && n && !operatingSeller) {
      N(
        lockedCode === undefined
          ? "Este cliente não tem vendedor cadastrado no ERP; não é possível criar o pedido."
          : "O vendedor cadastrado neste cliente não está na sua equipe; não é possível criar o pedido.",
      );
      return;
    }
    if (
      !n ||
      !i ||
      !d ||
      !p ||
      !h.length ||
      h.some((F) => !isERP(Ur(e, F.productId)) && !validQuantity(Ur(e, F.productId), F.qty, F.unit))
    ) {
      N(
        "Informe cliente, pagamento, entrega, tipo de agenda e pelo menos um item com quantidade inteira positiva.",
      );
      return;
    }
    if (
      h.some(
        (item) =>
          isERP(Ur(e, item.productId)) &&
          !validQuantity(Ur(e, item.productId), item.qty, item.unit),
      )
    ) {
      N("Quantidade fora da precisão ou múltiplo configurado.");
      return;
    }
    const D = orderId;
    const draft: OrderDraft = {
      id: D,
      customerId: n,
      seller: l,
      type: c,
      date: businessDate(),
      payment: i,
      total: 0,
      status: C,
      integration: "Sem envio ao ERP \xB7 simulado",
      items: h,
      delivery: d,
      agenda: p,
      notes: R,
      internalNotes: OBS,
      freight: L || 0,
      clientOrder: k,
      cargoStatus: "Pendente",
      source: "simulado",
    };
    let j: ERPRow;
    try {
      j = onlineOrder
        ? prepareOnlineOrder(draft, context, prices?.quotes || [])
        : prepareCommercialOrder(e, { ...draft, total: d1(h, L || 0) });
    } catch (error) {
      N(
        error instanceof Error ? error.message : "Não foi possível confirmar o contrato comercial.",
      );
      return;
    }
    savingOrder.current = true;
    try {
      await t((F) => F["orders"].unshift(j as Order));
      go("Pedido criado");
      bn("/pedidos/" + D);
    } catch (error) {
      N(error instanceof Error ? error.message : "Não foi possível salvar o pedido.");
    } finally {
      savingOrder.current = false;
    }
  }
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "Criar pedido / or\xE7amento",
        description: "Preços e condições do cadastro",
        back: { label: "Pedidos", to: "/pedidos" },
        actions: (0, b.jsx)(xt, { href: "#/pedidos", children: "Cancelar" }),
      }),
      A && (0, b.jsx)(Gu, { tone: "bad", children: A }),
      (0, b.jsxs)("div", {
        className: "grid gap-6 lg:grid-cols-[1fr_300px]",
        children: [
          (0, b.jsxs)("div", {
            className: "space-y-6",
            children: [
              (0, b.jsx)(Vt, {
                children: (0, b.jsx)(Ot, {
                  title: "Cliente e emiss\xE3o",
                  children: (0, b.jsxs)(Vi, {
                    children: [
                      (0, b.jsx)(Sl, {
                        label: "Cliente",
                        remote: online ? lookups.matches.customers : undefined,
                        value: n,
                        onValueChange: (D: string) => {
                          r(String(D));
                          g("");
                          u("");
                          setPaymentChoice(undefined);
                        },
                        options: e["customers"]
                          .filter((D) => !D.blocked)
                          .map((D) => ({
                            value: D.id,
                            label: D.name + " (" + D.code + ")",
                          })),
                        required: !0,
                      }),
                      (0, b.jsx)(Sl, {
                        label: "Vendedor",
                        remote: online ? lookups.matches.sellers : undefined,
                        value: online
                          ? sellerLocked && !(n && lockedCode !== undefined)
                            ? ""
                            : lookupSeller
                          : l,
                        disabled: sellerLocked,
                        placeholder: sellerLocked
                          ? n
                            ? "Vendedor do cliente"
                            : "Selecione o cliente"
                          : undefined,
                        onValueChange: (D: string) => {
                          const next = String(D);
                          if (online && actorSeller) {
                            if (sellerLocked) return;
                          } else s(next);
                          if (online && next !== lookupSeller) {
                            r("");
                            g("");
                            u("");
                            setPaymentChoice(undefined);
                          }
                        },
                        options: online
                          ? lookups.sellers
                              .filter(
                                (seller) =>
                                  directorOrder ||
                                  !actorSeller ||
                                  permittedSellers.includes(
                                    Number(String(seller["id"]).split(":")[2]),
                                  ),
                              )
                              .map((seller) => ({ value: seller["id"], label: seller["name"] }))
                          : La(sellerNames(e)),
                      }),
                      (0, b.jsx)(ho, {
                        label: "Tipo de pedido",
                        value: c,
                        onValueChange: f,
                        options: La([
                          "Venda",
                          "Bonifica\xE7\xE3o",
                          "Venda - Raslog",
                          "Venda - Cupom Fiscal",
                          "Bonifica\xE7\xE3o - Raslog",
                          "Venda - Faturamento Antecipado",
                        ]),
                      }),
                    ],
                  }),
                }),
              }),
              (0, b.jsx)(Vt, {
                children: (0, b.jsxs)(Ot, {
                  title: "Produtos",
                  children: [
                    (0, b.jsxs)("div", {
                      className: "flex flex-wrap items-end gap-3",
                      children: [
                        (0, b.jsx)("div", {
                          className: "flex-1 min-w-0",
                          children: [
                            (0, b.jsx)(Sl, {
                              label: "Produto",
                              disabled: noPriceTable || catalogUnavailable,
                              remote: online
                                ? { ...lookups.matches.products, onOpenChange: setCatalogOpen }
                                : undefined,
                              value: v,
                              onValueChange: (D: string) => g(String(D)),
                              options: e["products"]
                                .filter(
                                  (D) =>
                                    D["active"] !== !1 &&
                                    (!onlineOrder || isERP(D)) &&
                                    (!online ||
                                      !isERP(D) ||
                                      lookups.matches.products.ids.has(String(D.id))),
                                )
                                .map((D) => ({
                                  value: D.id,
                                  label:
                                    (D.code || "C\xF3digo n\xE3o extra\xEDdo") + " \xB7 " + D.name,
                                  description: onlineOrder
                                    ? catalogPrices[D.id] ||
                                      (Number.isSafeInteger(context.paymentCode) && operatingSeller
                                        ? "Carregando preço…"
                                        : "Selecione cliente e condição para consultar o preço.")
                                    : undefined,
                                })),
                            }),
                            noPriceTable
                              ? (0, b.jsx)("p", {
                                  role: "alert",
                                  className: "mt-2 text-[13px] text-rose",
                                  children:
                                    "Cliente sem tabela de pre\xE7o associada: n\xE3o h\xE1 produtos para listar.",
                                })
                              : catalogUnavailable
                                ? (0, b.jsx)("p", {
                                    role: "alert",
                                    className: "mt-2 text-[13px] text-rose",
                                    children: "Tabela de preço sem versão ativa e vigente.",
                                  })
                                : null,
                          ],
                        }),
                        (0, b.jsxs)(xt, {
                          disabled: !v,
                          disabledReason: "Selecione um produto",
                          onClick: O,
                          children: [(0, b.jsx)(Sa, {}), "Adicionar produto"],
                        }),
                      ],
                    }),
                    (0, b.jsxs)("div", {
                      className: "mt-5 space-y-4",
                      children: [
                        h.map((D, j) =>
                          (0, b.jsxs)(
                            "div",
                            {
                              className: "cart-item",
                              children: [
                                (0, b.jsxs)("div", {
                                  className: "flex items-start justify-between gap-3",
                                  children: [
                                    (0, b.jsxs)("div", {
                                      children: [
                                        (0, b.jsx)("strong", {
                                          className: "text-body",
                                          children: Ur(e, D.productId)?.name,
                                        }),
                                        (0, b.jsxs)(Xt, {
                                          children: [
                                            Ur(e, D.productId)?.code,
                                            " \xB7 pre\xE7o unit\xE1rio ",
                                            itemPrice(j) === undefined
                                              ? priceLabel
                                              : rt(itemPrice(j)),
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, b.jsx)(wR, {
                                      label: "Remover item",
                                      onClick: () => S(h.filter((F, G) => G !== j)),
                                      children: (0, b.jsx)(Ws, {}),
                                    }),
                                  ],
                                }),
                                (0, b.jsxs)("div", {
                                  className: "flex items-end justify-between gap-4 mt-3",
                                  children: [
                                    (0, b.jsx)("div", {
                                      className: "w-44",
                                      children: (0, b.jsx)(Hr, {
                                        label: "Quantidade",
                                        min: quantityRules(Ur(e, D.productId), D.unit).min,
                                        step: quantityRules(Ur(e, D.productId), D.unit).step,
                                        value: D.qty,
                                        onChange: (F: number | null) =>
                                          S(
                                            h.map((G, X) =>
                                              X === j ? { ...G, qty: F as number } : G,
                                            ),
                                          ),
                                      }),
                                    }),
                                    (0, b.jsx)("strong", {
                                      className: "tabular-nums",
                                      children:
                                        itemPrice(j) === undefined
                                          ? priceLabel
                                          : rt((D.qty || 0) * itemPrice(j)!),
                                    }),
                                  ],
                                }),
                              ],
                            },
                            D.productId,
                          ),
                        ),
                        !h.length &&
                          (0, b.jsx)(hn, {
                            framed: !1,
                            title: "Nenhum produto adicionado",
                            hint: "Escolha um produto com pre\xE7o conhecido.",
                          }),
                      ],
                    }),
                  ],
                }),
              }),
              (0, b.jsx)(Vt, {
                children: (0, b.jsxs)(Ot, {
                  title: "Detalhes do pedido",
                  children: [
                    (0, b.jsxs)(Vi, {
                      children: [
                        (0, b.jsx)(Sl, {
                          label: "Condi\xE7\xE3o de pagamento",
                          value: i,
                          options: onlineOrder
                            ? [
                                ...new Map(
                                  [
                                    ...(selectedPayment ? [selectedPayment] : []),
                                    ...paymentMenu.rows,
                                  ].map((row) => [row["id"], row]),
                                ).values(),
                              ].map((row) => ({
                                value: String(row["id"]),
                                label: String(row["label"]),
                              }))
                            : La(commercialPaymentOptions(e, zp(e, n), businessDate())),
                          disabled: onlineOrder,
                          onValueChange: (D: string) => {
                            u(String(D));
                            if (onlineOrder) {
                              const row = paymentMenu.rows.find((row) => row["id"] === String(D));
                              setPaymentChoice(row ? { customerId: n, row } : undefined);
                            }
                          },
                          required: !0,
                        }),
                        (0, b.jsx)(Jd, {
                          label: "data_entrega",
                          value: d,
                          onValueChange: m,
                          now: bo,
                        }),
                        (0, b.jsx)(ho, {
                          label: "Tipo de Agenda",
                          value: p,
                          options: La([
                            "1 - IMEDIATO",
                            "2 - AGENDADO",
                            "3 - FOB",
                            "4 - ANTECIPADO",
                          ]),
                          onValueChange: y,
                        }),
                        (0, b.jsx)(vr, {
                          label: "N\xBA Pedido do Cliente",
                          value: k,
                          onChange: (v: string) => M(String(v ?? "").slice(0, 15)),
                        }),
                      ],
                    }),
                    (0, b.jsx)("div", {
                      className: "mt-4",
                      children: (0, b.jsxs)(b.Fragment, {
                        children: [
                          (0, b.jsx)($u, {
                            label: "Observa\xE7\xE3o Interna",
                            value: OBS,
                            onChange: OBSs,
                          }),
                          (0, b.jsx)($u, {
                            label: "Observa\xE7\xE3o da Nota / informa\xE7\xF5es adicionais",
                            value: R,
                            onChange: E,
                          }),
                        ],
                      }),
                    }),
                  ],
                }),
              }),
            ],
          }),
          (0, b.jsx)("div", {
            children: (0, b.jsxs)(Vt, {
              className: "space-y-5 lg:sticky lg:top-6",
              children: [
                (0, b.jsx)(Ot, {
                  title: "Resumo",
                  children: (0, b.jsx)(_o, {
                    items: [
                      { label: "Itens", value: h.length },
                      { label: "Quantidade total", value: Zo(h, "qty") },
                      {
                        label: "Produtos",
                        value: pricesConfirmed ? rt(total(quotedItems)) : priceLabel,
                      },
                      {
                        label: "Valor total",
                        value: (0, b.jsx)("strong", {
                          children: pricesConfirmed ? rt(total(quotedItems, L || 0)) : priceLabel,
                        }),
                      },
                    ],
                  }),
                }),
                (0, b.jsxs)(Ft, {
                  className: "w-full",
                  onClick: B,
                  children: [(0, b.jsx)(ka, {}), "Salvar pedido"],
                }),
                (0, b.jsx)(Xt, {
                  children:
                    "O número do pedido é confirmado pelo servidor. Nenhum envio ao ERP ou pagamento externo é executado.",
                }),
              ],
            }),
          }),
        ],
      }),
    ],
  });
}
function OrderDetail({ id: e }: { id: string }) {
  const duplicateIdentity = useRef<{ source: string; id: string } | null>(null);
  const { db: t, update: a, editor: o, confirm: n, submission, refresh, online } = useSulContext();
  const r = t["orders"].find((f: { id: string }) => f.id === e);
  const customerResult = useERPRecord(online, "customers", r?.customerId || "");
  if (!r) return (0, b.jsx)(Wu, {});
  const l = (customerResult.enabled ? customerResult.record : zp(t, r.customerId)) || {};
  const customerFallback =
    customerResult.enabled && !customerResult.record
      ? customerResult.error || "Carregando…"
      : undefined;
  async function s(): Promise<void> {
    if (duplicateIdentity.current?.source !== e)
      duplicateIdentity.current = { source: e, id: crypto.randomUUID() };
    const f = duplicateIdentity.current!.id;
    const duplicate = Xu(r!);
    delete duplicate["erpSubmission"];
    try {
      await a((d) =>
        d["orders"].unshift({
          ...duplicate,
          id: f,
          number: undefined,
          date: bo,
          status: "Or\xE7amento",
          integration: "Sem envio ao ERP \xB7 simulado",
          source: "simulado",
        }),
      );
      duplicateIdentity.current = null;
      go("Pedido duplicado");
      bn("/pedidos/" + f);
    } catch {
      /* A fila já informa o erro; a tela atual permanece aberta. */
    }
  }
  const i = () =>
      o({
        title: "Alterar detalhes do pedido",
        values: r,
        fields: [
          {
            key: "delivery",
            label: "data_entrega",
            kind: "date",
            required: !0,
          },
          {
            key: "agenda",
            label: "Tipo de Agenda",
            options: ["1 - IMEDIATO", "2 - AGENDADO", "3 - FOB", "4 - ANTECIPADO"],
            required: !0,
          },
          {
            key: "payment",
            label: "Condi\xE7\xE3o de pagamento",
            options: t["payments"],
            required: !0,
          },
          { key: "notes", label: "Informa\xE7\xF5es adicionais", kind: "area" },
        ],
        save: async (f) =>
          await a((d) => {
            Object.assign(
              d["orders"].find((m) => m.id === e)!,
              f,
              { source: "simulado" },
            );
          }),
      }),
    u = () =>
      o({
        title: "Faturar pedido \u2014 simula\xE7\xE3o",
        allocateIdentity: true,
        fields: [
          { key: "number", label: "N\xFAmero da nota fiscal", required: !0 },
          {
            key: "date",
            label: "Data de faturamento",
            kind: "date",
            required: !0,
          },
          {
            key: "value",
            label: "Valor faturado",
            kind: "currency",
            required: !0,
          },
        ],
        values: { date: bo, value: r.total },
        save: async (f) =>
          await a((d) => {
            {
              d["invoices"].push({
                ...f,
                id: f["id"]!,
                orderId: e,
                customerId: r.customerId,
                source: "simulado",
              });
              d["orders"].find((m) => m.id === e)!.invoiced = f["value"];
            }
          }),
      }),
    c = (f: string) =>
      o({
        title: "Simular envio por " + f,
        allocateIdentity: true,
        fields: [
          {
            key: "recipient",
            label: f === "e-mail" ? "E-mail do destinat\xE1rio" : "N\xFAmero do destinat\xE1rio",
            required: !0,
          },
          { key: "message", label: "Mensagem", kind: "area", required: !0 },
        ],
        values: { message: `Pedido #${r["number"]} \xB7 ${rt(r.total)}` },
        save: async (d) => {
          {
            await a((m) =>
              m["emails"].push({
                ...d,
                id: d["id"]!,
                channel: f,
                orderId: e,
                date: bo,
                status: "Simulado \xB7 n\xE3o enviado",
                source: "simulado",
              }),
            );
            go("Simula\xE7\xE3o registrada; nada foi enviado");
          }
        },
      });
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: (r.erp?.movement === "V" ? "Nota fiscal #" : "Pedido #") + r["number"],
        description: r.integration,
        back: { label: "Pedidos", to: "/pedidos" },
        actions: (0, b.jsxs)(b.Fragment, {
          children: [
            (0, b.jsxs)(xt, {
              onClick: () => window.print(),
              children: [(0, b.jsx)(td, {}), "Visualizar"],
            }),
            submission &&
              r.erp?.mode === "online" &&
              r.sellerId === t["company"].userId &&
              (0, b.jsx)(OrderSubmission, { order: r, client: submission, refresh }, r.id),
            (0, b.jsxs)(Ft, {
              onClick: u,
              disabled: true,
              disabledReason: "Integração fiscal não configurada",
              children: [(0, b.jsx)(Cm, {}), "Faturar pedido"],
            }),
            (0, b.jsx)(Il, {
              label: "Mais op\xE7\xF5es do pedido",
              actions: [
                {
                  label: "Alterar detalhes",
                  onSelect: i,
                  icon: (0, b.jsx)(tl, {}),
                },
                { label: "Duplicar pedido", onSelect: s },
                {
                  label: "Simular envio por e-mail",
                  onSelect: () => go("Envio de e-mail indisponível: provedor não configurado"),
                },
                {
                  label: "Simular envio por WhatsApp",
                  onSelect: () => go("Envio de WhatsApp indisponível: provedor não configurado"),
                },
                {
                  label: "Cancelar pedido",
                  tone: "danger",
                  onSelect: () =>
                    n(
                      "Cancelar pedido neste prot\xF3tipo?",
                      async () =>
                        await a((f) => {
                          {
                            f["orders"].find((d) => d.id === e)!.status = "Cancelado";
                            f["orders"].find((d) => d.id === e)!.source = "simulado";
                          }
                        }),
                    ),
                },
              ],
            }),
          ],
        }),
      }),
      (0, b.jsxs)("div", {
        className: "flex gap-2",
        children: [(0, b.jsx)(qn, { value: r.status }), (0, b.jsx)(qr, { row: r })],
      }),
      (0, b.jsxs)("div", {
        className: "grid gap-6 lg:grid-cols-2",
        children: [
          (0, b.jsx)(Vt, {
            children: (0, b.jsxs)(Ot, {
              title: "Cliente",
              children: [
                (0, b.jsx)("a", {
                  className: "font-medium ds-link",
                  href: "#/clientes/" + r.customerId,
                  children: l["name"] || r["customerName"] || "Cliente indispon\xEDvel",
                }),
                (0, b.jsx)("p", {
                  className: "text-body text-muted mt-2",
                  children: l["fantasy"],
                }),
                (0, b.jsxs)(Xt, {
                  children: [
                    l["cnpj"] || customerFallback || "CNPJ n\xE3o extra\xEDdo",
                    " \xB7 ",
                    l["city"] || customerFallback || "Cidade n\xE3o extra\xEDda",
                    l["state"] ? " / " + l["state"] : "",
                  ],
                }),
                (0, b.jsx)(xt, {
                  href: "#/pedidos/novo?cliente=" + r.customerId,
                  children: "Criar outro pedido",
                }),
              ],
            }),
          }),
          (0, b.jsx)(Vt, {
            children: (0, b.jsx)(Ot, {
              title: "Representada",
              children: (0, b.jsx)(_o, {
                items: [
                  { label: "Empresa", value: "Sulbr" },
                  { label: "Vendedor", value: r.seller },
                  { label: "Emiss\xE3o", value: xo(r.date) },
                  { label: "data_entrega", value: xo(r.delivery) },
                ],
              }),
            }),
          }),
        ],
      }),
      (0, b.jsx)(Ot, {
        title: "Produtos do pedido",
        children: r.items
          ? (0, b.jsx)(RecordsTable, {
              toolbar: !1,
              rows: r.items.map((f) => ({
                ...f,
                id: f.id ?? f.productId,
                name: f.name || f.erp?.product?.name || Ur(t, f.productId)?.name,
                code: f.code ?? f.erp?.product?.productCode ?? Ur(t, f.productId)?.code,
                subtotal: r.readOnly ? f.total : (f.total ?? f.qty * (f.price ?? 0)),
              })),
              columns: [
                z("code", "C\xF3digo"),
                z("name", "Produto", void 0, { primary: !0, wide: !0 }),
                z(
                  "qty",
                  "Quantidade",
                  (f) =>
                    f.qty == null
                      ? pa
                      : na(f.qty, 5) + " " + (f["unit"] || Ur(t, f["productId"])?.unit || ""),
                  { align: "right" },
                ),
                z("price", "Pre\xE7o unit\xE1rio", (f) => (f.price == null ? pa : rt(f.price)), {
                  align: "right",
                }),
                z("subtotal", "Subtotal", (f) => (f.subtotal == null ? pa : rt(f.subtotal)), {
                  align: "right",
                }),
              ],
            })
          : (0, b.jsx)(hn, {
              title: "Itens deste pedido n\xE3o foram extra\xEDdos",
              hint: "O cabe\xE7alho e o total foram observados. O arquivo n\xE3o inventa a composi\xE7\xE3o.",
            }),
      }),
      (0, b.jsxs)(_i, {
        cols: 3,
        children: [
          (0, b.jsx)(Ha, {
            label: "Itens",
            value: r.items?.length ?? "\u2014",
          }),
          (0, b.jsx)(Ha, {
            label: "Quantidade",
            value:
              r.items && r.items.every((item) => typeof item.qty === "number")
                ? na(Zo(r.items, "qty"), 5)
                : "\u2014",
          }),
          (0, b.jsx)(Ha, { label: "Valor total", value: rt(r.total) }),
        ],
      }),
      (0, b.jsx)(Vt, {
        children: (0, b.jsx)(Ot, {
          title: "Detalhes do pedido",
          action: (0, b.jsxs)(xt, {
            onClick: i,
            children: [(0, b.jsx)(tl, {}), "Alterar detalhes"],
          }),
          children: (0, b.jsx)(_o, {
            items: [
              { label: "Tipo", value: r.type },
              { label: "Tipo de Agenda", value: r["agenda"] || pa },
              {
                label: "pedido_erp",
                value: typeof r.erp === "string" || typeof r.erp === "number" ? r.erp : pa,
              },
              {
                label: "Peso bruto",
                value: r["grossWeight"] != null ? na(r["grossWeight"]) + " kg" : pa,
              },
              {
                label: "Frete",
                value:
                  r.id === "2351"
                    ? "N\xE3o informado na origem"
                    : r["freight"] == null
                      ? pa
                      : rt(r["freight"]),
              },
              { label: "Informa\xE7\xF5es adicionais", value: r.notes || pa },
            ],
          }),
        }),
      }),
    ],
  });
}
function CustomersPage() {
  const { db: e, editor: t, update: a, online } = useSulContext();
  const remote = He.useMemo(
    () => (online ? { client: online, resource: "customers" } : undefined),
    [online],
  );
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "Clientes",
        description:
          "Carteira recuperada dos pedidos observados \xB7 15 clientes no recorte inicial",
        actions: (0, b.jsxs)(Ft, {
          onClick: () => k5(t, a, e),
          children: [(0, b.jsx)(Sa, {}), "Cadastrar cliente"],
        }),
      }),
      (0, b.jsx)(Ui, {
        area: "clientes",
        items: [
          ["/clientes", "Clientes"],
          ["/clientes/agrupamentos", "Agrupamentos"],
          ["/clientes/vinculos", "V\xEDnculos e permiss\xF5es"],
          ["/config/clientes/campos", "Configura\xE7\xF5es"],
        ],
      }),
      (0, b.jsx)(RecordsTable, {
        rows: online ? manualRows(e["customers"]) : e["customers"],
        remote,
        label: "Clientes",
        onRowClick: (o: ViewRow) =>
          bn(o["isGroup"] ? "/clientes/agrupamentos/" + o["groupId"] : "/clientes/" + o.id),
        columns: [
          z(
            "name",
            "Raz\xE3o social",
            (o) =>
              (0, b.jsxs)("div", {
                className: "space-y-1",
                children: [
                  (0, b.jsx)("a", {
                    className: "font-medium ds-link",
                    href: o["isGroup"]
                      ? "#/clientes/agrupamentos/" + o["groupId"]
                      : "#/clientes/" + o.id,
                    children: o.name,
                  }),
                  (0, b.jsxs)(Xt, { children: [o["fantasy"], " \xB7 ", o.code] }),
                ],
              }),
            { primary: !0, wide: !0 },
          ),
          z("city", "Cidade"),
          z("state", "UF"),
          z("seller", "Vendedor"),
          z("blocked", "Situa\xE7\xE3o", (o) =>
            (0, b.jsx)(qn, {
              value: o.blocked
                ? "Bloqueado"
                : o.source === "simulado"
                  ? "Ativo"
                  : o.source === "observado"
                    ? "Cadastro observado"
                    : "Cadastrado",
            }),
          ),
          z("source", "Origem", (o) => (0, b.jsx)(qr, { row: o })),
        ],
        actions: (0, b.jsx)(Gp, {
          rows: e["customers"],
          name: "clientes-sulbr",
          remoteResource: "customers",
          columns: ["code", "name", "fantasy", "cnpj", "city", "state", "seller", "source"],
        }),
      }),
    ],
  });
}
function cz() {
  return [
    { key: "name", label: "Raz\xE3o Social", required: !0 },
    { key: "fantasy", label: "Nome Fantasia", required: !0 },
    { key: "cnpj", label: "CNPJ" },
    {
      key: "profile",
      label: "Caracter\xEDstica do cliente",
      options: [
        "Supermercado",
        "Mercearia",
        "Distribuidora",
        "Bar / Restaurante",
        "Padaria",
        "Conveni\xEAncia",
        "Atacado",
        "Outro",
      ],
    },
    { key: "ie", label: "Inscri\xE7\xE3o Estadual" },
    { key: "state", label: "Estado" },
    { key: "district", label: "Bairro" },
    { key: "complement", label: "Complemento" },
    { key: "city", label: "Cidade/Munic\xEDpio" },
    { key: "cep", label: "CEP (Receita Federal)" },
    { key: "address", label: "Endere\xE7o (Receita Federal)" },
    { key: "number", label: "N\xFAmero (Receita Federal)" },
    {
      key: "deliveryCepSame",
      label: "CEP de entrega \u2014 mesmo do cadastro?",
    },
    {
      key: "deliveryAddressSame",
      label: "Endere\xE7o de entrega \u2014 mesmo do cadastro?",
    },
    {
      key: "deliveryNumberSame",
      label: "N\xFAmero de entrega \u2014 mesmo do cadastro?",
    },
    {
      key: "deliveryContact",
      label: "Contato do setor de log\xEDstica/recebimento",
    },
    { key: "phone1", label: "Telefone fixo 1" },
    { key: "cell1", label: "Telefone celular 1" },
    { key: "email", label: "E-mail para cadastro" },
    { key: "emailNfe", label: "E-mail para envio da nota fiscal" },
    { key: "paymentTerm", label: "Prazo de pagamento" },
    {
      key: "paymentMethod",
      label: "Forma de pagamento (selecione apenas 1)",
      options: ["Boleto", "PIX", "Dinheiro", "Cart\xE3o", "35 DD", "28 DD", "21 DD"],
    },
    {
      key: "discountContract",
      label: "Possui contrato de desconto? (indicar %)",
    },
    {
      key: "firstOrderBonus",
      label: "Possui bonifica\xE7\xE3o de primeiro pedido? (indicar % ou quantidade)",
    },
    {
      key: "__priceList",
      label: "Produtos e pre\xE7os do cliente",
      kind: "priceList",
      required: !0,
    },
    { key: "priceTableMatch", label: "Tabela identificada" },
    { key: "notes", label: "Observa\xE7\xF5es do cliente", kind: "area" },
  ];
}
function k5(
  e: (spec: EditorSpec) => void,
  t: (mutator: (draft: AppState) => unknown) => Promise<unknown>,
  a: AppState,
  o: Customer | undefined = undefined,
) {
  e({
    title: o ? "Alterar cliente" : "Cadastrar cliente",
    allocateIdentity: !o,
    values: o ? { ...o, __priceList: o.refItems || o.__priceList || [] } : {},
    fields: cz(),
    validate: (n) =>
      a.config.duplicateDocument &&
      n.cnpj &&
      a.customers.some(
        (r) => r.id !== o?.id && r.cnpj?.replace(/\D/g, "") === (n.cnpj || "").replace(/\D/g, ""),
      )
        ? "CPF/CNPJ já cadastrado na SulBR."
        : "",
    save: async (n) => {
      n = {
        ...n,
        priceTableMatch: identifyPriceTable(a, n.__priceList || []),
        refItems: n.__priceList || [],
      };
      await t((r) => {
        if (o)
          Object.assign(
            r.customers.find((l) => l.id === o.id)!,
            n,
            {
              priceTables: customerPriceTables(a, o, n.priceTableMatch || ""),
              source: "simulado",
            },
          );
        else {
          const l = n.id!;
          r.customers.push({
            ...n,
            id: l,
            code: n.code || technicalCode("CLI", l),
            blocked: !1,
            tags: [],
            priceTables: customerPriceTables(a, o, n.priceTableMatch || ""),
            refItems: n.__priceList || [],
            refProduct: n.refProductId,
            refPrice: n.refPrice,
            createdAt: businessDate(),
            source: "simulado",
          });
        }
      });
    },
  });
}
function ERPDetail({
  resource,
  id,
  component: Component,
}: {
  resource: "customers" | "products";
  id: string;
  component: React.ComponentType<{ id: string }>;
}) {
  const context = useSulContext();
  const result = useERPRecord(context.online, resource, id);
  const [groups, setGroups] = React.useState<import("../lib/customer-groups").CustomerGroup[]>([]);
  useEffect(() => {
    let active = true;
    if (resource === "customers" && context.online)
      context.online
        .customerGroups()
        .then((r) => {
          if (active) setGroups(r.groups);
        })
        .catch((e: Error) => go(e.message));
    return () => {
      active = false;
    };
  }, [context.online, resource, id]);
  useEffect(() => {
    if (result.error) go(result.error);
  }, [result.error]);
  if (!result.enabled) return b.jsx(Component, { id });
  if (result.record === undefined && !result.error) return null;
  if (!result.record) return b.jsx(Wu, {});
  const rejectUpdate = async () => {
    const error = new Error("Cadastro ERP disponível somente para consulta.");
    go(error.message);
    throw error;
  };
  const db = { ...context.db, [resource]: [result.record] };
  // Histórico e financeiro ainda não homologados; nenhum pedido local vira histórico ERP.
  if (resource === "customers") Object.assign(db, { orders: [], titles: [], invoices: [] });
  return b.jsx(I5.Provider, {
    value: { ...context, db, update: rejectUpdate },
    children: b.jsxs(React.Fragment, {
      children: [
        groupForCustomer(groups, id) &&
          b.jsx(Gu, {
            title: "Integrante do agrupamento " + groupLabel(groupForCustomer(groups, id)!),
          }),
        b.jsx(Component, { id }),
      ],
    }),
  });
}
function ERPDocumentDetail({
  id,
  component: Component,
}: {
  id: string;
  component: React.ComponentType<{ id: string }>;
}) {
  const context = useSulContext(),
    result = useERPDocument(context.online, id);
  useEffect(() => {
    if (result.error) go(result.error);
  }, [result.error]);
  if (!result.enabled) return b.jsx(Component, { id });
  if (result.record === undefined && !result.error) return null;
  if (!result.record) return b.jsx(Wu, {});
  const rejectUpdate = async () => {
    const error = new Error("Cadastro ERP disponível somente para consulta.");
    go(error.message);
    throw error;
  };
  const db = { ...context.db, orders: [result.record] };
  return b.jsx(I5.Provider, {
    value: { ...context, db, update: rejectUpdate },
    children: b.jsx(Component, { id }),
  });
}
function CustomerDetail({ id: e }: { id: string }) {
  const { db: t, editor: a, update: o, confirm: n, online } = useSulContext(),
    r = zp(t, e),
    [l, s] = (0, He.useState)("resumo"),
    [i, u] = (0, He.useState)(!1);
  if (!r) return (0, b.jsx)(Wu, {});
  const c = isERP(r) ? [] : t["orders"].filter((p) => p.customerId === e),
    f = t["tasks"].filter((p) => p.customerId === e),
    d = c.filter((p) => p.type === "Venda" && p.status === "Conclu\xEDdo"),
    m = Zo(d, "total");
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: r["fantasy"] || r.name,
        description: r.name + " \xB7 " + r.code,
        back: { label: "Clientes", to: "/clientes" },
        actions: (0, b.jsxs)(b.Fragment, {
          children: [
            (0, b.jsxs)(xt, {
              href: "#/clientes/vinculos?cliente=" + e,
              children: [(0, b.jsx)(Jc, {}), "V\xEDnculos e permiss\xF5es"],
            }),
            (0, b.jsxs)(Ft, {
              onClick: () => k5(a, o, t, r),
              children: [(0, b.jsx)(tl, {}), "Alterar"],
            }),
            (0, b.jsx)(Il, {
              label: "Mais op\xE7\xF5es do cliente",
              actions: [
                {
                  label: r.blocked ? "Desbloquear cliente" : "Bloquear cliente",
                  onSelect: () =>
                    n(
                      (r.blocked ? "Desbloquear" : "Bloquear") + " cliente no sistema?",
                      async () =>
                        await o((p) => {
                          const y = zp(p, e)!;
                          {
                            y.blocked = !y.blocked;
                            y.source = "simulado";
                          }
                        }),
                    ),
                },
                {
                  label: "Excluir cliente",
                  tone: "danger",
                  onSelect: () =>
                    n(
                      "Excluir cliente deste prot\xF3tipo?",
                      async () => {
                        {
                          await o((p) => {
                            p["customers"] = p["customers"].filter((y) => y.id !== e);
                          });
                          bn("/clientes");
                        }
                      },
                      "Os pedidos preservam seu identificador. Nada ser\xE1 exclu\xEDdo do Sul.",
                    ),
                },
              ],
            }),
          ],
        }),
      }),
      (0, b.jsxs)("div", {
        className: "flex flex-wrap gap-2",
        children: [
          (0, b.jsx)(qr, { row: r }),
          r.blocked && (0, b.jsx)(qn, { value: "Bloqueado" }),
          r["portal"] &&
            (0, b.jsx)(bi, {
              tone: "ok",
              children: "Portal liberado na ficha observada",
            }),
        ],
      }),
      (0, b.jsx)(of, {
        label: "Se\xE7\xF5es do cliente",
        items: La(["resumo", "pedidos", "tarefas", "titulos"]).map((p) => ({
          id: p.value,
          label: (
            {
              resumo: "Resumo",
              pedidos: "Pedidos e atividades",
              tarefas: "Tarefas e oportunidades",
              titulos: "T\xEDtulos e notas fiscais",
            } as Record<string, string>
          )[p.value],
        })),
        value: l,
        onChange: s,
      }),
      l === "resumo" &&
        (0, b.jsxs)(b.Fragment, {
          children: [
            (0, b.jsxs)("div", {
              className: "grid gap-6 lg:grid-cols-2",
              children: [
                (0, b.jsx)(Vt, {
                  children: (0, b.jsx)(Ot, {
                    title: "Cadastro",
                    action: (0, b.jsx)(xt, {
                      onClick: () => u(!i),
                      children: i ? "Recolher cadastro" : "Ver cadastro completo",
                    }),
                    children: (0, b.jsx)(_o, {
                      items: [
                        { label: "Endere\xE7o", value: r["address"] || pa },
                        {
                          label: "Cidade / UF",
                          value: r.city ? r.city + " / " + r.state : pa,
                        },
                        { label: "CEP", value: r["cep"] || pa },
                        ...(i
                          ? [
                              { label: "Raz\xE3o social", value: r.name },
                              { label: "Fantasia", value: r["fantasy"] },
                              { label: "CPF/CNPJ", value: r.cnpj || pa },
                              {
                                label: "Vendedor",
                                value: r.seller || pa,
                              },
                              {
                                label: "Tabelas de pre\xE7o vinculadas",
                                value:
                                  r.priceTables?.join(", ") || "V\xEDnculos n\xE3o extra\xEDdos",
                              },
                              { label: "E-mail", value: r["email"] || pa },
                            ]
                          : []),
                      ],
                    }),
                  }),
                }),
                (0, b.jsx)(Vt, {
                  children: (0, b.jsx)(Ot, {
                    title: "Limite de cr\xE9dito",
                    action: (0, b.jsxs)(xt, {
                      onClick: () =>
                        a({
                          title: "Editar limite de cr\xE9dito local",
                          values: { credit: r["credit"] ?? null },
                          fields: [
                            {
                              key: "credit",
                              label: "Limite total",
                              kind: "currency",
                              required: !0,
                            },
                          ],
                          save: async (p) =>
                            await o((y) =>
                              Object.assign(zp(y, e)!, p, {
                                source: "simulado",
                              }),
                            ),
                        }),
                      children: [(0, b.jsx)(tl, {}), "Editar"],
                    }),
                    children: (0, b.jsx)(_o, {
                      items: [
                        {
                          label: "Limite total",
                          value:
                            r["credit"] != null
                              ? rt(r["credit"])
                              : e === "66840911"
                                ? "N\xE3o definido na origem"
                                : pa,
                        },
                        {
                          label: "Limite dispon\xEDvel",
                          value: isERP(r)
                            ? pa
                            : r["credit"] != null
                              ? rt(r["credit"])
                              : "N\xE3o calculado",
                        },
                        {
                          label: "Portal global",
                          value: t["config"].portal
                            ? "Ativa\xE7\xE3o simulada"
                            : "A tela original oferecia criar portal",
                        },
                      ],
                    }),
                  }),
                }),
              ],
            }),
            (0, b.jsxs)(_i, {
              cols: 3,
              children: [
                (0, b.jsx)(Ha, { label: "Compras no arquivo", value: isERP(r) ? pa : rt(m) }),
                (0, b.jsx)(Ha, { label: "Pedidos de venda", value: isERP(r) ? pa : d.length }),
                (0, b.jsx)(Ha, {
                  label: "Ticket m\xE9dio",
                  value: isERP(r) ? pa : d.length ? rt(m / d.length) : "\u2014",
                }),
              ],
            }),
            (0, b.jsx)(Ot, {
              title: "Produtos encontrados nos pedidos deste cliente",
              children: (0, b.jsx)(RecordsTable, {
                toolbar: !1,
                rows: dv(t, c),
                columns: [
                  z("name", "Produto", void 0, { primary: !0, wide: !0 }),
                  z("qty", "Quantidade", (p) => na(p.qty ?? 0), { align: "right" }),
                  z("total", "Valor", (p) => rt(p.total), { align: "right" }),
                ],
              }),
            }),
            (0, b.jsx)(Xt, {
              children:
                e === "66840911"
                  ? "Na inspe\xE7\xE3o, o cliente aparecia na posi\xE7\xE3o 261\xBA e tinha R$ 9.008,80 em um pedido nos \xFAltimos seis meses."
                  : "Os indicadores são calculados sobre os pedidos salvos e os filtros selecionados.",
            }),
          ],
        }),
      l === "pedidos" &&
        (0, b.jsxs)(b.Fragment, {
          children: [
            (0, b.jsxs)("div", {
              className: "flex flex-wrap gap-2",
              children: [
                (0, b.jsxs)(Ft, {
                  href: "#/pedidos/novo?cliente=" + e,
                  children: [(0, b.jsx)(Sa, {}), "Criar pedido"],
                }),
                (0, b.jsx)(xt, {
                  onClick: () => M5(a, o, t, e),
                  children: "Registrar atividade",
                }),
              ],
            }),
            (0, b.jsx)(RecordsTable, {
              rows: c,
              columns: jp(t),
              remote:
                isERP(r) && online
                  ? { client: online, resource: "orders", customerId: e }
                  : undefined,
              onRowClick: (p: ViewRow) => bn("/pedidos/" + p.id),
            }),
          ],
        }),
      l === "tarefas" &&
        (0, b.jsxs)(b.Fragment, {
          children: [
            (0, b.jsxs)("div", {
              className: "flex flex-wrap gap-2",
              children: [
                (0, b.jsxs)(Ft, {
                  onClick: () => N5(a, o, t, e),
                  children: [(0, b.jsx)(Sa, {}), "Criar tarefa"],
                }),
                (0, b.jsx)(xt, {
                  onClick: () => A5(a, o, t, e),
                  children: "Criar oportunidade",
                }),
              ],
            }),
            (0, b.jsx)(RecordsTable, { rows: f, columns: T5(t) }),
            (0, b.jsx)(Ot, {
              title: "Oportunidades abertas",
              children: (0, b.jsx)(RecordsTable, {
                toolbar: !1,
                rows: t["opportunities"].filter((p) => p.customerId === e && p.status === "Aberta"),
                columns: [
                  z("name", "Oportunidade", void 0, { primary: !0 }),
                  z("stage", "Etapa"),
                  z("value", "Valor", (p) => rt(p.value)),
                ],
              }),
            }),
          ],
        }),
      l === "titulos" &&
        (0, b.jsxs)(b.Fragment, {
          children: [
            (0, b.jsx)(Ot, {
              title: "T\xEDtulos",
              action: (0, b.jsxs)(Ft, {
                onClick: () =>
                  a({
                    title: "Adicionar t\xEDtulo local",
                    allocateIdentity: true,
                    values: { customerId: e, due: bo, status: "A vencer" },
                    fields: [
                      { key: "document", label: "Documento", required: !0 },
                      {
                        key: "due",
                        label: "Vencimento",
                        kind: "date",
                        required: !0,
                      },
                      {
                        key: "value",
                        label: "Valor",
                        kind: "currency",
                        required: !0,
                      },
                    ],
                    save: async (p) =>
                      await o((y) =>
                        y["titles"].push({
                          ...p,
                          id: p["id"]!,
                          customerId: e,
                          status: "A vencer",
                          source: "simulado",
                        }),
                      ),
                  }),
                children: [(0, b.jsx)(Sa, {}), "Adicionar t\xEDtulo"],
              }),
              children: (0, b.jsx)(RecordsTable, {
                rows: t["titles"].filter((p) => p.customerId === e),
                columns: [
                  z("document", "Documento", void 0, { primary: !0 }),
                  z("due", "Vencimento", (p) => xo(p.due)),
                  z("value", "Valor", (p) => rt(p.value)),
                  z("status", "Situa\xE7\xE3o", (p) => (0, b.jsx)(qn, { value: p.status })),
                ],
              }),
            }),
            (0, b.jsx)(Ot, {
              title: "Notas fiscais",
              children: (0, b.jsx)(RecordsTable, {
                rows: t["invoices"].filter((p) => p.customerId === e),
                remote:
                  isERP(r) && online
                    ? { client: online, resource: "invoices", customerId: e }
                    : undefined,
                columns: [
                  z("number", "Nota", void 0, { primary: !0 }),
                  z("date", "Data", (p) => xo(p.date)),
                  z("value", "Valor", (p) => rt(p.value)),
                ],
                empty: "N\xE3o h\xE1 notas fiscais extra\xEDdas para este cliente",
              }),
            }),
          ],
        }),
    ],
  });
}
function PriceTablesPage() {
  const { db: e, update: t } = useSulContext(),
    [a, o] = (0, He.useState)(() => {
      const d = new URLSearchParams(location.hash.split("?")[1]).get("cliente");
      return d ? [d] : [];
    }),
    [n, r] = (0, He.useState)("Tabelas de pre\xE7o"),
    [l, s] = (0, He.useState)(""),
    [i, u] = (0, He.useState)("Adicionar"),
    c =
      n === "Condi\xE7\xF5es de pagamento"
        ? e["payments"]
        : n === "Tabelas de pre\xE7o"
          ? ["PADR\xC3O SP", "BAFFA", "PROEN\xC7A", "TESTE"]
          : n === "Categorias"
            ? Array.from(
                new Set(
                  e["products"]
                    .map((d) => d.category)
                    .filter((value): value is NonNullable<typeof value> => !!value),
                ),
              )
            : (e["collections"]["clientes/tags"] || []).map((d) => d.name);
  async function f(): Promise<void> {
    if (!a.length || !l) return;
    if (a.some((id) => String(id).startsWith("sankhya:"))) {
      go("Cadastro ERP disponível somente para consulta.");
      return;
    }
    const d =
      n === "Tabelas de pre\xE7o"
        ? "priceTables"
        : n === "Tags"
          ? "tags"
          : n === "Categorias"
            ? "categories"
            : "payments";
    {
      await t((m) =>
        m["customers"].forEach((p) => {
          if (a.includes(p.id)) {
            const y = p[d] || [];
            {
              p[d] =
                i === "Substituir"
                  ? [l]
                  : i === "Remover"
                    ? y.filter((C) => C !== l)
                    : [...new Set([...y, l])];
              p.source = "simulado";
            }
          }
        }),
      );
      go("V\xEDnculos alterados somente no prot\xF3tipo");
    }
  }
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "V\xEDnculos e permiss\xF5es de cliente",
        description: "Adicionar, substituir ou remover v\xEDnculos em sele\xE7\xE3o local",
        back: { label: "Clientes", to: "/clientes" },
      }),
      (0, b.jsxs)(Vt, {
        children: [
          (0, b.jsxs)("div", {
            className: "grid gap-4 sm:grid-cols-3",
            children: [
              (0, b.jsx)(ho, {
                label: "Tipo de v\xEDnculo",
                value: n,
                onValueChange: (d: string) => {
                  {
                    r(d);
                    s("");
                  }
                },
                options: La([
                  "Categorias",
                  "Condi\xE7\xF5es de pagamento",
                  "Tabelas de pre\xE7o",
                  "Tags",
                ]),
              }),
              (0, b.jsx)(Sl, {
                label: "Valor",
                value: l,
                onValueChange: (d: string) => s(String(d)),
                options: La(c.filter((value): value is string => typeof value === "string")),
              }),
              (0, b.jsx)(ho, {
                label: "Opera\xE7\xE3o",
                value: i,
                onValueChange: u,
                options: La(["Adicionar", "Substituir", "Remover"]),
              }),
            ],
          }),
          (0, b.jsxs)("div", {
            className: "mt-4 flex items-center justify-between gap-4",
            children: [
              (0, b.jsxs)(Xt, {
                children: [
                  a.length,
                  " cliente(s) selecionado(s). Os v\xEDnculos n\xE3o alteram pre\xE7os n\xE3o extra\xEDdos.",
                ],
              }),
              (0, b.jsxs)(Ft, {
                onClick: f,
                disabled: !a.length || !l,
                disabledReason: "Selecione clientes e um valor",
                children: [(0, b.jsx)(Jc, {}), "Aplicar v\xEDnculo local"],
              }),
            ],
          }),
        ],
      }),
      (0, b.jsx)(RecordsTable, {
        rows: e["customers"],
        columns: [
          z(
            "select",
            "Selecionar",
            (d) =>
              (0, b.jsx)(Yy, {
                label: "Selecionar " + d.name,
                hideLabel: !0,
                checked: a.includes(d.id || ""),
                onCheckedChange: (m: boolean) =>
                  o(m ? [...a, String(d.id)] : a.filter((p) => p !== d.id)),
              }),
            { selection: !0 },
          ),
          z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
          z("city", "Cidade"),
          z("state", "UF"),
          z(
            "priceTables",
            "Tabelas de pre\xE7o",
            (d) => d.priceTables?.join(", ") || "N\xE3o extra\xEDdo",
          ),
          z("tags", "Tags", (d) => d.tags?.join(", ") || "\u2014"),
        ],
      }),
    ],
  });
}
function ProductsPage() {
  const { db: e, online } = useSulContext(),
    [n, r] = (0, He.useState)(""),
    l = (online ? manualRows(e["products"]) : e["products"]).filter(
      (s) => !n || s["category"] === n,
    );
  const remote = He.useMemo(
    () => (online ? { client: online, resource: "products", categoryName: n } : undefined),
    [online, n],
  );
  const categoryLabels = useERPCategories(online, (error) => go(error));
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "Produtos",
        description: "Cadastro e consulta de produtos persistidos na SulBR",
      }),
      (0, b.jsx)(Ui, {
        area: "produtos",
        items: [["/produtos", "Produtos"]],
      }),
      (0, b.jsxs)("div", {
        className: "flex flex-wrap items-end gap-3",
        children: [
          (0, b.jsx)(ho, {
            label: "Categoria",
            value: n,
            onValueChange: r,
            options: La([
              { value: "", label: "Todas as categorias" },
              ...Array.from(
                new Set([
                  ...(online ? manualRows(e["products"]) : e["products"])
                    .map((s) => s["category"])
                    .filter((value): value is NonNullable<typeof value> => !!value),
                  ...categoryLabels,
                ]),
              ).map((s) => ({ value: String(s), label: String(s) })),
            ]),
          }),
          (0, b.jsx)(Gp, {
            rows: l,
            name: "produtos-sulbr",
            remoteResource: "products",
            columns: ["code", "name", "unit", "category", "price", "priceSource", "source"],
          }),
        ],
      }),
      (0, b.jsx)(RecordsTable, {
        rows: l,
        remote,
        label: "Produtos",
        onRowClick: (s: ViewRow) => bn("/produtos/" + s.id),
        columns: [
          z("icon", "", () =>
            (0, b.jsx)("div", {
              className: "product-mark",
              children: (0, b.jsx)(du, { size: 22 }),
            }),
          ),
          z("code", "C\xF3digo"),
          z(
            "name",
            "Produto",
            (s) =>
              (0, b.jsxs)("div", {
                children: [
                  (0, b.jsx)("a", {
                    className: "font-medium ds-link",
                    href: "#/produtos/" + s.id,
                    children: s.name,
                  }),
                  (0, b.jsx)(Xt, { children: s["priceSource"] }),
                ],
              }),
            { primary: !0, wide: !0 },
          ),
          z("category", "Categoria", (s) =>
            (0, b.jsxs)("div", {
              children: [
                s.category || pa,
                s["categorySource"] && (0, b.jsx)(Xt, { children: "Inferida da descri\xE7\xE3o" }),
              ],
            }),
          ),
          z("unit", "Unidade"),
          z("price", "Preço unitário", (s) => rt(s.price), {
            align: "right",
          }),
          z("source", "Origem", (s) => (0, b.jsx)(qr, { row: s })),
        ],
      }),
      (0, b.jsx)(Xt, {
        children:
          "Os tr\xEAs pre\xE7os conhecidos vieram dos itens do pedido #2351. As centenas de tabelas de pre\xE7o n\xE3o foram reconstru\xEDdas.",
      }),
    ],
  });
}
function ProductDetail({ id: e }: { id: string }) {
  const { db: t } = useSulContext(),
    n = Ur(t, e),
    r: Partial<Product> = n || {},
    [s, i] = (0, He.useState)("precos"),
    u = (_field: string, _value: unknown) => {};
  if (!n) return (0, b.jsx)(Wu, {});
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "Ficha do produto",
        description: n.name,
        back: { label: "Produtos", to: "/produtos" },
      }),
      (0, b.jsx)(qr, { row: n }),
      (0, b.jsx)(Vt, {
        children: (0, b.jsxs)(Vi, {
          children: [
            (0, b.jsx)(vr, {
              disabled: true,
              label: "Nome",
              value: r.name || "",
              onChange: (f: string) => u("name", f),
            }),
            (0, b.jsx)(vr, {
              disabled: true,
              label: "C\xF3digo",
              value: r.code || "",
              onChange: (f: string) => u("code", f),
            }),
            (0, b.jsx)(vr, {
              disabled: true,
              label: "Unidade de medida",
              value: r.unit || "",
              onChange: (f: string) => u("unit", f),
            }),
            (0, b.jsx)(Hr, {
              disabled: true,
              label: "Venda em m\xFAltiplos de",
              min: 1,
              value: r["multiple"] ?? null,
              onChange: (f: number | null) => u("multiple", f),
              hint: "Valor n\xE3o extra\xEDdo quando vazio",
            }),
            (0, b.jsx)(vr, {
              disabled: true,
              label: "Categoria",
              value: r.category || "",
              onChange: (f: string) => u("category", f),
            }),
          ],
        }),
      }),
      (0, b.jsx)(of, {
        label: "Abas do produto",
        items: [
          { id: "precos", label: "Tabelas de pre\xE7o" },
          { id: "gerais", label: "Informa\xE7\xF5es gerais" },
          { id: "variacoes", label: "Varia\xE7\xF5es" },
          { id: "peso", label: "Peso e dimens\xF5es" },
        ],
        value: s,
        onChange: i,
      }),
      s === "precos" &&
        (0, b.jsx)(Vt, {
          children: (0, b.jsxs)(Ot, {
            title: "Pre\xE7o unit\xE1rio",
            children: [
              (0, b.jsx)(Up, {
                disabled: true,
                label: "Pre\xE7o unit\xE1rio",
                value: r.price ?? null,
                onChange: (f: number | null) => u("price", f),
                hint: n["priceSource"],
              }),
              (0, b.jsx)("div", {
                className: "mt-5",
                children: (0, b.jsx)(hn, {
                  framed: !1,
                  title: "Pre\xE7os espec\xEDficos por tabela n\xE3o extra\xEDdos",
                  hint: "Nomes de tabelas observados incluem PADR\xC3O SP, BAFFA, PROEN\xC7A e TESTE. O mock n\xE3o replica seus valores.",
                }),
              }),
            ],
          }),
        }),
      s === "gerais" &&
        (0, b.jsx)(Vt, {
          children: (0, b.jsxs)(Ot, {
            title: "Informa\xE7\xF5es gerais",
            children: [
              (0, b.jsxs)(Vi, {
                children: [
                  (0, b.jsx)(Hr, {
                    disabled: true,
                    label: "IPI (%)",
                    value: r["ipi"] ?? null,
                    min: 0,
                    max: 100,
                    digits: 2,
                    onChange: (f: number | null) => u("ipi", f),
                  }),
                  (0, b.jsx)(vr, {
                    disabled: true,
                    label: "NCM",
                    value: r["ncm"] || "",
                    onChange: (f: string) => u("ncm", f),
                  }),
                  (0, b.jsx)(Hr, {
                    disabled: true,
                    label: "Comiss\xE3o (%)",
                    min: 0,
                    max: 100,
                    digits: 2,
                    value: r.commission ?? null,
                    onChange: (f: number | null) => u("commission", f),
                  }),
                ],
              }),
              (0, b.jsx)("div", {
                className: "mt-4",
                children: (0, b.jsx)($u, {
                  disabled: true,
                  label: "Informa\xE7\xF5es adicionais",
                  value: r.notes || "",
                  onChange: (f: string) => u("notes", f),
                }),
              }),
              (0, b.jsx)(Xt, {
                children:
                  "Campos vazios correspondem a valores n\xE3o extra\xEDdos, n\xE3o a al\xEDquotas zero.",
              }),
            ],
          }),
        }),
      s === "variacoes" &&
        (0, b.jsx)(Vt, {
          children: (0, b.jsxs)(Ot, {
            title: "Varia\xE7\xF5es",
            children: [
              (0, b.jsx)(vr, {
                disabled: true,
                label: "Atributo de varia\xE7\xE3o",
                value: r["variantLabel"] || "",
                onChange: (f: string) => u("variantLabel", f),
                hint: "Ex.: tamanho. Qualquer preenchimento \xE9 simulado.",
              }),
              (0, b.jsx)("div", {
                className: "mt-4",
                children: (0, b.jsx)(vr, {
                  disabled: true,
                  label: "Valores separados por v\xEDrgula",
                  value: (r["variants"] || []).join(", "),
                  onChange: (f: string) =>
                    u(
                      "variants",
                      f
                        .split(",")
                        .map((d) => d.trim())
                        .filter((value): value is NonNullable<typeof value> => !!value),
                    ),
                }),
              }),
              !r["variants"]?.length &&
                (0, b.jsx)(hn, {
                  framed: !1,
                  title:
                    e === "11240"
                      ? "Produto sem varia\xE7\xF5es na ficha observada"
                      : "Varia\xE7\xF5es n\xE3o extra\xEDdas",
                  hint: "Defina atributos somente para experimentar o formul\xE1rio local.",
                }),
            ],
          }),
        }),
      s === "peso" &&
        (0, b.jsx)(Vt, {
          children: (0, b.jsxs)(Ot, {
            title: "Peso e dimens\xF5es",
            children: [
              (0, b.jsx)(ho, {
                disabled: true,
                label: "Forma de cadastro",
                value: r["dimensionMode"] || "unitario",
                onValueChange: (f: string) => u("dimensionMode", f),
                options: La([
                  {
                    value: "unitario",
                    label: "Peso e dimens\xF5es unit\xE1rias",
                  },
                  {
                    value: "caixa",
                    label: "Peso e dimens\xF5es da caixa master",
                  },
                ]),
              }),
              (0, b.jsx)("div", {
                className: "mt-4",
                children: (0, b.jsxs)(Vi, {
                  children: [
                    (0, b.jsx)(Hr, {
                      disabled: true,
                      label: "Peso bruto (kg)",
                      value: r["weight"] ?? null,
                      digits: 3,
                      min: 0,
                      onChange: (f: number | null) => u("weight", f),
                    }),
                    (0, b.jsx)(Hr, {
                      disabled: true,
                      label: "Largura (cm)",
                      value: r["width"] ?? null,
                      digits: 2,
                      min: 0,
                      onChange: (f: number | null) => u("width", f),
                    }),
                    (0, b.jsx)(Hr, {
                      disabled: true,
                      label: "Altura (cm)",
                      value: r["height"] ?? null,
                      digits: 2,
                      min: 0,
                      onChange: (f: number | null) => u("height", f),
                    }),
                    (0, b.jsx)(Hr, {
                      disabled: true,
                      label: "Comprimento (cm)",
                      value: r["length"] ?? null,
                      digits: 2,
                      min: 0,
                      onChange: (f: number | null) => u("length", f),
                    }),
                  ],
                }),
              }),
              (0, b.jsx)(Xt, {
                children:
                  "As unidades foram observadas. Medidas n\xE3o extra\xEDdas permanecem vazias.",
              }),
            ],
          }),
        }),
    ],
  });
}
function dv(e: AppState, t: Order[]) {
  const a: Record<
    string,
    { id: string; code: string | undefined; name: string; qty: number; total: number }
  > = {};
  return (
    t.forEach((o) =>
      (o.items || []).forEach((n) => {
        const r = Ur(e, n.productId),
          l = (a[n.productId] ||= {
            id: n.productId,
            code: r?.code,
            name: r?.name || "Produto n\xE3o dispon\xEDvel",
            qty: 0,
            total: 0,
          });
        {
          l.qty += n.qty;
          l.total += n.qty * (n.price ?? 0);
        }
      }),
    ),
    Object.values(a)
  );
}
function N5(e: AppContext["editor"], t: AppContext["update"], a: AppState, o: string = "") {
  e({
    title: "Criar tarefa local",
    allocateIdentity: true,
    values: {
      customerId: o,
      date: bo,
      seller: a.company.user,
      status: "N\xE3o realizada",
    },
    fields: [
      { key: "name", label: "Descri\xE7\xE3o da tarefa", required: !0 },
      {
        key: "customerId",
        label: "Cliente",
        options: a.customers.map((n) => ({ value: n.id!, label: n.name || "" })),
      },
      { key: "date", label: "Data", kind: "date", required: !0 },
      {
        key: "seller",
        label: "Vendedor",
        options: sellerNames(a),
      },
    ],
    save: async (n) =>
      await t((r) =>
        r.tasks.push({
          ...n,
          id: n.id!,
          status: "N\xE3o realizada",
          source: "simulado",
        }),
      ),
  });
}
function M5(
  e: (spec: EditorSpec) => void,
  t: (mutator: (draft: AppState) => unknown) => Promise<unknown>,
  a: { customers: { id: string; name?: string | undefined }[] },
  o: string = "",
) {
  e({
    title: "Registrar atividade local",
    allocateIdentity: true,
    values: { customerId: o, date: bo },
    fields: [
      { key: "name", label: "Descri\xE7\xE3o", required: !0 },
      {
        key: "customerId",
        label: "Cliente",
        options: a.customers.map((n) => ({ value: n.id, label: n.name || "" })),
      },
      { key: "date", label: "Data", kind: "date", required: !0 },
      {
        key: "result",
        label: "Resultado",
        options: ["Relacionamento", "Venda convertida"],
        required: !0,
      },
    ],
    save: async (n) =>
      await t((r) =>
        r.activities.push({
          ...n,
          id: n.id!,
          sellerId: activityOwner(r, n.customerId || ""),
          status: "Realizada",
          source: "simulado",
        }),
      ),
  });
}
function T5(e: AppState) {
  return [
    z("name", "Descri\xE7\xE3o", void 0, { primary: !0, wide: !0 }),
    z("customer", "Cliente", (t) => (t.customerId ? Un(e, t.customerId) : "\u2014"), {
      get: (t) => Un(e, t["customerId"]),
    }),
    z("date", "Data", (t) => xo(t.date)),
    z("seller", "Vendedor"),
  ];
}
function ActivitiesPage({ routes: e = !1 }: { routes?: boolean | undefined }) {
  const { db: t, update: a, editor: o, confirm: n } = useSulContext(),
    [r, l] = (0, He.useState)("tarefas"),
    s = e ? t["routes"] : r === "tarefas" ? t["tasks"] : t["activities"];
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: e ? "Roteiros planejados" : "Agenda",
        description: e
          ? "Na inspe\xE7\xE3o, n\xE3o havia roteiros criados."
          : "O recorte observado estava vazio com filtros de G4 e atividades n\xE3o realizadas.",
        actions: (0, b.jsxs)(Ft, {
          onClick: e
            ? () =>
                o({
                  title: "Criar roteiro local",
                  allocateIdentity: true,
                  values: { date: bo },
                  fields: [
                    { key: "name", label: "Nome do roteiro", required: !0 },
                    {
                      key: "seller",
                      label: "Vendedor",
                      options: sellerNames(t),
                      required: !0,
                    },
                    { key: "date", label: "Data", kind: "date", required: !0 },
                    {
                      key: "repeat",
                      label: "Repete",
                      options: ["N\xE3o repete", "Semanal", "Mensal"],
                    },
                    {
                      key: "clients",
                      label: "Clientes / observa\xE7\xF5es",
                      kind: "area",
                    },
                  ],
                  save: async (u) =>
                    await a((c) =>
                      c["routes"].push({
                        ...u,
                        id: u["id"]!,
                        status: "Planejado",
                        source: "simulado",
                      }),
                    ),
                })
            : () => N5(o, a, t),
          children: [(0, b.jsx)(Sa, {}), e ? "Criar roteiro" : "Criar tarefa"],
        }),
      }),
      (0, b.jsx)(Ui, {
        area: "agenda",
        items: [
          ["/agenda", "Tarefas e atividades"],
          ["/agenda/roteiros", "Roteiros"],
        ],
      }),
      !e &&
        (0, b.jsxs)("div", {
          className: "flex flex-wrap justify-between gap-3",
          children: [
            (0, b.jsx)(ho, {
              label: "Mostrar",
              value: r,
              onValueChange: l,
              options: La([
                { value: "tarefas", label: "Tarefas agendadas" },
                { value: "atividades", label: "Atividades realizadas" },
              ]),
            }),
            (0, b.jsx)(xt, {
              onClick: () => M5(o, a, t),
              children: "Registrar atividade",
            }),
          ],
        }),
      (0, b.jsx)(RecordsTable, {
        rows: s,
        columns: e
          ? [
              z("name", "Roteiro", void 0, { primary: !0 }),
              z("seller", "Vendedor"),
              z("date", "Data", (u) => xo(u.date)),
              z("repeat", "Repete"),
              z("clients", "Clientes / observa\xE7\xF5es"),
              z("status", "Situa\xE7\xE3o", (u) => (0, b.jsx)(qn, { value: u.status })),
              z(
                "actions",
                "A\xE7\xF5es",
                (u) =>
                  (0, b.jsx)(Il, {
                    label: "Op\xE7\xF5es do roteiro",
                    actions: [
                      {
                        label: "Excluir roteiro local",
                        tone: "danger",
                        onSelect: () =>
                          n(
                            "Excluir roteiro no sistema?",
                            async () =>
                              await a((c) => {
                                c["routes"] = c["routes"].filter((f) => f.id !== u.id);
                              }),
                          ),
                      },
                    ],
                  }),
                { action: !0 },
              ),
            ]
          : [
              ...T5(t),
              z(
                "actions",
                "A\xE7\xF5es",
                (u) =>
                  (0, b.jsx)(Il, {
                    label: "Op\xE7\xF5es da tarefa",
                    actions: [
                      {
                        label: "Concluir tarefa",
                        onSelect: async () => {
                          {
                            await a((c) => {
                              const f = c["tasks"].find((d) => d.id === u.id);
                              {
                                if (f) {
                                  f.status = "Realizada";
                                }
                              }
                            });
                            go("Tarefa conclu\xEDda no sistema");
                          }
                        },
                      },
                      {
                        label: "Excluir registro local",
                        tone: "danger",
                        onSelect: () =>
                          n(
                            "Excluir registro no sistema?",
                            async () =>
                              await a((c) => {
                                c[r === "tarefas" ? "tasks" : "activities"] = c[
                                  r === "tarefas" ? "tasks" : "activities"
                                ].filter((f) => f.id !== u.id);
                              }),
                          ),
                      },
                    ],
                  }),
                { action: !0 },
              ),
            ],
        actions: (0, b.jsx)(Gp, { rows: s, name: e ? "roteiros" : "agenda" }),
      }),
    ],
  });
}
function A5(e: AppContext["editor"], t: AppContext["update"], a: AppState, o: string = "") {
  e({
    title: "Criar oportunidade local",
    allocateIdentity: true,
    values: {
      customerId: o,
      stage: a.stages[0],
      seller: a.company.user,
      date: bo,
      value: null,
    },
    fields: [
      { key: "name", label: "Nome da oportunidade", required: !0 },
      { key: "value", label: "Valor estimado", kind: "currency", required: !0 },
      {
        key: "seller",
        label: "Vendedor",
        options: sellerNames(a),
      },
      { key: "stage", label: "Etapa", options: a.stages, required: !0 },
      { key: "date", label: "Data de abertura", kind: "date", required: !0 },
    ],
    save: async (n) =>
      await t((r) =>
        r.opportunities.push({
          ...n,
          id: n.id!,
          status: "Aberta",
          source: "simulado",
        }),
      ),
  });
}
function OpportunitiesPage() {
  const { db: e, update: t, editor: a, confirm: o } = useSulContext(),
    [n, r] = (0, He.useState)(""),
    [l, s] = (0, He.useState)("Aberta"),
    i = L5(e["opportunities"], n).filter((c) => !l || c["status"] === l),
    u = async (c: string, f: string) => {
      {
        await t((d) => {
          d["opportunities"].find((m) => m.id === c)!.stage = f;
        });
        go("Etapa alterada no sistema");
      }
    };
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "Funil de Vendas",
        description:
          "Vendas SulBR \xB7 Lead \u2192 Primeiro contato \u2192 Negocia\xE7\xE3o \u2192 Fechamento",
        actions: (0, b.jsxs)(Ft, {
          onClick: () => A5(a, t, e),
          children: [(0, b.jsx)(Sa, {}), "Criar oportunidade"],
        }),
      }),
      (0, b.jsx)(Ui, {
        area: "oportunidades",
        items: [
          ["/oportunidades", "Funil de vendas"],
          ["/config/crm/funis", "Configura\xE7\xE3o"],
        ],
      }),
      (0, b.jsx)(nv, {
        children: (0, b.jsx)(cv, {
          query: n,
          onQuery: r,
          shown: i.length,
          total: e["opportunities"].length,
          noun: "oportunidade",
          hideSearch: !1,
          dirty: !!n,
          onClear: () => r(""),
          children: (0, b.jsx)(ho, {
            label: "Situa\xE7\xE3o",
            size: "compact",
            value: l,
            options: La([
              { value: "Aberta", label: "Abertas" },
              { value: "Ganha", label: "Ganhas" },
              { value: "Perdida", label: "Perdidas" },
              { value: "", label: "Todas" },
            ]),
            onValueChange: s,
          }),
        }),
      }),
      (0, b.jsx)(c1, {
        label: "Funil Vendas SulBR",
        children: e["stages"].map((c) => {
          const f = i["filter"]((d) => d["stage"] === c);
          return (0, b.jsxs)(
            i1,
            {
              title: c,
              count: f.length,
              meta: rt(Zo(f, "value")),
              width: 240,
              onDrop: (d: React.DragEvent) => {
                d.preventDefault();
                const m = d.dataTransfer.getData("text/plain");
                {
                  if (e["opportunities"].some((p) => p.id === m)) {
                    u(m, c);
                  }
                }
              },
              children: [
                f.map((d) =>
                  (0, b.jsx)(
                    u1,
                    {
                      title: d.name || "",
                      owner: {
                        name: d.seller,
                        initials: d.seller?.slice(0, 2) || "G4",
                      },
                      onDragStart: (m: React.DragEvent) =>
                        m.dataTransfer.setData("text/plain", d.id),
                      flag: (0, b.jsxs)("div", {
                        className: "space-y-2",
                        children: [
                          (0, b.jsx)("div", {
                            className: "text-body",
                            children: rt(d.value),
                          }),
                          (0, b.jsx)(Xt, { children: Un(e, d.customerId) }),
                          (0, b.jsx)(qr, { row: d }),
                        ],
                      }),
                      onOpen: () =>
                        a({
                          title: d.name || "",
                          values: d,
                          fields: [
                            { key: "name", label: "Nome", required: !0 },
                            { key: "stage", label: "Etapa", options: e["stages"] },
                            {
                              key: "status",
                              label: "Situa\xE7\xE3o",
                              options: ["Aberta", "Ganha", "Perdida"],
                            },
                            {
                              key: "value",
                              label: "Valor estimado",
                              kind: "currency",
                            },
                          ],
                          save: async (m) =>
                            await t((p) =>
                              Object.assign(
                                p["opportunities"].find((y) => y.id === d.id)!,
                                m,
                              ),
                            ),
                        }),
                      actions: (0, b.jsx)(Il, {
                        label: "A\xE7\xF5es da oportunidade",
                        actions: [
                          ...e["stages"].map((m) => ({
                            label: "Mover para " + m,
                            onSelect: () => u(d.id, m),
                          })),
                          {
                            label: "Marcar como ganha",
                            onSelect: async () =>
                              await t((m) => {
                                m["opportunities"].find((p) => p.id === d.id)!.status = "Ganha";
                              }),
                          },
                          {
                            label: "Criar pedido",
                            onSelect: () => bn("/pedidos/novo?cliente=" + d.customerId),
                          },
                          {
                            label: "Excluir oportunidade local",
                            tone: "danger",
                            onSelect: () =>
                              o(
                                "Excluir oportunidade no sistema?",
                                async () =>
                                  await t((m) => {
                                    m["opportunities"] = m["opportunities"].filter(
                                      (p) => p.id !== d.id,
                                    );
                                  }),
                              ),
                          },
                        ],
                      }),
                    },
                    d.id,
                  ),
                ),
                !f.length &&
                  (0, b.jsx)("div", {
                    className: "p-3",
                    children: (0, b.jsx)(Xt, {
                      children: "Nenhuma oportunidade neste recorte.",
                    }),
                  }),
              ],
            },
            c,
          );
        }),
      }),
      (0, b.jsx)(Xt, {
        children:
          "O quadro observado estava vazio sob filtros de G4 e Abertas. Arrastar cart\xF5es ou usar seu menu altera apenas a simula\xE7\xE3o.",
      }),
    ],
  });
}
function ReportCatalogPage() {
  const { db: e } = useSulContext();
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "Relat\xF3rios",
        description:
          "Consultas sobre o recorte do arquivo \xB7 estados n\xE3o observados permanecem identificados",
      }),
      (0, b.jsx)(Ui, {
        area: "indicadores",
        items: [
          ["/indicadores", "Pain\xE9is"],
          ["/relatorios", "Relat\xF3rios"],
        ],
      }),
      (0, b.jsx)(RecordsTable, {
        rows: e["reports"],
        label: "Relat\xF3rios",
        columns: [
          z(
            "name",
            "Relat\xF3rio",
            (t) =>
              (0, b.jsx)("a", {
                className: "font-medium ds-link",
                href: "#/relatorios/" + t.id,
                children: t.name,
              }),
            { primary: !0, wide: !0 },
          ),
          z("state", "Cobertura", (t) =>
            (0, b.jsx)(bi, {
              tone: t.id === "carteira-vendedor" ? "warn" : "neutral",
              children:
                t.id === "carteira-vendedor"
                  ? "Bloqueio de plano observado"
                  : "Estrutura observada",
            }),
          ),
          z(
            "open",
            "Abrir",
            (t) =>
              (0, b.jsxs)(xt, {
                href: "#/relatorios/" + t.id,
                children: ["Abrir", (0, b.jsx)(so, {})],
              }),
            { action: !0 },
          ),
        ],
        onRowClick: (t: ViewRow) => bn("/relatorios/" + t.id),
      }),
    ],
  });
}
function ReportPage({ id: e }: { id: string }) {
  const { db: t, editor: a, update: o, online } = useSulContext(),
    n = t["reports"].find((h) => h.id === e),
    r = w5(
      t["orders"],
      e === "gerencial"
        ? (() => {
            const q = new URLSearchParams(location.hash.split("?")[1] || "");
            return {
              from: q.get("de") || "",
              to: q.get("ate") || "",
              seller: q.get("vendedor") || "",
            };
          })()
        : undefined,
    ),
    [l, s] = (0, He.useState)("nenhum"),
    [i, u] = (0, He.useState)(!1),
    [c, f] = He.useState<string[]>([]);
  const rankingReport = ["ranking", "meta-vendedor"].includes(e) && !!online;
  const receivablesReport = e === "titulos" && !!online;
  const customerReport = e === "clientes" && !!online;
  const nonBuyerReport = e === "nao-compraram" && !!online;
  const walletReport = ["carteira-vendedor", "positivacao", "carteira"].includes(e) && !!online;
  const stockReport = e === "estoque" && !!online;
  const commissionReport = ["comissoes", "comissoes-pedido"].includes(e) && !!online;
  const commissionKey = JSON.stringify([e, r.f]);
  const [commissionResult, setCommissionResult] = He.useState<{
    key: string;
    summary: ERPCommissionSummary | undefined;
    source?: ERPReportSource;
  }>();
  const onCommissionSummary = He.useCallback(
    (summary: ERPCommissionSummary | undefined) =>
      setCommissionResult({ key: commissionKey, summary }),
    [commissionKey],
  );
  const commissionSummary: ERPCommissionSummary | undefined =
    commissionResult?.key === commissionKey ? commissionResult.summary : undefined;
  const reportMonth = r.f.from?.slice(0, 7) || r.f.to?.slice(0, 7) || businessDate().slice(0, 7);
  const nonBuyerKey = JSON.stringify([r.f, reportMonth]);
  const walletKey = JSON.stringify([e, r.f, reportMonth]);
  const [tableStatus, setTableStatus] = He.useState({ loading: true, error: false });
  const [walletResult, setWalletResult] = He.useState<{
    key: string;
    summary: ERPWalletSummary | undefined;
    source?: ERPReportSource;
  }>();
  const onWalletSummary = He.useCallback(
    (summary: ERPWalletSummary | undefined) => setWalletResult({ key: walletKey, summary }),
    [walletKey],
  );
  const walletSummary: ERPWalletSummary | undefined =
    walletResult?.key === walletKey ? walletResult.summary : undefined;
  const [nonBuyerResult, setNonBuyerResult] = He.useState<{
    key: string;
    summary: ERPNonBuyersSummary | undefined;
    source?: ERPReportSource;
  }>();
  const onNonBuyersSummary = He.useCallback(
    (summary: ERPNonBuyersSummary | undefined) => setNonBuyerResult({ key: nonBuyerKey, summary }),
    [nonBuyerKey],
  );
  const nonBuyerSummary: ERPNonBuyersSummary | undefined =
    nonBuyerResult?.key === nonBuyerKey ? nonBuyerResult.summary : undefined;
  const chartReport = ["resumo", "vendas-anterior"].includes(e) && !!online;
  const abcReport = e === "abc" && !!online;
  const mixReport = e === "mix" && !!online;
  const salesReport = (e === "vendas" || chartReport || abcReport || mixReport) && !!online;
  const billingReport = e === "faturamento" && !!online;
  const billedOrdersReport = e === "faturados" && !!online;
  const commercialReport = salesReport || billingReport || billedOrdersReport || rankingReport;
  const itemReport = e === "produtos-pedido" && !!online;
  const productReport = e === "produtos" && !!online;
  const managementReport = e === "gerencial" && !!online;
  const completionReport = e === "tarefas";
  const opportunityReport = e === "funil";
  const localRecordReport = completionReport || opportunityReport;
  const completionExport = He.useRef(undefined);
  const completions = He.useMemo(
    () =>
      completionReport
        ? completionRecords({
            activities: t["activities"],
            tasks: t["tasks"],
            customers: t["customers"],
            users: t["users"],
          })
        : [],
    [completionReport, t["activities"], t["tasks"], t["customers"]],
  );
  const opportunities = He.useMemo(
    () =>
      opportunityReport
        ? opportunityReportRows({ opportunities: t["opportunities"], customers: t["customers"] })
        : [],
    [opportunityReport, t["opportunities"], t["customers"]],
  );
  const salesKey = JSON.stringify([e, l, r.f]);
  const [salesResult, setSalesResult] = He.useState<{
    key: string;
    summary: ERPSalesSummary | undefined;
    source?: ERPReportSource;
  }>();
  const onSalesSummary = He.useCallback(
    (summary: ERPSalesSummary | undefined, source?: ERPReportSource) =>
      setSalesResult({ key: salesKey, summary, ...(source ? { source } : {}) }),
    [salesKey],
  );
  const salesSummary: ERPSalesSummary | undefined =
    salesResult?.key === salesKey ? salesResult.summary : undefined;
  const rankingChart = useRankingChart(
    online,
    rankingReport && e === "meta-vendedor" && salesResult?.key === salesKey
      ? (salesResult as { summary: ERPRankingSummary | undefined; source?: ERPReportSource })
      : undefined,
  );
  const salesChart = useERPSalesChart(
    online,
    chartReport && salesResult?.key === salesKey ? salesResult : undefined,
  );
  const [productResult, setProductResult] = He.useState<{
    key: string;
    summary: ERPItemSummary | undefined;
    source?: ERPReportSource;
  }>();
  const onItemsSummary = He.useCallback(
    (summary: ERPItemSummary | undefined, source?: ERPReportSource) =>
      setProductResult({ key: salesKey, summary, ...(source ? { source } : {}) }),
    [salesKey],
  );
  const productChart = useERPProductsChart(
    online,
    productReport && productResult?.key === salesKey ? productResult : undefined,
  );
  const managementProducts = He.useMemo(
    () =>
      managementReport
        ? {
            client: online,
            resource: "orders",
            orderItemsReport: { ...salesReportQuery(r.f, "nenhum"), productReport: true },
            registerExport: false,
          }
        : undefined,
    [online, e, salesKey],
  );
  const remote = He.useMemo(
    () =>
      rankingReport
        ? {
            client: online,
            resource: "orders",
            rankingReport: { ...salesReportQuery(r.f, "nenhum"), month: reportMonth },
            onSummary: onSalesSummary,
          }
        : receivablesReport
          ? (() => {
              const { status: _ignored, ...filters } = salesReportQuery(r.f, "nenhum");
              return {
                client: online,
                resource: "orders",
                receivablesReport: {
                  ...filters,
                  ...(r.f.status
                    ? {
                        settlement:
                          r.f.status === "Baixa registrada"
                            ? "registrada"
                            : r.f.status === "Sem baixa registrada"
                              ? "sem-registro"
                              : "invalid",
                      }
                    : {}),
                },
              };
            })()
          : commissionReport
            ? {
                client: online,
                resource: "orders",
                commissionReport: {
                  ...salesReportQuery(r.f, "nenhum"),
                  view: e === "comissoes" ? "sellers" : "orders",
                },
                onCommissionSummary,
              }
            : stockReport
              ? { client: online, resource: "products", stockReport: {} }
              : walletReport
                ? {
                    client: online,
                    resource: "customers",
                    walletReport: {
                      ...nonBuyersQuery(r.f, reportMonth),
                      view: e === "carteira-vendedor" ? "sellers" : "customers",
                    },
                    onWalletSummary,
                  }
                : nonBuyerReport
                  ? {
                      client: online,
                      resource: "customers",
                      nonBuyersReport: nonBuyersQuery(r.f, reportMonth),
                      onNonBuyersSummary,
                    }
                  : managementReport
                    ? {
                        client: online,
                        resource: "orders",
                        salesReport: salesReportQuery(r.f, "cliente"),
                      }
                    : productReport
                      ? {
                          client: online,
                          resource: "orders",
                          orderItemsReport: {
                            ...salesReportQuery(r.f, "nenhum"),
                            productReport: true,
                          },
                          onItemsSummary,
                        }
                      : itemReport
                        ? {
                            client: online,
                            resource: "orders",
                            orderItemsReport: salesReportQuery(r.f, "nenhum"),
                          }
                        : billedOrdersReport
                          ? {
                              client: online,
                              resource: "orders",
                              billedOrdersReport: salesReportQuery(r.f, l),
                              onSummary: onSalesSummary,
                            }
                          : billingReport
                            ? {
                                client: online,
                                resource: "invoices",
                                billingReport: salesReportQuery(
                                  r.f.from || r.f.to
                                    ? r.f
                                    : (() => {
                                        const m = businessDate().slice(0, 7),
                                          y = Number(m.slice(0, 4)),
                                          mo = Number(m.slice(5, 7));
                                        return {
                                          ...r.f,
                                          from: m + "-01",
                                          to:
                                            m +
                                            "-" +
                                            String(
                                              new Date(Date.UTC(y, mo, 0)).getUTCDate(),
                                            ).padStart(2, "0"),
                                        };
                                      })(),
                                  l,
                                ),
                                onSummary: onSalesSummary,
                              }
                            : salesReport
                              ? {
                                  client: online,
                                  resource: "orders",
                                  salesReport: {
                                    ...salesReportQuery(
                                      r.f,
                                      abcReport || mixReport ? "cliente" : l,
                                    ),
                                    ...(mixReport ? { productMix: true } : {}),
                                  },
                                  ...(abcReport ? { salesParticipation: true } : {}),
                                  onSummary: onSalesSummary,
                                }
                              : customerReport && remoteCustomerReport(r.f)
                                ? {
                                    client: online,
                                    resource: "customers",
                                    filters: customerReportFilters(r.f),
                                  }
                                : undefined,
    [
      online,
      e,
      l,
      salesKey,
      onSalesSummary,
      onItemsSummary,
      nonBuyerKey,
      onNonBuyersSummary,
      walletKey,
      onWalletSummary,
      commissionKey,
      onCommissionSummary,
    ],
  );
  if (!n) return (0, b.jsx)(Wu, {});
  const d = ["faturados", "faturamento"].includes(e)
    ? invoicedOrders(r.rows as Order[], t["invoices"])
    : (r.rows as Order[]);
  let m: ViewRow[] = [],
    p: TableColumn[] = [],
    y = "Dados persistidos no sistema, conforme os filtros selecionados.",
    C = null,
    x = null;
  const v = (rankingReport ? [] : d).filter(
    (h) => h.type === "Venda" && h.status === "Conclu\xEDdo",
  );
  if (["resumo", "vendas", "vendas-anterior", "faturados", "faturamento"].includes(e)) {
    if (
      ((m = d),
      (p = jp(t, billingReport)),
      (e === "faturados" || e === "faturamento") &&
        ((p = [
          ...p,
          z("invoiced", "Valor faturado", (h) => (h.invoiced != null ? rt(h.invoiced) : pa), {
            align: "right",
          }),
          z("nf", "Nota fiscal", (h) =>
            billingReport || billedOrdersReport
              ? String(h["nf"] ?? pa)
              : t["invoices"]
                  .filter((S) => S.orderId === h.id)
                  .map((S) => S.number)
                  .join(", ") || pa,
          ),
        ]),
        (y = billingReport
          ? "Notas fiscais aprovadas vinculadas à venda padrão, por data de faturamento. Pedidos e notas não são somados. Sem período informado, é usado o mês corrente."
          : billedOrdersReport
            ? "Pedidos padrão com pelo menos uma nota fiscal qualificada, incluindo parciais, sem presumir faturamento integral. Período por DTFATUR da nota, sem substituir a emissão do pedido. Valor faturado só é atribuído quando todas as notas selecionadas têm este pedido como origem única; nota de vários pedidos ou referência fiscal incompleta mantém valor não extraído, sem rateio ou soma parcial apresentada como total. Valores de pedidos e notas não são somados."
            : "Somente pedidos com documentos fiscais disponíveis. A integração fiscal não está configurada; vendas não são apresentadas como faturamento.")),
      l !== "nenhum")
    ) {
      const h: Record<string, ViewRow> = {};
      {
        if (!commercialReport) {
          d.forEach((S) => {
            const L = l === "vendedor" ? S.seller || "" : Un(t, S.customerId),
              I = (h[L] ||= { id: L, name: L, count: 0, total: 0 });
            {
              I.count = Number(I.count || 0) + 1;
              I.total = Number(I.total || 0) + Number(S.total || 0);
            }
          });
        }
        m = Object.values(h);
        p = [
          z("name", l === "vendedor" ? "Vendedor" : "Cliente", void 0, {
            primary: !0,
            wide: !0,
          }),
          z("count", billingReport ? "Notas" : "Pedidos"),
          z("total", "Valor", (S) => rt(S.total), { align: "right" }),
        ];
      }
    }
    {
      if (e === "resumo" || e === "vendas-anterior") {
        C = (0, b.jsx)(cs, {
          title: "Valor em pedidos no recorte",
          description: "Totais agrupados por vendedor",
          children: (0, b.jsx)(Qy, {
            label: "Valor em pedidos por vendedor",
            data: chartReport
              ? salesChart
              : Array.from(new Set(d.map((h) => h.seller))).map((h) => ({
                  vendedor: h,
                  total: Zo(
                    d.filter((S) => S.seller === h),
                    "total",
                  ),
                })),
            index: "vendedor",
            series: [{ key: "total", label: "Pedidos" }],
            format: Vd,
            height: 260,
          }),
        });
      }
      x = (0, b.jsx)(ho, {
        label: "Agrupar por",
        size: "compact",
        value: l,
        onValueChange: s,
        options: La([
          { value: "nenhum", label: "Sem agrupamento" },
          { value: "vendedor", label: "Vendedor" },
          { value: "cliente", label: "Cliente" },
        ]),
      });
    }
  } else if (e === "ranking") {
    m = Array.from(new Set(v.map((h) => h.seller)))
      .map((h) => {
        const S = v.filter((L) => L.seller === h);
        return {
          id: h,
          name: h,
          total: Zo(S, "total"),
          count: S.length,
          clients: new Set(S.map((L) => L.customerId)).size,
          target: monthlyTargets(t, reportMonth)[String(h)] ?? null,
        };
      })
      .sort((h, S) => S.total - h.total);
    p = [
      z("rank", "Posi\xE7\xE3o", (h) => (rankingReport ? (h.rank ?? pa) : m.indexOf(h) + 1)),
      z("name", "Vendedor", void 0, { primary: !0 }),
      z("total", "Vendido", (h) => rt(h.total), { align: "right" }),
      z("count", "Pedidos"),
      z("clients", "Clientes atendidos"),
      z("target", "Meta", (h) => (h.target == null ? pa : rt(Number(h.target))), {
        align: "right",
      }),
      z("hit", "Atingimento", (h) =>
        rankingReport
          ? (h.hit ?? pa)
          : Number(h.target) > 0
            ? na((100 * Number(h.total)) / Number(h.target)) + "%"
            : "N\xE3o definida",
      ),
    ];
    x = (0, b.jsxs)(xt, {
      onClick: () =>
        a({
          title: "Definir meta",
          fields: [
            {
              key: "seller",
              label: "Vendedor",
              required: !0,
              options: sellerNames(t),
            },
            {
              key: "target",
              label: "Meta para " + businessMonthLabel(reportMonth),
              kind: "currency",
              required: !0,
            },
          ],
          save: async (h) =>
            await o((S) => {
              setMonthlyTarget(S, reportMonth, String(h["seller"]), Number(h["target"]));
            }),
        }),
      children: [(0, b.jsx)(od, {}), "Definir metas"],
    });
    y = rankingReport
      ? (r.f.from || r.f.to
          ? "Pedidos padrão no período de emissão filtrado; metas locais de "
          : "Pedidos padrão e metas locais de ") +
        businessMonthLabel(reportMonth) +
        "; posição por valor, desempate por código ERP. Metas locais somente com vínculo privado inequívoco, mesmas filiais e mês completo, sem recorte de cliente. Busca não renumera posições. Definir metas mantém o cadastro local por usuário."
      : "Metas persistidas por vendedor para " + businessMonthLabel(reportMonth) + ".";
  } else if (e === "nao-compraram") {
    const h = new Set(v.filter((S) => S.date?.startsWith(reportMonth)).map((S) => S.customerId)),
      mes = reportMonth;
    {
      m = (nonBuyerReport ? [] : t["customers"])
        .filter(
          (S) =>
            !S.blocked &&
            (!r.f.seller || S.seller === r.f.seller) &&
            (!r.f.customer || S.id === r.f.customer) &&
            !h.has(S.id),
        )
        .map((S) => ({
          id: S.id,
          name: S.name,
          code: S.code,
          seller: S.seller,
          last: null,
          days: null,
          localStatus: "Sem compra no m\u00EAs " + mes,
        }));
      m.sort((S, L) => String(S.name || "").localeCompare(String(L.name || "")));
      p = [
        z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
        z("code", "C\u00F3digo"),
        z("seller", "Vendedor"),
        z("localStatus", "Situa\u00E7\u00E3o", (S) => (0, b.jsx)(qn, { value: S.localStatus })),
      ];
      y =
        "Clientes da carteira sem pedidos conclu\u00EDdos de venda no m\u00EAs selecionado (use os filtros de Emiss\u00E3o para escolher o m\u00EAs). Total: " +
        (nonBuyerReport ? (nonBuyerSummary?.customerCount ?? pa) : m.length) +
        " cliente(s).";
    }
  } else if (e === "meta-vendedor") {
    {
      m = Array.from(new Set(v.map((h) => h.seller)))
        .map((h) => {
          const S = v.filter((L) => L.seller === h);
          return {
            id: h,
            name: h,
            total: Zo(S, "total"),
            count: S.length,
            clients: new Set(S.map((L) => L.customerId)).size,
            target: monthlyTargets(t, reportMonth)[String(h)] ?? null,
          };
        })
        .sort((h, S) => S.total - h.total);
      p = [
        z("name", "Vendedor", void 0, { primary: !0 }),
        z("total", "Vendido", (h) => rt(h.total), { align: "right" }),
        z("target", "Meta", (h) => (h.target != null ? rt(h.target) : pa), {
          align: "right",
        }),
        z(
          "hit",
          "Atingido",
          (h) =>
            rankingReport
              ? (h.hit ?? pa)
              : Number(h.target) > 0
                ? na((Number(h.total) / Number(h.target)) * 100) + "%"
                : pa,
          { align: "right" },
        ),
        z("progress", "Atingimento", (h) =>
          (rankingReport ? h.progress !== null : Number(h.target) > 0)
            ? (0, b.jsx)("div", {
                style: { minWidth: 120 },
                children: (0, b.jsx)("div", {
                  style: {
                    height: 8,
                    background: "rgba(0,0,0,.08)",
                    borderRadius: 4,
                    overflow: "hidden",
                  },
                  children: (0, b.jsx)("div", {
                    style: {
                      height: 8,
                      width:
                        (rankingReport
                          ? h.progress
                          : Math.min(100, (Number(h.total) / Number(h.target)) * 100)) + "%",
                      background: (
                        rankingReport
                          ? Number(h.progress) >= 100
                          : Number(h.total) / Number(h.target) >= 1
                      )
                        ? "var(--ds-ok)"
                        : "var(--ds-accent)",
                      borderRadius: 4,
                    },
                  }),
                }),
              })
            : pa,
        ),
      ];
      C = (0, b.jsx)(cs, {
        title: "Meta x Vendido por vendedor",
        description: rankingReport
          ? "Barras = pedidos padrão no período; meta somente com vínculo e escopo comprovados"
          : "Barras = vendido no recorte \xB7 linha tracejada = meta",
        children: (0, b.jsx)(Qy, {
          label: "Meta por vendedor",
          data: rankingReport
            ? rankingChart
            : m.map((h) => ({
                vendedor: h.name,
                Vendido: h.total,
                Meta: h.target ?? 0,
              })),
          index: "vendedor",
          series: [{ key: "Vendido", label: "Vendido" }],
          format: Vd,
          height: 300,
          reference: rankingReport
            ? rankingChart.length === 1 &&
              rankingChart[0]!.target !== null &&
              Number(rankingChart[0]!.target) > 0
              ? {
                  value: salesChartCoordinate(rankingChart[0]!.target),
                  label: "Meta " + rt(rankingChart[0]!.target),
                }
              : null
            : m.length === 1 && Number(m[0]!.target) > 0
              ? { value: Number(m[0]!.target), label: "Meta " + rt(m[0]!.target) }
              : null,
        }),
      });
      y = rankingReport
        ? "Pedidos padrão no período selecionado; metas locais de " +
          businessMonthLabel(reportMonth) +
          ". Atingimento indisponível sem vínculo por código, mesmas filiais e mês completo, ou com filtro de cliente. Ausência de meta não equivale a zero."
        : "Metas definidas no relatório Ranking de vendedor / Meta para " +
          businessMonthLabel(reportMonth) +
          ".";
    }
  } else if (e === "gerencial") {
    const h: Record<string, { id: string; name: string; total: number }> = {};
    {
      if (!managementReport) {
        d.forEach((S) => {
          const L = (h[S.customerId] ||= {
            id: S.customerId,
            name: Un(t, S.customerId),
            total: 0,
          });
          L.total += Number(S.total || 0);
        });
      }
      m = Object.values(h);
      p = [
        z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
        z("total", "Valor em pedidos", (S) => rt(S.total), { align: "right" }),
      ];
      C = (0, b.jsx)(cs, {
        title: "Produtos com itens extra\xEDdos",
        children: (0, b.jsx)(RecordsTable, {
          rows: managementReport ? [] : dv(t, d),
          remote: managementProducts,
          toolbar: !1,
          columns: [
            z("name", "Produto", void 0, { primary: !0 }),
            z("qty", "Quantidade", managementReport ? (h) => h.qty ?? pa : undefined),
          ],
        }),
      });
    }
  } else {
    if (e === "funil") {
      m = filterOpportunityRows(opportunities, r.f);
      p = [
        z("name", "Oportunidade", void 0, { primary: !0 }),
        z("customer", "Cliente", (h) => Un(t, h.customerId)),
        z("value", "Valor", (h) => rt(h.value)),
        z("status", "Situa\xE7\xE3o", (h) => (0, b.jsx)(qn, { value: h.status })),
        z("seller", "Vendedor"),
        z("stage", "Etapa"),
        z("date", "Abertura", (h) => xo(h.date)),
      ];
      y = "Oportunidades persistidas no funil, conforme os filtros selecionados.";
    } else {
      if (e === "titulos") {
        m = receivablesReport ? [] : t["titles"];
        p = [
          z(
            "customer",
            "Raz\xE3o social",
            (h) => (receivablesReport ? (h.customerName ?? pa) : Un(t, h.customerId)),
            {
              primary: !0,
              wide: !0,
            },
          ),
          z("due", "Vencimento", (h) => xo(h.due)),
          z("value", "Valor do t\xEDtulo", (h) => rt(h.value), {
            align: "right",
          }),
          z("status", "Situa\xE7\xE3o", (h) => (0, b.jsx)(qn, { value: h.status })),
          z("document", "Documento"),
        ];
      } else {
        if (["clientes", "carteira", "positivacao", "abc", "mix"].includes(e)) {
          m = (abcReport || mixReport ? [] : t["customers"]).map((h) => {
            const S = d
                .filter((R) => R.customerId === h.id && R.type === "Venda")
                .sort((R, E) => String(E.date || "").localeCompare(String(R.date || ""))),
              L = S[0],
              I = L
                ? Math.floor(
                    (Date.parse(bo + "T12:00:00Z") - Date.parse(L.date + "T12:00:00Z")) / 864e5,
                  )
                : null;
            return {
              ...h,
              total: Zo(S, "total"),
              count: S.length,
              last: L?.date,
              days: I,
              localStatus:
                I == null
                  ? "Sem venda neste recorte"
                  : I >= t["config"].oldDays
                    ? "Inativo antigo"
                    : I >= t["config"].recentDays
                      ? "Inativo recente"
                      : "Ativo no recorte",
            };
          });
          p = [
            z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
            z("city", "Cidade"),
            z("state", "UF"),
          ];
          if (e === "carteira" || e === "positivacao") {
            p = [
              z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
              z("last", "\xDAltimo pedido no arquivo", (h) => xo(h.last)),
              z("days", "Dias sem comprar no recorte", (h) => h.days ?? pa),
              z("localStatus", "Situa\xE7\xE3o local", (h) =>
                (0, b.jsx)(qn, { value: h.localStatus }),
              ),
            ];
          }
          if (e === "abc") {
            p = [
              z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
              z("curve", "Curva", (h) =>
                abcReport ? (h.curve ?? "N\xE3o verificada") : "N\xE3o verificada",
              ),
              z("total", "Valor no recorte", (h) => rt(h.total), {
                align: "right",
              }),
              z("share", "Participa\xE7\xE3o no recorte", (h) =>
                abcReport
                  ? (h.share ?? "\u2014")
                  : Zo(m, "total")
                    ? na((100 * Number(h.total)) / Zo(m, "total")) + "%"
                    : "\u2014",
              ),
            ];
            y = abcReport
              ? "Curva ABC pelo critério Pareto adotado: A até 80% do valor acumulado, B até 95% e C acima, sobre a venda padrão do recorte. Não é classificação nativa do ERP."
              : "Limiares A/B/C não foram confirmados. O sistema não atribui curvas arbitrárias; apresenta valores e participação no período.";
          }
          if (e === "mix") {
            p = [
              z("name", "Raz\xE3o social", void 0, { primary: !0, wide: !0 }),
              z("qty", "Produtos diferentes com itens extra\xEDdos", (h) =>
                mixReport
                  ? (h.qty ?? pa)
                  : new Set(
                      d
                        .filter((S) => S.customerId === h.id)
                        .flatMap((S) => (S.items || []).map((L) => L.productId)),
                    ).size,
              ),
              z("total", "Valor em pedidos", (h) => rt(h.total), {
                align: "right",
              }),
            ];
            y =
              "N\xE3o foram extra\xEDdas duas s\xE9ries compar\xE1veis. A compara\xE7\xE3o de per\xEDodos n\xE3o \xE9 preenchida com n\xFAmeros sint\xE9ticos.";
          }
          if (e === "carteira" || e === "positivacao") {
            y =
              "Classifica\xE7\xE3o local calculada pelos pedidos deste arquivo, n\xE3o pela carteira completa. Refer\xEAncia: 08/10/2026; recentes a partir de 180 dias e antigos a partir de 365.";
            x = (0, b.jsx)(xt, {
              onClick: () =>
                a({
                  title: "Configurar per\xEDodo de inatividade local",
                  values: {
                    recentDays: t["config"].recentDays,
                    oldDays: t["config"].oldDays,
                  },
                  fields: [
                    {
                      key: "recentDays",
                      label: "Inativos recentes (dias)",
                      kind: "number",
                      required: !0,
                    },
                    {
                      key: "oldDays",
                      label: "Inativos antigos (dias)",
                      kind: "number",
                      required: !0,
                    },
                  ],
                  validate: (h) =>
                    Number(h["recentDays"]) < 1 || Number(h["oldDays"]) <= Number(h["recentDays"])
                      ? "O limite antigo deve ser maior que o recente."
                      : "",
                  save: async (h) => await o((S) => Object.assign(S["config"], h)),
                }),
              children: "Per\xEDodo de inatividade",
            });
          }
        } else {
          if (e === "tarefas") {
            m = filterCompletions(completions, r.f);
            p = [
              z("date", "Data de in\xEDcio", (h) => xo(h.date)),
              z(
                "customer",
                "Raz\xE3o social",
                (h) => (h.customerId ? Un(t, h.customerId) : "\u2014"),
                { primary: !0 },
              ),
              z("result", "Resultado"),
              z("name", "Descri\xE7\xE3o", void 0, { wide: !0 }),
              z("status", "Situa\xE7\xE3o", (h) => (0, b.jsx)(qn, { value: h.status })),
            ];
          } else {
            if (e === "visitas") {
              m = [];
              p = [
                z("seller", "Vendedor"),
                z("customer", "Raz\xE3o social", void 0, { primary: !0 }),
                z("checkin", "Check-in"),
                z("checkout", "Check-out"),
                z("duration", "Dura\xE7\xE3o"),
                z("status", "Status"),
              ];
              y =
                "Nenhuma visita foi extra\xEDda. A configura\xE7\xE3o de relat\xF3rio observada era 300 m (faixa 0\u20133.000 m); n\xE3o demonstra trava de GPS.";
              x = (0, b.jsx)(xt, {
                onClick: () =>
                  a({
                    title: "Dist\xE2ncia de check-in no relat\xF3rio local",
                    values: { checkinDistance: t["config"].checkinDistance },
                    fields: [
                      {
                        key: "checkinDistance",
                        label: "Dist\xE2ncia (m)",
                        kind: "number",
                        required: !0,
                      },
                    ],
                    validate: (h) =>
                      Number(h["checkinDistance"]) < 0 || Number(h["checkinDistance"]) > 3e3
                        ? "Informe entre 0 e 3.000 metros."
                        : "",
                    save: async (h) => await o((S) => Object.assign(S["config"], h)),
                  }),
                children: "Configurar dist\xE2ncia",
              });
            } else {
              if (e === "comissoes" || e === "comissoes-pedido") {
                m = e === "comissoes" ? [] : d;
                p =
                  e === "comissoes"
                    ? [
                        z("name", "Vendedor", void 0, { primary: !0 }),
                        z("value", "Comiss\xE3o", (h) => rt(h.value)),
                      ]
                    : [
                        z("date", "Emiss\xE3o", (h) => xo(h.date)),
                        z("number", "Pedido", void 0, { primary: !0 }),
                        z("customer", "Raz\xE3o social", (h) => Un(t, h.customerId), {
                          wide: !0,
                        }),
                        z("total", "Total do pedido", (h) => rt(h.total)),
                        z("commission", "Comiss\xE3o (R$)", () => pa),
                      ];
                y =
                  "Não há lançamentos de comissão disponíveis. Nenhuma regra ou valor é presumido sem configuração confirmada.";
              } else {
                if (e === "produtos") {
                  m = productReport ? [] : dv(t, d);
                  p = [
                    z("code", "C\xF3digo"),
                    z("name", "Categorias e produtos", void 0, {
                      primary: !0,
                      wide: !0,
                    }),
                    z(
                      "qty",
                      "Quantidade vendida",
                      (h) => (productReport ? (formatERPQuantity(h.qty) ?? pa) : na(h.qty ?? 0)),
                      {
                        align: "right",
                      },
                    ),
                    z("total", "Valor vendido", (h) => rt(h.total), {
                      align: "right",
                    }),
                  ];
                  C = (0, b.jsx)(cs, {
                    title: "Quantidade vendida por produto",
                    description: "Itens dos pedidos persistidos no período selecionado",
                    children: (0, b.jsx)(Zy, {
                      items: productReport
                        ? productChart
                        : m.map((h) => ({ label: h.name, value: h.qty })),
                    }),
                  });
                  y =
                    "Soma das quantidades e valores dos itens persistidos no período selecionado.";
                } else {
                  if (e === "produtos-pedido") {
                    m = itemReport
                      ? []
                      : d.flatMap((h) =>
                          (h.items || []).map((S) => ({
                            id: h.id + "-" + S.productId,
                            date: h.date,
                            number: h["number"],
                            name: Ur(t, S.productId)?.name,
                            customer: Un(t, h.customerId),
                            price: S.price,
                            qty: S.qty,
                            total: (S.price ?? 0) * S.qty,
                          })),
                        );
                    p = [
                      z("name", "Produto", void 0, { primary: !0, wide: !0 }),
                      z("date", "Emiss\xE3o", (h) => xo(h.date)),
                      z("number", "Pedido"),
                      z("customer", "Cliente"),
                      z("price", "Pre\xE7o unit\xE1rio", (h) => rt(h.price)),
                      z("qty", "Quantidade"),
                      z("total", "Subtotal", (h) => rt(h.total), {
                        align: "right",
                      }),
                    ];
                  } else {
                    if (e === "estoque") {
                      m = t["config"].stock
                        ? t["products"].map((h) => ({
                            ...h,
                            stock: h.stock ?? null,
                          }))
                        : [];
                      p = [
                        z("code", "C\xF3digo"),
                        z("name", "Produto", void 0, {
                          primary: !0,
                          wide: !0,
                        }),
                        z("stock", "Saldo local", (h) => h.stock ?? pa),
                        z(
                          "edit",
                          "Ajustar",
                          (h) =>
                            (0, b.jsx)(xt, {
                              onClick: () =>
                                a({
                                  title: "Ajustar saldo local",
                                  values: { stock: h.stock },
                                  fields: [
                                    {
                                      key: "stock",
                                      label: "Saldo",
                                      kind: "number",
                                      required: !0,
                                    },
                                  ],
                                  save: async (S) =>
                                    await o((L) =>
                                      Object.assign(Ur(L, h.id)!, S, {
                                        source: "simulado",
                                      }),
                                    ),
                                }),
                              children: "Ajustar saldo",
                            }),
                          { action: !0 },
                        ),
                      ];
                      y =
                        "Saldos disponíveis somente quando o controle de estoque está habilitado. Nenhuma sincronização com ERP está configurada.";
                    } else {
                      if (e === "emails") {
                        m = t["emails"];
                        p = [
                          z("date", "Data", (h) => xo(h.date)),
                          z("orderId", "Pedido", void 0, { primary: !0 }),
                          z("recipient", "Destinat\xE1rio"),
                          z("channel", "Canal"),
                          z("status", "Situa\xE7\xE3o"),
                        ];
                        y =
                          "Nenhum provedor de envio externo está configurado. Nenhuma mensagem é enviada por esta consulta.";
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  if (e === "carteira-vendedor" && !walletReport)
    return (0, b.jsxs)(fa, {
      width: "wide",
      children: [
        (0, b.jsx)(Ua, {
          title: n.name || "",
          back: { label: "Relat\xF3rios", to: "/relatorios" },
        }),
        (0, b.jsx)(hn, {
          icon: (0, b.jsx)(Im, {}),
          title: "Estrutura e regras ainda não confirmadas",
          hint: "A tela de origem estava protegida por plano. Colunas e cálculos não foram extraídos; isso não representa uma assinatura exigida neste sistema.",
          action: (0, b.jsx)(xt, {
            href: "#/conta/plano",
            children: "Ver plano observado",
          }),
        }),
      ],
    });
  if (receivablesReport)
    y =
      "Receitas não provisionadas TGFFIN (RECDESP=1/PROVISAO=N), dos clientes no escopo atual. Valor do título é VLRDESDOB nativo, não saldo em aberto. Situação indica apenas presença de DHBAIXA: não comprova quitação integral, atraso ou valor pago. Período por vencimento DTVENC, sem fallback; documentos não são somados às vendas. Somente leitura.";
  if (commissionReport) {
    m = [];
    C = null;
    x = null;
    p =
      e === "comissoes"
        ? [
            z("name", "Vendedor", void 0, { primary: true }),
            z("value", "Comissão", (h) => rt(h.value)),
          ]
        : [
            z("date", "Emissão", (h) => xo(h.date)),
            z("number", "Pedido", void 0, { primary: true }),
            z("customer", "Razão social", (h) => h.customerName, { wide: true }),
            z("total", "Total do pedido", (h) => rt(h.total)),
            z("commission", "Comissão (R$)", (h) => rt(h.commission)),
          ];
    y =
      "Comissões nativas TGFCOM.VLRCOM da venda padrão e de suas notas qualificadas, pelo código do beneficiário. Não é o total geral do livro de comissões. Período: emissão da origem da comissão; não é referência, fechamento nem pagamento. Nenhum percentual é aplicado.";
    if (e === "comissoes-pedido")
      y +=
        " Um pedido só é identificado por vínculo inequívoco com a venda padrão. Notas qualificadas com mais de um pedido permanecem como Não atribuído, sem rateio ou total de pedido presumido.";
    if (commissionSummary)
      y +=
        " Lançamentos no recorte: " +
        na(commissionSummary.entryCount) +
        "; sem vínculo inequívoco a pedido padrão: " +
        na(commissionSummary.unassignedEntryCount) +
        ".";
  }
  if (stockReport) {
    m = [];
    C = null;
    x = null;
    p = [
      z("code", "Código"),
      z("name", "Produto", void 0, { primary: true, wide: true }),
      z("companyCode", "Empresa"),
      z("localCode", "Local"),
      z("control", "Controle"),
      z("partnerCode", "Parceiro"),
      z("stockType", "Tipo ERP"),
      z("unit", "Unidade"),
      z("stock", "Estoque registrado"),
      z("reserved", "Reservado"),
    ];
    y =
      "Estoque registrado no Sankhya por empresa, produto, local, controle, parceiro e tipo. Somente leitura; sem somar contextos ou unidades. Disponibilidade não confirmada: nenhum saldo é calculado por subtração.";
  }
  if (walletReport) {
    m = [];
    C = null;
    p =
      e === "carteira-vendedor"
        ? [
            z("code", "Código"),
            z("name", "Vendedor", void 0, { primary: true }),
            z("walletCount", "Carteira ativa"),
            z("buyerCount", "Compradores no mês"),
            z("nonBuyerCount", "Sem compra no mês"),
          ]
        : [
            z("code", "Código"),
            z("name", "Razão social", void 0, { primary: true, wide: true }),
            z("seller", "Vendedor"),
            z("localStatus", "Situação"),
          ];
    y =
      "Carteira atual ATIVO=S; compradores da venda padrão no mês " +
      reportMonth +
      ". Clientes compartilhados entre filiais são contados uma vez. Os totais abaixo respeitam cliente/vendedor e antecedem a busca textual.";
    if (walletSummary)
      y +=
        " Carteira ativa: " +
        na(walletSummary.walletCount) +
        "; compradores: " +
        na(walletSummary.buyerCount) +
        "; sem compra: " +
        na(walletSummary.nonBuyerCount) +
        "; positivação: " +
        (formatERPShare(String(walletSummary.buyerCount), String(walletSummary.walletCount)) ??
          "—") +
        ".";
    x = (0, b.jsx)(ho, {
      label: "Mês de compra",
      size: "compact",
      value: reportMonth,
      options: monthOptions(t["orders"]),
      onValueChange: (month: string) => r.setF({ ...r.f, from: month + "-01", to: "" }),
    });
  }
  if (customerReport) m = localCustomerReportRows(t["customers"], r.f);
  if (commercialReport || itemReport) m = [];
  const g = p.filter((h) => !c.includes(h.key));
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: n.name,
        description: rankingReport
          ? "Pedidos padrão no Sankhya e metas locais, sem vínculo por nome"
          : receivablesReport
            ? "Recebíveis nativos no Sankhya, sem geração ou baixa financeira"
            : billedOrdersReport
              ? "Pedidos padrão com notas fiscais aprovadas, inclusive faturamento parcial"
              : commissionReport
                ? "Consulta à comissão nativa no Sankhya, sem comprovação de pagamento"
                : stockReport
                  ? "Consulta ao estoque registrado no Sankhya"
                  : walletReport
                    ? "Consulta à carteira atual no Sankhya"
                    : "Consulta aos dados persistidos, conforme os filtros selecionados",
        back: { label: "Relat\xF3rios", to: "/relatorios" },
        actions: (0, b.jsx)(Gp, {
          rows: csvRows(
            m,
            p.filter((h) => !h.action),
          ),
          name: "relatorio-" + e,
          localRows: localRecordReport ? completionExport : undefined,
          remoteResource: remote?.resource,
          transformRows:
            remote || localRecordReport
              ? (rows: ERPRow[]) =>
                  csvRows(
                    rows,
                    p.filter((h) => !h.action),
                  )
              : undefined,
          columns: p.filter((h) => !h.action).map((h) => h.key),
        }),
      }),
      (0, b.jsx)(Xt, { children: y }),
      ["resumo", "vendas", "ranking", "faturados", "faturamento"].includes(e) &&
        (0, b.jsxs)(_i, {
          cols: 3,
          children: [
            (0, b.jsx)(Ha, {
              label: billingReport ? "Notas no recorte filtrado" : "Pedidos no recorte filtrado",
              value: commercialReport
                ? (salesSummary?.documentCount ??
                  (tableStatus.loading
                    ? (0, b.jsx)(LoadingSpinner, { size: "md", label: "Carregando" })
                    : pa))
                : d.length,
            }),
            (0, b.jsx)(Ha, {
              label: billingReport ? "Valor faturado" : "Valor em pedidos",
              value: commercialReport
                ? salesSummary || !tableStatus.loading
                  ? rt(salesSummary?.documentAmount)
                  : (0, b.jsx)(LoadingSpinner, { size: "md", label: "Carregando" })
                : rt(Zo(d, "total")),
            }),
            (0, b.jsx)(Ha, {
              label: billingReport ? "Ticket médio em notas" : "Ticket m\xE9dio em pedidos",
              value: commercialReport
                ? salesSummary
                  ? (formatERPAmount(salesSummary.documentAmount, salesSummary.documentCount) ??
                    (salesSummary.documentCount === 0 ? "\u2014" : pa))
                  : tableStatus.loading
                    ? (0, b.jsx)(LoadingSpinner, { size: "md", label: "Carregando" })
                    : pa
                : d.length
                  ? rt(Zo(d, "total") / d.length)
                  : "\u2014",
            }),
          ],
        }),
      C,
      (0, b.jsx)(RecordsTable, {
        rows: m,
        remote,
        onStatus: setTableStatus,
        exportRef: localRecordReport ? completionExport : undefined,
        label: n.name,
        columns: g,
        actions: (0, b.jsxs)(b.Fragment, {
          children: [
            (0, b.jsxs)(xt, {
              disabled: stockReport,
              disabledReason: stockReport
                ? "Estoque por contexto: use a busca por código ou descrição do produto e a ordenação das colunas."
                : undefined,
              onClick: () => r.setOpen(!0),
              children: [(0, b.jsx)(ed, {}), "Filtros"],
            }),
            (0, b.jsxs)(xt, {
              onClick: () => u(!0),
              children: [(0, b.jsx)(Xl, {}), "Colunas"],
            }),
            x,
          ],
        }),
      }),
      (0, b.jsx)(E5, {
        filter: r,
        rows: receivablesReport
          ? ["Sem baixa registrada", "Baixa registrada"].map((status) => ({ status }))
          : completionReport
            ? completions
            : opportunityReport
              ? opportunities
              : commercialReport ||
                  itemReport ||
                  productReport ||
                  managementReport ||
                  nonBuyerReport ||
                  walletReport
                ? [{ status: "confirmado" }]
                : customerReport
                  ? ["S", "N"].map((status) => ({ status }))
                  : t["orders"],
        customerReport,
        receivablesReport,
        salesReport:
          commercialReport ||
          itemReport ||
          productReport ||
          managementReport ||
          nonBuyerReport ||
          walletReport,
        billingReport,
        localOwners: completionReport
          ? completionOwners(completions, t["users"])
          : opportunityReport
            ? opportunityReportOwners(opportunities, t["users"])
            : undefined,
      }),
      (0, b.jsx)(gb, {
        open: i,
        onClose: () => u(!1),
        title: "Colunas do relat\xF3rio",
        description: "Escolha as colunas desta simula\xE7\xE3o",
        children: (0, b.jsx)("div", {
          className: "space-y-3",
          children: p
            .filter((h) => !h.action)
            .map((h) =>
              (0, b.jsx)(
                zu,
                {
                  label: String(h.header),
                  checked: !c.includes(h.key),
                  onCheckedChange: (S: boolean) =>
                    f(
                      S
                        ? c.filter((L) => L !== h.key)
                        : c.length < p.length - 1
                          ? [...c, h.key]
                          : c,
                    ),
                },
                h.key,
              ),
            ),
        }),
      }),
    ],
  });
}
const yz: Record<string, { id: string; label: string; description?: string | undefined }[]> = {
  pedidos: [
    {
      id: "campos",
      label: "Campos extras",
      description:
        "Quatro campos observados; data_entrega e Tipo de Agenda s\xE3o obrigat\xF3rios.",
    },
    {
      id: "status",
      label: "Status de pedido",
      description: "R\xF3tulos de integra\xE7\xE3o e libera\xE7\xE3o observados.",
    },
    {
      id: "tipos",
      label: "Tipo de pedido",
      description:
        "Venda \xE9 o tipo padr\xE3o. Tipos personalizados n\xE3o geram positiva\xE7\xE3o, meta ou comiss\xE3o segundo a interface.",
    },
    {
      id: "geral",
      label: "Geral",
      description: "Regras de emiss\xE3o online, B2B e aplicativos.",
    },
  ],
  clientes: [
    { id: "campos", label: "Campos extras" },
    { id: "tags", label: "Tags" },
    { id: "segmentos", label: "Segmentos" },
    { id: "redes", label: "Redes" },
    { id: "fiscais", label: "Exce\xE7\xF5es fiscais" },
    { id: "resultados", label: "Resultados dos atendimentos" },
    { id: "bloqueios", label: "Motivos de bloqueio" },
    { id: "geral", label: "Geral" },
  ],
  produtos: [
    { id: "categorias", label: "Categorias" },
    { id: "variacoes", label: "Varia\xE7\xF5es de produto" },
    { id: "tributacoes", label: "Tributa\xE7\xF5es" },
  ],
  crm: [
    {
      id: "funis",
      label: "Gerenciar funis",
      description: "Vendas SulBR: no m\xE1ximo um funil ativo; no m\xEDnimo duas etapas.",
    },
    { id: "perda", label: "Motivos de perda" },
    { id: "etiquetas", label: "Etiquetas" },
  ],
};
function Cz({ area: e, section: t }: { area: string; section: string }) {
  const { db: a, update: o, editor: n, confirm: r } = useSulContext(),
    [l, s] = (0, He.useState)(
      a["stages"].join(`
`),
    ),
    i = yz[e] || [],
    u = i.find((p) => p.id === t);
  if (e === "produtos") return (0, b.jsx)(ProductsPage, {});
  if (!u) return (0, b.jsx)(Wu, {});
  const c = (
      {
        pedidos: "Pedidos",
        clientes: "Clientes",
        produtos: "Produtos",
        crm: "CRM",
      } as Record<string, string>
    )[e],
    f: string = e + "/" + t,
    d = a["collections"][f] || [],
    m = () =>
      n({
        title: "Adicionar " + u.label.toLowerCase(),
        allocateIdentity: true,
        fields: [
          { key: "name", label: "Nome / descri\xE7\xE3o", required: !0 },
          ...(t === "campos"
            ? [
                {
                  key: "kind",
                  label: "Tipo de campo",
                  options: ["Livre", "Data", "Num\xE9rico", "Lista"],
                  required: !0,
                },
              ]
            : []),
        ],
        save: async (p) =>
          await o((y) => {
            (y["collections"][f] ||= []).push({
              ...p,
              id: p["id"]!,
              source: "simulado",
            });
          }),
      });
  return (0, b.jsx)(fa, {
    width: "wide",
    children: (0, b.jsx)(uv, {
      heading: "Configura\xE7\xF5es de " + c,
      headingDescription: "Estruturas observadas \xB7 altera\xE7\xF5es locais",
      nav: i.map((p) => ({
        href: "#/config/" + e + "/" + p.id,
        label: p.label,
        icon: ad,
      })),
      current: "#/config/" + f,
      title: u.label,
      description: u.description || "A lista original estava vazia no recorte consultado.",
      actions:
        t !== "geral" && t !== "funis"
          ? (0, b.jsxs)(Ft, {
              onClick: m,
              children: [(0, b.jsx)(Sa, {}), "Adicionar registro"],
            })
          : (0, b.jsx)(oz, { to: e === "crm" ? "/oportunidades" : "/" + e }),
      children:
        t === "geral"
          ? (0, b.jsx)("div", {
              className: "space-y-6",
              children:
                e === "pedidos"
                  ? (0, b.jsxs)(b.Fragment, {
                      children: [
                        (0, b.jsx)(nf, {
                          title: "Pre\xE7o zero",
                          description: "Restri\xE7\xE3o marcada na interface observada.",
                          children: (0, b.jsx)(zu, {
                            label: "Impedir produtos com pre\xE7o zero",
                            checked: a["config"].zeroPriceBlocked,
                            onCheckedChange: async (p: boolean) =>
                              await o((y) => {
                                y["config"].zeroPriceBlocked = p;
                              }),
                          }),
                        }),
                        (0, b.jsx)(nf, {
                          title: "Frete e entrega",
                          description: "Obrigatoriedade sem marca\xE7\xE3o no recorte original.",
                          children: (0, b.jsx)(zu, {
                            label: "Frete obrigat\xF3rio no prot\xF3tipo",
                            checked: a["config"].freightRequired,
                            onCheckedChange: async (p: boolean) =>
                              await o((y) => {
                                y["config"].freightRequired = p;
                              }),
                          }),
                        }),
                        (0, b.jsx)(Gu, {
                          title: "Duplicidade de itens",
                          children:
                            "A interface original oferecia permitir ou impedir itens duplicados, mas a op\xE7\xE3o ativa n\xE3o foi confirmada. No prot\xF3tipo, ajuste a quantidade de um item j\xE1 adicionado.",
                        }),
                      ],
                    })
                  : (0, b.jsxs)(b.Fragment, {
                      children: [
                        (0, b.jsx)(nf, {
                          title: "Documento duplicado",
                          description: "Bloqueio marcado na interface.",
                          children: (0, b.jsx)(zu, {
                            label: "Bloquear CPF/CNPJ duplicado",
                            checked: a["config"].duplicateDocument,
                            onCheckedChange: async (p: boolean) =>
                              await o((y) => {
                                y["config"].duplicateDocument = p;
                              }),
                          }),
                        }),
                        (0, b.jsx)(nf, {
                          title: "Campos obrigat\xF3rios",
                          description: "Raz\xE3o social e fantasia eram obrigat\xF3rias.",
                          children: (0, b.jsx)(_o, {
                            items: [
                              {
                                label: "Raz\xE3o social / Nome",
                                value: "Obrigat\xF3rio",
                              },
                              {
                                label: "Fantasia / Apelido",
                                value: "Obrigat\xF3rio",
                              },
                              {
                                label: "Inativos recentes",
                                value: a["config"].recentDays + " dias",
                              },
                              {
                                label: "Inativos antigos",
                                value: a["config"].oldDays + " dias",
                              },
                            ],
                          }),
                        }),
                      ],
                    }),
            })
          : t === "funis"
            ? (0, b.jsx)(Vt, {
                children: (0, b.jsxs)(Ot, {
                  title: "Vendas SulBR",
                  children: [
                    (0, b.jsx)(Xt, {
                      children: "Todos os vendedores \xB7 limite observado: 1 funil ativo.",
                    }),
                    (0, b.jsx)("div", {
                      className: "my-5",
                      children: (0, b.jsx)($u, {
                        label: "Etapas do funil (uma por linha)",
                        value: l,
                        onChange: s,
                        minRows: 5,
                      }),
                    }),
                    (0, b.jsx)(Ft, {
                      onClick: async () => {
                        const p = l
                          .split(
                            `
`,
                          )
                          .map((y) => y.trim())
                          .filter((value): value is NonNullable<typeof value> => !!value);
                        if (p.length < 2 || new Set(p).size !== p.length) {
                          go("Informe pelo menos duas etapas diferentes", void 0, "bad");
                          return;
                        }
                        if (a["opportunities"].some((y) => !p.includes(y.stage || ""))) {
                          go("Mova os cart\xF5es antes de remover uma etapa usada", void 0, "bad");
                          return;
                        }
                        {
                          await o((y) => {
                            y["stages"] = p;
                          });
                          go("Etapas alteradas no sistema");
                        }
                      },
                      children: "Salvar funil local",
                    }),
                  ],
                }),
              })
            : (0, b.jsxs)(b.Fragment, {
                children: [
                  (0, b.jsx)(RecordsTable, {
                    rows: d,
                    columns: [
                      z("name", "Nome / descri\xE7\xE3o", void 0, {
                        primary: !0,
                        wide: !0,
                      }),
                      ...(t === "campos" || t === "tipos" ? [z("kind", "Tipo")] : []),
                      ...(t === "campos"
                        ? [z("required", "Obrigat\xF3rio", (p) => (p.required ? "Sim" : "N\xE3o"))]
                        : []),
                      z("source", "Origem", (p) => (0, b.jsx)(qr, { row: p })),
                      z(
                        "actions",
                        "A\xE7\xF5es",
                        (p) =>
                          (0, b.jsx)(Il, {
                            label: "Op\xE7\xF5es do registro",
                            actions: [
                              {
                                label: "Alterar no sistema",
                                onSelect: () =>
                                  n({
                                    title: "Alterar registro local",
                                    values: p,
                                    fields: [
                                      {
                                        key: "name",
                                        label: "Nome",
                                        required: !0,
                                      },
                                    ],
                                    save: async (y) =>
                                      await o((C) =>
                                        Object.assign(
                                          C["collections"][f]!.find((x) => x.id === p.id)!,
                                          y,
                                          { source: "simulado" },
                                        ),
                                      ),
                                  }),
                              },
                              {
                                label: "Excluir registro local",
                                tone: "danger",
                                onSelect: () =>
                                  r(
                                    "Excluir registro no sistema?",
                                    async () =>
                                      await o((y) => {
                                        y["collections"][f] = (y["collections"][f] || []).filter(
                                          (C) => C.id !== p.id,
                                        );
                                      }),
                                  ),
                              },
                            ],
                          }),
                        { action: !0 },
                      ),
                    ],
                  }),
                  e === "produtos" &&
                    t === "categorias" &&
                    (0, b.jsx)(Xt, {
                      children:
                        "Havia seis categorias no cat\xE1logo original. S\xF3 o nome 500ML COM GAS foi extra\xEDdo como categoria expl\xEDcita; as demais n\xE3o foram inventadas.",
                    }),
                  e === "produtos" &&
                    t === "tributacoes" &&
                    (0, b.jsx)(Xt, {
                      children:
                        "N\xE3o havia regras de ICMS-ST no recorte. Foram observadas orienta\xE7\xF5es de NCM, UF de destino e m\xE9todos MVA/PMC; nenhuma al\xEDquota foi reproduzida.",
                    }),
                ],
              }),
    }),
  });
}
const C5 = [
  { id: "perfil", label: "Meu perfil", icon: Wl },
  { id: "usuarios", label: "Todos os usu\xE1rios", icon: Wl },
  { id: "logs", label: "Logs", icon: $s },
  { id: "empresa", label: "Minha empresa", icon: qs },
  { id: "frete", label: "Op\xE7\xF5es de frete", icon: nd },
];
function Sz({ section: e = "perfil" }: { section?: string | undefined }) {
  const { db: t, editor: a, update: o, onSignOut } = useSulContext(),
    n = C5.find((s) => s.id === e);
  if (!n) return (0, b.jsx)(Wu, {});
  let r: React.ReactNode,
    l: React.ReactNode = null;
  if (e === "perfil")
    r = (0, b.jsxs)(Vt, {
      children: [
        (0, b.jsx)(_o, {
          items: [
            { label: "Nome", value: t["company"].user },
            { label: "Papel", value: t["company"].role },
            { label: "E-mail", value: t["company"].email || pa },
            { label: "Empresa", value: t["company"].name },
            { label: "ID da empresa", value: t["company"].id },
          ],
        }),
        (0, b.jsx)("div", {
          className: "mt-5",
          children: (0, b.jsxs)(Ft, {
            onClick: () =>
              a({
                title: "Alterar meus dados no sistema",
                values: { user: t["company"].user, email: t["company"].email || "" },
                fields: [
                  { key: "user", label: "Nome", required: !0 },
                  { key: "email", label: "E-mail" },
                ],
                save: async (s) => await o((i) => Object.assign(i["company"], s)),
              }),
            children: [(0, b.jsx)(tl, {}), "Alterar meus dados"],
          }),
        }),
        (0, b.jsx)(xt, {
          onClick: () =>
            onSignOut().catch((error: unknown) =>
              go(error instanceof Error ? error.message : "Não foi possível sair."),
            ),
          children: "Sair",
        }),
      ],
    });
  else if (e === "empresa")
    r = (0, b.jsxs)(Vt, {
      children: [
        (0, b.jsx)(_o, {
          items: [
            { label: "Empresa", value: t["company"].name },
            { label: "Fantasia", value: "Sulbr" },
            { label: "CNPJ", value: t["company"]["cnpj"] || pa },
            {
              label: "Integra\xE7\xE3o rotulada",
              value: t["company"].integration,
            },
            { label: "ERP de retaguarda", value: "N\xE3o confirmado" },
          ],
        }),
        (0, b.jsx)("div", {
          className: "mt-5",
          children: (0, b.jsx)(Ft, {
            onClick: () =>
              a({
                title: "Alterar empresa no sistema",
                values: { name: t["company"].name, cnpj: t["company"]["cnpj"] || "" },
                fields: [
                  { key: "name", label: "Nome da empresa", required: !0 },
                  { key: "cnpj", label: "CNPJ" },
                ],
                save: async (s) => await o((i) => Object.assign(i["company"], s)),
              }),
            children: "Alterar empresa local",
          }),
        }),
      ],
    });
  else if (e === "plano")
    r = (0, b.jsxs)(b.Fragment, {
      children: [
        (0, b.jsxs)(_i, {
          cols: 3,
          children: [
            (0, b.jsx)(Ha, { label: "Plano observado", value: "Ouro" }),
            (0, b.jsx)(Ha, { label: "Cr\xE9ditos IA gratuitos", value: "100" }),
            (0, b.jsx)(Ha, { label: "Saldo observado", value: "100" }),
          ],
        }),
        (0, b.jsx)(Vt, {
          children: (0, b.jsx)(Ot, {
            title: "Plano e conta",
            children: (0, b.jsx)(_o, {
              items: [
                {
                  label: "Suporte",
                  value: "Chat dispon\xEDvel na origem; n\xE3o acionado",
                },
                {
                  label: "Boletos e notas fiscais",
                  value: "A\xE7\xF5es observadas; valores n\xE3o reproduzidos",
                },
                { label: "Funis ativos", value: "Limite observado: 1" },
                {
                  label: "Carteira por vendedor",
                  value: "Indispon\xEDvel no plano",
                },
                {
                  label: "Planos p\xFAblicos do fornecedor",
                  value: "N\xE3o foi confirmada equival\xEAncia com Ouro",
                },
              ],
            }),
          }),
        }),
      ],
    });
  else if (e === "creditos")
    r = (0, b.jsxs)(b.Fragment, {
      children: [
        (0, b.jsxs)(_i, {
          cols: 3,
          children: [
            (0, b.jsx)(Ha, { label: "Cr\xE9ditos gratuitos", value: "100" }),
            (0, b.jsx)(Ha, {
              label: "Consumidos no recorte observado",
              value: "0",
            }),
            (0, b.jsx)(Ha, { label: "Saldo observado", value: "100" }),
          ],
        }),
        (0, b.jsx)(Xt, {
          children:
            "Per\xEDodo observado: outubro de 2026. As respostas locais n\xE3o consomem cr\xE9ditos reais.",
        }),
        (0, b.jsx)(RecordsTable, {
          rows: [
            {
              id: "G4",
              name: "G4",
              credits: 100,
              consumed: 0,
              source: "observado",
            },
          ],
          columns: [
            z("name", "Usu\xE1rio", void 0, { primary: !0 }),
            z("credits", "Gratuitos"),
            z("consumed", "Consumidos"),
            z("mcp", "MCP", () => "Categoria observada; conex\xE3o n\xE3o confirmada"),
          ],
        }),
      ],
    });
  else if (e === "email")
    r = (0, b.jsx)(Vt, {
      children: (0, b.jsxs)(Ot, {
        title: "Envio de e-mail",
        children: [
          (0, b.jsx)(_o, {
            items: [
              {
                label: "Op\xE7\xF5es observadas",
                value: "E-mail padr\xE3o ou servidor pr\xF3prio",
              },
              {
                label: "Campos do servidor",
                value: "E-mail, servidor, porta e TLS",
              },
              { label: "Credenciais", value: "N\xE3o lidas nem reproduzidas" },
            ],
          }),
          (0, b.jsx)("div", {
            className: "mt-5",
            children: (0, b.jsx)(Ft, {
              disabled: !0,
              disabledReason: "Este arquivo n\xE3o conecta a SMTP nem envia e-mails",
              children: "Configurar envio real",
            }),
          }),
          (0, b.jsx)(Xt, {
            children:
              "Voc\xEA pode simular mensagens na ficha de um pedido. Elas ficam apenas no hist\xF3rico local.",
          }),
        ],
      }),
    });
  else if (e === "apps")
    r = (0, b.jsx)(Vt, {
      children: (0, b.jsxs)(Ot, {
        title: "Sincroniza\xE7\xE3o de aplicativos",
        children: [
          (0, b.jsx)(ho, {
            label: "Periodicidade local",
            value: t["config"]["sync"] || "",
            onValueChange: async (s: string) =>
              await o((i) => {
                i["config"]["sync"] = s;
              }),
            options: La([
              { value: "", label: "Sele\xE7\xE3o original n\xE3o extra\xEDda" },
              "Di\xE1ria",
              "Semanal",
              "Quinzenal",
              "Mensal",
            ]),
          }),
          (0, b.jsx)(Xt, {
            children:
              "A orienta\xE7\xE3o original pede sincroniza\xE7\xE3o na primeira conex\xE3o di\xE1ria. O prot\xF3tipo n\xE3o emula aplicativo m\xF3vel ou sincroniza\xE7\xE3o de ERP.",
          }),
        ],
      }),
    });
  else if (e === "frete")
    r = (0, b.jsxs)(b.Fragment, {
      children: [
        (0, b.jsx)(Vt, {
          children: (0, b.jsxs)(Ot, {
            title: "Regras manuais",
            children: [
              (0, b.jsx)(qn, {
                value: t["config"]["manualFreight"]
                  ? "Ativo na simula\xE7\xE3o"
                  : "Inativo na origem",
              }),
              (0, b.jsx)("div", {
                className: "mt-4",
                children: (0, b.jsx)(zu, {
                  label: "Ativar regras manuais no sistema",
                  checked: !!t["config"]["manualFreight"],
                  onCheckedChange: async (s: boolean) =>
                    await o((i) => {
                      i["config"]["manualFreight"] = s;
                    }),
                }),
              }),
            ],
          }),
        }),
        (0, b.jsx)(Vt, {
          children: (0, b.jsxs)(Ot, {
            title: "FRENET",
            children: [
              (0, b.jsx)(qn, { value: "Inativo na origem" }),
              (0, b.jsx)(Xt, {
                children: "Nenhuma credencial, cota\xE7\xE3o ou chamada externa \xE9 utilizada.",
              }),
            ],
          }),
        }),
      ],
    });
  else if (e === "rentabilidade")
    r = (0, b.jsx)(Vt, {
      children: (0, b.jsxs)(Ot, {
        title: "Pre\xE7o m\xEDnimo do produto",
        children: [
          (0, b.jsx)(_o, {
            items: [
              {
                label: "Refer\xEAncia permitida",
                value: "Pre\xE7o m\xEDnimo unit\xE1rio",
              },
              {
                label: "Faixas observadas",
                value: "\xD3timo / Bom / Regular / Ruim",
              },
              { label: "Valores das faixas", value: pa },
            ],
          }),
          (0, b.jsx)(Xt, {
            children:
              "N\xE3o h\xE1 percentuais reconstru\xEDdos nem ajustes autom\xE1ticos de pre\xE7o neste arquivo.",
          }),
        ],
      }),
    });
  else if (e === "pay") r = (0, b.jsx)(D5, { type: "pay" });
  else if (e === "pagamento") {
    r = (0, b.jsx)(RecordsTable, {
      rows: t["payments"].map((s, i) => ({
        id: String(i),
        name: s,
        source: "observado",
      })),
      columns: [
        z("name", "Condi\xE7\xE3o de pagamento", void 0, {
          primary: !0,
          wide: !0,
        }),
        z("min", "Valor m\xEDnimo", () => pa),
      ],
    });
    l = (0, b.jsxs)(Ft, {
      onClick: () =>
        a({
          title: "Nova condi\xE7\xE3o local",
          fields: [{ key: "name", label: "Descri\xE7\xE3o", required: !0 }],
          save: async (s) =>
            await o((i) => {
              {
                if (!i["payments"].includes(String(s["name"] || ""))) {
                  i["payments"].push(String(s["name"] || ""));
                }
              }
            }),
        }),
      children: [(0, b.jsx)(Sa, {}), "Nova condi\xE7\xE3o"],
    });
  } else if (e === "logs" || e === "atividades")
    r = (0, b.jsx)(RecordsTable, {
      rows: t["logs"],
      columns: [
        z("date", "Data", (s) => xo(s.date)),
        z("name", "Opera\xE7\xE3o local", void 0, { primary: !0, wide: !0 }),
        z("user", "Usu\xE1rio"),
        z("source", "Origem", (s) => (0, b.jsx)(qr, { row: s })),
      ],
      empty: "Nenhum evento local registrado",
    });
  else {
    const sections: Record<string, "users" | "teams" | "carriers" | "policy"> = {
      usuarios: "users",
      equipes: "teams",
      transportadoras: "carriers",
      politicas: "policy",
    };
    const s = sections[String(e)]!,
      i = t[s] || [];
    {
      r = (0, b.jsx)(RecordsTable, {
        rows: i,
        columns: [
          z("name", "Nome / descri\xE7\xE3o", void 0, { primary: !0, wide: !0 }),
          ...(e === "usuarios" ? [z("role", "Papel")] : []),
          z("source", "Origem", (u) => (0, b.jsx)(qr, { row: u })),
        ],
      });
      l = (0, b.jsxs)(Ft, {
        onClick: () =>
          e === "usuarios"
            ? openUserBindingEditor(a, o)
            : a({
                title: "Adicionar registro local",
                allocateIdentity: true,
                fields: [{ key: "name", label: "Nome / descri\xE7\xE3o", required: !0 }],
                save: async (u) =>
                  await o((c) =>
                    c[s].push({
                      ...u,
                      id: u["id"]!,
                      source: "simulado",
                    }),
                  ),
              }),
        children: [(0, b.jsx)(Sa, {}), "Adicionar registro"],
      });
      if (e === "transportadoras") {
        r = (0, b.jsxs)(b.Fragment, {
          children: [
            r,
            (0, b.jsx)(Xt, {
              children:
                "Uma transportadora foi observada na origem, mas seu cadastro n\xE3o foi extra\xEDdo para este prot\xF3tipo.",
            }),
          ],
        });
      }
    }
  }
  return (0, b.jsx)(fa, {
    width: "wide",
    children: (0, b.jsx)(uv, {
      heading: "Minha conta",
      headingDescription: "G4 / Administrador \xB7 ambiente Sulbr",
      nav: C5.map((s) => ({
        href: "#/conta/" + s.id,
        label: s.label,
        icon: s.icon,
      })),
      current: "#/conta/" + e,
      title: n.label,
      actions: l,
      children: r,
    }),
  });
}
function D5({ type: e = "portal" }: { type?: string | undefined }) {
  const { db: t, update: a, editor: o } = useSulContext(),
    n = t["config"][e];
  return (0, b.jsxs)("div", {
    className: "space-y-5",
    children: [
      (0, b.jsx)(Vt, {
        children: (0, b.jsxs)(Ot, {
          title: e === "portal" ? "Portal do cliente e e-commerce B2B" : "Sul Pay",
          children: [
            (0, b.jsx)(_o, {
              items: [
                {
                  label: "Estado na inspe\xE7\xE3o",
                  value: "Tela de cria\xE7\xE3o / ativa\xE7\xE3o",
                },
                {
                  label: "Estado no arquivo",
                  value: n ? "Ativa\xE7\xE3o simulada" : "N\xE3o ativado",
                },
                { label: "Conex\xE3o com o sistema real", value: "Nenhuma" },
                {
                  label: "Recursos apresentados",
                  value:
                    e === "portal"
                      ? "Hist\xF3rico de compras, boletos, notas fiscais e atendimento"
                      : "Pix, boleto, cart\xE3o, links e checkout",
                },
              ],
            }),
            (0, b.jsx)("div", {
              className: "mt-5",
              children: (0, b.jsx)(Ft, {
                disabled: true,
                disabledReason: "Provedor não configurado",
                onClick: () =>
                  o({
                    title:
                      (e === "portal" ? "Criar portal" : "Ativar Sul Pay") +
                      " \u2014 simula\xE7\xE3o",
                    values: { name: t["company"].name },
                    fields: [
                      {
                        key: "name",
                        label: e === "portal" ? "Nome do portal" : "Nome da empresa",
                        required: !0,
                      },
                    ],
                    save: async (r) =>
                      await a((l) => {
                        {
                          l["config"][e] = !0;
                          l["config"][e + "Name"] = r["name"];
                        }
                      }),
                  }),
                children: n
                  ? "Alterar configura\xE7\xE3o local"
                  : e === "portal"
                    ? "Criar portal local"
                    : "Ativar no sistema",
              }),
            }),
          ],
        }),
      }),
      n &&
        (0, b.jsx)(Gu, {
          tone: "ok",
          title: "Ativa\xE7\xE3o apenas simulada",
          children:
            "Nenhum canal p\xFAblico, servi\xE7o financeiro ou pagamento foi ativado. O cliente n\xE3o recebe comunica\xE7\xE3o.",
        }),
      e === "portal" &&
        n &&
        (0, b.jsx)(Ot, {
          title: "Pedidos dispon\xEDveis no arquivo",
          children: (0, b.jsx)(RecordsTable, {
            rows: t["orders"].slice(0, 5),
            toolbar: !1,
            columns: jp(t),
            onRowClick: (r: ViewRow) => bn("/pedidos/" + r.id),
          }),
        }),
    ],
  });
}
function Rz() {
  return (0, b.jsxs)(fa, {
    width: "wide",
    children: [
      (0, b.jsx)(Ua, {
        title: "Portal e e-commerce",
        description:
          "A tela global original oferecia criar o portal. Uma ficha de cliente mostrava Portal liberado; isso n\xE3o comprovava publica\xE7\xE3o.",
      }),
      (0, b.jsx)(D5, {}),
    ],
  });
}
function AIPage() {
  const { db: e, online } = useSulContext(),
    [a, o] = (0, He.useState)(""),
    [n, r] = (0, He.useState)(false);
  const [chats, setChats] = React.useState<Chat[]>(e["chats"] ?? []);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const l = async (s: string) => {
    if (!s.trim() || n) return;
    if (!online?.ai) {
      go("Sul IA indisponível nesta sessão.");
      return;
    }
    r(true);
    try {
      const history: { role: "user" | "assistant"; content: string }[] = chats
        .filter((chat) => chat.source === "observado" && chat.model)
        .slice(-4)
        .flatMap((chat) => [
          { role: "user", content: chat.question.slice(0, 2000) },
          { role: "assistant", content: chat.answer.slice(0, 4000) },
        ]);
      const response = await online.ai({ message: s.trim(), history });
      if (!alive.current) return;
      setChats((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          question: s.trim(),
          answer: response.answer,
          date: response.readAt.slice(0, 10),
          source: "observado",
          model: response.model,
        },
      ]);
      if (alive.current) o("");
    } catch (error) {
      if (alive.current)
        go(error instanceof Error ? error.message : "Não foi possível consultar a Sul IA.");
    } finally {
      if (alive.current) r(false);
    }
  };
  return (0, b.jsxs)(fa, {
    width: "reading",
    children: [
      (0, b.jsx)(Ua, {
        title: "Sul IA",
        description: "Consultas e análises com IA · dados autorizados do Sankhya · somente leitura",
      }),
      (0, b.jsxs)("div", {
        className: "space-y-4",
        children: [
          !chats.length &&
            (0, b.jsxs)(b.Fragment, {
              children: [
                (0, b.jsx)(hn, {
                  icon: (0, b.jsx)(al, {}),
                  title: "O que você quer consultar?",
                  hint: "Consulte vendas, clientes, produtos e estoque no seu escopo de acesso.",
                }),
                (0, b.jsx)("div", {
                  className: "flex flex-wrap gap-2",
                  children: [
                    "Produtos mais vendidos",
                    "Ticket m\xE9dio",
                    "Clientes para reativar",
                  ].map((s) => (0, b.jsx)(xt, { onClick: () => l(s), children: s }, s)),
                }),
              ],
            }),
          chats.map((s) =>
            (0, b.jsxs)(
              "div",
              {
                className: "space-y-3",
                children: [
                  (0, b.jsx)("div", {
                    className: "chat-question",
                    children: (0, b.jsx)("p", {
                      className: "text-body",
                      children: s.question,
                    }),
                  }),
                  (0, b.jsxs)(Vt, {
                    className: "space-y-3",
                    children: [
                      (0, b.jsx)(bi, {
                        tone: "warn",
                        children: s.model ? "IA · " + s.model : "Resposta antiga · simulada",
                      }),
                      (0, b.jsx)(AIAnswer, { text: s.answer }),
                    ],
                  }),
                ],
              },
              s.id,
            ),
          ),
          (0, b.jsxs)(Vt, {
            className: "space-y-4",
            children: [
              (0, b.jsx)($u, {
                label: "Mensagem",
                value: a,
                onChange: o,
                placeholder: "Pergunte sobre vendas, clientes, produtos ou estoque…",
                minRows: 3,
              }),
              (0, b.jsxs)("div", {
                className: "flex justify-between items-center gap-3",
                children: [
                  (0, b.jsx)(Xt, {
                    children: n
                      ? "Consultando a Sul IA…"
                      : "IA via Gateway G4 · histórico apenas nesta sessão.",
                  }),
                  (0, b.jsxs)(Ft, {
                    onClick: () => l(a),
                    disabled: !a.trim() || n,
                    disabledReason: "Digite uma mensagem e aguarde a resposta anterior",
                    children: [(0, b.jsx)(Nm, {}), "Enviar"],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
const Ez = [
  [
    "Cadastro de Produto",
    "Consulte o cat\xE1logo, as tabelas, informa\xE7\xF5es gerais, varia\xE7\xF5es e medidas.",
    "/produtos",
  ],
  ["Cadastro de Clientes", "Confira a carteira, o cadastro e os v\xEDnculos.", "/clientes"],
  [
    "Emiss\xE3o de Pedidos",
    "Crie pedidos locais com cliente, itens, pagamento e entrega.",
    "/pedidos/novo",
  ],
  [
    "Usu\xE1rios e Roteiro de Visitas",
    "Gerencie registros locais e experimente a agenda.",
    "/agenda/roteiros",
  ],
  [
    "Indicadores e Relat\xF3rios",
    "Use consultas e filtros sobre o recorte recuperado.",
    "/relatorios",
  ],
  [
    "E-commerce B2B",
    "A tela original oferecia cria\xE7\xE3o; a ativa\xE7\xE3o do arquivo \xE9 simulada.",
    "/portal",
  ],
  ["Atendimento", "Consulte os limites e a origem dos dados do arquivo.", "/ajuda"],
];
function kz() {
  return (0, b.jsxs)(fa, {
    width: "narrow",
    children: [
      (0, b.jsx)(Ua, {
        title: "Guia inicial",
        description: "Nove t\xF3picos observados \xB7 atalhos adaptados para o prot\xF3tipo local",
      }),
      Ez.map(([e, t, a], o) =>
        (0, b.jsx)(
          Vt,
          {
            children: (0, b.jsx)(Ot, {
              title: o + 1 + ". " + e,
              action: (0, b.jsxs)(xt, {
                href: "#" + a,
                children: ["Ver recurso", (0, b.jsx)(Jr, {})],
              }),
              children: (0, b.jsx)("p", {
                className: "text-body text-muted",
                children: t,
              }),
            }),
          },
          e,
        ),
      ),
    ],
  });
}
function Nz() {
  return (0, b.jsxs)(fa, {
    width: "reading",
    children: [
      (0, b.jsx)(Ua, {
        title: "Sobre este sistema",
        description: "Sul Sulbr \xB7 empresa 432299 \xB7 G4 DS 0.9.0",
      }),
      (0, b.jsx)(Vt, {
        children: (0, b.jsx)(Ot, {
          title: "Origem dos dados",
          children: (0, b.jsx)(_o, {
            items: [
              {
                label: "Recorte inicial",
                value: "20 pedidos, 15 clientes e 4 produtos",
              },
              {
                label: "Itens completos",
                value: "Pedido #2351: 3 itens, 974 unidades, R$ 9.008,80",
              },
              { label: "Inspe\xE7\xE3o original", value: "07/10/2026" },
              {
                label: "Data de referência do mapeamento",
                value: "08/10/2026",
              },
              {
                label: "Observado",
                value: "Extra\xEDdo da interface ou dos artefatos da varredura",
              },
              {
                label: "Simulado",
                value: "Criado ou alterado no prot\xF3tipo",
              },
              {
                label: "N\xE3o extra\xEDdo",
                value:
                  "Campo sem evid\xEAncia dispon\xEDvel; n\xE3o substitu\xEDdo por um valor inventado",
              },
            ],
          }),
        }),
      }),
      (0, b.jsx)(Vt, {
        children: (0, b.jsx)(Ot, {
          title: "Limites",
          children: (0, b.jsx)("p", {
            className: "text-body leading-relaxed",
            children:
              "O sistema usa componentes oficiais do G4 Design System, autenticação e persistência no Supabase. ERP, emissão fiscal, envio externo, pagamentos e IA remota ainda dependem de provedores não configurados.",
          }),
        }),
      }),
      (0, b.jsx)(Vt, {
        children: (0, b.jsx)(Ot, {
          title: "Funcionamento local",
          children: (0, b.jsx)("p", {
            className: "text-body leading-relaxed",
            children:
              "As gravações são confirmadas pelo servidor antes da atualização da interface. Dados de negócio ficam no Supabase; exportações CSV e impressão são executadas no navegador.",
          }),
        }),
      }),
    ],
  });
}
function Wu() {
  return (0, b.jsxs)(fa, {
    width: "reading",
    children: [
      (0, b.jsx)(Ua, { title: "P\xE1gina n\xE3o encontrada" }),
      (0, b.jsx)(hn, {
        title: "Registro não encontrado",
        action: (0, b.jsx)(xt, {
          href: "#/indicadores",
          children: "Voltar aos indicadores",
        }),
      }),
    ],
  });
}
function PriceListEditor({
  db: e,
  value: t,
  onChange: a,
}: {
  db: AppState;
  value: RefPrice[];
  onChange: (value: RefPrice[]) => void;
}) {
  const [o, n] = (0, He.useState)(""),
    [r, l] = He.useState<number | null>(null);
  const i = () => {
    if (!o || !(r !== null && r > 0)) {
      return;
    }
    if (t.some((u) => u.productId === o)) {
      {
        n("");
        l(null);
      }
      return;
    }
    {
      a([...t, { productId: o, price: r }]);
      n("");
      l(null);
    }
  };
  return (0, b.jsxs)("div", {
    className: "space-y-3",
    children: [
      (0, b.jsxs)("div", {
        className: "flex flex-wrap items-end gap-3",
        children: [
          (0, b.jsx)("div", {
            className: "flex-1 min-w-0",
            children: (0, b.jsx)(Sl, {
              label: "Produto",
              value: o,
              onValueChange: (u: string) => n(String(u)),
              options: e.products
                .filter((u) => (u.price ?? 0) > 0)
                .map((u) => ({
                  value: u.id,
                  label: (u.code || "") + " \xB7 " + u.name + " (base " + rt(u.price) + ")",
                })),
            }),
          }),
          (0, b.jsx)("div", {
            className: "w-44",
            children: (0, b.jsx)(Up, {
              label: "Pre\xE7o praticado (R$)",
              value: r,
              onChange: (u: number | null) => l(u),
            }),
          }),
          (0, b.jsx)(xt, {
            disabled: !o || !(r !== null && r > 0),
            onClick: i,
            children: "Adicionar",
          }),
        ],
      }),
      t.length > 0 &&
        (0, b.jsx)(RecordsTable, {
          toolbar: !1,
          rows: t.map((u, x) => ({
            id: u.productId + "-" + x,
            name: Ur(e, u.productId)?.name || u.productId,
            base: Ur(e, u.productId)?.price,
            price: u.price,
          })),
          columns: [
            z("name", "Produto", void 0, { primary: !0, wide: !0 }),
            z("base", "Pre\xE7o base", (u) => rt(u.base), { align: "right" }),
            z("price", "Pre\xE7o praticado", (u) => rt(u.price), {
              align: "right",
            }),
            z("actions", "A\xE7\xF5es", (u) =>
              (0, b.jsx)(wR, {
                label: "Remover",
                onClick: () =>
                  a(
                    t.filter(
                      (x2, G) => x2.productId !== String(u.id).split("-").slice(0, -1).join("-"),
                    ),
                  ),
                children: (0, b.jsx)(Ws, {}),
              }),
            ),
          ],
        }),
    ],
  });
}
function Mz({
  spec: e,
  close: closePanel,
  dbRef: dbR,
}: {
  spec: EditorSpec;
  close: () => void;
  dbRef: AppState;
}) {
  const saving = useRef(false);
  const t = () => {
    if (!saving.current) closePanel();
  };
  const [a, o] = (0, He.useState)<FormValues>(() =>
      e.allocateIdentity ? createEditorValues(Xu(e.values || {})) : Xu(e.values || {}),
    ),
    [n, r] = (0, He.useState)(""),
    l = (i: string, u: unknown) => o((c) => ({ ...c, [i]: u }));
  async function s(): Promise<void> {
    if (saving.current) return;
    const i = e.fields.find(
      (c) =>
        c.required &&
        (a[c.key] == null ||
          a[c.key] === "" ||
          (c.kind === "priceList" &&
            !(Array.isArray(a[c.key]) ? (a[c.key] as unknown[]).length : 0))),
    );
    if (i) {
      r("Preencha " + i.label.toLowerCase() + ".");
      return;
    }
    if (
      e.fields.some(
        (c) =>
          ["number", "currency"].includes(c.kind || "") &&
          a[c.key] != null &&
          (!Number.isFinite(a[c.key]) || Number(a[c.key]) < 0),
      )
    ) {
      r("Informe valores num\xE9ricos n\xE3o negativos.");
      return;
    }
    const u = e.validate?.(a);
    if (u) {
      r(u);
      return;
    }
    saving.current = true;
    r("");
    try {
      await e.save(a);
      saving.current = false;
      closePanel();
      go("Alterações salvas");
    } catch (error) {
      r(error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      saving.current = false;
    }
  }
  return (0, b.jsx)(xb, {
    open: !0,
    onClose: t,
    title: e.title,
    kicker: "Gravação no sistema",
    footer: (0, b.jsxs)(b.Fragment, {
      children: [
        (0, b.jsx)(xt, { onClick: t, children: "Cancelar" }),
        (0, b.jsxs)(Ft, {
          onClick: s,
          children: [(0, b.jsx)(ka, {}), "Salvar no sistema"],
        }),
      ],
    }),
    children: (0, b.jsxs)("div", {
      className: "space-y-5",
      children: [
        n && (0, b.jsx)(Gu, { tone: "bad", children: n }),
        a.__priceList &&
          a.__priceList.length > 0 &&
          (0, b.jsx)(Gu, {
            tone: "info",
            title: "Tabela identificada",
            children: (() => {
              const rates = dbR?.priceTablesBase || {};
              const names = Object.keys(rates);
              if (!names.length) return "Nenhuma tabela conhecida.";
              const scores = names.map((name) => {
                const diffs: number[] = [];
                let ok = 0;
                for (const it of a.__priceList || []) {
                  const prod = Ur(dbR, it.productId);
                  if (!prod || prod.price == null) continue;
                  const cat = prod.category || "?";
                  const factor = rates[name]?.[cat] ?? rates[name]?.["*"] ?? null;
                  if (factor == null) continue;
                  const expected = prod.price * factor;
                  diffs.push((Math.abs(it.price - expected) / expected) * 100);
                  if ((Math.abs(it.price - expected) / expected) * 100 < 2) ok++;
                }
                return {
                  name,
                  diff: diffs.length ? diffs.reduce((S, x2) => S + x2, 0) / diffs.length : 1e9,
                  ok,
                  covered: diffs.length,
                };
              });
              if (!scores.length) return "N\xE3o foi poss\xEDvel comparar (sem pre\xE7os base).";
              scores.sort((S, L) => S.diff - L.diff || L.ok - S.ok);
              const b2 = scores[0]!;
              if (b2.covered === 0)
                return "Nenhum produto com pre\xE7o base conhecido \u2014 verifique as escolhas.";
              return (
                "Melhor tabela: " +
                b2.name +
                " \u2014 diferen\xE7a m\xE9dia de " +
                na(b2.diff) +
                "% nos " +
                b2.covered +
                " produto(s) comparados" +
                (b2.ok > 0 ? ", " + b2.ok + " exatamente na tabela" : "") +
                ". " +
                (scores[1]
                  ? "Pr\xF3xima mais pr\xF3xima: " +
                    scores[1].name +
                    " (" +
                    na(scores[1].diff) +
                    "%)."
                  : "")
              );
            })(),
          }),
        e.fields.map((i) => {
          const u = i.label + (i.required ? " *" : ""),
            c = a[i.key];
          if (i.key === "priceTableMatch") return null;
          if (i.kind === "priceList")
            return (0, b.jsx)(PriceListEditor, {
              db: dbR,
              value: a.__priceList || [],
              onChange: (v: RefPrice[]) => o({ ...a, __priceList: v }),
            });
          const fi =
            i.options === "PRODUCTS"
              ? {
                  ...i,
                  options: dbR.products
                    .filter((p) => (p.price ?? 0) > 0)
                    .map((p) => ({
                      value: p.id,
                      label: (p.code || "") + " \xB7 " + p.name + " (base " + rt(p.price) + ")",
                    })),
                }
              : i;
          if (fi.options === "PRODUCTS") return null;
          return (0, b.jsx)(
            "div",
            {
              children: fi.options
                ? fi.options.length > 7
                  ? (0, b.jsx)(Sl, {
                      label: u,
                      options: La(fi.options),
                      value: c || "",
                      onValueChange: (f: string) => l(fi.key, f),
                    })
                  : (0, b.jsx)(ho, {
                      label: u,
                      options: La(fi.options),
                      value: c || "",
                      onValueChange: (f: string) => l(fi.key, f),
                    })
                : fi.kind === "currency"
                  ? (0, b.jsx)(Up, {
                      label: u,
                      value: c ?? null,
                      onChange: (f: number | null) => l(fi.key, f),
                    })
                  : fi.kind === "number"
                    ? (0, b.jsx)(Hr, {
                        label: u,
                        min: 0,
                        value: c ?? null,
                        onChange: (f: number | null) => l(fi.key, f),
                      })
                    : fi.kind === "date"
                      ? (0, b.jsx)(Jd, {
                          label: u,
                          value: c || "",
                          onValueChange: (f: string) => l(fi.key, f),
                          now: bo,
                        })
                      : fi.kind === "area"
                        ? (0, b.jsx)($u, {
                            label: u,
                            value: c || "",
                            onChange: (f: string) => l(fi.key, f),
                          })
                        : (0, b.jsx)(vr, {
                            label: u,
                            type: fi.type || "text",
                            value: c || "",
                            onChange: (f: string) => l(fi.key, f),
                          }),
            },
            i.key,
          );
        }),
      ],
    }),
  });
}
const Az = [
  {
    label: "Opera\xE7\xE3o",
    items: [
      { label: "Indicadores", href: "#/indicadores", icon: zs },
      { label: "Funil de Vendas", href: "#/oportunidades", icon: Sm },
      { label: "Pedidos", href: "#/pedidos", icon: $s },
      { label: "Clientes", href: "#/clientes", icon: Wl },
      { label: "Produtos", href: "#/produtos", icon: du },
      { label: "Sul IA", href: "#/ia", icon: al },
      { label: "Minha conta", href: "#/conta/perfil", icon: ad },
    ],
  },
];
export interface SulAppProps {
  initialState: ERPRow;
  persist: (nextState: AppState) => Promise<ERPRow>;
  onSignOut: () => Promise<void>;
  online?: ERPClient | undefined;
  submission?: SubmissionClient | undefined;
  refresh?: (() => Promise<ERPRow>) | undefined;
}
export default function SulApp({
  initialState,
  persist,
  onSignOut,
  online,
  submission,
  refresh,
}: SulAppProps): React.ReactElement {
  const [e, t] = (0, He.useState)(location.hash || "#/indicadores"),
    a = e.replace(/^#/, "").split("?")[0] || "",
    [o, n] = (0, He.useState)(() => createAppState(initialState)),
    [r, l] = He.useState<EditorSpec | null>(null),
    [s, i] = He.useState<ConfirmationSpec | null>(null),
    [u, c] = (0, He.useState)(!1),
    [f, d] = (0, He.useState)("");
  {
    (0, He.useEffect)(() => {
      {
        if (!location.hash) {
          location.hash = "/indicadores";
        }
      }
      const g = () => {
        {
          t(location.hash);
          l(null);
          c(!1);
        }
      };
      return (addEventListener("hashchange", g), () => removeEventListener("hashchange", g));
    }, []);
    (0, He.useEffect)(() => {
      const g = (h: KeyboardEvent) => {
        {
          if ((h.metaKey || h.ctrlKey) && h.key === "k") {
            h.preventDefault();
            c((S) => !S);
          }
        }
      };
      return (addEventListener("keydown", g), () => removeEventListener("keydown", g));
    }, []);
  }
  const queryMetadata: ERPQueryRef = useRef({});
  const current = useRef<AppState>(o);
  const persistRef = useRef(persist),
    refreshRef = useRef(refresh);
  persistRef.current = persist;
  refreshRef.current = refresh;
  const queueRef = useRef<ReturnType<typeof createMutationQueue> | null>(null);
  if (!queueRef.current)
    queueRef.current = createMutationQueue(
      current,
      (next) => persistRef.current(next),
      (confirmed) => {
        n(confirmed);
      },
      async () => {
        if (!refreshRef.current) throw new Error("Recarga autenticada indisponível.");
        return refreshRef.current();
      },
    );
  const update = (mutator: (draft: AppState) => unknown) => queueRef.current!(mutator);
  const y = {
    db: o,
    online,
    submission,
    refresh: queueRef.current.refresh,
    queryMetadata,
    update,
    editor: l,
    confirm: (
      g: string,
      h: ConfirmationSpec["run"],
      S = "A alteração será salva no banco da SulBR.",
    ) => i({ title: g, run: h, description: S }),
    onSignOut,
    path: a,
  };
  let C: React.ReactNode;
  const x: string[] = a.split("/").filter((value): value is NonNullable<typeof value> => !!value);
  {
    if (a === "/indicadores") {
      C = (0, b.jsx)(DashboardPage, {});
    } else {
      if (a === "/indicadores/catalogo") {
        C = (0, b.jsx)(IndicatorCatalogPage, {});
      } else {
        if (a === "/relatorios") {
          C = (0, b.jsx)(ReportCatalogPage, {});
        } else {
          if (x[0] === "relatorios") {
            C = (0, b.jsx)(ReportPage, { id: x[1] });
          } else {
            if (a === "/pedidos") {
              C = (0, b.jsx)(OrdersPage, {});
            } else {
              if (a === "/pedidos/novo") {
                C = (0, b.jsx)(OrderEditor, {});
              } else {
                if (x[0] === "pedidos") {
                  C = (0, b.jsx)(ERPDocumentDetail, { id: x[1], component: OrderDetail }, x[1]);
                } else {
                  if (a === "/clientes") {
                    C = (0, b.jsx)(CustomersPage, {});
                  } else {
                    if (a === "/clientes/agrupamentos" || a.startsWith("/clientes/agrupamentos/")) {
                      C = b.jsx(CustomerGroups, {
                        client: online,
                        role: o["company"].role,
                        id: x[2],
                        confirm: y.confirm,
                      });
                    } else {
                      if (a === "/clientes/vinculos") {
                        C = (0, b.jsx)(PriceTablesPage, {});
                      } else {
                        if (x[0] === "clientes") {
                          C = (0, b.jsx)(
                            ERPDetail,
                            { resource: "customers", id: x[1], component: CustomerDetail },
                            x[1],
                          );
                        } else {
                          if (a === "/produtos") {
                            C = (0, b.jsx)(ProductsPage, {});
                          } else {
                            if (a === "/produtos/destaques") {
                              C = (0, b.jsx)(ProductsPage, {});
                            } else {
                              if (x[0] === "produtos") {
                                C = (0, b.jsx)(
                                  ERPDetail,
                                  { resource: "products", id: x[1], component: ProductDetail },
                                  x[1],
                                );
                              } else {
                                if (a === "/oportunidades") {
                                  C = (0, b.jsx)(OpportunitiesPage, {});
                                } else {
                                  if (a === "/agenda") {
                                    C = (0, b.jsx)(ActivitiesPage, {});
                                  } else {
                                    if (a === "/agenda/roteiros") {
                                      C = (0, b.jsx)(ActivitiesPage, { routes: !0 });
                                    } else {
                                      if (a === "/portal") {
                                        C = (0, b.jsx)(Rz, {});
                                      } else {
                                        if (a === "/ia") {
                                          C = (0, b.jsx)(AIPage, {});
                                        } else {
                                          if (x[0] === "config") {
                                            C = (0, b.jsx)(Cz, {
                                              area: x[1],
                                              section: x[2],
                                            });
                                          } else {
                                            if (x[0] === "conta") {
                                              C = (0, b.jsx)(Sz, {
                                                section: x[1],
                                              });
                                            } else {
                                              if (a === "/guia") {
                                                C = (0, b.jsx)(kz, {});
                                              } else {
                                                if (a === "/ajuda") {
                                                  C = (0, b.jsx)(Nz, {});
                                                } else {
                                                  C = (0, b.jsx)(Wu, {});
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  const v = f.trim()
    ? [
        ...o["orders"].map((g) => ({
          id: "o" + g.id,
          name: "Pedido #" + g["number"] + " \xB7 " + Un(o, g.customerId),
          to: "/pedidos/" + g.id,
        })),
        ...o["customers"].map((g) => ({
          id: "c" + g.id,
          name: g.name + " \xB7 " + g.code,
          to: "/clientes/" + g.id,
        })),
        ...o["products"].map((g) => ({
          id: "p" + g.id,
          name: g.name,
          to: "/produtos/" + g.id,
        })),
        ...o["reports"].map((g) => ({
          id: "r" + g.id,
          name: g.name,
          to: "/relatorios/" + g.id,
        })),
      ]
        .filter((g) => ol(g.name || "").includes(ol(f)))
        .slice(0, 20)
    : [];
  return (0, b.jsxs)(I5.Provider, {
    value: y,
    children: [
      (0, b.jsxs)(l1, {
        product: "Sul \xB7 Sulbr",
        workspace: "Empresa 432299",
        currentPath: "#" + a,
        sidebar: ({ mobileOpen: g, close: h }: { mobileOpen: boolean; close: () => void }) =>
          (0, b.jsx)(t1, {
            product: "Sul",
            workspace: "Sulbr \xB7 432299",
            mark: (0, b.jsx)(rv, {}),
            groups: Az,
            currentPath: a.startsWith("/relatorios") ? "#/indicadores" : "#" + a,
            mobileOpen: g,
            onNavigate: h,
            storageKey: "sulbr-mock-sidebar",
            onSearch: () => c(!0),
            user: {
              name: o["company"].user,
              initials: String(o["company"].user || "Sul")
                .trim()
                .split(/\s+/)
                .map((part: string) => part[0])
                .slice(0, 2)
                .join(""),
              role: o["company"].role,
              href: "#/conta/perfil",
            },
            footer: (0, b.jsxs)("div", {
              className: "space-y-3",
              children: [
                (0, b.jsx)(bi, { children: "Dados persistidos" }),
                (0, b.jsx)("div", {
                  children: (0, b.jsx)(n0, {
                    compact: !0,
                    className: "max-w-full flex-wrap",
                  }),
                }),
                (0, b.jsx)(Xt, {
                  children: "G4 DS 0.9.0 · Supabase",
                }),
              ],
            }),
          }),
        children: [
          (0, b.jsx)("div", {
            className: "mock-topbar page-gutter",
            children: (0, b.jsxs)("div", {
              className: "flex items-center gap-2 min-w-0",
              children: [
                (0, b.jsx)("strong", { children: o["company"].name }),
                (0, b.jsx)("span", {
                  className: "text-muted text-caption hidden sm:inline",
                  children: "Dados da empresa",
                }),
              ],
            }),
          }),
          (0, b.jsx)("div", { className: "screen-root", children: C }, a),
          (0, b.jsx)("div", {
            className: "mock-footer page-gutter",
            children: "SulBR · dados persistidos no Supabase",
          }),
        ],
      }),
      r && (0, b.jsx)(Mz, { spec: r, close: () => l(null), dbRef: o }, r.title),
      (0, b.jsx)(HR, {
        open: !!s,
        onClose: () => i(null),
        title: s?.title || "Confirmar alteração",
        description: s?.description,
        confirmLabel: "Confirmar no sistema",
        onConfirm: async () => {
          try {
            await s?.run();
            i(null);
            go("Alteração confirmada");
          } catch {
            /* Manter a confirmação aberta para nova tentativa. */
          }
        },
        tone: "danger",
      }),
      (0, b.jsx)(gb, {
        open: u,
        onClose: () => c(!1),
        title: "Busca global",
        description: "Clientes, pedidos, produtos e relat\xF3rios deste arquivo",
        children: (0, b.jsxs)("div", {
          className: "space-y-4",
          children: [
            (0, b.jsx)(vr, {
              label: "Buscar no recorte",
              value: f,
              onChange: d,
              placeholder: "Nome, c\xF3digo ou n\xFAmero do pedido\u2026",
              icon: (0, b.jsx)(tr, {}),
            }),
            v.map((g) =>
              (0, b.jsxs)(
                xt,
                {
                  className: "w-full justify-between",
                  href: "#" + g.to,
                  onClick: () => c(!1),
                  children: [g.name, (0, b.jsx)(so, {})],
                },
                g.id,
              ),
            ),
            f &&
              !v.length &&
              (0, b.jsx)(hn, {
                framed: !1,
                title: "Nenhum resultado",
              }),
          ],
        }),
      }),
    ],
  });
}

export function monthOptions(
  orders: { date?: string | undefined }[],
): { value: string; label: string }[] {
  const now = businessDate();
  const months = new Set<string>(
    orders.filter((r) => r.date).map((r) => String(r.date).slice(0, 7)),
  );
  for (let i = -12; i <= 3; i++) {
    const d = new Date(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1 + i, 1);
    months.add(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  }
  return [...months].sort().map((value) => ({
    value,
    label: new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value + "-15T12:00:00Z")),
  }));
}
export function identifyPriceTable(
  db: {
    products: { id: string; category?: string | undefined; price?: number | null | undefined }[];
    priceTablesBase?: Record<string, Record<string, number>> | undefined;
  },
  items: { productId: string; price: number }[],
): string {
  const scores = Object.entries(db.priceTablesBase || {})
    .map(([name, rates]) => {
      const diffs = items.flatMap((it) => {
        const prod = db.products.find((product) => product.id === it.productId);
        const factor = rates[prod?.category || ""] ?? rates["*"];
        const expected = (prod?.price ?? 0) * (factor ?? 0);
        return expected > 0 ? [Math.abs(it.price - expected) / expected] : [];
      });
      return {
        name,
        score: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : Infinity,
      };
    })
    .filter((s) => Number.isFinite(s.score))
    .sort((a, b) => a.score - b.score);
  return scores[0]?.name || "";
}

export { M5 as openActivityEditor, k5 as openCustomerEditor };
