import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ORDER_LABELS,
  ORDER_STEPS,
  TRACKING_LABELS,
  trackingLabel,
  trackingUrl,
} from "@/lib/order-lifecycle";
type Order = {
  id: string;
  status: string;
  payment_review_at?: string | null;
  tracking_number?: string | null;
  tracking_carrier?: string | null;
  tracking_status?: string | null;
};
export function OrderProgress({ order }: { order: Order }) {
  const history = useQuery({
    queryKey: ["order-history", order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select("id,status,description,created_at")
        .eq("order_id", order.id)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: order.status === "delivered" ? false : 15000,
  });
  const current = ORDER_STEPS.findIndex((s) => s === order.status);
  return (
    <section
      className="mt-6 rounded-xl border border-border bg-card p-5"
      aria-label="Acompanhamento do pedido"
    >
      <h2 className="font-display text-xl">Acompanhe seu pedido</h2>
      <p className="mt-2 text-sm font-medium">
        {order.status === "awaiting_payment" && order.payment_review_at
          ? ORDER_LABELS.validating
          : ORDER_LABELS[order.status] || order.status}
      </p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {ORDER_STEPS.map((step, index) => (
          <li
            key={step}
            className={`rounded-lg p-2 text-xs ${index <= current ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
            aria-current={index === current ? "step" : undefined}
          >
            {index + 1}. {ORDER_LABELS[step]}
          </li>
        ))}
      </ol>
      {order.tracking_number && (
        <div className="mt-4 text-sm">
          <p>
            Código de rastreio: <strong>{order.tracking_number}</strong>
          </p>
          {order.tracking_carrier && <p>Transportadora: {order.tracking_carrier}</p>}
          {order.tracking_status && (
            <p>{TRACKING_LABELS[order.tracking_status] || order.tracking_status}</p>
          )}
          <a
            className="mt-2 inline-block text-primary underline"
            href={trackingUrl(order.tracking_number)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Rastrear entrega
          </a>
        </div>
      )}
      {history.isError && (
        <p className="mt-3 text-xs text-muted-foreground">
          Não foi possível carregar o histórico. Tente atualizar a página.
        </p>
      )}
      {history.data && history.data.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer">Ver histórico do pedido</summary>
          <ol className="mt-3 space-y-2">
            {history.data.map((event) => (
              <li key={event.id}>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString("pt-BR")}
                </span>
                <p>
                  {event.status === "tracking"
                    ? trackingLabel(event.description || "")
                    : ORDER_LABELS[event.status] || event.status}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
