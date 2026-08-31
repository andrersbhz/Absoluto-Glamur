import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type CurrencyCode = "BRL" | "USD" | "EUR" | "MXN";

export type CurrencyRate = {
  currency: CurrencyCode;
  /** Cotação bruta a partir de BRL (1 BRL = rate <currency>). */
  rate: number;
  /** Margem de segurança aplicada sobre a cotação, em %. */
  marginPct: number;
  /** Markup regional configurado no painel Internacional, em %. */
  markupPct: number;
  fetchedAt: string | null;
};

export type CurrencyTable = {
  base: "BRL";
  rates: CurrencyRate[];
};

function publicClient() {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Fase 4 — Câmbio. Leitura pública das cotações em cache (tabela exchange_rates)
 * combinada com o markup por região (tabela regions, Fase 5).
 * Nunca altera preços em BRL: a moeda base do catálogo continua sendo o real.
 */
export const getCurrencyTable = createServerFn({ method: "GET" }).handler(
  async (): Promise<CurrencyTable> => {
    const supabase = publicClient();

    const [ratesRes, regionsRes] = await Promise.all([
      supabase
        .from("exchange_rates")
        .select("target_currency, rate, margin_pct, fetched_at")
        .eq("base_currency", "BRL"),
      supabase.from("regions").select("currency, markup_pct, is_active").eq("is_active", true),
    ]);

    const markupByCurrency = new Map<string, number>();
    for (const region of regionsRes.data ?? []) {
      const current = markupByCurrency.get(region.currency);
      const value = Number(region.markup_pct ?? 0);
      if (current === undefined || value < current) markupByCurrency.set(region.currency, value);
    }

    const rates: CurrencyRate[] = (ratesRes.data ?? []).map((row) => ({
      currency: row.target_currency as CurrencyCode,
      rate: Number(row.rate),
      marginPct: Number(row.margin_pct ?? 0),
      markupPct: markupByCurrency.get(row.target_currency) ?? 0,
      fetchedAt: row.fetched_at ?? null,
    }));

    return { base: "BRL", rates };
  },
);

const RATE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Atualiza as cotações a partir de uma fonte pública gratuita, respeitando um
 * cache de 6 horas. Chamado sob demanda; falhas mantêm a cotação anterior.
 */
export const refreshExchangeRates = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("exchange_rates")
    .select("target_currency, fetched_at")
    .eq("base_currency", "BRL");

  const newest = (existing ?? [])
    .map((r) => (r.fetched_at ? new Date(r.fetched_at).getTime() : 0))
    .sort((a, b) => b - a)[0];

  if (newest && Date.now() - newest < RATE_TTL_MS) {
    return { ok: true, skipped: true as const };
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/BRL");
    if (!res.ok) return { ok: false, skipped: false as const };
    const json = (await res.json()) as { rates?: Record<string, number> };
    const targets: CurrencyCode[] = ["USD", "EUR", "MXN"];
    const now = new Date().toISOString();

    for (const currency of targets) {
      const rate = json.rates?.[currency];
      if (!rate || !Number.isFinite(rate) || rate <= 0) continue;
      await supabaseAdmin
        .from("exchange_rates")
        .update({ rate, source: "open.er-api.com", fetched_at: now })
        .eq("base_currency", "BRL")
        .eq("target_currency", currency);
    }

    return { ok: true, skipped: false as const };
  } catch {
    return { ok: false, skipped: false as const };
  }
});
