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

export type HomeContent = {
  announcement?: { enabled?: boolean; text?: string };
  hero?: {
    badge?: string;
    title_line1?: string;
    title_highlight?: string;
    subtitle?: string;
    cta_primary_label?: string;
    cta_primary_href?: string;
    cta_secondary_label?: string;
    cta_secondary_href?: string;
    monogram?: string;
    seal_left?: string;
    seal_right?: string;
    image_url?: string;
  };
  trust_badges?: { label: string }[];
  manifesto?: { enabled?: boolean; eyebrow?: string; body?: string; signature?: string };
  pillars?: {
    enabled?: boolean;
    eyebrow?: string;
    title?: string;
    items?: { icon?: string; title?: string; body?: string }[];
  };
};

export function homeContentQuery() {
  return queryOptions({
    queryKey: ["site-settings", "home_content"],
    queryFn: async (): Promise<HomeContent> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "home_content")
        .maybeSingle();
      if (error) throw error;
      return (data?.value ?? {}) as HomeContent;
    },
    staleTime: 60_000,
  });
}

