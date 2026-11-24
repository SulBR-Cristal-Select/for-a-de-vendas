// O navegador usa este dado apenas para apresentar a seleção existente.
// A autoridade é sempre a resolução independente do mesmo vínculo no servidor.
export type ERPActorBinding = {
  userId: string;
  sellerId: string;
  sellerCode: number;
  companyCodes: readonly (1 | 4)[];
  teamSellerCodes?: readonly number[];
};
export function decodeERPActorBinding(value: unknown, userId: string): ERPActorBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>,
    code = row["sellerCode"],
    companies = row["companyCodes"];
  if (
    row["userId"] !== userId ||
    typeof code !== "number" ||
    !Number.isSafeInteger(code) ||
    code < 1 ||
    code > 2147483647 ||
    row["sellerId"] !== `sankhya:seller:${code}` ||
    !Array.isArray(companies) ||
    companies.length < 1 ||
    companies.length > 2 ||
    companies.some((c) => c !== 1 && c !== 4) ||
    new Set(companies).size !== companies.length
  )
    return null;
  const team = row["teamSellerCodes"];
  if (
    team !== undefined &&
    (!Array.isArray(team) ||
      team.length > 49 ||
      new Set(team).size !== team.length ||
      team.some(
        (c) =>
          typeof c !== "number" ||
          !Number.isSafeInteger(c) ||
          c < 1 ||
          c > 2147483647 ||
          c === code,
      ))
  )
    return null;
  return {
    userId,
    sellerCode: code,
    sellerId: row["sellerId"] as string,
    companyCodes: [...companies],
    ...(team === undefined ? {} : { teamSellerCodes: [...(team as number[])] }),
  };
}
export function workspaceERPSeller(company: unknown): ERPActorBinding | null {
  if (!company || typeof company !== "object" || Array.isArray(company)) return null;
  const row = company as Record<string, unknown>;
  return typeof row["userId"] === "string"
    ? decodeERPActorBinding(row["erpSeller"], row["userId"])
    : null;
}
