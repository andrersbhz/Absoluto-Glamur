import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * GTM container IDs are intentionally public (they are embedded in the storefront).
 * The database RPC exposes only the validated GTM-XXXXXX value and never exposes the
 * integrations row or any other credential, so this path does not need service-role.
 */
export const getGtmContainerId = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => {
    try {
      const { data, error } = await (supabase as any).rpc("get_public_gtm_id");
      if (error) return null;
      const id = typeof data === "string" ? data.trim() : "";
      return /^GTM-[A-Z0-9]+$/i.test(id) ? id : null;
    } catch {
      // Analytics must never prevent the storefront from rendering.
      return null;
    }
  },
);
