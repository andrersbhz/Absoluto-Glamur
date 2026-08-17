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

const InputSchema = z.object({
  title: z.string().min(2).max(500),
  description: z.string().nullable().optional(),
  source_id: z.string().nullable().optional(),
});

const SYSTEM = `Você é copywriter sênior da Absoluto Glamur, e-commerce brasileiro de beleza, cosméticos, cuidados com pele e cabelo.
Sua tarefa é limpar e organizar textos importados de fornecedores antes de salvar o produto como rascunho.
Regras obrigatórias:
- escreva somente em português do Brasil;
- preserve fatos técnicos realmente presentes no texto recebido;
- não invente ingredientes, concentrações, certificações, benefícios clínicos, origem, fabricante ou resultados;
- remova menções a AliExpress, marketplace, fornecedor, China, envio internacional, códigos internos e ruído de catálogo;
- remova emojis, símbolos decorativos, ALL CAPS e repetições;
- título curto e comercial, ideal entre 45 e 65 caracteres;
- descrição organizada, escaneável e útil para e-commerce;
- não faça promessas médicas ou milagrosas;
- responda apenas JSON válido, sem markdown.`;

function stripUnsafeHtml(input: string) {
  return input
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<\/?(?!p\b|br\b|strong\b|em\b|h2\b|h3\b|ul\b|ol\b|li\b)[^>]+>/gi, "")
    .replace(/<(p|strong|em|h2|h3|ul|ol|li)\b[^>]*>/gi, "<$1>")
    .replace(/<br\b[^>]*>/gi, "<br>")
    .trim();
}

function cleanText(input: string) {
  return input
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "")
    .replace(/[★☆✦✧❤♥♡✓✔➜➔➤→←↑↓•·]/g, "")
    .replace(/ali[\s\-_]?express/gi, "")
    .replace(/\b(china mainland|china|marketplace|supplier|fornecedor)\b/gi, "")
    .replace(/#{1,}/g, "")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A IA não retornou um JSON válido.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function shortenTitle(raw: string) {
  const clean = cleanText(raw);
  if (clean.length <= 65) return clean;
  const words = clean.split(" ");
  const out: string[] = [];
  for (const word of words) {
    const next = [...out, word].join(" ");
    if (next.length > 62) break;
    out.push(word);
  }
  return (out.join(" ") || clean.slice(0, 65)).replace(/[,\-–—:;]+$/g, "").trim();
}

export const polishImportProductCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => InputSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const db = context.supabase;
    const plainDescription = (data.description ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 7000);

    const prompt = `Organize o produto importado abaixo para ser salvo como rascunho no catálogo da Absoluto Glamur.\n\nTÍTULO RECEBIDO:\n${data.title}\n\nDESCRIÇÃO RECEBIDA:\n${plainDescription || "Sem descrição detalhada."}\n\nRetorne EXATAMENTE este JSON:\n{\n  "title": "título comercial em PT-BR, curto, claro e fiel aos dados recebidos",\n  "description_html": "descrição em HTML usando somente <p>, <strong>, <em>, <h2>, <h3>, <ul>, <ol>, <li> e <br>. Estruture com abertura, benefícios sustentados pelos dados e orientação de uso somente quando houver base; quando faltar dado específico, use linguagem neutra sem inventar."\n}`;

    const { generateWithOwnKeys } = await import("./ai-translate.server");
    const startedAt = Date.now();
    let raw = "";
    let errorMessage: string | null = null;

    try {
      const generated = await generateWithOwnKeys(SYSTEM, prompt, db);
      if (!generated) {
        errorMessage = "Nenhuma chave de IA configurada. Configure Gemini ou OpenAI em Admin → Integrações.";
      } else {
        raw = generated;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    await db.from("ai_generations").insert({
      user_id: context.userId,
      purpose: "import_product_polish",
      model: "own-keys/fast",
      provider: "own-keys",
      input: { source_id: data.source_id ?? null, title: data.title, prompt: prompt.slice(0, 3000) },
      output: raw.slice(0, 12000),
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      latency_ms: Date.now() - startedAt,
      status: errorMessage ? "error" : "success",
      error: errorMessage,
      related_kind: "product_import",
      related_id: null,
    });

    if (errorMessage) {
      const normalized = errorMessage.toLowerCase();
      if (normalized.includes("429") || normalized.includes("rate limit") || normalized.includes("too many requests")) {
        return { ok: false as const, error: "Limite da sua chave de IA atingido. Aguarde e tente novamente." };
      }
      return { ok: false as const, error: errorMessage };
    }

    try {
      const parsed = extractJson(raw);
      const title = shortenTitle(String(parsed.title ?? data.title));
      const description = stripUnsafeHtml(String(parsed.description_html ?? data.description ?? ""));
      return {
        ok: true as const,
        title: title || cleanText(data.title),
        description: description || data.description || null,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível interpretar a resposta da IA.",
      };
    }
  });
