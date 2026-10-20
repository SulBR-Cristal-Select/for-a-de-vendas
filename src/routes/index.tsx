import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { clientes, produtos, brl, dataBR, totalPedido, META_MENSAL } from "@/lib/data";
import { usePedidos } from "@/lib/pedidos-store";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel — Força de Vendas" },
      { name: "description", content: "Acompanhe metas, pedidos e clientes da sua equipe de vendas." },
      { property: "og:title", content: "Painel — Força de Vendas" },
      { property: "og:description", content: "Acompanhe metas, pedidos e clientes da sua equipe de vendas." },
    ],
  }),
  component: Painel,
});

function Painel() {
  const { pedidos } = usePedidos();
  const mes = pedidos.filter((p) => p.data.startsWith("2026-10"));
  const vendido = mes.reduce((s, p) => s + totalPedido(p), 0);
  const pct = Math.min(100, (vendido / META_MENSAL) * 100);
  const baixoEstoque = produtos.filter((p) => p.estoque < 100);

  return (
    <AppShell title="Painel" action={<Button asChild><Link to="/pedidos">Novo pedido</Link></Button>}>
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5 md:col-span-2">
          <p className="text-sm text-muted-foreground">Meta de outubro</p>
          <p className="mt-1 font-display text-3xl font-bold">{brl(vendido)}</p>
          <Progress value={pct} className="mt-4" />
          <p className="mt-2 text-xs text-muted-foreground">{pct.toFixed(0)}% de {brl(META_MENSAL)}</p>
        </Card>
        <Kpi label="Pedidos no mês" value={String(mes.length)} />
        <Kpi label="Clientes ativos" value={String(clientes.length)} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5 md:col-span-2">
          <h2 className="mb-4 font-display text-lg font-semibold">Pedidos recentes</h2>
          <ul className="divide-y">
            {pedidos.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">#{p.id} · {clientes.find((c) => c.id === p.clienteId)?.nome}</p>
                  <p className="text-muted-foreground">{dataBR(p.data)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{brl(totalPedido(p))}</span>
                  <StatusBadge status={p.status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Estoque baixo</h2>
          {baixoEstoque.map((p) => (
            <div key={p.id} className="flex justify-between py-2 text-sm">
              <span>{p.nome}</span>
              <span className="font-semibold text-destructive">{p.estoque} un</span>
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
    </Card>
  );
}
