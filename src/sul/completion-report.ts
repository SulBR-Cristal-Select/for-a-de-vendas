import type { ERPRow } from "../lib/erp-online";

export type CompletionFilters = {
  customer?: string;
  seller?: string;
  status?: string;
  from?: string;
  to?: string;
};
type CompletionSource = {
  activities: ERPRow[];
  tasks: ERPRow[];
  customers: ERPRow[];
  users: ERPRow[];
};

/** Fonte local já filtrada pelo servidor. Não autentica nem amplia permissões. */
export function completionRecords(source: CompletionSource): ERPRow[] {
  const names = new Map(source.customers.map((row) => [row["id"], row["name"]]));
  return (["activities", "tasks"] as const).flatMap((kind) =>
    source[kind]
      .filter((row) => row["status"] === "Realizada")
      .map((row) => ({
        ...row,
        id: `${kind}:${row["id"]}`,
        customer: names.get(row["customerId"]),
      })),
  );
}

/** Só os identificadores recebidos são comparados; nome/e-mail nunca resolvem responsável. */
export function filterCompletions(rows: ERPRow[], filters: CompletionFilters): ERPRow[] {
  return rows.filter(
    (row) =>
      (!filters.customer || row["customerId"] === filters.customer) &&
      (!filters.seller || row["sellerId"] === filters.seller) &&
      (!filters.status || row["status"] === filters.status) &&
      ((!filters.from && !filters.to) ||
        (typeof row["date"] === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(row["date"]) &&
          Number.isFinite(Date.parse(row["date"] + "T00:00:00Z")) &&
          new Date(row["date"] + "T00:00:00Z").toISOString().slice(0, 10) === row["date"] &&
          (!filters.from || row["date"] >= filters.from) &&
          (!filters.to || row["date"] <= filters.to))),
  );
}

export function completionOwners(
  rows: ERPRow[],
  users: ERPRow[],
): { value: string; label: string }[] {
  const names = new Map(users.map((row) => [row["id"], row["name"]]));
  return [
    ...new Set(
      rows
        .map((row) => row["sellerId"])
        .filter((id): id is string => typeof id === "string" && !!id),
    ),
  ].map((id) => ({
    value: id,
    label: typeof names.get(id) === "string" ? (names.get(id) as string) : id,
  }));
}
