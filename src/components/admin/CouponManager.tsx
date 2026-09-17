import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCoupon, deleteCoupon, listCoupons, type Coupon } from "@/lib/coupons.functions";

export function CouponManager() {
  const load = useServerFn(listCoupons);
  const create = useServerFn(createCoupon);
  const remove = useServerFn(deleteCoupon);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [percent, setPercent] = useState("10");
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    try {
      setCoupons(await load());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar cupons");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    const pct = Number(percent);
    if (!pct || pct <= 0 || pct > 100) return toast.error("O desconto deve ficar entre 1% e 100%");
    setBusy("create");
    try {
      const res = await create({ data: { percent: pct } });
      toast.success(`Cupom ${res.code} criado com ${pct}% de desconto.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o cupom");
    } finally {
      setBusy(null);
    }
  }

  async function drop(id: string, code: string) {
    setBusy(id);
    try {
      await remove({ data: { id } });
      toast.success(`Cupom ${code} excluído.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o cupom");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div>
        <h2 className="font-display text-xl">Cupons de desconto</h2>
        <p className="text-xs text-muted-foreground">
          Defina a porcentagem e gere um cupom com código automático. Compartilhe o código com os clientes.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
        <label className="text-sm">
          <span className="text-muted-foreground">Desconto do cupom %</span>
          <Input
            type="number"
            min={1}
            max={100}
            step="0.01"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </label>
        <Button className="ml-auto" disabled={busy === "create"} onClick={() => void generate()}>
          {busy === "create" ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Ticket className="mr-2 h-4 w-4" />
          )}
          Gerar cupom
        </Button>
      </div>

      {coupons.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Nenhum cupom criado ainda.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {coupons.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="font-mono font-semibold tracking-wide">{c.code}</span>
              <span className="tabular-nums text-muted-foreground">{Number(c.percent)}% OFF</span>
              <span className={`ml-auto text-xs ${c.enabled ? "text-primary" : "text-muted-foreground"}`}>
                {c.enabled ? "ativo" : "inativo"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy === c.id}
                onClick={() => void drop(c.id, c.code)}
                aria-label={`Excluir cupom ${c.code}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
