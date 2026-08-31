import { createFileRoute } from "@tanstack/react-router";
import { Index } from "./index";
import { hreflangLinks } from "@/lib/i18n/seo";

export const Route = createFileRoute("/en")({
  head: () => ({
    meta: [
      { title: "Absoluto Glamur · Premium curated beauty" },
      {
        name: "description",
        content:
          "Absoluto Glamur — a digital beauty maison. Curated skincare, makeup and hair care with worldwide shipping.",
      },
      { property: "og:title", content: "Absoluto Glamur · Premium curated beauty" },
      {
        property: "og:description",
        content: "Curated skincare, makeup and hair care with worldwide shipping.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://absolutoglamur.com.br/en" },
    ],
    links: [
      { rel: "canonical", href: "https://absolutoglamur.com.br/en" },
      ...hreflangLinks("/"),
    ],
  }),
  component: Index,
});
