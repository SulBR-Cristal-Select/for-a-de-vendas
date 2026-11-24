import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SulApp, { createAppState } from "./SulApp";
import { receivablesFixture } from "../test/receivables-fixture";
import { closeBilledFixtures } from "../test/billed-orders-fixture";
vi.mock("@g4ai/ds", async (original) => ({
  ...(await original<typeof import("@g4ai/ds")>()),
  notify: vi.fn(),
}));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  closeBilledFixtures();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  location.hash = "";
});
function mount(many = false) {
  location.hash = "#/relatorios/titulos";
  const f = receivablesFixture();
  for (let n = 1; n <= (many ? 65 : 1); n++)
    f.title(n, "10.12", { document: n, settled: n === 1 ? "2026-10-25" : null });
  const persist = vi.fn();
  render(
    <SulApp
      initialState={createAppState({
        titles: [{ id: "manual", document: "MANUAL-NÃO-SOMAR", value: 99999 }],
      })}
      online={f.client}
      persist={persist}
      onSignOut={vi.fn()}
    />,
  );
  return { ...f, persist };
}
describe("Títulos pela fonte financeira nativa, sem nova interface", () => {
  it("conserva cinco colunas, nome ERP e valor nativo; baixa não é Pago", async () => {
    const f = mount();
    await screen.findByText("R$ 10,12");
    const table = screen.getByRole("table", { name: "Títulos" });
    expect(within(table).getByText("Cliente homônimo")).toBeInTheDocument();
    expect(within(table).getByText("Baixa registrada")).toBeInTheDocument();
    expect(screen.getByText(/não comprova quitação integral/)).toBeInTheDocument();
    expect(screen.queryByText("MANUAL-NÃO-SOMAR")).not.toBeInTheDocument();
    expect(screen.queryByText("Pago")).not.toBeInTheDocument();
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.transport.mock.calls.every(([b]) => b.operation === "receivables-report")).toBe(true);
  });
  it("busca em documento é remota, não apenas na página", async () => {
    const f = mount(true);
    await screen.findByText("Baixa registrada");
    fireEvent.change(screen.getByPlaceholderText("Filtrar…"), { target: { value: "65" } });
    await waitFor(() => expect(f.transport.mock.calls.at(-1)?.[0].query.search).toBe("65"));
    await screen.findByText("65");
    expect(screen.getAllByText("R$ 10,12")).toHaveLength(1);
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("CSV65 mantém os cinco campos e precisão, além da página10", async () => {
    const create = vi.fn((_b: Blob) => "blob:receivables");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const f = mount(true);
    await screen.findByText("Baixa registrada");
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const text = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(create.mock.calls[0]![0]);
    });
    expect(text.split("\r\n")).toHaveLength(66);
    expect(text).toContain("customer;due;value;status;document");
    expect(text).toContain('"Cliente homônimo";"2026-10-26";"10.12";"Baixa registrada";"1"');
    expect(text).not.toContain("MANUAL");
    expect(f.persist).not.toHaveBeenCalled();
  });
  it("erro de leitura não usa títulos manuais nem mostra saldo zero", async () => {
    location.hash = "#/relatorios/titulos";
    const f = receivablesFixture();
    f.transport.mockRejectedValue(Error("Falha sintética"));
    render(
      <SulApp
        initialState={createAppState({
          titles: [{ id: "manual", document: "MANUAL", value: 99999 }],
        })}
        online={f.client}
        persist={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    await screen.findByText("Consulta ERP indisponível. Tente novamente.");
    expect(screen.queryByText("MANUAL")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
  });
});
