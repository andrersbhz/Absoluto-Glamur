import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HomepageBlock = {
  id: string;
  kind: string;
  title: string | null;
  subtitle: string | null;
  data: Record<string, unknown>;
  position: number;
  is_active: boolean;
};

export function homepageBlocksQuery() {
  return queryOptions({
    queryKey: ["homepage-blocks"],
    queryFn: async (): Promise<HomepageBlock[]> => {
      const { data, error } = await supabase
        .from("homepage_blocks")
        .select("id, kind, title, subtitle, data, position, is_active")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HomepageBlock[];
    },
  });
}

export function homepageBlocksAdminQuery() {
  return queryOptions({
    queryKey: ["homepage-blocks", "admin"],
    queryFn: async (): Promise<HomepageBlock[]> => {
      const { data, error } = await supabase
        .from("homepage_blocks")
        .select("id, kind, title, subtitle, data, position, is_active")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HomepageBlock[];
    },
  });
}

export type CollectionRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_featured: boolean;
  position: number;
};

export function collectionsAdminQuery() {
  return queryOptions({
    queryKey: ["collections", "admin"],
    queryFn: async (): Promise<CollectionRow[]> => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, slug, name, description, is_featured, position")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CollectionRow[];
    },
  });
}
