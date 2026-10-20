import { describe, expect, it, vi } from 'vitest';
vi.mock('@g4ai/ds', async (original) => ({ ...await original<Record<string, unknown>>(), notify: vi.fn() }));
import { businessDate, createAppState, createMutationQueue, identifyPriceTable } from './SulApp';

describe('Contrato da interface Sul', () => {
  it('inicia sem carteira ou pedidos históricos e preserva o catálogo estrutural', () => {
    const state = createAppState();
    expect(state['orders']).toEqual([]);
    expect(state['customers']).toEqual([]);
    expect(state['products']).toEqual([]);
    expect(state['reports']).toHaveLength(25);
    expect(Object.values(state['indicators']).flat()).toHaveLength(27);
  });
  it('usa o dia de negócio de São Paulo na fronteira UTC', () => {
    expect(businessDate(new Date('2026-10-21T01:00:00Z'))).toBe('2026-10-20');
  });
  it('serializa mutações e não confirma estado antes do servidor', async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const current = { current: createAppState({ counter: 0 }) };
    const persist = vi.fn(async (next: Record<string, any>) => { await barrier; return next; });
    const commit = vi.fn();
    const queue = createMutationQueue(current, persist, commit);
    const first = queue((state) => { state['counter'] += 1; });
    const second = queue((state) => { state['counter'] += 1; });
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(current.current['counter']).toBe(0);
    release();
    await Promise.all([first, second]);
    expect(current.current['counter']).toBe(2);
    expect(commit).toHaveBeenCalledTimes(2);
  });
  it('mantém os dados confirmados quando o servidor rejeita a alteração', async () => {
    const current = { current: createAppState({ counter: 0 }) };
    const persist = vi.fn().mockRejectedValueOnce(new Error('Falha controlada')).mockImplementation(async (next) => next);
    const queue = createMutationQueue(current, persist, vi.fn());
    await expect(queue((state) => { state['counter'] = 99; })).rejects.toThrow('Falha controlada');
    expect(current.current['counter']).toBe(0);
    await queue((state) => { state['counter'] += 1; });
    expect(current.current['counter']).toBe(1);
  });
  it('deixa a auditoria para o servidor, sem gerar eventos que mudem o reenvio', async () => {
    const current = { current: createAppState() };
    const persist = vi.fn(async (next: Record<string, any>) => next);
    await createMutationQueue(current, persist, vi.fn())((state) => { state['activePanel'] = 'Painel de teste'; });
    expect(persist.mock.calls[0]?.[0]['logs']).toEqual([]);
  });
  it('compara tabelas somente quando há produtos e preços de referência conhecidos', () => {
    expect(identifyPriceTable({ products: [], priceTablesBase: {} }, [])).toBe('');
    expect(identifyPriceTable({ products: [{ id: 'teste', category: '500', price: 10 }], priceTablesBase: { comercial: { '500': 1.1 } } }, [{ productId: 'teste', price: 11 }])).toBe('comercial');
  });
});
