export const FREE_SHIPPING_MIN_CENTS = 19900;

export type ShippingQuote = {
  cents: number;
  free: boolean;
  minDays: number;
  maxDays: number;
  service: string;
  source: "free" | "melhorenvio" | "product_fee";
};

type Item = { productId: string; quantity: number; unitCents: number; weightGrams?: number | null };

/** Estimativa de prazo simples por região do CEP (fallback). */
function estimateDays(cep: string): [number, number] {
  const d = Number(cep[0] ?? 9);
  if (d <= 1) return [3, 7]; // SP
  if (d <= 3) return [4, 9]; // RJ/ES/MG
  if (d === 8 || d === 9) return [5, 10]; // Sul
  if (d === 7) return [6, 12]; // Centro-Oeste
  return [7, 15]; // Norte/Nordeste
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeShipping(db: any, cepRaw: string, items: Item[]): Promise<ShippingQuote> {
  const cep = cepRaw.replace(/\D/g, "");
  const subtotal = items.reduce((s, i) => s + i.unitCents * i.quantity, 0);
  const [minD, maxD] = estimateDays(cep);

  // Melhor Envio (quando configurado) define prazo e valor reais.
  let me: ShippingQuote | null = null;
  if (cep.length === 8) {
    const { data: row } = await db
      .from("integrations")
      .select("enabled, api_key, mode, config")
      .eq("provider", "melhorenvio")
      .maybeSingle();
    const origin = String(row?.config?.origin_zip ?? "").replace(/\D/g, "");
    if (row?.enabled && row.api_key && origin.length === 8) {
      try {
        const base = row.mode === "sandbox" ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br";
        const res = await fetch(`${base}/api/v2/me/shipment/calculate`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${String(row.api_key).trim()}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Absoluto Glamur (contato@absolutoglamur.com.br)",
          },
          body: JSON.stringify({
            from: { postal_code: origin },
            to: { postal_code: cep },
            products: items.map((i) => ({
              id: i.productId,
              width: 15,
              height: 10,
              length: 20,
              weight: Math.max(0.1, (i.weightGrams ?? 300) / 1000),
              insurance_value: i.unitCents / 100,
              quantity: i.quantity,
            })),
          }),
        });
        if (res.ok) {
          const list = (await res.json()) as {
            name?: string; price?: string; custom_price?: string; error?: string;
            delivery_range?: { min: number; max: number }; custom_delivery_range?: { min: number; max: number };
            company?: { name?: string };
          }[];
          const best = list
            .filter((o) => !o.error && (o.custom_price ?? o.price))
            .map((o) => ({ o, c: Math.round(Number(o.custom_price ?? o.price) * 100) }))
            .sort((a, b) => a.c - b.c)[0];
          if (best) {
            const r = best.o.custom_delivery_range ?? best.o.delivery_range;
            me = {
              cents: best.c,
              free: false,
              minDays: r?.min ?? minD,
              maxDays: r?.max ?? maxD,
              service: `${best.o.company?.name ?? ""} ${best.o.name ?? ""}`.trim(),
              source: "melhorenvio",
            };
          }
        }
      } catch {
        /* cai no fallback */
      }
    }
  }

  if (subtotal >= FREE_SHIPPING_MIN_CENTS) {
    return { cents: 0, free: true, minDays: me?.minDays ?? minD, maxDays: me?.maxDays ?? maxD, service: "Frete grátis", source: "free" };
  }
  if (me) return me;

  // Fallback: maior valor de frete cadastrado nos produtos do carrinho.
  const ids = [...new Set(items.map((i) => i.productId))];
  const { data: prods } = ids.length
    ? await db.from("products").select("id, shipping_fee_cents").in("id", ids)
    : { data: [] };
  const fee = Math.max(0, ...((prods ?? []) as { shipping_fee_cents: number | null }[]).map((p) => p.shipping_fee_cents ?? 0));
  return { cents: fee, free: fee === 0, minDays: minD, maxDays: maxD, service: "Envio padrão", source: "product_fee" };
}
