import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, FileSpreadsheet, Search, ShieldCheck, Star, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { importRyviuReviewsCsv } from "@/lib/ryviu-review-import.functions";

export const Route = createFileRoute("/_authenticated/admin/ryviu-reviews")({
  head: () => ({ meta: [{ title: "Ryviu · Importar avaliações · Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!data) throw redirect({ to: "/account" });
  },
  component: RyviuReviewsPage,
});

type ImportResult = {
  productId: string;
  productTitle: string;
  productSlug: string;
  imported: number;
  invalidRows: number;
  ignoredOtherProducts: number;
  withPhotos: number;
  hidden: number;
};

function RyviuReviewsPage() {
  const qc = useQueryClient();
  const importCsv = useServerFn(importRyviuReviewsCsv);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const productsQ = useQuery({
    queryKey: ["ryviu-review-import-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,title,slug,is_active")
        .order("title", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const rows = productsQ.data ?? [];
    if (!term) return rows;
    return rows.filter((product) =>
      `${product.title} ${product.slug}`.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [productsQ.data, search]);

  const selectedProduct = (productsQ.data ?? []).find((product) => product.id === productId) ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Selecione o produto que receberá as avaliações.");
      if (!file) throw new Error("Selecione um arquivo CSV exportado pelo Ryviu.");
      if (file.size > 2_000_000) throw new Error("O CSV excede o limite de 2 MB por importação.");
      const csv = await file.text();
      return importCsv({ data: { product_id: productId, csv } });
    },
    onSuccess: async (data) => {
      setResult(data);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["product-review-summary"] }),
        qc.invalidateQueries({ queryKey: ["product-external-reviews-live"] }),
        qc.invalidateQueries({ queryKey: ["admin-external-reviews"] }),
        qc.invalidateQueries({ queryKey: ["product"] }),
        qc.invalidateQueries({ queryKey: ["products"] }),
      ]);
      toast.success(`${data.imported} avaliações importadas para ${data.productTitle}.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function resetFile() {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-5xl overflow-y-auto pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Star className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">Ryviu · avaliações do AliExpress</span>
            </div>
            <h1 className="mt-2 font-display text-3xl">Importar avaliações do Ryviu</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Exporte as avaliações do produto no Ryviu em CSV e importe aqui. O sistema grava as avaliações no banco da loja e passa a exibi-las nativamente na página do produto, sem depender do widget visual do Ryviu.
            </p>
          </div>
          <a
            href="https://docs.ryviu.com/en/articles/10-export-reviews-in-ryviu-to-csv-file"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-secondary"
          >
            Como exportar no Ryviu <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><FileSpreadsheet className="h-5 w-5" /></div>
              <div>
                <h2 className="font-display text-xl">1. Escolha o produto</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Se o CSV tiver a coluna product_handle, o importador confere o slug para impedir que avaliações de outro produto sejam gravadas por engano.
                </p>
              </div>
            </div>

            <label className="relative mt-5 block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome ou slug..."
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
              />
            </label>

            <select
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
                setResult(null);
              }}
              disabled={productsQ.isLoading}
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
            >
              <option value="">{productsQ.isLoading ? "Carregando produtos..." : "Selecione um produto"}</option>
              {filteredProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}{product.is_active ? "" : " · inativo"} — {product.slug}
                </option>
              ))}
            </select>

            {productsQ.isError && (
              <p className="mt-2 text-xs text-destructive">Não foi possível carregar o catálogo.</p>
            )}

            <div className="mt-7 border-t border-border pt-6">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Upload className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-display text-xl">2. Envie o CSV do Ryviu</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Aceita o template atual do Ryviu e variações comuns de exportação. Campos entre aspas, vírgulas no comentário e múltiplas fotos são tratados pelo importador.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-dashed border-border bg-background/50 p-5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setResult(null);
                  }}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
                />
                {file && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{file.name}</p>
                      <p className="text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</p>
                    </div>
                    <button type="button" onClick={resetFile} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground" aria-label="Remover arquivo"><X className="h-4 w-4" /></button>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={mutation.isPending || !productId || !file}
                onClick={() => mutation.mutate()}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className={`h-4 w-4 ${mutation.isPending ? "animate-pulse" : ""}`} />
                {mutation.isPending ? "Importando avaliações..." : "Importar avaliações"}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-5">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">Importação segura</h3>
                  <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                    <li>• Não altera produtos, preços, estoque ou pedidos.</li>
                    <li>• Reimportar o mesmo CSV atualiza as mesmas avaliações em vez de duplicá-las quando o arquivo possui ID.</li>
                    <li>• Status disable/draft permanece oculto na loja.</li>
                    <li>• Fotos válidas são exibidas no mesmo lightbox das avaliações atuais.</li>
                  </ul>
                </div>
              </div>
            </div>

            {selectedProduct && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Destino</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{selectedProduct.title}</p>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{selectedProduct.slug}</p>
              </div>
            )}

            {result && (
              <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  <h3 className="text-sm font-semibold">Importação concluída</h3>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                  <ResultNumber label="Importadas" value={result.imported} />
                  <ResultNumber label="Com fotos" value={result.withPhotos} />
                  <ResultNumber label="Ocultas" value={result.hidden} />
                  <ResultNumber label="Inválidas" value={result.invalidRows} />
                </div>
                {result.ignoredOtherProducts > 0 && (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {result.ignoredOtherProducts} linhas de outros produtos foram ignoradas pelo product_handle.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Fluxo</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            AliExpress → Ryviu → Exportar CSV → Importar nesta tela → banco da Absoluto Glamur → avaliações exibidas automaticamente na página do produto.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}

function ResultNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-background/70 p-3">
      <p className="font-display text-2xl text-foreground">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
