from pathlib import Path

p = Path('src/lib/admin-system.functions.ts')
s = p.read_text()
start = s.index('export const listAdminUsers = createServerFn')
end = s.index('export type ComplianceOverview', start)
replacement = '''export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context);
    const { data, error } = await (context.supabase as any).rpc("admin_list_users");
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      email: typeof row.email === "string" ? row.email : null,
      full_name: typeof row.full_name === "string" ? row.full_name : null,
      phone: typeof row.phone === "string" ? row.phone : null,
      created_at: String(row.created_at),
      last_sign_in_at: typeof row.last_sign_in_at === "string" ? row.last_sign_in_at : null,
      email_confirmed_at:
        typeof row.email_confirmed_at === "string" ? row.email_confirmed_at : null,
      roles: Array.isArray(row.roles)
        ? row.roles.filter((role): role is AdminRole =>
            APP_ROLES.includes(role as AdminRole),
          )
        : [],
    }));
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
    const uniqueRoles = Array.from(new Set(data.roles));
    const { error } = await (context.supabase as any).rpc("admin_set_user_roles", {
      target_user_id: data.userId,
      role_names: uniqueRoles,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

'''
p.write_text(s[:start] + replacement + s[end:])
print('admin users RPC patch applied')
