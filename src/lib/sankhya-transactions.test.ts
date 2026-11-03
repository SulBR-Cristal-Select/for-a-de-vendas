// Fixtures sintéticas: nenhum acesso ERP, prova real ou gravação de banco.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidateOrderRequest } from '../../supabase/functions/sankhya-online/transactions';
import { readPrice } from '../../supabase/functions/sankhya-online/price-context';
import { readPaymentRules } from '../../supabase/functions/sankhya-online/payments';
vi.mock('../../supabase/functions/sankhya-online/price-context', () => ({ readPrice: vi.fn() }));
vi.mock('../../supabase/functions/sankhya-online/payments', () => ({ readPaymentRules: vi.fn() }));
const actor = { id: '00000000-0000-4000-8000-000000000001', company_id: '432299', role: 'administrador', active: true, binding: { userId: '00000000-0000-4000-8000-000000000001', sellerId: 'sankhya:seller:14', sellerCode: 14, companyCodes: [1, 4] as const } };
const customerId = 'sankhya:customer:99000001', productId = 'sankhya:product:99000002';
const payment = { code: 29, label: 'CONDIÇÃO SINTÉTICA', version: '2026-06-10T11:47:42', isCredit: true, installments: [{ sequence: 1, days: 21, percentage: 100 }], rules: { hasFormula: false } };
const order = () => ({ id: 'pedido-local-sintetico', sellerId: actor.id, customerId, type: 'Venda', date: '2026-10-23', payment: payment.label, erp: { source: 'sankhya', mode: 'online', companyCode: 1, operationCode: 1001, sellerCode: 14, payment: { code: 29 } }, items: [{ productId, qty: 0.12345, price: 10.56, unit: 'KG' }] });
function fixture() {
  const state = { company: { id: '432299', userId: actor.id, role: 'Administrador' }, orders: [order()], products: [], customers: [] };
  const request = { state, expectedRevision: 20, requestId: '00000000-0000-4000-8000-000000000002' };
  const rpc = vi.fn().mockResolvedValue({ data: { replay: false, proofReady: false, requiredOrders: [state.orders[0]!.id] }, error: null });
  const attest = vi.fn().mockResolvedValue({ ready: true }), gateway = { select: vi.fn(), contextPrices: vi.fn() };
  return { state, request, rpc, attest, gateway };
}
const quote = () => ({ source: 'sankhya', readOnly: true, readAt: '2026-10-23T22:00:00Z', customer: { id: customerId, name: 'PARCEIRO SINTÉTICO', fantasy: null, erp: { partnerCode: 99000001, creditBlocked: false } }, product: { id: productId, name: 'PRODUTO SINTÉTICO', unit: 'KG', multiple: null, erp: { source: 'sankhya', productCode: 99000002, quantityDecimals: 5, fractionBlocked: false } }, seller: { name: 'VENDEDOR SINTÉTICO', erp: { sellerCode: 14 } }, companyCode: 1, operationCode: 1001, operationVersion: '2026-07-21T08:04:13', quantity: 0.12345, payment, price: { amount: 10.56, unit: 'KG', localCode: 0, control: ' ', tableVersion: null, provider: 'native-context-api' } });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(readPrice).mockResolvedValue(quote() as any); vi.mocked(readPaymentRules).mockResolvedValue(payment as any); });
describe('Revalidação do ator real antes da gravação normal', () => {
  it('mantém ator Auth, UUID, revisão e estado congelado; não replica catálogo nem inventa tabela', async () => {
    const f = fixture();
    expect(await revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest)).toEqual({ ready: true, replay: false, proofReady: true });
    expect(f.rpc).toHaveBeenCalledWith('erp_order_preflight', { p_state: f.state, p_expected_revision: 20, p_request_id: f.request.requestId });
    const args = f.attest.mock.calls[0]![0];
    expect(args.p_actor_id).toBe(actor.id);
    expect(args.p_request_id).toBe(f.request.requestId);
    expect(args.p_verified_orders[0]).toMatchObject({ requested: f.state.orders[0], erp: { sellerCode: 14, companyCode: 1, tableCode: null, tableVersion: null }, items: [{ qty: 0.12345, price: 10.56, erp: { quantityDecimals: 5, tableVersion: null, control: ' ' } }] });
    expect(f.state.products).toEqual([]); expect(f.state.customers).toEqual([]);
    expect(f.rpc).toHaveBeenCalledTimes(1); // Não salva pedido sob identidade técnica.
  });
  it.each([{ replay: true, proofReady: true }, { replay: false, proofReady: true }])('consulta ledger/prova existente antes de repetir preço: %j', async flags => {
    const f = fixture(); f.rpc.mockResolvedValue({ data: { ...flags, requiredOrders: [order().id] }, error: null });
    await revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest);
    expect(readPrice).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled();
  });
  it('não solicita prova para edição comprovadamente não comercial', async () => {
    const f = fixture(); f.rpc.mockResolvedValue({ data: { replay: false, proofReady: true, requiredOrders: [] }, error: null });
    await revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest);
    expect(readPrice).not.toHaveBeenCalled();
  });
  it('não confunde administrador técnico, ator divergente ou perfil inativo com autorização', async () => {
    for (const a of [{ ...actor, active: false }, { ...actor, role: 'gestor' }, { ...actor, company_id: '1' }, { ...actor, id: 'outro' }]) {
      const f = fixture(); await expect(revalidateOrderRequest(f.gateway, f.request, a, f.rpc, f.attest)).rejects.toThrow();
      expect(readPrice).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled();
    }
  });
  it('preserva conflito PT409 sem consultar preço ou escrever prova', async () => {
    const f = fixture(); f.rpc.mockResolvedValue({ data: null, error: { code: 'PT409', message: 'Conflito' } });
    await expect(revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest)).rejects.toMatchObject({ code: 'REVISION_CONFLICT', status: 409 });
    expect(readPrice).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled();
  });
  it('recusa preço alterado e precisão monetária maior sem arredondar', async () => {
    const f = fixture(); vi.mocked(readPrice).mockResolvedValueOnce({ ...quote(), price: { ...quote().price, amount: 10.57 } } as any);
    await expect(revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest)).rejects.toMatchObject({ code: 'ERP_PRICE_CHANGED' });
    f.state.orders[0]!.items[0]!.price = 0.14528;
    vi.mocked(readPrice).mockResolvedValueOnce({ ...quote(), price: { ...quote().price, amount: 0.14528 } } as any);
    await expect(revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest)).rejects.toMatchObject({ code: 'ERP_PRICE_PRECISION_UNSUPPORTED' });
    expect(f.attest).not.toHaveBeenCalled();
  });
  it('recusa filial adulterada e não resolve condição pelo nome', async () => {
    const f = fixture(); f.state.orders[0]!.erp.companyCode = 3;
    await expect(revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest)).rejects.toMatchObject({ code: 'ERP_CONTEXT_REQUIRED' });
    f.state.orders[0]!.erp.companyCode = 1; f.state.orders[0]!.payment = 'A VISTA FORJADA';
    await expect(revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest)).rejects.toMatchObject({ code: 'ERP_CONTEXT_REQUIRED' });
    expect(f.attest).not.toHaveBeenCalled();
  });
  it('não aceita recibo vazio como prova de conclusão', async () => {
    const f = fixture(); f.attest.mockResolvedValue({});
    await expect(revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest)).rejects.toMatchObject({ code: 'ERP_REVALIDATION_UNAVAILABLE' });
  });
});

