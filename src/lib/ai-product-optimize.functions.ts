import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

const SYSTEM_COPY = `Você é copywriter sênior de beleza e cosméticos da Absoluto Glamur (Brasil), especialista em copy persuasivo com gatilhos mentais (dor, prova social, urgência sutil, autoridade, transformação, pertencimento).

Diretrizes obrigatórias:
- Português do Brasil, tom acolhedor, sofisticado e feminino.
- Foco na dor real: rugas, flacidez, manchas, olheiras, ressecamento, cabelo sem vida, autoestima, envelhecimento, textura, poros.
- Prometa transformação SENSORIAL e ESTÉTICA (viço, luminosidade, firmeza aparente, sensação de rejuvenescimento). NUNCA prometa cura, tratamento médico, resultado clínico, comparação com procedimento estético, "elimina rugas 100%", "botox natural", "milagre".
- Nunca invente ingredientes, certificações, aprovação da ANVISA ou testes clínicos. Use termos genéricos ("ativos hidratantes", "fórmula com antioxidantes") se faltar dado.
- Use gatilhos: "sinta-se você mesma novamente", "reencontre a pele que você merece", "resultado que se vê no espelho", "toque de luxo", "cuidado que abraça".
- Evite clichê vazio ("o melhor do mundo"). Prefira imagens sensoriais.
- Nunca cite marcas concorrentes nem fontes (AliExpress, Shopee, etc).
- SAÍDA: apenas JSON válido, sem markdown, sem \`\`\`json, sem comentários. Todas as strings em PT-BR.`;

function extractJson(text: string): any {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("IA não retornou JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export const optimizeProductCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        apply: z.boolean().optional(),
        model: z.enum(["fast", "quality"]).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prod, error } = await supabaseAdmin
      .from("products")
      .select(
        `id, name, short_description, description, tags,
         brand:brands(name), category:categories(name),
         seo:product_seo(meta_title, meta_description, keywords)`,
      )
      .eq("id", data.product_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!prod) throw new Error("Produto não encontrado");

    const stripHtml = (s: string | null | undefined) =>
      (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    const brand = Array.isArray(prod.brand) ? prod.brand[0] : prod.brand;
    const category = Array.isArray(prod.category) ? prod.category[0] : prod.category;

    const contextBlock = `NOME ATUAL: ${prod.name}
CATEGORIA: ${category?.name ?? "beleza"}
MARCA: ${brand?.name ?? "—"}
TAGS: ${(prod.tags ?? []).join(", ") || "—"}
RESUMO ATUAL: ${stripHtml(prod.short_description).slice(0, 400) || "—"}
DESCRIÇÃO ATUAL: ${stripHtml(prod.description).slice(0, 1200) || "—"}`;

    const prompt = `Analise o produto abaixo e reescreva TODO o copy para maximizar conversão em e-commerce de beleza.

${contextBlock}

Retorne JSON com esta estrutura EXATA:
{
  "name": "novo título até 80 caracteres com benefício + gatilho",
  "short_description": "resumo persuasivo em 1-2 frases (máx 220 caracteres) que gera desejo",
  "description_html": "HTML pronto com <p>, <strong>, <ul><li>. Estrutura: (1) parágrafo de abertura tocando a DOR (rugas/flacidez/autoestima) e prometendo transformação sensorial; (2) parágrafo com a experiência de uso e sensação; (3) <strong>Benefícios que você sente:</strong> seguido de <ul> com 5 <li> curtos e emocionais; (4) <strong>Modo de uso:</strong> seguido de <ol> com 3 passos; (5) parágrafo final de fechamento com gatilho de pertencimento/autoestima. Nunca prometer cura ou resultado médico.",
  "seo_title": "título SEO até 60 caracteres, com palavra-chave forte",
  "seo_description": "meta description até 155 caracteres com CTA sutil",
  "keywords": ["5 a 8 palavras-chave em pt-br"]
}

Regras finais:
- Foque em rugas, rejuvenescimento aparente, luminosidade, firmeza sentida, autoestima, ritual de autocuidado — conforme a categoria.
- Nada de emojis excessivos (no máximo 1 no título, opcional).
- Nada de menções a AliExpress, Shopee, importado, "produto chinês".
- Responda SOMENTE o JSON.`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente. Ative o Lovable AI.");
    const modelId = data.model === "quality" ? "openai/gpt-5.4-mini" : "google/gemini-3.5-flash";
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway(modelId);

    const startedAt = Date.now();
    let status: "success" | "error" = "success";
    let raw = "";
    let err: string | null = null;
    let usage: any = {};
    try {
      const r = await generateText({ model, system: SYSTEM_COPY, prompt });
      raw = r.text;
      usage = {
        inputTokens: (r.usage as any)?.inputTokens ?? (r.usage as any)?.promptTokens,
        outputTokens: (r.usage as any)?.outputTokens ?? (r.usage as any)?.completionTokens,
        totalTokens: (r.usage as any)?.totalTokens,
      };
    } catch (e) {
      status = "error";
      err = e instanceof Error ? e.message : String(e);
    }

    await context.supabase.from("ai_generations").insert({
      user_id: context.userId,
      purpose: "product_optimize_copy",
      model: modelId,
      provider: "lovable-ai",
      input: { product_id: data.product_id, prompt: prompt.slice(0, 3000) },
      output: raw.slice(0, 12000),
      input_tokens: usage.inputTokens ?? null,
      output_tokens: usage.outputTokens ?? null,
      total_tokens: usage.totalTokens ?? null,
      latency_ms: Date.now() - startedAt,
      status,
      error: err,
      related_kind: "product",
      related_id: data.product_id,
    });

    if (status === "error") {
      if (err?.includes("429")) throw new Error("Limite de requisições atingido. Aguarde alguns segundos.");
      if (err?.includes("402")) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(err ?? "Falha ao chamar IA");
    }

    const parsed = extractJson(raw);
    const result = {
      name: String(parsed.name ?? prod.name).slice(0, 120),
      short_description: String(parsed.short_description ?? "").slice(0, 400),
      description_html: String(parsed.description_html ?? ""),
      seo_title: String(parsed.seo_title ?? "").slice(0, 70),
      seo_description: String(parsed.seo_description ?? "").slice(0, 200),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String).slice(0, 10) : [],
    };

    if (data.apply) {
      const { error: upErr } = await supabaseAdmin
        .from("products")
        .update({
          name: result.name,
          short_description: result.short_description || null,
          description: result.description_html || null,
        })
        .eq("id", data.product_id);
      if (upErr) throw new Error(upErr.message);

      const { error: seoErr } = await supabaseAdmin.from("product_seo").upsert(
        {
          product_id: data.product_id,
          meta_title: result.seo_title || null,
          meta_description: result.seo_description || null,
          keywords: result.keywords.length ? result.keywords : null,
        },
        { onConflict: "product_id" },
      );
      if (seoErr) throw new Error(seoErr.message);
    }

    return { applied: !!data.apply, ...result };
  });
