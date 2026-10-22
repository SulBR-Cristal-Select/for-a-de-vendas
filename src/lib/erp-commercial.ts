// Contrato comercial local: nenhuma chamada ao ERP, credencial ou regra inferida.
type Row = Record<string, unknown>;
export type ERPContext = { companyCode: number; tableCode: number; localCode: number; control: string; paymentCodes: number[]; creditBlocked: boolean };
export type CommercialPrice = { price: number; unit?: string; erp?: Row };
const row = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.map(row) : [];
const fail = (message: string): never => { throw new Error(message); };
const integer = (value: unknown, minimum = 0): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum ? value : fail('Código ERP inválido.');
export const isERP = (value: unknown): boolean => row(row(value)['erp'])['source'] === 'sankhya';
function source(value: unknown): Row {
  const erp = row(row(value)['erp']);
  if (erp['source'] !== 'sankhya') fail('Cadastro sem identidade Sankhya comprovada.');
  return erp;
}
function day(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('Data comercial inválida.');
  return value;
}
// Escalas inteiras evitam tolerância monetária e arredondamento de quantidades.
function scaled(value: unknown, places: number): bigint {
  if (typeof value !== 'number' && typeof value !== 'string') return fail('Valor numérico inválido.');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return fail('Valor numérico inválido.');
  const fraction = (match[2] || '').replace(/0+$/, '');
  if (fraction.length > places) return fail('Precisão não representável sem arredondamento.');
  return BigInt(match[1]!) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0');
}
function amount(value: unknown): number {
  const cents = scaled(value, 2);
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) return fail('Preço não representável com exatidão.');
  const result = Number(cents) / 100;
  if (scaled(result, 2) !== cents) fail('Valor não representável com exatidão neste navegador.');
  return result;
}
export function quantityRules(product: unknown, unit?: string): { min: number; step: number; decimals: number } {
  const p = row(product);
  let decimals = 0;
  if (isERP(p)) {
    const erp = source(p), actual = unit || p['unit'];
    if (typeof actual !== 'string' || !actual.trim()) fail('Unidade ERP não configurada.');
    const units = row(erp['units']);
    const configured = units[String(actual)] ?? (actual === p['unit'] ? erp['quantityDecimals'] : undefined);
    decimals = integer(configured);
    if (decimals > 3) fail('Precisão da quantidade não representável neste contrato.');
  }
  const multiple = p['multiple'] == null ? 0 : Number(p['multiple']);
  if (!Number.isFinite(multiple) || multiple < 0) fail('Múltiplo de venda inválido.');
  const step = multiple > 0 ? multiple : 10 ** -decimals;
  return { min: isERP(p) ? step : 1, step: isERP(p) ? step : 1, decimals };
}
export function validQuantity(product: unknown, value: unknown, unit?: string): boolean {
  try {
    const rules = quantityRules(product, unit), quantity = scaled(value, rules.decimals);
    if (quantity <= 0n || Number(value) > 100000000) return false;
    const multiple = row(product)['multiple'];
    return multiple == null || scaled(value, 3) % scaled(multiple, 3) === 0n;
  } catch { return false; }
}
export function commercialTotal(items: unknown[], freight: unknown = 0): number {
  let cents = scaled(freight ?? 0, 2);
  for (const value of items) {
    const item = row(value);
    cents += (scaled(item['qty'] ?? 0, 3) * scaled(item['price'] ?? 0, 2) + 500n) / 1000n;
  }
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) fail('Total não representável com exatidão.');
  const result = Number(cents) / 100;
  if (scaled(result, 2) !== cents) fail('Valor não representável com exatidão neste navegador.');
  return result;
}
export function erpContext(customer: unknown, requestedCompany?: unknown): ERPContext {
  const erp = source(customer), contexts = list(erp['contexts']);
  const selected = requestedCompany ?? erp['defaultCompanyCode'];
  const choices = selected == null ? contexts : contexts.filter((context) => context['companyCode'] === selected);
  if (choices.length !== 1) return fail('Filial comercial ausente ou ambígua; não será escolhida automaticamente.');
  const context = choices[0]!, companyCode = integer(context['companyCode'], 1);
  if (![1, 4].includes(companyCode)) fail('Empresa ERP fora do escopo SulBR.');
  if (typeof context['control'] !== 'string' || context['control'].length > 17 || !Array.isArray(context['paymentCodes']) || typeof (context['creditBlocked'] ?? erp['creditBlocked']) !== 'boolean') fail('Vínculo comercial ERP incompleto.');
  return { companyCode, tableCode: integer(context['tableCode']), localCode: integer(context['localCode']), control: String(context['control']), paymentCodes: (context['paymentCodes'] as unknown[]).map((code) => integer(code, 1)), creditBlocked: Boolean(context['creditBlocked'] ?? erp['creditBlocked']) };
}
function catalog(state: unknown, key: string): Row[] { return list(row(row(state)['erpCommercial'])[key]); }
export function commercialPrice(state: unknown, customer: unknown, product: unknown, date: string, requestedCompany?: unknown, requestedUnit?: string): CommercialPrice {
  const p = row(product);
  if (p['active'] === false) fail('Produto inativo.');
  if (!isERP(customer) && !isERP(product)) return { price: amount(p['price']) };
  if (!isERP(customer) || !isERP(product)) return fail('Cliente e produto exigem vínculos ERP compatíveis.');
  const context = erpContext(customer, requestedCompany), unit = requestedUnit || p['unit'];
  quantityRules(p, typeof unit === 'string' ? unit : undefined);
  day(date);
  const tables = catalog(state, 'priceTables').filter((table) => table['erp_company'] === context.companyCode && table['table_code'] === context.tableCode && String(table['valid_from']) <= date);
  const latestDay = tables.map((table) => String(table['valid_from'])).sort().at(-1);
  const versions = tables.filter((table) => table['valid_from'] === latestDay);
  if (versions.length !== 1 || versions[0]!['active'] !== true) return fail('Tabela de preço sem versão vigente única e ativa.');
  const table = versions[0]!, prices = catalog(state, 'prices').filter((price) => price['erp_company'] === context.companyCode && price['version_code'] === table['version_code'] && price['product_id'] === p['id'] && price['unit'] === unit && price['local_code'] === context.localCode && price['control'] === context.control && price['source_type'] === 'V');
  if (prices.length !== 1) return fail('Preço exato não configurado para produto, unidade e vínculo do cliente.');
  return { price: amount(prices[0]!['amount']), unit: String(unit), erp: { companyCode: context.companyCode, tableCode: context.tableCode, versionCode: table['version_code'], validFrom: table['valid_from'], localCode: context.localCode, control: context.control } };
}
function currentTerms(state: unknown, customer: unknown, date: string, company?: unknown): Row[] {
  day(date);
  const context = erpContext(customer, company), all = catalog(state, 'paymentTerms').filter((term) => term['erp_company'] === context.companyCode && String(term['changed_at']).slice(0, 10) <= date);
  return all.filter((term) => context.paymentCodes.includes(Number(term['code'])) && term['active'] === true && !all.some((other) => other['code'] === term['code'] && String(other['changed_at']) > String(term['changed_at'])));
}
export function commercialPayment(state: unknown, customer: unknown, label: string, date: string, company?: unknown): Row {
  const context = erpContext(customer, company), terms = currentTerms(state, customer, date, company).filter((term) => term['label'] === label);
  if (terms.length !== 1) return fail('Condição de pagamento ERP não autorizada ou ambígua para cliente e filial.');
  const term = terms[0]!;
  if (context.creditBlocked && term['is_credit'] !== false) fail('Cliente com venda a prazo bloqueada; a condição deve ser comprovadamente à vista.');
  if (!Array.isArray(term['installments']) || term['installments'].length === 0) fail('Condição sem parcelas comprovadas.');
  return { companyCode: context.companyCode, paymentCode: term['code'], paymentVersion: term['changed_at'], installments: term['installments'], paymentRules: term['rules'] };
}
export function commercialPaymentOptions(state: unknown, customer: unknown, date: string): string[] {
  if (!isERP(customer)) return Array.isArray(row(state)['payments']) ? row(state)['payments'] as string[] : [];
  try { return [...new Set(currentTerms(state, customer, date).filter((term) => { try { commercialPayment(state, customer, String(term['label']), date); return true; } catch { return false; } }).map((term) => String(term['label'])))]; } catch { return []; }
}
export function commercialItem(state: unknown, customerId: string, productId: string, date: string, existing?: Row): Row {
  const customer = list(row(state)['customers']).find((value) => value['id'] === customerId), product = list(row(state)['products']).find((value) => value['id'] === productId);
  if (!product) return fail('Produto não encontrado.');
  const price = commercialPrice(state, customer, product, date);
  return { ...(existing || {}), productId, qty: existing?.['qty'] ?? 1, price: price.price, ...(price.erp ? { unit: price.unit, erp: price.erp } : {}) };
}
export function prepareCommercialOrder(state: unknown, order: Row): Row {
  const customer = list(row(state)['customers']).find((value) => value['id'] === order['customerId']);
  if (!isERP(customer)) {
    if (list(order['items']).some((item) => isERP(list(row(state)['products']).find((product) => product['id'] === item['productId'])))) fail('Cliente sem vínculo ERP para os produtos selecionados.');
    return order;
  }
  const date = day(String(order['date'])), context = erpContext(customer, row(order['erp'])['companyCode']);
  const payment = commercialPayment(state, customer, String(order['payment'] || ''), date, context.companyCode);
  const items = list(order['items']).map((item) => {
    const product = list(row(state)['products']).find((value) => value['id'] === item['productId']);
    const expected = commercialPrice(state, customer, product, date, context.companyCode, typeof item['unit'] === 'string' ? item['unit'] : undefined);
    if (scaled(item['price'], 2) !== scaled(expected.price, 2)) fail('Preço alterado; recarregue a condição comercial antes de salvar.');
    if (!validQuantity(product, item['qty'], expected.unit)) fail('Quantidade fora da precisão ou múltiplo configurado.');
    return { ...item, unit: expected.unit, erp: expected.erp };
  });
  return { ...order, items, total: commercialTotal(items, order['freight'] ?? 0), erp: { companyCode: context.companyCode, tableCode: context.tableCode, ...payment } };
}
