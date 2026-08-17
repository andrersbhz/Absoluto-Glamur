from pathlib import Path


def replace_between(path: str, start_marker: str, end_marker: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text()
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    p.write_text(text[:start] + replacement + text[end:])


lib_path = "src/lib/aliexpress-import.functions.ts"
p = Path(lib_path)
text = p.read_text()

helpers_start = "function extractAliexpressId(url: string): string | null {"
helpers_end = "\nexport function stripBrandMentions"
helpers = r'''function extractAliexpressId(input: string): string | null {
  const value = input.trim();
  if (/^\d{8,20}$/.test(value)) return value;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the original value when it is not percent-encoded.
  }

  const pathMatch =
    decoded.match(/\/(?:item|i)\/(\d{8,20})(?:\.html)?(?:[/?#]|$)/i) ??
    decoded.match(/\/(\d{10,20})\.html(?:[/?#]|$)/i);
  if (pathMatch?.[1]) return pathMatch[1];

  try {
    const url = new URL(value);
    for (const key of ["productId", "product_id", "itemId", "item_id"]) {
      const candidate = url.searchParams.get(key)?.trim() ?? "";
      if (/^\d{8,20}$/.test(candidate)) return candidate;
    }
  } catch {
    // URL validation is handled by resolveAliExpressInput.
  }

  return null;
}

function isAliExpressHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "aliexpress.com" || host.endsWith(".aliexpress.com") || host === "aliexpress.us" || host.endsWith(".aliexpress.us");
}

async function resolveAliExpressInput(input: string): Promise<{ productId: string; sourceUrl: string }> {
  const value = input.trim();
  const directId = extractAliexpressId(value);
  if (directId) {
    return {
      productId: directId,
      sourceUrl: `https://www.aliexpress.com/item/${directId}.html`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Informe uma URL de produto AliExpress válida ou o ID numérico do produto.");
  }

  if (!isAliExpressHost(parsed.hostname)) {
    throw new Error("A importação por URL aceita apenas links de produtos do AliExpress ou o ID numérico do produto.");
  }

  // Short/share links do AliExpress não carregam o ID no endereço inicial.
  // We only follow the official redirect and inspect the final URL; no page scraping is performed.
  let finalUrl = parsed.toString();
  try {
    let response = await fetch(finalUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AbsolutoGlamurImporter/1.0)" },
    });
    if (!response.ok || !response.url) {
      response = await fetch(finalUrl, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AbsolutoGlamurImporter/1.0)" },
      });
    }
    finalUrl = response.url || finalUrl;
  } catch {
    throw new Error("Não foi possível resolver esse link curto do AliExpress. Cole a URL completa do produto ou o ID numérico.");
  }

  const resolvedId = extractAliexpressId(finalUrl);
  if (!resolvedId) {
    throw new Error("Não encontrei o ID do produto nesse link. Cole a URL completa do AliExpress ou o ID numérico.");
  }

  return {
    productId: resolvedId,
    sourceUrl: `https://www.aliexpress.com/item/${resolvedId}.html`,
  };
}

function firstOfficialNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = value.replace(/[^\d.,-]/g, "").replace(",", ".");
      const parsed = Number.parseFloat(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function stripOfficialHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadAliExpressUrlPreview(
  input: string,
  credentialClient: any,
): Promise<NormalizedProduct> {
  const { productId, sourceUrl } = await resolveAliExpressInput(input);
  const { callAli } = await import("./aliexpress-discovery.functions");

  const json = await callAli<any>(
    "aliexpress.ds.product.get",
    {
      product_id: productId,
      target_currency: "BRL",
      target_language: "PT",
      ship_to_country: "BR",
    },
    credentialClient,
  );

  const root =
    json?.aliexpress_ds_product_get_response ??
    json?.aliexpress_ds_productdetail_get_response ??
    json;
  const result = root?.result ?? root;
  const base = result?.ae_item_base_info_dto ?? result?.base_info ?? result ?? {};
  const props = result?.ae_item_properties ?? {};
  const media = result?.ae_multimedia_info_dto ?? result?.multimedia ?? {};
  const skuBlock = result?.ae_item_sku_info_dtos ?? result?.skus ?? {};

  const rawTitle = String(base?.subject ?? base?.product_title ?? "").trim();
  if (!rawTitle) {
    throw new Error(`A API oficial do AliExpress não retornou os dados do produto ${productId}.`);
  }

  const images: string[] = [];
  const pushImage = (value: unknown) => {
    if (typeof value !== "string") return;
    const url = value.trim();
    if (/^https?:\/\//i.test(url) && !images.includes(url)) images.push(url);
  };

  pushImage(base?.product_main_image_url);
  pushImage(base?.main_image_url);
  const rawImages = media?.image_urls ?? media?.image_url_list ?? base?.product_small_image_urls;
  if (typeof rawImages === "string") {
    const matches = rawImages.match(/https?:\/\/[^\s,;]+/gi) ?? [];
    matches.forEach(pushImage);
  } else if (Array.isArray(rawImages)) {
    rawImages.forEach(pushImage);
  } else if (Array.isArray(rawImages?.string)) {
    rawImages.string.forEach(pushImage);
  }

  const skuRows: any[] = Array.isArray(skuBlock?.ae_item_sku_info_d_t_o)
    ? skuBlock.ae_item_sku_info_d_t_o
    : Array.isArray(skuBlock)
      ? skuBlock
      : [];
  const firstSku = skuRows[0] ?? {};
  const price = firstOfficialNumber(
    firstSku?.offer_sale_price,
    firstSku?.sku_price,
    firstSku?.offer_bulk_sale_price,
    result?.app_sale_price,
    base?.sale_price,
  );
  const currency = String(firstSku?.currency_code ?? base?.currency_code ?? "BRL").toUpperCase();
  const sku = String(firstSku?.sku_code ?? firstSku?.sku_id ?? `AE-${productId}`);
  const weightKg = firstOfficialNumber(props?.package_weight, firstSku?.package_weight);
  const descriptionHtml = String(base?.detail ?? result?.package_info_dto?.package_detail ?? "");

  return {
    title: rawTitle,
    description: descriptionHtml ? stripOfficialHtml(descriptionHtml).slice(0, 6000) : null,
    images: images.slice(0, 12),
    price_original: price,
    currency,
    sku,
    weight_grams: weightKg != null && weightKg > 0 ? Math.round(weightKg * 1000) : null,
    source_url: sourceUrl,
    source_id: productId,
  };
}
'''
start = text.index(helpers_start)
end = text.index(helpers_end, start)
text = text[:start] + helpers + text[end:]

preview_start = text.index('export const scrapeUrlPreview = createServerFn({ method: "POST" })')
preview_end = text.index('\nconst DraftSchema', preview_start)
preview = r'''export const scrapeUrlPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ url: z.string().trim().min(3).max(2048) }).parse(v),
  )
  .handler(async ({ data, context }): Promise<NormalizedProduct> => {
    await assertCatalog(context);
    const raw = await loadAliExpressUrlPreview(data.url, context.supabase);
    const settings = await loadSettings(context.supabase);
    const translated = await translateToPtBr({ title: raw.title, description: raw.description });

    let priceBrl: number | null = raw.price_original;
    const srcCurrency = (raw.currency ?? "BRL").toUpperCase();
    if (raw.price_original != null && srcCurrency !== "BRL") {
      const live = await fetchFxToBrl(srcCurrency);
      const rate = live ?? settings.fx_rate;
      priceBrl = Math.round(raw.price_original * rate * 100) / 100;
    }

    return {
      ...raw,
      title: translated.title,
      description: toParagraphHtml(translated.description),
      price_original: priceBrl,
      currency: "BRL",
    };
  });
'''
text = text[:preview_start] + preview + text[preview_end:]

save_start = text.index('export const saveImportDraft = createServerFn({ method: "POST" })')
save_end = text.index('\nexport const bulkImportJson', save_start)
save_chunk = text[save_start:save_end]
save_chunk = save_chunk.replace(
    '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");',
    '    const db = context.supabase;',
    1,
)
save_chunk = save_chunk.replace(
    '''      const cfgForFx = await loadSettings(
        (await import("@/integrations/supabase/client.server")).supabaseAdmin,
      );''',
    '''      const cfgForFx = await loadSettings(db);''',
)
save_chunk = save_chunk.replace('supabaseAdmin', 'db')
text = text[:save_start] + save_chunk + text[save_end:]
p.write_text(text)

route_path = "src/routes/_authenticated/admin.imports.tsx"
r = Path(route_path)
route = r.read_text()
route = route.replace('URL (Firecrawl)', 'URL / ID AliExpress', 1)
route = route.replace('toast.success("Produto extraído. Revise e salve como rascunho.");', 'toast.success("Produto carregado pela API oficial. Revise e salve como rascunho.");', 1)
route = route.replace('Cole a URL do produto AliExpress', 'Cole a URL ou o ID do produto AliExpress', 1)
route = route.replace('''            type="url"
            value={url}''', '''            type="text"
            inputMode="url"
            value={url}''', 1)
route = route.replace('placeholder="https://pt.aliexpress.com/item/1005006123456789.html"', 'placeholder="https://pt.aliexpress.com/item/1005006123456789.html ou 1005006123456789"', 1)
route = route.replace('{previewMut.isPending ? "Extraindo..." : "Extrair"}', '{previewMut.isPending ? "Consultando API..." : "Buscar produto"}', 1)
route = route.replace(
    '''          Requer o conector <strong>Firecrawl</strong>. Sem ele, use a aba JSON/CSV.''',
    '''          Usa a <strong>API oficial do AliExpress</strong> conectada em Integrações. Aceita URL completa, link compartilhado ou ID numérico; não requer Firecrawl.''',
    1,
)
r.write_text(route)

print("AliExpress URL importer migrated from Firecrawl to official API.")
