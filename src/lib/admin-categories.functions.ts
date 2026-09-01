import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

export type AdminCategoryRow = {
  id: string;
  name: string;
  slug: string;
  position: number | null;
  product_count: number;
};

export const listAdminCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCategoryRow[]> => {
    await assertCatalog(context);
    const db = context.supabase;
    const [{ data: cats, error }, { data: prods }] = await Promise.all([
      db.from("categories").select("id, name, slug, position").order("position"),
      db.from("products").select("category_id"),
    ]);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const p of (prods ?? []) as { category_id: string | null }[]) {
      if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
    return ((cats ?? []) as Omit<AdminCategoryRow, "product_count">[]).map((c) => ({
      ...c,
      product_count: counts.get(c.id) ?? 0,
    }));
  });

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ name: z.string().min(2).max(80), slug: z.string().max(80).optional() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const slug = slugify(data.slug && data.slug.length > 0 ? data.slug : data.name);
    if (!slug) throw new Error("Nome inválido para gerar o endereço da categoria");
    const { data: existing } = await context.supabase
      .from("categories")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) throw new Error("Já existe uma categoria com esse endereço (slug)");
    const { data: last } = await context.supabase
      .from("categories")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: row, error } = await context.supabase
      .from("categories")
      .insert({ name: data.name.trim(), slug, position: ((last?.position as number | null) ?? 0) + 1 })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string, slug };
  });

export const renameCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid(), name: z.string().min(2).max(80) }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { error } = await context.supabase
      .from("categories")
      .update({ name: data.name.trim() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { count } = await context.supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error(
        `Esta categoria possui ${count} produto(s). Mova os produtos para outra categoria antes de remover.`,
      );
    }
    const { error } = await context.supabase.from("categories").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
