import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { it, expect, afterEach } from "vitest";
import AIAnswer from "./AIAnswer";
afterEach(cleanup);
it("renderiza títulos, negrito, listas e tabelas sem mostrar Markdown bruto", () => {
  const { container } = render(
    <AIAnswer
      text={
        "## Vendas\n\nTotal: **R$ 620.613,50**\n\n- Filial 1\n- Filial 4\n\n| Filial | Total |\n| --- | --- |\n| 1 | R$ 10 |"
      }
    />,
  );
  expect(screen.getByRole("heading", { name: "Vendas" })).toBeInTheDocument();
  expect(container.querySelector("strong")).toHaveTextContent("R$ 620.613,50");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(container.textContent).not.toContain("**");
});
it("não executa HTML ou links com JavaScript", () => {
  const { container } = render(
    <AIAnswer text={"<script>alert(1)</script>\n\n[link](javascript:alert(1))"} />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("a")?.getAttribute("href")).not.toContain("javascript:");
});
