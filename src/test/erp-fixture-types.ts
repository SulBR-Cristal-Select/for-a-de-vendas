import type { ERPPageQuery } from "../lib/erp-online";
import type { ERPSortKey } from "../lib/erp-order";
/** Formato das consultas sintéticas válidas usadas pelos transportes de teste. */
export type FixtureQuery = {
  resource: string;
  id?: string | number;
  offset: number;
  limit: number;
  page: number;
  pageSize: 10 | 20 | 50;
  filters?: ERPPageQuery["filters"];
  search: string;
  sort: ERPSortKey | "customer" | "total" | "share" | "qty";
  direction?: "asc" | "desc";
  from?: string;
  to?: string;
  customerId?: string;
  sellerCode?: number;
  groupBy?: "customer" | "seller";
  productMix?: boolean;
  productReport?: boolean;
  view?: "customers" | "sellers";
  month: string;
  status?: string;
  productId?: string;
  series: import("../lib/erp-indicator-series").IndicatorSeries;
};
export type FixtureRequest = { operation: string; query: FixtureQuery };
