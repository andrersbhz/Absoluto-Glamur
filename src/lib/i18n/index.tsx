import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "@tanstack/react-router";
import { DICTIONARIES, type TranslationKey } from "./dictionaries";
import {
  DEFAULT_LOCALE,
  LOCALE_CONFIG,
  localeFromPathname,
  localizePath,
  matchSupportedLocale,
  stripLocalePrefix,
  type Locale,
} from "./locales";

export * from "./locales";
export type { TranslationKey };

const STORAGE_KEY = "ag:locale";

/** Cadeia de fallback: es-MX → es → pt-BR. */
function fallbackChain(locale: Locale): Locale[] {
  if (locale === "es-MX") return ["es-MX", "es", DEFAULT_LOCALE];
  if (locale === DEFAULT_LOCALE) return [DEFAULT_LOCALE];
  return [locale, DEFAULT_LOCALE];
}

export function translate(locale: Locale, key: TranslationKey): string {
  for (const candidate of fallbackChain(locale)) {
    const dict = DICTIONARIES[candidate] as Record<string, string> | undefined;
    const value = dict?.[key];
    if (value) return value;
  }
  return key;
}

type I18nValue = {
  locale: Locale;
  /** Idioma vindo da URL (fonte de verdade quando presente). */
  urlLocale: Locale | null;
  t: (key: TranslationKey) => string;
  setLocale: (locale: Locale) => void;
  /** Caminho canônico (sem prefixo de idioma) da rota atual. */
  canonicalPath: string;
  localizePath: (path: string, locale?: Locale) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? matchSupportedLocale(stored) : null;
  } catch {
    return null;
  }
}

function persistLocale(locale: Locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.cookie = `ag_locale=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* ignore */
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const urlLocale = localeFromPathname(location.pathname);
  const [preferred, setPreferred] = useState<Locale | null>(null);

  // Preferência salva + idioma do navegador só são lidos no cliente,
  // evitando divergência de hidratação no SSR.
  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) {
      setPreferred(stored);
      return;
    }
    const browser = matchSupportedLocale(
      typeof navigator !== "undefined" ? navigator.language : null,
    );
    if (browser) setPreferred(browser);
  }, []);

  const locale: Locale = urlLocale ?? preferred ?? DEFAULT_LOCALE;
  const canonicalPath = stripLocalePrefix(location.pathname);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = LOCALE_CONFIG[locale].htmlLang;
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      persistLocale(next);
      setPreferred(next);
      if (typeof window === "undefined") return;
      const target = localizePath(window.location.pathname, next);
      if (target !== window.location.pathname) {
        window.location.assign(`${target}${window.location.search}`);
      }
    },
    [],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      urlLocale,
      canonicalPath,
      t: (key: TranslationKey) => translate(locale, key),
      setLocale,
      localizePath: (path: string, target?: Locale) => localizePath(path, target ?? locale),
    }),
    [locale, urlLocale, canonicalPath, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // Fallback seguro caso um componente seja renderizado fora do provider.
  return {
    locale: DEFAULT_LOCALE,
    urlLocale: null,
    canonicalPath: "/",
    t: (key: TranslationKey) => translate(DEFAULT_LOCALE, key),
    setLocale: () => {},
    localizePath: (path: string) => path,
  };
}
