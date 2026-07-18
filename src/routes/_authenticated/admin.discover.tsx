import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Star, Store, Search, Plus, ExternalLink, Loader2, TrendingUp } from "lucide-react";
import {
  discoverAliexpressProducts,
  importAliexpressProductToStore,
  type DiscoveryProduct,
} from "@/lib/aliexpress-discovery.functions";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/discover")({
  component: DiscoverPage,
  head: () => ({
    meta: [{ title: "Descobrir produtos AliExpress — Absoluto Glamur" }],
  }),
});

function Rating({ value, label }: { value: number | null; label: string }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
      <span className="font-medium text-foreground">{value.toFixed(1)}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

function ProductCard({
  product,
  onAdd,
  isImporting,
}: {
  product: DiscoveryProduct;
  onAdd: () => void;
  isImporting: boolean;
}) {
  return (
    <div className="admin-neon-box group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition">
      <div className="relative aspect-square overflow-hidden bg-muted">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            sem imagem
          </div>
        )}
        {product.lastest_volume != null && product.lastest_volume > 0 && (
          <Badge className="absolute left-2 top-2 gap-1 bg-black/70 text-white backdrop-blur">
            <TrendingUp className="h-3 w-3" /> {product.lastest_volume}+ vendas
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-[15px]">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-foreground">
          {product.title}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Rating value={product.evaluate_rate} label="produto" />
          <Rating value={product.shop_rating} label="loja" />
        </div>
        {product.shop_title && (
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Store className="h-3 w-3" /> {product.shop_title}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            {product.price_brl_estimate_cents != null ? (
              <p className="text-lg font-semibold text-primary">
                {formatBRL(product.price_brl_estimate_cents)}
              </p>
            ) : product.price_original != null ? (
              <p className="text-lg font-semibold text-primary">
                {product.currency} {product.price_original.toFixed(2)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">preço indisponível</p>
            )}
            {product.price_original != null && product.currency !== "BRL" && (
              <p className="text-[10px] text-muted-foreground">
                origem: {product.currency} {product.price_original.toFixed(2)}
              </p>
            )}
          </div>
          {product.product_url && (
            <a
              href={product.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition hover:text-foreground"
              title="Abrir no AliExpress"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
        <Button
          onClick={onAdd}
          disabled={isImporting}
          className="mt-1 w-full gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isImporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Adicionando…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Adicionar à loja
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function DiscoverPage() {
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState<{ keyword: string; page: number }>({
    keyword: "",
    page: 1,
  });
  const [importing, setImporting] = useState<string | null>(null);
  const qc = useQueryClient();

  const discover = useServerFn(discoverAliexpressProducts);
  const importFn = useServerFn(importAliexpressProductToStore);

  const query = useQuery({
    queryKey: ["ali-discover", submitted.keyword, submitted.page],
    queryFn: () =>
      discover({
        data: { keyword: submitted.keyword || undefined, page: submitted.page, page_size: 24 },
      }),
    staleTime: 60_000,
  });

  const importMut = useMutation({
    mutationFn: async (product_id: string) => {
      setImporting(product_id);
      try {
        return await importFn({ data: { product_id, status: "draft", stock: 10 } });
      } finally {
        setImporting(null);
      }
    },
    onSuccess: () => {
      toast.success("Produto adicionado ao catálogo como rascunho");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Falha ao importar produto");
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted({ keyword: keyword.trim(), page: 1 });
  }

  const items = query.data?.items ?? [];

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h1 className="font-display text-3xl text-foreground">Descobrir produtos</h1>
            <p className="text-sm text-muted-foreground">
              Explore o catálogo AliExpress conectado e adicione produtos à sua loja com um clique.
              Título e descrição são traduzidos para pt-BR e o preço é convertido em Real
              automaticamente.
            </p>
          </div>
        </header>

        <form onSubmit={submit} className="admin-neon-box flex gap-2 rounded-xl border border-border bg-card p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder='ex.: "batom vermelho", "máscara de cílios", "perfume feminino"…'
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={query.isFetching} className="gap-1">
            {query.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Buscar
          </Button>
        </form>

        {query.isError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "Erro ao buscar produtos."}
            <p className="mt-2 text-xs opacity-80">
              Verifique se o AliExpress está autorizado em <a className="underline" href="/admin/integrations">/admin/integrations</a>.
            </p>
          </div>
        )}

        {query.isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : items.length === 0 && !query.isError ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            {submitted.keyword
              ? `Nenhum produto encontrado para "${submitted.keyword}".`
              : "Digite uma palavra-chave para buscar produtos no AliExpress, ou clique em Buscar para ver recomendações."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {items.map((p) => (
                <ProductCard
                  key={p.product_id}
                  product={p}
                  isImporting={importing === p.product_id}
                  onAdd={() => importMut.mutate(p.product_id)}
                />
              ))}
            </div>

            <div className="flex items-center justify-center gap-2 py-4">
              <Button
                variant="outline"
                disabled={submitted.page <= 1 || query.isFetching}
                onClick={() => setSubmitted((s) => ({ ...s, page: Math.max(1, s.page - 1) }))}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">Página {submitted.page}</span>
              <Button
                variant="outline"
                disabled={query.isFetching || items.length < 24}
                onClick={() => setSubmitted((s) => ({ ...s, page: s.page + 1 }))}
              >
                Próxima
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
