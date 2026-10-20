import { createContext, useContext, useState, type ReactNode } from "react";
import { pedidosIniciais, type Pedido } from "./data";

type Ctx = { pedidos: Pedido[]; adicionar: (p: Omit<Pedido, "id" | "data" | "status">) => void };
const PedidosCtx = createContext<Ctx | null>(null);

export function PedidosProvider({ children }: { children: ReactNode }) {
  const [pedidos, setPedidos] = useState<Pedido[]>(pedidosIniciais);
  const adicionar: Ctx["adicionar"] = (p) =>
    setPedidos((prev) => [
      { ...p, id: String(Math.max(...prev.map((x) => Number(x.id))) + 1), data: new Date().toISOString().slice(0, 10), status: "Aberto" },
      ...prev,
    ]);
  return <PedidosCtx.Provider value={{ pedidos, adicionar }}>{children}</PedidosCtx.Provider>;
}

export function usePedidos() {
  const c = useContext(PedidosCtx);
  if (!c) throw new Error("usePedidos fora do provider");
  return c;
}
