import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import {
  getSecureCredentialStatus,
  storeSmtpPasswordSecurely,
} from "@/lib/secure-credential-drop.functions";

export const Route = createFileRoute("/_authenticated/admin/secure-credentials")({
  head: () => ({ meta: [{ title: "Credenciais seguras · Admin Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!data) throw redirect({ to: "/account" });
  },
  component: SecureCredentialsPage,
});

function SecureCredentialsPage() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getSecureCredentialStatus);
  const storeSecret = useServerFn(storeSmtpPasswordSecurely);
  const status = useQuery({
    queryKey: ["secure-credential-status", "smtp_email"],
    queryFn: () => getStatus(),
  });

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const save = useMutation({
    mutationFn: () => storeSecret({ data: { secret: password } }),
    onSuccess: () => {
      setPassword("");
      setConfirmPassword("");
      qc.invalidateQueries({ queryKey: ["secure-credential-status", "smtp_email"] });
      qc.invalidateQueries({ queryKey: ["email-provider-config"] });
      toast.success("Credencial SMTP armazenada com segurança");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const matches = password.length > 0 && password === confirmPassword;
  const canSave = matches && password.length >= 6 && !save.isPending;

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-3xl admin-plain">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-6 w-6 text-primary" />
              <h1 className="font-display text-3xl">Credenciais seguras</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Área write-only para inserir segredos sem expor o valor novamente no painel.
            </p>
          </div>
          <Badge variant={status.data?.configured ? "secondary" : "outline"}>
            {status.data?.configured ? "Senha SMTP configurada" : "Senha SMTP pendente"}
          </Badge>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Entrega direta ao servidor</p>
              <p className="mt-1 text-sm text-muted-foreground">
                O segredo não é exibido após o envio, não existe botão para revelá-lo e o formulário é limpo imediatamente depois de salvar.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Conta SMTP</p>
              <p className="mt-2 font-mono text-sm">{status.data?.username ?? "contato@absolutoglamur.com.br"}</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Remetente</p>
              <p className="mt-2 font-mono text-sm">{status.data?.from_email ?? "contato@absolutoglamur.com.br"}</p>
            </div>
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSave) return;
              save.mutate();
            }}
          >
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Senha SMTP</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  name="smtp-password-secure-drop"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-3 text-sm"
                  placeholder="Digite a senha da caixa de e-mail"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Confirmar senha SMTP</span>
              <input
                type="password"
                name="smtp-password-secure-drop-confirm"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="Digite novamente"
              />
              {confirmPassword && !matches && (
                <span className="mt-1 block text-xs text-destructive">As senhas não conferem.</span>
              )}
            </label>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              Não envie esta senha por chat, GitHub, comentário ou mensagem. Insira somente neste formulário dentro do painel administrativo.
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link to="/admin/email" className="text-sm text-primary hover:underline">
                Abrir configurações de e-mail
              </Link>
              <button
                type="submit"
                disabled={!canSave}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {save.isPending ? "Salvando…" : "Salvar credencial"}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Depois de salvar, volte em “E-mail do sistema” para executar o teste real de envio SMTP.
        </p>
      </div>
    </AdminLayout>
  );
}
