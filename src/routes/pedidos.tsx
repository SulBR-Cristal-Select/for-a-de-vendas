import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { clientes, produtos, brl, dataBR, totalPedido } from "@/lib/data";
import { usePedidos } from "@/lib/pedidos-store";

export const Route = createFileRoute("/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos — Força de Vendas" },
      { name: "description", content: "Emita novos pedidos e acompanhe o status dos pedidos dos clientes." },
      { property: "og:title", content: "Pedidos — Força de Vendas" },
      { property: "og:description", content: "Emita novos pedidos e acompanhe o status dos pedidos dos clientes." },
    ],
  }),
  component: Pedidos,
});

function Pedidos() {
  const { pedidos, adicionar } = usePedidos();
  const [clienteId, setClienteId] = useState("");
  const [qtds, setQtds] = useState<Record<string, number>>({});

  const itens = Object.entries(qtds).filter(([, q]) => q > 0).map(([produtoId, qtd]) => ({ produtoId, qtd }));
  const total = itens.reduce((s, i) => s + (produtos.find((p) => p.id === i.produtoId)!.preco) * i.qtd, 0);

  const salvar = () => {
    if (!clienteId || itens.length === 0) return toast.error("Escolha o cliente e ao menos um produto.");
    adicionar({ clienteId, itens });
    setQtds({});
    setClienteId("");
    toast.success("Pedido registrado!");
  };

  return (
    <AppShell title="Pedidos">
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <h2 className="mb-4 font-display text-lg font-semibold">Novo pedido</h2>
          <Select value={clienteId} onValueChange={setClienteId}>
            <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
            <SelectContent>
              {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="mt-4 divide-y">
            {produtos.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{p.nome}</p>
                  <p className="text-muted-foreground">{brl(p.preco)}</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  aria-label={`Quantidade de ${p.nome}`}
                  className="w-24"
                  value={qtds[p.id] ?? ""}
                  onChange={(e) => setQtds({ ...qtds, [p.id]: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between border-t pt-4">
            <span className="font-display text-2xl font-bold">{brl(total)}</span>
            <Button onClick={salvar}>Registrar pedido</Button>
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-display text-lg font-semibold">Histórico</h2>
          <ul className="divide-y">
            {pedidos.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">#{p.id} · {clientes.find((c) => c.id === p.clienteId)?.nome}</p>
                  <p className="text-muted-foreground">{dataBR(p.data)} · {brl(totalPedido(p))}</p>
                </div>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
