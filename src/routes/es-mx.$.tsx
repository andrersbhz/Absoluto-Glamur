import { createFileRoute, redirect } from "@tanstack/react-router";
import { Index } from "./index";

export const Route = createFileRoute("/es-mx/$")({
  beforeLoad: ({ params }) => {
    const rest = (params as { _splat?: string })._splat ?? "";
    if (!rest) return;
    throw redirect({ href: `/${rest}`, replace: true });
  },
  component: Index,
});
