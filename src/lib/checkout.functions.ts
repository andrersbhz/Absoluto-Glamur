import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const onlyDigits = (value: string) => value.replace(/\D/g, "");

const AddressSchema = z.object({
  country: z.string().length(2).default("BR"),
  zipCode: z.string().trim().min(3).max(20),
  street: z.string().min(2),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  district: z.string().min(2),
  city: z.string().min(2),
  state: z.string().trim().min(1).max(80),
});

const CheckoutItemsSchema = z
  .array(
    z.object({
      variantId: z.string().uuid(),
      quantity: z.number().int().min(1).max(99),
    }),
  )
  .min(1)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.variantId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A mesma variação não pode aparecer duplicada no checkout.",
          path: [index, "variantId"],
        });
      }
      seen.add(item.variantId);
    });
  });

const CheckoutSchema = z.object({
  items: CheckoutItemsSchema,
  customer: z.object({
    name: z.string().trim().min(2),
    email: z.string().trim().email(),
    document: z.string().optional().default("").refine((value) => {
      const size = onlyDigits(value).length;
      return size === 0 || size === 11 || size === 14;
    }, "Documento inválido"),
    phone: z.string().refine((value) => {
      const size = onlyDigits(value).length;
      return size >= 8 && size <= 15;
    }, "Telefone inválido"),
  }),
  address: AddressSchema,
  saveAddress: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
  method: z
    .enum([
      "pix",
      "credit_card",
      "boleto",
      "nubank_redirect",
      "paypal",
      "ebanx_card",
      "ebanx_boleto",
    ])
    .optional(),
  returnUrl: z.string().url().optional(),
}).superRefine((value, ctx) => {
  if (value.address.country === "BR" && ![11, 14].includes(onlyDigits(value.customer.document).length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CPF/CNPJ é obrigatório no Brasil", path: ["customer", "document"] });
  if (value.address.country === "BR" && onlyDigits(value.address.zipCode).length !== 8) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CEP inválido", path: ["address", "zipCode"] });
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
  aliexpress_product_id?: string | null;
  aliexpress_sku_attr?: string | null;
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

    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("api_key, api_secret, mode, enabled, webhook_token, config")
      .eq("provider", provider)
      .maybeSingle();
    if (!integ?.enabled || !integ.api_key) {
      throw new Error(
        `Provedor "${provider}" não está configurado. Peça ao administrador para configurá-lo em Admin → Integrações.`,
      );
    }
    if (["asaas", "nupay", "pagbank", "ebanx", "mercadopago"].includes(provider) && !integ.webhook_token) {
      throw new Error(
        `Configure o Token do webhook de ${provider} em Admin → Integrações antes de receber pagamentos.`,
      );
    }

    const variantIds = data.items.map((i) => i.variantId);
    const { data: variants, error: varErr } = await supabaseAdmin
      .from("product_variants")
      .select(
        `id, name, sku, external_sku_id, external_sku_attr, options, is_available,
         product:products!inner(id, slug, name, status),
         prices:product_prices(list_price_cents, sale_price_cents, is_active),
         inventory:product_inventory(stock, reserved),
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
      options: {
        attributes?: Record<string, string>;
        image_url?: string | null;
        source_id?: string | null;
      } | null;
      is_available: boolean | null;
      product: { id: string; slug: string; name: string; status: string };
      prices:
        | { list_price_cents: number; sale_price_cents: number | null; is_active: boolean }[]
        | null;
      inventory: { stock: number; reserved: number } | null;
      media: { url: string; position: number | null; kind: string | null }[] | null;
    };
    const vmap = new Map<string, VariantRow>();
    (variants as unknown as VariantRow[] | null)?.forEach((v) => vmap.set(v.id, v));

    const productIds = Array.from(
      new Set(
        Array.from(vmap.values())
          .map((v) => v.product?.id)
          .filter((id): id is string => !!id),
      ),
    );
    const externalByProduct = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: imports } = await supabaseAdmin
        .from("product_imports")
        .select("product_id, source_id, updated_at")
        .in("product_id", productIds)
        .in("source", ["aliexpress", "aliexpress_api", "aliexpress_url"])
        .not("source_id", "is", null)
        .order("updated_at", { ascending: false });
      for (const imp of imports ?? []) {
        if (imp.product_id && imp.source_id && !externalByProduct.has(imp.product_id)) {
          externalByProduct.set(imp.product_id, String(imp.source_id));
        }
      }
    }

    const orderItems: OrderItemInsert[] = data.items.map((i) => {
      const v = vmap.get(i.variantId);
      if (!v || v.product?.status !== "active") {
        throw new Error("Um dos produtos não está mais disponível.");
      }
      if (v.is_available === false) {
        throw new Error(`A variação escolhida de ${v.product.name} não está mais disponível.`);
      }
      const availableStock = Math.max(0, (v.inventory?.stock ?? 0) - (v.inventory?.reserved ?? 0));
      if (availableStock < i.quantity) {
        throw new Error(
          availableStock > 0
            ? `Estoque insuficiente para ${v.product.name}. Disponível: ${availableStock}.`
            : `${v.product.name} está fora de estoque.`,
        );
      }
      const price = (v.prices ?? []).find((p) => p.is_active) ?? v.prices?.[0];
      if (!price) throw new Error(`Preço não configurado para ${v.product.name}`);
      const unit =
        price.sale_price_cents &&
        price.sale_price_cents > 0 &&
        price.sale_price_cents < price.list_price_cents
          ? price.sale_price_cents
          : price.list_price_cents;
      const media = (v.media ?? []).filter((m) => m.kind !== "video");
      const image =
        v.options?.image_url ??
        [...media].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.url ??
        null;
      const attrs = v.options?.attributes ?? null;
      const variantName =
        v.name ??
        (attrs && Object.keys(attrs).length > 0 ? Object.values(attrs).join(" · ") : null);
      const externalProductId =
        (v.options?.source_id ? String(v.options.source_id) : null) ??
        externalByProduct.get(v.product.id) ??
        null;
      return {
        product_id: v.product.id,
        variant_id: v.id,
        product_name: v.product.name,
        variant_name: variantName,
        slug: v.product.slug,
        image_url: image,
        unit_cents: unit,
        quantity: i.quantity,
        total_cents: unit * i.quantity,
        aliexpress_product_id: externalProductId,
        aliexpress_sku_attr: v.external_sku_attr ?? null,
      };
    });

    const subtotal = orderItems.reduce((s, i) => s + i.total_cents, 0);
    const { computeShipping } = await import("./shipping.server");
    const shipQuote = await computeShipping(
      supabaseAdmin,
      data.address.country === "BR" ? onlyDigits(data.address.zipCode) : "",
      orderItems.map((i) => ({ productId: i.product_id, quantity: i.quantity, unitCents: i.unit_cents })),
    );
    const shipping = shipQuote.cents;
    const total = subtotal + shipping;
    if (total < 100) throw new Error("Valor mínimo do pedido é R$ 1,00.");

    const { data: codeData } = await supabaseAdmin.rpc("generate_order_code");
    const code = (codeData as unknown as string) ?? `BL-${Date.now()}`;
    const document = onlyDigits(data.customer.document);
    const phone = onlyDigits(data.customer.phone);

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        code,
        user_id: context.userId,
        status: "awaiting_payment",
        subtotal_cents: subtotal,
        shipping_cents: shipping,
        shipping_details: shipQuote,
        total_cents: total,
        customer_name: data.customer.name,
        customer_email: data.customer.email,
        customer_document: document,
        customer_phone: phone,
        currency: "BRL",
        shipping_address: { ...data.address, zipCode: data.address.country === "BR" ? onlyDigits(data.address.zipCode) : data.address.zipCode.trim(), state: data.address.state.toUpperCase() },
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
        country: data.address.country,
        zip_code: data.address.country === "BR" ? onlyDigits(data.address.zipCode) : data.address.zipCode.trim(),
        street: data.address.street,
        number: data.address.number,
        complement: data.address.complement ?? null,
        district: data.address.district,
        city: data.address.city,
        state: data.address.state.toUpperCase(),
      });
    }

    const normalizedData: CheckoutInput = {
      ...data,
      customer: { ...data.customer, document, phone },
      address: { ...data.address, zipCode: data.address.country === "BR" ? onlyDigits(data.address.zipCode) : data.address.zipCode.trim(), state: data.address.state.toUpperCase() },
    };
    const ctx: OrderContext = { orderId: order.id, code: order.code, total, document, phone, data: normalizedData };

    try {
      if (provider === "pix_manual" && method === "pix") {
        return await handleManualPix(ctx, integ);
      }
      if (provider === "nowhubpay" && method === "pix") {
        return await handleNowHubPix(ctx, integ);
      }
      if (provider === "amplopay" && method === "pix") {
        return await handleAmploPayPix(ctx, integ);
      }
      if (provider === "asaas" && method === "pix") {
        return await handleAsaasPix(ctx, integ);
      }
      if (provider === "asaas" && method === "boleto") {
        return await handleAsaasBoleto(ctx, integ);
      }
      if (provider === "nupay" && method === "nubank_redirect") {
        return await handleNuPayRedirect(ctx, integ);
      }
      if (provider === "paypal" && method === "paypal") {
        return await handlePayPalCheckout(ctx, integ);
      }
      if (provider === "ebanx" && (method === "ebanx_card" || method === "ebanx_boleto")) {
        return await handleEbanxCheckout(ctx, integ, method);
      }
      if (provider === "pagbank") {
        return await handlePagBankCheckout(ctx, integ, method);
      }
      if (provider === "mercadopago" && ["pix", "credit_card", "boleto"].includes(method)) {
        return await handleMercadoPagoCheckout(ctx, integ, method);
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

export const createPixCheckout = createCheckout;

// PIX direto (sem intermediador): gera o BR Code com a chave da loja.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleManualPix(ctx: OrderContext, integ: any) {
  const { buildPixPayload } = await import("./pix-brcode");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cfg = (integ.config ?? {}) as { merchant_name?: string; merchant_city?: string };
  const payload = buildPixPayload({
    key: String(integ.api_key ?? ""),
    merchantName: cfg.merchant_name ?? "LOJA",
    merchantCity: cfg.merchant_city ?? "SAO PAULO",
    amountCents: ctx.total,
    txid: ctx.code.replace(/[^A-Za-z0-9]/g, "").slice(0, 25),
  });

  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "pix_manual",
    method: "pix",
    status: "pending",
    amount_cents: ctx.total,
    external_id: ctx.code,
    pix_payload: payload,
    pix_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: { pix_key_owner: cfg.merchant_name ?? null } as any,
  });
  if (error) throw new Error(error.message);
  return { orderId: ctx.orderId, code: ctx.code, method: "pix" as const };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleNowHubPix(ctx: OrderContext, integ: any) {
  const { nowhubFetch } = await import("./nowhubpay.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const secret = (integ.config as { merchant_key?: string } | null)?.merchant_key;
  if (!secret) throw new Error("Preencha o Client Secret da NowHubPay em Admin → Integrações.");
  const { getRequest } = await import("@tanstack/react-start/server");
  const origin = new URL(getRequest().url).origin;
  const r = await nowhubFetch<{
    transaction_id?: string;
    status?: string;
    pix_copy_paste?: string;
    pix_qr_code?: string;
  }>({ clientId: integ.api_key as string, clientSecret: secret }, "/v1/payments/deposit", {
    method: "POST",
    body: JSON.stringify({
      amount: Number((ctx.total / 100).toFixed(2)),
      external_id: ctx.orderId,
      payer: { name: ctx.data.customer.name, document: ctx.document },
      clientCallbackUrl: `${origin}/api/public/webhooks/nowhubpay`,
    }),
  });
  if (!r.transaction_id || !r.pix_copy_paste) throw new Error("NowHubPay não retornou um PIX válido.");
  let image = r.pix_qr_code ?? null;
  if (image && image.startsWith("data:")) image = image.split(",")[1] ?? image;
  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "nowhubpay",
    method: "pix",
    status: "pending",
    amount_cents: ctx.total,
    external_id: r.transaction_id,
    pix_qr_code: image,
    pix_payload: r.pix_copy_paste,
    pix_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: { ...r, pix_qr_code: undefined } as any,
  });
  if (error) throw new Error(error.message);
  return { orderId: ctx.orderId, code: ctx.code, method: "pix" as const };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAmploPayPix(ctx: OrderContext, integ: any) {
  const { amplopayFetch, parseAmploPayPix } = await import("./amplopay.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const secret = (integ.config as { merchant_key?: string } | null)?.merchant_key;
  if (!secret) throw new Error("Preencha o Client Secret da AmploPay em Admin → Integrações.");
  const { getRequest } = await import("@tanstack/react-start/server");
  const origin = new URL(getRequest().url).origin;
  const r = await amplopayFetch<Record<string, unknown>>(
    { clientId: integ.api_key as string, clientSecret: secret },
    "/gateway/pix/receive",
    {
      method: "POST",
      body: JSON.stringify({
        identifier: ctx.orderId,
        amount: Number((ctx.total / 100).toFixed(2)),
        client: {
          name: ctx.data.customer.name,
          email: ctx.data.customer.email,
          phone: ctx.phone,
          document: ctx.document,
        },
        products: [
          { id: ctx.orderId, name: `Pedido ${ctx.code}`, quantity: 1, price: Number((ctx.total / 100).toFixed(2)) },
        ],
        callbackUrl: `${origin}/api/public/webhooks/amplopay`,
      }),
    },
  );
  const pix = parseAmploPayPix(r);
  if (!pix.id || !pix.code) throw new Error("AmploPay não retornou um PIX válido.");

  const expiresAt = pix.expiresAt && !Number.isNaN(Date.parse(pix.expiresAt))
    ? new Date(pix.expiresAt).toISOString()
    : new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "amplopay",
    method: "pix",
    status: "pending",
    amount_cents: ctx.total,
    external_id: pix.id,
    pix_qr_code: pix.image,
    pix_payload: pix.code,
    pix_expires_at: expiresAt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: r as any,
  });
  if (error) throw new Error(error.message);
  return { orderId: ctx.orderId, code: ctx.code, method: "pix" as const };
}

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
  if (!pix.encodedImage || !pix.payload) {
    throw new Error("Asaas não retornou QR Code PIX válido.");
  }

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
  const boletoUrl = charge.bankSlipUrl ?? charge.invoiceUrl ?? null;
  if (!boletoUrl) throw new Error("Asaas não retornou URL do boleto.");

  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "asaas",
    method: "boleto",
    status: "pending",
    amount_cents: ctx.total,
    external_id: charge.id,
    external_customer_id: customer.id,
    invoice_url: boletoUrl,
    redirect_url: boletoUrl,
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
  if (!redirect) throw new Error("NuPay não retornou URL de pagamento.");

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
    (integ.config?.checkout_origin as string | undefined) ?? "https://www.absolutoglamur.com.br";
  const returnUrl = ctx.data.returnUrl ?? `${origin}/checkout/${ctx.orderId}`;
  const notificationUrl = `${origin}/api/public/webhooks/pagbank`;

  const pmType = pagbankMethodType(method as "pix" | "credit_card" | "boleto");

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
  if (!redirect) throw new Error("PagBank não retornou URL de pagamento.");

  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "pagbank",
    method: method as any,
    status: "pending",
    amount_cents: ctx.total,
    external_id: session.id,
    session_id: session.id,
    redirect_url: redirect,
    return_url: returnUrl,
    invoice_url: redirect,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePayPalCheckout(ctx: OrderContext, integ: any) {
  const { createPayPalOrder } = await import("./paypal.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const clientId = (integ.api_key as string | null) ?? "";
  const clientSecret = (integ.api_secret as string | null) ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("Configure o Client ID e o Secret do PayPal em Admin → Integrações.");
  }

  const origin =
    (integ.config?.checkout_origin as string | undefined) ?? "https://www.absolutoglamur.com.br";
  const returnUrl = ctx.data.returnUrl ?? `${origin}/checkout/${ctx.orderId}`;
  const currency = (integ.config?.currency as string | undefined) ?? "BRL";

  const { order, approveUrl } = await createPayPalOrder(
    {
      clientId,
      clientSecret,
      env: (integ.mode as "sandbox" | "production") ?? "sandbox",
    },
    {
      referenceId: ctx.orderId,
      description: `Pedido ${ctx.code} · Absoluto Glamur`,
      amountCents: ctx.total,
      currency,
      returnUrl,
      cancelUrl: returnUrl,
    },
  );

  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "paypal",
    method: "paypal",
    status: "pending",
    amount_cents: ctx.total,
    external_id: order.id,
    session_id: order.id,
    redirect_url: approveUrl,
    return_url: returnUrl,
    raw: order as any,
  });
  if (error) throw new Error(error.message);

  return {
    orderId: ctx.orderId,
    code: ctx.code,
    method: "paypal" as const,
    redirectUrl: approveUrl,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEbanxCheckout(ctx: OrderContext, integ: any, method: string) {
  const { createEbanxPayment } = await import("./ebanx.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const integrationKey = (integ.api_key as string | null) ?? "";
  if (!integrationKey) {
    throw new Error("Configure a Integration Key do EBANX em Admin → Integrações.");
  }

  const origin =
    (integ.config?.checkout_origin as string | undefined) ?? "https://www.absolutoglamur.com.br";
  const returnUrl = ctx.data.returnUrl ?? `${origin}/checkout/${ctx.orderId}`;
  const currency = (integ.config?.currency as string | undefined) ?? "BRL";
  const country = (integ.config?.country as string | undefined) ?? "br";

  const result = await createEbanxPayment(
    { integrationKey, env: (integ.mode as "sandbox" | "production") ?? "sandbox" },
    {
      merchantPaymentCode: ctx.code,
      amountCents: ctx.total,
      currency,
      countryCode: country,
      paymentType: method === "ebanx_boleto" ? "boleto" : "creditcard",
      customer: {
        name: ctx.data.customer.name,
        email: ctx.data.customer.email,
        document: ctx.document,
        phone: ctx.phone,
      },
      address: {
        street: ctx.data.address.street,
        number: ctx.data.address.number,
        complement: ctx.data.address.complement ?? null,
        district: ctx.data.address.district,
        city: ctx.data.address.city,
        state: ctx.data.address.state,
        zipCode: ctx.data.address.zipCode,
      },
      returnUrl,
    },
  );

  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId,
    provider: "ebanx",
    method: method as any,
    status: "pending",
    amount_cents: ctx.total,
    external_id: result.hash,
    session_id: result.hash,
    redirect_url: result.redirectUrl,
    invoice_url: result.boletoUrl,
    return_url: returnUrl,
    raw: result.raw as any,
  });
  if (error) throw new Error(error.message);

  return {
    orderId: ctx.orderId,
    code: ctx.code,
    method: method as "ebanx_card" | "ebanx_boleto",
    redirectUrl: result.redirectUrl ?? undefined,
  };
}

// Mercado Pago Checkout Pro oferece PIX, cartão, boleto e saldo em um único fluxo hospedado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMercadoPagoCheckout(ctx: OrderContext, integ: any, method: string) {
  const { createMercadoPagoPreference } = await import("./mercadopago.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const origin = (integ.config?.checkout_origin as string | undefined) ?? "https://www.absolutoglamur.com.br";
  const returnUrl = ctx.data.returnUrl ?? `${origin}/checkout/${ctx.orderId}`;
  const notificationUrl = `${origin}/api/public/webhooks/mercadopago`;
  const result = await createMercadoPagoPreference({ accessToken: integ.api_key }, {
    orderId: ctx.orderId, code: ctx.code, amountCents: ctx.total, currency: "BRL",
    customer: { name: ctx.data.customer.name, email: ctx.data.customer.email },
    returnUrl, notificationUrl, sandbox: integ.mode !== "production",
  });
  const { error } = await supabaseAdmin.from("payments").insert({
    order_id: ctx.orderId, provider: "mercadopago", method: method as any, status: "pending",
    amount_cents: ctx.total, external_id: result.preference.id, session_id: result.preference.id,
    redirect_url: result.redirectUrl, return_url: returnUrl,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: result.preference as any,
  });
  if (error) throw new Error(error.message);
  return { orderId: ctx.orderId, code: ctx.code, method: method as "pix" | "credit_card" | "boleto", redirectUrl: result.redirectUrl };
}
