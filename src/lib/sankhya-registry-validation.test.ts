import { expect, it, vi } from "vitest";
import { checkOrderRegistry } from "../../supabase/functions/sankhya-online/registry-validation";
const p = { codigo_parceiro: 131, codigo_vendedor: 14, codigo_condicao: 93, tipo_agenda: "4" };
const row = {
  CODPARC: 131,
  CODVEND: 14,
  CLIENTE: "S",
  ATIVO: "S",
  SUGTIPNEGSAID: 93,
  CONDICAO_VALIDADA: 93,
  AD_STATUS_PEDIDO: "4",
  CODNAT: 10100000,
  ATIVA: "S",
  ANALITICA: "S",
};
it("agenda4 real é aceita; não presume IMEDIATO", async () => {
  await expect(
    checkOrderRegistry({ select: vi.fn().mockResolvedValue([row]) }, p),
  ).resolves.toBeUndefined();
});
it.each([
  [{ ...row, AD_STATUS_PEDIDO: "1" }, "ERP_ORDER_AGENDA_CHANGED"],
  [{ ...row, SUGTIPNEGSAID: 1 }, "ERP_ORDER_PAYMENT_CHANGED"],
  [{ ...row, CODVEND: 17 }, "ERP_CUSTOMER_SELLER_MISMATCH"],
  [{ ...row, ANALITICA: "N" }, "ERP_ORDER_CONTEXT_CHANGED"],
] as const)("divergência %j tem erro %s", async (r, code) => {
  await expect(
    checkOrderRegistry({ select: vi.fn().mockResolvedValue([r]) }, p),
  ).rejects.toMatchObject({ code });
});
it("cadastro ambíguo não confirma prontidão", async () => {
  await expect(
    checkOrderRegistry({ select: vi.fn().mockResolvedValue([row, row]) }, p),
  ).rejects.toMatchObject({ code: "ERP_ORDER_CONTEXT_CHANGED" });
});
