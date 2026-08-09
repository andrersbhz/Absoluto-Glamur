import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://absolutoglamur.com.br";
const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const Route = createFileRoute("/api/public/feeds/google-merchant.xml")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) return new Response("Supabase não configurado", { status: 503 });
        const db = createClient(url, key, { auth: { persistSession: false } });
        const { data, error } = await db.from("products").select(`
          id, slug, name, short_description, description, status,
          category:categories(name,slug), brand:brands(name),
          media:product_media(url,kind,position),
          variants:product_variants(id,is_default,is_available,prices:product_prices(list_price_cents,sale_price_cents,is_active),inventory:product_inventory(stock))
        `).eq("status", "active").limit(5000);
        if (error) return new Response(error.message, { status: 500 });

        const items = ((data ?? []) as any[]).map((product) => {
          const variant = product.variants?.find((v: any) => v.is_default && v.is_available !== false) ?? product.variants?.find((v: any) => v.is_available !== false) ?? product.variants?.[0];
          const price = variant?.prices?.find((p: any) => p.is_active) ?? variant?.prices?.[0];
          const cents = Number(price?.sale_price_cents ?? price?.list_price_cents ?? 0);
          const stock = Number(variant?.inventory?.[0]?.stock ?? variant?.inventory?.stock ?? 0);
          const image = product.media?.filter((m: any) => m.kind !== "video").sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))[0]?.url ?? "";
          const categorySlug = product.category?.slug ?? "produto";
          return [
            "<item>",
            `<g:id>${esc(product.id)}</g:id>`,
            `<title>${esc(product.name)}</title>`,
            `<description>${esc(product.short_description ?? product.description ?? product.name)}</description>`,
            `<link>${BASE_URL}/${esc(categorySlug)}/${esc(product.slug)}</link>`,
            `<g:image_link>${esc(image)}</g:image_link>`,
            `<g:availability>${stock > 0 ? "in_stock" : "out_of_stock"}</g:availability>`,
            `<g:condition>new</g:condition>`,
            `<g:price>${(cents / 100).toFixed(2)} BRL</g:price>`,
            product.brand?.name ? `<g:brand>${esc(product.brand.name)}</g:brand>` : "",
            product.category?.name ? `<g:product_type>${esc(product.category.name)}</g:product_type>` : "",
            "</item>",
          ].filter(Boolean).join("\n");
        }).join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Absoluto Glamur</title><link>${BASE_URL}</link><description>Catálogo de produtos Absoluto Glamur</description>${items}</channel></rss>`;
        return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
      },
    },
  },
});
