import { SankhyaError } from './gateway.ts';
import type { ReadScope } from './read-model.ts';
import { decodeERPActorBinding, type ERPActorBinding } from '../../../src/lib/erp-identity.ts';
export type CommercialActor = { id: string; company_id: string; role: string; active: boolean; binding?: ERPActorBinding | null };
export function actorScope(actor: CommercialActor, value: unknown = actor.binding): ReadScope {
  if (!actor.active || actor.company_id !== '432299' || !['administrador', 'gestor', 'vendedor'].includes(actor.role))
    throw new SankhyaError('MEMBERSHIP_PENDING', 'Seu acesso à SulBR está pendente de ativação pelo administrador.', 403);
  const role = actor.role as ReadScope['role'];
  if (value === null || value === undefined) return { role };
  const binding = decodeERPActorBinding(value, actor.id);
  if (!binding) throw new SankhyaError('ERP_IDENTITY_REQUIRED', 'Vínculo explícito de vendedor e filial ERP necessário.', 403);
  const team = (value as Record<string, unknown>)['teamSellerCodes'];
  if (team !== undefined && (!Array.isArray(team) || team.length > 49 || new Set(team).size !== team.length ||
    team.some(c => typeof c !== 'number' || !Number.isSafeInteger(c) || c < 1 || c > 2147483647 || c === binding.sellerCode)))
    throw new SankhyaError('ERP_IDENTITY_REQUIRED', 'Vínculo explícito de vendedor e filial ERP necessário.', 403);
  return { role, sellerCode: binding.sellerCode, companyCodes: binding.companyCodes,
    ...(role === 'gestor' && team !== undefined ? { teamSellerCodes: [...team as number[]] } : {}) };
}
export function loggedSeller(scope: ReadScope, requested?: unknown): number {
  const code = scope.sellerCode, companies = scope.companyCodes;
  if (typeof code !== 'number' || !Number.isSafeInteger(code) || code < 1 || code > 2147483647 ||
    !Array.isArray(companies) || companies.length < 1 || companies.length > 2 || companies.some(c => c !== 1 && c !== 4) ||
    new Set(companies).size !== companies.length)
    throw new SankhyaError('ERP_IDENTITY_REQUIRED', 'Vínculo explícito de vendedor e filial ERP necessário.', 403);
  if (requested !== undefined && requested !== code)
    throw new SankhyaError('ERP_SCOPE_FORBIDDEN', 'Vendedor fora do escopo autorizado.', 403);
  return code;
}
