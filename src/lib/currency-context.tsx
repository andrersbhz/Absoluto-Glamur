import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCurrencyTable, refreshExchangeRates, type CurrencyCode, type CurrencyTable } from "@/lib/currency.functions";
import { LOCALE_CONFIG, useI18n } from "@/lib/i18n";
import { formatBRL } from "@/lib/format";
import { fetchGeoHint } from "@/lib/geo";

const STORAGE_KEY = "ag:currency";

export const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "es-ES",
  GBP: "en-GB",
  CAD: "en-CA",
  MXN: "es-MX",
  COP: "es-CO",
  CLP: "es-CL",
  ARS: "es-AR",
  PEN: "es-PE",
};

type CurrencyValue = {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  available: CurrencyCode[];
  /** Formata um valor em centavos de BRL na moeda ativa. */
  format: (brlCents: number | null | undefined) => string;
  /** Verdadeiro quando a moeda ativa é a base (sem conversão). */
  isBase: boolean;
};

const CurrencyContext = createContext<CurrencyValue | null>(null);

function convert(brlCents: number, table: CurrencyTable | undefined, currency: CurrencyCode) {
  if (currency === "BRL" || !table) return null;
  const row = table.rates.find((r) => r.currency === currency);
  if (!row) return null;
  const converted =
    (brlCents / 100) * row.rate * (1 + row.marginPct / 100) * (1 + row.markupPct / 100);
  return converted;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const fetchTable = useServerFn(getCurrencyTable);
  const refresh = useServerFn(refreshExchangeRates);
  const { data: table, refetch } = useQuery({
    queryKey: ["currency-table"],
    queryFn: () => fetchTable({}),
    staleTime: 60 * 60 * 1000,
  });

  // Atualiza as cotações no máximo a cada 6 horas (o servidor respeita o cache).
  useEffect(() => {
    if (!table) return;
    const newest = table.rates
      .map((r) => (r.fetchedAt ? new Date(r.fetchedAt).getTime() : 0))
      .sort((a, b) => b - a)[0];
    if (newest && Date.now() - newest < 6 * 60 * 60 * 1000) return;
    let cancelled = false;
    refresh({}).then((res) => {
      if (!cancelled && res?.ok && !res.skipped) void refetch();
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [table, refresh, refetch]);

  const localeCurrency = LOCALE_CONFIG[locale].currency as CurrencyCode;
  const [override, setOverride] = useState<CurrencyCode | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as CurrencyCode | null;
      if (stored && stored in CURRENCY_LOCALE) {
        setOverride(stored);
        return;
      }
    } catch {
      /* ignore */
    }
    // Sem escolha do visitante: a moeda segue o país detectado pelo IP.
    let cancelled = false;
    void fetchGeoHint().then((hint) => {
      const code = hint.currency as CurrencyCode | null;
      if (!cancelled && code && code in CURRENCY_LOCALE) setOverride(code);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currency = override ?? localeCurrency;

  const setCurrency = useCallback((next: CurrencyCode) => {
    setOverride(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const format = useCallback(
    (brlCents: number | null | undefined) => {
      const cents = brlCents ?? 0;
      const converted = convert(cents, table, currency);
      if (converted === null) return formatBRL(cents);
      return converted.toLocaleString(CURRENCY_LOCALE[currency], {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      });
    },
    [table, currency],
  );

  const available = useMemo<CurrencyCode[]>(
    () => ["BRL", ...((table?.rates ?? []).map((r) => r.currency) as CurrencyCode[])],
    [table],
  );

  const value = useMemo<CurrencyValue>(
    () => ({ currency, setCurrency, available, format, isBase: currency === "BRL" }),
    [currency, setCurrency, available, format],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyValue {
  const ctx = useContext(CurrencyContext);
  if (ctx) return ctx;
  return {
    currency: "BRL",
    setCurrency: () => {},
    available: ["BRL"],
    format: (cents) => formatBRL(cents),
    isBase: true,
  };
}
