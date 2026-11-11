// A fila por cliente não cobre outras abas da mesma origem.
// Web Locks coordena a leitura real sem cache, retry ou alterações de sessão.
export async function withERPReadLock<T>(read: () => Promise<T>, signal: AbortSignal, superseded?: AbortSignal, locks: LockManager | undefined = globalThis.navigator?.locks): Promise<T> {
  const waitingSignal = superseded ? AbortSignal.any([signal, superseded]) : signal;
  if (waitingSignal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
  if (!locks) return read();
  return locks.request('sulbr:sankhya-online:read', { mode: 'exclusive', signal: waitingSignal }, async () => {
    if (waitingSignal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
    // O sinal da busca só cancela a espera; a leitura iniciada mantém o lock até terminar.
    return read();
  });
}
