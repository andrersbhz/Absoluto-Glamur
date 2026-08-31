/**
 * Fase 1 — Internacionalização.
 * Configuração central de idiomas. Nenhum comportamento existente muda:
 * pt-BR continua sendo o idioma padrão e as URLs atuais permanecem canônicas.
 */

export const LOCALES = ["pt-BR", "en-US", "es", "es-MX"] as const;
export type Locale = (typeof LOCALES)[number];

/** Idiomas preparados para ativação futura (Fase 1 — arquitetura). */
export const PLANNED_LOCALES = ["fr-FR", "it-IT", "de-DE"] as const;

export const DEFAULT_LOCALE: Locale = "pt-BR";

export type LocaleConfig = {
  code: Locale;
  /** Prefixo de URL. O idioma padrão não usa prefixo (URLs atuais preservadas). */
  prefix: "" | "en" | "es" | "es-mx";
  label: string;
  flag: string;
  /** Moeda sugerida (a conversão em si chega na Fase 4). */
  currency: "BRL" | "USD" | "EUR" | "MXN";
  htmlLang: string;
  hreflang: string;
};

export const LOCALE_CONFIG: Record<Locale, LocaleConfig> = {
  "pt-BR": {
    code: "pt-BR",
    prefix: "",
    label: "Português (Brasil)",
    flag: "🇧🇷",
    currency: "BRL",
    htmlLang: "pt-BR",
    hreflang: "pt-BR",
  },
  "en-US": {
    code: "en-US",
    prefix: "en",
    label: "English (US)",
    flag: "🇺🇸",
    currency: "USD",
    htmlLang: "en",
    hreflang: "en-US",
  },
  es: {
    code: "es",
    prefix: "es",
    label: "Español",
    flag: "🇪🇸",
    currency: "EUR",
    htmlLang: "es",
    hreflang: "es",
  },
  "es-MX": {
    code: "es-MX",
    prefix: "es-mx",
    label: "Español (México)",
    flag: "🇲🇽",
    currency: "MXN",
    htmlLang: "es-MX",
    hreflang: "es-MX",
  },
};

export const LOCALE_LIST: LocaleConfig[] = LOCALES.map((l) => LOCALE_CONFIG[l]);

const PREFIX_TO_LOCALE: Record<string, Locale> = {
  en: "en-US",
  es: "es",
  "es-mx": "es-MX",
};

/** Descobre o idioma a partir do primeiro segmento da URL. */
export function localeFromPathname(pathname: string): Locale | null {
  const first = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (!first) return null;
  return PREFIX_TO_LOCALE[first] ?? null;
}

/** Remove o prefixo de idioma de um caminho, devolvendo a rota canônica. */
export function stripLocalePrefix(pathname: string): string {
  const locale = localeFromPathname(pathname);
  if (!locale) return pathname || "/";
  const prefix = LOCALE_CONFIG[locale].prefix;
  const rest = pathname.slice(prefix.length + 1);
  return rest.startsWith("/") ? rest : `/${rest}`;
}

/**
 * Aplica o prefixo do idioma a um caminho canônico.
 * Hoje apenas a home possui variantes com prefixo (/en, /es, /es-mx);
 * as demais rotas mantêm a URL canônica e o idioma persiste por preferência.
 */
export function localizePath(pathname: string, locale: Locale): string {
  const canonical = stripLocalePrefix(pathname) || "/";
  const prefix = LOCALE_CONFIG[locale].prefix;
  if (!prefix || canonical !== "/") return canonical;
  return `/${prefix}`;
}


/** Converte um idioma de navegador (navigator.language) no locale suportado mais próximo. */
export function matchSupportedLocale(input: string | undefined | null): Locale | null {
  if (!input) return null;
  const value = input.toLowerCase();
  if (value.startsWith("pt")) return "pt-BR";
  if (value === "es-mx") return "es-MX";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("en")) return "en-US";
  return null;
}
