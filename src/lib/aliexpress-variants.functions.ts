import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
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

    const { data: imp } = await supabaseAdmin
      .from("product_imports")
      .select("source_id")
      .eq("product_id", data.product_id)
      .in("source", ["aliexpress", "aliexpress_api", "aliexpress_url"])
      .not("source_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!imp?.source_id) {
      throw new Error("Produto não está conectado ao AliExpress.");
    }

    const result = await syncVariantsForProduct(
      supabaseAdmin,
      data.product_id,
      String(imp.source_id),
    );
    return { ...result, variants_upserted: result.created + result.updated };
  });
