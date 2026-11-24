import { describe, it, expect, vi } from "vitest";
import {
  consolidateCustomerRows,
  validateCustomerGroup,
  groupMatches,
  type CustomerGroup,
} from "./customer-groups";
import { groupedWindow } from "../../supabase/functions/sankhya-online/group-window";
import {
  readCustomerGroups,
  saveCustomerGroup,
} from "../../supabase/functions/sankhya-online/customer-groups";
import { readGroupedMix } from "../../supabase/functions/sankhya-online/history";
import { billedFixture, closeBilledFixtures } from "../test/billed-orders-fixture";
import { afterEach } from "vitest";
afterEach(closeBilledFixtures);
import { createERPClient } from "./erp-online";
const id = "8a6f3bac-0000-4000-8000-000000000001";
const members = [
  { id: "sankhya:customer:1", code: "1", name: "Guerro", cnpj: "111", sellerCode: 34 },
  { id: "sankhya:customer:2", code: "2", name: "Pagnussat", cnpj: "222", sellerCode: 34 },
];
const group: CustomerGroup = {
  id,
  name: "Guerro & Pagnussat",
  memberIds: members.map((m) => m.id),
  members,
  editable: true,
  version: 1,
};
const observation = { source: "sankhya", readOnly: true, readAt: "2026-11-03T12:00:00Z" };
describe("Agrupamentos manuais — composição atual e carteira autorizada", () => {
  it("valida cadastro e não aceita cliente operacional fictício, repetição ou fonte ERP concorrente", () => {
    const v = { id, name: "  Grupo  ", memberIds: group.memberIds, version: 0, active: true };
    expect(validateCustomerGroup(v).name).toBe("Grupo");
    for (const extra of [
      { memberIds: [members[0]!.id] },
      { memberIds: [members[0]!.id, members[0]!.id] },
      { memberIds: ["customer-group:" + id, members[1]!.id] },
      { version: -1 },
      { name: " " },
      { classId: 1 },
      { active: null },
    ])
      expect(() => validateCustomerGroup({ ...v, ...extra })).toThrow();
  });
  it("substitui linhas sem mudar o cadastro e mantém identificação textual", () => {
    const before = structuredClone(members);
    const r = consolidateCustomerRows(members, [group]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: "customer-group:" + id,
      isGroup: true,
      memberCount: 2,
      name: "Guerro & Pagnussat · Agrupamento · 2 clientes",
    });
    expect(members).toEqual(before);
  });
  it("busca encontra nome, integrante, código e CNPJ", () => {
    for (const s of ["guerro & pagnussat", "pagnussat", "222", "1"])
      expect(groupMatches(group, s)).toBe(true);
    expect(groupMatches(group, "outro")).toBe(false);
  });
  it("soma valores decimais e documentos sem somar mix", () => {
    const r = consolidateCustomerRows(
      [
        {
          id: "s1",
          groupCode: 1,
          total: "9007199254740993.01",
          count: 2,
          missingAmountCount: 0,
          qty: 2,
        },
        { id: "s2", groupCode: 2, total: "0.09", count: 1, missingAmountCount: 0, qty: 2 },
      ],
      [group],
      "sales",
    );
    expect(r[0]).toMatchObject({ total: "9007199254740993.1", count: 3, qty: null });
  });
  it("qualquer valor desconhecido mantém total desconhecido", () => {
    expect(
      consolidateCustomerRows(
        [
          { id: "s1", groupCode: 1, total: null, count: 1, missingAmountCount: 1 },
          { id: "s2", groupCode: 2, total: "10", count: 1 },
        ],
        [group],
        "sales",
      )[0]?.["total"],
    ).toBeNull();
  });
  it("não positiva carteira com compra de membro externo ao escopo", () => {
    const partial = {
      ...group,
      memberIds: [members[0]!.id],
      members: [members[0]!],
      editable: false,
    };
    const r = consolidateCustomerRows(
      [{ ...members[0]!, bought: false, localStatus: "Sem compra no mês 2026-11" }],
      [partial],
      "wallet",
    );
    expect(r[0]).toMatchObject({
      bought: false,
      memberCount: 1,
      name: "Guerro & Pagnussat · Agrupamento · 1 cliente",
    });
  });
  it("falha diante de dupla associação", () =>
    expect(() => consolidateCustomerRows(members, [group, { ...group, id: "outra" }])).toThrow());
  it("consolida antes da busca, ausência, resumo e paginação, inclusive entre páginas", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      ...members[i % 2]!,
      id: `sankhya:customer:${i + 1}`,
      code: String(i + 1),
      name: "Cliente " + (i + 1),
      bought: i === 50,
      localStatus: (i === 50 ? "Com" : "Sem") + " compra no mês 2026-11",
    }));
    const g = { ...group, memberIds: [rows[0]!.id, rows[50]!.id], members: [rows[0]!, rows[50]!] };
    const read = vi.fn(async (_op, q) => ({
      ...observation,
      summary: { walletCount: 51, buyerCount: 1, nonBuyerCount: 50 },
      total: 51,
      totalWithoutSearch: 51,
      items: rows.slice(q.offset, q.offset + q.limit),
    }));
    const r = await groupedWindow(
      {
        operation: "nonbuyers-report",
        query: { resource: "customers", month: "2026-11", offset: 0, limit: 50 },
      },
      [g],
      read,
    );
    expect(r["summary"]).toMatchObject({
      walletCount: 50,
      buyerCount: 1,
      nonBuyerCount: 49,
      customerCount: 49,
    });
    expect(r["items"]).toHaveLength(49);
    expect(
      r["items"].every((x: Record<string, unknown>) => !x["isGroup"] && x["id"] !== rows[0]!.id),
    ).toBe(true);
    const found = await groupedWindow(
      {
        operation: "wallet-report",
        query: {
          view: "customers",
          resource: "customers",
          month: "2026-11",
          offset: 0,
          limit: 1,
          search: "Guerro",
        },
      },
      [g],
      read,
    );
    expect(found["total"]).toBe(1);
    expect(found["items"][0]).toMatchObject({ isGroup: true, bought: true });
  });
  it("rejeita total alterado entre páginas em vez de devolver consolidado parcial", async () => {
    let n = 0;
    await expect(
      groupedWindow(
        { operation: "window", query: { resource: "customers", offset: 0, limit: 20 } },
        [group],
        async () => ({ ...observation, total: ++n === 1 ? 51 : 52, items: members }),
      ),
    ).rejects.toMatchObject({ code: "ERP_CONTEXT_REQUIRED" });
  });
  it("lista resolve cada integrante pelo Auth e não expõe códigos fora da carteira", async () => {
    const g = {
      select: vi.fn(async (sql: string) =>
        sql.includes("P.CODPARC=1")
          ? [
              {
                CODPARC: 1,
                RAZAOSOCIAL: "Guerro",
                CODVEND: 34,
                CODEMP: 1,
                ATIVO: "S",
                CLIENTE: "S",
              },
            ]
          : [],
      ),
    };
    const result = await readCustomerGroups(
      g,
      { role: "vendedor", sellerCode: 34, companyCodes: [1] },
      {
        list: async () => [
          { id, data: { name: group.name, memberIds: group.memberIds, active: true, version: 1 } },
        ],
        save: vi.fn(),
      },
    );
    expect(result[0]).toMatchObject({ memberIds: [members[0]!.id], editable: false });
    expect(JSON.stringify(result)).not.toContain("sankhya:customer:2");
  });
  it("vendedor não grava; gestor não remove integrante fora do seu escopo", async () => {
    const store = {
      list: async () => [{ id, data: { memberIds: group.memberIds } }],
      save: vi.fn(),
    };
    const g = { select: vi.fn(async () => []) };
    await expect(saveCustomerGroup(g, { role: "vendedor" }, {}, store)).rejects.toMatchObject({
      code: "ERP_SCOPE_FORBIDDEN",
    });
    await expect(
      saveCustomerGroup(
        g,
        { role: "gestor", sellerCode: 34, companyCodes: [1], teamSellerCodes: [] },
        { id, name: group.name, memberIds: group.memberIds, version: 1, active: true },
        store,
      ),
    ).rejects.toMatchObject({ code: "ERP_SCOPE_FORBIDDEN" });
    expect(store.save).not.toHaveBeenCalled();
  });
  it("SDK confirma gravação e recusa versão incompatível", async () => {
    const query = { id, name: group.name, memberIds: group.memberIds, version: 1, active: true };
    const c = createERPClient(async () => ({
      data: { ...observation, result: { saved: true, id, version: 99 } },
      error: null,
    }));
    await expect(c.saveCustomerGroup(query)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("mix usa união de SKU no conjunto autorizado, não soma de contagens individuais", async () => {
    const f = billedFixture();
    f.order(1, "10", { movement: "P", operation: 1001, customer: 1 });
    f.order(2, "20", { movement: "P", operation: 1001, customer: 2 });
    f.db.exec(
      "ALTER TABLE TGFITE ADD COLUMN CODEMP INTEGER;ALTER TABLE TGFITE ADD COLUMN CODPROD INTEGER;INSERT INTO TGFITE VALUES(1,1,1,5),(2,1,1,5);INSERT INTO USER_TAB_COLUMNS VALUES('TGFITE','CODEMP','NUMBER'),('TGFITE','CODPROD','NUMBER'),('TGFPAR','RAZAOSOCIAL','VARCHAR2');",
    );
    const r = await readGroupedMix(
      f.g,
      {
        resource: "orders",
        offset: 0,
        limit: 1,
        groupBy: "customer",
        productMix: true,
        from: "2026-10-01",
        to: "2026-10-31",
      },
      { role: "administrador" },
      group.memberIds,
    );
    expect(r.items[0]).toMatchObject({ qty: 1, count: 2, total: "30" });
  });
});
