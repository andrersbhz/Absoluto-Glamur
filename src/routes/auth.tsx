import { createFileRoute, Link, Outlet, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta · Absoluto Glamur" },
      {
        name: "description",
        content:
          "Acesse sua conta Absoluto Glamur para acompanhar pedidos, favoritos e finalizar compras com segurança.",
      },
      { property: "og:title", content: "Entrar · Absoluto Glamur" },
      {
        property: "og:description",
        content: "Faça login ou crie sua conta na Absoluto Glamur.",
      },
      { property: "og:url", content: "https://absolutoglamur.com.br/auth" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://absolutoglamur.com.br/auth" }],
  }),
  component: AuthRoute,
});

function AuthRoute() {
  const location = useLocation();
  if (location.pathname !== "/auth" && location.pathname !== "/auth/") {
    return <Outlet />;
  }
  return <AuthPage />;
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function resolveDestination(): Promise<string> {
    if (next && next.startsWith("/")) return next;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);
        const roles = (rolesData ?? []).map((r) => r.role as string);
        const adminRoles = ["superadmin", "admin", "catalog", "marketing", "finance", "support", "logistics", "analyst", "compliance"];
        if (roles.some((r) => adminRoles.includes(r))) {
          return roles.includes("admin") || roles.includes("superadmin") ? "/admin/dashboard" : "/admin";
        }
      }
    } catch {
      // ignore, fallback
    }
    return "/account";
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail se necessário.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vinda de volta.");
      }
      const dest = await resolveDestination();
      navigate({ to: dest });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível autenticar");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      const dest = await resolveDestination();
      navigate({ to: dest });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no login com Google");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-elegant">
        <Link to="/" className="font-display text-2xl text-primary">
          absoluto glamur<span className="text-plum">.</span>
        </Link>
        <h1 className="mt-6 font-display text-2xl">Acesse sua conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">Entre ou crie sua conta para continuar.</p>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")} className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4">
            <form onSubmit={handleEmail} className="space-y-4">
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pw">Senha</Label>
                <Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                <Link to="/auth/forgot" className="mt-1 inline-block text-xs text-primary hover:underline">
                  Esqueci minha senha
                </Link>
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Entrando…" : "Entrar"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <form onSubmit={handleEmail} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="email2">E-mail</Label>
                <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pw2">Senha</Label>
                <Input id="pw2" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Criando…" : "Criar conta"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" onClick={handleGoogle} disabled={loading} className="w-full">
          Continuar com Google
        </Button>
      </div>
    </div>
  );
}
