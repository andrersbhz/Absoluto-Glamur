import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  fulfillOrderToAliexpress,
  fulfillOrdersBulk,
} from "@/lib/aliexpress-fulfillment.functions";
import { OrderOperations } from "@/components/admin/OrderOperations";
import { ORDER_LABELS, TRACKING_LABELS } from "@/lib/order-lifecycle";
import { retryOrderEmails } from "@/lib/order-lifecycle.functions";
import { confirmOrdersPayment } from "@/lib/order-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({ meta: [{ title: "Pedidos · Admin Absoluto Glamur" }] }),
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!data) throw redirect({ to: "/account" });
  },
  component: AdminOrdersPage,
});

type OrderRow = {
  id: string;
  code: string;
  status: string;
  total_cents: number;
  customer_name: string;
  customer_email: string;
  created_at: string;
  paid_at: string | null;
  payment_review_at: string | null;
  tracking_number: string | null;
  tracking_status: string | null;
  fulfillment_status: string | null;
  fulfillment_provider: string | null;
  fulfillment_order_id: string | null;
  fulfillment_error: string | null;
  fulfillment_sent_at: string | null;
};

function fulfillmentBadge(row: OrderRow) {
  const st = row.fulfillment_status ?? "pending";
  if (st === "sent")
    return (
      <span className="inline-flex flex-col gap-0.5">
        <Badge className="bg-success text-white">Enviado ao AliExpress</Badge>
        {row.fulfillment_order_id && (
          <span className="font-mono text-[10px] text-muted-foreground">
            AE #{row.fulfillment_order_id}
          </span>
        )}
      </span>
    );
  if (st === "failed")
    return (
      <span className="inline-flex flex-col gap-0.5">
        <Badge className="bg-destructive text-white">Falha no envio</Badge>
        {row.fulfillment_error && (
          <span
            className="max-w-[220px] truncate text-[10px] text-muted-foreground"
            title={row.fulfillment_error}
          >
            {row.fulfillment_error}
          </span>
        )}
      </span>
    );
  return <Badge variant="outline">Não enviado</Badge>;
}

function AdminOrdersPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fulfillOne = useServerFn(fulfillOrderToAliexpress);
  const fulfillBulk = useServerFn(fulfillOrdersBulk);
  const confirmPay = useServerFn(confirmOrdersPayment);
  const confirm = useMutation({
    mutationFn: (orderIds: string[]) => confirmPay({ data: { orderIds } }),
    onSuccess: (res) => {
      toast.success(`${res.confirmed} pagamento(s) confirmado(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const processEmails = useServerFn(retryOrderEmails);
  const emailRun = useMutation({
    mutationFn: () => processEmails(),
    onSuccess: (r) => {
      toast.success(`${r.sent} e-mail(s) enviado(s); ${r.failed} com falha.`);
      qc.invalidateQueries({ queryKey: ["order-email-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const emails = useQuery({
    queryKey: ["order-email-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_email_outbox")
        .select("id,status,last_error")
        .neq("status", "sent")
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });
  const unpaidSt = ["pending", "awaiting_payment", "failed"];

  const q = useQuery({
    queryKey: ["admin-orders"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, code, status, total_cents, customer_name, customer_email, created_at, paid_at, payment_review_at, tracking_number, tracking_status, fulfillment_status, fulfillment_provider, fulfillment_order_id, fulfillment_error, fulfillment_sent_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const sendOne = useMutation({
    mutationFn: (orderId: string) => fulfillOne({ data: { orderId } }),
    onSuccess: (res) => {
      if (res.ok) toast.success(`Pedido enviado ao AliExpress (#${res.aeOrderId})`);
      else toast.error(`Falha: ${res.error}`);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const sendBulk = useMutation({
    mutationFn: (orderIds: string[]) => fulfillBulk({ data: { orderIds } }),
    onSuccess: (res) => {
      toast.success(`Envio em massa: ${res.sent} sucesso · ${res.failed} falha`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const eligible = (q.data ?? []).filter(
    (o) =>
      (["paid", "processing"].includes(o.status) && o.fulfillment_status !== "sent") ||
      unpaidSt.includes(o.status),
  );
  const selPaid = (q.data ?? [])
    .filter((o) => selected.has(o.id) && ["paid", "processing"].includes(o.status))
    .map((o) => o.id);
  const selUnpaid = (q.data ?? [])
    .filter((o) => selected.has(o.id) && unpaidSt.includes(o.status))
    .map((o) => o.id);
  const allSelected = eligible.length > 0 && eligible.every((o) => selected.has(o.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(eligible.map((o) => o.id)));
  }
  function toggleOne(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">Pedidos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Últimos 100 pedidos. Envie somente pedidos com pagamento confirmado ao AliExpress,
              individualmente ou em massa.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => confirm.mutate(selUnpaid)}
              disabled={selUnpaid.length === 0 || confirm.isPending}
            >
              {confirm.isPending
                ? "Confirmando..."
                : `Confirmar pagamento ${selUnpaid.length || ""}`}
            </Button>
            <Button
              onClick={() => sendBulk.mutate(selPaid)}
              disabled={selPaid.length === 0 || sendBulk.isPending}
            >
              {sendBulk.isPending ? "Enviando..." : `Enviar ${selPaid.length || ""} ao AliExpress`}
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border p-4 text-sm">
          <p>E-mails pendentes ou com falha: {emails.data?.length ?? "..."}</p>
          {emails.isError && <p>Fila indisponível. Verifique se a migration foi aplicada.</p>}
          {emails.data?.find((row) => row.last_error) && (
            <p className="mt-1 text-xs text-destructive">
              Última falha: {emails.data.find((row) => row.last_error)?.last_error}
            </p>
          )}
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            disabled={emailRun.isPending}
            onClick={() => emailRun.mutate()}
          >
            Processar e-mails pendentes
          </Button>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-3">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar elegíveis"
                  />
                </th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Envio AliExpress</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.data?.map((o) => {
                const canSend =
                  ["paid", "processing"].includes(o.status) && o.fulfillment_status !== "sent";
                const canConfirm = unpaidSt.includes(o.status);
                return (
                  <tr key={o.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={selected.has(o.id)}
                        disabled={!canSend && !canConfirm}
                        onCheckedChange={() => toggleOne(o.id)}
                        aria-label={`Selecionar ${o.code}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{o.code}</td>
                    <td className="px-4 py-3">
                      <p>{o.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{o.customer_email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {o.status === "awaiting_payment" && o.payment_review_at
                          ? ORDER_LABELS.validating
                          : ORDER_LABELS[o.status] || o.status}
                      </Badge>
                      {o.tracking_status && (
                        <p className="mt-1 text-xs">
                          {TRACKING_LABELS[o.tracking_status] || o.tracking_status}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">{fulfillmentBadge(o)}</td>
                    <td className="px-4 py-3 text-right">{formatBRL(o.total_cents)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {canConfirm && (
                        <Button
                          size="sm"
                          className="mr-2"
                          disabled={confirm.isPending}
                          onClick={() => confirm.mutate([o.id])}
                        >
                          Confirmar pagamento
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canSend || sendOne.isPending}
                        onClick={() => sendOne.mutate(o.id)}
                      >
                        {o.fulfillment_status === "sent"
                          ? "Enviado"
                          : o.fulfillment_status === "failed"
                            ? "Reenviar"
                            : "Enviar"}
                      </Button>
                      <OrderOperations order={o} />
                    </td>
                  </tr>
                );
              }) ?? null}
              {q.data && q.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum pedido ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Pedidos aguardando pagamento podem ter o pagamento confirmado manualmente (individual ou
          em massa); gateways continuam confirmando automaticamente. Só pedidos com pagamento
          confirmado (pagos ou em separação) são enviados ao AliExpress. O envio usa o AliExpress
          Dropshipping API com o endereço e CPF do cliente. Se a variação não estiver mapeada, o
          pedido falha e a mensagem aparece na coluna de envio.
        </p>

        <div className="mt-6 text-sm">
          <Link to="/admin" className="text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}
