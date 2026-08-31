import { LOCALE_LIST, localizePath } from "./locales";

const SITE_URL = "https://absolutoglamur.com.br";

/**
 * Gera as tags <link rel="alternate" hreflang> de uma rota canônica.
 * Usar sempre o caminho SEM prefixo de idioma (ex.: "/", "/products").
 */
export function hreflangLinks(canonicalPath: string) {
  const links = LOCALE_LIST.map((l) => ({
    rel: "alternate",
    hrefLang: l.hreflang,
    href: `${SITE_URL}${localizePath(canonicalPath, l.code)}`,
  }));
  links.push({
    rel: "alternate",
    hrefLang: "x-default",
    href: `${SITE_URL}${canonicalPath === "/" ? "/" : canonicalPath}`,
  });
  return links;
}

export { SITE_URL };
