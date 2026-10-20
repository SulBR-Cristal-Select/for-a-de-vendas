import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { produtos, brl } from "@/lib/data";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Catálogo — Força de Vendas" },
      { name: "description", content: "Catálogo de produtos com preços e estoque disponível." },
      { property: "og:title", content: "Catálogo — Força de Vendas" },
      { property: "og:description", content: "Catálogo de produtos com preços e estoque disponível." },
    ],
  }),
  component: Produtos,
});

function Produtos() {
  return (
    <AppShell title="Catálogo">
      <Card className="p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="text-right">Estoque</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produtos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell className="text-muted-foreground">{p.categoria}</TableCell>
                <TableCell className="text-right">{brl(p.preco)}</TableCell>
                <TableCell className={`text-right ${p.estoque < 100 ? "font-semibold text-destructive" : ""}`}>{p.estoque}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
