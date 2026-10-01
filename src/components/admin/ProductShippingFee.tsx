import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getProductShippingFee, setProductShippingFee } from "@/lib/shipping.functions";

/** Valor de frete do produto (usado quando Melhor Envio/Correios não estão configurados). */
export function ProductShippingFee({ productId }: { productId: string }) {
  const getFn = useServerFn(getProductShippingFee);
  const setFn = useServerFn(setProductShippingFee);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFn({ data: { productId } })
      .then((r) => setVal(r.cents == null ? "" : (r.cents / 100).toFixed(2).replace(".", ",")))
      .catch(() => {});
  }, [productId, getFn]);

  async function save() {
    setSaving(true);
    try {
      const n = val.trim() === "" ? null : Math.round(Number(val.replace(",", ".")) * 100);
      if (n != null && (!Number.isFinite(n) || n < 0)) throw new Error("Valor inválido");
      await setFn({ data: { productId, cents: n } });
      toast.success("Frete do produto salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label className="text-sm font-medium">Valor do frete (R$)</label>
      <div className="mt-1.5 flex gap-2">
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="0,00" inputMode="decimal" className="input max-w-[160px]" />
        <button type="button" onClick={save} disabled={saving} className="rounded-lg border border-border px-3 text-sm hover:bg-secondary disabled:opacity-60">
          {saving ? "Salvando…" : "Salvar frete"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Usado quando o Melhor Envio não estiver configurado. Compras acima de R$ 199,00 têm frete grátis.
      </p>
    </div>
  );
}
