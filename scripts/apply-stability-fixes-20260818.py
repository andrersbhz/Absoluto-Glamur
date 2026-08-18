from pathlib import Path
import re


def replace_exact(path: str, old: str, new: str, expected: int = 1):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrences, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new))

# 1) Chrome review receiver: one malformed/rating-less row must not reject the whole batch.
for path in [
    "src/lib/aliexpress-browser-review-auth.functions.ts",
    "src/routes/api/public/aliexpress-review-browser.ts",
]:
    replace_exact(
        path,
        '  rating: z.number().min(1).max(5),',
        '  rating: z.coerce.number().min(0).max(5).default(0),',
    )
    replace_exact(
        path,
        '  body: z.string().trim().min(1).max(8000),',
        '  body: z.string().trim().max(8000).default(""),',
    )

replace_exact(
    "src/lib/aliexpress-browser-review-auth.functions.ts",
    '    const now = new Date().toISOString();\n    const rows = data.reviews.map((review) => {',
    '    const validReviews = data.reviews.filter(\n      (review) => Number.isFinite(review.rating) && review.rating >= 1 && review.rating <= 5,\n    );\n    const skippedInvalid = data.reviews.length - validReviews.length;\n    if (!validReviews.length) {\n      throw new Error("A extensão não retornou nenhuma avaliação com nota válida entre 1 e 5.");\n    }\n\n    const now = new Date().toISOString();\n    const rows = validReviews.map((review) => {',
)
replace_exact(
    "src/lib/aliexpress-browser-review-auth.functions.ts",
    '      average,\n    };',
    '      average,\n      skippedInvalid,\n    };',
)

replace_exact(
    "src/routes/api/public/aliexpress-review-browser.ts",
    '          const now = new Date().toISOString();\n          const rows = body.reviews.map((review) => {',
    '          const validReviews = body.reviews.filter(\n            (review) => Number.isFinite(review.rating) && review.rating >= 1 && review.rating <= 5,\n          );\n          const skippedInvalid = body.reviews.length - validReviews.length;\n          if (!validReviews.length) {\n            return Response.json(\n              { ok: false, error: "no_valid_rated_reviews" },\n              { status: 422, headers: corsHeaders() },\n            );\n          }\n\n          const now = new Date().toISOString();\n          const rows = validReviews.map((review) => {',
)
replace_exact(
    "src/routes/api/public/aliexpress-review-browser.ts",
    '            average,\n          }, { headers: corsHeaders() });',
    '            average,\n            skippedInvalid,\n          }, { headers: corsHeaders() });',
)

# 2) Polling in the authenticated admin must use the authenticated RLS client.
replace_exact(
    "src/lib/aliexpress-browser-review-import.functions.ts",
    '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n    const db = supabaseAdmin as any;',
    '    const db = context.supabase as any;',
)

# 3) Surface how many malformed/no-rating rows were safely ignored.
replace_exact(
    "src/components/store/AliExpressReviewSyncBridge.tsx",
    '        toast.success(`${saved.imported} avaliações importadas pelo Chrome${saved.withPhotos > 0 ? ` · ${saved.withPhotos} com fotos` : ""}${saved.remoteTotal > saved.imported ? ` · ${saved.remoteTotal} detectadas` : ""}.`);',
    '        toast.success(`${saved.imported} avaliações importadas pelo Chrome${saved.withPhotos > 0 ? ` · ${saved.withPhotos} com fotos` : ""}${saved.remoteTotal > saved.imported ? ` · ${saved.remoteTotal} detectadas` : ""}${saved.skippedInvalid > 0 ? ` · ${saved.skippedInvalid} sem nota ignoradas` : ""}.`);',
)

# 4) Product discovery/import translation must use the merchant's own AI keys, never Lovable credits.
p = Path("src/lib/aliexpress-discovery.functions.ts")
text = p.read_text()
pattern = re.compile(r'async function translateToPtBr\(input: \{ title: string; description: string \| null \}\): Promise<\{\n  title: string;\n  description: string \| null;\n\}> \{.*?\n\}\n\nfunction stripHtml', re.S)
replacement = '''async function translateToPtBr(input: { title: string; description: string | null }): Promise<{
  title: string;
  description: string | null;
}> {
  try {
    const { generateWithOwnKeys } = await import("./ai-translate.server");
    const payload = JSON.stringify({ title: input.title, description: input.description ?? "" });
    const text = await generateWithOwnKeys(
      "Você traduz descrições de produtos de cosméticos para português do Brasil, com tom elegante, claro e comercial. Preserve unidades, especificações e nomes próprios de ingredientes. Não invente informações. Responda APENAS com JSON válido no formato {\\\"title\\\":\\\"...\\\",\\\"description\\\":\\\"...\\\"}.",
      `Traduza para pt-BR:\\n\\n${payload}`,
    );
    if (!text) return input;
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : input.title,
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : input.description,
    };
  } catch {
    return input;
  }
}

function stripHtml'''
new_text, count = pattern.subn(replacement, text)
if count != 1:
    raise SystemExit(f"aliexpress-discovery translateToPtBr replacement count={count}")
p.write_text(new_text)

print("stability patch applied")
