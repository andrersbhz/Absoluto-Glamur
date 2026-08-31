import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/es-mx/$")({
  beforeLoad: ({ params }) => {
    const rest = (params as { _splat?: string })._splat ?? "";
    throw redirect({ href: `/${rest}`, replace: true });
  },
  component: () => null,
});
