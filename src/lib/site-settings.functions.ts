import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SETTING_KEYS = [
  "site_identity",
  "social_links",
  "organization_jsonld",
  "import_defaults",
  "home_content",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const listSiteSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("site_settings")
      .select("key,value,description,updated_at");
    if (error) throw error;
    return data ?? [];
  });

export const upsertSiteSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        key: z.enum(SETTING_KEYS),
        value: z.record(z.string(), z.any()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("site_settings")
      .upsert(
        { key: data.key, value: data.value, updated_by: context.userId },
        { onConflict: "key" },
      );
    if (error) throw error;
    return { ok: true };
  });
