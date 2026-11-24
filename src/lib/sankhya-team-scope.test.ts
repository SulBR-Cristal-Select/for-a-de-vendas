import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { actorScope, loggedSeller } from "../../supabase/functions/sankhya-online/identity";
import {
  scopeOf,
  sellerPredicate,
  readPage,
  readWindow,
  readRecord,
  readFacets,
  type ReadScope,
} from "../../supabase/functions/sankhya-online/read-model";
import { readHistory, readDocument } from "../../supabase/functions/sankhya-online/history";
import { readPaymentOptions } from "../../supabase/functions/sankhya-online/payments";
import { readPrice } from "../../supabase/functions/sankhya-online/price-context";
import { readOperationOptions } from "../../supabase/functions/sankhya-online/operations";
import migration from "../../supabase/migrations/20261024222600_sankhya_commercial_team_scope.sql?raw";
import migration7 from "../../supabase/migrations/20261023205700_sankhya_online_transactions.sql?raw";
import migration8 from "../../supabase/migrations/20261024184200_sankhya_actor_identity.sql?raw";

const userId = "00000000-0000-4000-8000-000000000001";
const binding = {
  userId,
  sellerId: "sankhya:seller:34",
  sellerCode: 34,
  companyCodes: [1, 4] as const,
  teamSellerCodes: [6, 7],
};
const actor = { id: userId, company_id: "432299", active: true, role: "gestor", binding };
const manager = actorScope(actor);
const customer = {
  CODPARC: 141,
  RAZAOSOCIAL: "Cliente sintético",
  CODVEND: 6,
  CODEMP: 1,
  ATIVO: "S",
  BLOQUEAR: "N",
};
function transport() {
  return {
    select: vi.fn(async (sql: string, _limit: number) =>
      sql.startsWith("SELECT COUNT") ? [{ TOTAL: 0 }] : [],
    ),
  };
}
const sqlOf = (g: ReturnType<typeof transport>) => g.select.mock.calls.map((c) => c[0]).join("\n");

describe("escopo explícito de equipe, sem concessão por nome ou CODGER", () => {
  it("consulta próprio vendedor e somente os códigos privados autorizados", () => {
    const scope = scopeOf(manager);
    expect(scope).toEqual({ companies: [1], seller: 34, sellers: [34, 6, 7] });
    expect(sellerPredicate(scope, "P.CODVEND")).toBe("P.CODVEND IN (34,6,7)");
    expect(loggedSeller(manager)).toBe(34);
    expect(() => loggedSeller(manager, 6)).toThrow("Vendedor fora");
  });
  it.each(["vendedor", "administrador"])("equipe preparada não muda o papel %s", (role) => {
    const scope = actorScope({ ...actor, role });
    expect(scope).not.toHaveProperty("teamSellerCodes");
    expect(loggedSeller(scope)).toBe(34);
    expect(scopeOf(scope).sellers).toEqual(role === "vendedor" ? [34] : null);
  });
  it("preserva gestor sem equipe no próprio vendedor, não na empresa inteira", () => {
    expect(scopeOf({ role: "gestor", sellerCode: 34, companyCodes: [1] }).sellers).toEqual([34]);
  });
  it("não ativa um perfil nem usa a equipe para suprir vínculo ausente", () => {
    expect(() => actorScope({ ...actor, active: false })).toThrow("pendente");
    expect(() => scopeOf(actorScope({ ...actor, binding: null }))).toThrow("Vínculo explícito");
  });
  it.each([
    null,
    {},
    "6",
    [0],
    [34],
    [6, 6],
    [1.5],
    ["6"],
    [2147483648],
    Array.from({ length: 50 }, (_, i) => i + 100),
  ])("falha fechada para equipe inválida: %j", (teamSellerCodes) => {
    expect(() =>
      actorScope({ ...actor, binding: { ...binding, teamSellerCodes } } as never),
    ).toThrow("Vínculo explícito");
  });
  it("copia a equipe recebida, sem conservar referência mutável", () => {
    const mutable = { ...binding, teamSellerCodes: [6] };
    const scope = actorScope({ ...actor, binding: mutable });
    mutable.teamSellerCodes.push(12);
    expect(scope.teamSellerCodes).toEqual([6]);
  });
  it.each([
    { role: "vendedor", sellerCode: 34, companyCodes: [1], teamSellerCodes: [6] },
    { ...manager, companyCodes: [1, 1] },
    { ...manager, teamSellerCodes: [0] },
    { ...manager, teamSellerCodes: [34] },
  ])("valida também a fronteira comum dos leitores: %j", (scope) => {
    expect(() => scopeOf(scope as ReadScope)).toThrow("Vínculo explícito");
  });
  it("aceita49 membros mais o próprio vendedor, sem gerar uma lista irrestrita", () => {
    const scope = actorScope({
      ...actor,
      binding: { ...binding, teamSellerCodes: Array.from({ length: 49 }, (_, i) => i + 100) },
    });
    expect(scopeOf(scope).sellers).toHaveLength(50);
  });
});

