import { describe, expect, it } from 'vitest';
import { commercialItem, commercialPayment, commercialPaymentOptions, commercialPrice, commercialTotal, erpContext, prepareCommercialOrder, quantityRules, validQuantity } from './erp-commercial';

function fixture() {
  const product = { id: 'produto-erp', active: true, price: 999, unit: 'PC', erp: { source: 'sankhya', productCode: 99000001, quantityDecimals: 2, units: { PC: 2, UN: 0 } } };
  const context = { companyCode: 1, tableCode: 1296, localCode: 0, control: ' ', paymentCodes: [29], creditBlocked: false };
  const customer = { id: 'cliente-erp', erp: { source: 'sankhya', partnerCode: 99000001, sellerCode: 12, contexts: [context] } };
  const state = { products: [product], customers: [customer], payments: ['Legado'], erpCommercial: {
    priceTables: [{ erp_company: 1, table_code: 1296, version_code: 3047, valid_from: '2026-09-23', active: true }],
    prices: [{ erp_company: 1, version_code: 3047, product_id: product.id, unit: 'PC', local_code: 0, control: ' ', source_type: 'V', amount: 10.56 }],
    paymentTerms: [{ erp_company: 1, code: 29, changed_at: '2026-06-10T11:47:42', label: 'A PRAZO - 21/28 DIAS', active: true, is_credit: true, installments: [{ sequence: 1, days: 21, percentage: 50 }, { sequence: 2, days: 28, percentage: 50 }], rules: { basePrazo: -1 } }],
  } };
  return { state, customer, product, context };
}
const date = '2026-10-22';

describe('Quantidade sem arredondamento ou conversão inferida', () => {
  it('preserva inteiro positivo para produto manual', () => {
    expect(quantityRules({ price: 10 })).toEqual({ min: 1, step: 1, decimals: 0 });
    expect(validQuantity({}, 0.23)).toBe(false);
    expect(validQuantity({}, 1)).toBe(true);
  });
  it.each([0.23, 24.5, 371.92, 1, 0.01])('aceita %s na precisão cadastrada', (qty) => expect(validQuantity(fixture().product, qty, 'PC')).toBe(true));
  it.each([0.231, 0, -1, null, NaN, Infinity, 100000001])('recusa %s sem arredondar', (qty) => expect(validQuantity(fixture().product, qty, 'PC')).toBe(false));
  it('não trata 12X1 no nome como múltiplo', () => expect(validQuantity({ ...fixture().product, name: 'Água 12X1' }, 0.23)).toBe(true));
  it('respeita múltiplo explicitamente cadastrado', () => {
    const p = { ...fixture().product, multiple: 0.25 };
    expect(validQuantity(p, 0.5)).toBe(true); expect(validQuantity(p, 0.23)).toBe(false);
  });
  it('não converte PC para unidade desconhecida e recusa precisão maior que três', () => {
    expect(() => quantityRules(fixture().product, 'KG')).toThrow();
    expect(validQuantity({ ...fixture().product, erp: { source: 'sankhya', quantityDecimals: 4 } }, 1)).toBe(false);
  });
  it('arredonda somente o total de cada linha, em centavos', () => {
    expect(commercialTotal([{ qty: 0.23, price: 10.56 }])).toBe(2.43);
    expect(commercialTotal([{ qty: 0.5, price: 0.01 }, { qty: 0.5, price: 0.01 }])).toBe(0.02);
    expect(commercialTotal([{ qty: 300, price: 10.56 }, { qty: 224, price: 9.2 }, { qty: 450, price: 8.4 }])).toBe(9008.8);
    expect(() => commercialTotal([{ qty: 0.0001, price: 10 }])).toThrow();
  });
});

