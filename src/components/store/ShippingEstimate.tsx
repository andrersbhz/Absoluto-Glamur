import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Truck } from "lucide-react";
import { quoteShipping } from "@/lib/shipping.functions";
import { formatBRL } from "@/lib/format";

/** Estimativa sutil de frete/prazo por CEP. */
export function ShippingEstimate({ variantId, quantity = 1 }: { variantId?: string; quantity?: number }) {
  const quote = useServerFn(quoteShipping);
  const [cep, setCep] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{ text: string } | null>(null);

  async function run() {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8 || !variantId) return;
    setLoading(true);
    try {
      const q = await quote({ data: { cep: d, items: [{ variantId, quantity }] } });
      setRes({
        text: `${q.free ? "Frete grátis" : formatBRL(q.cents)} · chega em ${q.minDays}–${q.maxDays} dias úteis`,
      });
    } catch {
      setRes({ text: "Não foi possível calcular agora." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Truck className="h-3.5 w-3.5 shrink-0" />
        <input
          value={cep}
          inputMode="numeric"
          maxLength={9}
          placeholder="Calcular frete: CEP"
          onChange={(e) => setCep(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          className="w-36 border-b border-border bg-transparent py-1 outline-none focus:border-foreground"
        />
        <button type="button" onClick={run} disabled={loading} className="underline-offset-2 hover:text-foreground hover:underline">
          {loading ? "…" : "OK"}
        </button>
      </div>
      {res && <p className="mt-1.5 pl-5">{res.text}</p>}
      <p className="mt-1 pl-5 opacity-80">Frete grátis em compras acima de R$ 199,00</p>
    </div>
  );
}
