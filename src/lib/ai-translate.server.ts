import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Tradução usando as chaves próprias do lojista (OpenAI / Gemini) cadastradas
// em Admin → Integrações. NÃO consome créditos do Lovable AI.
// As chaves nunca são retornadas ao cliente nem escritas em log.

export type AiProvider = "openai" | "gemini";

type AiCredential = {
  provider: AiProvider;
  apiKey: string;
  model: string;
};

export const DEFAULT_AI_MODEL: Record<AiProvider, string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
};

/** Ordem padrão: OpenAI como principal, Gemini como fallback automático. */
const DEFAULT_ORDER: AiProvider[] = ["openai", "gemini"];

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

  // Prioridade configurável em config.priority (menor = primeiro), sem mudar a UI.
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

export async function callGemini(
  cred: AiCredential,
  system: string,
  prompt: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cred.model,
  )}:generateContent?key=${encodeURIComponent(cred.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as any;
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => p?.text ?? "").join("").trim();
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
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
 * Gera texto usando a primeira credencial de IA disponível do lojista
 * (principal + fallback automático no outro provedor).
 * Retorna null quando nenhuma chave está configurada ou todas falharam —
 * nesse caso o erro técnico fica gravado na integração correspondente.
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
      // tenta o próximo provedor (fallback automático)
    }
  }
  return null;
}
