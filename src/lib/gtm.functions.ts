import { createServerFn } from "@tanstack/react-start";

export const getGtmContainerId = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("integrations")
      .select("api_key, enabled")
      .eq("provider", "google_tag_manager")
      .maybeSingle();
    if (!data?.enabled) return null;
    const id = (data.api_key ?? "").trim();
    return /^GTM-[A-Z0-9]+$/i.test(id) ? id : null;
  },
);
