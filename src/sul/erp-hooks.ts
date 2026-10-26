import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { ERPOnlineError, type createERPClient, type ERPPageQuery, type ERPHistoryQuery, type ERPSalesQuery, type ERPBillingQuery, type ERPOrderItemsQuery, type ERPItemSummary, type ERPSalesSummary, type ERPResource, type ERPRow } from '../lib/erp-online';
import { compareERP, foldERPText, type ERPSortKey } from '../lib/erp-order';
import { paginateERP, type ERPMergedPage } from '../lib/erp-paging';
import { decimalUnits, formatERPShare } from '../lib/erp-decimal';

export type ERPClient = ReturnType<typeof createERPClient>;
export type ERPDescriptor = { client: ERPClient; registerExport?: false; resource: 'customers' | 'products' | 'orders' | 'invoices'; categoryName?: string; customerId?: string; filters?: ERPPageQuery['filters']; salesParticipation?: boolean; salesReport?: Omit<ERPSalesQuery, 'resource' | 'offset' | 'limit'>; billingReport?: Omit<ERPBillingQuery, 'resource' | 'offset' | 'limit'>; orderItemsReport?: Omit<ERPOrderItemsQuery,'resource'|'offset'|'limit'>; onSummary?: (summary: ERPSalesSummary | undefined, source?: ERPReportSource) => void; onItemsSummary?: (summary: ERPItemSummary | undefined, source?: ERPReportSource) => void };
export type ERPQueryMetadata = { exportRows: () => Promise<ERPRow[]> };
export type ERPQueryRef = MutableRefObject<Partial<Record<ERPResource | 'orders' | 'invoices', ERPQueryMetadata>>>;
type ERPTableQuery = ERPPageQuery | Omit<ERPHistoryQuery, 'offset' | 'limit'> | Omit<ERPSalesQuery, 'offset' | 'limit'> | Omit<ERPBillingQuery, 'offset' | 'limit'>;
export type ERPReportSource = { query: ERPTableQuery; companyCodes: readonly (1 | 4)[] };
const historyResource = (resource: string | undefined) => resource === 'orders' || resource === 'invoices';
export function historyPresentation(row: ERPRow): ERPRow {
  const erp = row['erp'] as ERPRow | undefined;
  const payment = erp?.['payment'] as ERPRow | undefined;
  return { ...row, seller: row['sellerName'], type: row['operationName'], payment: payment?.['label'], value: row['total'], delivery: null, agenda: null, freight: null, cargoStatus: null };
}
async function tableWindow(descriptor: ERPDescriptor, query: ERPTableQuery, offset: number, limit: number) {
  const participation = descriptor.salesParticipation;
  if (participation && (descriptor.resource !== 'orders' || query.resource !== 'orders' || descriptor.billingReport || descriptor.orderItemsReport || descriptor.salesReport?.groupBy !== 'customer' || !('groupBy' in query) || query.groupBy !== 'customer')) throw new ERPOnlineError('INVALID_RESPONSE');
  const shareSort = participation && query.sort === 'share';
  const nativeQuery: ERPTableQuery = shareSort ? { ...query, sort: 'total' } : query;
  if(descriptor.orderItemsReport) return descriptor.client.orderItemsReport({...query,resource:'orders',offset,limit});
  if (query.resource === 'orders' || query.resource === 'invoices') {
    let result = descriptor.billingReport
      ? await descriptor.client.billingReport({ ...query, resource:'invoices',offset,limit })
      : descriptor.salesReport
      ? await descriptor.client.salesReport({ ...nativeQuery, resource: 'orders', offset, limit })
      : await descriptor.client.history({ ...query, offset, limit });
    const amount = participation && 'summary' in result ? (result.summary as ERPSalesSummary).documentAmount : null;
    if (shareSort && amount !== null && decimalUnits(amount) < 0n) {
      // Denominador negativo inverte a ordem da razão. Reconsulta só esta janela, sem classificar ABC.
      const reversed = await descriptor.client.salesReport({ ...nativeQuery, resource:'orders',offset,limit,direction:query.direction === 'desc' ? 'asc' : 'desc' });
      if (JSON.stringify([result.total,result.totalWithoutSearch,'summary' in result ? result.summary : null,'companyCodes' in result ? result.companyCodes : null]) !== JSON.stringify([reversed.total,reversed.totalWithoutSearch,reversed.summary,reversed.companyCodes])) throw new ERPOnlineError('INVALID_RESPONSE');
      result = reversed;
    }
    return { ...result, items: result.items.map(row => {
      const item = historyPresentation(row);
      if (participation) return { ...item, share: formatERPShare(row['total'], amount) };
      return descriptor.billingReport && !descriptor.billingReport.groupBy ? {...item,number:(row['erp'] as ERPRow)['documentCode']} : item;
    }) };
  }
  return descriptor.client.window({ ...query as ERPPageQuery, offset, limit });
}
type Sort = { key: string; dir: 'asc' | 'desc' } | null;
const emptyRows: ERPRow[] = [];
export function remoteRow(row: ERPRow): boolean {
  const erp = row['erp'];
  return String(row['id'] || '').startsWith('sankhya:') || row['readOnly'] === true || !!(erp && typeof erp === 'object' && 'source' in erp && erp.source === 'sankhya');
}
export function manualRows(rows: ERPRow[]): ERPRow[] { return rows.filter(row => !remoteRow(row)); }
function filtered(rows: ERPRow[], _resource: ERPDescriptor['resource'], search: string): ERPRow[] {
  const needle = foldERPText(search.trim());
  return rows.filter(row => foldERPText(Object.values(row).filter(value => typeof value !== 'object').join(' ')).includes(needle));
}
function queryFor(descriptor: ERPDescriptor, search: string, sort: Sort): ERPTableQuery {
  if (descriptor.resource === 'orders' || descriptor.resource === 'invoices') {
    // Entrega/carga não foram extraídas: todos os valores são desconhecidos e empatam pelo código.
    const candidate = sort && (['delivery', 'cargoStatus'].includes(sort.key) ? 'code' : sort.key);
    const report = descriptor.billingReport || descriptor.salesReport;
    const supported = descriptor.orderItemsReport?.productReport ? ['code','name','qty','total'] : descriptor.orderItemsReport ? ['name','date','number','customer','price','qty','total'] : descriptor.salesReport?.productMix ? ['name','qty','total'] : report?.groupBy ? ['name', 'count', 'total', ...(descriptor.salesParticipation ? ['share'] : [])] : ['code', 'number', 'date', 'customer', 'seller', 'total', 'status', 'operation', 'company',...(descriptor.billingReport ? ['nf','invoiced'] : [])];
    const key = (report || descriptor.orderItemsReport) && candidate && !supported.includes(candidate) ? undefined : candidate;
    return { resource: descriptor.resource, ...(descriptor.orderItemsReport || report), search, ...(descriptor.customerId ? { customerId: descriptor.customerId } : {}), ...(sort && key ? { sort: key, direction: sort.dir } : {}) };
  }
  return { resource: descriptor.resource, search, ...(sort ? { sort: sort.key as ERPSortKey, direction: sort.dir } : {}), ...(descriptor.filters || descriptor.categoryName ? { filters: { ...descriptor.filters, ...(descriptor.categoryName ? { categoryName: descriptor.categoryName } : {}) } } : {}) };
}
const message = (error: unknown): string => error instanceof Error ? error.message : new ERPOnlineError('ERP_UNAVAILABLE').message;

