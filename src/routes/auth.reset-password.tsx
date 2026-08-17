import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/reset-password")({ component: ResetPage });

type RecoveryState = "checking" | "ready" | "invalid";

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [recoveryError, setRecoveryError] = useState("");

  useEffect(() => {
    let active = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setRecoveryState("ready");
        setRecoveryError("");
      }
    });

    async function prepareRecoverySession() {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      if (tokenHash) {
        if (type !== "recovery") {
          if (active) {
            setRecoveryState("invalid");
            setRecoveryError("Este link de recuperação é inválido.");
          }
          return;
        }

        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (!active) return;
        if (error) {
          setRecoveryState("invalid");
          setRecoveryError("Este link expirou ou já foi utilizado. Solicite um novo link.");
          return;
        }

        window.history.replaceState({}, document.title, window.location.pathname);
        setRecoveryState("ready");
        setRecoveryError("");
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error || !data.session) {
        setRecoveryState("invalid");
        setRecoveryError("Abra esta página pelo link enviado ao seu e-mail.");
        return;
      }
      setRecoveryState("ready");
      setRecoveryError("");
    }

    void prepareRecoverySession();
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = recoveryState === "ready" && password.length >= 8 && passwordsMatch && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Senha atualizada. Entre com sua nova senha.");
      navigate({ to: "/auth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar a senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-elegant">
        <Link to="/auth" className="text-xs text-muted-foreground hover:text-foreground">← Voltar</Link>
        <h1 className="mt-4 font-display text-2xl">Nova senha</h1>

        {recoveryState === "checking" && <p className="mt-3 text-sm text-muted-foreground">Validando seu link de recuperação…</p>}

        {recoveryState === "invalid" && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{recoveryError}</p>
            <Link to="/auth/forgot" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">Solicitar novo link</Link>
          </div>
        )}

        {recoveryState === "ready" && (
          <>
            <p className="mt-1 text-sm text-muted-foreground">Defina uma nova senha para sua conta.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="pw">Nova senha</Label>
                <Input id="pw" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Use pelo menos 8 caracteres.</p>
              </div>
              <div>
                <Label htmlFor="pw-confirm">Confirmar nova senha</Label>
                <Input id="pw-confirm" type="password" minLength={8} autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                {confirmPassword && !passwordsMatch && <p className="mt-1 text-xs text-destructive">As senhas não conferem.</p>}
              </div>
              <Button type="submit" disabled={!canSubmit} className="w-full">{loading ? "Salvando…" : "Salvar nova senha"}</Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
