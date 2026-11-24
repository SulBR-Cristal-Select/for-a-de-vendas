import { describe, expect, it, vi } from "vitest";
import { readOperationOptions } from "../../supabase/functions/sankhya-online/operations";
const admin = { role: "administrador" as const };
const row = {
  CODTIPOPER: 100,
  DESCROPER: "Operação da fixture",
  BONIFICACAO: "N",
  VERSION_AT: "2026-10-20T09:10:11",
  COMPANY_1: 22,
  COMPANY_4: 0,
};
function transport() {
  return {
    select: vi.fn(async (sql: string) => (sql.startsWith("SELECT COUNT") ? [{ TOTAL: 1 }] : [row])),
  };
}
describe("candidatas de operação comercial, nunca TOP padrão inferida", () => {
  it("lista somente operações ativas P, versão atual e prova documental 1/4", async () => {
    const g = transport();
    const r = await readOperationOptions(g, { pageSize: 10 }, admin);
    expect(r).toMatchObject({
      source: "sankhya",
      readOnly: true,
      total: 1,
      hasMore: false,
      items: [
        {
          code: 100,
          name: row.DESCROPER,
          bonusFlag: "N",
          version: row.VERSION_AT,
          documentsByCompany: { "1": 22, "4": 0 },
        },
      ],
    });
    const sql = g.select.mock.calls.map((c) => c[0]).join("\n");
    expect(sql).toContain("CODEMP IN (1,4)");
    expect(sql).toContain("TIPMOV='P'");
    expect(sql).toContain("T.ATIVO='S'");
    expect(sql).toContain("X.DHALTER<=SYSDATE");
    expect(sql).toContain("ORDER BY T.CODTIPOPER OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY");
    expect(r).not.toHaveProperty("defaultOperation");
  });
  it.each(["gestor", "vendedor"] as const)("não concede configuração ao papel %s", async (role) => {
    const g = transport();
    await expect(readOperationOptions(g, {}, { role })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(g.select).not.toHaveBeenCalled();
  });
  it.each([
    { page: 0 },
    { page: 1.5 },
    { pageSize: 51 },
    { pageSize: "10" },
    { role: "administrador" },
    { sql: "SELECT 1" },
    { page: 2147483647 },
  ])("recusa parâmetros antes do ERP: %j", async (query) => {
    const g = transport();
    await expect(readOperationOptions(g, query as never, admin)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(g.select).not.toHaveBeenCalled();
  });
  it("não substitui contagem ilegível por zero", async () => {
    const g = { select: vi.fn(async () => []) };
    await expect(readOperationOptions(g, {}, admin)).rejects.toMatchObject({
      code: "ERP_INVALID_RESPONSE",
    });
  });
});
