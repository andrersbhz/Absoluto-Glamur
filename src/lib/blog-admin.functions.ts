import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeBlogSeo, sanitizeBlogHtml, slugifyBlog, stripBlogHtml } from "./blog-utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Acesso restrito a administradores.");
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))].slice(0, 30);
}

function faqArray(value: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      question: String(item?.question ?? "").trim(),
      answer: String(item?.answer ?? "").trim(),
    }))
    .filter((item) => item.question && item.answer)
    .slice(0, 10);
}

const PostInputSchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().min(3).max(100),
  excerpt: z.string().max(600).nullable().optional(),
  content_html: z.string().max(120000),
  featured_image_url: z.string().url().nullable().optional().or(z.literal("")),
  featured_image_alt: z.string().max(300).nullable().optional(),
  seo_title: z.string().max(180).nullable().optional(),
  meta_description: z.string().max(360).nullable().optional(),
  focus_keyword: z.string().max(160).nullable().optional(),
  secondary_keywords: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  social_caption_facebook: z.string().max(5000).nullable().optional(),
  social_caption_instagram: z.string().max(5000).nullable().optional(),
  social_hashtags: z.array(z.string()).default([]),
  product_ids: z.array(z.string().uuid()).max(20).default([]),
});

export type BlogPostAdminInput = z.infer<typeof PostInputSchema>;

export const listBlogAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;

    const [posts, categories, products, social] = await Promise.all([
      db
        .from("blog_posts")
        .select("*,category:blog_categories(id,name,slug)")
        .order("updated_at", { ascending: false })
        .limit(120),
      db.from("blog_categories").select("*").order("position").order("name"),
      db
        .from("products")
        .select("id,name,slug,short_description,description,status,category:categories(slug,name),media:product_media(url,alt,position,kind)")
        .in("status", ["active", "draft"])
        .order("updated_at", { ascending: false })
        .limit(250),
      db
        .from("blog_social_publications")
        .select("post_id,platform,status,external_id,external_url,error,attempts,published_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(500),
    ]);

    for (const result of [posts, categories, products, social]) {
      if (result.error) throw new Error(result.error.message);
    }

    const postIds = (posts.data ?? []).map((post: any) => post.id);
    const links = postIds.length
      ? await db.from("blog_post_products").select("post_id,product_id,position").in("post_id", postIds)
      : { data: [], error: null };
    if (links.error) throw new Error(links.error.message);

    return {
      posts: posts.data ?? [],
      categories: categories.data ?? [],
      products: products.data ?? [],
      social: social.data ?? [],
      links: links.data ?? [],
    };
  });

