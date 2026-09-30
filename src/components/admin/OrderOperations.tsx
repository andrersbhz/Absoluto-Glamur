import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateOrderStage } from "@/lib/order-lifecycle.functions";
import { Button } from "@/components/ui/button";
type Order = {
  id: string;
  status: string;
  tracking_number?: string | null;
  tracking_status?: string | null;
};
export function OrderOperations({ order }: { order: Order }) {
  const update = useServerFn(updateOrderStage);
  const qc = useQueryClient();
  const [number, setNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const action = useMutation({
    mutationFn: (status: "processing" | "shipped" | "delivered") =>
      update({
        data: {
          orderId: order.id,
          status,
          ...(status === "shipped" ? { trackingNumber: number, carrier } : {}),
        },
      }),
    onSuccess: (result) => {
      toast.success("Etapa atualizada. Aviso ao cliente registrado na fila de e-mails.");
      if (result.warning) toast.warning(result.warning);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="mt-2 text-left text-xs">
      {order.status === "paid" && (
        <Button
          size="sm"
          variant="outline"
          disabled={action.isPending}
          onClick={() => action.mutate("processing")}
        >
          Iniciar separação
        </Button>
      )}
      {order.status === "processing" && (
        <details>
          <summary className="cursor-pointer text-primary">Despachar com rastreio</summary>
          <div className="mt-2 flex min-w-56 flex-col gap-2">
            <label>
              Código de rastreio
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-background p-2"
              />
            </label>
            <label>
              Transportadora
              <input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-background p-2"
              />
            </label>
            <Button
              size="sm"
              disabled={!number.trim() || action.isPending}
              onClick={() => action.mutate("shipped")}
            >
              Confirmar despacho
            </Button>
          </div>
        </details>
      )}
      {order.status === "shipped" && (
        <>
          <p>Rastreio: {order.tracking_number}</p>
          <p>A entrega será atualizada pela transportadora.</p>
          <details className="mt-2">
            <summary className="cursor-pointer">Entrega confirmada manualmente</summary>
            <p className="my-2 whitespace-normal">
              Use apenas após confirmar a entrega com a transportadora ou o cliente.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={action.isPending}
              onClick={() => action.mutate("delivered")}
            >
              Confirmar entrega
            </Button>
          </details>
        </>
      )}
    </div>
  );
}
