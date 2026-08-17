import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StoreLayout } from "@/components/store/StoreLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user, roles, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name ?? "");
        setPhone(data?.phone ?? "");
        setLoading(false);
      });
  }, [user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, full_name: fullName, phone });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Perfil atualizado.");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
      toast.success("Senha alterada com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a senha.");
    } finally {
      setChangingPassword(false);
    }
  }

  function cancelPasswordChange() {
    setNewPassword("");
    setConfirmPassword("");
    setShowPasswordForm(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <StoreLayout>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl">Minha conta</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {roles.map((r) => (
                <Badge key={r} variant="secondary">{r}</Badge>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button asChild variant="outline">
                <Link to="/admin">Painel admin</Link>
              </Button>
            )}
            <Button variant="ghost" onClick={signOut}>Sair</Button>
          </div>
        </div>

        <form onSubmit={save} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div>
            <h2 className="font-display text-xl">Dados pessoais</h2>
            <p className="mt-1 text-sm text-muted-foreground">Confira e mantenha seus dados de contato atualizados.</p>
          </div>

          <div>
            <Label htmlFor="name">Nome completo</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={loading} autoComplete="name" />
          </div>

          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={user?.email ?? ""} readOnly disabled className="disabled:cursor-default disabled:opacity-100" autoComplete="email" />
            <p className="mt-1.5 text-xs text-muted-foreground">Este é o e-mail utilizado para acessar sua conta.</p>
          </div>

          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading} autoComplete="tel" />
          </div>

          <Button type="submit" disabled={saving || loading}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </form>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl">Segurança</h2>
              <p className="mt-1 text-sm text-muted-foreground">Atualize sua senha de acesso sempre que precisar.</p>
            </div>
            {!showPasswordForm && (
              <Button type="button" variant="outline" onClick={() => setShowPasswordForm(true)}>
                Alterar senha
              </Button>
            )}
          </div>

          {showPasswordForm && (
            <form onSubmit={changePassword} className="mt-6 space-y-4 border-t border-border pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="new-password">Nova senha</Label>
                  <Input
                    id="new-password"
                    type="password"
                    minLength={8}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Mínimo de 8 caracteres"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    minLength={8}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Digite novamente"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={changingPassword}>
                  {changingPassword ? "Alterando…" : "Salvar nova senha"}
                </Button>
                <Button type="button" variant="ghost" onClick={cancelPasswordChange} disabled={changingPassword}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link to="/orders" className="rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-primary">
            <p className="font-display text-lg">Meus pedidos</p>
            <p className="mt-1 text-xs text-muted-foreground">Acompanhe pagamentos e entregas.</p>
          </Link>
          <Link to="/favorites" className="rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-primary">
            <p className="font-display text-lg">Favoritos</p>
            <p className="mt-1 text-xs text-muted-foreground">Produtos que você salvou.</p>
          </Link>
          <Link to="/products" search={{} as never} className="rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-primary">
            <p className="font-display text-lg">Loja</p>
            <p className="mt-1 text-xs text-muted-foreground">Explorar o catálogo.</p>
          </Link>
        </div>
      </div>
    </StoreLayout>
  );
}
