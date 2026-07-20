import { createFileRoute, redirect } from "@tanstack/react-router";
import { productDetailQuery } from "@/lib/catalog";

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params, context }) => {
    const product = await context.queryClient.ensureQueryData(productDetailQuery(params.slug));
    throw redirect({
      to: "/$categoria/$produto",
      params: {
        categoria: product?.category?.slug ?? "produto",
        produto: params.slug,
      },
      replace: true,
    });
  },
  component: () => null,
});
