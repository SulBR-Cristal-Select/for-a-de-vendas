import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LayoutDashboard, Users, Package, ClipboardList } from "lucide-react";

const nav = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/produtos", label: "Catálogo", icon: Package },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
] as const;

export function AppShell({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="bg-sidebar text-sidebar-foreground md:w-60 md:min-h-screen md:flex md:flex-col">
        <div className="px-6 py-5 font-display text-xl font-bold tracking-tight">
          Força<span className="text-sidebar-primary">.</span>Vendas
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{ className: "bg-sidebar-accent !text-sidebar-primary" }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden px-6 py-5 text-xs text-sidebar-foreground/60 md:block">
          Vendedor: Guilherme Sette
        </div>
      </aside>
      <main className="flex-1 px-5 py-8 md:px-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {action}
        </header>
        {children}
      </main>
    </div>
  );
}
