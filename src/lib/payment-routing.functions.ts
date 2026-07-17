import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PaymentMethodKey = "pix" | "credit_card" | "boleto" | "nubank_redirect";

export type CheckoutMethodDTO = {
  method: PaymentMethodKey;
  provider: string;
  label: string;
  enabled: boolean;
  sort_order: number;
};

/**
 * Lista métodos habilitados (uso público, checkout).
 * Não requer auth; leitura via policy `public read routing enabled`.
 */
export const listCheckoutMethods = createServerFn({ method: "GET" }).handler(
  async (): Promise<CheckoutMethodDTO[]> => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const url = process.env.SUPABASE_URL!;
    const supa = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data, error } = await supa
      .from("payment_method_routing")
      .select("method, provider, enabled, display_label, sort_order")
      .eq("enabled", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      method: r.method as PaymentMethodKey,
      provider: r.provider,
      label: r.display_label ?? r.method,
      enabled: r.enabled,
      sort_order: r.sort_order,
    }));
  },
);

/** Admin: lista completo (habilitados e desabilitados) */
export const listAdminRouting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CheckoutMethodDTO[]> => {
    const { data: adm } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (!adm) throw new Error("Acesso restrito a administradores");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("payment_method_routing")
      .select("method, provider, enabled, display_label, sort_order")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      method: r.method as PaymentMethodKey,
      provider: r.provider,
      label: r.display_label ?? r.method,
      enabled: r.enabled,
      sort_order: r.sort_order,
    }));
  });

const RoutingUpdateSchema = z.object({
  method: z.enum(["pix", "credit_card", "boleto", "nubank_redirect"]),
  provider: z.string().min(2).optional(),
  enabled: z.boolean().optional(),
  display_label: z.string().max(80).optional(),
  sort_order: z.number().int().optional(),
});
export type RoutingUpdateInput = z.infer<typeof RoutingUpdateSchema>;

export const updateRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RoutingUpdateSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { data: adm } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (!adm) throw new Error("Acesso restrito a administradores");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = { updated_by: context.userId };
    if (data.provider) patch.provider = data.provider;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.display_label !== undefined) patch.display_label = data.display_label;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    const { error } = await supabaseAdmin
      .from("payment_method_routing")
      .update(patch)
      .eq("method", data.method);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
