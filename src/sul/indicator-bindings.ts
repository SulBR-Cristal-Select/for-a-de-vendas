import catalogo from "./catalogo.json";
import type { IndicatorSeries } from "../lib/erp-indicator-series";
export type IndicatorBinding =
  | {
      series: IndicatorSeries;
      specific?: "product-or-category" | "category" | "customer";
      view:
        | "quantity-value"
        | "positivation-series"
        | "money-series"
        | "quantity"
        | "new-customers"
        | "active-customers"
        | "positivation-day"
        | "positivation"
        | "wallet"
        | "money-total";
    }
  | { local: "total" | "seller" | "day" }
  | { reason: string };
const v = catalogo.indicators.Vendas,
  p = catalogo.indicators["Positivação"],
  f = catalogo.indicators.Faturamento,
  a = catalogo.indicators.Atividades,
  o = catalogo.indicators.Outros;
export const INDICATOR_BINDINGS: Record<string, IndicatorBinding> = {
  [v[0]!]: { series: "items-selected", view: "quantity-value", specific: "product-or-category" },
  [v[1]!]: { series: "items-day", view: "money-series" },
  [v[2]!]: { series: "items-seller", view: "money-series" },
  [v[3]!]: { series: "items-category", view: "quantity" },
  [v[4]!]: { series: "items-selected-day", view: "money-series", specific: "product-or-category" },
  [v[5]!]: { series: "sales-day", view: "money-series" },
  [p[0]!]: { series: "wallet-customer", view: "positivation", specific: "customer" },
  [p[1]!]: { series: "wallet-day", view: "positivation-day" },
  [p[2]!]: { series: "customers-seller", view: "new-customers" },
  [p[3]!]: { series: "customers-seller", view: "active-customers" },
  [p[4]!]: {
    series: "wallet-selected-seller",
    view: "positivation",
    specific: "product-or-category",
  },
  [p[5]!]: {
    series: "wallet-selected-day",
    view: "positivation-day",
    specific: "product-or-category",
  },
  [p[6]!]: {
    series: "wallet-selected-seller",
    view: "positivation-series",
    specific: "product-or-category",
  },
  [p[7]!]: { series: "wallet-selected-seller", view: "positivation", specific: "category" },
  [p[8]!]: { series: "wallet-seller", view: "positivation" },
  [f[0]!]: { series: "billing-customer", view: "money-total", specific: "customer" },
  [f[1]!]: { series: "billing-day", view: "money-series" },
  [f[2]!]: { series: "billing-seller", view: "money-total" },
  [f[3]!]: { series: "billing-seller", view: "money-series" },
  [f[4]!]: { series: "billing-day", view: "money-series" },
  [a[0]!]: { local: "total" },
  [a[1]!]: { local: "seller" },
  [a[2]!]: { local: "day" },
  [a[3]!]: {
    reason:
      "Cobertura indisponível: referência atividade→cliente ERP compatível com FK, responsável e RLS não comprovada.",
  },
  [o[0]!]: { series: "wallet-seller", view: "wallet" },
  [o[1]!]: {
    reason:
      "Classes ABC de clientes ainda não comprovadas no ERP; participação em vendas não define classe.",
  },
  [o[2]!]: { reason: "Fonte de conversão do e-commerce não conectada." },
};
export function requiredIndicatorSeries(names: readonly string[]): IndicatorSeries[] {
  return [
    ...new Set<IndicatorSeries>([
      "wallet-seller",
      "commissions-seller",
      "customers-seller-year",
      ...names.flatMap((n) => {
        const s = INDICATOR_BINDINGS[n];
        return s && "series" in s && !s.specific ? [s.series] : [];
      }),
    ]),
  ];
}
