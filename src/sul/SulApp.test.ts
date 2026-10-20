import { describe, expect, it, vi } from 'vitest';
vi.mock('@g4ai/ds', async (original) => ({ ...await original<Record<string, unknown>>(), notify: vi.fn() }));
import { businessDate, createAppState, createMutationQueue, identifyPriceTable, createEditorValues, technicalCode, monthlyTargets, setMonthlyTarget, activityOwner, customerPriceTables, openActivityEditor, openCustomerEditor } from './SulApp';

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


describe('Correções focadas da revisão', () => {
  it('aloca UUID por formulário, sem depender da carteira, e preserva IDs existentes', () => {
    const first = createEditorValues({ code: 'COD-INFORMADO' });
    const second = createEditorValues();
    expect(first['id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first['id']).not.toBe(second['id']);
    expect(first['code']).toBe('COD-INFORMADO');
    expect(createEditorValues(first)['id']).toBe(first['id']);
    expect(technicalCode('CLI', first['id'])).toBe(`CLI-${first['id']}`);
  });

  it('reenvia o mesmo cliente e código após resposta de transporte perdida', async () => {
    const current = { current: createAppState({ company: { role: 'Vendedor' } }) };
    const persist = vi.fn().mockRejectedValueOnce(new Error('Resposta perdida')).mockImplementation(async (next) => next);
    const queue = createMutationQueue(current, persist, vi.fn());
    let spec: any;
    openCustomerEditor((dialog: any) => { spec = dialog; }, queue, current.current);
    expect(spec.allocateIdentity).toBe(true);
    const form = createEditorValues({ name: 'Cliente', code: 'COD-EXTERNO' });
    await expect(spec.save(form)).rejects.toThrow('Resposta perdida');
    await spec.save(form);
    const first = persist.mock.calls[0]![0]['customers'][0];
    const second = persist.mock.calls[1]![0]['customers'][0];
    expect(first.id).toBe(form['id']);
    expect(second).toEqual(first);
    expect(second.code).toBe('COD-EXTERNO');
    expect(current.current['customers']).toHaveLength(1);
  });

  it('gera código técnico a partir da identidade, não da quantidade de clientes', async () => {
    const state = createAppState({ company: { role: 'Vendedor' } });
    let spec: any;
    openCustomerEditor((dialog: any) => { spec = dialog; }, async (mutate: any) => mutate(state), state);
    const form = createEditorValues({ name: 'Cliente sem código' });
    await spec.save(form);
    expect(state['customers'][0].code).toBe(technicalCode('CLI', form['id']));
  });

  it('mantém metas históricas em targetPeriods e targets simples apenas no mês corrente', () => {
    const currentMonth = businessDate().slice(0, 7);
    const historicalMonth = currentMonth === '2025-01' ? '2024-01' : '2025-01';
    const state: any = { targets: { Ana: 10 }, targetPeriods: { [historicalMonth]: { Ana: 20 } } };
    expect(monthlyTargets(state, historicalMonth)).toEqual({ Ana: 20 });
    expect(monthlyTargets(state, '1999-01')).toEqual({});
    setMonthlyTarget(state, historicalMonth, 'Ana', 30);
    expect(state.targets).toEqual({ Ana: 10 });
    setMonthlyTarget(state, currentMonth, 'Ana', 40);
    expect(state.targets).toEqual({ Ana: 40 });
    expect(state.targetPeriods[historicalMonth]).toEqual({ Ana: 30 });
    expect(monthlyTargets(state, currentMonth)).toEqual({ Ana: 40 });
  });

  it('registra atividade para o responsável do cliente selecionado ou o usuário sem cliente', async () => {
    const state: any = { company: { userId: 'usuario-atual' }, customers: [
      { id: 'cliente-inicial', sellerId: 'outro-responsavel' },
      { id: 'cliente-selecionado', sellerId: 'responsavel-carteira' },
    ], activities: [] };
    let spec: any;
    openActivityEditor((dialog: any) => { spec = dialog; }, async (mutate: any) => mutate(state), state, 'cliente-inicial');
    const form = createEditorValues({ customerId: 'cliente-selecionado', name: 'Visita' });
    await spec.save(form);
    expect(state.activities[0].sellerId).toBe('responsavel-carteira');
    expect(state.activities[0].id).toBe(form['id']);
    expect(activityOwner(state, '')).toBe('usuario-atual');
    expect(activityOwner(state, 'inexistente')).toBeUndefined();
    await spec.save(createEditorValues({ customerId: '', name: 'Prospecção' }));
    expect(state.activities[1].sellerId).toBe('usuario-atual');
  });

  it('preserva tabelas do vendedor mesmo quando a detecção identifica outra tabela', async () => {
    const state = createAppState({ company: { role: 'Vendedor' },
      customers: [{ id: 'cliente', name: 'Cliente', priceTables: ['contratada'] }],
      products: [{ id: 'produto', category: '500', price: 10 }],
      priceTablesBase: { detectada: { '500': 1.1 } },
    });
    let spec: any;
    openCustomerEditor((dialog: any) => { spec = dialog; }, async (mutate: any) => mutate(state), state, state['customers'][0]);
    await spec.save(createEditorValues({ ...spec.values, __priceList: [{ productId: 'produto', price: 11 }] }));
    expect(state['customers'][0].priceTableMatch).toBe('detectada');
    expect(state['customers'][0].priceTables).toEqual(['contratada']);
    expect(customerPriceTables(state, undefined, 'detectada')).toEqual([]);
    for (const role of ['Gestor', 'Administrador']) {
      expect(customerPriceTables({ company: { role } }, state['customers'][0], 'detectada')).toEqual(['detectada']);
    }
  });
});
