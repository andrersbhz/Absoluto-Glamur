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

export const suggestNicheKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        niche: z.string().trim().min(2).max(120).default("cosméticos e beleza"),
        product_type: z.string().trim().max(120).optional().default(""),
        count: z.number().int().min(3).max(20).default(8),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<{ keywords: string[]; model: string }> => {
    await assertCatalog(context);
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente. Ative o Lovable AI.");

    const modelId = "google/gemini-3.5-flash";
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway(modelId);

    const system = `Você é um especialista em dropshipping da AliExpress para o mercado brasileiro.
Gere termos de busca curtos (2 a 5 palavras) em INGLÊS, otimizados para encontrar produtos best-sellers
com boa nota de avaliação e alto volume de pedidos no AliExpress. Foque em variações comerciais
(ex.: "hydrating face serum", "vitamin c serum korean"), evitando marcas próprias.
Responda APENAS um JSON array de strings, sem prosa. Exemplo: ["keyword one","keyword two"].`;

    const prompt = `Nicho da loja: ${data.niche}
Tipo/categoria desejada de produto: ${data.product_type || "qualquer subcategoria mais vendida do nicho"}
Quantidade: ${data.count} termos.
Priorize itens tendência de vendas atuais em 2025.`;

    const result = await generateText({ model, system, prompt });
    const raw = result.text.trim();

    // Extract JSON array
    let keywords: string[] = [];
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) keywords = arr.map((s) => String(s).trim()).filter(Boolean);
      } catch { /* ignore */ }
    }
    if (keywords.length === 0) {
      keywords = raw
        .split(/\n|,/)
        .map((s) => s.replace(/^[-*\d.\s"']+|["']+$/g, "").trim())
        .filter((s) => s.length >= 3 && s.length <= 60);
    }
    keywords = Array.from(new Set(keywords)).slice(0, data.count);

    try {
      await context.supabase.from("ai_generations").insert({
        user_id: context.userId,
        purpose: "discovery_keywords",
        model: modelId,
        provider: "lovable-ai",
        input: { niche: data.niche, product_type: data.product_type, count: data.count },
        output: JSON.stringify({ keywords }),
        status: "success",
      });
    } catch { /* ignore logging errors */ }

    return { keywords, model: modelId };
  });
