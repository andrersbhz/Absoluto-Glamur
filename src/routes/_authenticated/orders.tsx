import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StoreLayout } from "@/components/store/StoreLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({ meta: [{ title: "Meus pedidos · Bloom" }] }),
  component: OrdersPage,
});

const STATUS_LABEL: Record<string, { label: string; tone: "default" | "success" | "warn" | "destructive" }> = {
  pending: { label: "Pendente", tone: "default" },
  awaiting_payment: { label: "Aguardando pagamento", tone: "warn" },
  paid: { label: "Pago", tone: "success" },
  processing: { label: "Em separação", tone: "default" },
  shipped: { label: "Enviado", tone: "default" },
  delivered: { label: "Entregue", tone: "success" },
  cancelled: { label: "Cancelado", tone: "destructive" },
  refunded: { label: "Reembolsado", tone: "destructive" },
  failed: { label: "Falha", tone: "destructive" },
};

function OrdersPage() {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, code, status, total_cents, created_at, paid_at, order_items(product_name, quantity, image_url)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <StoreLayout>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl">Meus pedidos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe seus pedidos e pagamentos.
        </p>

        {q.isLoading && <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>}

        {q.data && q.data.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-secondary/40 p-10 text-center">
            <h2 className="font-display text-2xl">Você ainda não fez pedidos</h2>
            <p className="mt-2 text-sm text-muted-foreground">Comece explorando o catálogo.</p>
            <Link
              to="/products"
              search={{} as never}
              className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground shadow-soft"
            >
              Ver produtos
            </Link>
          </div>
        )}

        <ul className="mt-8 space-y-3">
          {q.data?.map((o) => {
            const status = STATUS_LABEL[o.status] ?? { label: o.status, tone: "default" as const };
            const items = (o.order_items ?? []) as { product_name: string; quantity: number; image_url: string | null }[];
            return (
              <li key={o.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Pedido
                    </p>
                    <p className="font-display text-lg">{o.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      className={
                        status.tone === "success"
                          ? "bg-success text-white"
                          : status.tone === "destructive"
                            ? "bg-destructive text-white"
                            : status.tone === "warn"
                              ? "bg-warning text-warning-foreground"
                              : ""
                      }
                      variant={status.tone === "default" ? "secondary" : "default"}
                    >
                      {status.label}
                    </Badge>
                    <p className="font-display text-lg">{formatBRL(o.total_cents)}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {items.slice(0, 4).map((it, idx) => (
                      <div
                        key={idx}
                        className="h-10 w-10 overflow-hidden rounded-full border border-border bg-secondary/40"
                      >
                        {it.image_url ? (
                          <img src={it.image_url} alt={it.product_name} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {items.reduce((n, i) => n + i.quantity, 0)} {items.length === 1 ? "item" : "itens"}
                  </p>
                  <div className="ml-auto flex gap-2">
                    {o.status === "awaiting_payment" && (
                      <Link
                        to="/checkout/$orderId"
                        params={{ orderId: o.id }}
                        className="rounded-lg bg-primary px-4 py-2 text-xs text-primary-foreground"
                      >
                        Pagar
                      </Link>
                    )}
                    <Link
                      to="/checkout/$orderId"
                      params={{ orderId: o.id }}
                      className="rounded-lg border border-border px-4 py-2 text-xs hover:bg-secondary"
                    >
                      Detalhes
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </StoreLayout>
  );
}