/** Exportação explícita: janelas limitadas e contagens coerentes, sem fallback parcial. */
export async function exportERPRows(descriptor: ERPDescriptor, query: ERPTableQuery, locals: ERPRow[], assertCurrent: () => void): Promise<ERPRow[]> {
  const rows: ERPRow[] = [], ids = new Set<unknown>();
  let total: number | undefined, unfiltered: number | undefined, summaryKey: string | undefined;
  for (let offset = 0;; offset += 50) {
    assertCurrent();
    const result = await tableWindow(descriptor, query, offset, 50);
    assertCurrent();
    const nextSummary = 'summary' in result ? JSON.stringify(result.summary) : undefined;
    if (total !== undefined && (total !== result.total || unfiltered !== result.totalWithoutSearch || summaryKey !== nextSummary)) throw new ERPOnlineError('INVALID_RESPONSE');
    total = result.total; unfiltered = result.totalWithoutSearch; summaryKey = nextSummary;
    for (const row of result.items) {
      if (ids.has(row['id'])) throw new ERPOnlineError('INVALID_RESPONSE');
      ids.add(row['id']); rows.push(row);
    }
    if (rows.length >= total) break;
  }
  // Verifica a contagem novamente antes de permitir criar o arquivo.
  const check = await tableWindow(descriptor, query, 0, 1);
  assertCurrent();
  if (check.total !== total || check.totalWithoutSearch !== unfiltered || rows.length !== total || summaryKey !== ('summary' in check ? JSON.stringify(check.summary) : undefined)) throw new ERPOnlineError('INVALID_RESPONSE');
  // P/V são universos documentais separados, nunca mesclados a pedidos locais sem vínculo.
  if (historyResource(descriptor.resource)) return rows;
  const all = [...locals, ...rows];
  return query.sort ? all.sort(compareERP(query.sort as ERPSortKey, query.direction)) : all;
}

