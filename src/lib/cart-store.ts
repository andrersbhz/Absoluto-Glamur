import { create } from "zustand";
import { persist } from "zustand/middleware";
import { syncRecoverableCart, trackCommerce } from "@/lib/commerce-tracking";

export type CartItem = {
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  variantName: string | null;
  /** Atributos escolhidos, ex.: { Cor: "Preto", Tamanho: "M" } */
  attributes?: Record<string, string> | null;
  sku?: string | null;
  imageUrl: string | null;
  unitCents: number;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  remove: (variantId: string) => void;
  setQuantity: (variantId: string, qty: number) => void;
  clear: () => void;
};

const MAX_ITEM_QUANTITY = 99;

function normalizeQuantity(qty: number) {
  return Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.trunc(qty || 1)));
}

function syncCart(items: CartItem[]) {
  syncRecoverableCart(items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    name: item.name,
    unitCents: item.unitCents,
    quantity: item.quantity,
    sku: item.sku,
  })));
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item, qty = 1) => {
        const nextQty = normalizeQuantity(qty);
        set((s) => {
          const existing = s.items.find((i) => i.variantId === item.variantId);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.variantId === item.variantId
                  ? { ...i, quantity: Math.min(MAX_ITEM_QUANTITY, i.quantity + nextQty) }
                  : i,
              ),
            };
          }
          return { items: [...s.items, { ...item, quantity: nextQty }] };
        });
        const items = get().items;
        trackCommerce("add_to_cart", {
          product_id: item.productId,
          value_cents: item.unitCents * nextQty,
          metadata: {
            product_name: item.name,
            variant_id: item.variantId,
            quantity: nextQty,
            items_count: items.reduce((sum, row) => sum + row.quantity, 0),
            funnel_stage: "cart",
          },
        });
        syncCart(items);
      },
      remove: (variantId) => {
        const removed = get().items.find((i) => i.variantId === variantId);
        set((s) => ({ items: s.items.filter((i) => i.variantId !== variantId) }));
        const items = get().items;
        if (removed) {
          trackCommerce("remove_from_cart", {
            product_id: removed.productId,
            value_cents: removed.unitCents * removed.quantity,
            metadata: {
              product_name: removed.name,
              variant_id: removed.variantId,
              quantity: removed.quantity,
              items_count: items.reduce((sum, row) => sum + row.quantity, 0),
              funnel_stage: items.length > 0 ? "cart" : "browsing",
            },
          });
        }
        syncCart(items);
      },
      setQuantity: (variantId, qty) => {
        const before = get().items.find((i) => i.variantId === variantId);
        set((s) => ({
          items: qty <= 0
            ? s.items.filter((i) => i.variantId !== variantId)
            : s.items.map((i) =>
                i.variantId === variantId ? { ...i, quantity: normalizeQuantity(qty) } : i,
              ),
        }));
        const items = get().items;
        const after = items.find((i) => i.variantId === variantId);
        if (before) {
          trackCommerce(qty <= 0 ? "remove_from_cart" : "cart_change", {
            product_id: before.productId,
            value_cents: after ? after.unitCents * after.quantity : before.unitCents * before.quantity,
            metadata: {
              product_name: before.name,
              variant_id: variantId,
              quantity: after?.quantity ?? 0,
              previous_quantity: before.quantity,
              items_count: items.reduce((sum, row) => sum + row.quantity, 0),
              funnel_stage: items.length > 0 ? "cart" : "browsing",
            },
          });
        }
        syncCart(items);
      },
      clear: () => {
        const before = get().items;
        set({ items: [] });
        if (before.length > 0) {
          trackCommerce("cart_change", {
            value_cents: 0,
            metadata: {
              action: "clear",
              previous_items_count: before.reduce((sum, row) => sum + row.quantity, 0),
              items_count: 0,
              funnel_stage: "browsing",
            },
          });
        }
        syncCart([]);
      },
    }),
    { name: "absoluto-glamur-cart-v1" },
  ),
);

export function cartTotals(items: CartItem[]) {
  const subtotal = items.reduce((sum, i) => sum + i.unitCents * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  return { subtotal, count };
}
