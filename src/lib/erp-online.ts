import type { ERPSortKey } from './erp-order';
// Leitura online apenas. A identidade abaixo invalida trabalho; a sessão Supabase autentica.
export type ERPResource = 'customers' | 'products' | 'sellers';
export type ERPRow = Record<string, unknown>;
export type ERPPageQuery = { resource: ERPResource; page?: number; pageSize?: 10 | 20 | 50; search?: string; sort?: ERPSortKey; direction?: 'asc' | 'desc'; filters?: { companyCode?: number; sellerCode?: number; managerCode?: number; categoryCode?: number; categoryName?: string; cityCode?: number; customerCode?: number; active?: 'S' | 'N' | 'all' } };
export type ERPWindowQuery = Omit<ERPPageQuery, 'page' | 'pageSize'> & { offset: number; limit: number };
export type ERPRecordQuery = { resource: ERPResource; id: number | string };
export type ERPFacetQuery = ERPPageQuery & { facet: 'category' | 'seller' | 'company' | 'city' };
export type ERPObservation = { source: 'sankhya'; readOnly: true; readAt: string };
export type ERPWindow<T = ERPRow> = ERPObservation & { items: T[]; total: number; totalWithoutSearch: number; offset: number };
export type ERPPage<T = ERPRow> = ERPObservation & { items: T[]; total: number; totalWithoutSearch: number; page: number; pageSize: 10 | 20 | 50; hasMore: boolean };
export type ERPRecord<T = ERPRow> = ERPObservation & { record: T | null };
export type ERPHistoryQuery = { resource: 'orders' | 'invoices'; offset: number; limit: number; customerId?: string; search?: string; sort?: string; direction?: 'asc' | 'desc'; from?: string; to?: string; companyCode?: 1 | 4 };
export type ERPDocumentQuery = { resource?: never; id: string; offset?: number; limit?: number };
export type ERPDocument = ERPObservation & { record: ERPRow | null; items: ERPRow[]; total: number; totalWithoutSearch: number; offset: number; limit: number; hasMore: boolean };
export type ERPPriceQuery = { resource?: never; customerId: string; productId: string; paymentCode: number; type: 'Venda'; sellerCode?: number; quantity?: number; unit?: string; date?: string };
export type ERPPaymentQuery = { resource?: never; customerId: string; offset: number; limit: number; search?: string; date?: string };
export type ERPPrice = ERPObservation & { customer: ERPRow; product: ERPRow; seller: ERPRow; companyCode: 1 | 4; operationCode: 1001; operationVersion: string; quantity: number; payment: { code: number; label: string; version: string }; price: { amount: number; unit: string; localCode: number | null; control: string | null; tableVersion: number | null; provider: 'native-context-api' } };
export type ERPOperation = 'page' | 'window' | 'record' | 'facets' | 'history' | 'document' | 'price-query' | 'payment-options';
type ERPQuery = ERPPageQuery | ERPWindowQuery | ERPRecordQuery | ERPFacetQuery | ERPHistoryQuery | ERPDocumentQuery | ERPPriceQuery | ERPPaymentQuery;
export type ERPTransport = (body: { operation: ERPOperation; query: ERPQuery }, signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>;
const messages = {
  AUTH_REQUIRED: 'Sessão não autorizada. Entre novamente.',
  MEMBERSHIP_PENDING: 'Acesso pendente de ativação pelo administrador.',
  PROFILE_UNAVAILABLE: 'Não foi possível validar o acesso da conta.',
  INVALID_REQUEST: 'Parâmetros de consulta inválidos.',
  INVALID_RESPONSE: 'Resposta ERP inválida ou incompleta.',
  REQUEST_CANCELLED: 'Consulta cancelada por troca de sessão.',
  ERP_IDENTITY_REQUIRED: 'Vínculo ERP necessário para esta consulta.',
  ERP_SCOPE_FORBIDDEN: 'Consulta fora do escopo autorizado.',
  UNAUTHORIZED: 'Sessão não autorizada. Entre novamente.',
  FORBIDDEN: 'Consulta não autorizada.',
  ERP_UNAVAILABLE: 'Consulta ERP indisponível. Tente novamente.',
  ERP_CONTEXT_REQUIRED: 'Contexto comercial ERP incompleto ou não confirmado.',
  ERP_PRICE_AMBIGUOUS: 'Preço ERP sem contexto único confirmado.',
  ERP_INVALID_RESPONSE: 'Resposta ERP inválida ou incompleta.',
  ERP_PRICE_QUERY_FAILED: 'Não foi possível confirmar o preço no ERP.',
  ERP_PAYMENT_SCOPE_UNAVAILABLE: 'Condição de pagamento sem elegibilidade ERP comprovada.',
} as const;
export class ERPOnlineError extends Error {
  readonly code: string;
  constructor(code: string) {
    const safe = Object.hasOwn(messages, code) ? code as keyof typeof messages : 'ERP_UNAVAILABLE';
    super(messages[safe]); this.name = 'ERPOnlineError'; this.code = safe;
  }
}
const object = (value: unknown): value is ERPRow => value !== null && typeof value === 'object' && !Array.isArray(value);
const natural = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function invalid(): never { throw new ERPOnlineError('INVALID_RESPONSE'); }
function observation(data: unknown): asserts data is ERPRow & ERPObservation {
  if (!object(data) || data['source'] !== 'sankhya' || data['readOnly'] !== true || typeof data['readAt'] !== 'string') invalid();
  const timestamp = data['readAt'];
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) invalid();
  const day = timestamp.slice(0, 10);
  if (new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day) invalid();
}
function decode(operation: ERPOperation, data: unknown, query: ERPQuery): ERPRow {
  observation(data);
  if (operation === 'price-query') {
    const q = query as ERPPriceQuery, price = data['price'], payment = data['payment'];
    if (!object(price) || !object(payment) || !object(data['customer']) || !object(data['product']) || !object(data['seller'])) invalid();
    if (data['customer']['id'] !== q.customerId || data['product']['id'] !== q.productId || (data['companyCode'] !== 1 && data['companyCode'] !== 4) || data['operationCode'] !== 1001 || data['quantity'] !== (q.quantity ?? 1) || payment['code'] !== q.paymentCode || typeof payment['label'] !== 'string' || typeof payment['version'] !== 'string' || typeof data['operationVersion'] !== 'string') invalid();
    if (typeof price['amount'] !== 'number' || !Number.isFinite(price['amount']) || price['amount'] <= 0 || typeof price['unit'] !== 'string' || !price['unit'].trim() || (q.unit !== undefined && price['unit'] !== q.unit) || price['provider'] !== 'native-context-api' || (price['localCode'] !== null && !natural(price['localCode'])) || (price['control'] !== null && typeof price['control'] !== 'string') || (price['tableVersion'] !== null && !natural(price['tableVersion']))) invalid();
    return data;
  }
  if (operation === 'document') {
    const q = query as ERPDocumentQuery, items = data['items'], total = data['total'];
    const offset = q.offset ?? 0, limit = q.limit ?? 50, record = data['record'];
    if (record !== null && (!object(record) || record['id'] !== q.id)) invalid();
    if (!Array.isArray(items) || !items.every(object) || !natural(total) || data['totalWithoutSearch'] !== total || data['offset'] !== offset || data['limit'] !== limit || data['hasMore'] !== (offset + items.length < total) || items.length !== Math.min(limit, Math.max(0, total - offset)) || (record === null && total !== 0)) invalid();
    if (items.some(item => typeof item['id'] !== 'string' || !item['id'].startsWith(q.id + ':item:'))) invalid();
    return data;
  }
  if (operation === 'record') {
    if (data['record'] !== null && !object(data['record'])) invalid();
    return data;
  }
  const items = data['items'], total = data['total'], unfiltered = data['totalWithoutSearch'];
  if (!Array.isArray(items) || !items.every(object) || !natural(total) || !natural(unfiltered) || total > unfiltered) invalid();
  let offset: number, limit: number;
  if (operation === 'window' || operation === 'history' || operation === 'payment-options') {
    const q = query as ERPWindowQuery | ERPHistoryQuery | ERPPaymentQuery;
    if (data['offset'] !== q.offset) invalid();
    offset = q.offset; limit = q.limit;
  } else {
    const q = query as ERPPageQuery;
    if (data['page'] !== (q.page ?? 1) || data['pageSize'] !== (q.pageSize ?? 20)) invalid();
    offset = ((q.page ?? 1) - 1) * (q.pageSize ?? 20); limit = q.pageSize ?? 20;
    if (data['hasMore'] !== (offset + items.length < total)) invalid();
  }
  if (items.length !== Math.min(limit, Math.max(0, total - offset))) invalid();
  return data;
}
async function errorCode(value: unknown): Promise<string> {
  if (!object(value)) return 'ERP_UNAVAILABLE';
  if (typeof value['code'] === 'string') return value['code'];
  if (object(value['error'])) return errorCode(value['error']);
  // FunctionsHttpError mantém o envelope de erro na Response, nunca na mensagem pública.
  const context = value['context'];
  if (context instanceof Response) {
    try { return await errorCode(await context.clone().json()); } catch { return 'ERP_UNAVAILABLE'; }
  }
  return 'ERP_UNAVAILABLE';
}
const normalTransport: ERPTransport = async (body, signal) => {
  const { supabase } = await import('./supabase');
  if (signal.aborted) throw new ERPOnlineError('REQUEST_CANCELLED');
  return supabase.functions.invoke('sankhya-online', { body, signal });
};
export function createERPClient(transport: ERPTransport = normalTransport) {
  let identity: string | null = null, generation = 0;
  const pending = new Set<AbortController>();
  function setIdentity(uid: string | null): void {
    if (uid === identity) return;
    identity = uid; generation++;
    for (const controller of pending) controller.abort();
    pending.clear();
  }
  async function request<T>(operation: ERPOperation, query: ERPQuery): Promise<T> {
    if (!query) throw new ERPOnlineError('INVALID_REQUEST');
    if (operation === 'document') {
      const q = query as ERPDocumentQuery;
      if (!/^sankhya:(order|invoice):[1-9]\d*$/.test(q.id) || !natural(q.offset ?? 0) || !natural(q.limit ?? 50) || (q.limit ?? 50) < 1 || (q.limit ?? 50) > 50) throw new ERPOnlineError('INVALID_REQUEST');
    } else if (operation === 'price-query' || operation === 'payment-options') {
      const q = query as ERPPriceQuery | ERPPaymentQuery;
      if (typeof q.customerId !== 'string' || !/^sankhya:customer:[1-9]\d*$/.test(q.customerId)) throw new ERPOnlineError('INVALID_REQUEST');
      if (operation === 'price-query') {
        const p = q as ERPPriceQuery;
        if (!/^sankhya:product:[1-9]\d*$/.test(p.productId) || !natural(p.paymentCode) || p.paymentCode < 1 || p.type !== 'Venda') throw new ERPOnlineError('INVALID_REQUEST');
      }
    } else if (!(operation === 'history' ? ['orders', 'invoices'] : ['customers', 'products', 'sellers']).includes(query.resource!)) throw new ERPOnlineError('INVALID_REQUEST');
    if (operation === 'window' || operation === 'history' || operation === 'payment-options') {
      const q = query as ERPWindowQuery | ERPHistoryQuery | ERPPaymentQuery;
      if (!natural(q.offset) || !natural(q.limit) || q.limit < 1 || q.limit > 50) throw new ERPOnlineError('INVALID_REQUEST');
    }
    const current = generation, controller = new AbortController(); pending.add(controller);
    const assertCurrent = () => { if (current !== generation || controller.signal.aborted) throw new ERPOnlineError('REQUEST_CANCELLED'); };
    let onAbort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(new ERPOnlineError('REQUEST_CANCELLED')); controller.signal.addEventListener('abort', onAbort, { once: true }); });
    try {
      const result = await Promise.race([transport({ operation, query }, controller.signal), cancelled]);
      assertCurrent();
      if (result.error || (object(result.data) && result.data['error'])) {
        const code = await Promise.race([errorCode(result.error || result.data), cancelled]);
        assertCurrent(); throw new ERPOnlineError(code);
      }
      assertCurrent(); return decode(operation, result.data, query) as T;
    } catch (error) {
      assertCurrent();
      if (error instanceof ERPOnlineError) throw error;
      throw new ERPOnlineError('ERP_UNAVAILABLE');
    } finally { pending.delete(controller); controller.signal.removeEventListener('abort', onAbort); }
  }
  return {
    setIdentity,
    page: <T = ERPRow>(query: ERPPageQuery) => request<ERPPage<T>>('page', query),
    window: <T = ERPRow>(query: ERPWindowQuery) => request<ERPWindow<T>>('window', query),
    record: <T = ERPRow>(query: ERPRecordQuery) => request<ERPRecord<T>>('record', query),
    facets: <T = ERPRow>(query: ERPFacetQuery) => request<ERPPage<T>>('facets', query),
    history: <T = ERPRow>(query: ERPHistoryQuery) => request<ERPWindow<T>>('history', query),
    document: (query: ERPDocumentQuery) => request<ERPDocument>('document', query),
    price: (query: ERPPriceQuery) => request<ERPPrice>('price-query', query),
    paymentOptions: <T = ERPRow>(query: ERPPaymentQuery) => request<ERPWindow<T>>('payment-options', query),
  };
}
export const erpClient = createERPClient();
