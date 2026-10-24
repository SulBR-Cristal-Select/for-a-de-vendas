import { SankhyaError, type SankhyaGateway } from './gateway.ts';
import { readPrice } from './price-context.ts';
import { readPaymentRules } from './payments.ts';
import { commercialTotal, quantityRules } from '../../../src/lib/erp-commercial.ts';
type Row = Record<string, unknown>;
type Transport = Pick<SankhyaGateway, 'select' | 'contextPrices'>;
type Actor = { id: string; company_id: string; role: string; active: boolean };
export type RPC = (name: string, args: Row) => Promise<{ data: unknown; error: unknown }>;
export type Attest = (args: Row) => Promise<unknown>;
const fail = (code: string, message: string, status = 400): never => { throw new SankhyaError(code, message, status); };
const object = (v: unknown): Row => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : fail('INVALID_REQUEST', 'Estado comercial inválido.');
const text = (v: unknown): string => typeof v === 'string' && v.trim() ? v : fail('ERP_CONTEXT_REQUIRED', 'Referência comercial não confirmada.');
const code = (v: unknown): number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 9999999999 ? v : fail('ERP_CONTEXT_REQUIRED', 'Código comercial não confirmado.');
function rpcError(error: unknown): never {
  const e = object(error);
  if (e['code'] === 'PT409') return fail('REVISION_CONFLICT', 'Recarregue os dados antes de salvar.', 409);
  if (e['code'] === '42501') return fail('FORBIDDEN', 'Gravação fora do acesso autorizado.', 403);
  const message = String(e['message'] || '');
  if (message.includes('ERP_PROOF_EXPIRED')) return fail('ERP_PROOF_EXPIRED', 'Revalidação expirada. Confira o pedido antes de tentar novamente.', 409);
  return fail('ERP_REVALIDATION_UNAVAILABLE', 'Não foi possível confirmar a transação no servidor.', 503);
}
export async function revalidateOrderRequest(gateway: Transport, input: unknown, actor: Actor, rpc: RPC, attest: Attest) {
  if (!actor.active || actor.company_id !== '432299' || actor.role !== 'administrador') return fail('ERP_IDENTITY_REQUIRED', 'Vínculo ERP explícito necessário.', 403);
  const request = object(input);
  if (Object.keys(request).some(k => !['state','expectedRevision','requestId'].includes(k))) return fail('INVALID_REQUEST', 'Parâmetros de revalidação inválidos.');
  const state = object(request['state']), identity = object(state['company']), revision = request['expectedRevision'], requestId = request['requestId'];
  if (identity['id'] !== actor.company_id || identity['userId'] !== actor.id || identity['role'] !== 'Administrador') return fail('FORBIDDEN', 'Identidade não pode ser informada pelo navegador.', 403);
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0 || typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return fail('INVALID_REQUEST', 'Revisão ou identificador de gravação inválido.');
  const args = { p_state: state, p_expected_revision: revision, p_request_id: requestId };
  const check = await rpc('erp_order_preflight', args);
  if (check.error) return rpcError(check.error);
  const context = object(check.data), required = context['requiredOrders'];
  if (typeof context['replay'] !== 'boolean' || typeof context['proofReady'] !== 'boolean' || !Array.isArray(required) || !required.every(id => typeof id === 'string') || new Set(required).size !== required.length) return fail('ERP_INVALID_RESPONSE', 'Pré-validação transacional incompleta.', 502);
  // Mesmo UUID, revisão e estado: ledger antes de prazo/consumo; não repetir preço em reenvio.
  if (context['replay'] || context['proofReady'] || required.length === 0) return { ready: true, replay: context['replay'], proofReady: context['proofReady'] };
  if (!Array.isArray(state['orders'])) return fail('INVALID_REQUEST', 'Pedidos inválidos.');
  const orders = state['orders'].map(object);
  const selected = required.map(id => {
    const rows = orders.filter(o => o['id'] === id);
    if (rows.length !== 1) return fail('INVALID_REQUEST', 'Pedido da revalidação não encontrado de forma única.');
    return rows[0]!;
  });
  if (selected.reduce((sum, o) => sum + (Array.isArray(o['items']) ? o['items'].length : 51), 0) > 50) return fail('INVALID_REQUEST', 'Revalidação limitada a cinquenta itens por gravação.');
  const verified: Row[] = [];
  for (const order of selected) {
    const erp = object(order['erp']), customerId = text(order['customerId']), date = text(order['date']);
    if (!/^sankhya:customer:[1-9]\d*$/.test(customerId) || erp['source'] !== 'sankhya' || erp['mode'] !== 'online' || order['type'] !== 'Venda' || !Array.isArray(order['items']) || !order['items'].length) return fail('ERP_CONTEXT_REQUIRED', 'Pedido ERP exige cliente e itens ERP compatíveis.');
    const paymentCode = code(object(erp['payment'])['code']);
    const items: Row[] = [], seen = new Set<string>();
    let commercial: Row | undefined, sellerCode: number | undefined, companyCode: 1 | 4 | undefined, paymentVersion: string | undefined;
    for (const rawItem of order['items']) {
      const item = object(rawItem), productId = text(item['productId']);
      if (!/^sankhya:product:[1-9]\d*$/.test(productId) || seen.has(productId)) return fail('ERP_CONTEXT_REQUIRED', 'Produto ERP ausente, misturado ou duplicado.');
      seen.add(productId);
      const quantity = item['qty'], price = item['price'], unit = text(item['unit']);
      if (typeof quantity !== 'number' || typeof price !== 'number') return fail('ERP_CONTEXT_REQUIRED', 'Quantidade e preço exatos obrigatórios.');
      const quote = await readPrice(gateway, { customerId, productId, type: 'Venda', paymentCode, date, quantity, unit, ...(erp['sellerCode'] !== undefined ? { sellerCode: code(erp['sellerCode']) } : {}) }, { role: 'administrador' });
      if (quote.price.amount !== price) return fail('ERP_PRICE_CHANGED', 'Preço ERP alterado ou diferente do valor confirmado. Confira o pedido.', 409);
      try { commercialTotal([{ qty: quantity, price }]); } catch { return fail('ERP_PRICE_PRECISION_UNSUPPORTED', 'Preço não representável em centavos sem arredondamento.'); }
      const customer = object(quote.customer), customerERP = object(customer['erp']), product = object(quote.product), productERP = object(product['erp']), seller = object(quote.seller), sellerERP = object(seller['erp']);
      const actualSeller = code(sellerERP['sellerCode']);
      if (erp['companyCode'] !== undefined && erp['companyCode'] !== quote.companyCode || erp['operationCode'] !== undefined && erp['operationCode'] !== quote.operationCode || order['payment'] !== quote.payment.label) return fail('ERP_CONTEXT_REQUIRED', 'Contexto do pedido diverge do ERP.');
      if (companyCode !== undefined && (companyCode !== quote.companyCode || sellerCode !== actualSeller || paymentVersion !== quote.payment.version)) return fail('ERP_CONTEXT_REQUIRED', 'Contexto comercial mudou durante a revalidação.');
      if (typeof quote.price.localCode !== 'number' || typeof quote.price.control !== 'string') return fail('ERP_CONTEXT_REQUIRED', 'Local e controle não confirmados na resposta nativa.');
      companyCode = quote.companyCode; sellerCode = actualSeller; paymentVersion = quote.payment.version;
      if (!commercial) {
        const payment = await readPaymentRules(gateway, { partnerCode: code(customerERP['partnerCode']), companyCode, date, creditBlocked: customerERP['creditBlocked'] === true }, paymentCode, { role: 'administrador' });
        if (payment.version !== quote.payment.version || payment.label !== quote.payment.label) return fail('ERP_CONTEXT_REQUIRED', 'Condição mudou durante a revalidação.');
        commercial = { source: 'sankhya', mode: 'online', companyCode, operationCode: quote.operationCode, operationVersion: quote.operationVersion, sellerCode, sellerName: text(seller['name']), customer: { id: customerId, partnerCode: code(customerERP['partnerCode']), name: text(customer['name']), fantasy: customer['fantasy'] ?? null }, payment, creditBlocked: customerERP['creditBlocked'], readAt: quote.readAt, date, provider: 'native-context-api', tableCode: null, tableVersion: null };
      }
      const rules = quantityRules(product, unit);
      items.push({ productId, qty: quantity, price, unit, erp: { source: 'sankhya', mode: 'online', product: { id: productId, productCode: code(productERP['productCode']), name: text(product['name']) }, quantityDecimals: rules.decimals, sourceQuantityDecimals: productERP['quantityDecimals'], fractionBlocked: productERP['fractionBlocked'], multiple: product['multiple'] ?? null, companyCode, localCode: quote.price.localCode, control: quote.price.control, readAt: quote.readAt, provider: 'native-context-api', tableCode: null, tableVersion: null } });
    }
    if (!commercial) return fail('ERP_CONTEXT_REQUIRED', 'Revalidação comercial incompleta.');
    commercialTotal(items);
    verified.push({ id: order['id'], requested: order, erp: commercial, items });
  }
  const receipt = object(await attest({ p_actor_id: actor.id, ...args, p_verified_orders: verified }));
  if (receipt['ready'] !== true) return fail('ERP_REVALIDATION_UNAVAILABLE', 'Prova comercial não registrada pelo servidor.', 503);
  return { ready: true, replay: false, proofReady: true };
}
