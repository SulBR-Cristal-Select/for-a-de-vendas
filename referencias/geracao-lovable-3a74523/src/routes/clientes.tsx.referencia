import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clientes, brl, dataBR } from "@/lib/data";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Força de Vendas" },
      { name: "description", content: "Carteira de clientes com contato, cidade e histórico de compras." },
      { property: "og:title", content: "Clientes — Força de Vendas" },
      { property: "og:description", content: "Carteira de clientes com contato, cidade e histórico de compras." },
    ],
  }),
  component: Clientes,
});

function Clientes() {
  const [q, setQ] = useState("");
  const lista = clientes.filter((c) => (c.nome + c.cidade).toLowerCase().includes(q.toLowerCase()));
  return (
    <AppShell title="Clientes" action={<Input placeholder="Buscar cliente ou cidade" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lista.map((c) => (
          <Card key={c.id} className="p-5">
            <h2 className="font-display text-lg font-semibold">{c.nome}</h2>
            <p className="text-sm text-muted-foreground">{c.cidade}</p>
            <div className="mt-4 space-y-1 text-sm">
              <p>{c.contato} · {c.telefone}</p>
              <p className="text-muted-foreground">Última compra: {dataBR(c.ultimaCompra)}</p>
            </div>
            <p className="mt-4 font-display text-xl font-bold text-primary">{brl(c.total)}</p>
            <p className="text-xs text-muted-foreground">comprado no ano</p>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
