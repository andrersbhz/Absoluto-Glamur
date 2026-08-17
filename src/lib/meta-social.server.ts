/* eslint-disable @typescript-eslint/no-explicit-any */

type MetaProvider = "facebook" | "instagram";
type DbClient = any;

type MetaIntegration = {
  provider: MetaProvider;
  enabled: boolean;
  accessToken: string;
  config: Record<string, any>;
};

export type MetaPublishResult = {
  platform: MetaProvider;
  status: "published" | "failed" | "skipped";
  externalId?: string;
  externalUrl?: string;
  error?: string;
};

async function resolveDb(client?: DbClient): Promise<DbClient> {
  if (client) return client;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function graphVersion(config: Record<string, any>): string {
  const raw = String(config.graph_version ?? "v23.0").trim();
  return /^v\d+\.\d+$/.test(raw) ? raw : "v23.0";
}

function graphHost(config: Record<string, any>): string {
  const configured = String(config.api_host ?? "https://graph.facebook.com").trim().replace(/\/+$/, "");
  return /^https:\/\/(graph\.facebook\.com|graph\.instagram\.com)$/i.test(configured)
    ? configured
    : "https://graph.facebook.com";
}

async function loadMetaIntegration(provider: MetaProvider, client?: DbClient): Promise<MetaIntegration | null> {
  const db = await resolveDb(client);
  const { data, error } = await db
    .from("integrations")
    .select("provider,enabled,api_key,config")
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar integração ${provider}: ${error.message}`);
  if (!data) return null;
  const accessToken = String(data.api_key ?? "").trim();
  const config = (data.config ?? {}) as Record<string, any>;
  return {
    provider,
    enabled: data.enabled === true,
    accessToken,
    config,
  };
}

async function parseMetaResponse(res: Response): Promise<any> {
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Meta retornou resposta inválida [${res.status}]: ${text.slice(0, 220)}`);
  }
  if (!res.ok || json?.error) {
    const err = json?.error;
    const detail = err?.error_user_msg ?? err?.message ?? text.slice(0, 260) ?? `HTTP ${res.status}`;
    const code = [err?.code, err?.error_subcode].filter(Boolean).join("/");
    throw new Error(`Meta${code ? ` ${code}` : ""}: ${detail}`);
  }
  return json;
}

