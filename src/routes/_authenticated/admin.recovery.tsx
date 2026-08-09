import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Mail, MessageCircle, RefreshCw, ShoppingBag } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/recovery")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: RecoveryPage,
});

type RecoveryRow = {
  id: string;
  session_id: string;
  email: string | null;
  phone: string | null;
  cart_snapshot: unknown;
  subtotal_cents: number;
  total_cents: number;
  source: string | null;
  first_seen_at: string;
  last_seen_at: string;
  recovered_at: string | null;
  recovery_channel: string | null;
};

function RecoveryPage() {
  const [rows, setRows] = useState<RecoveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecovered, setShowRecovered] = useState(false);

  async function load() {
    setLoading(true);
    try {
      let query = supabase.from("abandoned_checkouts").select("*").order("last_seen_at", { ascending: false }).limit(300);
      if (!showRecovered) query = query.is("recovered_at", null);
      const { data, error } = await query;
      if (error) throw error;
      setRows((data ?? []) as RecoveryRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar carrinhos");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [showRecovered]);

  async function markRecovered(row: RecoveryRow, channel: string) {
    const { error } = await supabase.from("abandoned_checkouts").update({ recovered_at: new Date().toISOString(), recovery_channel: channel }).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Carrinho marcado como recuperado");
    await load();
  }

  const openValue = rows.filter((r) => !r.recovered_at).reduce((sum, row) => sum + Number(row.total_cents ?? 0), 0);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><Badge variant="secondary">Recuperação · v1.2</Badge><h1 className="mt-2 font-display text-3xl">Carrinhos recuperáveis</h1><p className="mt-1 text-sm text-muted-foreground">Carrinhos com valor são mantidos por sessão para permitir recuperação por e-mail, push ou WhatsApp quando houver contato disponível.</p></div>
          <div className="flex gap-2"><label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={showRecovered} onChange={(e) => setShowRecovered(e.target.checked)} /> Mostrar recuperados</label><Button variant="outline" onClick={load}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar</Button></div>
        </header>

        <div className="grid gap-3 sm:grid-cols-3"><Metric label="Carrinhos exibidos" value={String(rows.length)} /><Metric label="Valor em aberto" value={formatBRL(openValue)} /><Metric label="Ticket potencial" value={formatBRL(rows.length ? Math.round(openValue / Math.max(1, rows.filter((r) => !r.recovered_at).length)) : 0)} /></div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[1000px] text-sm"><thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3 text-left">Sessão / contato</th><th>Itens</th><th>Total</th><th>Última atividade</th><th>Origem</th><th>Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody>
            {rows.map((row) => {
              const items = Array.isArray(row.cart_snapshot) ? row.cart_snapshot : [];
              return <tr key={row.id} className="border-t border-border"><td className="px-4 py-3"><p className="font-mono text-xs">{row.session_id.slice(0, 12)}…</p><p className="mt-1 text-xs text-muted-foreground">{row.email ?? row.phone ?? "Contato ainda não informado"}</p></td><td className="text-center">{items.length}</td><td className="text-center font-medium">{formatBRL(row.total_cents)}</td><td className="text-center text-xs">{new Date(row.last_seen_at).toLocaleString("pt-BR")}</td><td className="text-center">{row.source ?? "store"}</td><td className="text-center">{row.recovered_at ? <Badge>Recuperado</Badge> : <Badge variant="outline">Em aberto</Badge>}</td><td className="px-4 py-3"><div className="flex justify-end gap-1">{row.email ? <Button size="sm" variant="ghost" asChild><a href={`mailto:${row.email}?subject=${encodeURIComponent("Você esqueceu seus produtos na Absoluto Glamur")}`} title="Enviar e-mail"><Mail className="h-4 w-4" /></a></Button> : null}{row.phone ? <Button size="sm" variant="ghost" asChild><a href={`https://wa.me/${row.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" title="Abrir WhatsApp"><MessageCircle className="h-4 w-4" /></a></Button> : null}<Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(JSON.stringify(row.cart_snapshot, null, 2)); toast.success("Carrinho copiado"); }} title="Copiar carrinho"><Copy className="h-4 w-4" /></Button>{!row.recovered_at ? <Button size="sm" variant="outline" onClick={() => markRecovered(row, row.phone ? "whatsapp" : row.email ? "email" : "manual")}><CheckCircle2 className="mr-1 h-4 w-4" /> Recuperado</Button> : null}</div></td></tr>;
            })}
            {!loading && rows.length === 0 ? <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground"><ShoppingBag className="mx-auto mb-2 h-8 w-8" />Nenhum carrinho neste filtro.</td></tr> : null}
          </tbody></table>
        </div>
      </div>
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-card p-4 shadow-soft"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl">{value}</p></div>; }
