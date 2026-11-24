import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxOption } from "@g4ai/ds";
import { createERPClient, type ERPRow, type ERPResource } from "../lib/erp-online";
import { ERPCombobox, matchesERPOption, type ERPMatches } from "./erp-combobox";
import { useERPOrderLookups } from "./erp-order-lookups";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const remote = (query: string, ids: string[] = ["sankhya:customer:141"]): ERPMatches => ({
  query,
  ids: new Set(ids),
});
const option = { value: "sankhya:customer:141", label: "Loja Alvorada (141)" };

describe("Filtragem do resultado remoto sem mudar rótulos", () => {
  it.each(["12345678000190", "MARINGA", "telefone ausente", "Referência 90"])(
    "respeita a confirmação do servidor para %s",
    (query) => {
      expect(matchesERPOption(option, query, remote(query))).toBe(true);
    },
  );
  it("não libera uma opção fixada que não veio na consulta corrente", () => {
    expect(
      matchesERPOption(option, "12345678000190", remote("12345678000190", ["sankhya:customer:99"])),
    ).toBe(false);
  });
  it("não usa a confirmação de outra consulta nem de outra identidade", () => {
    expect(matchesERPOption(option, "atual", remote("anterior"))).toBe(false);
    expect(matchesERPOption(option, "atual", remote("atual", []))).toBe(false);
  });
  it("mantém busca local sem acento, descrição e consulta vazia", () => {
    const local = { value: "manual", label: "João", description: "São Paulo" };
    for (const query of ["JOAO", "sao paulo", ""])
      expect(matchesERPOption(local, query, remote("outro"))).toBe(true);
    expect(matchesERPOption(local, "sem correspondência", remote("sem correspondência"))).toBe(
      false,
    );
  });
});

const casos: { resource: ERPResource; label: string; row: ERPRow; query: string }[] = [
  {
    resource: "customers",
    label: "Cliente",
    row: {
      id: "sankhya:customer:141",
      code: "141",
      name: "Loja Alvorada",
      document: "12345678000190",
    },
    query: "12345678000190",
  },
  {
    resource: "products",
    label: "Produto",
    row: {
      id: "sankhya:product:11240",
      code: "11240",
      name: "Produto selecionável",
      reference: "REF-EXT-90",
    },
    query: "REF-EXT-90",
  },
  {
    resource: "sellers",
    label: "Vendedor",
    row: { id: "sankhya:seller:34", code: "34", name: "Pessoa da sessão" },
    query: "34",
  },
];
const observation = { source: "sankhya", readOnly: true, readAt: "2026-10-24T19:45:00.000Z" };
function clientFor(caso: (typeof casos)[number]) {
  return createERPClient(
    vi.fn(async ({ operation, query }: import("../test/erp-fixture-types").FixtureRequest) => {
      if (operation === "record")
        return { error: null, data: { ...observation, record: caso.row } };
      const rows =
        query.resource === caso.resource && (!query.search || query.search === caso.query)
          ? [caso.row]
          : [];
      return {
        error: null,
        data: {
          ...observation,
          items: rows,
          offset: query.offset,
          total: rows.length,
          totalWithoutSearch: 1,
        },
      };
    }) as unknown as import("../lib/erp-online").ERPTransport,
  );
}

