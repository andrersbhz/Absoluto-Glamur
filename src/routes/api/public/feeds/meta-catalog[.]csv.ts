import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://absolutoglamur.com.br";
const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

export const Route = createFileRoute("/api/public/feeds/meta-catalog.csv")({
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

        const header = ["id","title","description","availability","condition","price","link","image_link","brand","product_type"].join(",");
        const rows = ((data ?? []) as any[]).map((product) => {
          const variant = product.variants?.find((v: any) => v.is_default && v.is_available !== false) ?? product.variants?.find((v: any) => v.is_available !== false) ?? product.variants?.[0];
          const price = variant?.prices?.find((p: any) => p.is_active) ?? variant?.prices?.[0];
          const cents = Number(price?.sale_price_cents ?? price?.list_price_cents ?? 0);
          const stock = Number(variant?.inventory?.[0]?.stock ?? variant?.inventory?.stock ?? 0);
          const image = product.media?.filter((m: any) => m.kind !== "video").sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))[0]?.url ?? "";
          const categorySlug = product.category?.slug ?? "produto";
          return [
            csv(product.id),
            csv(product.name),
            csv(product.short_description ?? product.description ?? product.name),
            csv(stock > 0 ? "in stock" : "out of stock"),
            csv("new"),
            csv(`${(cents / 100).toFixed(2)} BRL`),
            csv(`${BASE_URL}/${categorySlug}/${product.slug}`),
            csv(image),
            csv(product.brand?.name ?? "Absoluto Glamur"),
            csv(product.category?.name ?? "Beleza"),
          ].join(",");
        });
        return new Response([header, ...rows].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "public, max-age=1800", "Content-Disposition": "inline; filename=meta-catalog.csv" } });
      },
    },
  },
});