export function useERPTable(descriptor: ERPDescriptor | undefined, rows: ERPRow[], search: string, sort: Sort, metadata: ERPQueryRef) {
  const rowsKey = JSON.stringify(rows);
  const client = descriptor?.client, resource = descriptor?.resource;
  const locals = useMemo(() => historyResource(resource) ? emptyRows : manualRows(rows), [rowsKey, resource]);
  const categoryName = descriptor?.categoryName, customerId = descriptor?.customerId;
  const scopeKey = JSON.stringify([resource, categoryName, customerId, descriptor?.filters, descriptor?.salesReport, descriptor?.billingReport, descriptor?.orderItemsReport, descriptor?.salesParticipation, rowsKey]);
  const baseKey = JSON.stringify([scopeKey, search, sort]);
  const current = useRef({ key: baseKey, client });
  current.current = { key: baseKey, client };
  const [debounced, setDebounced] = useState(search);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search), 180); return () => clearTimeout(timer); }, [search]);
  const [navigation, setNavigation] = useState({ key: baseKey, page: 1, size: 10 as 10 | 20 | 50 });
  const page = navigation.key === baseKey ? navigation.page : 1, pageSize = navigation.size;
  const requestKey = JSON.stringify([baseKey, page, pageSize]);
  const [result, setResult] = useState<{ key: string; scope: string; client: ERPClient; data?: ERPMergedPage<ERPRow>; error?: string }>();
  const activeExport = useRef<ERPQueryMetadata | undefined>(undefined);
  const query = useMemo(() => descriptor ? queryFor(descriptor, search, sort) : undefined, [client, baseKey]);
  const localFiltered = useMemo(() => resource ? filtered(locals, resource, search) : emptyRows, [locals, resource, search]);
  const exportMetadata = useMemo<ERPQueryMetadata | undefined>(() => descriptor && query ? {
    exportRows: () => exportERPRows(descriptor, query, localFiltered, () => {
      if (current.current.key !== baseKey || current.current.client !== client || activeExport.current !== exportMetadata) throw new ERPOnlineError('REQUEST_CANCELLED');
    }),
  } : undefined, [client, baseKey, localFiltered]);
  activeExport.current = exportMetadata;
  // Quadros secundários sem exportação não podem substituir o CSV da tabela principal.
  const exportResource = descriptor?.registerExport === false ? undefined : resource;
  if (exportResource && exportMetadata) metadata.current[exportResource] = exportMetadata;
  useEffect(() => {
    activeExport.current = exportMetadata;
    if (exportResource && exportMetadata) metadata.current[exportResource] = exportMetadata;
    return () => {
      if (exportResource && metadata.current[exportResource] === exportMetadata) delete metadata.current[exportResource];
      if (activeExport.current === exportMetadata) activeExport.current = undefined;
    };
  }, [exportResource, exportMetadata, metadata]);
  useEffect(() => {
    descriptor?.onSummary?.(undefined);
    descriptor?.onItemsSummary?.(undefined);
    if (!descriptor || !query || search !== debounced) return;
    let alive = true, summary: ERPSalesSummary | undefined, itemsSummary: ERPItemSummary | undefined, source: ERPReportSource | undefined;
    void paginateERP({ localRows: localFiltered, localTotalWithoutSearch: locals.length, skip: (page - 1) * pageSize, pageSize,
      getWindow: async (offset, limit) => {
        const window = await tableWindow(descriptor, query, offset, limit);
        if ('summary' in window) {
          if(descriptor.orderItemsReport)itemsSummary=window.summary as ERPItemSummary;
          else summary = window.summary as ERPSalesSummary;
          if ('companyCodes' in window) {
            const codes = window.companyCodes;
            if (!Array.isArray(codes) || !codes.length || codes.length > 2 || new Set(codes).size !== codes.length || codes.some(code => code !== 1 && code !== 4)) throw new ERPOnlineError('INVALID_RESPONSE');
            source = { query, companyCodes: codes as (1 | 4)[] };
          }
        }
        return window;
      },
      ...(sort ? { compare: compareERP(sort.key as ERPSortKey, sort.dir) } : {}),
    }).then(data => {
      if (!alive) return;
      const last = Math.max(1, Math.ceil(data.total / pageSize));
      if (page > last) { setNavigation({ key: baseKey, page: last, size: pageSize }); return; }
      setResult({ key: requestKey, scope: scopeKey, client: descriptor.client, data });
      descriptor.onSummary?.(summary, source);
      descriptor.onItemsSummary?.(itemsSummary, source);
    }).catch(error => { if (alive) setResult({ key: requestKey, scope: scopeKey, client: descriptor.client, error: message(error) }); });
    return () => { alive = false; };
  }, [client, requestKey, debounced]);
  const valid = result?.key === requestKey && result?.client === client && search === debounced ? result : undefined;
  // O universo sem busca continua conhecido durante o debounce da mesma consulta-base.
  // Evita desmontar o campo de busca enquanto a pessoa digita; no erro nenhuma contagem antiga sobrevive.
  const knownUniverse = !valid?.error && result?.client === client && result?.scope === scopeKey ? result?.data?.totalWithoutSearch : undefined;
  return { rows: valid?.data?.items || emptyRows, total: valid?.data?.total, totalWithoutSearch: valid?.data?.totalWithoutSearch ?? knownUniverse,
    loading: !!descriptor && !valid, error: valid?.error ? { message: valid.error } : undefined,
    page, pageSize, pageCount: Math.max(1, Math.ceil((valid?.data?.total || 0) / pageSize)),
    setPage: (next: number) => setNavigation({ key: baseKey, page: next, size: pageSize }),
    setPageSize: (next: number) => { if ([10, 20, 50].includes(next)) setNavigation({ key: baseKey, page: 1, size: next as 10 | 20 | 50 }); },
  };
}

