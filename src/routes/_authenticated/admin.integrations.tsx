import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Plug, RefreshCw, Route as RouteIcon, Save, TestTube } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import {
  listIntegrations,
  saveIntegration,
  testIntegration,
  type IntegrationDTO,
  type SaveIntegrationInput,
} from "@/lib/integrations.functions";
import {
  listAdminRouting,
  updateRouting,
  type PaymentMethodKey,
  type CheckoutMethodDTO,
} from "@/lib/payment-routing.functions";

export const Route = createFileRoute("/_authenticated/admin/integrations")({
  head: () => ({ meta: [{ title: "Integrações · Admin Bloom" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!data) throw redirect({ to: "/account" });
  },
  component: IntegrationsPage,
});

type Integration = IntegrationDTO;

const CATEGORY_LABELS: Record<string, string> = {
  payments: "Pagamentos",
  shipping: "Envio",
  marketing: "Marketing",
  ai: "IA",
  storage: "Armazenamento",
  other: "Outros",
};

function IntegrationsPage() {
  const list = useServerFn(listIntegrations);
  const q = useQuery({ queryKey: ["integrations"], queryFn: () => list() });

  const grouped = (q.data ?? []).reduce<Record<string, Integration[]>>((acc, it) => {
    (acc[it.category] ??= []).push(it);
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">Integrações</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gerencie chaves de API, ambientes (teste/produção) e webhooks de todos os provedores externos.
            </p>
          </div>
          <button
            onClick={() => q.refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>

        {q.isLoading && <p className="mt-10 text-sm text-muted-foreground">Carregando…</p>}
        {q.error && (
          <p className="mt-10 text-sm text-destructive">
            {(q.error as Error).message}
          </p>
        )}

        <RoutingPanel />

        <div className="mt-8 space-y-10">
          {Object.entries(grouped).map(([cat, items]) => (
            <section key={cat}>
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
                {CATEGORY_LABELS[cat] ?? cat}
              </h2>
              <div className="mt-3 space-y-3">
                {items.map((it) => (
                  <IntegrationCard key={it.provider} integration={it} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          As chaves são armazenadas no banco e nunca expostas ao navegador — todas as chamadas passam por server functions com role de serviço.
        </p>
        <div className="mt-6 text-sm">
          <Link to="/admin" className="text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntegration);
  const test = useServerFn(testIntegration);

  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const [mode, setMode] = useState(integration.mode);
  const [enabled, setEnabled] = useState(integration.enabled);

  const saveMut = useMutation({
    mutationFn: (v: SaveIntegrationInput) => save({ data: v }),
    onSuccess: () => {
      toast.success("Integração salva");
      qc.invalidateQueries({ queryKey: ["integrations"] });
      setApiKey("");
      setWebhookToken("");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => test({ data: { provider: integration.provider } }),
    onSuccess: (r) => {
      toast.success(`Conectado a ${r.info?.name ?? "provedor"}`);
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const webhookUrl =
    integration.provider === "asaas"
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/webhooks/asaas`
      : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Plug className="h-5 w-5 text-plum" />
          <div>
            <p className="font-display text-lg">{integration.display_name}</p>
            <p className="text-xs text-muted-foreground">{integration.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {integration.enabled ? (
            <Badge className="bg-success text-white">Ativa</Badge>
          ) : (
            <Badge variant="outline">Inativa</Badge>
          )}
          {integration.mode === "production" ? (
            <Badge className="bg-primary text-primary-foreground">Produção</Badge>
          ) : (
            <Badge variant="secondary">Sandbox</Badge>
          )}
          {integration.last_status === "ok" && (
            <span title="Verificada" className="text-success">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          )}
          {integration.last_status === "error" && (
            <span title={integration.last_error ?? "erro"} className="text-destructive">
              <AlertCircle className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Chave da API</p>
          <p className="font-mono text-xs">
            {integration.api_key_masked ?? <span className="text-muted-foreground">— vazia —</span>}
          </p>
        </div>
        {webhookUrl && (
          <div>
            <p className="text-xs text-muted-foreground">URL do webhook</p>
            <div className="flex items-center gap-1">
              <code className="truncate text-[11px]">{webhookUrl}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success("URL copiada");
                }}
                className="rounded p-1 hover:bg-secondary"
                aria-label="Copiar URL"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary"
        >
          {open ? "Fechar" : "Configurar"}
        </button>
        {integration.has_api_key && (
          <button
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-60"
          >
            <TestTube className="h-3.5 w-3.5" />
            {testMut.isPending ? "Testando…" : "Testar conexão"}
          </button>
        )}
        <button
          onClick={() =>
            saveMut.mutate({ provider: integration.provider, enabled: !integration.enabled })
          }
          disabled={saveMut.isPending || !integration.has_api_key}
          title={!integration.has_api_key ? "Configure a chave antes de ativar" : ""}
          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-60"
        >
          {integration.enabled ? "Desativar" : "Ativar"}
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-3 border-t border-border pt-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Ambiente</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "sandbox" | "production")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="sandbox">Sandbox (teste)</option>
                <option value="production">Produção</option>
              </select>
            </label>
            <label className="flex items-end gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              <span>Ativa para o checkout / operações</span>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">
              Chave da API {integration.has_api_key && "(deixe vazio para manter a atual)"}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={integration.provider === "asaas" ? "$aact_YT..." : "chave da API"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </label>
          {webhookUrl && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">
                Token do webhook {integration.has_webhook_token && "(deixe vazio para manter)"}
              </span>
              <input
                type="password"
                value={webhookToken}
                onChange={(e) => setWebhookToken(e.target.value)}
                placeholder="qualquer string secreta (você define aqui e no painel do provedor)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                No Asaas: Configurações → Notificações via webhook. Cadastre a URL acima e este token.
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() =>
                saveMut.mutate({
                  provider: integration.provider,
                  mode,
                  enabled,
                  api_key: apiKey ? apiKey : undefined,
                  webhook_token: webhookToken ? webhookToken : undefined,
                })
              }
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground shadow-soft disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saveMut.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
