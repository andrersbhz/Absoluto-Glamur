import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { cartTotals, useCart } from "@/lib/cart-store";
import { formatBRL } from "@/lib/format";
import { publicAttrValues } from "@/lib/catalog";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Carrinho de compras · Absoluto Glamur" },
      {
        name: "description",
        content:
          "Revise os itens do seu carrinho na Absoluto Glamur e siga para o checkout com pagamento seguro via PIX ou cartão.",
      },
      { property: "og:title", content: "Seu carrinho · Absoluto Glamur" },
      {
        property: "og:description",
        content: "Revise os itens do seu carrinho e finalize com pagamento seguro.",
      },
      { property: "og:url", content: "https://absolutoglamur.com.br/cart" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://absolutoglamur.com.br/cart" }],
  }),
  component: CartPage,
});


function CartPage() {
  const items = useCart((s) => s.items);
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const { subtotal, count } = cartTotals(items);

  return (
    <StoreLayout>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl">Seu carrinho</h1>
        <p className="mt-1 text-sm text-muted-foreground">{count} {count === 1 ? "item" : "itens"}</p>

        {items.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-secondary/40 p-12 text-center">
            <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-4 font-display text-2xl">Seu carrinho está vazio</h2>
            <p className="mt-2 text-sm text-muted-foreground">Explore o catálogo e escolha seus favoritos.</p>
            <Link to="/products" search={{} as never} className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground shadow-soft">
              Ver produtos
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
            <ul className="space-y-3">
              {items.map((i) => (
                <li key={i.variantId} className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <Link to="/products/$slug" params={{ slug: i.slug }} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary/40">
                    {i.imageUrl ? (
                      <img src={i.imageUrl} alt={i.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-primary/30 to-plum" />
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col gap-1">
                    <Link to="/products/$slug" params={{ slug: i.slug }} className="font-display text-base">
                      {i.name}
                    </Link>
                    {i.attributes && Object.keys(publicAttrValues(i.attributes)).length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {Object.entries(publicAttrValues(i.attributes))
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </p>
                    ) : (
                      i.variantName && <p className="text-xs text-muted-foreground">{i.variantName}</p>
                    )}
                    {i.sku && <p className="text-[11px] text-muted-foreground/70">SKU: {i.sku}</p>}
                    <p className="text-sm text-foreground">{formatBRL(i.unitCents)}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        onClick={() => setQuantity(i.variantId, i.quantity - 1)}
                        className="rounded-md border border-border p-1 hover:bg-secondary"
                        aria-label="Diminuir"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-6 text-center text-sm">{i.quantity}</span>
                      <button
                        onClick={() => setQuantity(i.variantId, i.quantity + 1)}
                        className="rounded-md border border-border p-1 hover:bg-secondary"
                        aria-label="Aumentar"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => remove(i.variantId)}
                        className="ml-2 rounded-md border border-border p-1 text-muted-foreground hover:bg-secondary"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="font-display text-base">{formatBRL(i.unitCents * i.quantity)}</p>
                </li>
              ))}
            </ul>

            <aside className="h-fit rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="font-display text-xl">Resumo</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-medium">{formatBRL(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Frete</dt>
                  <dd className="text-success">Grátis</dd>
                </div>
              </dl>
              <div className="mt-4 flex justify-between border-t border-border pt-4">
                <span className="font-display text-lg">Total</span>
                <span className="font-display text-lg">{formatBRL(subtotal)}</span>
              </div>
              <Link
                to="/checkout"
                className="mt-6 block w-full rounded-lg bg-primary px-5 py-3 text-center text-sm font-medium text-primary-foreground shadow-soft hover:opacity-90"
              >
                Ir para o checkout
              </Link>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Pagamento seguro via PIX · frete grátis
              </p>
              <button
                onClick={clear}
                className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground"
              >
                Esvaziar carrinho
              </button>
            </aside>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
