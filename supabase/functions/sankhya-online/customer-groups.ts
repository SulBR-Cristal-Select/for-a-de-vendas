import {
  GROUP_KIND,
  validateCustomerGroup,
  type CustomerGroup,
} from "../../../src/lib/customer-groups.ts";
import { readRecord, type ReadScope } from "./read-model.ts";
import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
type Store = {
  list(): Promise<
    {
      id: string;
      data: { active?: boolean; name?: string; memberIds: string[]; version?: number };
    }[]
  >;
  save(value: Record<string, unknown>): Promise<unknown>;
};
/** O armazenamento guarda só códigos. Os integrantes são resolvidos e filtrados pelo escopo Auth atual. */
export async function readCustomerGroups(
  gateway: Pick<SankhyaGateway, "select">,
  scope: ReadScope,
  store: Store,
): Promise<CustomerGroup[]> {
  const records = await store.list(),
    result: CustomerGroup[] = [];
  if (records.length > 1000)
    throw new SankhyaError("ERP_CONTEXT_REQUIRED", "Limite de agrupamentos excedido.", 502);
  for (const record of records) {
    const data = record["data"];
    if (data?.active === false) continue;
    let group;
    try {
      group = validateCustomerGroup({
        id: record["id"],
        name: data.name,
        memberIds: data.memberIds,
        active: data.active,
        version: data.version,
      });
    } catch {
      throw new SankhyaError(
        "ERP_INVALID_RESPONSE",
        "Cadastro de agrupamentos inconsistente.",
        502,
      );
    }
    const members: Record<string, unknown>[] = [];
    for (const id of group.memberIds) {
      try {
        const value = await readRecord(gateway, { resource: "customers", id }, scope);
        if (value.record) members.push(value.record);
      } catch (error) {
        if (!(error instanceof SankhyaError) || error.code !== "ERP_SCOPE_FORBIDDEN") throw error;
      }
    }
    if (!members.length) continue;
    result.push({
      id: group.id,
      name: group.name,
      memberIds: members.map((m) => String(m["id"])),
      members,
      version: group.version,
      editable: scope.role !== "vendedor" && members.length === group.memberIds.length,
    });
  }
  return result;
}
export async function saveCustomerGroup(
  gateway: Pick<SankhyaGateway, "select">,
  scope: ReadScope,
  value: unknown,
  store: Store,
) {
  if (scope.role === "vendedor")
    throw new SankhyaError(
      "ERP_SCOPE_FORBIDDEN",
      "Somente administradores e gestores podem administrar agrupamentos.",
      403,
    );
  let input;
  try {
    input = validateCustomerGroup(value);
  } catch (error) {
    throw new SankhyaError("INVALID_REQUEST", String((error as Error).message), 400);
  }
  const records = await store.list(),
    existing = records.find((r) => r["id"] === input.id);
  const members = [...new Set([...input.memberIds, ...(existing?.["data"]?.memberIds ?? [])])];
  for (const id of members) {
    const result = await readRecord(gateway, { resource: "customers", id }, scope);
    if (!result.record)
      throw new SankhyaError("ERP_SCOPE_FORBIDDEN", "Cliente fora da carteira autorizada.", 403);
  }
  // A exclusividade e a versão são verificadas novamente dentro da transação SQL.
  return store.save(input);
}
export { GROUP_KIND };