export async function allCategoryLabels(client: ERPClient): Promise<string[]> {
  const names = new Set<string>(); let total: number | undefined;
  for (let page = 1;; page++) {
    const result = await client.facets({ resource: 'products', facet: 'category', page, pageSize: 50 });
    if (total !== undefined && total !== result.total) throw new ERPOnlineError('INVALID_RESPONSE');
    total = result.total;
    result.items.forEach(row => { if (typeof row['name'] === 'string' && row['name']) names.add(row['name']); });
    if (!result.hasMore) return [...names];
  }
}
export function useERPCategories(client: ERPClient | undefined, onError: (error: string) => void): string[] {
  const [state, setState] = useState<{ client: ERPClient; names: string[] }>();
  const report = useRef(onError); report.current = onError;
  useEffect(() => {
    if (!client) return;
    let alive = true;
    void allCategoryLabels(client).then(names => { if (alive) setState({ client, names }); }).catch(error => { if (alive) { setState({ client, names: [] }); report.current(message(error)); } });
    return () => { alive = false; };
  }, [client]);
  return state?.client === client ? state?.names || [] : [];
}
export function useERPRecord(client: ERPClient | undefined, resource: 'customers' | 'products', id: string) {
  const enabled = !!client && id.startsWith(resource === 'customers' ? 'sankhya:customer:' : 'sankhya:product:');
  const [state, setState] = useState<{ client: ERPClient; id: string; resource: string; record?: ERPRow | null; error?: string }>();
  useEffect(() => {
    if (!enabled || !client) return;
    let alive = true;
    void client.record({ resource, id }).then(result => { if (alive) setState({ client, resource, id, record: result.record }); })
      .catch(error => { if (alive) setState({ client, resource, id, error: message(error) }); });
    return () => { alive = false; };
  }, [client, resource, id, enabled]);
  const valid = state?.client === client && state?.id === id && state?.resource === resource ? state : undefined;
  return { enabled, record: valid?.record, error: valid?.error };
}

