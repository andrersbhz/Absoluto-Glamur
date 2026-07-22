import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Plus, Search, Trash2, Package, ExternalLink, Download, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import {
  listAdminProducts,
  deleteAdminProduct,
  exportAdminProductsCsv,
  type AdminProductRow,
} from "@/lib/admin-catalog.functions";
import { optimizeProductCopy } from "@/lib/ai-product-optimize.functions";
import { syncAllAliexpressStock, syncAliexpressStock } from "@/lib/aliexpress-stock.functions";
import { bulkSyncAliexpressReviews } from "@/lib/product-reviews.functions";
import { Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/catalog/")({
  head: () => ({ meta: [{ title: "Catálogo · Admin Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: adm } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (adm) return;
    const { data: cat } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "catalog",
    });
    if (!cat) throw redirect({ to: "/account" });
  },
  component: CatalogList,
});

type StatusFilter = "all" | "draft" | "active" | "archived";

function CatalogList() {
  const list = useServerFn(listAdminProducts);
  const del = useServerFn(deleteAdminProduct);
  const exportCsv = useServerFn(exportAdminProductsCsv);
  const syncAll = useServerFn(syncAllAliexpressStock);
  const syncOne = useServerFn(syncAliexpressStock);
  const [rowSyncing, setRowSyncing] = useState<Record<string, boolean>>({});
  const bulkReviews = useServerFn(bulkSyncAliexpressReviews);
  const optimize = useServerFn(optimizeProductCopy);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [exporting, setExporting] = useState(false);
  const [aiTarget, setAiTarget] = useState<{ id: string; name: string } | null>(null);
  const [aiPreview, setAiPreview] = useState<{
    name: string;
    short_description: string;
    description_html: string;
    seo_title: string;
    seo_description: string;
    keywords: string[];
  } | null>(null);
  const [aiLoading, setAiLoading] = useState<"idle" | "generating" | "applying">("idle");

  const bulkSync = useMutation({
    mutationFn: () => syncAll({ data: { limit: 200 } }),
    onSuccess: (r) => {
      toast.success(
        `Estoque sincronizado: ${r.updated}/${r.total} produtos${r.errors.length ? ` (${r.errors.length} falhas)` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkReviewsMut = useMutation({
    mutationFn: () => bulkReviews({ data: { min_rating: 4.5, limit: 100 } }),
    onSuccess: (r) => {
      toast.success(
        `Avaliações sincronizadas: ${r.upserted} importadas em ${r.processed}/${r.total} produtos${r.failures.length ? ` (${r.failures.length} falhas)` : ""}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const query = useQuery({
    queryKey: ["admin-products", { q, status }],
    queryFn: () => list({ data: { q, status } }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Produto excluído");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleExport() {
    try {
      setExporting(true);
      const { csv, count } = await exportCsv({ data: { q, status } });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `produtos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${count} produto(s) exportado(s) em PT-BR`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  }

  async function handleOptimize(id: string, name: string) {
    setAiTarget({ id, name });
    setAiPreview(null);
    setAiLoading("generating");
    try {
      const r = await optimize({ data: { product_id: id, apply: false } });
      setAiPreview({
        name: r.name,
        short_description: r.short_description,
        description_html: r.description_html,
        seo_title: r.seo_title,
        seo_description: r.seo_description,
        keywords: r.keywords,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na IA");
      setAiTarget(null);
    } finally {
      setAiLoading("idle");
    }
  }

  async function handleApplyOptimization() {
    if (!aiTarget) return;
    setAiLoading("applying");
    try {
      await optimize({ data: { product_id: aiTarget.id, apply: true } });
      toast.success("Copy otimizado aplicado ao produto");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      setAiTarget(null);
      setAiPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar");
    } finally {
      setAiLoading("idle");
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">Catálogo</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie, edite e publique produtos. Preços e estoque ficam na aba do produto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => bulkSync.mutate()}
              disabled={bulkSync.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-60"
              title="Sincronizar estoque de todos os produtos vinculados ao AliExpress"
            >
              <RefreshCw className={`h-4 w-4 ${bulkSync.isPending ? "animate-spin" : ""}`} />
              {bulkSync.isPending ? "Sincronizando…" : "Sincronizar estoque AliExpress"}
            </button>
            <button
              onClick={() => bulkReviewsMut.mutate()}
              disabled={bulkReviewsMut.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-60"
              title="Buscar avaliações 4.5★+ do AliExpress para todos os produtos vinculados"
            >
              <Star className={`h-4 w-4 ${bulkReviewsMut.isPending ? "animate-pulse" : ""}`} />
              {bulkReviewsMut.isPending ? "Buscando avaliações…" : "Sincronizar avaliações AliExpress"}
            </button>

            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-secondary disabled:opacity-60"
              title="Baixar todos os produtos filtrados em CSV (PT-BR, UTF-8)"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exportando…" : "Exportar CSV (PT-BR)"}
            </button>
            <Link
              to="/admin/catalog/$id"
              params={{ id: "new" }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground shadow-soft hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Novo produto
            </Link>
          </div>
        </div>


        <div className="mt-6 flex flex-wrap gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-3 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todos os status</option>
            <option value="draft">Rascunho</option>
            <option value="active">Ativo</option>
            <option value="archived">Arquivado</option>
          </select>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Custo</th>
                <th className="px-4 py-3">Preço</th>
                <th className="px-4 py-3">Estoque</th>
                <th className="px-4 py-3">Mídias</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {query.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum produto ainda. Clique em <b>Novo produto</b>.
                  </td>
                </tr>
              )}
              {query.data?.map((p) => (
                <ProductRow
                  key={p.id}
                  row={p}
                  onDelete={() => {
                    if (confirm(`Excluir "${p.name}"? Essa ação é permanente.`)) delMut.mutate(p.id);
                  }}
                  onOptimize={() => handleOptimize(p.id, p.name)}
                  optimizing={aiTarget?.id === p.id && aiLoading !== "idle"}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 text-sm">
          <Link to="/admin" className="text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>
      </div>

      <Dialog open={!!aiTarget} onOpenChange={(o) => { if (!o) { setAiTarget(null); setAiPreview(null); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Inteligência de produtos · {aiTarget?.name}
            </DialogTitle>
          </DialogHeader>
          {aiLoading === "generating" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              A IA está analisando o produto e reescrevendo com gatilhos mentais focados em beleza…
            </div>
          )}
          {aiPreview && (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Novo título</p>
                <p className="mt-1 font-display text-lg">{aiPreview.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Resumo curto</p>
                <p className="mt-1">{aiPreview.short_description}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Descrição persuasiva</p>
                <div
                  className="prose prose-sm mt-1 max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: aiPreview.description_html }}
                />
              </div>
              <div className="grid gap-3 rounded-lg border border-border bg-secondary/40 p-3 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">SEO title</p>
                  <p className="mt-1">{aiPreview.seo_title}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">SEO description</p>
                  <p className="mt-1">{aiPreview.seo_description}</p>
                </div>
                {aiPreview.keywords.length > 0 && (
                  <div className="md:col-span-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Palavras-chave</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {aiPreview.keywords.map((k) => (
                        <Badge key={k} variant="outline">{k}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => aiTarget && handleOptimize(aiTarget.id, aiTarget.name)}
              disabled={aiLoading !== "idle"}
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Regenerar
            </Button>
            <Button
              onClick={handleApplyOptimization}
              disabled={!aiPreview || aiLoading !== "idle"}
            >
              {aiLoading === "applying" ? (
                <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Aplicando…</>
              ) : (
                <><Sparkles className="mr-1 h-3 w-3" /> Aplicar ao produto</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function ProductRow({
  row,
  onDelete,
  onOptimize,
  optimizing,
}: {
  row: AdminProductRow;
  onDelete: () => void;
  onOptimize: () => void;
  optimizing: boolean;
}) {
  const statusBadge =
    row.status === "active" ? (
      <Badge className="bg-success text-white">Ativo</Badge>
    ) : row.status === "draft" ? (
      <Badge variant="secondary">Rascunho</Badge>
    ) : (
      <Badge variant="outline">Arquivado</Badge>
    );
  const isVideoThumb = row.thumbnail_url ? /\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|ts|mpeg|mpg|flv|wmv)(\?|#|$)/i.test(row.thumbnail_url) : false;
  return (
    <tr className="border-t border-border/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {row.thumbnail_url ? (
            isVideoThumb ? (
              <video
                src={row.thumbnail_url}
                muted
                playsInline
                className="h-12 w-12 rounded-lg border border-border object-cover"
              />
            ) : (
              <img
                src={row.thumbnail_url}
                alt={row.name}
                loading="lazy"
                className="h-12 w-12 rounded-lg border border-border object-cover"
              />
            )
          ) : (
            <div className="grid h-12 w-12 place-items-center rounded-lg border border-border bg-secondary">
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.brand?.name ?? "sem marca"} · {row.category?.name ?? "sem categoria"} ·{" "}
              <code className="text-[11px]">{row.slug}</code>
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {statusBadge}
          {row.is_featured && <Badge className="bg-plum text-white">Destaque</Badge>}
        </div>
      </td>
      <td className="px-4 py-3">
        {row.cost_cents != null ? (
          <span className="text-muted-foreground">{formatBRL(row.cost_cents)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {row.price_cents != null ? formatBRL(row.price_cents) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-3">
        {row.stock != null ? (
          <span className={row.stock <= 0 ? "text-destructive" : ""}>{row.stock}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3">{row.media_count}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {row.status === "active" && (
            <Link
              to="/products/$slug"
              params={{ slug: row.slug }}
              target="_blank"
              className="rounded-lg border border-border p-1.5 hover:bg-secondary"
              aria-label="Abrir na loja"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            onClick={onOptimize}
            disabled={optimizing}
            title="Inteligência de produtos · reescrever com IA"
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            {optimizing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            IA
          </button>
          <Link
            to="/admin/catalog/$id"
            params={{ id: row.id }}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
          >
            Editar
          </Link>
          <button
            onClick={onDelete}
            className="rounded-lg border border-border p-1.5 text-destructive hover:bg-destructive/10"
            aria-label="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
