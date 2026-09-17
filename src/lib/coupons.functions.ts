import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertStaff(context: any) {
  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (admin) return;
  const { data: catalog } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "catalog" });
  if (catalog) return;
  const { data: marketing } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "marketing" });
  if (!marketing) throw new Error("Acesso restrito à equipe");
}

export type Coupon = {
  id: string;
  code: string;
  percent: number;
  enabled: boolean;
  created_at: string;
};

export const listCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { data, error } = await context.supabase
      .from("coupons")
      .select("id,code,percent,enabled,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Coupon[];
  });

const CreateSchema = z.object({
  percent: z.number().min(0.01).max(100),
  code: z.string().trim().min(3).max(32).optional(),
});

function generateCode(): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CUPOM-${suffix}`;
}

export const createCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CreateSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const code = (data.code ?? generateCode()).toUpperCase().replace(/\s+/g, "");
    const { error } = await context.supabase.from("coupons").insert({
      code,
      percent: Math.round(data.percent * 100) / 100,
      enabled: true,
    });
    if (error) {
      if (error.message.includes("duplicate") || error.code === "23505") {
        throw new Error("Já existe um cupom com esse código");
      }
      throw new Error(error.message);
    }
    return { code };
  });

export const deleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { error } = await context.supabase.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
