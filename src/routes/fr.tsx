import { createFileRoute } from "@tanstack/react-router";
import { Index } from "./index";
import { hreflangLinks } from "@/lib/i18n/seo";

export const Route = createFileRoute("/fr")({
  head: () => ({ meta: [{ title: "Absoluto Glamur · Beauté premium" }, { name: "description", content: "Soins, maquillage et produits capillaires sélectionnés, avec livraison internationale." }], links: [{ rel: "canonical", href: "https://absolutoglamur.com.br/fr" }, ...hreflangLinks("/")] }),
  component: Index,
});
