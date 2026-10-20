import { Badge } from "@/components/ui/badge";
import type { Pedido } from "@/lib/data";

const variant = { Aberto: "secondary", Faturado: "default", Entregue: "outline" } as const;

export function StatusBadge({ status }: { status: Pedido["status"] }) {
  return <Badge variant={variant[status]}>{status}</Badge>;
}
