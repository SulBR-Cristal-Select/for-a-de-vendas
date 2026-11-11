import { describe, expect, it, vi } from 'vitest';
import { createERPClient, ERPOnlineError, type ERPTransport } from './erp-online';
const observed = { source: 'sankhya', readOnly: true, readAt: '2026-10-23T19:00:00.000Z' };
const page = { ...observed, items: [{ id: '1', price: null }], total: 1, totalWithoutSearch: 2, page: 1, pageSize: 20, hasMore: false };
function deferred() {
  let resolve!: (value: { data: unknown; error: unknown }) => void;
  const promise = new Promise<{ data: unknown; error: unknown }>(r => { resolve = r; });
  return { promise, resolve };
}
describe('Cliente de leitura online', () => {
  it('usa somente operation/query no transporte e preserva preço nulo', async () => {
    const transport = vi.fn<ERPTransport>().mockResolvedValue({ data: page, error: null });
    const client = createERPClient(transport);
    client.setIdentity('usuario');
    const result = await client.page({ resource: 'products' });
    expect(result.items[0]?.['price']).toBeNull();
    expect(transport).toHaveBeenCalledWith({ operation: 'page', query: { resource: 'products' } }, expect.any(AbortSignal));
  });
  it('não usa setIdentity como autenticação nem consulta tokens', async () => {
    const transport = vi.fn<ERPTransport>().mockResolvedValue({ data: { ...observed, record: null }, error: null });
    expect(await createERPClient(transport).record({ resource: 'customers', id: 3 })).toEqual({ ...observed, record: null });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([null, 'outro'])('aborta e rejeita imediatamente ao trocar para %s, mesmo com transporte que ignora abort', async uid => {
    const delayed = deferred(), transport = vi.fn<ERPTransport>(() => delayed.promise), client = createERPClient(transport);
    client.setIdentity('inicial');
    const request = client.page({ resource: 'products' });
    const rejection = expect(request).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    client.setIdentity(uid);
    expect(transport.mock.calls[0]![1].aborted).toBe(true);
    await rejection;
    delayed.resolve({ data: page, error: null });
    await expect(request).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
  });
  it('não permite resposta anterior atravessar logout e novo login do mesmo usuário', async () => {
    const delayed = deferred(), transport = vi.fn<ERPTransport>().mockImplementationOnce(() => delayed.promise).mockResolvedValue({ data: { ...page, items: [{ id: 'novo' }] }, error: null });
    const client = createERPClient(transport); client.setIdentity('mesmo');
    const old = client.page({ resource: 'products' }); const rejected = expect(old).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    client.setIdentity(null); client.setIdentity('mesmo');
    const next = client.page({ resource: 'products' });
    expect(transport).toHaveBeenCalledTimes(1);
    delayed.resolve({ data: page, error: null }); await rejected;
    expect((await next).items).toEqual([{ id: 'novo' }]);
  });
  it('limita leituras a uma por vez e mantém FIFO sem repetir chamadas', async () => {
    const delays = [deferred(), deferred(), deferred(), deferred()]; let index = 0;
    const transport = vi.fn<ERPTransport>(() => delays[index++]!.promise), client = createERPClient(transport);
    const requests = Array.from({ length: 4 }, () => client.page({ resource: 'products' }));
    expect(transport).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i++) {
      delays[i]!.resolve({ data: page, error: null });
      await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(i + 2));
    }
    delays[3]!.resolve({ data: page, error: null }); await Promise.all(requests);
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it('cancela leituras em fila na troca de identidade sem enviá-las ao ERP', async () => {
    const delay = deferred();
    const transport = vi.fn<ERPTransport>(() => delay.promise), client = createERPClient(transport);
    client.setIdentity('inicial');
    const requests = Array.from({ length: 4 }, () => client.page({ resource: 'products' }));
    const rejected = requests.map(r => expect(r).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' }));
    client.setIdentity(null); await Promise.all(rejected);
    delay.resolve({ data: page, error: null }); await new Promise(r => setTimeout(r, 0));
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('não cancela ao receber a mesma identidade', async () => {
    const delayed = deferred(), client = createERPClient(() => delayed.promise); client.setIdentity('um');
    const request = client.page({ resource: 'products' }); client.setIdentity('um');
    delayed.resolve({ data: page, error: null }); await expect(request).resolves.toEqual(page);
  });
  it('não guarda fallback de sucesso após falha', async () => {
    const transport = vi.fn<ERPTransport>().mockResolvedValueOnce({ data: page, error: null }).mockRejectedValueOnce(new Error('segredo SQL token senha'));
    const client = createERPClient(transport); await client.page({ resource: 'products' });
    await expect(client.page({ resource: 'products' })).rejects.toMatchObject({ code: 'ERP_UNAVAILABLE', message: 'Consulta ERP indisponível. Tente novamente.' });
  });
  it.each([
    { source: 'outro' }, { readOnly: false }, { readAt: 'ontem' }, { readAt: '' }, { readAt: '2026-02-30T12:00:00Z' }, { readAt: '2026-10-23T12:00:00' }, { items: null }, { items: [null] },
    { total: -1 }, { total: 0 }, { total: 0.5 }, { totalWithoutSearch: 0 }, { page: 2 }, { pageSize: 50 }, { hasMore: true },
  ])('recusa envelope inválido %j', async changed => {
    const client = createERPClient(async () => ({ data: { ...page, ...changed }, error: null }));
    await expect(client.page({ resource: 'products' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('valida record ausente sem inventar null', async () => {
    const client = createERPClient(async () => ({ data: observed, error: null }));
    await expect(client.record({ resource: 'sellers', id: 1 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('decodifica window e facetas com suas paginações', async () => {
    const transport = vi.fn<ERPTransport>().mockResolvedValueOnce({ data: { ...observed, items: [{ price: null }], offset: 8, total: 9, totalWithoutSearch: 10 }, error: null }).mockResolvedValueOnce({ data: { ...page, items: [{ code: 1, name: 'Categoria', count: 9 }] }, error: null });
    const client = createERPClient(transport);
    expect((await client.window({ resource: 'products', offset: 8, limit: 1 })).items[0]?.['price']).toBeNull();
    expect((await client.facets({ resource: 'products', facet: 'category' })).items).toHaveLength(1);
    expect(transport.mock.calls.map(c => c[0].operation)).toEqual(['window', 'facets']);
  });
  it('consulta pedidos e notas em operações separadas, sem transformá-los numa receita única', async () => {
    const transport = vi.fn<ERPTransport>().mockResolvedValue({ data: { ...observed, items: [{ id: 'sankhya:order:7', total: 10 }], offset: 20, total: 21, totalWithoutSearch: 30 }, error: null });
    const client = createERPClient(transport);
    const query = { resource: 'orders' as const, offset: 20, limit: 1, customerId: 'sankhya:customer:4' };
    expect((await client.history(query)).items).toHaveLength(1);
    expect(transport).toHaveBeenCalledWith({ operation: 'history', query }, expect.any(AbortSignal));
    await expect(client.history({ resource: 'products' as 'orders', offset: 0, limit: 10 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('não entrega um histórico parcial como página completa', async () => {
    const client = createERPClient(async () => ({ data: { ...observed, items: [], offset: 0, total: 20, totalWithoutSearch: 20 }, error: null }));
    await expect(client.history({ resource: 'invoices', offset: 0, limit: 10 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('decodifica preço contextual sem inventar tabela/versão e usa apenas price-query', async () => {
    const query = { customerId: 'sankhya:customer:141', productId: 'sankhya:product:11240', paymentCode: 29, type: 'Venda' as const, unit: 'PC' };
    const quote = { ...observed, customer: { id: query.customerId }, product: { id: query.productId }, seller: { id: 'sankhya:seller:5' }, companyCode: 1, operationCode: 1001, operationVersion: '2026-07-21T08:04:13', quantity: 1, payment: { code: 29, label: 'Condição real', version: '2026-06-10T11:47:42' }, price: { amount: 11.75, unit: 'PC', localCode: 0, control: ' ', tableVersion: null, provider: 'native-context-api' } };
    const transport = vi.fn<ERPTransport>().mockResolvedValue({ data: quote, error: null }), client = createERPClient(transport);
    expect((await client.price(query)).price).toEqual(quote.price);
    expect(transport).toHaveBeenCalledWith({ operation: 'price-query', query }, expect.any(AbortSignal));
    transport.mockResolvedValueOnce({ data: { ...quote, price: { ...quote.price, amount: null } }, error: null });
    await expect(client.price(query)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    transport.mockResolvedValueOnce({ data: { ...quote, companyCode: 3 }, error: null });
    await expect(client.price(query)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('mantém paginação integral de condições sem deduzir pagamento pelo nome', async () => {
    const transport = vi.fn<ERPTransport>().mockResolvedValue({ data: { ...observed, items: [{ code: 29, label: 'Condição ERP' }], offset: 10, total: 11, totalWithoutSearch: 20 }, error: null });
    const client = createERPClient(transport);
    expect((await client.paymentOptions({ customerId: 'sankhya:customer:141', offset: 10, limit: 1 })).total).toBe(11);
    expect(transport.mock.calls[0]?.[0].operation).toBe('payment-options');
  });
  it('recusa recurso e janela inválidos antes do transporte', async () => {
    const transport = vi.fn<ERPTransport>(), client = createERPClient(transport);
    await expect(client.page({ resource: 'financial' as 'products' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    for (const limit of [0, 51, -1, 1.2]) await expect(client.window({ resource: 'products', offset: 0, limit })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('sanitiza códigos desconhecidos e mensagens externas', async () => {
    const client = createERPClient(async () => ({ data: null, error: { code: 'senha=abc', message: 'SQL SELECT segredo' } }));
    await expect(client.page({ resource: 'customers' })).rejects.toMatchObject({ code: 'ERP_UNAVAILABLE', message: 'Consulta ERP indisponível. Tente novamente.' });
    expect(new ERPOnlineError('segredo').message).not.toContain('segredo');
  });
  it('lê erro HTTP conhecido sem expor mensagem do servidor', async () => {
    const client = createERPClient(async () => ({ data: null, error: { context: new Response(JSON.stringify({ error: { code: 'ERP_SCOPE_FORBIDDEN', message: 'token privado' } })) } }));
    await expect(client.page({ resource: 'customers' })).rejects.toMatchObject({ code: 'ERP_SCOPE_FORBIDDEN', message: 'Consulta fora do escopo autorizado.' });
  });
});
