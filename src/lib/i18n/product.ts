import { useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import { useI18n } from "./index";

/**
 * Fase 2 — tradução dinâmica de produtos.
 * O conteúdo original (pt-BR) nunca é alterado: as traduções vivem em
 * `product_translations` e são aplicadas apenas na exibição, com fallback
 * seguro para o conteúdo original quando o campo estiver ausente ou vazio.
 */
export type ProductTranslationRow = {
  locale: string;
  name: string | null;
  short_description: string | null;
  description: string | null;
  seo: { meta_title?: string | null; meta_description?: string | null } | null;
};

type TranslatableProduct = {
  name: string;
  short_description?: string | null;
  description?: string | null;
  translations?: ProductTranslationRow[] | null;
};

/** es-MX → es → pt-BR (original). */
function candidates(locale: Locale): string[] {
  if (locale === DEFAULT_LOCALE) return [];
  if (locale.includes("-")) return [locale, locale.split("-")[0]!];
  return [locale];
}

function pick(value: string | null | undefined, fallback: string): string;
function pick(value: string | null | undefined, fallback: string | null): string | null;
function pick(value: string | null | undefined, fallback: string | null) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? value! : fallback;
}

export function localizeProduct<T extends TranslatableProduct>(product: T, locale: Locale) {
  const rows = product.translations ?? [];
  let row: ProductTranslationRow | undefined;
  for (const code of candidates(locale)) {
    row = rows.find((r) => r.locale?.toLowerCase() === code.toLowerCase());
    if (row) break;
  }

  return {
    name: pick(row?.name, product.name),
    short_description: pick(row?.short_description, product.short_description ?? null),
    description: pick(row?.description, product.description ?? null),
    metaTitle: pick(row?.seo?.meta_title, null),
    metaDescription: pick(row?.seo?.meta_description, null),
    isTranslated: Boolean(row),
  };
}

export function useLocalizedProduct<T extends TranslatableProduct>(product: T | null | undefined) {
  const { locale } = useI18n();
  return useMemo(
    () =>
      product
        ? localizeProduct(product, locale)
        : { name: "", short_description: null, description: null, metaTitle: null, metaDescription: null, isTranslated: false },
    [product, locale],
  );
}
