import { createFileRoute } from "@tanstack/react-router";
import { Index } from "./index";
import { hreflangLinks } from "@/lib/i18n/seo";

export const Route = createFileRoute("/de")({
  head: () => ({ meta: [{ title: "Absoluto Glamur · Premium-Beauty" }, { name: "description", content: "Ausgewählte Hautpflege, Make-up und Haarpflege mit internationalem Versand." }], links: [{ rel: "canonical", href: "https://absolutoglamur.com.br/de" }, ...hreflangLinks("/")] }),
  component: Index,
});
