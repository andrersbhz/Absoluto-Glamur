import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n";
import { useMemo } from "react";

/**
 * Tradução dos textos editáveis da loja (categorias, coleções, blocos e
 * conteúdo da home). O conteúdo original em pt-BR nunca é alterado: as
 * traduções vivem em `content_translations` e são aplicadas só na exibição.
 */
export type ContentScope = "category" | "collection" | "block" | "home";

type Row = { scope: string; ref_id: string; locale: string; fields: Record<string, string> };

export function contentTranslationsQuery() {
  return queryOptions({
    queryKey: ["content-translations"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("content_translations")
        .select("scope, ref_id, locale, fields");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        scope: r.scope,
        ref_id: r.ref_id,
        locale: r.locale,
        fields: (r.fields ?? {}) as Record<string, string>,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

/** es-MX → es (fallback antes do original). */
function candidates(locale: Locale): string[] {
  if (locale === DEFAULT_LOCALE) return [];
  if (locale.includes("-")) return [locale, locale.split("-")[0]!];
  return [locale];
}

export type ContentTranslator = <T extends string | null | undefined>(
  scope: ContentScope,
  refId: string | null | undefined,
  field: string,
  fallback: T,
) => T | string;

export function buildTranslator(rows: Row[], locale: Locale): ContentTranslator {
  const codes = candidates(locale);
  return (scope, refId, field, fallback) => {
    if (!refId || codes.length === 0) return fallback;
    for (const code of codes) {
      const row = rows.find(
        (r) =>
          r.scope === scope &&
          r.ref_id === refId &&
          r.locale.toLowerCase() === code.toLowerCase(),
      );
      const value = row?.fields?.[field];
      if (typeof value === "string" && value.trim().length > 0) return value;
    }
    return fallback;
  };
}

/** Hook de exibição: `ct("category", id, "name", category.name)`. */
export function useContentText(): ContentTranslator {
  const { locale } = useI18n();
  const { data } = useQuerySafe();
  return useMemo(() => buildTranslator(data ?? [], locale), [data, locale]);
}

// Import tardio para manter o helper enxuto no topo do arquivo.
import { useQuery } from "@tanstack/react-query";
function useQuerySafe() {
  return useQuery(contentTranslationsQuery());
}
