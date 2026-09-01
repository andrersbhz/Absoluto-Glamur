import { createFileRoute, redirect } from "@tanstack/react-router";
import { Index } from "./index";

export const Route = createFileRoute("/es/$")({
  beforeLoad: ({ params }) => {
    const rest = (params as { _splat?: string })._splat ?? "";
    if (!rest) return;
    if (typeof window !== "undefined") {
      // Mantém o idioma ao redirecionar um deep link com prefixo para a rota canônica.
      try {
        window.localStorage.setItem("ag:locale", "es");
        document.cookie = "ag_locale=es; path=/; max-age=31536000; samesite=lax";
      } catch {
        /* ignore */
      }
    }
    throw redirect({ href: `/${rest}`, replace: true });
  },
  component: Index,
});
