import { it, expect, vi, beforeEach } from "vitest";
vi.mock("../../supabase/functions/sankhya-online/read-model.ts", () => ({ readRecord: vi.fn() }));
import { readRecord } from "../../supabase/functions/sankhya-online/read-model";
import { readOrderRegistry } from "../../supabase/functions/sankhya-online/order-registry";
const q = { customerId: "sankhya:customer:5282" };
const scope = { role: "vendedor" as const, sellerCode: 14, companyCodes: [1, 4] as (1 | 4)[] };
beforeEach(() =>
  vi
    .mocked(readRecord)
    .mockResolvedValue({ record: { active: true } } as Awaited<ReturnType<typeof readRecord>>),
);
it.each([
  null,
  {},
  { ...q, sql: "SELECT" },
  { customerId: "sankhya:customer:0" },
  { customerId: "5282" },
])("recusa argumentos %j", async (value) => {
  const select = vi.fn();
  await expect(readOrderRegistry({ select }, value, scope)).rejects.toMatchObject({
    code: "INVALID_REQUEST",
  });
  expect(select).not.toHaveBeenCalled();
});
it("respeita leitura por escopo antes de consultar cadastro", async () => {
  vi.mocked(readRecord).mockResolvedValue({ record: null } as Awaited<
    ReturnType<typeof readRecord>
  >);
  const select = vi.fn();
  await expect(readOrderRegistry({ select }, q, scope)).rejects.toMatchObject({
    code: "ERP_CONTEXT_REQUIRED",
  });
  expect(select).not.toHaveBeenCalled();
});
it("retorna condição e agenda somente do cadastro vigente", async () => {
  const select = vi.fn().mockResolvedValue([
    {
      CODPARC: 5282,
      SUGTIPNEGSAID: 10,
      AD_STATUS_PEDIDO: "1",
      DESCRTIPVENDA: "A VISTA",
      PAYMENT_ACTIVE: "S",
    },
  ]);
  expect(await readOrderRegistry({ select }, q, scope)).toMatchObject({
    paymentCode: 10,
    agenda: "1",
    conditionSource: "TGFCPL.SUGTIPNEGSAID",
  });
  expect(select.mock.calls[0]?.[0]).toContain("FETCH FIRST 2 ROWS ONLY");
});
it.each(
  [
    [],
    [{ CODPARC: 5282 }],
    Array(2).fill({
      CODPARC: 5282,
      SUGTIPNEGSAID: 10,
      AD_STATUS_PEDIDO: "1",
      DESCRTIPVENDA: "A VISTA",
      PAYMENT_ACTIVE: "S",
    }),
  ].map((rows) => ({ rows })),
)("não inventa cadastro ausente ou ambíguo", async ({ rows }) => {
  const select = vi.fn().mockResolvedValue(rows);
  await expect(readOrderRegistry({ select }, q, scope)).rejects.toMatchObject({
    code: "ERP_CONTEXT_REQUIRED",
  });
});
it("escolhe no máximo5 candidatos da própria carteira, sem inferir filial extra", async () => {
  const select = vi
    .fn()
    .mockResolvedValueOnce([{ CODPARC: 225 }])
    .mockResolvedValueOnce([
      {
        CODPARC: 225,
        SUGTIPNEGSAID: 10,
        AD_STATUS_PEDIDO: "1",
        DESCRTIPVENDA: "A VISTA",
        PAYMENT_ACTIVE: "S",
      },
    ]);
  expect(
    await readOrderRegistry(
      { select },
      { chooseFromWallet: true },
      { ...scope, companyCodes: [1] },
    ),
  ).toMatchObject({ customerId: "sankhya:customer:225" });
  expect(select.mock.calls[0]?.[0]).toContain("P.CODVEND=14");
  expect(select.mock.calls[0]?.[0]).toContain("P.CODEMP IN (1) OR P.CODEMP IS NULL");
  expect(select.mock.calls[0]?.[1]).toBe(5);
});
it("não escolhe candidato sem vínculo de vendedor", async () => {
  const select = vi.fn();
  await expect(
    readOrderRegistry({ select }, { chooseFromWallet: true }, { role: "administrador" }),
  ).rejects.toMatchObject({ code: "ERP_IDENTITY_REQUIRED" });
  expect(select).not.toHaveBeenCalled();
});
