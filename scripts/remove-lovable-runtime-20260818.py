from pathlib import Path
import re


def replace_exact(path: str, old: str, new: str, expected: int = 1):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected}, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new))

# ---------------------------------------------------------------------------
# AI content: use only merchant-configured Gemini/OpenAI keys.
# ---------------------------------------------------------------------------
p = Path("src/lib/ai-content.functions.ts")
s = p.read_text()
s = s.replace('import { generateText } from "ai";\n', '')
s = s.replace(
    'import { createLovableAiGatewayProvider } from "./ai-gateway.server";\n',
    'import { callAiProvider, loadAiCredential } from "./ai-translate.server";\n',
)
start = s.index('const MODELS = {')
end = s.index('// ============ PRODUCT DESCRIPTION ============')
new_block = '''const MODELS = {
  fast: "fast",
  quality: "quality",
} as const;

const PROVIDER_ORDER: Record<keyof typeof MODELS, Array<"gemini" | "openai">> = {
  fast: ["gemini", "openai"],
  quality: ["openai", "gemini"],
};

type CallOptions = {
  purpose: string;
  system: string;
  prompt: string;
  model?: keyof typeof MODELS;
  relatedKind?: string;
  relatedId?: string | null;
};

async function callAi(context: any, opts: CallOptions) {
  const preference = opts.model ?? "fast";
  const startedAt = Date.now();
  const failures: string[] = [];
  let output = "";
  let providerUsed: "gemini" | "openai" | null = null;
  let modelUsed: string | null = null;

  for (const provider of PROVIDER_ORDER[preference]) {
    try {
      const credential = await loadAiCredential(provider, context.supabase);
      if (!credential) continue;
      modelUsed = credential.model;
      const text = await callAiProvider(credential, opts.system, opts.prompt);
      if (text) {
        output = text;
        providerUsed = provider;
        await context.supabase
          .from("integrations")
          .update({
            last_verified_at: new Date().toISOString(),
            last_status: "ok",
            last_error: null,
          })
          .eq("provider", provider);
        break;
      }
      failures.push(`${provider}: resposta vazia`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${provider}: ${message}`);
      await context.supabase
        .from("integrations")
        .update({
          last_verified_at: new Date().toISOString(),
          last_status: "error",
          last_error: message.slice(0, 500),
        })
        .eq("provider", provider);
    }
  }

  const latency = Date.now() - startedAt;
  const status = output ? "success" : "error";
  const error = output
    ? null
    : failures.length
      ? failures.join(" | ").slice(0, 1200)
      : "Nenhum provedor de IA habilitado com chave configurada. Configure Gemini ou OpenAI em Integrações.";

  await context.supabase.from("ai_generations").insert({
    user_id: context.userId,
    purpose: opts.purpose,
    model: modelUsed ?? preference,
    provider: providerUsed ?? "configured-ai",
    input: { prompt: opts.prompt.slice(0, 4000), system: opts.system.slice(0, 500) },
    output: output.slice(0, 12000),
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    latency_ms: latency,
    status,
    error,
    related_kind: opts.relatedKind ?? null,
    related_id: opts.relatedId ?? null,
  });

  if (!output) {
    if (/429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(error ?? "")) {
      throw new Error("Limite do provedor de IA atingido. Tente novamente ou habilite o provedor de fallback.");
    }
    throw new Error(error ?? "Falha ao chamar IA configurada.");
  }

  return {
    output,
    latency,
    usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
    model: modelUsed ?? preference,
    provider: providerUsed,
  };
}

'''
s = s[:start] + new_block + s[end:]
p.write_text(s)

# ---------------------------------------------------------------------------
# Firecrawl discovery: use the Firecrawl API key saved in Admin > Integrações.
# Never use Lovable connector gateway/runtime credits.
# ---------------------------------------------------------------------------
p = Path("src/lib/aliexpress-discovery.functions.ts")
s = p.read_text()
start = s.index('async function searchAliExpressWeb(')
end = s.index('async function enrichWebResultsWithAliDetails', start)
old_block = s[start:end]
body_start = old_block.index('  const res = await fetch(endpoint, {')
# Preserve product parsing logic from the current implementation after fetch setup.
preserved = old_block[body_start:]
preserved = preserved.replace('fetch(endpoint, {', 'fetch("https://api.firecrawl.dev/v2/search", {', 1)
preserved = preserved.replace('    headers,\n', '    headers: {\n      "Content-Type": "application/json",\n      Authorization: `Bearer ${firecrawlKey}`,\n    },\n', 1)
new_search = '''async function searchAliExpressWeb(
  keyword: string,
  limit: number,
  credentialClient: any,
): Promise<DiscoveryProduct[]> {
  const { data: firecrawl, error } = await credentialClient
    .from("integrations")
    .select("api_key,enabled")
    .eq("provider", "firecrawl")
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler a integração Firecrawl: ${error.message}`);
  const firecrawlKey = String(firecrawl?.api_key ?? "").trim();
  if (!firecrawlKey) {
    throw new Error("Firecrawl não conectado. Configure a API Key em Admin → Integrações.");
  }
  if (firecrawl?.enabled === false) {
    throw new Error("Firecrawl está configurado, mas desativado em Admin → Integrações.");
  }
  if (firecrawlKey.startsWith("lovc_")) {
    throw new Error("A chave Firecrawl salva pertence ao antigo gateway do Lovable. Substitua por uma API Key direta do Firecrawl para evitar créditos do Lovable.");
  }

''' + preserved
s = s[:start] + new_search + s[end:]
s = s.replace(
    'items = await searchAliExpressWeb(data.keyword.trim(), data.page_size);',
    'items = await searchAliExpressWeb(data.keyword.trim(), data.page_size, context.supabase);',
)
s = s.replace(
    'async function translateToPtBr(input: { title: string; description: string | null }): Promise<{',
    'async function translateToPtBr(\n  input: { title: string; description: string | null },\n  credentialClient: any,\n): Promise<{',
    1,
)
s = s.replace(
    '      `Traduza para pt-BR:\n\n${payload}`,\n    );',
    '      `Traduza para pt-BR:\n\n${payload}`,\n      credentialClient,\n    );',
    1,
)
s = s.replace(
    'const translated = await translateToPtBr({ title, description });',
    'const translated = await translateToPtBr({ title, description }, db);',
    1,
)
p.write_text(s)

