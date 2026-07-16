import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const roles = (rolesData ?? []).map((r) => r.role as string);
    if (!roles.includes("admin") && !roles.includes("superadmin")) {
      throw redirect({ to: "/account" });
    }
  },
  component: AdminHome,
});

const phases = [
  { n: 1, title: "Fundação", done: true, items: ["Auth", "Perfis", "Funções", "Design system"] },
  { n: 2, title: "Catálogo", done: false, items: ["Produtos", "Variantes", "Categorias", "Mídias", "Carrinho"] },
  { n: 3, title: "Checkout & PIX", done: false, items: ["Endereços", "Pedidos", "Asaas/PIX", "Webhooks"] },
  { n: 4, title: "AliExpress", done: false, items: ["Importador", "Preço/Estoque", "Rastreamento"] },
  { n: 5, title: "Inteligência", done: false, items: ["Scores", "Precificação", "Editor + Publicar"] },
  { n: 6, title: "Marketing", done: false, items: ["Google Merchant", "Meta Catalog", "Campanhas"] },
  { n: 7, title: "IA", done: false, items: ["OpenAI", "Gemini", "SEO", "Análises"] },
  { n: 8, title: "Dashboard & Compliance", done: false, items: ["Métricas", "Alertas", "Uso do plano", "Regulatório"] },
];

function AdminHome() {
  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-3xl">Bem-vinda ao Bloom Admin</h1>
        <p className="mt-2 text-muted-foreground">
          A Fase 1 (Fundação) está concluída. Cada fase seguinte será entregue após validação da anterior.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {phases.map((p) => (
            <div
              key={p.n}
              className="rounded-2xl border border-border bg-card p-5 shadow-soft"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Fase {p.n}</p>
                {p.done ? (
                  <Badge className="bg-success text-white hover:bg-success/90">Concluída</Badge>
                ) : (
                  <Badge variant="outline">Pendente</Badge>
                )}
              </div>
              <h3 className="mt-2 font-display text-xl">{p.title}</h3>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {p.items.map((it) => (
                  <li key={it}>• {it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-dashed border-border bg-secondary/40 p-6">
          <h2 className="font-display text-xl">Integrações</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhuma integração externa configurada ainda. Cada uma será conectada em sua fase, com solicitação segura das credenciais:
          </p>
          <ul className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <li>• AliExpress — Fase 4</li>
            <li>• Asaas / Mercado Pago — Fase 3</li>
            <li>• Google Ads / Merchant / GA4 / Search Console / GTM — Fase 6</li>
            <li>• Meta Business / Pixel / Catalog / CAPI — Fase 6</li>
            <li>• OpenAI / Gemini — Fase 7</li>
            <li>• Cloudflare R2 (opcional) — futuro</li>
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Enquanto uma integração não estiver conectada, os componentes correspondentes exibirão o status “Integração não configurada”.
          </p>
        </div>

        <div className="mt-6 text-sm">
          <Link to="/account" className="text-primary hover:underline">← Voltar para minha conta</Link>
        </div>
      </div>
    </AdminLayout>
  );
}
