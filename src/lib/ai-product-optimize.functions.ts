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

const SYSTEM_COPY = `Você é copywriter sênior de beleza e cosméticos da Absoluto Glamur (Brasil), especialista em SEO e copy persuasivo com gatilhos mentais (dor, prova social, autoridade, transformação).

Diretrizes obrigatórias:
- SEMPRE em português do Brasil, tom acolhedor, sofisticado e feminino.
- TÍTULO curto, objetivo, otimizado para SEO (ideal 45-60 caracteres, MÁXIMO 65). Estrutura: [tipo de produto] + [diferencial/ativo principal] + [benefício-chave]. Exemplo: "Creme Gel Hidratante Facial com Ácido Hialurônico". Nada de storytelling, promessa exagerada ou CTA no título.
- PROIBIDO no título e em todos os textos: emojis, emoticons, símbolos decorativos (✨★☆✅❤♥☀🌸💫⭐🔥😱 etc.), asteriscos soltos, setas, hashtags, "!!", reticências, ALL CAPS.
- Foco na dor real: rugas, flacidez, manchas, olheiras, ressecamento, cabelo sem vida, autoestima, envelhecimento, textura, poros.
- Prometa transformação SENSORIAL e ESTÉTICA (viço, luminosidade, firmeza aparente). NUNCA prometa cura, tratamento médico, resultado clínico, "elimina rugas 100%", "botox natural", "milagre".
- Nunca invente ingredientes, certificações ou aprovação da ANVISA. Use termos genéricos ("ativos hidratantes", "antioxidantes") se faltar dado.
- Evite clichê vazio ("o melhor do mundo"). Prefira imagens sensoriais.
- Nunca cite concorrentes ou fontes (AliExpress, Shopee, etc.).
- SAÍDA: apenas JSON válido, sem markdown, sem \`\`\`json, sem comentários. Strings limpas em PT-BR, sem símbolos decorativos.`;

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
  "name": "título CURTO e OBJETIVO em PT-BR, 45-60 caracteres (máx 65), focado em SEO. Estrutura: [tipo de produto] + [ativo/diferencial] + [benefício-chave]. Ex.: 'Creme Gel Hidratante Facial com Ácido Hialurônico'. Sem emojis, sem símbolos, sem promessa, sem CTA, sem ALL CAPS.",
  "short_description": "resumo persuasivo em 1-2 frases (máx 220 caracteres) que gera desejo, sem emojis/símbolos",
  "description_html": "HTML pronto com <p>, <strong>, <ul><li>. Estrutura: (1) parágrafo de abertura tocando a DOR e prometendo transformação sensorial; (2) parágrafo com a experiência de uso; (3) <strong>Benefícios que você sente:</strong> seguido de <ul> com 5 <li> curtos e emocionais; (4) <strong>Modo de uso:</strong> seguido de <ol> com 3 passos; (5) parágrafo final de fechamento com gatilho de pertencimento/autoestima. Nunca prometer cura ou resultado médico. Sem emojis/símbolos decorativos.",
  "seo_title": "título SEO em PT-BR, MÁXIMO 60 caracteres, com palavra-chave principal no início. Sem emojis/símbolos.",
  "seo_description": "meta description em PT-BR até 155 caracteres com CTA sutil, sem emojis/símbolos",
  "keywords": ["5 a 8 palavras-chave em pt-br, minúsculas, sem símbolos"]
}

Regras finais:
- Título curto é PRIORIDADE. Se passar de 65 caracteres, encurte removendo adjetivos.
- Foque em rugas, rejuvenescimento aparente, luminosidade, firmeza sentida, autoestima, ritual de autocuidado — conforme a categoria.
- ZERO emojis, ZERO símbolos decorativos em qualquer campo.
- Nada de menções a AliExpress, Shopee, importado, "produto chinês".
- Responda SOMENTE o JSON.`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente. Ative o Lovable AI.");
    const modelId = data.model === "quality" ? "google/gemini-3.5-flash" : "google/gemini-3.1-flash-lite";
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

    // Remove emojis, símbolos decorativos e ruído tipográfico dos textos curtos.
    const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;
    const DECOR_RE = /[★☆✦✧✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼❀❁❂❃❄❅❆❇❈❉❊❋❤♥♡☀☁☂☃☄►◄▲▼◆◇○●◎♦♣♠♪♫♬✓✔✗✘➜➔➤→←↑↓⇒⇐⇑⇓•·]/g;
    const cleanText = (s: string) =>
      s
        .replace(EMOJI_RE, "")
        .replace(DECOR_RE, "")
        .replace(/#{1,}/g, "")
        .replace(/\*+/g, "")
        .replace(/!{2,}/g, "!")
        .replace(/\.{3,}/g, ".")
        .replace(/\s+/g, " ")
        .trim();

    const cleanHtml = (s: string) =>
      s
        .replace(EMOJI_RE, "")
        .replace(DECOR_RE, "")
        .replace(/[ \t]+/g, " ")
        .trim();

    // Encurta título mantendo palavras inteiras (alvo 60, teto 65).
    const shortenTitle = (raw: string, target = 60, hardMax = 65) => {
      const clean = cleanText(raw);
      if (clean.length <= hardMax) return clean;
      const words = clean.split(" ");
      const out: string[] = [];
      for (const w of words) {
        const next = out.length ? out.join(" ") + " " + w : w;
        if (next.length > target) break;
        out.push(w);
      }
      const joined = out.join(" ").replace(/[,\-–—:;]+$/g, "").trim();
      return joined.length ? joined : clean.slice(0, hardMax).trim();
    };

    const result = {
      name: shortenTitle(String(parsed.name ?? prod.name), 60, 65),
      short_description: cleanText(String(parsed.short_description ?? "")).slice(0, 400),
      description_html: cleanHtml(String(parsed.description_html ?? "")),
      seo_title: shortenTitle(String(parsed.seo_title ?? parsed.name ?? ""), 58, 60),
      seo_description: cleanText(String(parsed.seo_description ?? "")).slice(0, 160),
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.map((k: unknown) => cleanText(String(k)).toLowerCase()).filter(Boolean).slice(0, 10)
        : [],
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
