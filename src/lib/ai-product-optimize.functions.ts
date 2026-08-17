import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const SYSTEM_COPY = `Você é copywriter sênior de beleza e cosméticos da Absoluto Glamur (Brasil), especialista em SEO, UX de conteúdo e copy persuasiva para e-commerce.

Diretrizes obrigatórias:
- SEMPRE em português do Brasil, tom acolhedor, sofisticado, claro e feminino.
- TÍTULO curto, objetivo, otimizado para SEO (ideal 45-60 caracteres, MÁXIMO 65). Estrutura: [tipo de produto] + [diferencial/ativo principal somente se conhecido] + [benefício-chave]. Exemplo: "Creme Gel Hidratante Facial com Ácido Hialurônico". Nada de storytelling, promessa exagerada ou CTA no título.
- PROIBIDO no título e em todos os textos: emojis, emoticons, símbolos decorativos, asteriscos soltos, setas, hashtags, "!!", reticências e ALL CAPS.
- Use gatilhos mentais éticos: identificação com a necessidade, especificidade, clareza, conveniência, pertencimento, autocuidado e transformação sensorial/estética plausível.
- NUNCA invente prova social, avaliações, número de vendas, autoridade, certificação, estudo, escassez, urgência ou recomendação profissional.
- Trabalhe apenas dores e necessidades coerentes com os dados recebidos. Não atribua ao produto uma função que não esteja sustentada pelo contexto.
- Prometa apenas transformação SENSORIAL e ESTÉTICA plausível. NUNCA prometa cura, tratamento médico, resultado clínico, "elimina rugas 100%", "botox natural" ou "milagre".
- Nunca invente ingredientes, composição, concentração, certificações, fabricante, origem ou aprovação da ANVISA. Se faltar informação, escreva de forma neutra sem criar fatos.
- Evite clichês vazios. Prefira benefício compreensível, experiência de uso e orientação prática.
- Nunca cite concorrentes ou fontes como AliExpress, Shopee ou marketplaces.
- A descrição longa deve ser ESCANEÁVEL: parágrafos curtos, subtítulos objetivos, listas e sequência lógica. Nada de bloco único de texto.
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

const DESCRIPTION_ALLOWED_TAGS = new Set(["p", "br", "strong", "em", "h2", "h3", "ul", "ol", "li"]);

function sanitizeGeneratedDescriptionHtml(raw: string, emojiRe: RegExp, decorRe: RegExp) {
  let html = raw
    .replace(emojiRe, "")
    .replace(decorRe, "")
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/\u0000/g, "");

  html = html.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (full, rawTag: string) => {
    const tag = rawTag.toLowerCase();
    if (!DESCRIPTION_ALLOWED_TAGS.has(tag)) return "";
    if (full.startsWith("</")) return `</${tag}>`;
    if (tag === "br") return "<br>";
    return `<${tag}>`;
  });

  // Converte rótulos antigos em subtítulos quando o provider ainda seguir o formato anterior.
  html = html
    .replace(/<strong>\s*(Benefícios[^<:]*(?::)?|Benefícios que você sente(?::)?)\s*<\/strong>/gi, (_m, label: string) => `<h2>${label.replace(/:$/, "")}</h2>`)
    .replace(/<strong>\s*(Modo de uso(?::)?|Como usar(?::)?)\s*<\/strong>/gi, (_m, label: string) => `<h2>${label.replace(/:$/, "")}</h2>`)
    .replace(/<strong>\s*(Para quem[^<:]*(?::)?)\s*<\/strong>/gi, (_m, label: string) => `<h2>${label.replace(/:$/, "")}</h2>`)
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();

  return html;
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
    const db = context.supabase;

    const { data: prod, error } = await db
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
RESUMO ATUAL: ${stripHtml(prod.short_description).slice(0, 500) || "—"}
DESCRIÇÃO ATUAL: ${stripHtml(prod.description).slice(0, 1800) || "—"}`;

    const prompt = `Analise o produto abaixo e reescreva TODO o copy para conversão, clareza e SEO de e-commerce de beleza.

${contextBlock}

Retorne JSON com esta estrutura EXATA:
{
  "name": "título CURTO e OBJETIVO em PT-BR, 45-60 caracteres (máx 65), focado em SEO. Estrutura: [tipo de produto] + [ativo/diferencial somente se conhecido] + [benefício-chave]. Sem emojis, sem símbolos, sem promessa, sem CTA, sem ALL CAPS.",
  "short_description": "resumo persuasivo em 1-2 frases, ideal 140-220 caracteres, explicando claramente o principal benefício/experiência sem inventar fatos",
  "description_html": "HTML semântico e bem organizado seguindo EXATAMENTE esta ordem: <p>abertura de 2-3 frases apresentando a necessidade e o valor do produto sem exagero</p><h2>Por que incluir na sua rotina</h2><p>experiência, textura, praticidade ou contexto de uso SOMENTE com dados sustentados; se não houver informação específica, mantenha linguagem neutra</p><h2>Benefícios para sua rotina</h2><ul><li>4 a 6 benefícios curtos, distintos, realistas e fáceis de escanear</li></ul><h2>Como usar</h2><ol><li>3 passos simples; se o modo exato não for conhecido, use orientação genérica segura como aplicar conforme a finalidade e seguir as instruções da embalagem</li></ol><h2>Para quem faz sentido</h2><p>perfil de uso ou necessidade compatível com os dados, sem diagnóstico</p><p>fechamento curto com autocuidado, pertencimento ou conveniência, sem urgência artificial</p>. Use SOMENTE <p>, <strong>, <em>, <h2>, <h3>, <ul>, <ol>, <li> e <br>. Não use atributos, estilos inline, links, tabelas ou divs.",
  "seo_title": "título SEO em PT-BR, MÁXIMO 60 caracteres, com palavra-chave principal no início. Sem emojis/símbolos.",
  "seo_description": "meta description em PT-BR até 155 caracteres, clara e útil, com CTA sutil, sem clickbait",
  "keywords": ["5 a 8 palavras-chave em pt-br, minúsculas, relevantes, sem símbolos"]
}

Regras finais:
- Título curto é PRIORIDADE. Se passar de 65 caracteres, encurte removendo adjetivos.
- A descrição longa precisa ter subtítulos e listas. Nunca devolva um único bloco de texto.
- Cada parágrafo deve ter no máximo 3 frases e cada item de lista deve conter uma única ideia.
- Só mencione rugas, rejuvenescimento, manchas, firmeza, oleosidade, ressecamento, cabelo, maquiagem ou outras necessidades quando forem coerentes com a categoria/dados recebidos.
- Se não houver informação suficiente sobre ingrediente, textura, frequência, região de aplicação ou resultado, NÃO invente; escreva de forma neutra.
- ZERO emojis e ZERO símbolos decorativos.
- Nada de menções a AliExpress, Shopee, importado ou origem do fornecedor.
- Responda SOMENTE o JSON.`;

    const { generateWithOwnKeys } = await import("./ai-translate.server");

    const startedAt = Date.now();
    let status: "success" | "error" = "success";
    let raw = "";
    let err: string | null = null;
    try {
      const text = await generateWithOwnKeys(SYSTEM_COPY, prompt, db);
      if (!text) {
        status = "error";
        err = "Nenhuma chave de IA configurada (Gemini ou OpenAI) em Admin → Integrações.";
      } else {
        raw = text;
      }
    } catch (e) {
      status = "error";
      err = e instanceof Error ? e.message : String(e);
    }

    await context.supabase.from("ai_generations").insert({
      user_id: context.userId,
      purpose: "product_optimize_copy",
      model: data.model === "quality" ? "own-keys/quality" : "own-keys/fast",
      provider: "own-keys",
      input: { product_id: data.product_id, prompt: prompt.slice(0, 3000) },
      output: raw.slice(0, 12000),
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      latency_ms: Date.now() - startedAt,
      status,
      error: err,
      related_kind: "product",
      related_id: data.product_id,
    });

    if (status === "error") {
      const e = (err ?? "").toLowerCase();
      let message = err ?? "Falha ao chamar IA";
      if (e.includes("429") || e.includes("too many requests") || e.includes("rate limit"))
        message = "Limite de requisições da sua chave de IA atingido. Aguarde e tente novamente.";
      // Retorna erro tratado (sem throw) para não derrubar a tela do admin.
      return { ok: false as const, error: message };
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

    // Encurta título mantendo palavras inteiras (alvo 60, teto 65).
    const shortenTitle = (rawTitle: string, target = 60, hardMax = 65) => {
      const clean = cleanText(rawTitle);
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
      description_html: sanitizeGeneratedDescriptionHtml(String(parsed.description_html ?? ""), EMOJI_RE, DECOR_RE),
      seo_title: shortenTitle(String(parsed.seo_title ?? parsed.name ?? ""), 58, 60),
      seo_description: cleanText(String(parsed.seo_description ?? "")).slice(0, 160),
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.map((k: unknown) => cleanText(String(k)).toLowerCase()).filter(Boolean).slice(0, 10)
        : [],
    };

    if (data.apply) {
      const { error: upErr } = await db
        .from("products")
        .update({
          name: result.name,
          short_description: result.short_description || null,
          description: result.description_html || null,
        })
        .eq("id", data.product_id);
      if (upErr) throw new Error(upErr.message);

      const { error: seoErr } = await db.from("product_seo").upsert(
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
