import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useERPCatalogPrices } from "./erp-catalog-prices";
import type { ERPClient } from "./erp-hooks";
const context = {
  customerId: "sankhya:customer:131",
  paymentCode: 93,
  type: "Venda" as const,
  sellerCode: 14,
  date: "2026-11-24",
};
const rows = [{ id: "sankhya:product:11029", unit: "PC" }];
describe("preço contextual na lista de produtos", () => {
  it("consulta somente com lista aberta e condição válida, por unidade e quantidade1", async () => {
    const price = vi.fn(async () => ({ price: { amount: 11.1 } }));
    const client = { price } as unknown as ERPClient;
    const { result, rerender } = renderHook(
      ({ open }) => useERPCatalogPrices(client, context, rows, open),
      { initialProps: { open: false } },
    );
    expect(price).not.toHaveBeenCalled();
    rerender({ open: true });
    await waitFor(() => expect(result.current[rows[0]!.id]).toContain("11,10"));
    expect(price).toHaveBeenCalledWith({
      ...context,
      productId: rows[0]!.id,
      quantity: 1,
      unit: "PC",
    });
  });
  it("trocar cliente limpa preços e descarta resposta antiga", async () => {
    let resolve!: (value: unknown) => void;
    const price = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolve = r)))
      .mockResolvedValue({ price: { amount: 20 } });
    const client = { price } as unknown as ERPClient;
    const { result, rerender } = renderHook(
      ({ customerId }) => useERPCatalogPrices(client, { ...context, customerId }, rows, true),
      { initialProps: { customerId: context.customerId } },
    );
    rerender({ customerId: "sankhya:customer:132" });
    await waitFor(() => expect(result.current[rows[0]!.id]).toContain("20,00"));
    await act(async () => resolve({ price: { amount: 11.1 } }));
    expect(result.current[rows[0]!.id]).toContain("20,00");
  });
  it("sem condição não consulta e erro não fabrica preço", async () => {
    const client = {
      price: vi.fn().mockRejectedValue(new Error("Preço indisponível.")),
    } as unknown as ERPClient;
    const { result, rerender } = renderHook(
      ({ paymentCode }) => useERPCatalogPrices(client, { ...context, paymentCode }, rows, true),
      { initialProps: { paymentCode: NaN } },
    );
    expect(client.price).not.toHaveBeenCalled();
    rerender({ paymentCode: 93 });
    await waitFor(() => expect(result.current[rows[0]!.id]).toBe("Preço indisponível."));
  });
});