export const createBlogDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ title: z.string().trim().min(3).max(180).default("Novo artigo") }).parse(value ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    const base = slugifyBlog(data.title) || "artigo";
    const slug = `${base}-${Date.now().toString(36)}`.slice(0, 96);
    const { data: row, error } = await db
      .from("blog_posts")
      .insert({
        title: data.title,
        slug,
        status: "draft",
        author_id: context.userId,
        content_html: "",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const createBlogCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(500).optional() }).parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    const slug = slugifyBlog(data.name);
    const { data: row, error } = await db
      .from("blog_categories")
      .insert({ name: data.name, slug, description: data.description ?? null })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

async function saveRevision(db: any, post: any, userId: string) {
  if (!post?.id || !post?.title) return;
  await db.from("blog_post_revisions").insert({
    post_id: post.id,
    title: post.title,
    excerpt: post.excerpt ?? null,
    content_html: post.content_html ?? "",
    seo_snapshot: {
      slug: post.slug,
      seo_title: post.seo_title,
      meta_description: post.meta_description,
      focus_keyword: post.focus_keyword,
      secondary_keywords: post.secondary_keywords,
      tags: post.tags,
      faq: post.faq,
      seo_score: post.seo_score,
    },
    created_by: userId,
  });
}

async function replacePostProducts(db: any, postId: string, productIds: string[]) {
  const ids = [...new Set(productIds)];
  const { error: deleteError } = await db.from("blog_post_products").delete().eq("post_id", postId);
  if (deleteError) throw new Error(deleteError.message);
  if (!ids.length) return;
  const { error } = await db.from("blog_post_products").insert(
    ids.map((productId, position) => ({ post_id: postId, product_id: productId, position })),
  );
  if (error) throw new Error(error.message);
}

export const saveBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => PostInputSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    const { data: current, error: readError } = await db.from("blog_posts").select("*").eq("id", data.id).single();
    if (readError || !current) throw new Error(readError?.message ?? "Artigo não encontrado.");
    await saveRevision(db, current, context.userId);

    const slug = slugifyBlog(data.slug || data.title);
    const contentHtml = sanitizeBlogHtml(data.content_html);
    const faq = faqArray(data.faq);
    const seo = computeBlogSeo({
      title: data.title,
      slug,
      seoTitle: data.seo_title,
      metaDescription: data.meta_description,
      focusKeyword: data.focus_keyword,
      contentHtml,
      featuredImageAlt: data.featured_image_alt,
      faq,
      linkedProducts: data.product_ids.length,
    });

    const payload = {
      category_id: data.category_id ?? null,
      title: data.title,
      slug,
      excerpt: data.excerpt?.trim() || null,
      content_html: contentHtml,
      featured_image_url: data.featured_image_url || null,
      featured_image_alt: data.featured_image_alt?.trim() || null,
      seo_title: data.seo_title?.trim() || null,
      meta_description: data.meta_description?.trim() || null,
      focus_keyword: data.focus_keyword?.trim() || null,
      secondary_keywords: stringArray(data.secondary_keywords),
      tags: stringArray(data.tags),
      faq,
      seo_score: seo.score,
      seo_checks: seo.checks,
      word_count: seo.wordCount,
      read_time_minutes: seo.readTimeMinutes,
      social_caption_facebook: data.social_caption_facebook?.trim() || null,
      social_caption_instagram: data.social_caption_instagram?.trim() || null,
      social_hashtags: stringArray(data.social_hashtags),
    };

    const { data: saved, error } = await db.from("blog_posts").update(payload).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    await replacePostProducts(db, data.id, data.product_ids);
    return { post: saved, seo };
  });

const GeneratedArticleSchema = z.object({
  title: z.string().min(10).max(180),
  slug: z.string().min(3).max(100),
  excerpt: z.string().min(60).max(420),
  seo_title: z.string().min(35).max(180),
  meta_description: z.string().min(110).max(220),
  focus_keyword: z.string().min(3).max(160),
  secondary_keywords: z.array(z.string()).max(20),
  tags: z.array(z.string()).max(20),
  content_html: z.string().min(1000),
  faq: z.array(z.object({ question: z.string().min(5), answer: z.string().min(20) })).min(3).max(8),
  featured_image_alt: z.string().min(8).max(240),
  social_caption_facebook: z.string().min(20).max(3000),
  social_caption_instagram: z.string().min(20).max(3000),
  social_hashtags: z.array(z.string()).max(20),
});

function extractJson(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error("Gemini não retornou JSON válido.");
  }
}

function productContext(product: any) {
  const categorySlug = String(product.category?.slug ?? "produto");
  const url = `https://absolutoglamur.com.br/${categorySlug}/${product.slug}`;
  const description = stripBlogHtml(String(product.description ?? product.short_description ?? "")).slice(0, 2200);
  const media = Array.isArray(product.media) ? [...product.media].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)) : [];
  const image = media.find((m: any) => m.kind !== "video") ?? media[0];
  return {
    id: product.id,
    name: product.name,
    category: product.category?.name ?? null,
    url,
    description,
    image_url: image?.url ?? null,
    image_alt: image?.alt ?? product.name,
  };
}

