import { createFileRoute, redirect } from "@tanstack/react-router";
import { Index } from "./index";
export const Route = createFileRoute("/fr/$")({ beforeLoad: ({ params }) => { const rest = (params as { _splat?: string })._splat ?? ""; if (!rest) return; if (typeof window !== "undefined") { localStorage.setItem("ag:locale", "fr-FR"); document.cookie = "ag_locale=fr-FR; path=/; max-age=31536000; samesite=lax"; } throw redirect({ href: `/${rest}`, replace: true }); }, component: Index });
