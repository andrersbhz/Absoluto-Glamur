import { createFileRoute } from "@tanstack/react-router";
import { currencyForCountry, localeForCountry } from "@/lib/geo";

/** Detecta o país do visitante pelo IP (cabeçalhos do CDN) para sugerir idioma e moeda. */
export const Route = createFileRoute("/api/public/geo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const h = request.headers;
        const country =
          h.get("cf-ipcountry") ??
          h.get("x-vercel-ip-country") ??
          h.get("x-country-code") ??
          h.get("x-geo-country") ??
          null;
        const normalized = country && country !== "XX" && country !== "T1" ? country.toUpperCase() : null;
        return new Response(
          JSON.stringify({
            country: normalized,
            locale: localeForCountry(normalized),
            currency: currencyForCountry(normalized),
          }),
          { headers: { "content-type": "application/json", "cache-control": "no-store" } },
        );
      },
    },
  },
});
