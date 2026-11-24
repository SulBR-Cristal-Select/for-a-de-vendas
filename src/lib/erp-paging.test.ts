import { describe, expect, it, vi } from "vitest";
import { paginateERP, type ERPWindowSlice } from "./erp-paging";
type Row = { id: string; rank: number };
const readAt = "2026-10-23T19:00:00Z";
const compare = (a: Row, b: Row) => a.rank - b.rank;
function fixture(remote: Row[]) {
  return vi.fn(async (offset: number, limit: number): Promise<ERPWindowSlice<Row>> => {
    expect(limit).toBeGreaterThanOrEqual(1);
    expect(limit).toBeLessThanOrEqual(50);
    return {
      items: remote.slice(offset, offset + limit),
      total: remote.length,
      totalWithoutSearch: remote.length + 7,
      offset,
      readAt,
    };
  });
}
function rows(prefix: string, ranks: number[]): Row[] {
  return ranks.map((rank, i) => ({ id: `${prefix}${i}`, rank }));
}
function expected(locals: Row[], remote: Row[], sorted: boolean): Row[] {
  return sorted ? [...locals, ...remote].sort(compare) : [...locals, ...remote];
}
async function check(
  locals: Row[],
  remote: Row[],
  skip: number,
  pageSize: 10 | 20 | 50,
  sorted = true,
) {
  const getWindow = fixture(remote);
  const result = await paginateERP({
    localRows: locals,
    localTotalWithoutSearch: locals.length + 3,
    skip,
    pageSize,
    getWindow,
    ...(sorted ? { compare } : {}),
  });
  const merged = expected(locals, remote, sorted);
  expect(result.items).toEqual(merged.slice(skip, skip + pageSize));
  expect(result.total).toBe(merged.length);
  expect(result.totalWithoutSearch).toBe(merged.length + 10);
  expect(result.offset).toBe(skip);
  expect(result.hasMore).toBe(skip + result.items.length < merged.length);
  return getWindow;
}
describe("Paginação mesclada somente do trecho necessário", () => {
  it("sem manuais no filtro faz uma única janela, mantendo o universo manual sem busca", async () => {
    const getWindow = fixture(
      rows(
        "r",
        Array.from({ length: 80 }, (_, i) => i),
      ),
    );
    const result = await paginateERP({
      localRows: [],
      localTotalWithoutSearch: 3,
      skip: 20,
      pageSize: 10,
      getWindow,
    });
    expect(getWindow).toHaveBeenCalledExactlyOnceWith(20, 10);
    expect(result.items).toHaveLength(10);
    expect(result.total).toBe(80);
    expect(result.totalWithoutSearch).toBe(90);
  });
  it("manuais primeiro sem comparador, sem reordenar nem deduplicar", async () => {
    const locals = rows("m", [4, 2, 2]),
      remote = rows("r", [1, 5, 6]);
    locals[1]!.id = remote[0]!.id;
    await check(locals, remote, 0, 10, false);
    await check(locals, remote, 4, 10, false);
  });
  it.each(["antes", "depois", "empate"] as const)("locais %s dos ERP", async (scenario) => {
    const locals = rows(
      "m",
      Array.from({ length: 35 }, (_, i) =>
        scenario === "antes" ? -i - 1 : scenario === "depois" ? 100 + i : 5,
      ),
    );
    const remote = rows(
      "r",
      Array.from({ length: 80 }, (_, i) => (scenario === "empate" ? 5 : i)),
    );
    for (const skip of [0, 1, 9, 10, 29, 34, 35, 49, 79, 80, 110, 115, 999])
      await check(locals, remote, skip, 50);
  });
  it("vazios e página além do fim", async () => {
    for (const locals of [[], rows("m", [2, 1])])
      for (const remote of [[], rows("r", [1, 2])])
        for (const skip of [0, 1, 2, 10]) {
          await check(locals, remote, skip, 10);
          await check(locals, remote, skip, 20, false);
        }
  });
  it("casos aleatórios determinísticos contra merge completo somente da fixture", async () => {
    let seed = 7631;
    const rand = (bound: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % bound;
    };
    for (let iteration = 0; iteration < 220; iteration++) {
      const locals = rows(
        "m",
        Array.from({ length: rand(110) }, () => rand(30)),
      );
      const remote = rows(
        "r",
        Array.from({ length: rand(240) }, () => rand(30)),
      ).sort(compare);
      const size = [10, 20, 50][rand(3)]! as 10 | 20 | 50;
      await check(locals, remote, rand(locals.length + remote.length + 20), size, true);
      await check(locals, remote, rand(locals.length + remote.length + 20), size, false);
    }
  });
  it("respeita comparador descendente e manuais vencem empates", async () => {
    const locals = rows("m", [1, 5, 2, 5]),
      remote = rows("r", [6, 5, 5, 3, 1]);
    const descending = (a: Row, b: Row) => b.rank - a.rank;
    const result = await paginateERP({
      localRows: locals,
      localTotalWithoutSearch: 4,
      skip: 1,
      pageSize: 10,
      compare: descending,
      getWindow: fixture(remote),
    });
    expect(result.items).toEqual([...locals, ...remote].sort(descending).slice(1, 11));
    expect(locals.map((row) => row.rank)).toEqual([1, 5, 2, 5]);
  });
  it("1000 locais: O(log M) sondas e no máximo uma página remota adicional", async () => {
    const locals = rows(
      "m",
      Array.from({ length: 1000 }, (_, i) => i * 10),
    );
    const remote = rows(
      "r",
      Array.from({ length: 100000 }, (_, i) => i),
    );
    const getWindow = await check(locals, remote, 5000, 50);
    // Cada sonda em cache pode dividir a janela final em mais um trecho.
    expect(getWindow.mock.calls.length).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(1001)) + 2);
    expect(getWindow.mock.calls.reduce((sum, [, limit]) => sum + limit, 0)).toBeLessThanOrEqual(
      1 + Math.ceil(Math.log2(1001)) + 50,
    );
    const requested = getWindow.mock.calls.flatMap(([offset, limit]) =>
      Array.from({ length: limit }, (_, i) => offset + i),
    );
    expect(new Set(requested).size).toBe(requested.length);
  });
  it.each(["total", "totalWithoutSearch"] as const)(
    "falha se %s mudar entre sondas",
    async (field) => {
      const remote = rows(
        "r",
        Array.from({ length: 80 }, (_, i) => i),
      );
      let calls = 0;
      const base = fixture(remote);
      const getWindow = async (offset: number, limit: number) => {
        const result = await base(offset, limit);
        calls++;
        if (calls > 1) result[field]++;
        return result;
      };
      await expect(
        paginateERP({
          localRows: rows("m", [2, 4]),
          localTotalWithoutSearch: 2,
          skip: 20,
          pageSize: 10,
          compare,
          getWindow,
        }),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    },
  );
  it.each([
    { total: -1 },
    { offset: 1 },
    { totalWithoutSearch: 0 },
    { items: [] },
    { readAt: "inválido" },
  ])("recusa janela incoerente %j", async (changed) => {
    const getWindow = async (offset: number, limit: number) => ({
      ...(await fixture(rows("r", [1, 2]))(offset, limit)),
      ...changed,
    });
    await expect(
      paginateERP({ localRows: [], localTotalWithoutSearch: 0, skip: 0, pageSize: 10, getWindow }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
