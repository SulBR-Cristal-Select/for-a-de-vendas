import { describe, expect, it } from "vitest";
import { validCommissionQuery } from "./erp-commission";
import { validRankingQuery } from "./erp-ranking";
import { validReceivablesQuery } from "./erp-receivables";
import { validStockQuery } from "./erp-stock";
import { validWalletQuery } from "./erp-wallet";
import { requiredText } from "./erp-submission-contract";

const validators = [
  (search: string) =>
    validCommissionQuery({ resource: "orders", view: "sellers", offset: 0, limit: 20, search }),
  (search: string) =>
    validRankingQuery({ resource: "orders", month: "2026-11", offset: 0, limit: 20, search }),
  (search: string) => validReceivablesQuery({ resource: "orders", offset: 0, limit: 20, search }),
  (search: string) => validStockQuery({ resource: "products", offset: 0, limit: 20, search }),
  (search: string) =>
    validWalletQuery({
      resource: "customers",
      view: "customers",
      month: "2026-11",
      offset: 0,
      limit: 20,
      search,
    }),
];

describe("Rejeição de controles sem regex de caracteres de controle", () => {
  it.each(Array.from({ length: 32 }, (_, code) => code))(
    "rejeita o código %i em buscas e texto obrigatório",
    (code) => {
      const text = "Cliente" + String.fromCharCode(code) + "Teste";
      for (const validate of validators) expect(validate(text)).toBe(false);
      expect(() => requiredText(text)).toThrow();
    },
  );
  it("preserva texto comum, Unicode e a fronteira imprimível", () => {
    for (const validate of validators) expect(validate("João Cliente 32")).toBe(true);
    expect(requiredText(" João Cliente ")).toBe(" João Cliente ");
  });
  it.each([";", "--", "/*", "*/"])("mantém a rejeição do marcador SQL %s", (marker) => {
    for (const validate of validators) expect(validate("Cliente" + marker)).toBe(false);
  });
});
