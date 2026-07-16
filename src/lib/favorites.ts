import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function favoritesQuery(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["favorites", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async (): Promise<string[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("favorites")
        .select("product_id")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => r.product_id);
    },
    staleTime: 60_000,
  });
}

export function useFavorites() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: ids = [] } = useQuery(favoritesQuery(user?.id));

  const toggle = useMutation({
    mutationFn: async (productId: string) => {
      if (!user) throw new Error("Faça login para favoritar.");
      const isFav = ids.includes(productId);
      if (isFav) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("product_id", productId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, product_id: productId });
        if (error) throw error;
      }
      return !isFav;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites", user?.id ?? "anon"] }),
  });

  return {
    ids,
    isFavorite: (id: string) => ids.includes(id),
    toggle: (id: string) => toggle.mutate(id),
    canFavorite: !!user,
  };
}

export function favoriteProductsQuery(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["favorite-products", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("favorites")
        .select(`
          product:products(
            id, slug, name, short_description, rating_avg, rating_count,
            brand:brands(name, slug),
            category:categories(name, slug),
            media:product_media(url, alt, position),
            variants:product_variants(id, is_default, prices:product_prices(list_price_cents, sale_price_cents, is_active))
          )
        `)
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r: { product: unknown }) => r.product).filter(Boolean);
    },
    staleTime: 30_000,
  });
}