describe("Seletor real ligado à consulta transitória", () => {
  it.each(casos)(
    "mostra e seleciona $label encontrado por uma chave que não está no rótulo",
    async (caso) => {
      const client = clientFor(caso),
        selected = vi.fn();
      function Formulario() {
        const dados = useERPOrderLookups(
          client,
          "",
          [],
          caso.resource === "sellers" ? String(caso.row["id"]) : undefined,
        );
        const [value, setValue] = useState("");
        return (
          <ERPCombobox
            label={caso.label}
            value={value}
            onValueChange={(next) => {
              setValue(next);
              selected(next);
            }}
            remote={dados.matches[caso.resource]}
            options={dados[caso.resource].map((row) => ({
              value: String(row["id"]),
              label: String(row["name"]),
            }))}
          />
        );
      }
      render(<Formulario />);
      fireEvent.click(screen.getByRole("combobox", { name: caso.label }));
      const input = await screen.findByLabelText(
        `Buscar em ${caso.label.toLocaleLowerCase("pt-BR")}`,
      );
      fireEvent.input(input, { target: { value: caso.query } });
      const found = await screen.findByRole("option", { name: String(caso.row["name"]) });
      fireEvent.click(found);
      await waitFor(() => expect(selected).toHaveBeenLastCalledWith(caso.row["id"]));
      expect(screen.getByRole("combobox", { name: caso.label }).textContent).toContain(
        caso.row["name"],
      );
    },
  );

  it("mantém o componente DS sem adaptador quando não há consulta remota", async () => {
    const selected = vi.fn();
    render(
      <ERPCombobox
        label="Manual"
        value=""
        onValueChange={selected}
        options={[
          { value: "a", label: "João" },
          { value: "b", label: "Maria" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Manual" }));
    fireEvent.input(await screen.findByLabelText("Buscar em manual"), {
      target: { value: "joao" },
    });
    expect(screen.getByRole("option", { name: "João" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Maria" })).toBeNull();
  });
  it("preserva a seleção múltipla pelo próprio DS", async () => {
    const selected = vi.fn();
    render(
      <ERPCombobox
        label="Múltiplos"
        multiple
        value={["a"]}
        onValueChange={selected}
        remote={remote("")}
        options={[
          { value: "a", label: "Primeiro" },
          { value: "b", label: "Segundo" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Remover Primeiro" })).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: "Múltiplos" }));
    fireEvent.click(await screen.findByRole("option", { name: "Segundo" }));
    expect(selected).toHaveBeenLastCalledWith(["a", "b"]);
  });
});

function estrutura(root: Element): unknown {
  return {
    tag: root.tagName,
    classe: root.getAttribute("class"),
    papel: root.getAttribute("role"),
    rotulo: root.getAttribute("aria-label"),
    placeholder: root.getAttribute("placeholder"),
    texto: root.childElementCount ? undefined : root.textContent,
    filhos: Array.from(root.children).map(estrutura),
  };
}

describe("Invariância da estrutura existente DS0.9.0", () => {
  it.each([false, true])(
    "preserva classes, textos, popup e controles; selecionado=%s",
    async (chosen) => {
      const options: ComboboxOption[] = [
        option,
        { value: "manual", label: "Outra opção", description: "Descrição original" },
      ];
      const props = {
        label: "Cliente",
        value: chosen ? option.value : "",
        onValueChange: vi.fn(),
        options,
        required: true,
      };
      const base = render(<Combobox {...props} />);
      const trigger = estrutura(base.container);
      fireEvent.click(screen.getByRole("combobox", { name: "Cliente" }));
      const originalPopup = (await screen.findByLabelText("Buscar em cliente")).closest(
        '[aria-label="Cliente"]',
      )!;
      await screen.findByRole("option", { name: option.label });
      const popup = estrutura(originalPopup);
      base.unmount();
      const adapted = render(<ERPCombobox {...props} remote={remote("")} />);
      expect(estrutura(adapted.container)).toEqual(trigger);
      fireEvent.click(screen.getByRole("combobox", { name: "Cliente" }));
      const adaptedPopup = (await screen.findByLabelText("Buscar em cliente")).closest(
        '[aria-label="Cliente"]',
      )!;
      await screen.findByRole("option", { name: option.label });
      expect(estrutura(adaptedPopup)).toEqual(popup);
    },
  );
});

describe("Digitação incremental com resposta remota atrasada", () => {
  it.each(["Cliente", "Produto"])(
    "mantém a pesquisa em %s enquanto as opções são substituídas",
    async (label) => {
      const resource = label === "Cliente" ? "customers" : "products";
      const row = {
        id: `sankhya:${resource === "customers" ? "customer" : "product"}:3559`,
        name: "GUERRO & PAGNUSSAT",
        code: "3559",
      };
      const requests: string[] = [];
      const client = createERPClient(async ({ query: rawQuery }) => {
        const query = rawQuery as import("../lib/erp-online").ERPWindowQuery;
        if (query.resource === resource) requests.push(query.search ?? "");
        await new Promise((resolve) => setTimeout(resolve, query.search === "g" ? 450 : 80));
        const items =
          query.resource === resource &&
          String(row.name)
            .toLowerCase()
            .includes(query.search || "")
            ? [row]
            : [];
        return {
          error: null,
          data: {
            ...observation,
            items,
            offset: query.offset,
            total: items.length,
            totalWithoutSearch: 1,
          },
        };
      });
      function Formulario() {
        const dados = useERPOrderLookups(client, "", []);
        const [value, setValue] = useState("");
        return (
          <ERPCombobox
            label={label}
            value={value}
            onValueChange={setValue}
            remote={dados.matches[resource]}
            options={dados[resource].map((r) => ({
              value: String(r["id"]),
              label: String(r["name"]),
            }))}
          />
        );
      }
      render(<Formulario />);
      fireEvent.click(screen.getByRole("combobox", { name: label }));
      const input = await screen.findByLabelText(`Buscar em ${label.toLowerCase()}`);
      fireEvent.change(input, { target: { value: "g" } });
      await waitFor(() => expect(requests).toContain("g"));
      for (const value of ["gu", "gue", "guer", "guerr", "guerro"])
        fireEvent.change(input, { target: { value } });
      await waitFor(() => expect(requests).toContain("guerro"));
      await screen.findByRole("option", { name: row.name });
      expect(input).toHaveValue("guerro");
    },
  );
});