export const generateBlogPostWithGemini = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({
    post_id: z.string().uuid(),
    topic: z.string().trim().min(10).max(800),
    focus_keyword: z.string().trim().min(3).max(160),
    category_id: z.string().uuid().nullable().optional(),
    product_ids: z.array(z.string().uuid()).max(12).default([]),
  }).parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    const { loadAiCredential, callAiProvider } = await import("./ai-translate.server");
    const credential = await loadAiCredential("gemini", db);
    if (!credential) throw new Error("Ative e configure a chave própria do Gemini em Admin → Integrações.");

    const [{ data: current }, categoryResult, productsResult] = await Promise.all([
      db.from("blog_posts").select("*").eq("id", data.post_id).single(),
      data.category_id ? db.from("blog_categories").select("id,name,slug,description").eq("id", data.category_id).maybeSingle() : Promise.resolve({ data: null }),
      data.product_ids.length
        ? db.from("products").select("id,name,slug,short_description,description,category:categories(name,slug),media:product_media(url,alt,position,kind)").in("id", data.product_ids)
        : Promise.resolve({ data: [] }),
    ]);
    if (!current) throw new Error("Artigo não encontrado.");
    const selectedProducts = (productsResult.data ?? []).map(productContext);
    const category = categoryResult.data ?? null;

    const system = `Você é editor-chefe de SEO e conteúdo de e-commerce de beleza da Absoluto Glamur, Brasil.
Escreva conteúdo humano, útil, original e orientado à intenção de busca. Nunca faça keyword stuffing.
O texto deve apoiar SEO e conversão sem manipulação enganosa. Use gatilhos mentais éticos: curiosidade, especificidade, contraste, clareza, utilidade/reciprocidade e autoridade SOMENTE baseada nos fatos fornecidos. Nunca invente urgência, escassez, depoimentos, vendas, avaliações, certificações, estudos ou autoridade clínica.
REGRAS CRÍTICAS DE COSMÉTICOS: nunca invente ingredientes, composição, eficácia, resultados, registro, certificação, fabricante, origem, recomendação médica ou promessa terapêutica. Se o dado não estiver no contexto, não afirme.
Estrutura: o H1 fica no campo title e NÃO deve aparecer em content_html. No corpo use <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote> e links <a href="...">. Não use scripts, estilos, imagens ou iframes.
Entregue aproximadamente 1200–2200 palavras quando a intenção comportar profundidade. A introdução deve responder rapidamente ao problema; depois aprofunde com exemplos, critérios, erros comuns, checklist/rotina quando fizer sentido e conclusão com CTA natural.
Inclua links internos APENAS das URLs de produtos fornecidas. Não invente URLs. Quando houver produtos, mencione-os contextual e naturalmente, sem transformar o artigo em propaganda repetitiva.
Crie FAQ útil com 4–6 perguntas alinhadas a dúvidas de busca. SEO title atraente sem clickbait enganoso; meta description concisa; slug curto; palavras-chave secundárias sem repetição artificial.
Crie também legenda específica para Facebook e outra para Instagram. Hashtags devem ser relevantes, sem spam.
Responda SOMENTE JSON válido, sem markdown ao redor.`;

    const prompt = `Gere um artigo para o blog da Absoluto Glamur.
TEMA/BRIEF: ${data.topic}
PALAVRA-CHAVE FOCO: ${data.focus_keyword}
CATEGORIA EDITORIAL: ${JSON.stringify(category)}
PRODUTOS REAIS DISPONÍVEIS PARA LINK INTERNO: ${JSON.stringify(selectedProducts)}

Retorne exatamente este objeto JSON:
{
  "title":"...",
  "slug":"...",
  "excerpt":"...",
  "seo_title":"...",
  "meta_description":"...",
  "focus_keyword":"${data.focus_keyword}",
  "secondary_keywords":["..."],
  "tags":["..."],
  "content_html":"<p>...</p><h2>...</h2>...",
  "faq":[{"question":"...","answer":"..."}],
  "featured_image_alt":"...",
  "social_caption_facebook":"...",
  "social_caption_instagram":"...",
  "social_hashtags":["..." ]
}`;

    let generated: z.infer<typeof GeneratedArticleSchema> | null = null;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await callAiProvider(
          credential,
          system,
          attempt === 0 ? prompt : `${prompt}\n\nA resposta anterior não validou. Gere novamente respeitando exatamente o JSON e os limites de cada campo.`,
        );
        generated = GeneratedArticleSchema.parse(extractJson(raw));
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (!generated) throw lastError ?? new Error("Gemini não conseguiu gerar um artigo válido.");

    const contentHtml = sanitizeBlogHtml(generated.content_html);
    const slug = slugifyBlog(generated.slug || generated.title);
    const featuredImage = current.featured_image_url || selectedProducts.find((product: any) => product.image_url)?.image_url || null;
    const seo = computeBlogSeo({
      title: generated.title,
      slug,
      seoTitle: generated.seo_title,
      metaDescription: generated.meta_description,
      focusKeyword: generated.focus_keyword,
      contentHtml,
      featuredImageAlt: generated.featured_image_alt,
      faq: generated.faq,
      linkedProducts: selectedProducts.length,
    });

    await saveRevision(db, current, context.userId);
    const payload = {
      category_id: data.category_id ?? current.category_id ?? null,
      title: generated.title,
      slug,
      excerpt: generated.excerpt,
      content_html: contentHtml,
      featured_image_url: featuredImage,
      featured_image_alt: generated.featured_image_alt,
      seo_title: generated.seo_title,
      meta_description: generated.meta_description,
      focus_keyword: generated.focus_keyword,
      secondary_keywords: stringArray(generated.secondary_keywords),
      tags: stringArray(generated.tags),
      faq: faqArray(generated.faq),
      seo_score: seo.score,
      seo_checks: seo.checks,
      word_count: seo.wordCount,
      read_time_minutes: seo.readTimeMinutes,
      social_caption_facebook: generated.social_caption_facebook,
      social_caption_instagram: generated.social_caption_instagram,
      social_hashtags: stringArray(generated.social_hashtags),
      ai_provider: "gemini",
      ai_model: credential.model,
      ai_prompt_version: "blog-seo-v1",
    };
    const { data: saved, error } = await db.from("blog_posts").update(payload).eq("id", data.post_id).select("*").single();
    if (error) throw new Error(error.message);
    await replacePostProducts(db, data.post_id, data.product_ids);
    return { post: saved, seo, products: selectedProducts };
  });

