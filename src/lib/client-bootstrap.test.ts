import { describe, expect, it, vi } from 'vitest';
import { createClientBootstrap } from './client-bootstrap';

describe('Inicialização única do documento SulBR', () => {
  it('hidrata somente quando o estado SSR existe', async () => {
    const hydrate = vi.fn(), mount = vi.fn(async () => {});
    await createClientBootstrap({ hasSSRState: () => true, hydrate, mount })();
    expect(hydrate).toHaveBeenCalledOnce();
    expect(mount).not.toHaveBeenCalled();
  });
  it('monta sem hidratação quando o documento não tem estado SSR', async () => {
    const hydrate = vi.fn(), mount = vi.fn(async () => {});
    await createClientBootstrap({ hasSSRState: () => false, hydrate, mount })();
    expect(mount).toHaveBeenCalledOnce();
    expect(hydrate).not.toHaveBeenCalled();
  });
  it('não reinicializa após o estado SSR ser consumido', async () => {
    let state = true;
    const hydrate = vi.fn(() => { state = false; }), mount = vi.fn(async () => {});
    const boot = createClientBootstrap({ hasSSRState: () => state, hydrate, mount });
    await boot(); await boot();
    expect(hydrate).toHaveBeenCalledOnce();
    expect(mount).not.toHaveBeenCalled();
  });
});