describe('Preço ERP exato e contexto empresarial', () => {
  it('não utiliza base 999, fator ou referência de cadastro como preço ERP', () => {
    const { state, customer, product } = fixture();
    expect(commercialPrice({ ...state, priceTablesBase: { qualquer: { '*': 0.01 } } }, { ...customer, refItems: [{ productId: product.id, price: 0.01 }] }, product, date)).toMatchObject({ price: 10.56, unit: 'PC', erp: { companyCode: 1, tableCode: 1296, versionCode: 3047, control: ' ' } });
  });
  it('preserva preço base para cadastros manuais', () => expect(commercialPrice({}, {}, { price: 12.34 }, date)).toEqual({ price: 12.34 }));
  it('recusa mistura de cliente manual com produto ERP e vice-versa', () => {
    const f = fixture();
    expect(() => commercialPrice(f.state, {}, f.product, date)).toThrow();
    expect(() => commercialPrice(f.state, f.customer, { price: 10 }, date)).toThrow();
  });
  it.each(['2026-02-30', '22/10/2026', ''])('recusa data %s', (invalid) => {
    const f = fixture(); expect(() => commercialPrice(f.state, f.customer, f.product, invalid)).toThrow('Data');
  });
  it('não escolhe filial 3 nem escolhe entre 1 e 4 sem definição', () => {
    const { customer, context } = fixture();
    expect(() => erpContext({ erp: { ...customer.erp, contexts: [{ ...context, companyCode: 3 }] } })).toThrow();
    const shared = { erp: { ...customer.erp, contexts: [context, { ...context, companyCode: 4 }] } };
    expect(() => erpContext(shared)).toThrow('ambígua');
    expect(erpContext(shared, 4).companyCode).toBe(4);
    expect(() => erpContext(shared, 432299)).toThrow();
  });
  it('exige local e controle explícitos, preservando espaço', () => {
    const f = fixture(); expect(erpContext(f.customer).control).toBe(' ');
    expect(() => erpContext({ erp: { source: 'sankhya', contexts: [{ ...f.context, control: null }] } })).toThrow();
  });
  it('exclui vigência futura e não volta à versão anterior quando a última está inativa', () => {
    const f = fixture(); f.state.erpCommercial.priceTables.push({ erp_company: 1, table_code: 1296, version_code: 4000, valid_from: '2026-10-23', active: true });
    expect(commercialPrice(f.state, f.customer, f.product, date).price).toBe(10.56);
    f.state.erpCommercial.priceTables.push({ erp_company: 1, table_code: 1296, version_code: 3999, valid_from: '2026-10-21', active: false });
    expect(() => commercialPrice(f.state, f.customer, f.product, date)).toThrow();
  });
  it('recusa empate de vigência em vez de escolher maior NUTAB', () => {
    const f = fixture(); f.state.erpCommercial.priceTables.push({ ...f.state.erpCommercial.priceTables[0]!, version_code: 9999 });
    expect(() => commercialPrice(f.state, f.customer, f.product, date)).toThrow('única');
  });
  it.each(['unit', 'local_code', 'control', 'source_type'])('não usa linha incompatível por %s', (field) => {
    const f = fixture(); Object.assign(f.state.erpCommercial.prices[0]!, { [field]: field === 'local_code' ? 1 : 'incompatível' });
    expect(() => commercialPrice(f.state, f.customer, f.product, date)).toThrow('Preço exato');
  });
  it('mantém preço decimal textual e recusa um valor sem representação exata no navegador', () => {
    const f = fixture();
    Object.assign(f.state.erpCommercial.prices[0]!, { amount: '10.56' });
    expect(commercialPrice(f.state, f.customer, f.product, date).price).toBe(10.56);
    Object.assign(f.state.erpCommercial.prices[0]!, { amount: '90071992547409.91' });
    expect(() => commercialPrice(f.state, f.customer, f.product, date)).toThrow('representável');
  });
  it('não arredonda preço com mais de dois decimais', () => {
    const f = fixture(); f.state.erpCommercial.prices[0]!.amount = 10.561;
    expect(() => commercialPrice(f.state, f.customer, f.product, date)).toThrow('Precisão');
  });
});

describe('Pagamento e preparação nos controles existentes', () => {
  it('captura código/versão e mantém as parcelas como observadas', () => {
    const f = fixture();
    expect(commercialPayment(f.state, f.customer, 'A PRAZO - 21/28 DIAS', date)).toMatchObject({ companyCode: 1, paymentCode: 29, paymentVersion: '2026-06-10T11:47:42', installments: f.state.erpCommercial.paymentTerms[0]!.installments });
    expect(commercialPaymentOptions(f.state, f.customer, date)).toEqual(['A PRAZO - 21/28 DIAS']);
    expect(commercialPaymentOptions(f.state, {}, date)).toEqual(['Legado']);
  });
  it('não libera condição por nome conhecido, filial diferente ou código não vinculado', () => {
    const f = fixture();
    expect(() => commercialPayment(f.state, f.customer, 'Legado', date)).toThrow();
    f.state.erpCommercial.paymentTerms[0]!.erp_company = 4;
    expect(commercialPaymentOptions(f.state, f.customer, date)).toEqual([]);
  });
  it('última versão inativa não faz voltar ao pagamento antigo', () => {
    const f = fixture(); f.state.erpCommercial.paymentTerms.push({ ...f.state.erpCommercial.paymentTerms[0]!, changed_at: '2026-10-21T10:00:00', active: false });
    expect(() => commercialPayment(f.state, f.customer, 'A PRAZO - 21/28 DIAS', date)).toThrow();
  });
  it('bloqueio de venda a prazo não bloqueia uma condição comprovadamente à vista', () => {
    const f = fixture(); f.context.creditBlocked = true;
    expect(() => commercialPayment(f.state, f.customer, 'A PRAZO - 21/28 DIAS', date)).toThrow('prazo');
    f.state.erpCommercial.paymentTerms[0]!.is_credit = false;
    expect(commercialPayment(f.state, f.customer, 'A PRAZO - 21/28 DIAS', date)['paymentCode']).toBe(29);
  });
  it('não corrige 99,99% nem inventa datas de cobrança', () => {
    const f = fixture(); f.state.erpCommercial.paymentTerms[0]!.installments = [1, 2, 3].map((sequence) => ({ sequence, days: sequence * 7, percentage: 33.33 }));
    expect(commercialPayment(f.state, f.customer, 'A PRAZO - 21/28 DIAS', date)['installments']).toEqual(f.state.erpCommercial.paymentTerms[0]!.installments);
  });
  it('prepara item e pedido com fração, origem e total exato sem alterar o catálogo', () => {
    const f = fixture(), before = structuredClone(f.state);
    const item = commercialItem(f.state, f.customer.id, f.product.id, date, { qty: 0.23 });
    const order = prepareCommercialOrder(f.state, { customerId: f.customer.id, date, payment: 'A PRAZO - 21/28 DIAS', items: [item] });
    expect(order['total']).toBe(2.43); expect(order['erp']).toMatchObject({ tableCode: 1296, paymentCode: 29 });
    expect(f.state).toEqual(before);
  });
  it('não troca preço manipulado silenciosamente no envio', () => {
    const f = fixture();
    expect(() => prepareCommercialOrder(f.state, { customerId: f.customer.id, date, payment: 'A PRAZO - 21/28 DIAS', items: [{ productId: f.product.id, price: 999, qty: 1 }] })).toThrow('Preço alterado');
  });
});
