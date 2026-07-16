import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Save, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { listAdminUsers, updateAdminUserRoles, type AdminRole, type AdminUserRow } from "@/lib/admin-system.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Usuários e permissões · Admin Bloom" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!data) throw redirect({ to: "/account" });
  },
  component: UsersPage,
});

const roles: Array<{ value: AdminRole; label: string }> = [
  { value: "superadmin", label: "Super admin" },
  { value: "admin", label: "Admin" },
  { value: "catalog", label: "Catálogo" },
  { value: "marketing", label: "Marketing" },
  { value: "finance", label: "Financeiro" },
  { value: "support", label: "Suporte" },
  { value: "logistics", label: "Logística" },
  { value: "analyst", label: "Analista" },
  { value: "compliance", label: "Conformidade" },
  { value: "customer", label: "Cliente" },
];

function UsersPage() {
  const list = useServerFn(listAdminUsers);
  const updateRoles = useServerFn(updateAdminUserRoles);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AdminRole[]>([]);

  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => list() });
  const mutation = useMutation({
    mutationFn: (input: { userId: string; roles: AdminRole[] }) => updateRoles({ data: input }),
    onSuccess: () => {
      toast.success("Permissões atualizadas");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(user: AdminUserRow) {
    setEditing(user.id);
    setSelectedRoles(user.roles.length ? user.roles : ["customer"]);
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-3xl">Usuários e permissões</h1>
            <p className="text-sm text-muted-foreground">Gerencie cargos reais do banco para acesso ao painel e às áreas operacionais.</p>
          </div>
        </div>

        {q.isLoading && (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários…
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="min-w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Cargos</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.data?.map((user) => (
                <tr key={user.id} className="align-top hover:bg-secondary/30">
                  <td className="px-4 py-4">
                    <p className="font-medium">{user.full_name || user.email || "Usuário sem nome"}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{user.id}</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <Badge variant={user.email_confirmed_at ? "secondary" : "outline"}>
                        {user.email_confirmed_at ? "E-mail confirmado" : "Pendente"}
                      </Badge>
                      <p>Criado em {new Date(user.created_at).toLocaleDateString("pt-BR")}</p>
                      <p>Último login: {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("pt-BR") : "—"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {editing === user.id ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {roles.map((role) => (
                          <label key={role.value} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-xs">
                            <input
                              type="checkbox"
                              checked={selectedRoles.includes(role.value)}
                              onChange={(e) => {
                                setSelectedRoles((current) =>
                                  e.target.checked
                                    ? Array.from(new Set([...current, role.value]))
                                    : current.filter((r) => r !== role.value),
                                );
                              }}
                            />
                            {role.label}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length ? user.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>) : <Badge variant="outline">sem cargo</Badge>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {editing === user.id ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => mutation.mutate({ userId: user.id, roles: selectedRoles.length ? selectedRoles : ["customer"] })}
                          disabled={mutation.isPending}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-60"
                        >
                          <Save className="h-3.5 w-3.5" /> Salvar
                        </button>
                        <button onClick={() => setEditing(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(user)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary">
                        <ShieldCheck className="h-3.5 w-3.5" /> Editar cargos
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}