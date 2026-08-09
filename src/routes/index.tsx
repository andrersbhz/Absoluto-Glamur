import { createFileRoute } from "@tanstack/react-router";
import { HomePageV12 } from "@/components/store/HomePageV12";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Absoluto Glamur · Cosméticos premium com curadoria" },
      {
        name: "description",
        content:
          "Absoluto Glamur — maison digital de beleza. Skincare, maquiagem e cabelos selecionados com curadoria, com envio para todo o Brasil.",
      },
      { property: "og:title", content: "Absoluto Glamur · Cosméticos premium" },
      {
        property: "og:description",
        content: "Skincare, maquiagem e cabelos com curadoria. Envio para todo o Brasil.",
      },
      { property: "og:url", content: "https://absolutoglamur.com.br/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://absolutoglamur.com.br/" }],
  }),
  component: HomePageV12,
});
