import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  BarChart3, Boxes, Gauge, LayoutDashboard, LogOut, Megaphone, Package,
  ShieldCheck, ShoppingCart, Sparkles, Users, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

const nav = [
  { label: "Visão geral", icon: LayoutDashboard, to: "/admin", phase: 1 },
  { label: "Catálogo", icon: Package, phase: 2 },
  { label: "Pedidos", icon: ShoppingCart, phase: 3 },
  { label: "Importador AliExpress", icon: Boxes, phase: 4 },
  { label: "Inteligência de produtos", icon: Sparkles, phase: 5 },
  { label: "Marketing (Google/Meta)", icon: Megaphone, phase: 6 },
  { label: "IA (OpenAI/Gemini)", icon: Zap, phase: 7 },
  { label: "Dashboard executivo", icon: BarChart3, phase: 8 },
  { label: "Conformidade", icon: ShieldCheck, phase: 8 },
  { label: "Usuários e permissões", icon: Users, phase: 1 },
  { label: "Uso do plano gratuito", icon: Gauge, phase: 2 },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, roles } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar p-4 lg:block">
        <Link to="/" className="block font-display text-2xl text-primary">
          bloom<span className="text-plum">.</span>
          <span className="ml-2 align-top text-xs font-sans text-muted-foreground">admin</span>
        </Link>
        <nav className="mt-8 space-y-1 text-sm">
          {nav.map((item) => {
            const disabled = item.phase !== 1;
            const Icon = item.icon;
            const inner = (
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {disabled && (
                  <Badge variant="outline" className="ml-auto text-[10px]">F{item.phase}</Badge>
                )}
              </span>
            );
            return item.to && !disabled ? (
              <Link
                key={item.label}
                to={item.to}
                className="flex rounded-lg px-3 py-2 text-sidebar-foreground transition hover:bg-sidebar-accent"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={item.label}
                className="flex cursor-not-allowed rounded-lg px-3 py-2 text-muted-foreground opacity-70"
                title={`Disponível na Fase ${item.phase}`}
              >
                {inner}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card/50 px-6 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Painel administrativo</p>
            <p className="text-sm text-foreground">{user?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden gap-1 sm:flex">
              {roles.map((r) => (
                <Badge key={r} variant="secondary">{r}</Badge>
              ))}
            </div>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition hover:bg-secondary"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
