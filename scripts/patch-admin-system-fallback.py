from pathlib import Path

path = Path('src/lib/admin-system.functions.ts')
text = path.read_text(encoding='utf-8')

start = text.index('export const listAdminUsers')
end = text.index('\nexport const updateAdminUserRoles', start)
new_list = r'''export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context);
    const db = context.supabase;

    const [{ data: roles, error: rolesError }, { data: profiles, error: profilesError }] =
      await Promise.all([
        db.from("user_roles").select("user_id, role"),
        db.from("profiles").select("id, full_name, phone, created_at").order("created_at", { ascending: false }).limit(500),
      ]);
    if (rolesError) throw new Error(rolesError.message);
    if (profilesError) throw new Error(profilesError.message);

    const rolesByUser = new Map<string, AdminRole[]>();
    for (const row of roles ?? []) {
      const current = rolesByUser.get(row.user_id) ?? [];
      current.push(row.role as AdminRole);
      rolesByUser.set(row.user_id, current);
    }
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    // Auth Admin really requires a server secret. Use it when available, but never
    // let its absence crash the admin system page.
    try {
      const { getSupabaseAdminOrNull } = await import("@/integrations/supabase/client.server");
      const admin = getSupabaseAdminOrNull();
      if (admin) {
        const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
        if (!authError) {
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
        }
      }
    } catch (error) {
      console.warn("[admin-users] Auth Admin unavailable; using profile fallback", error);
    }

    return (profiles ?? []).map((profile) => ({
      id: profile.id,
      email: null,
      full_name: profile.full_name ?? null,
      phone: profile.phone ?? null,
      created_at: profile.created_at,
      last_sign_in_at: null,
      email_confirmed_at: null,
      roles: rolesByUser.get(profile.id) ?? [],
    }));
  });
'''
text = text[:start] + new_list + text[end:]

# Role writes can use authenticated RLS because assertSuperAdmin already gates this endpoint.
role_start = text.index('export const updateAdminUserRoles')
role_end = text.index('\nexport type ComplianceOverview', role_start)
segment = text[role_start:role_end]
segment = segment.replace(
    '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");',
    '    const db = context.supabase;',
).replace('supabaseAdmin', 'db')
text = text[:role_start] + segment + text[role_end:]

# Compliance and usage are ordinary authenticated admin reads.
for start_marker, end_marker in [
    ('export const getComplianceOverview', '\nexport type UsageOverview'),
    ('export const getUsageOverview', None),
]:
    s = text.index(start_marker)
    e = text.index(end_marker, s) if end_marker else len(text)
    segment = text[s:e]
    segment = segment.replace(
        '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");',
        '    const db = context.supabase;',
    ).replace('supabaseAdmin', 'db')
    text = text[:s] + segment + text[e:]

path.write_text(text, encoding='utf-8')
