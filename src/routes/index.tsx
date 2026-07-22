import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StoreLayout } from "@/components/store/StoreLayout";
import { HomeBlock } from "@/components/home/HomeBlocks";
import { homepageBlocksQuery } from "@/lib/marketing";

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
  component: Index,
});

function Index() {
  const { data: blocks = [] } = useQuery(homepageBlocksQuery());
  return (
    <StoreLayout>
      {blocks.map((b) => (
        <HomeBlock key={b.id} block={b} />
      ))}
    </StoreLayout>
  );
}
