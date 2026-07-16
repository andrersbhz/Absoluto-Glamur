import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Database, Gauge, Loader2, Plug, Sparkles } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { getUsageOverview } from "@/lib/admin-system.functions";

export const Route = createFileRoute("/_authenticated/admin/usage")({
  head: () => ({ meta: [{ title: "Uso do plano gratuito · Admin Bloom" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!data) throw redirect({ to: "/account" });
  },
  component: UsagePage,
});

function UsagePage() {
  const load = useServerFn(getUsageOverview);
  const q = useQuery({ queryKey: ["admin-usage"], queryFn: () => load() });
  const data = q.data;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-3">
          <Gauge className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-3xl">Uso do plano gratuito</h1>
            <p className="text-sm text-muted-foreground">Monitoramento dinâmico de linhas, usuários, IA, importações e integrações ativas.</p>
          </div>
        </div>

        {q.isLoading && (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculando uso…
          </div>
        )}

        {data && (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <UsageKpi icon={Database} label="Linhas no banco" value={data.databaseRows.toLocaleString("pt-BR")} />
              <UsageKpi icon={Activity} label="Novos usuários 30d" value={data.monthlyActiveUsers.toLocaleString("pt-BR")} />
              <UsageKpi icon={Plug} label="Integrações ativas" value={String(data.enabledIntegrations)} />
              <UsageKpi icon={Sparkles} label="Chamadas IA 30d" value={String(data.aiCalls30d)} />
            </div>

            <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="font-display text-xl">Limites principais</h2>
              <div className="mt-5 space-y-5">
                <UsageBar label="Linhas estimadas no banco" value={data.databaseRows} limit={data.databaseRowsLimit} unit="linhas" />
                <UsageBar label="Novos usuários no mês" value={data.monthlyActiveUsers} limit={data.monthlyActiveUsersLimit} unit="usuários" />
                <UsageBar label="Storage" value={data.storageBytes} limit={data.storageBytesLimit} unit="bytes" />
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="font-display text-xl">Linhas por tabela</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-secondary/50 text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <tr><th className="px-4 py-3">Tabela</th><th className="px-4 py-3 text-right">Linhas</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.rowsByTable.map((row) => (
                      <tr key={row.table}>
                        <td className="px-4 py-3 font-mono text-xs">{row.table}</td>
                        <td className="px-4 py-3 text-right">{row.count.toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function UsageKpi({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-xs uppercase tracking-widest">{label}</p>
      </div>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}

function UsageBar({ label, value, limit, unit }: { label: string; value: number; limit: number; unit: string }) {
  const pct = limit ? Math.min(100, (value / limit) * 100) : 0;
  const color = pct >= 95 ? "bg-destructive" : pct >= 85 ? "bg-warning" : pct >= 70 ? "bg-primary" : "bg-success";
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {value.toLocaleString("pt-BR")} / {limit.toLocaleString("pt-BR")} {unit} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}