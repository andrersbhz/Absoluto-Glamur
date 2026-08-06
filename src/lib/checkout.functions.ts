import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AddressSchema = z.object({
  zipCode: z.string().min(8),
  street: z.string().min(2),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  district: z.string().min(2),
  city: z.string().min(2),
  state: z.string().length(2),
});

const CheckoutSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1),
  customer: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    document: z.string().min(11),
    phone: z.string().min(8),
  }),
  address: AddressSchema,
  saveAddress: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
  method: z.enum(["pix", "credit_card", "boleto", "nubank_redirect"]).optional(),
  returnUrl: z.string().url().optional(),
});
export type CheckoutInput = z.infer<typeof CheckoutSchema>;

type OrderItemInsert = {
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string | null;
  slug: string;
  image_url: string | null;
  unit_cents: number;
  quantity: number;
  total_cents: number;
};

type OrderContext = {
  orderId: string;
  code: string;
  total: number;
  document: string;
  phone: string;
  data: CheckoutInput;
};

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CheckoutSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const method = data.method ?? "pix";

    // 1) Resolver provedor via routing table
    const { data: route } = await supabaseAdmin
      .from("payment_method_routing")
      .select("provider, enabled")
      .eq("method", method)
      .maybeSingle();
    if (!route?.enabled) {
      throw new Error(
        `Método "${method}" não está habilitado. Peça ao administrador para ativar em Admin → Integrações.`,
      );
    }
    const provider = route.provider;

    // 2) Carrega credenciais do provedor
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("api_key, mode, enabled, webhook_token, config")
      .eq("provider", provider)
      .maybeSingle();
    if (!integ?.enabled || !integ.api_key) {
      throw new Error(
        `Provedor "${provider}" não está configurado. Peça ao administrador para configurá-lo em Admin → Integrações.`,
      );
    }

    // 3) Preços autoritativos + itens
    const variantIds = data.items.map((i) => i.variantId);
    const { data: variants, error: varErr } = await supabaseAdmin
      .from("product_variants")
      .select(
        `id, name, sku, external_sku_id, external_sku_attr, options, is_available,
         product:products!inner(id, slug, name, status),
         prices:product_prices(list_price_cents, sale_price_cents, is_active),
         media:product_media(url, position, kind)`,
      )
      .in("id", variantIds);
    if (varErr) throw new Error(varErr.message);

    type VariantRow = {
      id: string;
      name: string | null;
      sku: string | null;
      external_sku_id: string | null;
      external_sku_attr: string | null;
      options: { attributes?: Record<string, string>; image_url?: string | null } | null;
      is_available: boolean | null;
      product: { id: string; slug: string; name: string; status: string };
      prices: { list_price_cents: number; sale_price_cents: number | null; is_active: boolean }[] | null;
      media: { url: string; position: number | null; kind: string | null }[] | null;
    };
    const vmap = new Map<string, VariantRow>();
    (variants as unknown as VariantRow[] | null)?.forEach((v) => vmap.set(v.id, v));

    const orderItems: OrderItemInsert[] = data.items.map((i) => {
      const v = vmap.get(i.variantId);
      if (!v || v.product?.status !== "active") {
        throw new Error("Um dos produtos não está mais disponível.");
      }
      const price = (v.prices ?? []).find((p) => p.is_active) ?? v.prices?.[0];
      if (!price) throw new Error(`Preço não configurado para ${v.product.name}`);
      const unit =
        price.sale_price_cents && price.sale_price_cents > 0 && price.sale_price_cents < price.list_price_cents
          ? price.sale_price_cents
          : price.list_price_cents;
      const media = (v.media ?? []).filter((m) => m.kind !== "video");
      const image =
        [...media].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.url ?? null;
      return {
        product_id: v.product.id,
        variant_id: v.id,
        product_name: v.product.name,
        variant_name: v.name,
        slug: v.product.slug,
        image_url: image,
        unit_cents: unit,
        quantity: i.quantity,
        total_cents: unit * i.quantity,
      };
    });

    const subtotal = orderItems.reduce((s, i) => s + i.total_cents, 0);
    const shipping = 0;
    const total = subtotal + shipping;
    if (total < 100) throw new Error("Valor mínimo do pedido é R$ 1,00.");

    // 4) Cria pedido
    const { data: codeData } = await supabaseAdmin.rpc("generate_order_code");
    const code = (codeData as unknown as string) ?? `BL-${Date.now()}`;
    const document = data.customer.document.replace(/\D/g, "");
    const phone = data.customer.phone.replace(/\D/g, "");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        code,
        user_id: context.userId,
        status: "awaiting_payment",
        subtotal_cents: subtotal,
        shipping_cents: shipping,
        total_cents: total,
        customer_name: data.customer.name,
        customer_email: data.customer.email,
        customer_document: document,
        customer_phone: phone,
        shipping_address: data.address,
        notes: data.notes ?? null,
      })
      .select("id, code")
      .single();
    if (orderErr) throw new Error(orderErr.message);

    const { error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems.map((i) => ({ order_id: order.id, ...i })));
    if (itemsErr) throw new Error(itemsErr.message);

    if (data.saveAddress) {
      await supabaseAdmin.from("addresses").insert({
        user_id: context.userId,
        recipient_name: data.customer.name,
        document,
        phone,
        zip_code: data.address.zipCode,
        street: data.address.street,
        number: data.address.number,
        complement: data.address.complement ?? null,
        district: data.address.district,
        city: data.address.city,
        state: data.address.state,
      });
    }

    const ctx: OrderContext = { orderId: order.id, code: order.code, total, document, phone, data };

    // 5) Dispatch para o adapter certo
    try {
      if (provider === "asaas" && method === "pix") {
        return await handleAsaasPix(ctx, integ);
      }
      if (provider === "asaas" && method === "boleto") {
        return await handleAsaasBoleto(ctx, integ);
      }
      if (provider === "nupay" && method === "nubank_redirect") {
        return await handleNuPayRedirect(ctx, integ);
      }
      if (provider === "pagbank") {
        return await handlePagBankCheckout(ctx, integ, method);
      }
      throw new Error(
        `Combinação provedor="${provider}" + método="${method}" ainda não é suportada.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("orders")
        .update({ status: "failed", notes: `Falha no gateway: ${msg}` })
        .eq("id", order.id);
      throw new Error(`Não conseguimos iniciar o pagamento: ${msg}`);
    }
  });

/** Backward-compat: rota antiga /checkout continua chamando createPixCheckout. */
export const createPixCheckout = createCheckout;

// ------------ Adapters ------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAsaasPix(ctx: OrderContext, integ: any) {
  const { asaasFetch } = await import("./asaas.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cfg = {
    apiKey: integ.api_key as string,
    env: (integ.mode as "sandbox" | "production") ?? "sandbox",
  };

  const customer = await asaasFetch<{ id: string }>(cfg, "/customers", {
    method: "POST",
    body: JSON.stringify({
      name: ctx.data.customer.name,
      email: ctx.data.customer.email,
      cpfCnpj: ctx.document,
      mobilePhone: ctx.phone,
      externalReference: ctx.orderId,
    }),
  });
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const charge = await asaasFetch<{ id: string; invoiceUrl?: string }>(cfg, "/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customer.id,
      billingType: "PIX",
      value: ctx.total / 100,
      dueDate: due,
      description: `Pedido ${ctx.code} · Absoluto Glamur Cosméticos`,
      externalReference: ctx.orderId,
    }),
  });
  const pix = await asaasFetch<{ encodedImage: string; payload: string; expirationDate?: string }>(
    cfg,
    `/payments/${charge.id}/pixQrCode`,
  );

  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "asaas",
    method: "pix",
    status: "pending",
    amount_cents: ctx.total,
    external_id: charge.id,
    external_customer_id: customer.id,
    pix_qr_code: pix.encodedImage,
    pix_payload: pix.payload,
    pix_expires_at: pix.expirationDate ? new Date(pix.expirationDate).toISOString() : null,
    invoice_url: charge.invoiceUrl ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: charge as any,
  });
  if (error) throw new Error(error.message);
  return { orderId: ctx.orderId, code: ctx.code, method: "pix" as const };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAsaasBoleto(ctx: OrderContext, integ: any) {
  const { asaasFetch } = await import("./asaas.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cfg = {
    apiKey: integ.api_key as string,
    env: (integ.mode as "sandbox" | "production") ?? "sandbox",
  };
  const customer = await asaasFetch<{ id: string }>(cfg, "/customers", {
    method: "POST",
    body: JSON.stringify({
      name: ctx.data.customer.name,
      email: ctx.data.customer.email,
      cpfCnpj: ctx.document,
      mobilePhone: ctx.phone,
    }),
  });
  const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const charge = await asaasFetch<{ id: string; invoiceUrl?: string; bankSlipUrl?: string }>(
    cfg,
    "/payments",
    {
      method: "POST",
      body: JSON.stringify({
        customer: customer.id,
        billingType: "BOLETO",
        value: ctx.total / 100,
        dueDate: due,
        description: `Pedido ${ctx.code} · Absoluto Glamur Cosméticos`,
        externalReference: ctx.orderId,
      }),
    },
  );

  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "asaas",
    method: "boleto",
    status: "pending",
    amount_cents: ctx.total,
    external_id: charge.id,
    external_customer_id: customer.id,
    invoice_url: charge.bankSlipUrl ?? charge.invoiceUrl ?? null,
    redirect_url: charge.bankSlipUrl ?? charge.invoiceUrl ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: charge as any,
  });
  if (error) throw new Error(error.message);
  return { orderId: ctx.orderId, code: ctx.code, method: "boleto" as const };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleNuPayRedirect(ctx: OrderContext, integ: any) {
  const { nupayFetch } = await import("./nupay.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const merchantKey = (integ.config?.merchant_key as string | undefined) ?? "";
  const merchantToken = integ.api_key as string;
  if (!merchantKey) {
    throw new Error("Configure a Merchant Key do NuPay em Admin → Integrações.");
  }
  const cfg = {
    merchantKey,
    merchantToken,
    env: (integ.mode as "sandbox" | "production") ?? "sandbox",
  };

  const returnUrl = ctx.data.returnUrl ?? `https://absolutoglamur.com.br/checkout/${ctx.orderId}`;
  // Docs: POST /checkout/v1/orders → cria sessão + URL de redirecionamento
  const session = await nupayFetch<{
    id: string;
    session_id?: string;
    redirect_url?: string;
    redirectUrl?: string;
    status?: string;
  }>(cfg, "/checkout/v1/orders", {
    method: "POST",
    body: JSON.stringify({
      reference_id: ctx.orderId,
      amount: { value: ctx.total, currency: "BRL" },
      customer: {
        name: ctx.data.customer.name,
        email: ctx.data.customer.email,
        tax_id: ctx.document,
        phone: ctx.phone,
      },
      description: `Pedido ${ctx.code} · Absoluto Glamur Cosméticos`,
      return_url: returnUrl,
    }),
  });

  const redirect = session.redirect_url ?? session.redirectUrl ?? null;

  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "nupay",
    method: "nubank_redirect",
    status: "pending",
    amount_cents: ctx.total,
    external_id: session.id,
    session_id: session.session_id ?? session.id,
    redirect_url: redirect,
    return_url: returnUrl,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: session as any,
  });
  if (error) throw new Error(error.message);

  return {
    orderId: ctx.orderId,
    code: ctx.code,
    method: "nubank_redirect" as const,
    redirectUrl: redirect,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePagBankCheckout(ctx: OrderContext, integ: any, method: string) {
  const { pagbankFetch, pagbankMethodType } = await import("./pagbank.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cfg = {
    token: integ.api_key as string,
    env: (integ.mode as "sandbox" | "production") ?? "sandbox",
  };

  const origin =
    (integ.config?.checkout_origin as string | undefined) ??
    "https://www.absolutoglamur.com.br";
  const returnUrl = ctx.data.returnUrl ?? `${origin}/checkout/${ctx.orderId}`;
  const notificationUrl = `${origin}/api/public/webhooks/pagbank`;

  const pmType = pagbankMethodType(method as "pix" | "credit_card" | "boleto");

  // POST /checkouts — cria sessão de checkout hospedado.
  // Docs: https://developer.pagbank.com.br/reference/criar-checkout
  const session = await pagbankFetch<{
    id: string;
    checkout_url?: string;
    payment_url?: string;
    links?: { rel: string; href: string; media?: string }[];
  }>(cfg, "/checkouts", {
    method: "POST",
    body: JSON.stringify({
      reference_id: ctx.orderId,
      expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      customer: {
        name: ctx.data.customer.name,
        email: ctx.data.customer.email,
        tax_id: ctx.document,
        phones: [
          {
            country: "55",
            area: ctx.phone.slice(0, 2) || "11",
            number: ctx.phone.slice(2) || ctx.phone,
            type: "MOBILE",
          },
        ],
      },
      items: [
        {
          reference_id: ctx.code,
          name: `Pedido ${ctx.code} · Absoluto Glamur`,
          quantity: 1,
          unit_amount: ctx.total,
        },
      ],
      payment_methods: [{ type: pmType }],
      redirect_url: returnUrl,
      return_url: returnUrl,
      notification_urls: [notificationUrl],
      customer_modifiable: false,
    }),
  });

  const redirect =
    session.checkout_url ??
    session.payment_url ??
    session.links?.find((l) => l.rel === "PAY" || l.rel === "CHECKOUT")?.href ??
    session.links?.[0]?.href ??
    null;

  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "pagbank",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    method: method as any,
    status: "pending",
    amount_cents: ctx.total,
    external_id: session.id,
    session_id: session.id,
    redirect_url: redirect,
    return_url: returnUrl,
    invoice_url: redirect,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: session as any,
  });
  if (error) throw new Error(error.message);

  return {
    orderId: ctx.orderId,
    code: ctx.code,
    method: method as "pix" | "credit_card" | "boleto",
    redirectUrl: redirect,
  };
}
