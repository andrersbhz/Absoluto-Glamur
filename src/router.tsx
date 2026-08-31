import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Prefixos de idioma suportados nas URLs (Fase 1).
 * O idioma padrão (pt-BR) continua sem prefixo, preservando todas as URLs atuais.
 */
const LOCALE_PREFIXES = ["es-mx", "en", "es"] as const;

function matchPrefix(pathname: string): string | null {
  const first = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (!first) return null;
  return (LOCALE_PREFIXES as readonly string[]).includes(first) ? first : null;
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  // Prefixo ativo do documento atual. Uma instância de router é criada por
  // requisição (SSR) e por carregamento de página (cliente), então guardar o
  // prefixo no closure mantém as URLs traduzidas em toda a navegação interna
  // sem duplicar nenhuma rota do projeto.
  let activePrefix = "";

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    rewrite: {
      // URL do navegador -> rota interna (remove o prefixo de idioma)
      input: ({ url }) => {
        const prefix = matchPrefix(url.pathname);
        if (!prefix) return undefined;
        activePrefix = prefix;
        const rest = url.pathname.slice(prefix.length + 1);
        const next = new URL(url.href);
        next.pathname = rest.startsWith("/") ? rest : `/${rest}` === "/" ? "/" : `/${rest}`;
        if (next.pathname === "") next.pathname = "/";
        return next;
      },
      // Rota interna -> URL do navegador (reaplica o prefixo ativo)
      output: ({ url }) => {
        if (!activePrefix) return undefined;
        if (matchPrefix(url.pathname)) return undefined;
        const next = new URL(url.href);
        next.pathname =
          url.pathname === "/" ? `/${activePrefix}` : `/${activePrefix}${url.pathname}`;
        return next;
      },
    },
  });

  return router;
};
