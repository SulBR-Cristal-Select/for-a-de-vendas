import { describe, expect, it, vi } from "vitest";
import { readCommercialDictionary } from "../../supabase/functions/sankhya-online/dictionary";
const columns = [
  ["TDDCAM", "NUCAMPO"],
  ["TDDCAM", "NOMETAB"],
  ["TDDCAM", "NOMECAMPO"],
  ["TDDOPC", "NUCAMPO"],
  ["TDDOPC", "VALOR"],
  ["TDDOPC", "OPCAO"],
].map(([TABLE_NAME, COLUMN_NAME]) => ({ TABLE_NAME, COLUMN_NAME, DATA_TYPE: "VARCHAR2" }));
describe("Dicionário comercial selecionado e autenticado", () => {
  it("confere colunas antes de ler significados, sem decidir por letra ou nome presumido", async () => {
    const g = {
      select: vi
        .fn()
        .mockResolvedValueOnce(columns)
        .mockResolvedValueOnce([
          { FIELD_NAME: "TIPOEMP", CODE_VALUE: "X", DESCRIPTION: "Opção sintética" },
        ]),
    };
    const result = await readCommercialDictionary(
      g,
      { kind: "payments" },
      { role: "administrador" },
    );
    expect("options" in result ? result.options : null).toEqual([
      { FIELD_NAME: "TIPOEMP", CODE_VALUE: "X", DESCRIPTION: "Opção sintética" },
    ]);
    expect(g.select.mock.calls[1]?.[0]).toContain("C.NOMETAB='TGFPPG'");
    expect(g.select.mock.calls[1]?.[1]).toBe(50);
    expect(result.hasMore).toBe(false);
  });
  it("limita os campos de elegibilidade aos metadados físicos e não interpreta nomes como regras", async () => {
    const g = {
      select: vi
        .fn()
        .mockResolvedValueOnce([
          ...columns,
          { TABLE_NAME: "TDDCAM", COLUMN_NAME: "DESCRCAMPO", DATA_TYPE: "VARCHAR2" },
        ])
        .mockResolvedValueOnce([
          {
            TABLE_NAME: "TGFPRO",
            FIELD_NAME: "AGRUPMIN",
            DESCRIPTION: "Agrupamento mínimo",
            DATA_TYPE: "NUMBER",
          },
        ]),
    };
    const result = await readCommercialDictionary(
      g,
      { kind: "eligibility" },
      { role: "administrador" },
    );
    expect("fields" in result ? result.fields : null).toHaveLength(1);
    expect(g.select.mock.calls[1]?.[0]).toContain("JOIN USER_TAB_COLUMNS D");
    expect(g.select.mock.calls[1]?.[1]).toBe(50);
  });
  it("não consulta valores se o dicionário não comprova a estrutura", async () => {
    const g = { select: vi.fn().mockResolvedValue([]) };
    expect(
      (await readCommercialDictionary(g, { kind: "payments" }, { role: "administrador" }))
        .supported,
    ).toBe(false);
    expect(g.select).toHaveBeenCalledTimes(1);
  });
  it("não aceita consulta arbitrária nem vínculo não configurado", async () => {
    const g = { select: vi.fn() };
    await expect(
      readCommercialDictionary(g, { kind: "payments" }, { role: "gestor" }),
    ).rejects.toMatchObject({ code: "ERP_IDENTITY_REQUIRED" });
    await expect(
      readCommercialDictionary(
        g,
        { kind: "arbitrario" } as Parameters<typeof readCommercialDictionary>[1],
        { role: "administrador" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(g.select).not.toHaveBeenCalled();
  });
});
