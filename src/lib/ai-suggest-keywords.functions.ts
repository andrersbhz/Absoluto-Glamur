import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

type AiProvider = "gemini" | "openai";
type AiCredential = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  priority: number;
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-3.5-flash-lite",
  openai: "gpt-5-mini",
};

async function assertCatalog(context: any) {
  const { data: adm } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (adm) return;
  const { data: hasCat } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "catalog",
  });
  if (!hasCat) throw new Error("Acesso restrito a administradores ou equipe de catálogo");
}

async function loadOwnAiCredentials(context: any): Promise<AiCredential[]> {
  const { data, error } = await context.supabase
    .from("integrations")
    .select("provider,api_key,enabled,category,config")
    .eq("category", "ai")
    .in("provider", ["gemini", "openai"]);

  if (error) {
    throw new Error(`Não foi possível ler as integrações de IA: ${error.message}`);
  }

  const credentials: AiCredential[] = [];
  for (const row of data ?? []) {
    if (row.enabled === false) continue;
    const provider = row.provider === "gemini" || row.provider === "openai" ? row.provider : null;
    if (!provider) continue;
    const apiKey = typeof row.api_key === "string" ? row.api_key.trim() : "";
    if (!apiKey) continue;
    const config = (row.config ?? {}) as Record<string, unknown>;
    const model = typeof config.model === "string" && config.model.trim()
      ? config.model.trim()
      : DEFAULT_MODELS[provider];
    const priorityRaw = Number(config.priority);
    credentials.push({
      provider,
      apiKey,
      model,
      priority: Number.isFinite(priorityRaw) ? priorityRaw : provider === "gemini" ? 1 : 99,
    });
  }

  return credentials.sort((a, b) => a.priority - b.priority);
}

async function callGemini(credential: AiCredential, system: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    credential.model,
  )}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": credential.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${body.slice(0, 350)}`);
  }

  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("Gemini retornou uma resposta inválida.");
  }
  const text = (json?.candidates?.[0]?.content?.parts ?? [])
    .map((part: any) => part?.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini retornou resposta vazia.");
  return text;
}

async function callOpenAi(credential: AiCredential, system: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential.apiKey}`,
    },
    body: JSON.stringify({
      model: credential.model,
      instructions: system,
      input: prompt,
      store: false,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 350)}`);
  }

  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("OpenAI retornou uma resposta inválida.");
  }

  const direct = typeof json?.output_text === "string" ? json.output_text.trim() : "";
  if (direct) return direct;
  const text = (json?.output ?? [])
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .filter((part: any) => part?.type === "output_text" || typeof part?.text === "string")
    .map((part: any) => part?.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("OpenAI retornou resposta vazia.");
  return text;
}

async function generateWithOwnIntegration(
  context: any,
  system: string,
  prompt: string,
): Promise<{ text: string; provider: AiProvider; model: string }> {
  const credentials = await loadOwnAiCredentials(context);
  if (!credentials.length) {
    throw new Error(
      "Nenhuma IA própria está configurada. Ative Gemini ou OpenAI em Admin → Integrações e informe a API key.",
    );
  }

  const failures: string[] = [];
  for (const credential of credentials) {
    try {
      const text = credential.provider === "gemini"
        ? await callGemini(credential, system, prompt)
        : await callOpenAi(credential, system, prompt);
      return { text, provider: credential.provider, model: credential.model };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    `As integrações de IA configuradas falharam: ${failures.slice(0, 2).join(" | ")}`,
  );
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

    const system = `Você é um especialista em descoberta de produtos da AliExpress para o mercado brasileiro.
Gere termos de busca curtos (2 a 5 palavras) em INGLÊS, adequados para localizar produtos com forte intenção comercial,
boa avaliação e alto volume de pedidos no AliExpress. Foque em variações comerciais úteis
(ex.: "hydrating face serum", "vitamin c serum korean"), evitando marcas próprias e alegações médicas.
Responda APENAS um JSON array de strings, sem prosa. Exemplo: ["keyword one","keyword two"].`;

    const prompt = `Nicho da loja: ${data.niche}
Tipo/categoria desejada de produto: ${data.product_type || "qualquer subcategoria relevante do nicho"}
Quantidade: ${data.count} termos.
Ano de referência: ${new Date().getUTCFullYear()}.
Priorize termos comerciais atuais e evergreen; a classificação final por vendas e avaliação será feita com os dados reais retornados pela API oficial do AliExpress.`;

    const generated = await generateWithOwnIntegration(context, system, prompt);
    const raw = generated.text.trim();

    let keywords: string[] = [];
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) keywords = arr.map((s) => String(s).trim()).filter(Boolean);
      } catch {
        // fallback abaixo
      }
    }
    if (keywords.length === 0) {
      keywords = raw
        .split(/\n|,/)
        .map((s) => s.replace(/^[-*\d.\s"']+|["']+$/g, "").trim())
        .filter((s) => s.length >= 3 && s.length <= 60);
    }
    keywords = Array.from(new Set(keywords)).slice(0, data.count);
    if (!keywords.length) throw new Error("A IA não retornou palavras-chave válidas para a busca.");

    try {
      await context.supabase.from("ai_generations").insert({
        user_id: context.userId,
        purpose: "discovery_keywords",
        model: generated.model,
        provider: generated.provider,
        input: { niche: data.niche, product_type: data.product_type, count: data.count },
        output: JSON.stringify({ keywords }),
        status: "success",
      });
    } catch {
      // logging não pode impedir a descoberta
    }

    return { keywords, model: generated.model };
  });
