import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, KeyRound, Save, ShieldCheck, Star, TestTube2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  disconnectAliExpressReviewTop,
  getAliExpressReviewTopConfig,
  saveAliExpressReviewTopConfig,
  testAliExpressReviewTop,
} from "@/lib/aliexpress-review-top.functions";

export const Route = createFileRoute("/_authenticated/admin/aliexpress-reviews")({
  head: () => ({ meta: [{ title: "AliExpress TOP · Avaliações · Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!data) throw redirect({ to: "/account" });
  },
  component: AliExpressReviewsIntegrationPage,
});

function AliExpressReviewsIntegrationPage() {
  const qc = useQueryClient();
  const getConfig = useServerFn(getAliExpressReviewTopConfig);
  const saveConfig = useServerFn(saveAliExpressReviewTopConfig);
  const testConfig = useServerFn(testAliExpressReviewTop);
  const disconnect = useServerFn(disconnectAliExpressReviewTop);

  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");

  const q = useQuery({
    queryKey: ["aliexpress-top-reviews-config"],
    queryFn: () => getConfig(),
    staleTime: 15_000,
  });

  const saveMut = useMutation({
    mutationFn: () => saveConfig({ data: { app_key: appKey.trim() || undefined, app_secret: appSecret.trim() || undefined } }),
    onSuccess: async () => {
      setAppKey("");
      setAppSecret("");
      await qc.invalidateQueries({ queryKey: ["aliexpress-top-reviews-config"] });
      toast.success("Credenciais TOP salvas. Agora teste a conexão.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMut = useMutation({
    mutationFn: () => testConfig(),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["aliexpress-top-reviews-config"] });
      toast.success(`API TOP validada com o produto ${result.productId}.`);
    },
    onError: async (error: Error) => {
      await qc.invalidateQueries({ queryKey: ["aliexpress-top-reviews-config"] });
      toast.error(error.message);
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: async () => {
      setAppKey("");
      setAppSecret("");
      await qc.invalidateQueries({ queryKey: ["aliexpress-top-reviews-config"] });
      toast.success("Credenciais TOP de avaliações removidas.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const status = q.data;
  const busy = saveMut.isPending || testMut.isPending || disconnectMut.isPending;

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-4xl overflow-y-auto pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Star className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">AliExpress · avaliações oficiais</span>
            </div>
            <h1 className="mt-2 font-display text-3xl">Credenciais TOP para avaliações</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              A sincronização de avaliações usa a API clássica TOP. Estas credenciais ficam separadas da integração principal do AliExpress usada por importação, estoque, OAuth e fulfillment.
            </p>
          </div>
          <a
            href="https://developer.alibaba.com/docs/api.htm?apiId=54478"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-secondary"
          >
            Documentação oficial <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <StatusCard
            label="Credencial"
            value={status?.configured ? "Configurada" : "Não configurada"}
            detail={status?.appKeyMasked ?? "App Key TOP ausente"}
            ok={Boolean(status?.configured)}
          />
          <StatusCard
            label="Último teste"
            value={status?.lastStatus === "ok" ? "Validada" : status?.lastStatus === "error" ? "Com erro" : "Não testada"}
            detail={status?.lastVerifiedAt ? new Date(status.lastVerifiedAt).toLocaleString("pt-BR") : "Faça o teste após salvar"}
            ok={status?.lastStatus === "ok"}
          />
          <StatusCard
            label="Uso"
            value="Somente avaliações"
            detail="Não altera a Open Platform"
            ok
          />
        </div>

        {status?.lastError && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Último erro da API TOP</p>
            <p className="mt-2 text-sm leading-relaxed text-destructive/90">{status.lastError}</p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><KeyRound className="h-5 w-5" /></div>
            <div>
              <h2 className="font-display text-xl">Par de credenciais TOP</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                O endpoint de avaliações exige uma AppKey reconhecida pelo TOP. Se já houver uma credencial salva, deixe os campos vazios para mantê-la e use apenas “Testar conexão”.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">App Key TOP</span>
              <input
                value={appKey}
                onChange={(event) => setAppKey(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={status?.configured ? "Deixe vazio para manter a atual" : "App Key atribuída pelo TOP"}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">App Secret TOP</span>
              <input
                type="password"
                value={appSecret}
                onChange={(event) => setAppSecret(event.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                placeholder={status?.secretConfigured ? "•••••••• (deixe vazio para manter)" : "App Secret TOP"}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
              />
              <span className="mt-1.5 block text-[11px] text-muted-foreground">O segredo salvo nunca é devolvido ao navegador.</span>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (!appKey.trim() && !appSecret.trim())}
              onClick={() => saveMut.mutate()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saveMut.isPending ? "Salvando..." : "Salvar credenciais TOP"}
            </button>
            <button
              type="button"
              disabled={busy || !status?.configured}
              onClick={() => testMut.mutate()}
              className="inline-flex items-center gap-2 rounded-lg border border-success/35 bg-success/10 px-4 py-2.5 text-sm font-medium text-success transition hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TestTube2 className="h-4 w-4" /> {testMut.isPending ? "Testando..." : "Testar conexão TOP"}
            </button>
            {status?.configured && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Remover somente as credenciais TOP de avaliações? A integração principal do AliExpress será mantida.")) {
                    disconnectMut.mutate();
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-destructive/25 px-4 py-2.5 text-sm font-medium text-destructive transition hover:bg-destructive/5 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Remover credencial TOP
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/[0.035] p-5">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Como fica o fluxo</h3>
              <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                <li>1. A importação, estoque e OAuth continuam usando a integração principal “AliExpress Open Platform”.</li>
                <li>2. O botão “Sincronizar AliExpress” nas avaliações procura primeiro esta credencial TOP dedicada.</li>
                <li>3. O teste usa um produto AliExpress já importado e faz uma consulta real de avaliações na API oficial.</li>
                <li>4. Depois de validada, a sincronização automática e manual passam a usar o mesmo par TOP.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatusCard({ label, value, detail, ok }: { label: string; value: string; detail: string; ok: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <span className={`h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-muted-foreground/35"}`} />
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
