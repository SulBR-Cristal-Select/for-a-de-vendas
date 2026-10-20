import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), callback: null as null | ((event: string, session: any) => void) }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { onAuthStateChange: (fn: typeof mocks.callback) => { mocks.callback = fn; } } } }));
beforeEach(() => { vi.resetModules(); mocks.rpc.mockReset(); mocks.callback = null; });
describe('Contrato autenticado do workspace', () => {
  it('exige carregar uma revisão antes de salvar', async () => {
    const { saveWorkspace } = await import('./workspace');
    await expect(saveWorkspace({})).rejects.toThrow('Carregue os dados autenticados');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('envia revisão e UUID e devolve apenas o estado confirmado pelo servidor', async () => {
    const { loadWorkspace, saveWorkspace } = await import('./workspace');
    mocks.rpc.mockResolvedValueOnce({ data: { state: { orders: [] }, revision: 7 }, error: null });
    expect(await loadWorkspace()).toEqual({ orders: [] });
    mocks.rpc.mockResolvedValueOnce({ data: { state: { total: 123.45 }, revision: 8 }, error: null });
    expect(await saveWorkspace({ total: 0 })).toEqual({ total: 123.45 });
    expect(mocks.rpc).toHaveBeenLastCalledWith('save_workspace', {
      p_state: { total: 0 }, p_expected_revision: 7, p_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });
  it('preserva UUID e revisão após falha de rede, e bloqueia alteração diferente', async () => {
    const { loadWorkspace, saveWorkspace } = await import('./workspace');
    mocks.rpc.mockResolvedValueOnce({ data: { state: {}, revision: 2 }, error: null });
    await loadWorkspace();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Falha de rede', code: '' } });
    await expect(saveWorkspace({ orders: [1] })).rejects.toThrow('Falha de rede');
    const args = mocks.rpc.mock.calls[1]?.[1];
    await expect(saveWorkspace({ orders: [2] })).rejects.toThrow('sem confirmação');
    mocks.rpc.mockResolvedValueOnce({ data: { state: { orders: [1] }, revision: 3 }, error: null });
    await saveWorkspace({ orders: [1] });
    expect(mocks.rpc.mock.calls[2]?.[1]).toEqual(args);
  });
  it('traduz acesso pendente sem criar um estado substituto', async () => {
    const { loadWorkspace } = await import('./workspace');
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'MEMBERSHIP_PENDING', code: '42501' } });
    await expect(loadWorkspace()).rejects.toMatchObject({ code: 'MEMBERSHIP_PENDING', message: expect.stringContaining('pendente de ativação') });
  });
  it('invalida revisão quando há conflito', async () => {
    const { loadWorkspace, saveWorkspace } = await import('./workspace');
    mocks.rpc.mockResolvedValueOnce({ data: { state: {}, revision: 1 }, error: null }); await loadWorkspace();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'REVISION_CONFLICT', code: '40001' } });
    await expect(saveWorkspace({})).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(saveWorkspace({})).rejects.toThrow('Carregue os dados autenticados');
  });
  it('não aceita resposta sem revisão íntegra', async () => {
    const { loadWorkspace } = await import('./workspace');
    mocks.rpc.mockResolvedValueOnce({ data: { state: {}, revision: '1' }, error: null });
    await expect(loadWorkspace()).rejects.toThrow('estado inválido');
  });
  it('limpa revisão ao sair da conta', async () => {
    const { loadWorkspace, saveWorkspace } = await import('./workspace');
    mocks.rpc.mockResolvedValueOnce({ data: { state: {}, revision: 1 }, error: null }); await loadWorkspace();
    mocks.callback?.('SIGNED_OUT', null);
    await expect(saveWorkspace({})).rejects.toThrow('Carregue os dados autenticados');
  });
});
