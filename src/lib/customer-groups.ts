import { foldERPText } from './erp-order';
import { sumERPDecimals } from './erp-decimal';
export type CustomerGroup = { id: string; name: string; memberIds: string[]; members: Record<string, unknown>[]; editable: boolean; version: number };
export const GROUP_KIND = 'collections/customer-groups';
export function validateCustomerGroup(input: unknown): { id: string; name: string; memberIds: string[]; version: number; active: boolean } {
  const q = input as Record<string, unknown>;
  if (!q || typeof q !== 'object' || Array.isArray(q) || Object.keys(q).some(k => !['id','name','memberIds','version','active'].includes(k)) || typeof q['id'] !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(q['id']) || typeof q['name'] !== 'string' || !q['name'].trim() || q['name'].trim().length > 120 || !Number.isSafeInteger(q['version']) || Number(q['version']) < 0 || typeof q['active'] !== 'boolean' || !Array.isArray(q['memberIds']) || q['memberIds'].length < 2 || q['memberIds'].length > 50 || new Set(q['memberIds']).size !== q['memberIds'].length || q['memberIds'].some(id => typeof id !== 'string' || !/^sankhya:customer:[1-9]\d{0,9}$/.test(id) || Number(id.slice(17)) > 2147483647)) throw new Error('Informe nome, versão e de 2 a 50 clientes distintos.');
  return { id: q['id'], name: q['name'].trim(), memberIds: q['memberIds'] as string[], version: Number(q['version']), active: q['active'] };
}
export function groupForCustomer(groups: readonly CustomerGroup[], id: unknown): CustomerGroup | undefined { return groups.find(g => g.memberIds.includes(String(id))); }
export function groupLabel(group: CustomerGroup): string { return `${group.name} · Agrupamento · ${group.memberIds.length} cliente${group.memberIds.length === 1 ? '' : 's'}`; }
export function groupMatches(group: CustomerGroup, search: string): boolean {
  const needle = foldERPText(search.trim());
  return !needle || foldERPText([group.name, ...group.members.flatMap(m => [m['name'], m['fantasy'], m['cnpj'], m['code']])].join(' ')).includes(needle);
}
/** Entrada integral e já autorizada: nunca consolida uma página isolada ou membros externos. */
export function consolidateCustomerRows(rows: Record<string, any>[], groups: readonly CustomerGroup[], mode: 'catalog' | 'wallet' | 'sales' = 'catalog'): Record<string, any>[] {
  const mapped = new Map<string, CustomerGroup>();
  for (const group of groups) for (const id of group.memberIds) { if (mapped.has(id)) throw new Error('Cliente em mais de um agrupamento.'); mapped.set(id, group); }
  const result: Record<string, any>[] = [], buckets = new Map<string, Record<string, any>[]>();
  for (const row of rows) {
    const memberId = mode === 'sales' ? `sankhya:customer:${row['groupCode']}` : String(row['id']);
    const group = mapped.get(memberId);
    if (!group) { result.push(row); continue; }
    const bucket = buckets.get(group.id) ?? []; bucket.push(row); buckets.set(group.id, bucket);
  }
  for (const [id, bucket] of buckets) {
    const group = groups.find(g => g.id === id)!;
    const memberIds = bucket.map(r => mode === 'sales' ? `sankhya:customer:${r['groupCode']}` : String(r['id']));
    const sellers = new Set(bucket.map(r => r['sellerCode']));
    const combined: Record<string, any> = { id: `customer-group:${id}`, name: groupLabel(group), groupName: group.name, isGroup: true, groupId: id, memberCount: group.memberIds.length, memberIds, sellerCode: sellers.size === 1 ? bucket[0]!['sellerCode'] : null, seller: sellers.size === 1 ? bucket[0]!['seller'] : 'Vários vendedores', source: 'observado', readOnly: true };
    if (mode === 'catalog') combined['members'] = bucket;
    if (mode === 'wallet') { combined['bought'] = bucket.some(r => r['bought']); combined['localStatus'] = (combined['bought'] ? 'Com' : 'Sem') + String(bucket[0]!['localStatus']).replace(/^(Com|Sem)/, ''); }
    if (mode === 'sales') {
      combined['count'] = bucket.reduce((n, r) => n + r['count'], 0);
      combined['total'] = bucket.some(r => r['total'] === null) ? null : sumERPDecimals(bucket.map(r => r['total']));
      combined['missingAmountCount'] = bucket.reduce((n, r) => n + (r['missingAmountCount'] ?? 0), 0);
      combined['groupBy'] = 'customer'; combined['groupCode'] = null;
      // Mix não é somável: a união de SKU exige a consulta de itens por grupo.
      if (bucket.some(r => 'qty' in r)) combined['qty'] = null;
    }
    result.push(combined);
  }
  return result;
}
