import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAli } from "./aliexpress-discovery.functions";

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

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parsePriceCents(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

type ParsedSku = {
  sku_code: string;
  attributes: Record<string, string>;
  image_url: string | null;
  price_cents: number | null;
  stock: number;
};

function parseSkus(json: any): ParsedSku[] {
  const root =
    json.aliexpress_ds_product_get_response ??
    json.aliexpress_ds_productdetail_get_response ??
    json;
  const result = root.result ?? root;
  const skusBlock = result.ae_item_sku_info_dtos ?? result.skus ?? {};
  const skus: any[] = Array.isArray(skusBlock?.ae_item_sku_info_d_t_o)
    ? skusBlock.ae_item_sku_info_d_t_o
    : Array.isArray(skusBlock)
      ? skusBlock
      : [];

  const out: ParsedSku[] = [];
  for (const s of skus) {
    const code = String(s.sku_code ?? s.sku_id ?? "").trim();
    if (!code) continue;
    const attributes: Record<string, string> = {};
    let image_url: string | null = null;
    const propsBlock = s.ae_sku_property_dtos ?? s.sku_property_list ?? s.sku_property_dtos;
    const props: any[] = Array.isArray(propsBlock?.ae_sku_property_d_t_o)
      ? propsBlock.ae_sku_property_d_t_o
      : Array.isArray(propsBlock)
        ? propsBlock
        : [];
    for (const p of props) {
      const key = String(
        p.sku_property_name ??
          p.property_value_definition_name ??
          p.name ??
          "",
      ).trim();
      const val = String(
        p.property_value_definition_name ??
          p.sku_property_value ??
          p.value ??
          "",
      ).trim();
      if (key && val) attributes[key] = val;
      const img = p.sku_image ?? p.property_value_id_long ?? null;
      if (typeof img === "string" && img.startsWith("http") && !image_url) image_url = img;
    }
    out.push({
      sku_code: code,
      attributes,
      image_url,
      price_cents: parsePriceCents(
        s.offer_sale_price ?? s.sku_price ?? s.offer_bulk_sale_price ?? s.price,
      ),
      stock: Math.max(0, num(s.sku_available_stock ?? s.available_stock ?? s.sku_stock ?? s.stock)),
    });
  }
  return out;
}

function humanName(attrs: Record<string, string>): string | null {
  const values = Object.values(attrs).filter(Boolean);
  if (values.length === 0) return null;
  return values.join(" · ").slice(0, 120);
}

/**
 * Sincroniza variações reais do produto na AliExpress:
 * - Cria/atualiza `product_variants` por SKU (nome, options.attributes, options.image_url)
 * - Cria/atualiza `product_prices` (marcando a versão nova como is_active)
 * - Atualiza `product_inventory`
 */
export const syncAliexpressVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ product_id: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: imp } = await supabaseAdmin
      .from("product_imports")
      .select("source_id")
      .eq("product_id", data.product_id)
      .in("source", ["aliexpress", "aliexpress_api"])
      .not("source_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!imp?.source_id) {
      throw new Error("Produto não está conectado ao AliExpress.");
    }

    const json = await callAli("aliexpress.ds.product.get", {
      product_id: imp.source_id,
      ship_to_country: "BR",
      target_currency: "BRL",
      target_language: "PT",
    });
    const skus = parseSkus(json);
    if (skus.length === 0) {
      return { source_id: imp.source_id, variants_upserted: 0, note: "Nenhum SKU retornado." };
    }

    // Se só existe um SKU real, mantém apenas 1 variante (comportamento atual).
    // Se são múltiplos, cria uma por SKU.
    const { data: existing } = await supabaseAdmin
      .from("product_variants")
      .select("id, sku, is_default")
      .eq("product_id", data.product_id);
    const existingBySku = new Map<string, { id: string; is_default: boolean }>();
    (existing ?? []).forEach((v) => v.sku && existingBySku.set(v.sku, { id: v.id, is_default: v.is_default }));

    let upserted = 0;
    let idx = 0;
    for (const s of skus) {
      const name = humanName(s.attributes);
      const options: Record<string, unknown> = {
        attributes: s.attributes,
        image_url: s.image_url,
      };
      const existingRow = existingBySku.get(s.sku_code);
      const isDefault = idx === 0 && (existing ?? []).length === 0
        ? true
        : existingRow?.is_default ?? false;

      let variantId: string;
      if (existingRow) {
        const { data: upd, error: ue } = await supabaseAdmin
          .from("product_variants")
          .update({ name, options })
          .eq("id", existingRow.id)
          .select("id")
          .single();
        if (ue) continue;
        variantId = upd.id;
      } else {
        const { data: ins, error: ie } = await supabaseAdmin
          .from("product_variants")
          .insert({
            product_id: data.product_id,
            sku: s.sku_code,
            name,
            options,
            is_default: isDefault,
          })
          .select("id")
          .single();
        if (ie) continue;
        variantId = ins.id;
      }

      // Preço (se veio do SKU) — só grava se ainda não houver preço ativo para esta variante.
      if (s.price_cents && s.price_cents > 0) {
        const { data: existingPrice } = await supabaseAdmin
          .from("product_prices")
          .select("id")
          .eq("variant_id", variantId)
          .eq("is_active", true)
          .maybeSingle();
        if (!existingPrice) {
          await supabaseAdmin.from("product_prices").insert({
            variant_id: variantId,
            list_price_cents: s.price_cents,
            sale_price_cents: null,
            is_active: true,
          });
        }
      }

      await supabaseAdmin
        .from("product_inventory")
        .upsert({ variant_id: variantId, stock: s.stock }, { onConflict: "variant_id" });

      upserted += 1;
      idx += 1;
    }

    // Garante ao menos uma default.
    const { data: after } = await supabaseAdmin
      .from("product_variants")
      .select("id, is_default")
      .eq("product_id", data.product_id);
    if (after && after.length > 0 && !after.some((v) => v.is_default)) {
      await supabaseAdmin
        .from("product_variants")
        .update({ is_default: true })
        .eq("id", after[0].id);
    }

    return { source_id: imp.source_id, variants_upserted: upserted, total_skus: skus.length };
  });
