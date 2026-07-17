import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, TrendingUp, Trash2, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listProductsWithScores, listPricingRules, upsertPricingRule, deletePricingRule,
  computeProductScore,
} from "@/lib/intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/intelligence")({
  head: () => ({ meta: [{ title: "Inteligência de produtos · Admin Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: adm } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (adm) return;
    const { data: cat } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "catalog" });
    if (!cat) throw redirect({ to: "/account" });
  },
  component: IntelligenceHome,
});

function scoreColor(v: number | null | undefined) {
  if (v == null) return "bg-muted text-muted-foreground";
  if (v >= 80) return "bg-success text-white";
  if (v >= 60) return "bg-primary text-primary-foreground";
  if (v >= 40) return "bg-amber-500 text-white";
  return "bg-destructive text-white";
}

function IntelligenceHome() {
  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="font-display text-3xl">Inteligência de produtos</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Scores 0-100 com memória de cálculo, regras de precificação e histórico de decisões.
        </p>

        <Tabs defaultValue="scores" className="mt-6">
          <TabsList>
            <TabsTrigger value="scores">Scores de produtos</TabsTrigger>
            <TabsTrigger value="rules">Regras de precificação</TabsTrigger>
          </TabsList>
          <TabsContent value="scores" className="mt-6">
            <ScoresTab />
          </TabsContent>
          <TabsContent value="rules" className="mt-6">
            <RulesTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function ScoresTab() {
  const list = useServerFn(listProductsWithScores);
  const compute = useServerFn(computeProductScore);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["intel-products"], queryFn: () => list({ data: undefined as never }) });

  const computeMut = useMutation({
    mutationFn: (id: string) => compute({ data: { product_id: id } }),
    onSuccess: () => {
      toast.success("Score recalculado");
      qc.invalidateQueries({ queryKey: ["intel-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = query.data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border p-4 text-sm text-muted-foreground">
        {rows.length} produtos · clique em "Recalcular" para atualizar o score
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-4 p-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-xl font-display text-lg ${scoreColor(r.score?.overall)}`}>
              {r.score?.overall ?? "—"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{r.name}</p>
                <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.score?.label ?? "Sem score"} · atualizado {r.score?.computed_at ? new Date(r.score.computed_at).toLocaleString("pt-BR") : "nunca"}
              </p>
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => computeMut.mutate(r.id)}
              disabled={computeMut.isPending}
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Recalcular
            </Button>
            <Link
              to="/admin/intelligence/$id"
              params={{ id: r.id }}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground shadow-soft hover:opacity-90"
            >
              <TrendingUp className="mr-1 inline h-3 w-3" /> Abrir
            </Link>
          </div>
        ))}
        {!rows.length && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum produto cadastrado ainda. Crie um em <Link to="/admin/catalog" className="text-primary underline">Catálogo</Link>.
          </div>
        )}
      </div>
    </div>
  );
}

type RuleForm = {
  id?: string;
  name: string;
  description: string;
  is_default: boolean;
  is_active: boolean;
  markup_pct: number;
  fixed_fee_cents: number;
  rounding: "none" | "psychological_99" | "psychological_90" | "nearest_1" | "nearest_5";
  min_margin_pct: number | null;
  max_margin_pct: number | null;
  priority: number;
};

const emptyRule: RuleForm = {
  name: "",
  description: "",
  is_default: false,
  is_active: true,
  markup_pct: 100,
  fixed_fee_cents: 0,
  rounding: "psychological_99",
  min_margin_pct: null,
  max_margin_pct: null,
  priority: 100,
};

function RulesTab() {
  const list = useServerFn(listPricingRules);
  const save = useServerFn(upsertPricingRule);
  const del = useServerFn(deletePricingRule);
  const qc = useQueryClient();
  const [form, setForm] = useState<RuleForm>(emptyRule);

  const query = useQuery({ queryKey: ["pricing-rules"], queryFn: () => list({ data: undefined as never }) });

  const saveMut = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => {
      toast.success("Regra salva");
      setForm(emptyRule);
      qc.invalidateQueries({ queryKey: ["pricing-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Regra removida");
      qc.invalidateQueries({ queryKey: ["pricing-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rules = query.data ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h3 className="font-display text-lg">{form.id ? "Editar regra" : "Nova regra"}</h3>
        <div className="mt-4 space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Markup (%)</Label>
              <Input type="number" value={form.markup_pct} onChange={(e) => setForm({ ...form, markup_pct: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Taxa fixa (R$)</Label>
              <Input type="number" step="0.01" value={form.fixed_fee_cents / 100}
                onChange={(e) => setForm({ ...form, fixed_fee_cents: Math.round(Number(e.target.value) * 100) })} />
            </div>
          </div>
          <div>
            <Label>Arredondamento</Label>
            <Select value={form.rounding} onValueChange={(v) => setForm({ ...form, rounding: v as RuleForm["rounding"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="psychological_99">Psicológico ,99</SelectItem>
                <SelectItem value="psychological_90">Psicológico ,90</SelectItem>
                <SelectItem value="nearest_1">Real inteiro</SelectItem>
                <SelectItem value="nearest_5">Múltiplo de 5</SelectItem>
                <SelectItem value="none">Nenhum</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Margem mínima (%)</Label>
              <Input type="number" value={form.min_margin_pct ?? ""}
                onChange={(e) => setForm({ ...form, min_margin_pct: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
              Padrão
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Ativa
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name}>
              <Plus className="mr-1 h-4 w-4" /> {form.id ? "Salvar" : "Criar"}
            </Button>
            {form.id && (
              <Button variant="outline" onClick={() => setForm(emptyRule)}>Cancelar</Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border p-4 font-display text-lg">Regras cadastradas</div>
        <div className="divide-y divide-border">
          {rules.map((r: any) => (
            <div key={r.id} className="flex items-center gap-3 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{r.name}</p>
                  {r.is_default && <Badge className="bg-primary">Padrão</Badge>}
                  {!r.is_active && <Badge variant="outline">Inativa</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Markup {r.markup_pct}% · taxa R$ {(r.fixed_fee_cents / 100).toFixed(2)} · {r.rounding}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setForm({ ...r })}>Editar</Button>
              <Button variant="ghost" size="sm" onClick={() => delMut.mutate(r.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          {!rules.length && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma regra criada. Sugestão: crie uma "Padrão AliExpress" com 150% markup e arredondamento ,99.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
