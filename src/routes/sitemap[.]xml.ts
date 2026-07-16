import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

// TODO: replace with your project URL once a project name or custom domain is set.
const BASE_URL = "";

type Entry = {
  path: string;
  lastmod?: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: string;
};

async function fetchDynamic(): Promise<Entry[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  const client = createClient(url, key, { auth: { persistSession: false } });

  const [products, categories, collections] = await Promise.all([
    client.from("products").select("slug, updated_at").eq("status", "active").limit(5000),
    client.from("categories").select("slug, updated_at").limit(500),
    client.from("collections").select("slug, updated_at").eq("is_featured", true).limit(200),
  ]);

  const out: Entry[] = [];
  for (const p of products.data ?? []) {
    out.push({ path: `/products/${p.slug}`, lastmod: p.updated_at, changefreq: "weekly", priority: "0.8" });
  }
  for (const c of categories.data ?? []) {
    out.push({ path: `/products?category=${c.slug}`, lastmod: c.updated_at, changefreq: "weekly", priority: "0.6" });
  }
  for (const c of collections.data ?? []) {
    out.push({ path: `/products?collection=${c.slug}`, lastmod: c.updated_at, changefreq: "weekly", priority: "0.6" });
  }
  return out;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticEntries: Entry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/products", changefreq: "daily", priority: "0.9" },
        ];
        let dynamic: Entry[] = [];
        try {
          dynamic = await fetchDynamic();
        } catch (err) {
          console.error("sitemap dynamic fetch failed", err);
        }
        const entries = [...staticEntries, ...dynamic];

        const urls = entries
          .map((e) =>
            [
              `  <url>`,
              `    <loc>${BASE_URL}${e.path}</loc>`,
              e.lastmod ? `    <lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : null,
              e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
              e.priority ? `    <priority>${e.priority}</priority>` : null,
              `  </url>`,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n");

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
