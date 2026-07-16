import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP_ROLES = [
  "superadmin",
  "admin",
  "catalog",
  "marketing",
  "finance",
  "support",
  "logistics",
  "analyst",
  "compliance",
  "customer",
] as const;

export type AdminRole = (typeof APP_ROLES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!adm) throw new Error("Acesso restrito a administradores");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(context: any) {
  const { data: superadmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "superadmin",
  });
  if (!superadmin) throw new Error("Apenas superadmins podem alterar permissões");
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  roles: AdminRole[];
};

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: authData, error: authError }, { data: roles, error: rolesError }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    if (authError) throw new Error(authError.message);
    if (rolesError) throw new Error(rolesError.message);

    const userIds = authData.users.map((u) => u.id);
    const profiles = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", userIds)
      : { data: [], error: null };
    if (profiles.error) throw new Error(profiles.error.message);

    const profileById = new Map((profiles.data ?? []).map((p) => [p.id, p]));
    const rolesByUser = new Map<string, AdminRole[]>();
    for (const row of roles ?? []) {
      const current = rolesByUser.get(row.user_id) ?? [];
      current.push(row.role as AdminRole);
      rolesByUser.set(row.user_id, current);
    }

    return authData.users.map((user) => {
      const profile = profileById.get(user.id);
      return {
        id: user.id,
        email: user.email ?? null,
        full_name: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        roles: rolesByUser.get(user.id) ?? [],
      };
    });
  });

export const updateAdminUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        roles: z.array(z.enum(APP_ROLES)).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.roles.includes("superadmin")) {
      const { data: currentRoles, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "superadmin");
      if (error) throw new Error(error.message);
      const targetIsSuperadmin = currentRoles?.some((r) => r.user_id === data.userId) ?? false;
      if (targetIsSuperadmin && (currentRoles?.length ?? 0) <= 1) {
        throw new Error("Não é possível remover o último superadmin do sistema");
      }
    }

    const { error: deleteError } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (deleteError) throw new Error(deleteError.message);

    const uniqueRoles = Array.from(new Set(data.roles));
    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert(uniqueRoles.map((role) => ({ user_id: data.userId, role })));
    if (insertError) throw new Error(insertError.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "admin.user_roles.update",
      entity: "user_roles",
      entity_id: data.userId,
      metadata: { roles: uniqueRoles },
    });

    return { ok: true };
  });

export type ComplianceOverview = {
  activeProducts: number;
  productsMissingSeo: Array<{ id: string; name: string }>;
  productsMissingMedia: Array<{ id: string; name: string }>;
  pendingReviews: number;
  paymentEventErrors: number;
  integrationsWithErrors: Array<{ provider: string; display_name: string; last_error: string | null }>;
  recentAuditLogs: Array<{
    id: string;
    action: string;
    entity: string | null;
    actor_id: string | null;
    created_at: string;
  }>;
  recentPaymentEvents: Array<{
    id: string;
    provider: string;
    event_type: string;
    processed: boolean;
    error: string | null;
    created_at: string;
  }>;
};

export const getComplianceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ComplianceOverview> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [products, reviews, paymentErrors, integrations, auditLogs, paymentEvents] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, name, seo:product_seo(meta_title, meta_description), media:product_media(id)")
        .eq("status", "active")
        .limit(500),
      supabaseAdmin.from("product_reviews").select("id", { count: "exact", head: true }).eq("is_approved", false),
      supabaseAdmin.from("payment_events").select("id", { count: "exact", head: true }).not("error", "is", null),
      supabaseAdmin
        .from("integrations")
        .select("provider, display_name, last_status, last_error")
        .eq("last_status", "error"),
      supabaseAdmin
        .from("audit_logs")
        .select("id, action, entity, actor_id, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      supabaseAdmin
        .from("payment_events")
        .select("id, provider, event_type, processed, error, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    for (const result of [products, reviews, paymentErrors, integrations, auditLogs, paymentEvents]) {
      if (result.error) throw new Error(result.error.message);
    }

    const rows = (products.data ?? []) as Array<{
      id: string;
      name: string;
      seo: { meta_title: string | null; meta_description: string | null } | { meta_title: string | null; meta_description: string | null }[] | null;
      media: { id: string }[] | null;
    }>;

    const productsMissingSeo = rows
      .filter((p) => {
        const seo = Array.isArray(p.seo) ? p.seo[0] : p.seo;
        return !seo?.meta_title || !seo?.meta_description;
      })
      .map(({ id, name }) => ({ id, name }))
      .slice(0, 20);

    const productsMissingMedia = rows
      .filter((p) => !p.media?.length)
      .map(({ id, name }) => ({ id, name }))
      .slice(0, 20);

    return {
      activeProducts: rows.length,
      productsMissingSeo,
      productsMissingMedia,
      pendingReviews: reviews.count ?? 0,
      paymentEventErrors: paymentErrors.count ?? 0,
      integrationsWithErrors: (integrations.data ?? []).map((i) => ({
        provider: i.provider,
        display_name: i.display_name,
        last_error: i.last_error,
      })),
      recentAuditLogs: auditLogs.data ?? [],
      recentPaymentEvents: paymentEvents.data ?? [],
    };
  });

export type UsageOverview = {
  databaseRows: number;
  databaseRowsLimit: number;
  storageBytes: number;
  storageBytesLimit: number;
  monthlyActiveUsers: number;
  monthlyActiveUsersLimit: number;
  enabledIntegrations: number;
  aiCalls30d: number;
  importsTotal: number;
  rowsByTable: Array<{ table: string; count: number }>;
};

const FREE_LIMITS = {
  databaseRowsLimit: 500_000,
  storageBytesLimit: 1_073_741_824,
  monthlyActiveUsersLimit: 50_000,
};

export const getUsageOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageOverview> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const tables = [
      "profiles",
      "products",
      "product_variants",
      "product_media",
      "orders",
      "order_items",
      "payments",
      "product_imports",
      "ai_generations",
      "audit_logs",
      "site_settings",
    ];

    const rowCounts = await Promise.all(
      tables.map(async (table) => {
        // The generated database type only accepts literal table names; this runtime list is intentional.
        const { count, error } = await supabaseAdmin
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from(table as any)
          .select("*", { count: "exact", head: true });
        if (error) throw new Error(error.message);
        return { table, count: count ?? 0 };
      }),
    );

    const [users30, integrations, aiCalls, imports] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since30),
      supabaseAdmin.from("integrations").select("provider", { count: "exact", head: true }).eq("enabled", true),
      supabaseAdmin.from("ai_generations").select("id", { count: "exact", head: true }).gte("created_at", since30),
      supabaseAdmin.from("product_imports").select("id", { count: "exact", head: true }),
    ]);

    for (const result of [users30, integrations, aiCalls, imports]) {
      if (result.error) throw new Error(result.error.message);
    }

    return {
      databaseRows: rowCounts.reduce((sum, row) => sum + row.count, 0),
      databaseRowsLimit: FREE_LIMITS.databaseRowsLimit,
      storageBytes: 0,
      storageBytesLimit: FREE_LIMITS.storageBytesLimit,
      monthlyActiveUsers: users30.count ?? 0,
      monthlyActiveUsersLimit: FREE_LIMITS.monthlyActiveUsersLimit,
      enabledIntegrations: integrations.count ?? 0,
      aiCalls30d: aiCalls.count ?? 0,
      importsTotal: imports.count ?? 0,
      rowsByTable: rowCounts.sort((a, b) => b.count - a.count),
    };
  });