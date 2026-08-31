import { createFileRoute } from "@tanstack/react-router";
import { Index } from "./index";
import { hreflangLinks } from "@/lib/i18n/seo";

export const Route = createFileRoute("/es")({
  head: () => ({
    meta: [
      { title: "Absoluto Glamur · Belleza premium con curaduría" },
      {
        name: "description",
        content:
          "Absoluto Glamur — maison digital de belleza. Skincare, maquillaje y cuidado del cabello con envío internacional.",
      },
      { property: "og:title", content: "Absoluto Glamur · Belleza premium" },
      {
        property: "og:description",
        content: "Skincare, maquillaje y cuidado del cabello con envío internacional.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://absolutoglamur.com.br/es" },
    ],
    links: [
      { rel: "canonical", href: "https://absolutoglamur.com.br/es" },
      ...hreflangLinks("/"),
    ],
  }),
  component: Index,
});
