import type { Locale } from "@/lib/i18n/locales";

/** País (ISO-2) → idioma da loja. */
const COUNTRY_LOCALE: Record<string, Locale> = {
  BR: "pt-BR",
  PT: "pt-BR",
  AO: "pt-BR",
  MZ: "pt-BR",
  US: "en-US",
  GB: "en-US",
  CA: "en-US",
  AU: "en-US",
  NZ: "en-US",
  IE: "en-US",
  IN: "en-US",
  ZA: "en-US",
  MX: "es-MX",
  ES: "es",
  AR: "es",
  CL: "es",
  CO: "es",
  PE: "es",
  UY: "es",
  PY: "es",
  BO: "es",
  EC: "es",
  VE: "es",
  CR: "es",
  PA: "es",
  DO: "es",
  GT: "es",
  FR: "fr-FR",
  BE: "fr-FR",
  LU: "fr-FR",
  MC: "fr-FR",
  IT: "it-IT",
  SM: "it-IT",
  DE: "de-DE",
  AT: "de-DE",
  CH: "de-DE",
};

/** País (ISO-2) → moeda sugerida. */
const COUNTRY_CURRENCY: Record<string, string> = {
  BR: "BRL",
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  MX: "MXN",
  CO: "COP",
  CL: "CLP",
  AR: "ARS",
  PE: "PEN",
  ES: "EUR",
  PT: "EUR",
  FR: "EUR",
  IT: "EUR",
  DE: "EUR",
  AT: "EUR",
  BE: "EUR",
  IE: "EUR",
  NL: "EUR",
  LU: "EUR",
};

export function localeForCountry(country: string | null | undefined): Locale | null {
  if (!country) return null;
  return COUNTRY_LOCALE[country.toUpperCase()] ?? null;
}

export function currencyForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? null;
}

export type GeoHint = { country: string | null; locale: Locale | null; currency: string | null };

let cached: Promise<GeoHint> | null = null;

/** Busca (uma vez por sessão) o país do visitante para sugerir idioma e moeda. */
export function fetchGeoHint(): Promise<GeoHint> {
  if (typeof window === "undefined") return Promise.resolve({ country: null, locale: null, currency: null });
  if (!cached) {
    cached = fetch("/api/public/geo")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => ({
        country: json?.country ?? null,
        locale: (json?.locale ?? null) as Locale | null,
        currency: json?.currency ?? null,
      }))
      .catch(() => ({ country: null, locale: null, currency: null }));
  }
  return cached;
}
