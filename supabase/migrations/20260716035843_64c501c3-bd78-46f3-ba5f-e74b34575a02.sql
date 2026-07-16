
-- ============================================
-- FASE 2: CATÁLOGO
-- ============================================

-- Enums
CREATE TYPE public.product_status AS ENUM ('draft','active','archived');
CREATE TYPE public.media_kind AS ENUM ('image','video');

-- BRANDS
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brands TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY brands_read_all ON public.brands FOR SELECT USING (true);
CREATE POLICY brands_admin_write ON public.brands FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE TRIGGER brands_set_updated_at BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  image_url text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX categories_parent_idx ON public.categories(parent_id);
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_read_all ON public.categories FOR SELECT USING (true);
CREATE POLICY categories_admin_write ON public.categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- COLLECTIONS
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  image_url text,
  is_featured boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.collections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY collections_read_all ON public.collections FOR SELECT USING (true);
CREATE POLICY collections_admin_write ON public.collections FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE TRIGGER collections_set_updated_at BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_description text,
  description text,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  status public.product_status NOT NULL DEFAULT 'draft',
  is_featured boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_status_idx ON public.products(status);
CREATE INDEX products_brand_idx ON public.products(brand_id);
CREATE INDEX products_category_idx ON public.products(category_id);
CREATE INDEX products_search_idx ON public.products USING gin (to_tsvector('portuguese', coalesce(name,'') || ' ' || coalesce(short_description,'') || ' ' || coalesce(description,'')));
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_read_active ON public.products FOR SELECT USING (status = 'active');
CREATE POLICY products_admin_read_all ON public.products FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE POLICY products_admin_write ON public.products FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PRODUCT_COLLECTIONS (M:N)
CREATE TABLE public.product_collections (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, collection_id)
);
GRANT SELECT ON public.product_collections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_collections TO authenticated;
GRANT ALL ON public.product_collections TO service_role;
ALTER TABLE public.product_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY pc_read_all ON public.product_collections FOR SELECT USING (true);
CREATE POLICY pc_admin_write ON public.product_collections FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));

-- PRODUCT_VARIANTS
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  name text,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  barcode text,
  weight_grams int,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pv_product_idx ON public.product_variants(product_id);
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY pv_read_all ON public.product_variants FOR SELECT USING (true);
CREATE POLICY pv_admin_write ON public.product_variants FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));
CREATE TRIGGER pv_set_updated_at BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PRODUCT_MEDIA
CREATE TABLE public.product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  kind public.media_kind NOT NULL DEFAULT 'image',
  url text NOT NULL,
  alt text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pm_product_idx ON public.product_media(product_id);
GRANT SELECT ON public.product_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_media TO authenticated;
GRANT ALL ON public.product_media TO service_role;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_read_all ON public.product_media FOR SELECT USING (true);
CREATE POLICY pm_admin_write ON public.product_media FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog'));

-- PRODUCT_PRICES
CREATE TABLE public.product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'BRL',
  list_price_cents int NOT NULL,
  sale_price_cents int,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pp_variant_idx ON public.product_prices(variant_id);
GRANT SELECT ON public.product_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_prices TO authenticated;
GRANT ALL ON public.product_prices TO service_role;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY pp_read_all ON public.product_prices FOR SELECT USING (true);
CREATE POLICY pp_admin_write ON public.product_prices FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog') OR public.has_role(auth.uid(),'finance'));
CREATE TRIGGER pp_set_updated_at BEFORE UPDATE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PRODUCT_INVENTORY
CREATE TABLE public.product_inventory (
  variant_id uuid PRIMARY KEY REFERENCES public.product_variants(id) ON DELETE CASCADE,
  stock int NOT NULL DEFAULT 0,
  reserved int NOT NULL DEFAULT 0,
  low_stock_threshold int NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_inventory TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_inventory TO authenticated;
GRANT ALL ON public.product_inventory TO service_role;
ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY pi_read_all ON public.product_inventory FOR SELECT USING (true);
CREATE POLICY pi_admin_write ON public.product_inventory FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog') OR public.has_role(auth.uid(),'logistics'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog') OR public.has_role(auth.uid(),'logistics'));
CREATE TRIGGER pi_set_updated_at BEFORE UPDATE ON public.product_inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PRODUCT_SEO
CREATE TABLE public.product_seo (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  meta_title text,
  meta_description text,
  og_image_url text,
  canonical_url text,
  keywords text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_seo TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_seo TO authenticated;
GRANT ALL ON public.product_seo TO service_role;
ALTER TABLE public.product_seo ENABLE ROW LEVEL SECURITY;
CREATE POLICY pseo_read_all ON public.product_seo FOR SELECT USING (true);
CREATE POLICY pseo_admin_write ON public.product_seo FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog') OR public.has_role(auth.uid(),'marketing'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'catalog') OR public.has_role(auth.uid(),'marketing'));
CREATE TRIGGER pseo_set_updated_at BEFORE UPDATE ON public.product_seo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PRODUCT_REVIEWS
CREATE TABLE public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  body text,
  is_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
CREATE INDEX pr_product_idx ON public.product_reviews(product_id);
GRANT SELECT ON public.product_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY pr_read_approved ON public.product_reviews FOR SELECT USING (is_approved = true);
CREATE POLICY pr_read_own ON public.product_reviews FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'support'));
CREATE POLICY pr_insert_own ON public.product_reviews FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY pr_update_own ON public.product_reviews FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'support'))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'support'));
CREATE POLICY pr_delete_admin ON public.product_reviews FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'support'));
CREATE TRIGGER pr_set_updated_at BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FAVORITES (wishlist)
CREATE TABLE public.favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY fav_read_own ON public.favorites FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY fav_insert_own ON public.favorites FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY fav_delete_own ON public.favorites FOR DELETE TO authenticated USING (user_id = auth.uid());

-- HOMEPAGE_BLOCKS
CREATE TABLE public.homepage_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text,
  subtitle text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.homepage_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_blocks TO authenticated;
GRANT ALL ON public.homepage_blocks TO service_role;
ALTER TABLE public.homepage_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY hb_read_active ON public.homepage_blocks FOR SELECT USING (is_active = true);
CREATE POLICY hb_admin_all ON public.homepage_blocks FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'marketing') OR public.has_role(auth.uid(),'catalog'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'marketing') OR public.has_role(auth.uid(),'catalog'));
CREATE TRIGGER hb_set_updated_at BEFORE UPDATE ON public.homepage_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed inicial de categorias e blocos
INSERT INTO public.categories (slug, name, description, position) VALUES
  ('skincare','Skincare','Cuidados diários para a pele',1),
  ('maquiagem','Maquiagem','Base, batom, olhos e mais',2),
  ('cabelos','Cabelos','Shampoo, condicionador e tratamentos',3),
  ('perfumaria','Perfumaria','Fragrâncias masculinas e femininas',4),
  ('corpo-banho','Corpo & Banho','Hidratantes, sabonetes e óleos',5);

INSERT INTO public.collections (slug, name, description, is_featured, position) VALUES
  ('lancamentos','Lançamentos','Novidades que acabaram de chegar',true,1),
  ('mais-vendidos','Mais vendidos','O que está bombando na loja',true,2),
  ('promocoes','Promoções','Ofertas por tempo limitado',true,3);
