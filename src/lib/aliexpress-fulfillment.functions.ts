import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAli } from "./aliexpress-discovery.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function assertLogistics(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasLog } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "logistics",
  });
  if (!hasLog) throw new Error("Acesso restrito a administradores ou equipe de logística");
}

type OrderAddress = {
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string | null;
  district?: string;
  city?: string;
  state?: string;
  country?: string;
};

type OrderRow = {
  id: string;
  code: string;
  customer_name: string;
  customer_email: string;
  customer_document: string;
  customer_phone: string | null;
  shipping_address: OrderAddress;
  fulfillment_status: string;
  order_items: Array<{
    id: string;
    product_id: string | null;
    variant_id: string | null;
    product_name: string;
    quantity: number;
    aliexpress_product_id: string | null;
    aliexpress_sku_attr: string | null;
  }>;
};

async function loadOrder(orderId: string): Promise<OrderRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, code, customer_name, customer_email, customer_document, customer_phone, shipping_address, fulfillment_status, order_items(id, product_id, variant_id, product_name, quantity, aliexpress_product_id, aliexpress_sku_attr)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Pedido ${orderId} não encontrado`);
  return data as unknown as OrderRow;
}

async function resolveItemMapping(
  item: OrderRow["order_items"][number],
): Promise<{ product_id: string; sku_attr: string | null; sku_id: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) Variação escolhida pelo cliente é sempre a fonte da verdade.
  type VariantMapping = {
    external_sku_id: string | null;
    external_sku_attr: string | null;
    options: { source_id?: string | null; sku_attr?: string | null } | null;
  };
  let variant: VariantMapping | null = null;
  if (item.variant_id) {
    const { data } = await supabaseAdmin
      .from("product_variants")
      .select("external_sku_id, external_sku_attr, options")
      .eq("id", item.variant_id)
      .maybeSingle();
    variant = (data as unknown as VariantMapping | null) ?? null;
  }

  const skuAttr =
    item.aliexpress_sku_attr ?? variant?.external_sku_attr ?? variant?.options?.sku_attr ?? null;
  const skuId = variant?.external_sku_id ?? null;

  // 2) product_id externo: congelado no pedido → variação → import do produto.
  let externalProductId: string | null =
    item.aliexpress_product_id ??
    (variant?.options?.source_id ? String(variant.options.source_id) : null);

  if (!externalProductId && item.product_id) {
    const { data: imp } = await supabaseAdmin
      .from("product_imports")
      .select("source_id")
      .eq("product_id", item.product_id)
      .in("source", ["aliexpress", "aliexpress_api", "aliexpress_url"])
      .not("source_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (imp?.source_id) externalProductId = String(imp.source_id);
  }

  if (!externalProductId) {
    throw new Error(
      `Item "${item.product_name}" não tem produto AliExpress vinculado. Informe o aliexpress_product_id do item antes de enviar.`,
    );
  }

  // 3) Nunca "chutar" um SKU: se o item tem variação, ela precisa estar mapeada.
  if (item.variant_id && !skuAttr && !skuId) {
    throw new Error(
      `Item "${item.product_name}" tem variação selecionada, mas sem SKU do AliExpress mapeado. Sincronize as variações do produto e tente novamente — enviar sem o SKU exato compraria a variação errada.`,
    );
  }

  return { product_id: externalProductId, sku_attr: skuAttr, sku_id: skuId };
}

function buildLogisticsAddress(o: OrderRow) {
  const a = o.shipping_address ?? {};
  const phone = (o.customer_phone ?? "").replace(/\D/g, "");
  const mobile = phone.length > 2 ? phone : "0000000000";
  return {
    contact_person: o.customer_name,
    full_name: o.customer_name,
    address:
      `${a.street ?? ""}, ${a.number ?? ""}${a.complement ? " - " + a.complement : ""}`.trim(),
    address2: a.district ?? "",
    city: a.city ?? "",
    province: a.state ?? "",
    country: (a.country ?? "BR").toUpperCase(),
    zip: (a.zipCode ?? "").replace(/\D/g, ""),
    mobile_no: mobile,
    phone_country: "+55",
    tax_number: (o.customer_document ?? "").replace(/\D/g, ""),
    locale: "pt_BR",
  };
}

async function sendOrderToAli(orderId: string) {
  const order = await loadOrder(orderId);
  if (order.fulfillment_status === "sent") {
    throw new Error(`Pedido ${order.code} já foi enviado ao AliExpress.`);
  }
  const productItems: any[] = [];
  for (const it of order.order_items ?? []) {
    const mapping = await resolveItemMapping(it);
    const entry: Record<string, any> = {
      product_id: Number(mapping.product_id) || mapping.product_id,
      product_count: it.quantity,
      logistics_service_name: "CAINIAO_STANDARD",
      order_memo: `Pedido ${order.code}`,
    };
    if (mapping.sku_attr) entry.sku_attr = mapping.sku_attr;
    if (mapping.sku_id) entry.sku_id = mapping.sku_id;
    productItems.push(entry);
  }
  const dto = {
    logistics_address: buildLogisticsAddress(order),
    product_items: productItems,
    out_order_id: order.code,
  };
  const response = await callAli<any>("aliexpress.ds.order.create", {
    ds_extend_request: JSON.stringify({}),
    param_place_order_request4_open_api_d_t_o: JSON.stringify(dto),
  });
  const result =
    response?.aliexpress_ds_order_create_response?.result ?? response?.result ?? response;
  const aeOrderId: string | null =
    result?.order_list?.number?.[0]?.toString?.() ??
    result?.order_list?.[0]?.toString?.() ??
    result?.order_id?.toString?.() ??
    null;
  const isError = result?.is_success === false || (!aeOrderId && result?.error_code);
  return { response, aeOrderId, result, isError, errorMsg: result?.error_msg ?? null };
}

async function persistFulfillment(
  orderId: string,
  status: "sent" | "failed",
  payload: {
    aeOrderId?: string | null;
    error?: string | null;
    response?: unknown;
  },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("orders")
    .update({
      fulfillment_provider: "aliexpress",
      fulfillment_status: status,
      fulfillment_order_id: payload.aeOrderId ?? null,
      fulfillment_error: payload.error ?? null,
      fulfillment_response: (payload.response as any) ?? null,
      fulfillment_sent_at: new Date().toISOString(),
    })
    .eq("id", orderId);
}

export const fulfillOrderToAliexpress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertLogistics(context);
    try {
      const { aeOrderId, response, isError, errorMsg } = await sendOrderToAli(data.orderId);
      if (isError || !aeOrderId) {
        const msg = errorMsg ?? "AliExpress não retornou um ID de pedido.";
        await persistFulfillment(data.orderId, "failed", { error: msg, response });
        return { ok: false as const, error: msg };
      }
      await persistFulfillment(data.orderId, "sent", { aeOrderId, response });
      return { ok: true as const, aeOrderId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await persistFulfillment(data.orderId, "failed", { error: msg });
      return { ok: false as const, error: msg };
    }
  });

export const fulfillOrdersBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orderIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertLogistics(context);
    const results: Array<{ orderId: string; ok: boolean; aeOrderId?: string; error?: string }> = [];
    for (const orderId of data.orderIds) {
      try {
        const { aeOrderId, response, isError, errorMsg } = await sendOrderToAli(orderId);
        if (isError || !aeOrderId) {
          const msg = errorMsg ?? "AliExpress não retornou um ID de pedido.";
          await persistFulfillment(orderId, "failed", { error: msg, response });
          results.push({ orderId, ok: false, error: msg });
        } else {
          await persistFulfillment(orderId, "sent", { aeOrderId, response });
          results.push({ orderId, ok: true, aeOrderId });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await persistFulfillment(orderId, "failed", { error: msg });
        results.push({ orderId, ok: false, error: msg });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    return {
      ok: true as const,
      total: results.length,
      sent: okCount,
      failed: results.length - okCount,
      results,
    };
  });

export const setOrderItemAliexpressMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        aliexpress_product_id: z.string().min(1).nullable(),
        aliexpress_sku_attr: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertLogistics(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("order_items")
      .update({
        aliexpress_product_id: data.aliexpress_product_id,
        aliexpress_sku_attr: data.aliexpress_sku_attr ?? null,
      })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
