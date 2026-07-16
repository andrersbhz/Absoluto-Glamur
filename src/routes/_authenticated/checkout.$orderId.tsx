import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StoreLayout } from "@/components/store/StoreLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/checkout/$orderId")({
  head: () => ({ meta: [{ title: "Pagamento PIX · Bloom" }] }),
  component: PixPage,
});

type OrderWithPayment = {
  id: string;
  code: string;
  status: string;
  total_cents: number;
  paid_at: string | null;
  payments: {
    status: string;
    pix_qr_code: string | null;
    pix_payload: string | null;
    pix_expires_at: string | null;
    amount_cents: number;
    invoice_url: string | null;
  }[];
};

function PixPage() {
  const { orderId } = Route.useParams();

  const q = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, code, status, total_cents, paid_at, payments(status, pix_qr_code, pix_payload, pix_expires_at, amount_cents, invoice_url)",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data as OrderWithPayment | null;
    },
    refetchInterval: (query) => {
      const d = query.state.data as OrderWithPayment | null | undefined;
      if (!d) return 3000;
      if (d.status === "paid" || d.status === "cancelled" || d.status === "refunded") return false;
      return 3000;
    },
  });

  const order = q.data;
  const payment = order?.payments?.[0];
  const paid = order?.status === "paid";

  return (
    <StoreLayout>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {q.isLoading && <p className="text-sm text-muted-foreground">Carregando pedido…</p>}
        {order && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Pedido</p>
                <h1 className="font-display text-3xl">{order.code}</h1>
              </div>
              <p className="font-display text-2xl">{formatBRL(order.total_cents)}</p>
            </div>

            {paid ? (
              <PaidState orderCode={order.code} />
            ) : payment ? (
              <PendingState payment={payment} expiresAt={payment.pix_expires_at} />
            ) : (
              <p className="mt-8 text-sm text-destructive">
                Pagamento não gerado. Volte ao checkout e tente novamente.
              </p>
            )}
          </>
        )}
      </div>
    </StoreLayout>
  );
}

function PaidState({ orderCode }: { orderCode: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-success/40 bg-success/10 p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
        <Check className="h-7 w-7" />
      </div>
      <h2 className="mt-4 font-display text-2xl">Pagamento confirmado!</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Recebemos o PIX do pedido {orderCode}. Você receberá o rastreamento em breve.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          to="/orders"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground shadow-soft"
        >
          Meus pedidos
        </Link>
        <Link
          to="/products"
          search={{} as never}
          className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm hover:bg-secondary"
        >
          Continuar comprando
        </Link>
      </div>
    </div>
  );
}

function PendingState({
  payment,
  expiresAt,
}: {
  payment: OrderWithPayment["payments"][number];
  expiresAt: string | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainingMs = expiresAt ? new Date(expiresAt).getTime() - now : null;
  const expired = remainingMs !== null && remainingMs <= 0;

  function copyPayload() {
    if (!payment.pix_payload) return;
    navigator.clipboard.writeText(payment.pix_payload);
    toast.success("Código PIX copiado");
  }

  return (
    <div className="mt-8 grid gap-6 rounded-2xl border border-border bg-card p-6 shadow-soft md:grid-cols-[240px_1fr]">
      <div className="mx-auto md:mx-0">
        {payment.pix_qr_code ? (
          <img
            src={`data:image/png;base64,${payment.pix_qr_code}`}
            alt="QR Code do PIX"
            className="h-56 w-56 rounded-lg border border-border bg-white p-2"
          />
        ) : (
          <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-dashed border-border">
            <Clock className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
      <div>
        <h2 className="font-display text-xl">Pague com PIX</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Abra o app do seu banco, escaneie o QR Code ou cole o código abaixo. A confirmação é automática.
        </p>

        {payment.pix_payload && (
          <>
            <p className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">
              Copia e cola
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="block flex-1 truncate rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs">
                {payment.pix_payload}
              </code>
              <button
                onClick={copyPayload}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar
              </button>
            </div>
          </>
        )}

        {expiresAt && (
          <p className={`mt-4 text-xs ${expired ? "text-destructive" : "text-muted-foreground"}`}>
            {expired
              ? "QR Code expirado. Refaça o checkout."
              : `Expira em ${formatRemaining(remainingMs ?? 0)}.`}
          </p>
        )}

        <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Aguardando pagamento… atualizamos automaticamente
        </p>
      </div>
    </div>
  );
}

function formatRemaining(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}min` : `${pad(m)}:${pad(s)}`;
}
