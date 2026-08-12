import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://absolutoglamur.com.br";

function xml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/blog/feed.xml")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        let posts: any[] = [];
        if (url && key) {
          const client = createClient(url, key, { auth: { persistSession: false } }) as any;
          const { data } = await client
            .from("blog_posts")
            .select("slug,title,excerpt,published_at,updated_at,category:blog_categories(name)")
            .eq("status", "published")
            .lte("published_at", new Date().toISOString())
            .order("published_at", { ascending: false })
            .limit(30);
          posts = data ?? [];
        }

        const items = posts.map((post) => {
          const link = `${BASE_URL}/blog/${post.slug}`;
          return [
            "<item>",
            `<title>${xml(post.title)}</title>`,
            `<link>${xml(link)}</link>`,
            `<guid isPermaLink="true">${xml(link)}</guid>`,
            `<description>${xml(post.excerpt ?? "")}</description>`,
            post.category?.name ? `<category>${xml(post.category.name)}</category>` : "",
            post.published_at ? `<pubDate>${new Date(post.published_at).toUTCString()}</pubDate>` : "",
            "</item>",
          ].filter(Boolean).join("\n");
        }).join("\n");

        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<rss version="2.0">',
          '<channel>',
          '<title>Blog Absoluto Glamur</title>',
          `<link>${BASE_URL}/blog</link>`,
          '<description>Guias de beleza, skincare, cabelos, maquiagem e compras.</description>',
          '<language>pt-BR</language>',
          items,
          '</channel>',
          '</rss>',
        ].join("\n");

        return new Response(body, {
          headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=1800",
          },
        });
      },
    },
  },
});
