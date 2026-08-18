import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ExternalLink, KeyRound, Link2, Save, Search, ShieldCheck, Star, TestTube2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { importAliExpressReviewsByUrl } from "@/lib/aliexpress-direct-review-import.functions";
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

type DirectImportResult = {
  ok: boolean;
  productId: string;
  productTitle: string;
  productSlug: string;
  aliExpressProductId: string;
  imported: number;
  translated: number;
  withPhotos: number;
  remoteTotal: number;
  status: string;
};

function AliExpressReviewsIntegrationPage() {
  const qc = useQueryClient();
  const getConfig = useServerFn(getAliExpressReviewTopConfig);
  const saveConfig = useServerFn(saveAliExpressReviewTopConfig);
  const testConfig = useServerFn(testAliExpressReviewTop);
  const disconnect = useServerFn(disconnectAliExpressReviewTop);
  const directImport = useServerFn(importAliExpressReviewsByUrl);

  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [aliExpressSource, setAliExpressSource] = useState("");
  const [directResult, setDirectResult] = useState<DirectImportResult | null>(null);

  const q = useQuery({
    queryKey: ["aliexpress-top-reviews-config"],
    queryFn: () => getConfig(),
    staleTime: 15_000,
  });

  const productsQ = useQuery({
    queryKey: ["aliexpress-direct-review-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,slug,status")
        .order("name", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLocaleLowerCase("pt-BR");
    const rows = productsQ.data ?? [];
    if (!term) return rows;
    return rows.filter((product) =>
      `${product.name} ${product.slug}`.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [productSearch, productsQ.data]);

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

  const directMut = useMutation({
    mutationFn: () => {
      if (!productId) throw new Error("Selecione o produto da Absoluto Glamur que receberá as avaliações.");
      if (!aliExpressSource.trim()) throw new Error("Cole a URL ou o ID do produto AliExpress.");
      return directImport({ data: { product_id: productId, source: aliExpressSource.trim() } });
    },
    onSuccess: async (result) => {
      setDirectResult(result);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["product-review-summary"] }),
        qc.invalidateQueries({ queryKey: ["product-external-reviews-live"] }),
        qc.invalidateQueries({ queryKey: ["admin-external-reviews"] }),
        qc.invalidateQueries({ queryKey: ["product"] }),
        qc.invalidateQueries({ queryKey: ["products"] }),
      ]);
      if (result.imported > 0) {
        toast.success(`${result.imported} avaliações importadas do AliExpress para ${result.productTitle}.`);
      } else {
        toast.info("A consulta foi concluída, mas nenhuma avaliação individual ficou disponível para este produto.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const status = q.data;
  const busy = saveMut.isPending || testMut.isPending || disconnectMut.isPending;

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-5xl overflow-y-auto pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Star className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">AliExpress · avaliações oficiais</span>
            </div>
            <h1 className="mt-2 font-display text-3xl">AliExpress TOP · Avaliações</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Configure as credenciais TOP e importe avaliações reais diretamente por URL ou ID do produto AliExpress. Os comentários são gravados no banco nativo da Absoluto Glamur e não dependem de WooCommerce, Shopify ou widget externo.
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
            label="Importação"
            value="URL ou ID"
            detail="Até 160 avaliações por execução"
            ok
          />
        </div>

        {status?.lastError && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Último erro da API TOP</p>
            <p className="mt-2 text-sm leading-relaxed text-destructive/90">{status.lastError}</p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-primary/25 bg-card p-5 shadow-soft sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Link2 className="h-5 w-5" /></div>
            <div>
              <h2 className="font-display text-xl">Importar direto de um produto AliExpress</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                Escolha o produto da loja e cole a URL do anúncio AliExpress correspondente. O sistema extrai o ID, consulta as avaliações, evita duplicatas e salva texto, estrelas, país, data e fotos quando disponíveis.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div>
              <label className="relative block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Buscar produto da loja..."
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                />
              </label>
              <select
                value={productId}
                onChange={(event) => {
                  setProductId(event.target.value);
                  setDirectResult(null);
                }}
                disabled={productsQ.isLoading}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
              >
                <option value="">{productsQ.isLoading ? "Carregando produtos..." : "Selecione o produto de destino"}</option>
                {filteredProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}{product.status === "active" ? "" : ` · ${product.status}`} — {product.slug}
                  </option>
                ))}
              </select>
            </div>

            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">URL ou ID do produto AliExpress</span>
              <input
                value={aliExpressSource}
                onChange={(event) => {
                  setAliExpressSource(event.target.value);
                  setDirectResult(null);
                }}
                spellCheck={false}
                placeholder="https://www.aliexpress.com/item/100500...html"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
              />
              <span className="mt-1.5 block text-[11px] text-muted-foreground">Também aceita somente o ID numérico do produto.</span>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={directMut.isPending || !productId || !aliExpressSource.trim()}
              onClick={() => directMut.mutate()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className={`h-4 w-4 ${directMut.isPending ? "animate-pulse" : ""}`} />
              {directMut.isPending ? "Buscando avaliações..." : "Buscar e importar avaliações"}
            </button>
            <p className="text-[11px] text-muted-foreground">Não altera preço, estoque, variantes, fornecedor nem pedidos.</p>
          </div>

          {directResult && (
            <div className="mt-5 rounded-xl border border-success/30 bg-success/5 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <ResultNumber label="Importadas" value={directResult.imported} />
                <ResultNumber label="Traduzidas" value={directResult.translated} />
                <ResultNumber label="Com fotos" value={directResult.withPhotos} />
                <ResultNumber label="Total remoto" value={directResult.remoteTotal} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                AliExpress ID <span className="font-mono text-foreground">{directResult.aliExpressProductId}</span> → {directResult.productTitle}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><KeyRound className="h-5 w-5" /></div>
            <div>
              <h2 className="font-display text-xl">Credenciais TOP para avaliações</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                O endpoint oficial de avaliações exige uma AppKey reconhecida pelo TOP. Estas credenciais ficam separadas da integração principal do AliExpress usada por importação, estoque, OAuth e fulfillment.
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
                <li>1. Selecione um produto já existente na Absoluto Glamur e cole a URL ou ID do anúncio AliExpress.</li>
                <li>2. O sistema consulta avaliações via TOP e usa o fallback público já existente quando aplicável.</li>
                <li>3. As avaliações são gravadas em product_external_reviews e reimportações atualizam os mesmos registros sem duplicar.</li>
                <li>4. A loja exibe tudo no componente nativo de avaliações, junto com avaliações importadas pelo Ryviu CSV.</li>
                <li>5. Importação de produto, preço, estoque, OAuth e fulfillment continuam independentes e sem alteração.</li>
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

function ResultNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background/70 p-3 text-center">
      <p className="font-display text-xl text-foreground">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
