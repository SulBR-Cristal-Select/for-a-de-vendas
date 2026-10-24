import { describe, expect, it } from 'vitest';
import { decodeERPActorBinding, workspaceERPSeller } from './erp-identity';
import { actorScope, loggedSeller } from '../../supabase/functions/sankhya-online/identity';
const uid = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const binding = { userId: uid, sellerId: 'sankhya:seller:34', sellerCode: 34, companyCodes: [1, 4] as const };
const actor = { id: uid, company_id: '432299', role: 'vendedor', active: true, binding };
describe('Identidade ERP derivada da pessoa Auth, não do cliente ou formulário', () => {
  it('mapeia duas sessões independentes a vendedores diferentes, sem constante global', () => {
    const second = { ...actor, id: other, binding: { userId: other, sellerId: 'sankhya:seller:12', sellerCode: 12, companyCodes: [1] as const } };
    expect(loggedSeller(actorScope(actor))).toBe(34);
    expect(loggedSeller(actorScope(second))).toBe(12);
    expect(actorScope(second).companyCodes).toEqual([1]);
    expect(loggedSeller(actorScope(actor))).toBe(34);
  });
  it.each(['administrador', 'gestor', 'vendedor'])('também impede override no papel%s', role => {
    const scope = actorScope({ ...actor, role });
    expect(loggedSeller(scope, 34)).toBe(34);
    for (const request of [12, 0, '34', null, { sellerCode: 34 }])
      expect(() => loggedSeller(scope, request)).toThrow('Vendedor fora');
  });
  it.each(['administrador', 'gestor', 'vendedor'])('não inventa vendedor para%s sem vínculo', role => {
    expect(() => loggedSeller(actorScope({ ...actor, role, binding: null }))).toThrow('Vínculo explícito');
  });
  it('recusa vínculo de outra pessoa mesmo com nome e e-mail iguais', () => {
    const sameNames = { ...actor, id: other, name: 'Mesmo nome', email: 'mesmo@exemplo.test' };
    expect(() => actorScope(sameNames)).toThrow('Vínculo explícito');
    expect(decodeERPActorBinding(binding, other)).toBeNull();
  });
  it.each([{ active: false }, { company_id: '1' }, { role: 'técnico' }])('não transforma vínculo em ativação ou permissão:%j', patch => {
    expect(() => actorScope({ ...actor, ...patch })).toThrow('pendente');
  });
  it.each([undefined, null, {}, { ...binding, sellerCode: 0 }, { ...binding, sellerCode: 1.5 }, { ...binding, sellerId: 'sankhya:seller:12' }, { ...binding, companyCodes: [] }, { ...binding, companyCodes: [3] }, { ...binding, companyCodes: [1, 1] }, { ...binding, companyCodes: [1, 4, 1] }])('recusa vínculo incompleto/adulterado:%j', value => {
    expect(decodeERPActorBinding(value, uid)).toBeNull();
  });
  it('não usa usuário nominal, cadastro do cliente nem constantes no formulário', () => {
    expect(workspaceERPSeller({ userId: uid, user: 'Nome qualquer', erpSeller: binding })).toEqual(binding);
    expect(workspaceERPSeller({ userId: other, user: 'Nome qualquer', erpSeller: binding })).toBeNull();
    expect(workspaceERPSeller({ userId: uid, sellerCode: 5, user: 'Vendedor5' })).toBeNull();
  });
  it('não conserva referência mutável ao vetor de filiais do retorno', () => {
    const mutable = { ...binding, companyCodes: [1, 4] };
    const decoded = decodeERPActorBinding(mutable, uid)!;
    mutable.companyCodes.push(3);
    expect(decoded.companyCodes).toEqual([1, 4]);
  });
});
