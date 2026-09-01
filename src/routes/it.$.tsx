import { createFileRoute, redirect } from "@tanstack/react-router";
import { Index } from "./index";
export const Route = createFileRoute("/it/$")({ beforeLoad: ({ params }) => { const rest = (params as { _splat?: string })._splat ?? ""; if (!rest) return; if (typeof window !== "undefined") { localStorage.setItem("ag:locale", "it-IT"); document.cookie = "ag_locale=it-IT; path=/; max-age=31536000; samesite=lax"; } throw redirect({ href: `/${rest}`, replace: true }); }, component: Index });
