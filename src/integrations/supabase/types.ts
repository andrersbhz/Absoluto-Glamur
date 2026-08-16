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
      abandoned_checkouts: {
        Row: {
          cart_snapshot: Json
          email: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          phone: string | null
          recovered_at: string | null
          recovery_channel: string | null
          session_id: string
          source: string | null
          subtotal_cents: number
          total_cents: number
          user_id: string | null
          utm: Json
        }
        Insert: {
          cart_snapshot?: Json
          email?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          phone?: string | null
          recovered_at?: string | null
          recovery_channel?: string | null
          session_id: string
          source?: string | null
          subtotal_cents?: number
          total_cents?: number
          user_id?: string | null
          utm?: Json
        }
        Update: {
          cart_snapshot?: Json
          email?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          phone?: string | null
          recovered_at?: string | null
          recovery_channel?: string | null
          session_id?: string
          source?: string | null
          subtotal_cents?: number
          total_cents?: number
          user_id?: string | null
          utm?: Json
        }
        Relationships: []
      }
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
      admin_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
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
      analytics_events: {
        Row: {
          created_at: string | null
          event_name: string
          id: string
          metadata: Json | null
          page_path: string | null
          product_id: string | null
          product_name: string | null
          session_id: string | null
          value_cents: number | null
          visitor_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_name: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          product_id?: string | null
          product_name?: string | null
          session_id?: string | null
          value_cents?: number | null
          visitor_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_name?: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          product_id?: string | null
          product_name?: string | null
          session_id?: string | null
          value_cents?: number | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visitor_sessions"
            referencedColumns: ["id"]
          },
        ]
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
      blog_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          meta_description: string | null
          name: string
          position: number
          seo_title: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          meta_description?: string | null
          name: string
          position?: number
          seo_title?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          meta_description?: string | null
          name?: string
          position?: number
          seo_title?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      blog_post_products: {
        Row: {
          position: number
          post_id: string
          product_id: string
        }
        Insert: {
          position?: number
          post_id: string
          product_id: string
        }
        Update: {
          position?: number
          post_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_products_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_revisions: {
        Row: {
          content_html: string
          created_at: string
          created_by: string | null
          excerpt: string | null
          id: string
          post_id: string
          seo_snapshot: Json
          title: string
        }
        Insert: {
          content_html: string
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          post_id: string
          seo_snapshot?: Json
          title: string
        }
        Update: {
          content_html?: string
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          post_id?: string
          seo_snapshot?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_revisions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          ai_model: string | null
          ai_prompt_version: string | null
          ai_provider: string | null
          author_id: string | null
          canonical_url: string | null
          category_id: string | null
          content_html: string
          created_at: string
          excerpt: string | null
          faq: Json
          featured_image_alt: string | null
          featured_image_url: string | null
          focus_keyword: string | null
          id: string
          meta_description: string | null
          published_at: string | null
          read_time_minutes: number
          secondary_keywords: string[]
          seo_checks: Json
          seo_score: number
          seo_title: string | null
          slug: string
          social_caption_facebook: string | null
          social_caption_instagram: string | null
          social_hashtags: string[]
          status: string
          tags: string[]
          title: string
          updated_at: string
          word_count: number
        }
        Insert: {
          ai_model?: string | null
          ai_prompt_version?: string | null
          ai_provider?: string | null
          author_id?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content_html?: string
          created_at?: string
          excerpt?: string | null
          faq?: Json
          featured_image_alt?: string | null
          featured_image_url?: string | null
          focus_keyword?: string | null
          id?: string
          meta_description?: string | null
          published_at?: string | null
          read_time_minutes?: number
          secondary_keywords?: string[]
          seo_checks?: Json
          seo_score?: number
          seo_title?: string | null
          slug: string
          social_caption_facebook?: string | null
          social_caption_instagram?: string | null
          social_hashtags?: string[]
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          word_count?: number
        }
        Update: {
          ai_model?: string | null
          ai_prompt_version?: string | null
          ai_provider?: string | null
          author_id?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content_html?: string
          created_at?: string
          excerpt?: string | null
          faq?: Json
          featured_image_alt?: string | null
          featured_image_url?: string | null
          focus_keyword?: string | null
          id?: string
          meta_description?: string | null
          published_at?: string | null
          read_time_minutes?: number
          secondary_keywords?: string[]
          seo_checks?: Json
          seo_score?: number
          seo_title?: string | null
          slug?: string
          social_caption_facebook?: string | null
          social_caption_instagram?: string | null
          social_hashtags?: string[]
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_social_publications: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          external_id: string | null
          external_url: string | null
          id: string
          payload: Json
          platform: string
          post_id: string
          published_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          payload?: Json
          platform: string
          post_id: string
          published_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          payload?: Json
          platform?: string
          post_id?: string
          published_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_social_publications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
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
      commerce_events: {
        Row: {
          campaign: string | null
          channel: string | null
          event_name: string
          id: number
          metadata: Json
          occurred_at: string
          order_id: string | null
          product_id: string | null
          session_id: string | null
          user_id: string | null
          value_cents: number | null
        }
        Insert: {
          campaign?: string | null
          channel?: string | null
          event_name: string
          id?: number
          metadata?: Json
          occurred_at?: string
          order_id?: string | null
          product_id?: string | null
          session_id?: string | null
          user_id?: string | null
          value_cents?: number | null
        }
        Update: {
          campaign?: string | null
          channel?: string | null
          event_name?: string
          id?: number
          metadata?: Json
          occurred_at?: string
          order_id?: string | null
          product_id?: string | null
          session_id?: string | null
          user_id?: string | null
          value_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commerce_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
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
      marketing_spend_daily: {
        Row: {
          attributed_revenue_cents: number
          campaign: string
          channel: string
          clicks: number
          conversions: number
          created_at: string
          day: string
          id: string
          impressions: number
          metadata: Json
          source: string
          spend_cents: number
          updated_at: string
        }
        Insert: {
          attributed_revenue_cents?: number
          campaign?: string
          channel: string
          clicks?: number
          conversions?: number
          created_at?: string
          day: string
          id?: string
          impressions?: number
          metadata?: Json
          source?: string
          spend_cents?: number
          updated_at?: string
        }
        Update: {
          attributed_revenue_cents?: number
          campaign?: string
          channel?: string
          clicks?: number
          conversions?: number
          created_at?: string
          day?: string
          id?: string
          impressions?: number
          metadata?: Json
          source?: string
          spend_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          aliexpress_product_id: string | null
          aliexpress_sku_attr: string | null
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
          aliexpress_product_id?: string | null
          aliexpress_sku_attr?: string | null
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
          aliexpress_product_id?: string | null
          aliexpress_sku_attr?: string | null
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
          fulfillment_error: string | null
          fulfillment_order_id: string | null
          fulfillment_provider: string | null
          fulfillment_response: Json | null
          fulfillment_sent_at: string | null
          fulfillment_status: string
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
          fulfillment_error?: string | null
          fulfillment_order_id?: string | null
          fulfillment_provider?: string | null
          fulfillment_response?: Json | null
          fulfillment_sent_at?: string | null
          fulfillment_status?: string
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
          fulfillment_error?: string | null
          fulfillment_order_id?: string | null
          fulfillment_provider?: string | null
          fulfillment_response?: Json | null
          fulfillment_sent_at?: string | null
          fulfillment_status?: string
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
      pricing_profiles: {
        Row: {
          chargeback_pct: number
          desired_margin_pct: number
          enabled: boolean
          fx_spread_pct: number
          gateway_fixed_cents: number
          gateway_pct: number
          id: string
          is_default: boolean
          name: string
          operational_pct: number
          packaging_cents: number
          returns_pct: number
          shipping_subsidy_cents: number
          target_ad_cost_pct: number
          tax_pct: number
          updated_at: string
        }
        Insert: {
          chargeback_pct?: number
          desired_margin_pct?: number
          enabled?: boolean
          fx_spread_pct?: number
          gateway_fixed_cents?: number
          gateway_pct?: number
          id?: string
          is_default?: boolean
          name: string
          operational_pct?: number
          packaging_cents?: number
          returns_pct?: number
          shipping_subsidy_cents?: number
          target_ad_cost_pct?: number
          tax_pct?: number
          updated_at?: string
        }
        Update: {
          chargeback_pct?: number
          desired_margin_pct?: number
          enabled?: boolean
          fx_spread_pct?: number
          gateway_fixed_cents?: number
          gateway_pct?: number
          id?: string
          is_default?: boolean
          name?: string
          operational_pct?: number
          packaging_cents?: number
          returns_pct?: number
          shipping_subsidy_cents?: number
          target_ad_cost_pct?: number
          tax_pct?: number
          updated_at?: string
        }
        Relationships: []
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
          body_translated: boolean
          created_at: string
          id: string
          images: Json
          is_visible: boolean
          last_synced_at: string | null
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
          body_translated?: boolean
          created_at?: string
          id?: string
          images?: Json
          is_visible?: boolean
          last_synced_at?: string | null
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
          body_translated?: boolean
          created_at?: string
          id?: string
          images?: Json
          is_visible?: boolean
          last_synced_at?: string | null
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
      product_market_metrics: {
        Row: {
          captured_at: string
          competition_score: number | null
          data_points: number
          external_sales: number
          growth_30d_pct: number | null
          growth_7d_pct: number | null
          growth_90d_pct: number | null
          product_id: string
          raw: Json
          sales_30d: number
          sales_7d: number
          sales_90d: number
          shipping_score: number | null
          source: string
          supplier_score: number | null
          trend_score: number | null
          updated_at: string
        }
        Insert: {
          captured_at?: string
          competition_score?: number | null
          data_points?: number
          external_sales?: number
          growth_30d_pct?: number | null
          growth_7d_pct?: number | null
          growth_90d_pct?: number | null
          product_id: string
          raw?: Json
          sales_30d?: number
          sales_7d?: number
          sales_90d?: number
          shipping_score?: number | null
          source?: string
          supplier_score?: number | null
          trend_score?: number | null
          updated_at?: string
        }
        Update: {
          captured_at?: string
          competition_score?: number | null
          data_points?: number
          external_sales?: number
          growth_30d_pct?: number | null
          growth_7d_pct?: number | null
          growth_90d_pct?: number | null
          product_id?: string
          raw?: Json
          sales_30d?: number
          sales_7d?: number
          sales_90d?: number
          shipping_score?: number | null
          source?: string
          supplier_score?: number | null
          trend_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_market_metrics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
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
          commercial: number
          competitiveness: number
          computed_at: string
          confidence: number
          created_at: string
          demand: number
          id: string
          label: string | null
          margin: number
          opportunity: number
          overall: number
          product_id: string
          quality: number
          recommendation: string | null
          risk: number
          trend: number
          updated_at: string
        }
        Insert: {
          commercial?: number
          competitiveness?: number
          computed_at?: string
          confidence?: number
          created_at?: string
          demand?: number
          id?: string
          label?: string | null
          margin?: number
          opportunity?: number
          overall?: number
          product_id: string
          quality?: number
          recommendation?: string | null
          risk?: number
          trend?: number
          updated_at?: string
        }
        Update: {
          commercial?: number
          competitiveness?: number
          computed_at?: string
          confidence?: number
          created_at?: string
          demand?: number
          id?: string
          label?: string | null
          margin?: number
          opportunity?: number
          overall?: number
          product_id?: string
          quality?: number
          recommendation?: string | null
          risk?: number
          trend?: number
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
          external_sku_attr: string | null
          external_sku_id: string | null
          id: string
          is_available: boolean
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
          external_sku_attr?: string | null
          external_sku_id?: string | null
          id?: string
          is_available?: boolean
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
          external_sku_attr?: string | null
          external_sku_id?: string | null
          id?: string
          is_available?: boolean
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
      push_config: {
        Row: {
          created_at: string
          id: boolean
          updated_at: string
          vapid_private_key: string
          vapid_public_key: string
          vapid_subject: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          updated_at?: string
          vapid_private_key: string
          vapid_public_key: string
          vapid_subject?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          updated_at?: string
          vapid_private_key?: string
          vapid_public_key?: string
          vapid_subject?: string
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
      visitor_sessions: {
        Row: {
          browser: string | null
          cart_value_cents: number | null
          city: string | null
          converted: boolean | null
          country: string | null
          created_at: string | null
          current_page: string | null
          device_type: string | null
          funnel_stage:
            | Database["public"]["Enums"]["visitor_funnel_stage"]
            | null
          id: string
          is_online: boolean | null
          items_count: number | null
          last_seen_at: string | null
          latitude_approx: number | null
          longitude_approx: number | null
          os: string | null
          referrer: string | null
          session_id: string
          state: string | null
          updated_at: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string
        }
        Insert: {
          browser?: string | null
          cart_value_cents?: number | null
          city?: string | null
          converted?: boolean | null
          country?: string | null
          created_at?: string | null
          current_page?: string | null
          device_type?: string | null
          funnel_stage?:
            | Database["public"]["Enums"]["visitor_funnel_stage"]
            | null
          id?: string
          is_online?: boolean | null
          items_count?: number | null
          last_seen_at?: string | null
          latitude_approx?: number | null
          longitude_approx?: number | null
          os?: string | null
          referrer?: string | null
          session_id: string
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id: string
        }
        Update: {
          browser?: string | null
          cart_value_cents?: number | null
          city?: string | null
          converted?: boolean | null
          country?: string | null
          created_at?: string | null
          current_page?: string | null
          device_type?: string | null
          funnel_stage?:
            | Database["public"]["Enums"]["visitor_funnel_stage"]
            | null
          id?: string
          is_online?: boolean | null
          items_count?: number | null
          last_seen_at?: string | null
          latitude_approx?: number | null
          longitude_approx?: number | null
          os?: string | null
          referrer?: string | null
          session_id?: string
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      whatsapp_contacts: {
        Row: {
          created_at: string | null
          id: string
          name: string | null
          phone: string
          profile_picture: string | null
          updated_at: string | null
          whatsapp_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string | null
          phone: string
          profile_picture?: string | null
          updated_at?: string | null
          whatsapp_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string | null
          phone?: string
          profile_picture?: string | null
          updated_at?: string | null
          whatsapp_id?: string | null
        }
        Relationships: []
      }
      whatsapp_conversation_tags: {
        Row: {
          conversation_id: string
          tag_id: string
        }
        Insert: {
          conversation_id: string
          tag_id: string
        }
        Update: {
          conversation_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversation_tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversation_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          assigned_at: string | null
          assigned_user_id: string | null
          contact_id: string
          created_at: string | null
          finished_at: string | null
          id: string
          last_message_at: string | null
          priority: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["whatsapp_conversation_status"]
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          contact_id: string
          created_at?: string | null
          finished_at?: string | null
          id?: string
          last_message_at?: string | null
          priority?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["whatsapp_conversation_status"]
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          contact_id?: string
          created_at?: string | null
          finished_at?: string | null
          id?: string
          last_message_at?: string | null
          priority?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["whatsapp_conversation_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_internal_notes: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          delivered_at: string | null
          direction: Database["public"]["Enums"]["whatsapp_message_direction"]
          id: string
          media_url: string | null
          read_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["whatsapp_message_status"] | null
          type: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          delivered_at?: string | null
          direction: Database["public"]["Enums"]["whatsapp_message_direction"]
          id?: string
          media_url?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["whatsapp_message_status"] | null
          type?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["whatsapp_message_direction"]
          id?: string
          media_url?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["whatsapp_message_status"] | null
          type?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_tags: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_offline_sessions: { Args: never; Returns: undefined }
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
      visitor_funnel_stage:
        | "browsing"
        | "product_view"
        | "cart"
        | "checkout"
        | "purchased"
      whatsapp_conversation_status:
        | "waiting"
        | "in_service"
        | "finished"
        | "transferred"
      whatsapp_message_direction: "inbound" | "outbound"
      whatsapp_message_status: "sent" | "delivered" | "read" | "failed"
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
      visitor_funnel_stage: [
        "browsing",
        "product_view",
        "cart",
        "checkout",
        "purchased",
      ],
      whatsapp_conversation_status: [
        "waiting",
        "in_service",
        "finished",
        "transferred",
      ],
      whatsapp_message_direction: ["inbound", "outbound"],
      whatsapp_message_status: ["sent", "delivered", "read", "failed"],
    },
  },
} as const
