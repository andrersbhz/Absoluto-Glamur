import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALI_SOURCES = ["aliexpress", "aliexpress_api", "aliexpress_url"];

async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

function normalizeAliProductId(source: string): string | null {
  const raw = source.trim();
  if (/^\d{5,}$/.test(raw)) return raw;
  for (const pattern of [
    /\/item\/(\d{5,})(?:\.html)?/i,
    /[?&](?:productId|product_id)=(\d{5,})/i,
    /\b(\d{8,})\b/,
  ]) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function resolveSourceProductId(db: any, productId: string): Promise<string | null> {
  const { data: state } = await db
    .from("product_review_sync_state")
    .select("source_id")
    .eq("product_id", productId)
    .maybeSingle();
  const fromState = state?.source_id ? normalizeAliProductId(String(state.source_id)) : null;
  if (fromState) return fromState;

  const { data: imported } = await db
    .from("product_imports")
    .select("source_id")
    .eq("product_id", productId)
    .in("source", ALI_SOURCES)
    .not("source_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return imported?.source_id ? normalizeAliProductId(String(imported.source_id)) : null;
}

async function issueBridge(input: {
  db: any;
  productId: string;
  sourceProductId: string;
  userId: string;
  origin: string;
}) {
  const { data: product, error } = await input.db
    .from("products")
    .select("id,name,slug")
    .eq("id", input.productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) throw new Error("Produto de destino não encontrado.");

  const origin = new URL(input.origin).origin;
  const { createAliExpressBrowserReviewBridge } = await import("./aliexpress-browser-review-bridge.server");
  const bridge = createAliExpressBrowserReviewBridge({
    productId: input.productId,
    sourceProductId: input.sourceProductId,
    userId: input.userId,
    origin,
    ttlSeconds: 10 * 60,
  });

  return {
    code: bridge.code,
    productId: input.productId,
    productTitle: product.name,
    productSlug: product.slug,
    sourceProductId: input.sourceProductId,
    sourceUrl: `https://pt.aliexpress.com/item/${input.sourceProductId}.html`,
    issuedAt: new Date(bridge.payload.iat * 1000).toISOString(),
    expiresAt: new Date(bridge.payload.exp * 1000).toISOString(),
    receiverUrl: `${origin}/api/public/aliexpress-review-browser`,
  };
}

const CreateSchema = z.object({
  product_id: z.string().uuid(),
  source: z.string().trim().min(1).max(2000),
  origin: z.string().url(),
});

export const createAliExpressBrowserReviewCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => CreateSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const sourceProductId = normalizeAliProductId(data.source);
    if (!sourceProductId) throw new Error("URL ou ID do produto AliExpress inválido.");
    return issueBridge({
      db: context.supabase,
      productId: data.product_id,
      sourceProductId,
      userId: context.userId,
      origin: data.origin,
    });
  });

const CreateForProductSchema = z.object({
  product_id: z.string().uuid(),
  origin: z.string().url(),
});

export const createAliExpressBrowserReviewCodeForProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => CreateForProductSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const sourceProductId = await resolveSourceProductId(context.supabase, data.product_id);
    if (!sourceProductId) {
      throw new Error("Este produto ainda não possui um ID AliExpress vinculado. Vincule ou importe o produto antes de sincronizar avaliações.");
    }
    return issueBridge({
      db: context.supabase,
      productId: data.product_id,
      sourceProductId,
      userId: context.userId,
      origin: data.origin,
    });
  });

const StateSchema = z.object({
  product_id: z.string().uuid(),
  issued_at: z.string().datetime(),
});

export const getAliExpressBrowserReviewState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => StateSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: state, error } = await db
      .from("product_review_sync_state")
      .select("product_id,source_id,status,fetched_count,remote_total,last_attempt_at,last_success_at,last_error,updated_at")
      .eq("product_id", data.product_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!state) return null;

    const issuedAt = new Date(data.issued_at).getTime();
    const changedAt = Math.max(
      state.last_attempt_at ? new Date(state.last_attempt_at).getTime() : 0,
      state.last_success_at ? new Date(state.last_success_at).getTime() : 0,
      state.updated_at ? new Date(state.updated_at).getTime() : 0,
    );
    if (!Number.isFinite(changedAt) || changedAt < issuedAt - 1500) return null;

    return {
      sourceProductId: state.source_id as string | null,
      status: state.status as string,
      imported: Number(state.fetched_count ?? 0),
      remoteTotal: Number(state.remote_total ?? 0),
      lastAttemptAt: state.last_attempt_at as string | null,
      lastSuccessAt: state.last_success_at as string | null,
      lastError: state.last_error as string | null,
      updatedAt: state.updated_at as string | null,
    };
  });