export async function readERPDocument(client: ERPClient, id: string, assertCurrent: () => void): Promise<ERPRow | null> {
  const first = await client.document({ id, offset: 0, limit: 50 });
  assertCurrent();
  if (!first.record) return null;
  const header = JSON.stringify(first.record), items = [...first.items], ids = new Set(items.map(item => item['id']));
  if (ids.size !== items.length) throw new ERPOnlineError('INVALID_RESPONSE');
  for (let offset = items.length; offset < first.total; offset = items.length) {
    assertCurrent();
    const next = await client.document({ id, offset, limit: 50 });
    assertCurrent();
    if (next.total !== first.total || JSON.stringify(next.record) !== header || !next.items.length) throw new ERPOnlineError('INVALID_RESPONSE');
    for (const item of next.items) {
      if (ids.has(item['id'])) throw new ERPOnlineError('INVALID_RESPONSE');
      ids.add(item['id']); items.push(item);
    }
  }
  if (items.length !== first.total) throw new ERPOnlineError('INVALID_RESPONSE');
  return { ...historyPresentation(first.record), items: items.map(item => ({ ...item, qty: item['quantity'], price: item['unitPrice'], name: item['productName'], code: item['productCode'] })) };
}
export function useERPDocument(client: ERPClient | undefined, id: string) {
  const enabled = !!client && /^sankhya:(order|invoice):[1-9]\d*$/.test(id);
  const [state, setState] = useState<{ client: ERPClient; id: string; record?: ERPRow | null; error?: string }>();
  useEffect(() => {
    if (!enabled || !client) return;
    let alive = true;
    void readERPDocument(client, id, () => { if (!alive) throw new ERPOnlineError('REQUEST_CANCELLED'); })
      .then(record => { if (alive) setState({ client, id, record }); })
      .catch(error => { if (alive) setState({ client, id, error: message(error) }); });
    return () => { alive = false; };
  }, [client, id, enabled]);
  const valid = state?.client === client && state?.id === id ? state : undefined;
  return { enabled, record: valid?.record, error: valid?.error };
}

/** Valida a fila antes do RPC e antes de converter origens; não conserva carteira. */
export function assertManualMutation(next: Record<string, any>, before: Record<string, any>): void {
  if (JSON.stringify(next['company']?.erpSeller ?? null) !== JSON.stringify(before['company']?.erpSeller ?? null)) throw new Error('Cadastro ERP disponível somente para consulta.');
  const canonical = new Set<string>();
  function collect(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(collect); return; }
    const row = value as ERPRow;
    if (typeof row['id'] === 'string' && row['id'].startsWith('sankhya:')) canonical.add(row['id']);
    Object.values(row).forEach(collect);
  }
  collect(before);
  function preserve(previous: unknown, value: unknown): void {
    if (!previous || typeof previous !== 'object') return;
    if (Array.isArray(previous)) {
      previous.forEach((row, index) => preserve(row, Array.isArray(value) ? (row?.id ? value.find(item => item?.id === row.id) : value[index]) : undefined));
      return;
    }
    const row = previous as ERPRow;
    if (remoteRow(row) && JSON.stringify(previous) !== JSON.stringify(value)) throw new Error('Cadastro ERP disponível somente para consulta.');
    Object.entries(row).forEach(([key, child]) => preserve(child, value && typeof value === 'object' ? (value as ERPRow)[key] : undefined));
  }
  preserve(before, next);
  function check(value: unknown, previous: unknown, field?: string): void {
    if (field && ['id', 'customerId', 'productId', 'sellerId'].includes(field) && typeof value === 'string' && value.startsWith('sankhya:') && value !== previous && !canonical.has(value)) throw new Error('Cadastro ERP disponível somente para consulta.');
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((row: ERPRow) => check(row, Array.isArray(previous) ? previous.find(item => item?.id === row?.['id']) : undefined)); return; }
    const row = value as ERPRow;
    if (remoteRow(row) && JSON.stringify(row) !== JSON.stringify(previous)) throw new Error('Cadastro ERP disponível somente para consulta.');
    Object.entries(row).forEach(([key, child]) => check(child, previous && typeof previous === 'object' ? (previous as ERPRow)[key] : undefined, key));
  }
  check(next, before);
}
