import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALI_SOURCES = ["aliexpress", "aliexpress_api", "aliexpress_url"];

async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

/** Descobre o product_id do AliExpress a partir das importações do produto. */
async function findSourceId(admin: any, productId: string): Promise<string | null> {
  const { data } = await admin
    .from("product_imports")
    .select("source_id")
    .eq("product_id", productId)
    .in("source", ALI_SOURCES)
    .not("source_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.source_id ? String(data.source_id) : null;
}

/**
 * Sincroniza variações reais (SKUs) do produto na AliExpress:
 * cria novas, atualiza preço/estoque/imagem das existentes (pelo ID externo do SKU)
 * e marca como indisponíveis as que saíram do fornecedor — sem apagar histórico.
 */
export const syncAliexpressVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ product_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncVariantsForProduct } = await import("./aliexpress-variants.server");

    const sourceId = await findSourceId(supabaseAdmin, data.product_id);
    if (!sourceId) {
      throw new Error("Produto não está conectado ao AliExpress.");
    }

    const result = await syncVariantsForProduct(supabaseAdmin, data.product_id, sourceId);
    return { ...result, variants_upserted: result.created + result.updated };
  });

/**
 * Reparo do catálogo existente: ressincroniza as variações reais de vários
 * produtos AliExpress já cadastrados, sem recriar produtos nem alterar slugs.
 */
export const resyncAliexpressVariantsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        product_ids: z.array(z.string().uuid()).max(200).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        only_missing_skus: z.boolean().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncVariantsForProduct } = await import("./aliexpress-variants.server");

    // Alvo: ids informados ou todos os produtos com importação AliExpress.
    let targets: Array<{ product_id: string; source_id: string }> = [];
    const query = supabaseAdmin
      .from("product_imports")
      .select("product_id, source_id, created_at")
      .in("source", ALI_SOURCES)
      .not("source_id", "is", null)
      .not("product_id", "is", null)
      .order("created_at", { ascending: false });
    const { data: imports } = data.product_ids?.length
      ? await query.in("product_id", data.product_ids)
      : await query;
    const seen = new Set<string>();
    for (const imp of imports ?? []) {
      if (!imp.product_id || seen.has(imp.product_id)) continue;
      seen.add(imp.product_id);
      targets.push({ product_id: imp.product_id, source_id: String(imp.source_id) });
    }

    if (data.only_missing_skus !== false && targets.length > 0) {
      const { data: mapped } = await supabaseAdmin
        .from("product_variants")
        .select("product_id")
        .not("external_sku_id", "is", null)
        .in(
          "product_id",
          targets.map((t) => t.product_id),
        );
      const withSkus = new Set((mapped ?? []).map((r: any) => r.product_id));
      if (data.only_missing_skus === true) {
        targets = targets.filter((t) => !withSkus.has(t.product_id));
      }
    }

    if (data.limit) targets = targets.slice(0, data.limit);

    let created = 0;
    let updated = 0;
    let unavailable = 0;
    const errors: Array<{ product_id: string; error: string }> = [];

    for (const t of targets) {
      try {
        const r = await syncVariantsForProduct(supabaseAdmin, t.product_id, t.source_id);
        created += r.created;
        updated += r.updated;
        unavailable += r.unavailable;
        for (const e of r.errors) errors.push({ product_id: t.product_id, error: e });
      } catch (e) {
        errors.push({
          product_id: t.product_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      ok: true as const,
      processed: targets.length,
      created,
      updated,
      unavailable,
      errors,
    };
  });
