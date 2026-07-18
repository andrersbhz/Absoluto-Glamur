import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Plug, RefreshCw, Route as RouteIcon, Save, TestTube } from "lucide-react";
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
  head: () => ({ meta: [{ title: "Integrações · Admin Absoluto Glamur" }] }),
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
  const [merchantKey, setMerchantKey] = useState("");
  const [mode, setMode] = useState(integration.mode);
  const [enabled, setEnabled] = useState(integration.enabled);

  const saveMut = useMutation({
    mutationFn: (v: SaveIntegrationInput) => save({ data: v }),
    onSuccess: () => {
      toast.success("Integração salva");
      qc.invalidateQueries({ queryKey: ["integrations"] });
      setApiKey("");
      setWebhookToken("");
      setMerchantKey("");
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

  const WEBHOOK_PATHS: Record<string, string> = {
    asaas: "/api/public/webhooks/asaas",
    nupay: "/api/public/webhooks/nupay",
  };
  const webhookUrl = WEBHOOK_PATHS[integration.provider]
    ? `${typeof window !== "undefined" ? window.location.origin : ""}${WEBHOOK_PATHS[integration.provider]}`
    : null;

  const PROVIDER_DOCS: Record<
    string,
    { keyUrl?: string; keyLabel?: string; docsUrl?: string; instructions?: string }
  > = {
    asaas: {
      keyUrl: "https://www.asaas.com/config/index#/api",
      keyLabel: "Gerar chave no Asaas",
      docsUrl: "https://docs.asaas.com/reference/comece-por-aqui",
      instructions:
        "Entre em Asaas → Integrações → API Access Key. Gere uma chave para o ambiente correspondente (sandbox ou produção).",
    },
    nupay: {
      keyUrl: "https://parceiros.nupaybusiness.com.br/",
      keyLabel: "Portal do parceiro NuPay",
      docsUrl: "https://docs.nupaybusiness.com.br/checkout/docs/openapi/index.html",
      instructions:
        "No portal NuPay Business → Configurações → Credenciais, copie a Merchant Key e o Merchant Token. Cadastre a URL do webhook abaixo em Configurações → Webhooks.",
    },
    stripe: {
      keyUrl: "https://dashboard.stripe.com/apikeys",
      keyLabel: "Chaves no Stripe Dashboard",
      docsUrl: "https://stripe.com/docs/keys",
      instructions:
        "Copie a Secret key (sk_live_… para produção, sk_test_… para sandbox). Nunca use a Publishable key aqui.",
    },
    mercadopago: {
      keyUrl: "https://www.mercadopago.com.br/developers/panel/app",
      keyLabel: "Painel de desenvolvedor Mercado Pago",
      docsUrl: "https://www.mercadopago.com.br/developers/pt/docs",
      instructions:
        "Crie uma aplicação e copie o Access Token de produção ou teste. Configure notificações IPN/webhook apontando para a URL abaixo.",
    },
    firecrawl: {
      keyUrl: "https://www.firecrawl.dev/app/api-keys",
      keyLabel: "Chaves Firecrawl",
      docsUrl: "https://docs.firecrawl.dev/",
    },
    aliexpress: {
      keyUrl: "https://openservice.aliexpress.com/app/manager.htm",
      keyLabel: "Console AliExpress Open",
      docsUrl: "https://openservice.aliexpress.com/doc/doc.htm",
      instructions:
        "Cadastre um app no AliExpress Open Platform para obter App Key, App Secret e Refresh Token.",
    },
  };
  const docs = PROVIDER_DOCS[integration.provider];

  const isNuPay = integration.provider === "nupay";
  const currentMerchantKey =
    (integration.config as { merchant_key?: string } | null)?.merchant_key ?? "";


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
          <StatusLight
            connected={integration.last_status === "ok" && integration.enabled}
            errored={integration.last_status === "error"}
            hasKey={integration.has_api_key}
            errorMessage={integration.last_error}
          />
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
          {docs && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {docs.keyUrl && (
                  <a
                    href={docs.keyUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:opacity-90"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {docs.keyLabel ?? "Obter chave"}
                  </a>
                )}
                {docs.docsUrl && (
                  <a
                    href={docs.docsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 hover:bg-secondary"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Documentação
                  </a>
                )}
              </div>
              {docs.instructions && (
                <p className="mt-2 text-muted-foreground">{docs.instructions}</p>
              )}
            </div>
          )}
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
              {isNuPay ? "X-Merchant-Token" : "Chave da API"}{" "}
              {integration.has_api_key && "(deixe vazio para manter a atual)"}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                integration.provider === "asaas"
                  ? "$aact_YT..."
                  : integration.provider === "stripe"
                    ? "sk_live_..."
                    : isNuPay
                      ? "token secreto NuPay"
                      : "chave da API"
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </label>
          {isNuPay && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">
                X-Merchant-Key {currentMerchantKey && "(preenchida — deixe vazio para manter)"}
              </span>
              <input
                type="password"
                value={merchantKey}
                onChange={(e) => setMerchantKey(e.target.value)}
                placeholder="chave pública do merchant NuPay"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Encontre em NuPay Business → Configurações → Credenciais. Envie a Merchant Key aqui e o Merchant Token no campo acima.
              </span>
            </label>
          )}
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
                Cadastre a URL acima e este token no painel do provedor ({integration.provider}).
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
                  config: isNuPay && merchantKey ? { merchant_key: merchantKey } : undefined,
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

const PROVIDER_OPTIONS: { id: string; label: string }[] = [
  { id: "asaas", label: "Asaas" },
  { id: "nupay", label: "NuPay (Nubank)" },
  { id: "stripe", label: "Stripe" },
  { id: "mercadopago", label: "Mercado Pago" },
];

const METHOD_LABELS: Record<PaymentMethodKey, string> = {
  pix: "PIX",
  credit_card: "Cartão de crédito",
  boleto: "Boleto bancário",
  nubank_redirect: "Pagar com Nubank",
};

function RoutingPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminRouting);
  const updateFn = useServerFn(updateRouting);
  const q = useQuery({ queryKey: ["admin-routing"], queryFn: () => listFn() });

  const mut = useMutation({
    mutationFn: (input: {
      method: PaymentMethodKey;
      provider?: string;
      enabled?: boolean;
    }) => updateFn({ data: input }),
    onSuccess: () => {
      toast.success("Roteamento atualizado");
      qc.invalidateQueries({ queryKey: ["admin-routing"] });
      qc.invalidateQueries({ queryKey: ["checkout-methods"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows: CheckoutMethodDTO[] = q.data ?? [];

  return (
    <section className="mt-10">
      <div className="flex items-center gap-2">
        <RouteIcon className="h-4 w-4 text-primary" />
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Roteamento de métodos
        </h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Escolha qual provedor processa cada método. Configuração híbrida — ex.: PIX via Asaas + cartão via Stripe + Nubank via NuPay.
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Método</th>
              <th className="px-4 py-2 text-left">Provedor</th>
              <th className="px-4 py-2 text-left">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.method} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{METHOD_LABELS[r.method]}</td>
                <td className="px-4 py-3">
                  <select
                    value={r.provider}
                    onChange={(e) =>
                      mut.mutate({ method: r.method, provider: e.target.value })
                    }
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    {PROVIDER_OPTIONS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) =>
                        mut.mutate({ method: r.method, enabled: e.target.checked })
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {r.enabled ? "Visível no checkout" : "Oculto"}
                    </span>
                  </label>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  {q.isLoading ? "Carregando…" : "Nenhum método configurado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
