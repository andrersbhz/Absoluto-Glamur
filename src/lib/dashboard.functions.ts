import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertAdmin(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!adm) throw new Error("Acesso restrito a administradores");
}

export type DashboardMetrics = {
  revenue_cents_30d: number;
  orders_30d: number;
  paid_orders_30d: number;
  aov_cents: number;
  conversion_rate: number;
  orders_pending: number;
  products_active: number;
  products_draft: number;
  customers_total: number;
  new_customers_30d: number;
  ai_calls_30d: number;
  ai_tokens_30d: number;
  imports_total: number;
  sales_series: Array<{ day: string; revenue_cents: number; orders: number }>;
  orders_by_status: Array<{ status: string; count: number }>;
  top_products: Array<{ product_name: string; qty: number; revenue_cents: number }>;
  usage_limits: {
    database_rows: number;
    database_rows_limit: number;
    storage_bytes: number;
    storage_bytes_limit: number;
    monthly_active_users: number;
    mau_limit: number;
  };
};

const FREE_LIMITS = {
  database_rows_limit: 500_000,
  storage_bytes_limit: 1_073_741_824,
  mau_limit: 50_000,
};

export const getDashboardMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardMetrics> => {
    await assertAdmin(context);
    const db = context.supabase;
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [
      ordersRes,
      pendingRes,
      productsActiveRes,
      productsDraftRes,
      customersTotalRes,
      newCustomersRes,
      aiRes,
      importsRes,
      orderItemsRes,
    ] = await Promise.all([
      db.from("orders").select("id, status, total_cents, created_at, paid_at").gte("created_at", since30),
      db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
      db.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
      db.from("products").select("id", { count: "exact", head: true }).eq("status", "draft"),
      db.from("profiles").select("id", { count: "exact", head: true }),
      db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since30),
      db.from("ai_generations").select("id, total_tokens").gte("created_at", since30),
      db.from("product_imports").select("id", { count: "exact", head: true }),
      db.from("order_items").select("product_name, quantity, total_cents, created_at").gte("created_at", since30),
    ]);

    const errors = [ordersRes, pendingRes, productsActiveRes, productsDraftRes, customersTotalRes, newCustomersRes, aiRes, importsRes, orderItemsRes]
      .map((r: any) => r.error)
      .filter(Boolean);
    if (errors.length) throw new Error(errors[0].message ?? String(errors[0]));

    const orders = ordersRes.data ?? [];
    const paid = orders.filter((o: any) => o.status === "paid" || o.paid_at);
    const revenue_cents_30d = paid.reduce((s: number, o: any) => s + (o.total_cents ?? 0), 0);
    const aov_cents = paid.length ? Math.round(revenue_cents_30d / paid.length) : 0;
    const conversion_rate = orders.length ? paid.length / orders.length : 0;

    const seriesMap = new Map<string, { revenue_cents: number; orders: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      seriesMap.set(d, { revenue_cents: 0, orders: 0 });
    }
    for (const o of paid as any[]) {
      const day = (o.paid_at ?? o.created_at).slice(0, 10);
      const cur = seriesMap.get(day);
      if (cur) {
        cur.revenue_cents += o.total_cents ?? 0;
        cur.orders += 1;
      }
    }
    const sales_series = Array.from(seriesMap.entries()).map(([day, v]) => ({ day, ...v }));

    const statusMap = new Map<string, number>();
    for (const o of orders as any[]) statusMap.set(o.status, (statusMap.get(o.status) ?? 0) + 1);
    const orders_by_status = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

    const prodMap = new Map<string, { qty: number; revenue_cents: number }>();
    for (const it of (orderItemsRes.data ?? []) as any[]) {
      const key = it.product_name ?? "—";
      const cur = prodMap.get(key) ?? { qty: 0, revenue_cents: 0 };
      cur.qty += it.quantity ?? 0;
      cur.revenue_cents += it.total_cents ?? 0;
      prodMap.set(key, cur);
    }
    const top_products = Array.from(prodMap.entries())
      .map(([product_name, v]) => ({ product_name, ...v }))
      .sort((a, b) => b.revenue_cents - a.revenue_cents)
      .slice(0, 10);

    const ai = aiRes.data ?? [];
    const ai_tokens_30d = ai.reduce((s: number, r: any) => s + (r.total_tokens ?? 0), 0);

    const rowTables = ["orders", "products", "profiles", "ai_generations", "product_imports", "order_items"] as const;
    let database_rows = 0;
    for (const t of rowTables) {
      const { count, error } = await (db.from(t) as any).select("id", { count: "exact", head: true });
      if (!error) database_rows += count ?? 0;
    }

    return {
      revenue_cents_30d,
      orders_30d: orders.length,
      paid_orders_30d: paid.length,
      aov_cents,
      conversion_rate,
      orders_pending: pendingRes.count ?? 0,
      products_active: productsActiveRes.count ?? 0,
      products_draft: productsDraftRes.count ?? 0,
      customers_total: customersTotalRes.count ?? 0,
      new_customers_30d: newCustomersRes.count ?? 0,
      ai_calls_30d: ai.length,
      ai_tokens_30d,
      imports_total: importsRes.count ?? 0,
      sales_series,
      orders_by_status,
      top_products,
      usage_limits: {
        database_rows,
        database_rows_limit: FREE_LIMITS.database_rows_limit,
        storage_bytes: 0,
        storage_bytes_limit: FREE_LIMITS.storage_bytes_limit,
        monthly_active_users: newCustomersRes.count ?? 0,
        mau_limit: FREE_LIMITS.mau_limit,
      },
    };
  });

export const exportOrdersCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await db
      .from("orders")
      .select("code, status, customer_name, customer_email, total_cents, currency, created_at, paid_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const header = ["code", "status", "customer_name", "customer_email", "total_cents", "currency", "created_at", "paid_at"];
    const rows = (data ?? []).map((r: any) =>
      header.map((h) => {
        const v = r[h];
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(","),
    );
    return { csv: [header.join(","), ...rows].join("\n"), count: rows.length };
  });