describe('Mesma identidade em preparação, cotação e prova', () => {
  it.each([['vendedor','Vendedor'],['gestor','Gestor']] as const)('prepara com vendedor da sessão sem promovê-lo a administrador:%s', async (role,label) => {
    const f = fixture(); f.state.company.role = label;
    await revalidateOrderRequest(f.gateway, f.request, { ...actor, role }, f.rpc, f.attest);
    expect(readPrice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sellerCode: 14 }), { role, sellerCode: 14, companyCodes: [1, 4] });
    expect(f.attest.mock.calls[0]![0].p_actor_id).toBe(actor.id);
  });
  it('gestor recota integrante autorizado e mantém a autoria Auth da prova', async () => {
    const f=fixture();f.state.company.role='Gestor';f.state.orders[0]!.erp.sellerCode=5;
    vi.mocked(readPrice).mockResolvedValueOnce({...quote(),seller:{name:'INTEGRANTE',erp:{sellerCode:5}}} as any);
    await revalidateOrderRequest(f.gateway,f.request,{...actor,role:'gestor',binding:{...actor.binding,teamSellerCodes:[5]}},f.rpc,f.attest);
    expect(readPrice).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({sellerCode:5}),expect.objectContaining({role:'gestor',teamSellerCodes:[5]}));
    expect(f.attest.mock.calls[0]![0].p_actor_id).toBe(actor.id);
  });
  it('recusa vendedor adulterado no snapshot antes de recotar', async () => {
    const f=fixture(); f.state.orders[0]!.erp.sellerCode=5;
    await expect(revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest)).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    expect(readPrice).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled();
  });
  it('não atesta resposta de outro vendedor mesmo que o transporte a devolva', async () => {
    const f=fixture(); vi.mocked(readPrice).mockResolvedValueOnce({ ...quote(), seller: { name: 'OUTRO', erp: { sellerCode: 5 } } } as any);
    await expect(revalidateOrderRequest(f.gateway, f.request, actor, f.rpc, f.attest)).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN' });
    expect(f.attest).not.toHaveBeenCalled();
  });
  it('não encontra vínculo do administrador a partir do vendedor enviado pelo navegador', async () => {
    const f=fixture();
    await expect(revalidateOrderRequest(f.gateway, f.request, { ...actor, binding: null }, f.rpc, f.attest)).rejects.toMatchObject({ code: 'ERP_IDENTITY_REQUIRED' });
    expect(readPrice).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled();
  });
  it('mantém replay no ledger anterior à exigência de nova cotação/vínculo', async () => {
    const f=fixture(); f.rpc.mockResolvedValue({ data:{ replay:true, proofReady:true, requiredOrders:[] }, error:null });
    expect(await revalidateOrderRequest(f.gateway, f.request, { ...actor, binding:null }, f.rpc, f.attest)).toMatchObject({ ready:true,replay:true });
    expect(readPrice).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled();
  });
});
