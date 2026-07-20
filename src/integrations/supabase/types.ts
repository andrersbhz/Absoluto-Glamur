export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          complement: string | null
          country: string
          created_at: string
          district: string
          document: string | null
          id: string
          is_default: boolean
          label: string | null
          number: string
          phone: string | null
          recipient_name: string
          state: string
          street: string
          updated_at: string
          user_id: string
          zip_code: string
        }
        Insert: {
          city: string
          complement?: string | null
          country?: string
          created_at?: string
          district: string
          document?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          number: string
          phone?: string | null
          recipient_name: string
          state: string
          street: string
          updated_at?: string
          user_id: string
          zip_code: string
        }
        Update: {
          city?: string
          complement?: string | null
          country?: string
          created_at?: string
          district?: string
          document?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          number?: string
          phone?: string | null
          recipient_name?: string
          state?: string
          street?: string
          updated_at?: string
          user_id?: string
          zip_code?: string
        }
        Relationships: []
      }
      ai_generations: {
        Row: {
          cost_usd: number | null
          created_at: string
          error: string | null
          id: string
          input: Json
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output: string | null
          output_tokens: number | null
          provider: string
          purpose: string
          related_id: string | null
          related_kind: string | null
          status: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output?: string | null
          output_tokens?: number | null
          provider?: string
          purpose: string
          related_id?: string | null
          related_kind?: string | null
          status?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output?: string | null
          output_tokens?: number | null
          provider?: string
          purpose?: string
          related_id?: string | null
          related_kind?: string | null
          status?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          ip_hash: string | null
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_featured: boolean
          name: string
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          name: string
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          name?: string
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_blocks: {
        Row: {
          created_at: string
          data: Json
          id: string
          is_active: boolean
          kind: string
          position: number
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          is_active?: boolean
          kind: string
          position?: number
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          is_active?: boolean
          kind?: string
          position?: number
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          api_key: string | null
          api_secret: string | null
          category: string
          config: Json
          created_at: string
          description: string | null
          display_name: string
          enabled: boolean
          last_error: string | null
          last_status: string | null
          last_verified_at: string | null
          mode: string
          provider: string
          updated_at: string
          updated_by: string | null
          webhook_token: string | null
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          category?: string
          config?: Json
          created_at?: string
          description?: string | null
          display_name: string
          enabled?: boolean
          last_error?: string | null
          last_status?: string | null
          last_verified_at?: string | null
          mode?: string
          provider: string
          updated_at?: string
          updated_by?: string | null
          webhook_token?: string | null
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          category?: string
          config?: Json
          created_at?: string
          description?: string | null
          display_name?: string
          enabled?: boolean
          last_error?: string | null
          last_status?: string | null
          last_verified_at?: string | null
          mode?: string
          provider?: string
          updated_at?: string
          updated_by?: string | null
          webhook_token?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          slug: string | null
          total_cents: number
          unit_cents: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          slug?: string | null
          total_cents: number
          unit_cents: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          slug?: string | null
          total_cents?: number
          unit_cents?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          code: string
          created_at: string
          currency: string
          customer_document: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          discount_cents: number
          id: string
          notes: string | null
          paid_at: string | null
          shipping_address: Json
          shipping_cents: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          code: string
          created_at?: string
          currency?: string
          customer_document: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          discount_cents?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          shipping_address: Json
          shipping_cents?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          code?: string
          created_at?: string
          currency?: string
          customer_document?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          discount_cents?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          shipping_address?: Json
          shipping_cents?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          external_id: string | null
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          provider: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          provider?: string
        }
        Relationships: []
      }
      payment_method_routing: {
        Row: {
          created_at: string
          display_label: string | null
          enabled: boolean
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          provider: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          display_label?: string | null
          enabled?: boolean
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          provider: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          display_label?: string | null
          enabled?: boolean
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          provider?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          approval_code: string | null
          created_at: string
          external_customer_id: string | null
          external_id: string | null
          id: string
          invoice_url: string | null
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          paid_at: string | null
          pix_expires_at: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          provider: string
          raw: Json | null
          redirect_url: string | null
          return_url: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          approval_code?: string | null
          created_at?: string
          external_customer_id?: string | null
          external_id?: string | null
          id?: string
          invoice_url?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          order_id: string
          paid_at?: string | null
          pix_expires_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          provider?: string
          raw?: Json | null
          redirect_url?: string | null
          return_url?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          approval_code?: string | null
          created_at?: string
          external_customer_id?: string | null
          external_id?: string | null
          id?: string
          invoice_url?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          paid_at?: string | null
          pix_expires_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          provider?: string
          raw?: Json | null
          redirect_url?: string | null
          return_url?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      pricing_calculations: {
        Row: {
          applied: boolean
          breakdown: Json
          computed_at: string
          computed_by: string | null
          cost_cents: number
          final_price_cents: number
          id: string
          margin_pct: number
          product_id: string
          rule_id: string | null
          suggested_price_cents: number
        }
        Insert: {
          applied?: boolean
          breakdown: Json
          computed_at?: string
          computed_by?: string | null
          cost_cents: number
          final_price_cents: number
          id?: string
          margin_pct: number
          product_id: string
          rule_id?: string | null
          suggested_price_cents: number
        }
        Update: {
          applied?: boolean
          breakdown?: Json
          computed_at?: string
          computed_by?: string | null
          cost_cents?: number
          final_price_cents?: number
          id?: string
          margin_pct?: number
          product_id?: string
          rule_id?: string | null
          suggested_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_calculations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_calculations_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_cost_components: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          key: string
          label: string
          notes: string | null
          pct_of_price: number | null
          product_id: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          key: string
          label: string
          notes?: string | null
          pct_of_price?: number | null
          product_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          key?: string
          label?: string
          notes?: string | null
          pct_of_price?: number | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_cost_components_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          applies_to_brand_id: string | null
          applies_to_category_id: string | null
          created_at: string
          description: string | null
          fixed_fee_cents: number
          id: string
          is_active: boolean
          is_default: boolean
          markup_pct: number
          max_margin_pct: number | null
          min_margin_pct: number | null
          name: string
          priority: number
          rounding: string
          updated_at: string
        }
        Insert: {
          applies_to_brand_id?: string | null
          applies_to_category_id?: string | null
          created_at?: string
          description?: string | null
          fixed_fee_cents?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          markup_pct?: number
          max_margin_pct?: number | null
          min_margin_pct?: number | null
          name: string
          priority?: number
          rounding?: string
          updated_at?: string
        }
        Update: {
          applies_to_brand_id?: string | null
          applies_to_category_id?: string | null
          created_at?: string
          description?: string | null
          fixed_fee_cents?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          markup_pct?: number
          max_margin_pct?: number | null
          min_margin_pct?: number | null
          name?: string
          priority?: number
          rounding?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_applies_to_brand_id_fkey"
            columns: ["applies_to_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_applies_to_category_id_fkey"
            columns: ["applies_to_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collections: {
        Row: {
          collection_id: string
          position: number
          product_id: string
        }
        Insert: {
          collection_id: string
          position?: number
          product_id: string
        }
        Update: {
          collection_id?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_external_reviews: {
        Row: {
          author_country: string | null
          author_name: string | null
          body: string | null
          created_at: string
          id: string
          images: Json
          is_visible: boolean
          product_id: string
          rating: number
          reviewed_at: string | null
          source: string
          source_review_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          author_country?: string | null
          author_name?: string | null
          body?: string | null
          created_at?: string
          id?: string
          images?: Json
          is_visible?: boolean
          product_id: string
          rating?: number
          reviewed_at?: string | null
          source?: string
          source_review_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_country?: string | null
          author_name?: string | null
          body?: string | null
          created_at?: string
          id?: string
          images?: Json
          is_visible?: boolean
          product_id?: string
          rating?: number
          reviewed_at?: string | null
          source?: string
          source_review_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_external_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_imports: {
        Row: {
          created_at: string
          error: string | null
          id: string
          imported_by: string | null
          markup_fixed: number | null
          markup_percent: number | null
          normalized_data: Json
          product_id: string | null
          raw_data: Json
          source: string
          source_id: string | null
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          imported_by?: string | null
          markup_fixed?: number | null
          markup_percent?: number | null
          normalized_data?: Json
          product_id?: string | null
          raw_data?: Json
          source: string
          source_id?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          imported_by?: string | null
          markup_fixed?: number | null
          markup_percent?: number | null
          normalized_data?: Json
          product_id?: string | null
          raw_data?: Json
          source?: string
          source_id?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_imports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_inventory: {
        Row: {
          low_stock_threshold: number
          reserved: number
          stock: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          low_stock_threshold?: number
          reserved?: number
          stock?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          low_stock_threshold?: number
          reserved?: number
          stock?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["media_kind"]
          position: number
          product_id: string
          url: string
          variant_id: string | null
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          position?: number
          product_id: string
          url: string
          variant_id?: string | null
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          position?: number
          product_id?: string
          url?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          currency: string
          ends_at: string | null
          id: string
          is_active: boolean
          list_price_cents: number
          sale_price_cents: number | null
          starts_at: string | null
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          list_price_cents: number
          sale_price_cents?: number | null
          starts_at?: string | null
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          list_price_cents?: number
          sale_price_cents?: number | null
          starts_at?: string | null
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_approved: boolean
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_score_components: {
        Row: {
          created_at: string
          id: string
          key: string
          label: string
          normalized: number
          notes: string | null
          raw_value: number | null
          score_id: string
          source: string | null
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          label: string
          normalized?: number
          notes?: string | null
          raw_value?: number | null
          score_id: string
          source?: string | null
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label?: string
          normalized?: number
          notes?: string | null
          raw_value?: number | null
          score_id?: string
          source?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_score_components_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "product_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_score_versions: {
        Row: {
          computed_at: string
          computed_by: string | null
          id: string
          overall: number
          product_id: string
          snapshot: Json
        }
        Insert: {
          computed_at?: string
          computed_by?: string | null
          id?: string
          overall: number
          product_id: string
          snapshot: Json
        }
        Update: {
          computed_at?: string
          computed_by?: string | null
          id?: string
          overall?: number
          product_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "product_score_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_scores: {
        Row: {
          competitiveness: number
          computed_at: string
          created_at: string
          demand: number
          id: string
          label: string | null
          margin: number
          overall: number
          product_id: string
          quality: number
          recommendation: string | null
          risk: number
          updated_at: string
        }
        Insert: {
          competitiveness?: number
          computed_at?: string
          created_at?: string
          demand?: number
          id?: string
          label?: string | null
          margin?: number
          overall?: number
          product_id: string
          quality?: number
          recommendation?: string | null
          risk?: number
          updated_at?: string
        }
        Update: {
          competitiveness?: number
          computed_at?: string
          created_at?: string
          demand?: number
          id?: string
          label?: string | null
          margin?: number
          overall?: number
          product_id?: string
          quality?: number
          recommendation?: string | null
          risk?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_scores_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_seo: {
        Row: {
          canonical_url: string | null
          keywords: string[]
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          canonical_url?: string | null
          keywords?: string[]
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          canonical_url?: string | null
          keywords?: string[]
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_seo_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string | null
          options: Json
          product_id: string
          sku: string
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string | null
          options?: Json
          product_id: string
          sku: string
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          barcode?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string | null
          options?: Json
          product_id?: string
          sku?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json
          brand_id: string | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_featured: boolean
          name: string
          rating_avg: number
          rating_count: number
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          attributes?: Json
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          name: string
          rating_avg?: number
          rating_count?: number
          short_description?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          attributes?: Json
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          name?: string
          rating_avg?: number
          rating_count?: number
          short_description?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          device: string | null
          id: string
          ip_hash: string | null
          last_seen_at: string
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "admin"
        | "catalog"
        | "marketing"
        | "finance"
        | "support"
        | "logistics"
        | "analyst"
        | "compliance"
        | "customer"
      media_kind: "image" | "video"
      order_status:
        | "pending"
        | "awaiting_payment"
        | "paid"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
        | "failed"
      payment_method: "pix" | "credit_card" | "boleto" | "nubank_redirect"
      payment_status:
        | "pending"
        | "confirmed"
        | "received"
        | "overdue"
        | "refunded"
        | "cancelled"
        | "failed"
      product_status: "draft" | "active" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "superadmin",
        "admin",
        "catalog",
        "marketing",
        "finance",
        "support",
        "logistics",
        "analyst",
        "compliance",
        "customer",
      ],
      media_kind: ["image", "video"],
      order_status: [
        "pending",
        "awaiting_payment",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
        "failed",
      ],
      payment_method: ["pix", "credit_card", "boleto", "nubank_redirect"],
      payment_status: [
        "pending",
        "confirmed",
        "received",
        "overdue",
        "refunded",
        "cancelled",
        "failed",
      ],
      product_status: ["draft", "active", "archived"],
    },
  },
} as const
