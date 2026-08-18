import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiProvider, loadAiCredential } from "./ai-translate.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertAiAccess(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

// Guardrails: avoid regulatory/medical claims typical of cosmetics scams.
const SYSTEM_BASE = `Você é a IA de conteúdo da Absoluto Glamur, uma loja de cosméticos brasileira.
Regras obrigatórias:
- Escreva em português do Brasil, tom acolhedor, elegante e claro.
- NUNCA prometa cura, tratamento médico, resultados milagrosos ou comparações com medicamentos.
- NUNCA invente ingredientes, certificações (ANVISA/CE), origem ou testes clínicos.
- Use apenas informações fornecidas no contexto. Se faltar dado, use termos genéricos e seguros.
- Evite superlativos vazios ("o melhor do mundo"). Prefira benefícios sensoriais e de uso.
- Nunca cite marcas concorrentes por nome.`;

const MODELS = {
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

// ============ PRODUCT DESCRIPTION ============

export const generateProductDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      name: z.string().min(2),
      category: z.string().optional(),
      brand: z.string().optional(),
      attributes: z.string().optional(),
      audience: z.string().optional(),
      product_id: z.string().uuid().optional(),
      model: z.enum(["fast", "quality"]).optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAiAccess(context);
    const prompt = `Gere um copy de página de produto com:
1. Título curto (até 80 caracteres) com benefício principal.
2. Descrição envolvente (2 parágrafos, ~120 palavras).
3. 5 bullets de benefícios/uso.
4. Sugestão de "modo de usar" em 3 passos.

Contexto:
- Produto: ${data.name}
- Categoria: ${data.category ?? "—"}
- Marca: ${data.brand ?? "—"}
- Atributos/ingredientes conhecidos: ${data.attributes ?? "—"}
- Público-alvo: ${data.audience ?? "amantes de skincare/beleza brasileiros"}

Formato de saída (markdown):
## Título
...
## Descrição
...
## Benefícios
- ...
## Como usar
1. ...`;
    return callAi(context, {
      purpose: "product_description",
      system: SYSTEM_BASE,
      prompt,
      model: data.model,
      relatedKind: "product",
      relatedId: data.product_id ?? null,
    });
  });

// ============ SEO META ============

export const generateProductSeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      name: z.string().min(2),
      category: z.string().optional(),
      brand: z.string().optional(),
      short_description: z.string().optional(),
      product_id: z.string().uuid().optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAiAccess(context);
    const prompt = `Gere metadados SEO para a página do produto abaixo. Retorne EXATAMENTE neste formato:

TITLE: <máx 60 caracteres, com palavra-chave e nome da marca>
DESCRIPTION: <máx 155 caracteres, com CTA sutil>
KEYWORDS: <5-8 palavras-chave separadas por vírgula, sem hashtags>
OG_TITLE: <máx 60 caracteres, apelo emocional>
OG_DESCRIPTION: <máx 155 caracteres>

Produto: ${data.name}
Categoria: ${data.category ?? "—"}
Marca: ${data.brand ?? "—"}
Resumo: ${data.short_description ?? "—"}`;
    return callAi(context, {
      purpose: "product_seo",
      system: SYSTEM_BASE,
      prompt,
      relatedKind: "product",
      relatedId: data.product_id ?? null,
    });
  });

// ============ MARKETING COPY ============

export const generateMarketingCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      goal: z.string().min(2),
      channel: z.enum(["hero", "email", "instagram", "google_ads", "banner"]),
      context: z.string().optional(),
      tone: z.string().optional(),
      model: z.enum(["fast", "quality"]).optional(),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAiAccess(context);
    const prompt = `Crie 3 variações de copy para o canal "${data.channel}".
Objetivo: ${data.goal}
Tom desejado: ${data.tone ?? "acolhedor e sofisticado"}
Contexto extra: ${data.context ?? "—"}

Regras por canal:
- hero: headline até 60 chars + subheadline até 120 chars + CTA (2-3 palavras).
- email: assunto (máx 55 chars) + preview (máx 90 chars) + corpo curto (2 parágrafos).
- instagram: legenda (máx 150 palavras) + 5 hashtags relevantes de beleza brasileira.
- google_ads: 3 headlines (máx 30 chars cada) + 2 descrições (máx 90 chars cada).
- banner: título (máx 40 chars) + subtítulo (máx 60 chars) + CTA.

Formato: markdown com "### Variação 1/2/3".`;
    return callAi(context, {
      purpose: `marketing_${data.channel}`,
      system: SYSTEM_BASE,
      prompt,
      model: data.model,
    });
  });

// ============ TEXT IMPROVE ============

export const improveText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      text: z.string().min(5),
      action: z.enum(["polish", "shorten", "expand", "translate_en"]),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAiAccess(context);
    const actionMap = {
      polish: "Revise e melhore o texto abaixo mantendo o significado. Corrija gramática e melhore fluidez.",
      shorten: "Encurte o texto abaixo em ~40%, mantendo os pontos essenciais.",
      expand: "Expanda o texto abaixo com mais detalhes sensoriais e de uso, sem inventar dados.",
      translate_en: "Traduza para inglês natural e comercial (mercado americano).",
    };
    const prompt = `${actionMap[data.action]}

Texto:
"""
${data.text}
"""

Devolva apenas o texto final, sem comentários.`;
    return callAi(context, {
      purpose: `improve_${data.action}`,
      system: SYSTEM_BASE,
      prompt,
    });
  });

// ============ USAGE STATS ============

export const getAiUsageStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAiAccess(context);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("ai_generations")
      .select("id, purpose, model, total_tokens, latency_ms, status, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const rows = data ?? [];
    const totals = rows.reduce(
      (acc: any, r: any) => {
        acc.calls += 1;
        acc.tokens += r.total_tokens ?? 0;
        if (r.status === "error") acc.errors += 1;
        return acc;
      },
      { calls: 0, tokens: 0, errors: 0 },
    );
    return { recent: rows, totals };
  });
