import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Tradução usando as chaves próprias do lojista cadastradas em Admin → Integrações.
// Gemini é o provedor principal por padrão por possuir camada gratuita adequada a tradução.
// OpenAI permanece disponível apenas como fallback quando estiver habilitada e com saldo.
// As chaves nunca são retornadas ao cliente nem escritas em log.

export type AiProvider = "openai" | "gemini";

type AiCredential = {
  provider: AiProvider;
  apiKey: string;
  model: string;
};

export const DEFAULT_AI_MODEL: Record<AiProvider, string> = {
  gemini: "gemini-3.5-flash-lite",
  openai: "gpt-4o-mini",
};

/** Ordem padrão: Gemini gratuito primeiro; OpenAI somente como fallback. */
const DEFAULT_ORDER: AiProvider[] = ["gemini", "openai"];

function readCredential(row: any): AiCredential | null {
  if (!row) return null;
  const provider = row.provider as AiProvider;
  if (row.enabled === false) return null;
  const apiKey = typeof row.api_key === "string" ? row.api_key.trim() : "";
  if (!apiKey) return null;
  const model =
    (row.config && typeof row.config.model === "string" && row.config.model.trim()) ||
    DEFAULT_AI_MODEL[provider];
  return { provider, apiKey, model };
}

/** Carrega a credencial de um provedor específico (sem expor a chave ao cliente). */
export async function loadAiCredential(provider: AiProvider): Promise<AiCredential | null> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("provider, api_key, enabled, config")
    .eq("provider", provider)
    .maybeSingle();
  return readCredential(data);
}

async function loadAiCredentials(): Promise<AiCredential[]> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("provider, api_key, enabled, config")
    .eq("category", "ai");
  const rows = (data ?? []) as any[];

  const order = [...DEFAULT_ORDER].sort((a, b) => {
    const pa = Number((rows.find((r) => r.provider === a)?.config as any)?.priority ?? NaN);
    const pb = Number((rows.find((r) => r.provider === b)?.config as any)?.priority ?? NaN);
    if (Number.isFinite(pa) && Number.isFinite(pb)) return pa - pb;
    if (Number.isFinite(pa)) return -1;
    if (Number.isFinite(pb)) return 1;
    return DEFAULT_ORDER.indexOf(a) - DEFAULT_ORDER.indexOf(b);
  });

  const out: AiCredential[] = [];
  for (const provider of order) {
    const cred = readCredential(rows.find((r) => r.provider === provider));
    if (cred) out.push(cred);
  }
  return out;
}

async function callGeminiModel(
  apiKey: string,
  model: string,
  system: string,
  prompt: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 350);
    throw new Error(`gemini ${res.status} (${model}): ${body}`);
  }
  const json = (await res.json()) as any;
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p: any) => p?.text ?? "")
    .join("")
    .trim();
}

export async function callGemini(
  cred: AiCredential,
  system: string,
  prompt: string,
): Promise<string> {
  // Se o modelo configurado não existir/estiver indisponível, tenta outro modelo gratuito atual.
  const models = Array.from(
    new Set([cred.model, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]),
  );
  let lastError: Error | null = null;
  for (const model of models) {
    try {
      return await callGeminiModel(cred.apiKey, model, system, prompt);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // Chave inválida não será resolvida trocando de modelo.
      if (/API_KEY_INVALID|API key not valid/i.test(lastError.message)) throw lastError;
      // Limite/quota também não deve provocar várias chamadas inúteis.
      if (/RESOURCE_EXHAUSTED|quota|rate limit/i.test(lastError.message)) throw lastError;
    }
  }
  throw lastError ?? new Error("Gemini não retornou resposta.");
}

export async function callOpenAi(
  cred: AiCredential,
  system: string,
  prompt: string,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cred.apiKey}`,
    },
    body: JSON.stringify({
      model: cred.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 350)}`);
  const json = (await res.json()) as any;
  return String(json?.choices?.[0]?.message?.content ?? "").trim();
}

export async function callAiProvider(
  cred: AiCredential,
  system: string,
  prompt: string,
): Promise<string> {
  return cred.provider === "gemini"
    ? callGemini(cred, system, prompt)
    : callOpenAi(cred, system, prompt);
}

async function recordProviderStatus(provider: AiProvider, error: string | null) {
  try {
    await supabaseAdmin
      .from("integrations")
      .update({
        last_verified_at: new Date().toISOString(),
        last_status: error ? "error" : "ok",
        last_error: error ? error.slice(0, 500) : null,
      })
      .eq("provider", provider);
  } catch {
    // status é diagnóstico; nunca deve derrubar a tradução
  }
}

/**
 * Gera texto usando a primeira credencial habilitada.
 * A falha de IA NUNCA impede a importação: retorna null e o chamador preserva o texto original.
 */
export async function generateWithOwnKeys(system: string, prompt: string): Promise<string | null> {
  let creds: AiCredential[] = [];
  try {
    creds = await loadAiCredentials();
  } catch {
    return null;
  }
  for (const cred of creds) {
    try {
      const text = await callAiProvider(cred, system, prompt);
      if (text) {
        await recordProviderStatus(cred.provider, null);
        return text;
      }
      await recordProviderStatus(cred.provider, "Resposta vazia do provedor de IA.");
    } catch (e) {
      await recordProviderStatus(cred.provider, e instanceof Error ? e.message : String(e));
    }
  }
  return null;
}
