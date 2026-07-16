import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({ meta: [{ title: "Pedidos · Admin Bloom" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!data) throw redirect({ to: "/account" });
  },
  component: AdminOrdersPage,
});

function AdminOrdersPage() {
  const q = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, code, status, total_cents, customer_name, customer_email, created_at, paid_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl">Pedidos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Últimos 100 pedidos, ordem cronológica reversa.</p>

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.data?.map((o) => (
                <tr key={o.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 font-mono text-xs">{o.code}</td>
                  <td className="px-4 py-3">
                    <p>{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{o.customer_email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{o.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">{formatBRL(o.total_cents)}</td>
                </tr>
              )) ?? null}
              {q.data && q.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum pedido ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 text-sm">
          <Link to="/admin" className="text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}
