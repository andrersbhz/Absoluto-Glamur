import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const roles = (rolesData ?? []).map((r) => r.role as string);
    const canAccessAdmin = roles.some((role) =>
      ["superadmin", "admin", "catalog", "marketing", "finance", "support", "logistics", "analyst", "compliance"].includes(role),
    );
    if (!canAccessAdmin) {
      throw redirect({ to: "/account" });
    }
  },
  component: () => <Outlet />,
});
