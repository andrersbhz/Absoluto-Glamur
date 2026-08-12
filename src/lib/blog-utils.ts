/* eslint-disable no-control-regex */

export type BlogSeoInput = {
  title: string;
  slug: string;
  seoTitle?: string | null;
  metaDescription?: string | null;
  focusKeyword?: string | null;
  contentHtml: string;
  featuredImageAlt?: string | null;
  faq?: Array<{ question?: string; answer?: string }> | null;
  linkedProducts?: number;
};

export type BlogSeoResult = {
  score: number;
  checks: Record<string, { ok: boolean; label: string; detail: string }>;
  wordCount: number;
  readTimeMinutes: number;
};

export function slugifyBlog(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 90);
}

export function stripBlogHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function countBlogWords(html: string): number {
  const text = stripBlogHtml(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

export function estimateBlogReadTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 220));
}

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Sanitizador conservador para HTML editorial vindo do admin/Gemini.
 * Mantém somente estrutura semântica útil para leitura/SEO e links seguros.
 */
export function sanitizeBlogHtml(input: string): string {
  let html = input
    .replace(/\u0000/g, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)[^>]*\/?>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "");

  const allowed = new Set([
    "p", "br", "h2", "h3", "h4", "ul", "ol", "li", "strong", "b", "em", "i", "a", "blockquote", "hr",
  ]);

  html = html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    const closing = full.startsWith("</");
    if (!allowed.has(tag)) return "";
    if (closing) return `</${tag}>`;
    if (tag === "br" || tag === "hr") return `<${tag}>`;
    if (tag !== "a") return `<${tag}>`;

    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = safeHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "");
    if (!href) return "<a>";
    const external = /^https?:\/\//i.test(href);
    return `<a href="${escapeHtmlAttribute(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>`;
  });

  return html
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function occurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let index = 0;
  let count = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

export function computeBlogSeo(input: BlogSeoInput): BlogSeoResult {
  const contentText = stripBlogHtml(input.contentHtml);
  const normalizedContent = normalizeForSearch(contentText);
  const keyword = normalizeForSearch(input.focusKeyword ?? "");
  const normalizedTitle = normalizeForSearch(input.title);
  const normalizedSeoTitle = normalizeForSearch(input.seoTitle ?? input.title);
  const normalizedMeta = normalizeForSearch(input.metaDescription ?? "");
  const wordCount = countBlogWords(input.contentHtml);
  const h2Count = (input.contentHtml.match(/<h2\b/gi) ?? []).length;
  const h3Count = (input.contentHtml.match(/<h3\b/gi) ?? []).length;
  const internalLinks = (input.contentHtml.match(/<a\s+[^>]*href=["']\//gi) ?? []).length;
  const keywordCount = keyword ? occurrences(normalizedContent, keyword) : 0;
  const density = keyword && wordCount > 0 ? (keywordCount / wordCount) * 100 : 0;
  const seoTitleLength = (input.seoTitle ?? input.title).trim().length;
  const metaLength = (input.metaDescription ?? "").trim().length;
  const faqCount = Array.isArray(input.faq)
    ? input.faq.filter((row) => row?.question?.trim() && row?.answer?.trim()).length
    : 0;

  const checks: BlogSeoResult["checks"] = {
    focus_keyword: {
      ok: keyword.length >= 3,
      label: "Palavra-chave foco definida",
      detail: keyword ? `Foco: ${input.focusKeyword}` : "Defina a intenção principal da busca.",
    },
    title_keyword: {
      ok: !!keyword && (normalizedTitle.includes(keyword) || normalizedSeoTitle.includes(keyword)),
      label: "Palavra-chave no título",
      detail: "Use a palavra-chave naturalmente no H1 ou SEO title.",
    },
    slug: {
      ok: input.slug.length >= 4 && input.slug.length <= 75 && (!keyword || input.slug.includes(slugifyBlog(keyword))),
      label: "Slug curto e descritivo",
      detail: `${input.slug.length} caracteres`,
    },
    seo_title: {
      ok: seoTitleLength >= 45 && seoTitleLength <= 68,
      label: "SEO title",
      detail: `${seoTitleLength} caracteres (alvo aproximado: 45–68).`,
    },
    meta_description: {
      ok: metaLength >= 130 && metaLength <= 165 && (!keyword || normalizedMeta.includes(keyword)),
      label: "Meta description",
      detail: `${metaLength} caracteres; deve resumir valor e intenção sem clickbait enganoso.`,
    },
    depth: {
      ok: wordCount >= 1000,
      label: "Profundidade útil",
      detail: `${wordCount} palavras. A profundidade deve acompanhar a intenção, não apenas aumentar volume.`,
    },
    headings: {
      ok: h2Count >= 3 && h3Count >= 1,
      label: "Hierarquia H2/H3",
      detail: `${h2Count} H2 e ${h3Count} H3.`,
    },
    keyword_use: {
      ok: !keyword || (keywordCount >= 2 && density <= 2.5),
      label: "Uso natural da palavra-chave",
      detail: keyword ? `${keywordCount} ocorrências; densidade aproximada ${density.toFixed(2)}%.` : "Sem foco definido.",
    },
    internal_links: {
      ok: internalLinks + (input.linkedProducts ?? 0) >= 2,
      label: "Links internos",
      detail: `${internalLinks} links no conteúdo + ${input.linkedProducts ?? 0} produtos relacionados.`,
    },
    image_alt: {
      ok: !!input.featuredImageAlt?.trim(),
      label: "Alt da imagem",
      detail: input.featuredImageAlt?.trim() ? "Imagem principal possui texto alternativo." : "Adicione descrição objetiva da imagem.",
    },
    faq: {
      ok: faqCount >= 3,
      label: "FAQ útil",
      detail: `${faqCount} perguntas e respostas completas.`,
    },
  };

  const weights: Record<keyof typeof checks, number> = {
    focus_keyword: 8,
    title_keyword: 10,
    slug: 7,
    seo_title: 10,
    meta_description: 12,
    depth: 12,
    headings: 8,
    keyword_use: 8,
    internal_links: 10,
    image_alt: 7,
    faq: 8,
  };

  const score = Math.round(
    Object.entries(checks).reduce((sum, [key, check]) => sum + (check.ok ? weights[key as keyof typeof checks] : 0), 0),
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    checks,
    wordCount,
    readTimeMinutes: estimateBlogReadTime(wordCount),
  };
}
