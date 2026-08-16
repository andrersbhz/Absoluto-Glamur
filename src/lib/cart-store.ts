import { create } from "zustand";
import { persist } from "zustand/middleware";

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

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item, qty = 1) =>
        set((s) => {
          const nextQty = normalizeQuantity(qty);
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
        }),
      remove: (variantId) =>
        set((s) => ({ items: s.items.filter((i) => i.variantId !== variantId) })),
      setQuantity: (variantId, qty) =>
        set((s) => ({
          items: qty <= 0
            ? s.items.filter((i) => i.variantId !== variantId)
            : s.items.map((i) =>
                i.variantId === variantId ? { ...i, quantity: normalizeQuantity(qty) } : i,
              ),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: "absoluto-glamur-cart-v1" },
  ),
);

export function cartTotals(items: CartItem[]) {
  const subtotal = items.reduce((sum, i) => sum + i.unitCents * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  return { subtotal, count };
}
