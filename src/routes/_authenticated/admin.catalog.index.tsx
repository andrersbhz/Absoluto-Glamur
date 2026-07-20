import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import { syncAllAliexpressStock } from "@/lib/aliexpress-stock.functions";

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
                <th className="px-4 py-3">Preço</th>
                <th className="px-4 py-3">Estoque</th>
                <th className="px-4 py-3">Mídias</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {query.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
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
    </AdminLayout>
  );
}

function ProductRow({ row, onDelete }: { row: AdminProductRow; onDelete: () => void }) {
  const statusBadge =
    row.status === "active" ? (
      <Badge className="bg-success text-white">Ativo</Badge>
    ) : row.status === "draft" ? (
      <Badge variant="secondary">Rascunho</Badge>
    ) : (
      <Badge variant="outline">Arquivado</Badge>
    );
  return (
    <tr className="border-t border-border/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
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
