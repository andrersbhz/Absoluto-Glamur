import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Tradução usando as chaves próprias do lojista (Gemini / OpenAI) cadastradas
// em Admin → Integrações. NÃO consome créditos do Lovable AI.

type AiCredential = {
  provider: "gemini" | "openai";
  apiKey: string;
  model: string;
};

const DEFAULT_MODEL: Record<string, string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
};

async function loadAiCredentials(): Promise<AiCredential[]> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("provider, api_key, enabled, config")
    .eq("category", "ai");
  const rows = (data ?? []) as any[];
  const out: AiCredential[] = [];
  // Preferência: Gemini (mais barato) → OpenAI.
  for (const provider of ["gemini", "openai"] as const) {
    const row = rows.find((r) => r.provider === provider);
    if (!row || row.enabled === false) continue;
    const apiKey = typeof row.api_key === "string" ? row.api_key.trim() : "";
    if (!apiKey) continue;
    const model =
      (row.config && typeof row.config.model === "string" && row.config.model.trim()) ||
      DEFAULT_MODEL[provider];
    out.push({ provider, apiKey, model });
  }
  return out;
}

async function callGemini(cred: AiCredential, system: string, prompt: string): Promise<string> {
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

async function callOpenAi(cred: AiCredential, system: string, prompt: string): Promise<string> {
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

/**
 * Gera texto usando a primeira credencial de IA disponível do lojista.
 * Retorna null quando nenhuma chave está configurada ou todas falharam.
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
      const text =
        cred.provider === "gemini"
          ? await callGemini(cred, system, prompt)
          : await callOpenAi(cred, system, prompt);
      if (text) return text;
    } catch {
      // tenta o próximo provedor
    }
  }
  return null;
}
