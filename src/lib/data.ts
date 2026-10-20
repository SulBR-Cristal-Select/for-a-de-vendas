export type Cliente = { id: string; nome: string; cidade: string; contato: string; telefone: string; ultimaCompra: string; total: number };
export type Produto = { id: string; nome: string; categoria: string; preco: number; estoque: number };
export type Pedido = { id: string; clienteId: string; data: string; itens: { produtoId: string; qtd: number }[]; status: "Aberto" | "Faturado" | "Entregue" };

export const clientes: Cliente[] = [
  { id: "c1", nome: "Mercado Bom Preço", cidade: "Campinas, SP", contato: "Ana Ribeiro", telefone: "(19) 99812-4410", ultimaCompra: "2026-10-14", total: 48200 },
  { id: "c2", nome: "Empório Central", cidade: "Jundiaí, SP", contato: "Carlos Mendes", telefone: "(11) 98877-1203", ultimaCompra: "2026-10-09", total: 31750 },
  { id: "c3", nome: "Supermercado Vila Nova", cidade: "Sorocaba, SP", contato: "Juliana Prado", telefone: "(15) 99654-7788", ultimaCompra: "2026-09-28", total: 67400 },
  { id: "c4", nome: "Distribuidora Leste", cidade: "São Paulo, SP", contato: "Rafael Souza", telefone: "(11) 97321-5566", ultimaCompra: "2026-10-17", total: 112900 },
  { id: "c5", nome: "Armazém da Serra", cidade: "Atibaia, SP", contato: "Marta Lima", telefone: "(11) 99102-3344", ultimaCompra: "2026-08-30", total: 18300 },
];

export const produtos: Produto[] = [
  { id: "p1", nome: "Café Torrado 500g", categoria: "Mercearia", preco: 18.9, estoque: 420 },
  { id: "p2", nome: "Azeite Extra Virgem 500ml", categoria: "Mercearia", preco: 34.5, estoque: 180 },
  { id: "p3", nome: "Suco Integral Uva 1L", categoria: "Bebidas", preco: 14.2, estoque: 360 },
  { id: "p4", nome: "Água Mineral 1,5L (fardo 6)", categoria: "Bebidas", preco: 16.8, estoque: 900 },
  { id: "p5", nome: "Detergente Neutro 500ml", categoria: "Limpeza", preco: 2.9, estoque: 1500 },
  { id: "p6", nome: "Sabão em Pó 1kg", categoria: "Limpeza", preco: 15.4, estoque: 240 },
  { id: "p7", nome: "Biscoito Integral 200g", categoria: "Mercearia", preco: 6.7, estoque: 75 },
  { id: "p8", nome: "Refrigerante Cola 2L", categoria: "Bebidas", preco: 9.9, estoque: 640 },
];

export const pedidosIniciais: Pedido[] = [
  { id: "1042", clienteId: "c4", data: "2026-10-17", status: "Aberto", itens: [{ produtoId: "p1", qtd: 120 }, { produtoId: "p4", qtd: 200 }] },
  { id: "1041", clienteId: "c1", data: "2026-10-14", status: "Faturado", itens: [{ produtoId: "p3", qtd: 80 }, { produtoId: "p5", qtd: 300 }] },
  { id: "1040", clienteId: "c2", data: "2026-10-09", status: "Entregue", itens: [{ produtoId: "p2", qtd: 40 }] },
  { id: "1039", clienteId: "c3", data: "2026-09-28", status: "Entregue", itens: [{ produtoId: "p6", qtd: 150 }, { produtoId: "p8", qtd: 220 }] },
];

export const META_MENSAL = 150000;

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dataBR = (d: string) => d.split("-").reverse().join("/");

export const totalPedido = (p: Pedido) =>
  p.itens.reduce((s, i) => s + (produtos.find((x) => x.id === i.produtoId)?.preco ?? 0) * i.qtd, 0);
