import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  BarChart3, BookOpen, Boxes, Compass, ExternalLink, Gauge, LayoutDashboard, LogOut, Megaphone, Moon, Package,
  PanelsTopLeft, Plug, RotateCcw, Settings, ShieldCheck, ShoppingCart, Sparkles, Store, Sun, Target, Users, WalletCards, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Badge } from "@/components/ui/badge";
import { AdminPushToggle } from "@/components/admin/AdminPushToggle";
import "@/admin-blog.css";

type NavItem = { label: string; icon: typeof LayoutDashboard; to?: string; phase: number };

const nav: NavItem[] = [
  { label: "Visão geral", icon: LayoutDashboard, to: "/admin", phase: 1 },
  { label: "Home Builder", icon: PanelsTopLeft, to: "/admin/home", phase: 2 },
  { label: "Integrações", icon: Plug, to: "/admin/integrations", phase: 1 },
  { label: "Atendimento WhatsApp", icon: MessageSquare, to: "/admin/whatsapp", phase: 9 },
  { label: "Pedidos", icon: ShoppingCart, to: "/admin/orders", phase: 3 },
  { label: "Recuperação de carrinho", icon: RotateCcw, to: "/admin/recovery", phase: 3 },
  { label: "Catálogo", icon: Package, to: "/admin/catalog", phase: 2 },
  { label: "Importador AliExpress", icon: Boxes, to: "/admin/imports", phase: 4 },
  { label: "Descobrir produtos", icon: Compass, to: "/admin/discover", phase: 4 },
  { label: "Inteligência de produtos", icon: Sparkles, to: "/admin/intelligence", phase: 5 },
  { label: "Oportunidades v1.2", icon: Target, to: "/admin/opportunities", phase: 5 },
  { label: "Precificação v1.2", icon: WalletCards, to: "/admin/pricing", phase: 5 },
  { label: "Marketing & SEO", icon: Megaphone, to: "/admin/marketing", phase: 6 },
  { label: "Blog SEO & Social", icon: BookOpen, to: "/admin/blog", phase: 6 },
  { label: "Performance v1.2", icon: BarChart3, to: "/admin/performance", phase: 8 },
  { label: "IA (OpenAI/Gemini)", icon: Zap, to: "/admin/ai", phase: 7 },
  { label: "Dashboard executivo", icon: BarChart3, to: "/admin/dashboard", phase: 8 },
  { label: "Preferências globais", icon: Settings, to: "/admin/settings", phase: 8 },
  { label: "Conformidade", icon: ShieldCheck, to: "/admin/compliance", phase: 8 },
  { label: "Usuários e permissões", icon: Users, to: "/admin/users", phase: 1 },
  { label: "Uso do plano gratuito", icon: Gauge, to: "/admin/usage", phase: 8 },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, roles } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const isActive = (to?: string) =>
    !!to && (to === "/admin" ? pathname === "/admin" : pathname.startsWith(to));

  return (
    <div className="admin-shell flex min-h-screen bg-background">
      <aside className="hidden w-56 shrink-0 border-r border-sidebar-border bg-sidebar p-3 md:block lg:w-64 lg:p-4">
        <Link to="/" className="block font-display text-2xl text-primary">
          absoluto glamur<span className="text-plum">.</span>
          <span className="ml-2 align-top text-xs font-sans text-muted-foreground">admin</span>
        </Link>
        <nav className="mt-8 space-y-1 text-sm">
          {nav.map((item) => {
            const enabled = !!item.to;
            const active = isActive(item.to);
            const Icon = item.icon;
            const inner = (
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {!enabled && (
                  <Badge variant="outline" className="ml-auto text-[10px]">F{item.phase}</Badge>
                )}
              </span>
            );
            return enabled && item.to ? (
              <Link
                key={item.label}
                to={item.to}
                data-active={active || undefined}
                className="admin-nav-link flex rounded-lg px-3 py-2 text-sidebar-foreground transition"
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
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Painel administrativo · v1.2</p>
            <p className="text-sm text-foreground">{user?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/20"
              title="Abrir a loja em nova aba"
            >
              <Store className="h-4 w-4" />
              <span className="hidden sm:inline">Ver loja</span>
              <ExternalLink className="h-3 w-3 opacity-70" />
            </Link>
            <AdminPushToggle />
            <div className="hidden gap-1 sm:flex">
              {roles.map((r) => (
                <Badge key={r} variant="secondary">{r}</Badge>
              ))}
            </div>
            <button
              onClick={toggle}
              aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition hover:bg-secondary"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden sm:inline">{theme === "dark" ? "Claro" : "Escuro"}</span>
            </button>
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
