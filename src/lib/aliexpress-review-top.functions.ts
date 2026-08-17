import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAliTopPublic } from "./aliexpress-top-public.server";

const PROVIDER = "aliexpress_top_reviews";
const ALI_SOURCES = ["aliexpress", "aliexpress_api", "aliexpress_url"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Acesso restrito a administradores");
}

function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function normalizeAliProductId(sourceId: string): string | null {
  const raw = sourceId.trim();
  if (/^\d{5,}$/.test(raw)) return raw;
  const patterns = [
    /\/item\/(\d{5,})(?:\.html)?/i,
    /[?&](?:productId|product_id)=(\d{5,})/i,
    /\b(\d{8,})\b/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export const getAliExpressReviewTopConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("integrations")
      .select("api_key, webhook_token, enabled, last_status, last_error, last_verified_at, updated_at")
      .eq("provider", PROVIDER)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return {
      configured: Boolean(data?.api_key && data?.webhook_token),
      appKeyMasked: mask(data?.api_key),
      secretConfigured: Boolean(data?.webhook_token),
      enabled: Boolean(data?.enabled),
      lastStatus: data?.last_status ?? null,
      lastError: data?.last_error ?? null,
      lastVerifiedAt: data?.last_verified_at ?? null,
      updatedAt: data?.updated_at ?? null,
    };
  });

const SaveSchema = z.object({
  app_key: z.string().trim().max(200).optional(),
  app_secret: z.string().trim().max(500).optional(),
});

export const saveAliExpressReviewTopConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => SaveSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: current, error: currentError } = await context.supabase
      .from("integrations")
      .select("api_key, webhook_token")
      .eq("provider", PROVIDER)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);

    const appKey = data.app_key || current?.api_key || "";
    const appSecret = data.app_secret || current?.webhook_token || "";
    if (!appKey || !appSecret) {
      throw new Error("Informe App Key TOP e App Secret TOP para salvar a integração de avaliações.");
    }

    const { error } = await context.supabase.from("integrations").upsert(
      {
        provider: PROVIDER,
        category: "other",
        display_name: "AliExpress TOP · Avaliações",
        description: "Credenciais TOP clássicas usadas exclusivamente para sincronizar avaliações oficiais de produtos.",
        enabled: true,
        mode: "production",
        api_key: appKey,
        webhook_token: appSecret,
        config: { purpose: "product_reviews", protocol: "TOP" },
        last_status: null,
        last_error: null,
        last_verified_at: null,
        updated_by: context.userId,
      },
      { onConflict: "provider" },
    );
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const disconnectAliExpressReviewTop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("integrations")
      .update({
        api_key: null,
        webhook_token: null,
        enabled: false,
        last_status: null,
        last_error: null,
        last_verified_at: null,
        updated_by: context.userId,
      })
      .eq("provider", PROVIDER);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testAliExpressReviewTop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const { data: integration, error: integrationError } = await context.supabase
      .from("integrations")
      .select("api_key, webhook_token")
      .eq("provider", PROVIDER)
      .maybeSingle();
    if (integrationError) throw new Error(integrationError.message);
    if (!integration?.api_key || !integration?.webhook_token) {
      throw new Error("Salve App Key TOP e App Secret TOP antes de testar.");
    }

    const { data: imports, error: importsError } = await context.supabase
      .from("product_imports")
      .select("source_id")
      .in("source", ALI_SOURCES)
      .not("source_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(12);
    if (importsError) throw new Error(importsError.message);

    const productId = (imports ?? [])
      .map((row) => normalizeAliProductId(String(row.source_id ?? "")))
      .find(Boolean);
    if (!productId) {
      throw new Error("Nenhum produto AliExpress importado com ID válido foi encontrado para testar a API de avaliações.");
    }

    try {
      await callAliTopPublic(
        "aliexpress.social.product.evaluation.query",
        { product_id: productId, page: 1, page_size: 1 },
        context.supabase,
      );
      const now = new Date().toISOString();
      await context.supabase
        .from("integrations")
        .update({ last_status: "ok", last_error: null, last_verified_at: now, enabled: true })
        .eq("provider", PROVIDER);
      return { ok: true, productId, verifiedAt: now };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await context.supabase
        .from("integrations")
        .update({
          last_status: "error",
          last_error: message.slice(0, 1000),
          last_verified_at: new Date().toISOString(),
        })
        .eq("provider", PROVIDER);
      throw new Error(message);
    }
  });