# ---------------------------------------------------------------------------
# AliExpress importer: remove stale Lovable gateway imports and pass auth DB
# through all translation calls so own keys work without service-role.
# ---------------------------------------------------------------------------
p = Path("src/lib/aliexpress-import.functions.ts")
s = p.read_text()
s = s.replace('import { generateText } from "ai";\n', '')
s = s.replace('import { createLovableAiGatewayProvider } from "./ai-gateway.server";\n', '')
s = s.replace(
    'async function translateToPtBr(input: { title: string; description: string | null }): Promise<{',
    'async function translateToPtBr(\n  input: { title: string; description: string | null },\n  credentialClient: any,\n): Promise<{',
    1,
)
s = s.replace(
    '      `Traduza para pt-BR o conteúdo abaixo. Reescreva de forma natural, sem estrangeirismos desnecessários.\\n\\n${payload}`,\n    );',
    '      `Traduza para pt-BR o conteúdo abaixo. Reescreva de forma natural, sem estrangeirismos desnecessários.\\n\\n${payload}`,\n      credentialClient,\n    );',
    1,
)
s = s.replace(
    'const translated = await translateToPtBr({ title: raw.title, description: raw.description });',
    'const translated = await translateToPtBr(\n      { title: raw.title, description: raw.description },\n      context.supabase,\n    );',
    1,
)
s = s.replace(
    '    const translated = await translateToPtBr({\n      title: data.normalized.title,\n      description: data.normalized.description ?? null,\n    });',
    '    const translated = await translateToPtBr(\n      {\n        title: data.normalized.title,\n        description: data.normalized.description ?? null,\n      },\n      db,\n    );',
    1,
)
s = s.replace(
    '      const translated = await translateToPtBr({\n        title: n.title,\n        description: n.description ?? null,\n      });',
    '      const translated = await translateToPtBr(\n        {\n          title: n.title,\n          description: n.description ?? null,\n        },\n        db,\n      );',
    1,
)
if s.count('await translateToPtBr(') != 3:
    raise SystemExit(f"aliexpress-import: unexpected translate call count {s.count('await translateToPtBr(')}")
p.write_text(s)

# ---------------------------------------------------------------------------
# Live review translations: pass same authenticated DB client used for reviews.
# ---------------------------------------------------------------------------
p = Path("src/lib/product-reviews-live.functions.ts")
s = p.read_text()
s = s.replace(
    'async function translateBatch(\n  rows: Array<{ title: string | null; body: string | null }>,\n): Promise<Array<{ title: string | null; body: string | null; translated: boolean }>> {',
    'async function translateBatch(\n  rows: Array<{ title: string | null; body: string | null }>,\n  credentialClient: any,\n): Promise<Array<{ title: string | null; body: string | null; translated: boolean }>> {',
    1,
)
s = s.replace(
    '    const text = await generateWithOwnKeys(system, prompt);',
    '    const text = await generateWithOwnKeys(system, prompt, credentialClient);',
    1,
)
s = s.replace(
    '    const translated = await translateBatch(batch.map((row: any) => ({ title: row.title, body: row.body })));',
    '    const translated = await translateBatch(\n      batch.map((row: any) => ({ title: row.title, body: row.body })),\n      admin,\n    );',
    1,
)
p.write_text(s)

# ---------------------------------------------------------------------------
# Direct review import: same own-key + authenticated-client rule.
# ---------------------------------------------------------------------------
p = Path("src/lib/aliexpress-direct-review-import.functions.ts")
s = p.read_text()
s = s.replace(
    'async function translateReviews(reviews: NormalizedReview[]) {',
    'async function translateReviews(reviews: NormalizedReview[], credentialClient: any) {',
    1,
)
s = s.replace(
    '      const text = await generateWithOwnKeys(system, prompt);',
    '      const text = await generateWithOwnKeys(system, prompt, credentialClient);',
    1,
)
s = s.replace(
    '      const translated = await translateReviews(fetchedReviews);',
    '      const translated = await translateReviews(fetchedReviews, context.supabase);',
    1,
)
p.write_text(s)

print("own-credentials runtime patch applied")