describe("mesmo escopo em páginas, ficha, facetas, histórico e condições", () => {
  it.each(["page", "window", "record", "facet"] as const)(
    "aplica carteira autorizada em %s",
    async (kind) => {
      const g = transport();
      if (kind === "page") await readPage(g, { resource: "customers", pageSize: 50 }, manager);
      if (kind === "window")
        await readWindow(g, { resource: "customers", offset: 0, limit: 50 }, manager);
      if (kind === "record") await readRecord(g, { resource: "customers", id: 141 }, manager);
      if (kind === "facet")
        await readFacets(g, { resource: "customers", facet: "seller", pageSize: 50 }, manager);
      for (const [sql, limit] of g.select.mock.calls) {
        expect(sql).toContain("P.CODVEND IN (34,6,7)");
        expect(limit).toBeLessThanOrEqual(50);
      }
    },
  );
  it("permite filtrar um integrante autorizado sem substituir o vendedor da cotação", async () => {
    const g = transport();
    await readPage(
      g,
      { resource: "customers", filters: { sellerCode: 6, companyCode: 1 } },
      manager,
    );
    expect(sqlOf(g)).toContain("P.CODVEND=6");
    expect(sqlOf(g)).toContain("P.CODEMP IN (1)");
    expect(loggedSeller(manager)).toBe(34);
  });
  it.each([{ sellerCode: 12 }, { companyCode: 3 }])(
    "recusa filtro fora da carteira antes do ERP: %j",
    async (filters) => {
      const g = transport();
      await expect(readPage(g, { resource: "customers", filters }, manager)).rejects.toMatchObject({
        code: "ERP_SCOPE_FORBIDDEN",
      });
      expect(g.select).not.toHaveBeenCalled();
    },
  );
  it("recusa equipe fornecida pelo navegador, sem fundir o corpo HTTP ao escopo", async () => {
    const g = transport();
    await expect(
      readPage(g, { resource: "customers", teamSellerCodes: [12] } as never, manager),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(g.select).not.toHaveBeenCalled();
  });
  it("filtra verificação administrativa da equipe por CODGER, sem conceder acesso", async () => {
    const g = transport();
    await readPage(
      g,
      { resource: "sellers", filters: { managerCode: 34 }, pageSize: 50 },
      { role: "administrador" },
    );
    expect(sqlOf(g)).toContain("P.CODGER=34");
    await readPage(g, { resource: "sellers", filters: { managerCode: 34 } }, manager);
    expect(sqlOf(g)).toContain("P.CODVEND IN (34,6,7)");
  });
  it.each([
    { resource: "customers", filters: { managerCode: 34 } },
    { resource: "sellers", filters: { managerCode: 12 } },
  ])("não amplia escopo usando gerente na consulta: %j", async (input) => {
    const g = transport();
    await expect(readPage(g, input as never, manager)).rejects.toBeDefined();
    expect(g.select).not.toHaveBeenCalled();
  });
  it("histórico usa carteira atual, sem deduzir a equipe pelo vendedor histórico do documento", async () => {
    const g = transport();
    await readHistory(g, { resource: "orders", offset: 0, limit: 50 }, manager);
    expect(sqlOf(g)).toContain("P.CODVEND IN (34,6,7)");
    expect(sqlOf(g)).not.toContain("C.CODVEND IN (34,6,7)");
    const d = transport();
    await readDocument(d, { id: "sankhya:order:75367" }, manager);
    expect(sqlOf(d)).toContain("P.CODVEND IN (34,6,7)");
  });
  it("condições usam carteira da mesma equipe, preservando filial NULL somente na1", async () => {
    const g = {
      select: vi.fn(async (sql: string, _limit: number) =>
        sql.startsWith("SELECT COUNT")
          ? [{ TOTAL: 0 }]
          : sql.includes("FROM TGFPAR P")
            ? [customer]
            : [],
      ),
    };
    await readPaymentOptions(
      g,
      { customerId: "sankhya:customer:141", offset: 0, limit: 50, date: "2026-10-24" },
      manager,
    );
    const sql = g.select.mock.calls.map((c) => c[0]).join("\n");
    expect(sql).toContain("P.CODVEND IN (34,6,7)");
    expect(sql).toContain("C.CODVEND IN (34,6,7)");
    expect(sql).toContain("C.CODEMP=1 OR C.CODEMP IS NULL");
  });
  it("cotação recusa vendedor fora da equipe explícita, antes de consultar o ERP", async () => {
    const g = { ...transport(), contextPrices: vi.fn() };
    await expect(
      readPrice(
        g,
        {
          customerId: "sankhya:customer:141",
          productId: "sankhya:product:11240",
          paymentCode: 29,
          type: "Venda",
          sellerCode: 99,
        },
        manager,
      ),
    ).rejects.toMatchObject({ code: "ERP_SCOPE_FORBIDDEN" });
    expect(g.select).not.toHaveBeenCalled();
    expect(g.contextPrices).not.toHaveBeenCalled();
  });
  it("não transforma acesso comercial em acesso à configuração administrativa de TOPs", async () => {
    const g = transport();
    await expect(readOperationOptions(g, {}, manager)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(g.select).not.toHaveBeenCalled();
  });
});

describe("migração9 preserva transação e não ativa usuários", () => {
  it("mantém imutáveis as migrações7/8 já aplicadas", () => {
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    expect(hash(migration7)).toBe(
      "f3b9d9cdcad1a62233a1f0eab3dc426f74dc83551cb26dd833c8d76a5339d65a",
    );
    expect(hash(migration8)).toBe(
      "b672fbb7a6d3694993937a85e595b40448ea83b16bbec7e4f1f379548bd88c7e",
    );
  });
  it("acrescenta somente uma guarda ao corpo anterior de save_workspace, depois do replay/PT409", () => {
    const section = (s: string) => {
      const start = s.indexOf("create or replace function public.save_workspace(");
      return s.slice(start, s.indexOf("end $$;", start) + "end $$;".length);
    };
    const updated = section(migration),
      call = "\n perform sul_private.scope_write_guard(p_state,p);";
    expect(updated.replace(call, "")).toBe(section(migration7));
    expect(updated.indexOf("if found then")).toBeLessThan(updated.indexOf(call));
    expect(updated.indexOf("errcode='PT409'")).toBeLessThan(updated.indexOf(call));
    expect(updated.indexOf(call)).toBeLessThan(updated.indexOf("online_required:="));
  });
  it("não altera perfil/Auth, vínculo pessoal, prova, preço ou proprietário operacional", () => {
    const start = migration.indexOf("create or replace function public.save_workspace(");
    const end = migration.indexOf("end $$;", start) + "end $$;".length;
    // O corpo legado da função foi preservado; defini-lo não executa seus comandos.
    const ddl = migration.slice(0, start) + migration.slice(end);
    expect(ddl).not.toMatch(/update\s+(public\.profiles|auth\.users|public\.customers)\b/i);
    expect(migration).toContain("p.role='gestor' then jsonb_build_object('teamSellerCodes'");
    expect(migration).toContain("not p.active and p.role='vendedor'");
    expect(migration).toContain("sul_private.actor_owner_allowed(p_actor,v)");
    expect(migration).not.toContain("create or replace function sul_private.save_online_order(");
    expect(migration).not.toContain("create or replace function public.attest_erp_order_request(");
    expect(migration).not.toContain("create or replace function sul_private.online_required(");
  });
});
