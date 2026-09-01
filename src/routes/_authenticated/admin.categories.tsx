import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminCategories,
  createCategory,
  renameCategory,
  deleteCategory,
} from "@/lib/admin-categories.functions";

export const Route = createFileRoute("/_authenticated/admin/categories")({
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
  head: () => ({ meta: [{ title: "Categorias · Admin Absoluto Glamur" }] }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdminCategories);
  const create = useServerFn(createCategory);
  const rename = useServerFn(renameCategory);
  const remove = useServerFn(deleteCategory);

  const q = useQuery({ queryKey: ["admin-categories"], queryFn: () => list({ data: undefined as never }) });
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-categories"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const mCreate = useMutation({
    mutationFn: () => create({ data: { name } }),
    onSuccess: () => {
      setName("");
      invalidate();
      toast.success("Categoria criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mRename = useMutation({
    mutationFn: (v: { id: string; name: string }) => rename({ data: v }),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
      toast.success("Categoria renomeada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDelete = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Categoria removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="font-display text-3xl">Categorias de produtos</h1>
        <p className="text-sm text-muted-foreground">
          Adicione, renomeie ou remova categorias. Só é possível remover categorias sem produtos.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <Label>Nova categoria</Label>
          <div className="mt-2 flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Cuidados com o cabelo"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim().length >= 2) mCreate.mutate();
              }}
            />
            <Button onClick={() => mCreate.mutate()} disabled={name.trim().length < 2 || mCreate.isPending}>
              {mCreate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Adicionar
            </Button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          {q.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  {editingId === c.id ? (
                    <>
                      <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="max-w-xs" />
                      <Button
                        size="sm"
                        onClick={() => mRename.mutate({ id: c.id, name: editingName })}
                        disabled={editingName.trim().length < 2 || mRename.isPending}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="text-sm text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">/{c.slug}</p>
                      </div>
                      <Badge variant="secondary">{c.product_count} produto(s)</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditingName(c.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={mDelete.isPending}
                        onClick={() => {
                          if (confirm(`Remover a categoria "${c.name}"?`)) mDelete.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
