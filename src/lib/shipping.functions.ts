import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Cotação pública de frete (produto/carrinho/checkout). Preços vêm do banco, nunca do cliente. */
export const quoteShipping = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z
      .object({
        cep: z.string().min(8).max(10),
        items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(50),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeShipping } = await import("./shipping.server");
    const { data: vars } = await supabaseAdmin
      .from("product_variants")
      .select("id, product_id, weight_grams, prices:product_prices(list_price_cents, sale_price_cents, is_active)")
      .in("id", data.items.map((i) => i.variantId));
    const items = data.items.flatMap((i) => {
      const v = (vars ?? []).find((x) => x.id === i.variantId);
      if (!v) return [];
      const p = (v.prices ?? []).find((x) => x.is_active) ?? v.prices?.[0];
      const unit = p?.sale_price_cents && p.sale_price_cents < p.list_price_cents ? p.sale_price_cents : (p?.list_price_cents ?? 0);
      return [{ productId: v.product_id, quantity: i.quantity, unitCents: unit, weightGrams: v.weight_grams }];
    });
    return computeShipping(supabaseAdmin, data.cep, items);
  });

export const getProductShippingFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ productId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase.from("products").select("shipping_fee_cents").eq("id", data.productId).maybeSingle();
    return { cents: p?.shipping_fee_cents ?? null };
  });

export const setProductShippingFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ productId: z.string().uuid(), cents: z.number().int().min(0).max(100000).nullable() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    const { data: cat } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "catalog" });
    if (!adm && !cat) throw new Error("Acesso restrito");
    const { error } = await context.supabase.from("products").update({ shipping_fee_cents: data.cents }).eq("id", data.productId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
