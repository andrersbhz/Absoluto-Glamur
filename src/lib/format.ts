export function formatBRL(cents: number | null | undefined) {
  const value = ((cents ?? 0) / 100);
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function effectivePrice(list_cents: number, sale_cents: number | null) {
  const hasSale = typeof sale_cents === "number" && sale_cents > 0 && sale_cents < list_cents;
  return {
    price: hasSale ? sale_cents! : list_cents,
    hasSale,
    listPrice: list_cents,
  };
}
