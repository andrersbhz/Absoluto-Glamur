import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordRecovery } from "@/lib/password-recovery.functions";

export const Route = createFileRoute("/auth/forgot")({
  component: ForgotPage,
});

function ForgotPage() {
  const requestRecovery = useServerFn(requestPasswordRecovery);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await requestRecovery({ data: { email } });
      setSent(true);
      toast.success("Se o e-mail existir, enviaremos um link de recuperação.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível processar a solicitação");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-elegant">
        <Link to="/auth" className="text-xs text-muted-foreground hover:text-foreground">← Voltar</Link>
        <h1 className="mt-4 font-display text-2xl">Recuperar senha</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enviaremos um link seguro para você criar uma nova senha.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading || sent} className="w-full">
            {sent ? "Link solicitado" : loading ? "Enviando…" : "Enviar link"}
          </Button>
        </form>
        {sent && (
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Verifique também as pastas Spam, Lixo eletrônico e Promoções. Por segurança, mostramos a mesma confirmação mesmo quando o endereço não está cadastrado.
          </p>
        )}
      </div>
    </div>
  );
}
