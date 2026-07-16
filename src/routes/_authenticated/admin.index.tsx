import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Visão geral · Admin Bloom" }] }),
  component: AdminHome,
});

const phases = [
  { n: 1, title: "Fundação", done: true, items: ["Auth", "Perfis", "Funções", "Design system"] },
  { n: 2, title: "Catálogo", done: true, items: ["Produtos", "Variantes", "Categorias", "Mídias", "Carrinho"] },
  { n: 3, title: "Checkout & PIX", done: true, items: ["Endereços", "Pedidos", "Asaas/PIX", "Webhooks", "Integrações"] },
  { n: 4, title: "AliExpress", done: true, items: ["Importador URL/JSON", "Markup configurável", "Publicação"] },
  { n: 5, title: "Inteligência", done: true, items: ["Scores", "Precificação", "Editor + Publicar"] },
  { n: 6, title: "Marketing & SEO", done: true, items: ["Homepage blocks", "Coleções", "Sitemap dinâmico", "JSON-LD"] },
  { n: 7, title: "IA", done: true, items: ["Descrições", "SEO", "Marketing", "Log de uso"] },
  { n: 8, title: "Dashboard & Monitor", done: true, items: ["Métricas", "Alertas 70/85/95%", "Exportação CSV", "Uso do plano"] },
];

function AdminHome() {
  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-3xl">Bem-vinda ao Bloom Admin</h1>
        <p className="mt-2 text-muted-foreground">
          Todas as fases do sistema estão concluídas e cada módulo administrativo está conectado a dados dinâmicos.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {phases.map((p) => (
            <div key={p.n} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Fase {p.n}</p>
                {p.done ? <Badge className="bg-success text-white hover:bg-success/90">Concluída</Badge> : <Badge variant="outline">Pendente</Badge>}
              </div>
              <h3 className="mt-2 font-display text-xl">{p.title}</h3>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {p.items.map((it) => <li key={it}>• {it}</li>)}
              </ul>
            </div>
          ))}
        </div>

        <AdminShortcut title="Integrações" body="Configure chaves de API e webhooks de todos os provedores externos." to="/admin/integrations" />
        <AdminShortcut title="Catálogo" body="Crie e publique produtos, defina preço, estoque, mídias e SEO." to="/admin/catalog" cta="Abrir catálogo" />
        <AdminShortcut title="Importador de produtos" body="Importe do AliExpress via URL, JSON/CSV ou API oficial. Configure markup e publique." to="/admin/imports" cta="Abrir importador" />
        <AdminShortcut title="Marketing & SEO" body="Blocos da homepage, coleções em destaque, sitemap dinâmico e JSON-LD." to="/admin/marketing" />
        <AdminShortcut title="IA de conteúdo" body="Gere descrições, SEO e copy de marketing com Lovable AI. Uso é logado automaticamente." to="/admin/ai" cta="Abrir IA" />
        <AdminShortcut title="Dashboard executivo" body="Métricas de vendas, produtos, clientes e IA. Alertas de uso e exportação CSV." to="/admin/dashboard" cta="Abrir dashboard" />

        <div className="mt-6 text-sm">
          <Link to="/account" className="text-primary hover:underline">← Voltar para minha conta</Link>
        </div>
      </div>
    </AdminLayout>
  );
}

function AdminShortcut({ title, body, to, cta = "Abrir painel" }: { title: string; body: string; to: string; cta?: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
        <Link to={to} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground shadow-soft hover:opacity-90">
          {cta}
        </Link>
      </div>
    </div>
  );
}