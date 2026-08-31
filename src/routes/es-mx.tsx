import { createFileRoute } from "@tanstack/react-router";
import { Index } from "./index";
import { hreflangLinks } from "@/lib/i18n/seo";

export const Route = createFileRoute("/es-mx")({
  head: () => ({
    meta: [
      { title: "Absoluto Glamur · Belleza premium en México" },
      {
        name: "description",
        content:
          "Absoluto Glamur — maison digital de belleza. Skincare, maquillaje y cuidado del cabello con envío a México.",
      },
      { property: "og:title", content: "Absoluto Glamur · Belleza premium en México" },
      {
        property: "og:description",
        content: "Skincare, maquillaje y cuidado del cabello con envío a México.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://absolutoglamur.com.br/es-mx" },
    ],
    links: [
      { rel: "canonical", href: "https://absolutoglamur.com.br/es-mx" },
      ...hreflangLinks("/"),
    ],
  }),
  component: Index,
});
