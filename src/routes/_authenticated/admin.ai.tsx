import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  generateProductDescription,
  generateProductSeo,
  generateMarketingCopy,
  improveText,
  getAiUsageStats,
} from "@/lib/ai-content.functions";

export const Route = createFileRoute("/_authenticated/admin/ai")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const roles = (rolesData ?? []).map((r) => r.role as string);
    if (!roles.some((r) => ["admin", "superadmin", "catalog"].includes(r))) {
      throw redirect({ to: "/account" });
    }
  },
  component: AiPlayground,
});

function OutputBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Resultado</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            toast.success("Copiado");
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-foreground">{text}</pre>
    </div>
  );
}

function AiPlayground() {
  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-3xl">IA de conteúdo</h1>
            <p className="text-sm text-muted-foreground">
              Gerador de textos com Lovable AI (Gemini + GPT). Uso e custos são logados automaticamente.
            </p>
          </div>
        </div>

        <Tabs defaultValue="product" className="mt-8">
          <TabsList>
            <TabsTrigger value="product">Descrição de produto</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
            <TabsTrigger value="marketing">Marketing</TabsTrigger>
            <TabsTrigger value="improve">Revisar texto</TabsTrigger>
            <TabsTrigger value="usage">Uso</TabsTrigger>
          </TabsList>

          <TabsContent value="product"><ProductDescriptionTab /></TabsContent>
          <TabsContent value="seo"><SeoTab /></TabsContent>
          <TabsContent value="marketing"><MarketingTab /></TabsContent>
          <TabsContent value="improve"><ImproveTab /></TabsContent>
          <TabsContent value="usage"><UsageTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function ProductDescriptionTab() {
  const fn = useServerFn(generateProductDescription);
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", category: "", brand: "", attributes: "", audience: "" });
  const [model, setModel] = useState<"fast" | "quality">("fast");
  const [output, setOutput] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { ...form, model } }),
    onSuccess: (r) => {
      setOutput(r.output);
      qc.invalidateQueries({ queryKey: ["ai-usage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome do produto *" v={form.name} on={(v) => setForm({ ...form, name: v })} />
        <Field label="Categoria" v={form.category} on={(v) => setForm({ ...form, category: v })} />
        <Field label="Marca" v={form.brand} on={(v) => setForm({ ...form, brand: v })} />
        <Field label="Público-alvo" v={form.audience} on={(v) => setForm({ ...form, audience: v })} />
      </div>
      <div className="mt-3">
        <Label>Atributos / ingredientes</Label>
        <Textarea rows={3} value={form.attributes} onChange={(e) => setForm({ ...form, attributes: e.target.value })} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Select value={model} onValueChange={(v) => setModel(v as any)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fast">Rápido (Gemini Flash)</SelectItem>
            <SelectItem value="quality">Qualidade (GPT-5.4-mini)</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => m.mutate()} disabled={!form.name || m.isPending}>
          {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Gerar descrição
        </Button>
      </div>
      <OutputBox text={output} />
    </div>
  );
}

function SeoTab() {
  const fn = useServerFn(generateProductSeo);
  const [form, setForm] = useState({ name: "", category: "", brand: "", short_description: "" });
  const [output, setOutput] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: form }),
    onSuccess: (r) => setOutput(r.output),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome do produto *" v={form.name} on={(v) => setForm({ ...form, name: v })} />
        <Field label="Categoria" v={form.category} on={(v) => setForm({ ...form, category: v })} />
        <Field label="Marca" v={form.brand} on={(v) => setForm({ ...form, brand: v })} />
      </div>
      <div className="mt-3">
        <Label>Resumo</Label>
        <Textarea rows={2} value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} />
      </div>
      <div className="mt-4">
        <Button onClick={() => m.mutate()} disabled={!form.name || m.isPending}>
          {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Gerar SEO
        </Button>
      </div>
      <OutputBox text={output} />
    </div>
  );
}

function MarketingTab() {
  const fn = useServerFn(generateMarketingCopy);
  const [form, setForm] = useState({ goal: "", context: "", tone: "" });
  const [channel, setChannel] = useState<"hero" | "email" | "instagram" | "google_ads" | "banner">("hero");
  const [output, setOutput] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { ...form, channel } }),
    onSuccess: (r) => setOutput(r.output),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Objetivo *" v={form.goal} on={(v) => setForm({ ...form, goal: v })} placeholder="Ex: promover coleção de verão com 20% off" />
        <div>
          <Label>Canal</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hero">Hero da homepage</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="google_ads">Google Ads</SelectItem>
              <SelectItem value="banner">Banner</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label="Tom" v={form.tone} on={(v) => setForm({ ...form, tone: v })} placeholder="Ex: leve, divertido, luxuoso" />
      </div>
      <div className="mt-3">
        <Label>Contexto extra</Label>
        <Textarea rows={3} value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} />
      </div>
      <div className="mt-4">
        <Button onClick={() => m.mutate()} disabled={!form.goal || m.isPending}>
          {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Gerar 3 variações
        </Button>
      </div>
      <OutputBox text={output} />
    </div>
  );
}

function ImproveTab() {
  const fn = useServerFn(improveText);
  const [text, setText] = useState("");
  const [action, setAction] = useState<"polish" | "shorten" | "expand" | "translate_en">("polish");
  const [output, setOutput] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { text, action } }),
    onSuccess: (r) => setOutput(r.output),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <Label>Texto original</Label>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-4 flex items-center gap-3">
        <Select value={action} onValueChange={(v) => setAction(v as any)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="polish">Revisar e melhorar</SelectItem>
            <SelectItem value="shorten">Encurtar</SelectItem>
            <SelectItem value="expand">Expandir</SelectItem>
            <SelectItem value="translate_en">Traduzir para inglês</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => m.mutate()} disabled={text.length < 5 || m.isPending}>
          {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Aplicar
        </Button>
      </div>
      <OutputBox text={output} />
    </div>
  );
}

function UsageTab() {
  const fn = useServerFn(getAiUsageStats);
  const q = useQuery({ queryKey: ["ai-usage"], queryFn: () => fn({ data: undefined as any }) });
  if (q.isLoading) return <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  const t = q.data?.totals;
  const rows = q.data?.recent ?? [];
  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Chamadas (30d)" value={t?.calls ?? 0} />
        <Card label="Tokens totais" value={t?.tokens ?? 0} />
        <Card label="Erros" value={t?.errors ?? 0} tone={t && t.errors > 0 ? "warn" : "ok"} />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Últimas 50 chamadas</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Quando</th>
                <th className="pr-4">Propósito</th>
                <th className="pr-4">Modelo</th>
                <th className="pr-4">Tokens</th>
                <th className="pr-4">Latência</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2 pr-4">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                  <td className="pr-4">{r.purpose}</td>
                  <td className="pr-4 text-muted-foreground">{r.model}</td>
                  <td className="pr-4">{r.total_tokens ?? "—"}</td>
                  <td className="pr-4">{r.latency_ms ? `${r.latency_ms}ms` : "—"}</td>
                  <td>
                    {r.status === "success" ? (
                      <Badge className="bg-success text-white hover:bg-success/90">ok</Badge>
                    ) : (
                      <Badge variant="destructive">erro</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sem chamadas ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, tone = "ok" }: { label: string; value: number | string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-2xl ${tone === "warn" ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function Field({ label, v, on, placeholder }: { label: string; v: string; on: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
