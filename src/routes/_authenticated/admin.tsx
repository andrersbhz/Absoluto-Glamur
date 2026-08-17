import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_ROLES = [
  "superadmin",
  "admin",
  "catalog",
  "marketing",
  "finance",
  "support",
  "logistics",
  "analyst",
  "compliance",
];

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    // A rota pai /_authenticated já validou a sessão. Reutilizar o usuário evita
    // uma segunda chamada auth.getUser() a cada entrada/navegação no painel.
    let user = (context as { user?: { id: string } }).user ?? null;

    if (!user) {
      const { data: userData } = await supabase.auth.getUser();
      user = userData.user;
    }

    if (!user) throw redirect({ to: "/auth" });

    const { data: rolesData, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (error) throw error;

    const roles = (rolesData ?? []).map((r) => r.role as string);
    const canAccessAdmin = roles.some((role) => ADMIN_ROLES.includes(role));

    if (!canAccessAdmin) {
      throw redirect({ to: "/account" });
    }

    // Filhos que precisam restringir um módulo específico reutilizam este resultado
    // em vez de consultar user_roles novamente.
    return { roles };
  },
  component: () => <Outlet />,
});