async function graphGet(integration: MetaIntegration, objectId: string, fields: string) {
  const url = new URL(`${graphHost(integration.config)}/${graphVersion(integration.config)}/${encodeURIComponent(objectId)}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", integration.accessToken);
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  return parseMetaResponse(res);
}

async function graphPost(integration: MetaIntegration, path: string, params: Record<string, string>) {
  const url = `${graphHost(integration.config)}/${graphVersion(integration.config)}/${path.replace(/^\/+/, "")}`;
  const body = new URLSearchParams({ ...params, access_token: integration.accessToken });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  return parseMetaResponse(res);
}

export async function testMetaIntegration(provider: MetaProvider, client?: DbClient) {
  const integration = await loadMetaIntegration(provider, client);
  if (!integration?.accessToken) throw new Error("Informe o token de acesso da Meta antes de testar.");

  if (provider === "facebook") {
    const pageId = String(integration.config.page_id ?? "").trim();
    if (!pageId) throw new Error("Informe o Page ID do Facebook.");
    const page = await graphGet(integration, pageId, "id,name");
    return { id: String(page.id ?? pageId), name: String(page.name ?? "Facebook Page") };
  }

  const igUserId = String(integration.config.ig_user_id ?? "").trim();
  if (!igUserId) throw new Error("Informe o Instagram User ID profissional.");
  const account = await graphGet(integration, igUserId, "id,username");
  return { id: String(account.id ?? igUserId), name: String(account.username ?? "Instagram Business") };
}

async function logSocialResult(
  postId: string,
  result: MetaPublishResult,
  payload: Record<string, unknown>,
  client?: DbClient,
) {
  const db = await resolveDb(client);
  const row = {
    post_id: postId,
    platform: result.platform,
    status: result.status,
    external_id: result.externalId ?? null,
    external_url: result.externalUrl ?? null,
    error: result.error?.slice(0, 900) ?? null,
    payload,
    attempts: 1,
    published_at: result.status === "published" ? new Date().toISOString() : null,
  };

  const { data: existing } = await db
    .from("blog_social_publications")
    .select("attempts")
    .eq("post_id", postId)
    .eq("platform", result.platform)
    .maybeSingle();
  row.attempts = Number(existing?.attempts ?? 0) + 1;

  await db
    .from("blog_social_publications")
    .upsert(row, { onConflict: "post_id,platform" });
}

export async function publishBlogPostToFacebook(post: any, client?: DbClient): Promise<MetaPublishResult> {
  const platform: MetaProvider = "facebook";
  const integration = await loadMetaIntegration(platform, client);
  if (!integration?.enabled || integration.config.auto_publish_blog === false) {
    return { platform, status: "skipped" };
  }
  if (!integration.accessToken) {
    const result: MetaPublishResult = { platform, status: "failed", error: "Facebook ativo sem token de acesso." };
    await logSocialResult(post.id, result, {}, client);
    return result;
  }

  const pageId = String(integration.config.page_id ?? "").trim();
  if (!pageId) {
    const result: MetaPublishResult = { platform, status: "failed", error: "Facebook Page ID não configurado." };
    await logSocialResult(post.id, result, {}, client);
    return result;
  }

  const articleUrl = `https://absolutoglamur.com.br/blog/${post.slug}`;
  const message = String(
    post.social_caption_facebook ?? `${post.title}\n\n${post.excerpt ?? "Leia o conteúdo completo no blog da Absoluto Glamur."}`,
  ).trim();
  const payload = { message, link: articleUrl };

  try {
    const response = await graphPost(integration, `${encodeURIComponent(pageId)}/feed`, payload);
    const id = String(response.id ?? "");
    const result: MetaPublishResult = {
      platform,
      status: "published",
      externalId: id || undefined,
      externalUrl: id ? `https://www.facebook.com/${id.replace("_", "/posts/")}` : undefined,
    };
    await logSocialResult(post.id, result, { link: articleUrl, message }, client);
    return result;
  } catch (error) {
    const result: MetaPublishResult = {
      platform,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    await logSocialResult(post.id, result, { link: articleUrl, message }, client);
    return result;
  }
}

export async function publishBlogPostToInstagram(post: any, client?: DbClient): Promise<MetaPublishResult> {
  const platform: MetaProvider = "instagram";
  const integration = await loadMetaIntegration(platform, client);
  if (!integration?.enabled || integration.config.auto_publish_blog === false) {
    return { platform, status: "skipped" };
  }
  if (!integration.accessToken) {
    const result: MetaPublishResult = { platform, status: "failed", error: "Instagram ativo sem token de acesso." };
    await logSocialResult(post.id, result, {}, client);
    return result;
  }

  const igUserId = String(integration.config.ig_user_id ?? "").trim();
  if (!igUserId) {
    const result: MetaPublishResult = { platform, status: "failed", error: "Instagram User ID não configurado." };
    await logSocialResult(post.id, result, {}, client);
    return result;
  }
  if (!post.featured_image_url) {
    const result: MetaPublishResult = {
      platform,
      status: "failed",
      error: "Instagram exige uma imagem pública no artigo antes da publicação automática.",
    };
    await logSocialResult(post.id, result, {}, client);
    return result;
  }

  const articleUrl = `https://absolutoglamur.com.br/blog/${post.slug}`;
  const hashtags = Array.isArray(post.social_hashtags)
    ? post.social_hashtags.map((tag: string) => (tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`)).join(" ")
    : "";
  const caption = [
    String(post.social_caption_instagram ?? `${post.title}\n\n${post.excerpt ?? "Confira o conteúdo completo no blog."}`).trim(),
    `Leia no blog: ${articleUrl}`,
    hashtags,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2150);

  try {
    const container = await graphPost(integration, `${encodeURIComponent(igUserId)}/media`, {
      image_url: String(post.featured_image_url),
      caption,
    });
    const creationId = String(container.id ?? "");
    if (!creationId) throw new Error("Instagram não retornou o ID do container de mídia.");

    const published = await graphPost(integration, `${encodeURIComponent(igUserId)}/media_publish`, {
      creation_id: creationId,
    });
    const id = String(published.id ?? "");
    const result: MetaPublishResult = {
      platform,
      status: "published",
      externalId: id || undefined,
    };
    await logSocialResult(post.id, result, { image_url: post.featured_image_url, caption, creation_id: creationId }, client);
    return result;
  } catch (error) {
    const result: MetaPublishResult = {
      platform,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    await logSocialResult(post.id, result, { image_url: post.featured_image_url, caption }, client);
    return result;
  }
}

export async function publishBlogPostToMeta(post: any, client?: DbClient): Promise<MetaPublishResult[]> {
  const [facebook, instagram] = await Promise.all([
    publishBlogPostToFacebook(post, client),
    publishBlogPostToInstagram(post, client),
  ]);
  return [facebook, instagram];
}

export async function retryBlogSocialPublication(postId: string, platform: MetaProvider, client?: DbClient) {
  const db = await resolveDb(client);
  const { data: post, error } = await db
    .from("blog_posts")
    .select("*")
    .eq("id", postId)
    .single();
  if (error || !post) throw new Error(error?.message ?? "Artigo não encontrado.");
  return platform === "facebook"
    ? publishBlogPostToFacebook(post, client)
    : publishBlogPostToInstagram(post, client);
}
