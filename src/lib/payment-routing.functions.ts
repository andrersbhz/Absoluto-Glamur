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

const SUPPORTED_PAYMENT_ROUTES: Record<PaymentMethodKey, readonly string[]> = {
  pix: ["asaas", "pagbank"],
  credit_card: ["pagbank"],
  boleto: ["asaas", "pagbank"],
  nubank_redirect: ["nupay"],
};

function isSupportedPaymentRoute(method: PaymentMethodKey, provider: string) {
  return SUPPORTED_PAYMENT_ROUTES[method].includes(provider);
}

/**
 * Lista métodos habilitados (uso público, checkout).
 * Além do flag do banco, só expõe combinações que possuem adapter implementado.
 */
export const listCheckoutMethods = createServerFn({ method: "GET" }).handler(
  async (): Promise<CheckoutMethodDTO[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("payment_method_routing")
      .select("method, provider, enabled, display_label, sort_order")
      .eq("enabled", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((r) => isSupportedPaymentRoute(r.method as PaymentMethodKey, r.provider))
      .map((r) => ({
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

    let provider = data.provider;
    if (!provider && data.enabled === true) {
      const { data: current, error: currentError } = await supabaseAdmin
        .from("payment_method_routing")
        .select("provider")
        .eq("method", data.method)
        .maybeSingle();
      if (currentError) throw new Error(currentError.message);
      provider = current?.provider;
    }

    if (provider && !isSupportedPaymentRoute(data.method, provider)) {
      const supported = SUPPORTED_PAYMENT_ROUTES[data.method].join(", ");
      throw new Error(
        `A combinação ${data.method} + ${provider} ainda não possui adapter implementado. Use: ${supported}.`,
      );
    }

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
