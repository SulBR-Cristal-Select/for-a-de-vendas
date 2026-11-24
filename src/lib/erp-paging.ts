import { ERPOnlineError } from "./erp-online";

export type ERPWindowSlice<T> = {
  items: T[];
  total: number;
  totalWithoutSearch: number;
  offset: number;
  readAt: string;
};
export type ERPPagingInput<T> = {
  /** Apenas manuais autorizados, já filtrados. Nenhuma deduplicação implícita. */
  localRows: readonly T[];
  localTotalWithoutSearch: number;
  skip: number;
  pageSize: 10 | 20 | 50;
  getWindow: (offset: number, limit: number) => Promise<ERPWindowSlice<T>>;
  /** Deve reproduzir a ordenação completa do servidor, inclusive desempates. */
  compare?: (a: T, b: T) => number;
};
export type ERPMergedPage<T> = ERPWindowSlice<T> & { pageSize: 10 | 20 | 50; hasMore: boolean };
const natural = (n: number) => Number.isSafeInteger(n) && n >= 0;
const invalid = (): never => {
  throw new ERPOnlineError("INVALID_RESPONSE");
};

/** Sondas e linhas remotas vivem apenas nesta chamada, nunca em estado persistido. */
export async function paginateERP<T>(input: ERPPagingInput<T>): Promise<ERPMergedPage<T>> {
  const { localRows, localTotalWithoutSearch, skip, pageSize, getWindow, compare } = input;
  if (
    !natural(skip) ||
    ![10, 20, 50].includes(pageSize) ||
    !natural(localTotalWithoutSearch) ||
    localTotalWithoutSearch < localRows.length
  )
    throw new ERPOnlineError("INVALID_REQUEST");
  const locals = compare ? [...localRows].sort(compare) : [...localRows],
    M = locals.length;
  const rows = new Map<number, T>();
  let total: number | undefined,
    unfiltered: number | undefined,
    readAt = "";
  async function fetchWindow(offset: number, limit: number): Promise<void> {
    const window = await getWindow(offset, limit);
    if (
      !window ||
      !natural(window.total) ||
      !natural(window.totalWithoutSearch) ||
      window.totalWithoutSearch < window.total ||
      window.offset !== offset ||
      !Array.isArray(window.items) ||
      window.items.length !== Math.min(limit, Math.max(0, window.total - offset)) ||
      typeof window.readAt !== "string" ||
      !Number.isFinite(Date.parse(window.readAt))
    )
      invalid();
    if (total !== undefined && (total !== window.total || unfiltered !== window.totalWithoutSearch))
      invalid();
    total = window.total;
    unfiltered = window.totalWithoutSearch;
    readAt = window.readAt;
    window.items.forEach((row, i) => {
      rows.set(offset + i, row);
    });
  }
  // Sem manuais no filtro, uma única chamada basta: não sondar e recontar o ERP.
  if (M === 0) {
    await fetchWindow(skip, pageSize);
    if (!Number.isSafeInteger(localTotalWithoutSearch + unfiltered!)) invalid();
    const items = [...rows.values()];
    return {
      items,
      total: total!,
      totalWithoutSearch: localTotalWithoutSearch + unfiltered!,
      offset: skip,
      pageSize,
      hasMore: skip + items.length < total!,
      readAt,
    };
  }
  // A primeira janela também fornece contagens quando a página só contém manuais.
  await fetchWindow(Math.max(0, skip - M), 1);
  const N = total!;
  if (!Number.isSafeInteger(M + N) || !Number.isSafeInteger(localTotalWithoutSearch + unfiltered!))
    invalid();
  async function remote(index: number): Promise<T> {
    if (!rows.has(index)) await fetchWindow(index, 1);
    if (!rows.has(index)) return invalid();
    return rows.get(index)!;
  }
  function manualBeforeOrEqual(row: T): number {
    let lo = 0,
      hi = M;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (compare!(locals[mid]!, row) <= 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  let remoteIndex: number, localIndex: number;
  if (!compare) {
    localIndex = Math.min(skip, M);
    remoteIndex = Math.max(0, skip - M);
  } else {
    // Primeiro ERP cuja posição global é >= skip. A faixa tem no máximo M+1.
    let lo = Math.min(N, Math.max(0, skip - M)),
      hi = Math.min(skip, N - 1) + 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2),
        row = await remote(mid);
      if (mid + manualBeforeOrEqual(row) < skip) lo = mid + 1;
      else hi = mid;
    }
    remoteIndex = lo;
    localIndex = Math.min(M, Math.max(0, skip - remoteIndex));
  }
  // No máximo uma página de linhas ERP; sondas já lidas são reutilizadas.
  const end = Math.min(N, remoteIndex + pageSize);
  for (let cursor = remoteIndex; cursor < end;) {
    if (rows.has(cursor)) {
      cursor++;
      continue;
    }
    let until = cursor + 1;
    while (until < end && !rows.has(until) && until - cursor < 50) until++;
    await fetchWindow(cursor, until - cursor);
    cursor = until;
  }
  const items: T[] = [];
  while (items.length < pageSize && (localIndex < M || remoteIndex < N)) {
    const takeLocal =
      localIndex < M &&
      (remoteIndex >= N || !compare || compare(locals[localIndex]!, rows.get(remoteIndex)!) <= 0);
    if (takeLocal) items.push(locals[localIndex++]!);
    else {
      if (!rows.has(remoteIndex)) return invalid();
      items.push(rows.get(remoteIndex++)!);
    }
  }
  if (items.length !== Math.min(pageSize, Math.max(0, M + N - skip))) invalid();
  return {
    items,
    total: M + N,
    totalWithoutSearch: localTotalWithoutSearch + unfiltered!,
    offset: skip,
    pageSize,
    hasMore: skip + items.length < M + N,
    readAt,
  };
}
