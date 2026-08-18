import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock3, Copy, Download, ExternalLink, Link2, Puzzle, RefreshCw, Search, ShieldCheck, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { importAliExpressReviewsByUrl } from "@/lib/aliexpress-direct-review-import.functions";
import {
  createAliExpressBrowserReviewCode,
  getAliExpressBrowserReviewState,
} from "@/lib/aliexpress-browser-review-import.functions";

export const Route = createFileRoute("/_authenticated/admin/aliexpress-reviews")({
  head: () => ({ meta: [{ title: "AliExpress · Avaliações · Absoluto Glamur" }] }),
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
  resolvedAliExpressProductId: string;
  imported: number;
  translated: number;
  withPhotos: number;
  remoteTotal: number;
  remoteAverage: number | null;
  aggregateOnly: boolean;
  status: string;
  diagnostic: string | null;
};

type BrowserBridgeResult = {
  code: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  sourceProductId: string;
  issuedAt: string;
  expiresAt: string;
  receiverUrl: string;
};

function AliExpressReviewsIntegrationPage() {
  const qc = useQueryClient();
  const directImport = useServerFn(importAliExpressReviewsByUrl);
  const createBrowserCode = useServerFn(createAliExpressBrowserReviewCode);
  const getBrowserState = useServerFn(getAliExpressBrowserReviewState);

  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [aliExpressSource, setAliExpressSource] = useState("");
  const [directResult, setDirectResult] = useState<DirectImportResult | null>(null);
  const [lastDirectError, setLastDirectError] = useState<string | null>(null);
  const [browserBridge, setBrowserBridge] = useState<BrowserBridgeResult | null>(null);
  const [acknowledgedBrowserSuccess, setAcknowledgedBrowserSuccess] = useState<string | null>(null);

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

  const directMut = useMutation({
    mutationFn: () => {
      if (!productId) throw new Error("Selecione o produto da Absoluto Glamur que receberá as avaliações.");
      if (!aliExpressSource.trim()) throw new Error("Cole a URL ou o ID do produto AliExpress.");
      return directImport({ data: { product_id: productId, source: aliExpressSource.trim() } });
    },
    onSuccess: async (result) => {
      setDirectResult(result);
      setLastDirectError(null);
      await invalidateReviewQueries(qc);
      if (result.imported > 0) {
        toast.success(`${result.imported} avaliações importadas do AliExpress para ${result.productTitle}.`);
      } else if (result.aggregateOnly) {
        const rating = result.remoteAverage ? `, nota ${result.remoteAverage.toFixed(1)}` : "";
        const total = result.remoteTotal > 0 ? `${result.remoteTotal} avaliações` : "dados de avaliação";
        toast.success(`${total}${rating} sincronizados. O AliExpress não expôs os comentários individuais deste anúncio.`);
      } else {
        toast.info("A consulta foi concluída, mas nenhuma avaliação individual ficou disponível para este produto.");
      }
    },
    onError: (error: Error) => {
      setLastDirectError(error.message);
      toast.error("O acesso automático não recebeu os comentários. Use a importação pelo Chrome abaixo.");
    },
  });

  const browserCodeMut = useMutation({
    mutationFn: () => {
      if (!productId) throw new Error("Selecione o produto da loja.");
      if (!aliExpressSource.trim()) throw new Error("Cole a URL ou ID do produto AliExpress.");
      return createBrowserCode({
        data: {
          product_id: productId,
          source: aliExpressSource.trim(),
          origin: window.location.origin,
        },
      });
    },
    onSuccess: async (result) => {
      setBrowserBridge(result);
      setAcknowledgedBrowserSuccess(null);
      try {
        await navigator.clipboard.writeText(result.code);
        toast.success("Código temporário gerado e copiado.");
      } catch {
        toast.success("Código temporário gerado. Copie o código abaixo.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const browserStateQ = useQuery({
    queryKey: ["aliexpress-browser-review-state", browserBridge?.productId, browserBridge?.issuedAt],
    enabled: Boolean(browserBridge),
    queryFn: () =>
      browserBridge
        ? getBrowserState({ data: { product_id: browserBridge.productId, issued_at: browserBridge.issuedAt } })
        : Promise.resolve(null),
    refetchInterval: browserBridge ? 2500 : false,
    staleTime: 0,
  });

  useEffect(() => {
    const state = browserStateQ.data;
    if (!state?.lastSuccessAt || state.status !== "ok" || state.imported <= 0) return;
    if (acknowledgedBrowserSuccess === state.lastSuccessAt) return;
    setAcknowledgedBrowserSuccess(state.lastSuccessAt);
    setLastDirectError(null);
    invalidateReviewQueries(qc).catch(() => undefined);
    toast.success(`${state.imported} avaliações recebidas do Chrome e gravadas no produto.`);
  }, [acknowledgedBrowserSuccess, browserStateQ.data, qc]);

  const browserState = browserStateQ.data;
  const aliUrl = useMemo(() => normalizeAliUrl(aliExpressSource), [aliExpressSource]);

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-5xl overflow-y-auto pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Star className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">AliExpress · avaliações</span>
            </div>
            <h1 className="mt-2 font-display text-3xl">AliExpress · Avaliações</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Importe avaliações reais por URL ou ID. O sistema tenta primeiro as fontes automáticas e, quando o AliExpress exige uma sessão real do navegador, permite concluir a importação pelo Chrome.
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
          <StatusCard label="Origem" value="AliExpress" detail="Avaliações reais" ok />
          <StatusCard label="Automático" value="Servidor" detail="TOP → API → público/agregado" ok />
          <StatusCard label="Fallback" value="Chrome" detail="Usa a sessão real do navegador" ok />
        </div>

        <div className="mt-6 rounded-2xl border border-primary/25 bg-card p-5 shadow-soft sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Link2 className="h-5 w-5" /></div>
            <div>
              <h2 className="font-display text-xl">Importar direto de um produto AliExpress</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                Escolha o produto da loja e cole a URL do anúncio correspondente. O modo automático continua sendo a primeira tentativa e não altera preço, estoque, variantes, fornecedor nem pedidos.
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
                  setLastDirectError(null);
                  setBrowserBridge(null);
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
                  setLastDirectError(null);
                  setBrowserBridge(null);
                }}
                spellCheck={false}
                placeholder="https://pt.aliexpress.com/item/100500...html"
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
            <p className="text-[11px] text-muted-foreground">Se o AliExpress exigir sessão de navegador, use o modo Chrome logo abaixo.</p>
          </div>

          {lastDirectError && (
            <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-foreground">
              <strong>O modo automático não conseguiu receber os comentários deste anúncio.</strong>
              <p className="mt-1 text-muted-foreground">Isso ocorre quando o AliExpress só libera as avaliações dentro de uma sessão real do navegador. Continue pela opção “Importar pelo Chrome”.</p>
            </div>
          )}

          {directResult && (
            <div className="mt-5 rounded-xl border border-success/30 bg-success/5 p-4">
              {directResult.aggregateOnly && (
                <p className="mb-4 text-xs leading-relaxed text-foreground">
                  O AliExpress disponibilizou a <strong>nota e a quantidade de avaliações</strong>, mas não expôs os comentários individuais para este anúncio. Os dados agregados foram atualizados sem apagar avaliações já salvas.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-4">
                <ResultNumber label="Comentários" value={directResult.imported} />
                <ResultNumber label="Com fotos" value={directResult.withPhotos} />
                <ResultNumber label="Total remoto" value={directResult.remoteTotal} />
                <ResultNumber label="Nota média" value={directResult.remoteAverage ?? 0} decimals={1} />
              </div>
            </div>
          )}
        </div>

        <div className={`mt-6 rounded-2xl border p-5 shadow-soft sm:p-6 ${lastDirectError ? "border-primary/45 bg-primary/[0.055]" : "border-border bg-card"}`}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Puzzle className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl">Importar pelo Chrome</h2>
                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                    Este modo consulta as avaliações usando a sessão que já está aberta no seu Chrome. É indicado quando o AliExpress bloqueia chamadas feitas pelo servidor.
                  </p>
                </div>
                <a
                  href="https://github.com/andrersbhz/Absoluto-Glamur/tree/main/tools/aliexpress-review-importer-extension"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-secondary"
                >
                  Extensão Chrome <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_.8fr]">
                <div className="rounded-xl border border-border bg-background/55 p-4">
                  <p className="text-xs font-semibold text-foreground">1. Instale a extensão</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Baixe a pasta da extensão, abra <span className="font-mono text-foreground">chrome://extensions</span>, ative “Modo do desenvolvedor” e escolha “Carregar sem compactação”. Isso é feito uma única vez.
                  </p>
                  <p className="mt-4 text-xs font-semibold text-foreground">2. Gere o código para este produto</p>
                  <button
                    type="button"
                    disabled={browserCodeMut.isPending || !productId || !aliExpressSource.trim()}
                    onClick={() => browserCodeMut.mutate()}
                    className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    <Puzzle className="h-4 w-4" />
                    {browserCodeMut.isPending ? "Gerando código..." : "Gerar código para importar pelo Chrome"}
                  </button>
                </div>

                <div className="rounded-xl border border-border bg-background/55 p-4">
                  <p className="text-xs font-semibold text-foreground">3. Abra o anúncio no AliExpress</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Faça login/verificação normalmente se o AliExpress solicitar. Depois abra a extensão e clique para importar.</p>
                  {aliUrl && (
                    <a
                      href={aliUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-secondary"
                    >
                      Abrir produto no AliExpress <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {browserBridge && (
                <div className="mt-4 rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Código temporário</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" /> Expira às {new Date(browserBridge.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(browserBridge.code)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={browserBridge.code}
                    rows={3}
                    className="mt-3 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground outline-none"
                  />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    O código só autoriza o produto <span className="font-mono text-foreground">{browserBridge.sourceProductId}</span> e não contém sua senha.
                  </p>
                </div>
              )}

              {browserBridge && !browserState && (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-background/45 p-4 text-xs text-muted-foreground">
                  <RefreshCw className={`h-4 w-4 text-primary ${browserStateQ.isFetching ? "animate-spin" : ""}`} />
                  Aguardando a extensão enviar as avaliações… o painel verifica automaticamente.
                </div>
              )}

              {browserState?.status === "running" && (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4 text-xs text-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" /> Recebendo e salvando avaliações do navegador…
                </div>
              )}

              {browserState?.status === "ok" && browserState.imported > 0 && (
                <div className="mt-4 rounded-xl border border-success/30 bg-success/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CheckCircle2 className="h-5 w-5 text-success" /> Importação pelo Chrome concluída
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ResultNumber label="Comentários importados" value={browserState.imported} />
                    <ResultNumber label="Total detectado" value={browserState.remoteTotal} />
                  </div>
                </div>
              )}

              {browserState?.status === "error" && (
                <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs leading-relaxed text-destructive">
                  A extensão conseguiu falar com a loja, mas a gravação falhou: {browserState.lastError || "erro não identificado"}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/[0.035] p-5">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Fluxo seguro</h3>
              <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                <li>1. O servidor tenta as APIs e fontes automáticas primeiro.</li>
                <li>2. Se o AliExpress exigir sessão real, o painel gera um código assinado com validade curta.</li>
                <li>3. A extensão usa apenas a sessão já aberta no Chrome para consultar os comentários.</li>
                <li>4. O servidor valida a assinatura e só permite gravar no produto e ID AliExpress presentes no código.</li>
                <li>5. A importação usa o mesmo banco nativo e a mesma deduplicação; preço, estoque, pedidos e fulfillment não são alterados.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

async function invalidateReviewQueries(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["product-review-summary"] }),
    qc.invalidateQueries({ queryKey: ["product-external-reviews-live"] }),
    qc.invalidateQueries({ queryKey: ["admin-external-reviews"] }),
    qc.invalidateQueries({ queryKey: ["product"] }),
    qc.invalidateQueries({ queryKey: ["products"] }),
  ]);
}

function normalizeAliUrl(source: string): string | null {
  const raw = source.trim();
  if (!raw) return null;
  if (/^\d{5,}$/.test(raw)) return `https://pt.aliexpress.com/item/${raw}.html`;
  try {
    const url = new URL(raw);
    if (!url.hostname.toLowerCase().includes("aliexpress")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Código copiado.");
  } catch {
    toast.error("Não foi possível copiar automaticamente. Selecione o código e copie manualmente.");
  }
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

function ResultNumber({ label, value, decimals = 0 }: { label: string; value: number; decimals?: number }) {
  return (
    <div className="rounded-lg bg-background/70 p-3 text-center">
      <p className="font-display text-xl text-foreground">{value.toFixed(decimals)}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
