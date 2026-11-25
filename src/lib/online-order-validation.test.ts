import { describe, expect, it } from "vitest";
import { validateOnlineOrderShape } from "./online-order-validation";
import { prepareOnlineOrder, assertOrderMutation, createAppState } from "../sul/SulApp";
const item = () => ({ productId: "sankhya:product:11029", qty: 1, price: 11.1, unit: "PC" });
const order = () => ({
  id: "qa",
  date: "2026-11-25",
  customerId: "sankhya:customer:131",
  erp: {
    source: "sankhya",
    mode: "online",
    companyCode: 1,
    operationCode: 1001,
    sellerCode: 14,
    payment: { code: 93 },
  },
  items: [item()],
});
describe("Contrato estrutural online — regressões QA", () => {
  it("aceita composição exata", () =>
    expect(() => validateOnlineOrderShape(order())).not.toThrow());
  it.each([0, -1, NaN, Infinity, 100000001, 0.000001])("rejeita quantidade %s", (qty) =>
    expect(() => validateOnlineOrderShape({ ...order(), items: [{ ...item(), qty }] })).toThrow(),
  );
  it.each([0, -1, NaN, Infinity, 10000000001, 0.001])("rejeita preço %s", (price) =>
    expect(() => validateOnlineOrderShape({ ...order(), items: [{ ...item(), price }] })).toThrow(),
  );
  it.each(["2026-02-31", "0000-01-01", "2026-13-01", "", "texto"])("rejeita data %s", (date) =>
    expect(() => validateOnlineOrderShape({ ...order(), date })).toThrow("Data do pedido inválida"),
  );
  it("rejeita filial4 na guarda real", () => {
    const before = createAppState({ orders: [] });
    expect(() =>
      assertOrderMutation(
        { ...before, orders: [{ ...order(), erp: { ...order().erp, companyCode: 4 } }] },
        before,
      ),
    ).toThrow("Somente filial 1");
  });
  it("rejeita duplicatas e51 itens", () => {
    expect(() => validateOnlineOrderShape({ ...order(), items: [item(), item()] })).toThrow(
      "duplicado",
    );
    expect(() =>
      validateOnlineOrderShape({
        ...order(),
        items: Array.from({ length: 51 }, (_, i) => ({
          ...item(),
          productId: `sankhya:product:${i + 1}`,
        })),
      }),
    ).toThrow("cinquenta");
  });
  it("preparo vazio tem erro estrutural antes da espera", () =>
    expect(() =>
      prepareOnlineOrder(
        { items: [] },
        {
          customerId: "sankhya:customer:131",
          sellerId: "sankhya:seller:14",
          paymentCode: 93,
          type: "Venda",
          date: "2026-11-25",
        },
        [],
      ),
    ).toThrow("Pedido deve conter de um a cinquenta itens"));
  it("50 itens únicos são permitidos", () =>
    expect(() =>
      validateOnlineOrderShape({
        ...order(),
        items: Array.from({ length: 50 }, (_, i) => ({
          ...item(),
          productId: `sankhya:product:${i + 1}`,
        })),
      }),
    ).not.toThrow());
});