export const publishBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ post_id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    const [{ data: post, error }, { data: links }, { data: instagram }] = await Promise.all([
      db.from("blog_posts").select("*").eq("id", data.post_id).single(),
      db.from("blog_post_products").select("product_id").eq("post_id", data.post_id),
      db.from("integrations").select("enabled,config").eq("provider", "instagram").maybeSingle(),
    ]);
    if (error || !post) throw new Error(error?.message ?? "Artigo não encontrado.");

    const seo = computeBlogSeo({
      title: post.title,
      slug: post.slug,
      seoTitle: post.seo_title,
      metaDescription: post.meta_description,
      focusKeyword: post.focus_keyword,
      contentHtml: post.content_html,
      featuredImageAlt: post.featured_image_alt,
      faq: faqArray(post.faq),
      linkedProducts: links?.length ?? 0,
    });
    if (!post.focus_keyword || !post.seo_title || !post.meta_description) {
      throw new Error("Complete palavra-chave foco, SEO title e meta description antes de publicar.");
    }
    if (seo.wordCount < 700) {
      throw new Error(`O artigo possui apenas ${seo.wordCount} palavras. Para este fluxo editorial, revise e chegue a pelo menos 700 palavras úteis antes de publicar.`);
    }
    const instagramAuto = instagram?.enabled === true && (instagram.config as any)?.auto_publish_blog !== false;
    if (instagramAuto && !post.featured_image_url) {
      throw new Error("O Instagram está com publicação automática ativa. Adicione uma imagem destacada pública antes de publicar o artigo.");
    }

    const now = new Date().toISOString();
    const canonical = post.canonical_url || `https://absolutoglamur.com.br/blog/${post.slug}`;
    const { data: published, error: updateError } = await db
      .from("blog_posts")
      .update({
        status: "published",
        published_at: post.published_at ?? now,
        canonical_url: canonical,
        seo_score: seo.score,
        seo_checks: seo.checks,
        word_count: seo.wordCount,
        read_time_minutes: seo.readTimeMinutes,
      })
      .eq("id", data.post_id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);

    const { publishBlogPostToMeta } = await import("./meta-social.server");
    const social = await publishBlogPostToMeta(published);
    return { post: published, seo, social };
  });

export const retryBlogSocial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ post_id: z.string().uuid(), platform: z.enum(["facebook", "instagram"]) }).parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { retryBlogSocialPublication } = await import("./meta-social.server");
    return retryBlogSocialPublication(data.post_id, data.platform);
  });

export const archiveBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ post_id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    const { error } = await db
      .from("blog_posts")
      .update({ status: "archived" })
      .eq("id", data.post_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
