import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { reportManualPixPaid } from "@/lib/order-lifecycle.functions";
import { OrderProgress } from "@/components/store/OrderProgress";
import { isPaidOrder, ORDER_LABELS } from "@/lib/order-lifecycle";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { trackCommerce } from "@/lib/commerce-tracking";

export const Route = createFileRoute("/_authenticated/checkout/$orderId")({
  head: () => ({ meta: [{ title: "Pagamento · Absoluto Glamur" }] }),
  component: PaymentPage,
});

type OrderWithPayment = {
  id: string;
  code: string;
  status: string;
  total_cents: number;
  paid_at: string | null;
  payment_review_at: string | null;
  tracking_number: string | null;
  tracking_carrier: string | null;
  tracking_status: string | null;
  payments: {
    status: string;
    method: string;
    provider: string;
    pix_qr_code: string | null;
    pix_payload: string | null;
    pix_expires_at: string | null;
    amount_cents: number;
    invoice_url: string | null;
    redirect_url: string | null;
  }[];
};

function PaymentPage() {
  const { orderId } = Route.useParams();
  const reportPaid = useServerFn(reportManualPixPaid);
  const [reporting, setReporting] = useState(false);

  const q = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, code, status, total_cents, paid_at, payment_review_at, tracking_number, tracking_carrier, tracking_status, payments(status, method, provider, pix_qr_code, pix_payload, pix_expires_at, amount_cents, invoice_url, redirect_url)",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data as OrderWithPayment | null;
    },
    refetchInterval: (query) => {
      const d = query.state.data as OrderWithPayment | null | undefined;
      if (!d) return 3000;
      if (["delivered", "cancelled", "refunded", "failed"].includes(d.status)) return false;
      if (isPaidOrder(d.status)) return 15000;
      return 3000;
    },
  });

  const order = q.data;
  const payment = order?.payments?.[0];
  const paid = !!order && isPaidOrder(order.status);

  const purchaseId = order?.id;
  const purchaseCode = order?.code;
  const purchasePaidAt = order?.paid_at;
  const purchaseTotal = order?.total_cents;
  useEffect(() => {
    if (!paid || !purchaseId) return;
    trackCommerce("purchase", {
      order_id: purchaseId,
      value_cents: purchaseTotal,
      current_page: `/checkout/${purchaseId}`,
      metadata: {
        order_code: purchaseCode,
        paid_at: purchasePaidAt,
        funnel_stage: "purchased",
      },
    });
  }, [paid, purchaseId, purchaseCode, purchasePaidAt, purchaseTotal]);

  return (
    <StoreLayout>
      <div className="mx-auto w-full min-w-0 max-w-xl px-4 py-10 sm:px-6 sm:py-14">
        {q.isLoading && <p className="text-sm text-muted-foreground">Carregando pedido…</p>}
        {order && (
          <>
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                <Check className="h-3.5 w-3.5" />
                Pedido gerado
              </span>
              <h1 className="mt-3 break-words font-display text-xl sm:text-2xl">{order.code}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {paid
                  ? "Seu pagamento está confirmado. Acompanhe as próximas etapas abaixo."
                  : ["cancelled", "refunded", "failed"].includes(order.status)
                    ? ORDER_LABELS[order.status]
                    : order.payment_review_at
                      ? "Estamos conferindo seu pagamento. Não pague novamente."
                      : "Falta pouco: conclua o pagamento para confirmarmos seu pedido."}
              </p>
            </div>

            {paid ? (
              <PaidState orderCode={order.code} />
            ) : ["cancelled", "refunded", "failed"].includes(order.status) ? (
              <p className="mt-6 text-center">
                {ORDER_LABELS[order.status]}. Se precisar de ajuda, nossa equipe está à disposição.
              </p>
            ) : order.payment_review_at ? (
              <p className="mt-6 rounded-xl border border-border p-5">
                Recebemos seu aviso e estamos validando o pagamento. Assim que for confirmado, seu
                pedido seguirá para preparação.
              </p>
            ) : payment &&
              payment.method === "pix" &&
              (payment.pix_qr_code || payment.pix_payload) ? (
              <PendingState
                payment={payment}
                expiresAt={payment.pix_expires_at}
                totalCents={order.total_cents}
              />
            ) : payment && (payment.redirect_url || payment.invoice_url) ? (
              <RedirectState
                url={payment.redirect_url ?? payment.invoice_url!}
                provider={payment.provider}
                method={payment.method}
              />
            ) : (
              <p className="mt-8 text-sm text-destructive">
                Pagamento não gerado. Volte ao checkout e tente novamente.
              </p>
            )}
            {!paid &&
              order.status === "awaiting_payment" &&
              !order.payment_review_at &&
              payment?.provider === "pix_manual" && (
                <button
                  className="mt-4 w-full rounded-lg border border-primary p-3 text-sm"
                  disabled={reporting}
                  onClick={async () => {
                    setReporting(true);
                    try {
                      await reportPaid({ data: { orderId: order.id } });
                      await q.refetch();
                      toast.success("Aviso recebido. Vamos conferir o pagamento.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : String(error));
                    } finally {
                      setReporting(false);
                    }
                  }}
                >
                  {reporting ? "Enviando aviso..." : "Já fiz o Pix: avisar a equipe"}
                </button>
              )}
            <OrderProgress order={order} />
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
        Recebemos o pagamento do pedido {orderCode}. As atualizações de preparação e envio aparecem
        abaixo.
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
  totalCents,
}: {
  payment: OrderWithPayment["payments"][number];
  expiresAt: string | null;
  totalCents: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainingMs = expiresAt ? new Date(expiresAt).getTime() - now : null;
  const expired = remainingMs !== null && remainingMs <= 0;
  const [copied, setCopied] = useState(false);
  const isManual = payment.provider === "pix_manual";

  function copyPayload() {
    if (!payment.pix_payload) return;
    navigator.clipboard.writeText(payment.pix_payload);
    setCopied(true);
    toast.success("Código PIX copiado");
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Total a pagar
          </p>
          <p className="font-display text-2xl sm:text-3xl">{formatBRL(totalCents)}</p>
        </div>
        {expiresAt && (
          <p
            className={`inline-flex items-center gap-1.5 text-xs ${expired ? "text-destructive" : "text-muted-foreground"}`}
          >
            <Clock className="h-3.5 w-3.5" />
            {expired ? "QR Code expirado" : `Expira em ${formatRemaining(remainingMs ?? 0)}`}
          </p>
        )}
      </div>

      <div className="px-5 py-6 sm:px-7">
        <div className="flex flex-col items-center text-center">
          {payment.pix_qr_code ? (
            <img
              src={`data:image/png;base64,${payment.pix_qr_code}`}
              alt="QR Code do PIX"
              className="h-60 w-60 rounded-xl border border-border bg-white p-3"
            />
          ) : payment.pix_payload ? (
            <QRCodeSVG
              value={payment.pix_payload}
              size={240}
              level="M"
              marginSize={2}
              className="h-60 w-60 rounded-xl border border-border bg-white p-3"
            />
          ) : (
            <div className="flex h-60 w-60 items-center justify-center rounded-xl border border-dashed border-border">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            Abra o app do seu banco e escaneie o QR Code
          </p>
        </div>

        {payment.pix_payload && (
          <>
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                ou pague com copia e cola
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="block min-w-0 flex-1 truncate rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-xs">
                {payment.pix_payload}
              </code>
              <button
                onClick={copyPayload}
                className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors sm:w-auto ${copied ? "bg-success text-white" : "bg-primary text-primary-foreground"}`}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado!" : "Copiar código"}
              </button>
            </div>
          </>
        )}

        <div className="mt-6 rounded-xl border border-border/70 bg-secondary/30 p-4">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Como pagar</p>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            {[
              "Abra o aplicativo do seu banco ou carteira digital.",
              "Escolha pagar com Pix — QR Code ou Copia e Cola.",
              `Confira o valor de ${formatBRL(totalCents)} e confirme.`,
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          {isManual
            ? "Aguardando pagamento — confirmamos assim que o valor cair na conta"
            : "Aguardando pagamento — a confirmação é automática"}
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

function RedirectState({
  url,
  provider,
  method,
}: {
  url: string;
  provider: string;
  method: string;
}) {
  const label =
    method === "boleto"
      ? "Abrir boleto"
      : provider === "nupay"
        ? "Continuar no app Nubank"
        : "Continuar no gateway";
  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
      <h2 className="font-display text-2xl">Finalize seu pagamento</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Você será redirecionado para <span className="font-medium capitalize">{provider}</span> para
        concluir. A confirmação retorna automaticamente aqui.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-soft"
      >
        {label}
      </a>
      <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        Aguardando confirmação do gateway…
      </p>
    </div>
  );
}
