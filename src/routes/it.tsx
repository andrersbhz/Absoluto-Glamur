import { createFileRoute } from "@tanstack/react-router";
import { Index } from "./index";
import { hreflangLinks } from "@/lib/i18n/seo";

export const Route = createFileRoute("/it")({
  head: () => ({ meta: [{ title: "Absoluto Glamur · Bellezza premium" }, { name: "description", content: "Skincare, make-up e prodotti per capelli selezionati, con spedizione internazionale." }], links: [{ rel: "canonical", href: "https://absolutoglamur.com.br/it" }, ...hreflangLinks("/")] }),
  component: Index,
});
