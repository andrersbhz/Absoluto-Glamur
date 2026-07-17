import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, FileWarning, Loader2, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getComplianceOverview } from "@/lib/admin-system.functions";

export const Route = createFileRoute("/_authenticated/admin/compliance")({
  head: () => ({ meta: [{ title: "Conformidade · Admin Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: adm } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (adm) return;
    const { data: compliance } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "compliance" });
    if (!compliance) throw redirect({ to: "/account" });
  },
  component: CompliancePage,
});

function CompliancePage() {
  const load = useServerFn(getComplianceOverview);
  const q = useQuery({ queryKey: ["admin-compliance"], queryFn: () => load() });
  const data = q.data;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-3xl">Conformidade</h1>
            <p className="text-sm text-muted-foreground">Auditoria operacional, revisão de produtos, SEO obrigatório e eventos de pagamento.</p>
          </div>
        </div>

        {q.isLoading && (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando conformidade…
          </div>
        )}

        {data && (
          <>
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <ComplianceKpi label="Produtos ativos" value={data.activeProducts} ok />
              <ComplianceKpi label="Sem SEO completo" value={data.productsMissingSeo.length} ok={data.productsMissingSeo.length === 0} />
              <ComplianceKpi label="Sem mídia" value={data.productsMissingMedia.length} ok={data.productsMissingMedia.length === 0} />
              <ComplianceKpi label="Reviews pendentes" value={data.pendingReviews} ok={data.pendingReviews === 0} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <IssueList title="Produtos com SEO incompleto" items={data.productsMissingSeo} empty="Todos os produtos ativos têm SEO." />
              <IssueList title="Produtos sem mídia" items={data.productsMissingMedia} empty="Todos os produtos ativos têm imagem." />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl">Integrações com erro</h2>
                  <Badge variant={data.integrationsWithErrors.length ? "destructive" : "secondary"}>{data.integrationsWithErrors.length}</Badge>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {data.integrationsWithErrors.map((item) => (
                    <div key={item.provider} className="rounded-lg border border-border p-3">
                      <p className="font-medium">{item.display_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.last_error ?? "Erro não especificado"}</p>
                    </div>
                  ))}
                  {!data.integrationsWithErrors.length && <p className="text-muted-foreground">Nenhuma integração reportando erro.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl">Eventos de pagamento com erro</h2>
                  <Badge variant={data.paymentEventErrors ? "destructive" : "secondary"}>{data.paymentEventErrors}</Badge>
                </div>
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  {data.recentPaymentEvents.map((event) => (
                    <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                      <div>
                        <p className="font-medium text-foreground">{event.provider} · {event.event_type}</p>
                        <p>{event.error ?? (event.processed ? "Processado" : "Pendente")}</p>
                      </div>
                      <span>{new Date(event.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                  {!data.recentPaymentEvents.length && <p>Nenhum webhook recebido ainda.</p>}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="font-display text-xl">Auditoria recente</h2>
              <div className="mt-4 divide-y divide-border text-sm">
                {data.recentAuditLogs.map((log) => (
                  <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium">{log.action}</p>
                      <p className="text-xs text-muted-foreground">{log.entity ?? "sistema"} · {log.actor_id ?? "automático"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                ))}
                {!data.recentAuditLogs.length && <p className="py-4 text-muted-foreground">Nenhum evento de auditoria registrado.</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function ComplianceKpi({ label, value, ok }: { label: string; value: number; ok: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2 text-muted-foreground">
        {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
        <p className="text-xs uppercase tracking-widest">{label}</p>
      </div>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}

function IssueList({ title, items, empty }: { title: string; items: Array<{ id: string; name: string }>; empty: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center gap-2">
        <FileWarning className="h-5 w-5 text-warning" />
        <h2 className="font-display text-xl">{title}</h2>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        {items.map((item) => (
          <Link key={item.id} to="/admin/catalog/$id" params={{ id: item.id }} className="block rounded-lg border border-border p-3 hover:bg-secondary">
            {item.name}
          </Link>
        ))}
        {!items.length && <p className="text-muted-foreground">{empty}</p>}
      </div>
    </div>
  );
}