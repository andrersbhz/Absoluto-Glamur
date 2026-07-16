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
});
export type CheckoutInput = z.infer<typeof CheckoutSchema>;


export const createPixCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CheckoutSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { asaasFetch } = await import("./asaas.server");

    // 1) Config Asaas
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("api_key, mode, enabled")
      .eq("provider", "asaas")
      .maybeSingle();
    if (!integ?.enabled || !integ.api_key) {
      throw new Error(
        "Pagamento indisponível. Peça ao administrador para configurar e ativar o Asaas em Integrações.",
      );
    }
    const asaasCfg = {
      apiKey: integ.api_key,
      env: (integ.mode as "sandbox" | "production") ?? "sandbox",
    };

    // 2) Preços autoritativos do banco (nunca confiar no cliente)
    const variantIds = data.items.map((i) => i.variantId);
    const { data: variants, error: varErr } = await supabaseAdmin
      .from("product_variants")
      .select(
        `id, name, is_active,
         product:products!inner(id, slug, name, is_active),
         prices:product_prices(list_cents, sale_cents),
         media:product_media(url, is_primary, sort_order)`,
      )
      .in("id", variantIds);
    if (varErr) throw new Error(varErr.message);

    type VariantRow = {
      id: string;
      name: string | null;
      is_active: boolean;
      product: { id: string; slug: string; name: string; is_active: boolean };
      prices: { list_cents: number; sale_cents: number | null }[] | null;
      media: { url: string; is_primary: boolean | null; sort_order: number | null }[] | null;
    };
    const vmap = new Map<string, VariantRow>();
    (variants as unknown as VariantRow[] | null)?.forEach((v) => vmap.set(v.id, v));

    const orderItems = data.items.map((i) => {
      const v = vmap.get(i.variantId);
      if (!v || !v.is_active || !v.product?.is_active) {
        throw new Error("Um dos produtos não está mais disponível.");
      }
      const price = v.prices?.[0];
      if (!price) throw new Error(`Preço não configurado para ${v.product.name}`);
      const unit =
        price.sale_cents && price.sale_cents > 0 && price.sale_cents < price.list_cents
          ? price.sale_cents
          : price.list_cents;
      const media = v.media ?? [];
      const image =
        media.find((m) => m.is_primary)?.url ??
        [...media].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.url ??
        null;
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
    const shipping = 0; // Frete grátis nesta fase
    const total = subtotal + shipping;
    if (total < 100) throw new Error("Valor mínimo do pedido é R$ 1,00.");

    // 3) Cria pedido + itens
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

    // 4) Cria cliente + cobrança PIX no Asaas
    try {
      const customer = await asaasFetch<{ id: string }>(asaasCfg, "/customers", {
        method: "POST",
        body: JSON.stringify({
          name: data.customer.name,
          email: data.customer.email,
          cpfCnpj: document,
          mobilePhone: phone,
          externalReference: context.userId,
        }),
      });

      const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const charge = await asaasFetch<{ id: string; invoiceUrl?: string }>(asaasCfg, "/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: customer.id,
          billingType: "PIX",
          value: total / 100,
          dueDate: due,
          description: `Pedido ${code} · Bloom Cosméticos`,
          externalReference: order.id,
        }),
      });

      const pix = await asaasFetch<{
        encodedImage: string;
        payload: string;
        expirationDate?: string;
      }>(asaasCfg, `/payments/${charge.id}/pixQrCode`);

      const { error: payErr } = await supabaseAdmin.from("payments").insert({
        order_id: order.id,
        provider: "asaas",
        method: "pix",
        status: "pending",
        amount_cents: total,
        external_id: charge.id,
        external_customer_id: customer.id,
        pix_qr_code: pix.encodedImage,
        pix_payload: pix.payload,
        pix_expires_at: pix.expirationDate ? new Date(pix.expirationDate).toISOString() : null,
        invoice_url: charge.invoiceUrl ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw: charge as any,
      });
      if (payErr) throw new Error(payErr.message);

      return { orderId: order.id, code: order.code };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("orders")
        .update({ status: "failed", notes: `Falha no gateway: ${msg}` })
        .eq("id", order.id);
      throw new Error(`Não conseguimos gerar o PIX: ${msg}`);
    }
  });
