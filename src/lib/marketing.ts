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

function normalizeHomepageBlock(block: HomepageBlock): HomepageBlock {
  const data = { ...(block.data ?? {}) } as Record<string, unknown>;

  if (block.kind === "collection" && !data.slug && typeof data.collection_slug === "string") {
    data.slug = data.collection_slug;
  }

  return { ...block, data };
}

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
      return ((data ?? []) as HomepageBlock[]).map(normalizeHomepageBlock);
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
      return ((data ?? []) as HomepageBlock[]).map(normalizeHomepageBlock);
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

export type HeroSlide = {
  title?: string;
  subtitle?: string;
  cta_label?: string;
  cta_href?: string;
  cta_target?: "_self" | "_blank";
  image_url?: string;
  image_mobile_url?: string;
  align?: "left" | "center" | "right";
  vertical_align?: "top" | "center" | "bottom";
  title_color?: string;
  subtitle_color?: string;
  title_size_desktop?: number;
  title_size_mobile?: number;
  subtitle_size_desktop?: number;
  subtitle_size_mobile?: number;
  button_bg?: string;
  button_color?: string;
  button_hover_bg?: string;
  button_radius?: number;
  overlay_color?: string;
  overlay_opacity?: number;
  image_position_x?: number;
  image_position_y?: number;
  height_desktop?: number;
  height_mobile?: number;
  content_max_width?: number;
};

export type AnnouncementProduct = {
  product_id?: string;
  slug?: string;
  category_slug?: string;
  name?: string;
  image_url?: string;
  variant_id?: string;
  cta_label?: string;
  cta_href?: string;
  eyebrow?: string;
};

export type HomeContent = {
  announcement?: {
    enabled?: boolean;
    text?: string;
    product?: AnnouncementProduct;
  };
  hero_slider?: {
    enabled?: boolean;
    autoplay_ms?: number;
    slides?: HeroSlide[];
  };
  hero?: {
    badge?: string;
    title_line1?: string;
    title_highlight?: string;
    subtitle?: string;
    cta_primary_label?: string;
    cta_primary_href?: string;
    cta_primary_target?: "_self" | "_blank";
    cta_secondary_label?: string;
    cta_secondary_href?: string;
    monogram?: string;
    seal_left?: string;
    seal_right?: string;
    image_url?: string;
    image_mobile_url?: string;
    align?: "left" | "center" | "right";
    vertical_align?: "top" | "center" | "bottom";
    title_color?: string;
    highlight_color?: string;
    subtitle_color?: string;
    title_size_desktop?: number;
    title_size_mobile?: number;
    subtitle_size_desktop?: number;
    subtitle_size_mobile?: number;
    button_bg?: string;
    button_color?: string;
    button_hover_bg?: string;
    overlay_color?: string;
    overlay_opacity?: number;
    image_position_x?: number;
    image_position_y?: number;
    height_desktop?: number;
    height_mobile?: number;
    content_max_width?: number;
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
