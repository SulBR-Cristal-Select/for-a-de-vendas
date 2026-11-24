import React, { useEffect, useState } from "react";
import { Combobox } from "@g4ai/ds";
import { ERPCombobox } from "./erp-combobox";
import { useERPIndicatorLookup } from "./erp-order-lookups";
import { collectIndicatorSeries } from "./online-indicators";
import type { ERPClient } from "./erp-hooks";
import type {
  ERPIndicatorWindow,
  IndicatorSelection,
  IndicatorSeries,
} from "../lib/erp-indicator-series";
type Kind = "product" | "category" | "customer";
type Props = {
  name: string;
  series: IndicatorSeries;
  kind: "product-or-category" | "category" | "customer";
  client: ERPClient | undefined;
  month: string;
  seller: string;
  identity: string;
  render: (result: ERPIndicatorWindow | undefined, error: string | undefined) => React.ReactNode;
};
/** Filtros de consulta, apenas em memória. Não seleciona indicador nem grava configuração. */
export function SpecificIndicator(p: Props) {
  const [kind, setKind] = useState<Kind>(p.kind === "product-or-category" ? "product" : p.kind),
    [id, setId] = useState(""),
    [active, setActive] = useState(false);
  const label =
    (kind === "product" ? "Produto" : kind === "customer" ? "Cliente" : "Categoria") +
    " — " +
    p.name;
  const lookup = useERPIndicatorLookup(
    active && kind !== "category" ? p.client : undefined,
    kind === "customer" ? "customers" : "products",
    id,
    label,
  );
  const [categories, setCategories] = useState<{
    client: ERPClient;
    identity: string;
    rows: { value: string; label: string }[];
    error?: string;
  }>();
  useEffect(() => {
    if (!active || kind !== "category" || !p.client) return;
    let alive = true;
    const client = p.client;
    void (async () => {
      const rows: { value: string; label: string }[] = [],
        codes = new Set<number>();
      let total: number | undefined;
      for (let page = 1; ; page++) {
        const r = await client.facets({
          resource: "products",
          facet: "category",
          page,
          pageSize: 50,
        });
        if (!alive) return;
        if ((total !== undefined && total !== r.total) || r.total > 10000)
          throw Error("Categorias alteradas ou incompletas.");
        total = r.total;
        for (const x of r.items) {
          const code = x["code"];
          if (
            typeof code !== "number" ||
            !Number.isSafeInteger(code) ||
            code < 1 ||
            code > 2147483647 ||
            codes.has(code)
          )
            throw Error("Categoria sem código único.");
          codes.add(code);
          rows.push({
            value: String(code),
            label: String(x["name"] ?? "Sem descrição") + " [" + code + "]",
          });
        }
        if (!r.hasMore) break;
      }
      if (rows.length !== total) throw Error("Categorias incompletas.");
      if (alive) setCategories({ client, identity: p.identity, rows });
    })().catch((e) => {
      if (alive)
        setCategories({
          client,
          identity: p.identity,
          rows: [],
          error: e instanceof Error ? e.message : "Consulta de categorias indisponível.",
        });
    });
    return () => {
      alive = false;
    };
  }, [active, kind, p.client, p.identity]);
  const selection: IndicatorSelection =
    kind === "product"
      ? id
        ? { productId: id }
        : {}
      : kind === "customer"
        ? id
          ? { customerId: id }
          : {}
        : id
          ? { categoryCode: Number(id) }
          : {};
  const key = JSON.stringify([p.series, p.month, p.seller, p.identity, selection]),
    [state, setState] = useState<{
      client: ERPClient;
      key: string;
      result?: ERPIndicatorWindow;
      error?: string;
    }>();
  useEffect(() => {
    if (!id || !p.client) return;
    let alive = true;
    const client = p.client;
    const match = p.seller ? /^sankhya:seller:([1-9]\d{0,9})$/.exec(p.seller) : null;
    if (p.seller && (!match || Number(match[1]) > 2147483647)) {
      setState({ client, key, error: "Filtro de vendedor ERP inválido." });
      return;
    }
    void collectIndicatorSeries(
      client,
      {
        resource: "orders",
        series: p.series,
        month: p.month,
        ...selection,
        ...(match ? { sellerCode: Number(match[1]) } : {}),
      },
      () => {
        if (!alive) throw Error("Consulta substituída.");
      },
    )
      .then((result) => {
        if (alive) setState({ client, key, result });
      })
      .catch((e) => {
        if (alive)
          setState({
            client,
            key,
            error: e instanceof Error ? e.message : "Consulta ERP indisponível.",
          });
      });
    return () => {
      alive = false;
    };
  }, [p.client, p.series, key, id]);
  const current = id && state && state.client === p.client && state.key === key ? state : undefined;
  const category =
    categories && categories.client === p.client && categories.identity === p.identity
      ? categories
      : undefined;
  const options =
    kind === "category"
      ? (category?.rows ?? [])
      : lookup.rows.map((x) => ({
          value: String(x["id"]),
          label: String(x["name"] ?? "Sem descrição") + " [" + String(x["code"] ?? "") + "]",
        }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {p.kind === "product-or-category" && (
          <Combobox
            label={"Tipo de recorte — " + p.name}
            value={kind}
            onValueChange={(value) => {
              if (value !== "product" && value !== "category") return;
              setKind(value);
              setId("");
              setActive(false);
            }}
            options={[
              { value: "product", label: "Produto" },
              { value: "category", label: "Categoria" },
            ]}
          />
        )}
        <div
          className="min-w-0 flex-1"
          onClickCapture={() => setActive(true)}
          onFocusCapture={() => setActive(true)}
          onPointerDownCapture={() => setActive(true)}
        >
          <ERPCombobox
            label={label}
            value={id}
            onValueChange={setId}
            options={[{ value: "", label: "Sem recorte selecionado" }, ...options]}
            remote={kind === "category" ? undefined : lookup.matches}
          />
        </div>
      </div>
      {p.render(
        current?.result,
        current?.error ??
          (kind === "category" ? category?.error : lookup.error) ??
          (!id
            ? "Selecione o recorte para consultar; nenhum produto, categoria ou cliente foi presumido."
            : undefined),
      )}
    </div>
  );
}
