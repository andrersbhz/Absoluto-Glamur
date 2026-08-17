export type IntegrationCatalogItem = {
  provider: string;
  category: string;
  display_name: string;
  description: string;
  default_mode: "sandbox" | "production";
};

/**
 * Canonical provider registry used by the admin UI.
 *
 * Integrations must remain visible even when they are disconnected or a database
 * row has not been created yet. Persisted rows only overlay connection state and
 * non-secret configuration on top of this registry.
 */
export const INTEGRATION_CATALOG: IntegrationCatalogItem[] = [
  {
    provider: "gemini",
    category: "ai",
    display_name: "Google Gemini",
    description: "Alternativa de IA multimodal.",
    default_mode: "production",
  },
  {
    provider: "openai",
    category: "ai",
    display_name: "OpenAI",
    description: "Geração de textos e imagens com chave própria da conta.",
    default_mode: "production",
  },
  {
    provider: "aliexpress",
    category: "import",
    display_name: "AliExpress Open Platform",
    description: "Importação, estoque, variações e avaliações pela API oficial do AliExpress.",
    default_mode: "production",
  },
  {
    provider: "facebook",
    category: "marketing",
    display_name: "Facebook Page",
    description: "Publicação automática do blog na Página via Meta Graph API.",
    default_mode: "production",
  },
  {
    provider: "instagram",
    category: "marketing",
    display_name: "Instagram Business",
    description: "Publicação automática no Instagram profissional via Meta Graph API.",
    default_mode: "production",
  },
  {
    provider: "meta_ads",
    category: "marketing",
    display_name: "Meta Ads (Facebook/Instagram)",
    description: "Campanhas e Pixel/CAPI.",
    default_mode: "production",
  },
  {
    provider: "google_ads",
    category: "marketing",
    display_name: "Google Ads",
    description: "Campanhas e conversões no Google Ads.",
    default_mode: "production",
  },
  {
    provider: "google_merchant",
    category: "marketing",
    display_name: "Google Merchant Center",
    description: "Feed de produtos para Shopping.",
    default_mode: "sandbox",
  },
  {
    provider: "google_tag_manager",
    category: "marketing",
    display_name: "Google Tag Manager",
    description: "Container GTM para analytics, remarketing e conversões.",
    default_mode: "production",
  },
  {
    provider: "asaas",
    category: "payments",
    display_name: "Asaas",
    description: "Pagamentos PIX, boleto e cartão.",
    default_mode: "production",
  },
  {
    provider: "pagbank",
    category: "payments",
    display_name: "PagBank (PagSeguro)",
    description: "Checkout PagBank com PIX, cartão e boleto.",
    default_mode: "production",
  },
  {
    provider: "nupay",
    category: "payments",
    display_name: "NuPay (Nubank)",
    description: "Checkout Nubank com aprovação no app e confirmação por webhook.",
    default_mode: "sandbox",
  },
  {
    provider: "mercadopago",
    category: "payments",
    display_name: "Mercado Pago",
    description: "PIX e cartão via Mercado Pago.",
    default_mode: "sandbox",
  },
  {
    provider: "stripe",
    category: "payments",
    display_name: "Stripe",
    description: "Cartão internacional, Apple Pay e Google Pay.",
    default_mode: "sandbox",
  },
  {
    provider: "17track",
    category: "shipping",
    display_name: "17TRACK (Rastreio Global)",
    description: "Rastreamento multi-transportadora para pedidos internacionais.",
    default_mode: "production",
  },
  {
    provider: "correios",
    category: "shipping",
    display_name: "Correios",
    description: "Cálculo de frete direto pelos Correios.",
    default_mode: "sandbox",
  },
  {
    provider: "melhorenvio",
    category: "shipping",
    display_name: "Melhor Envio",
    description: "Cotação e emissão de etiquetas de envio.",
    default_mode: "sandbox",
  },
  {
    provider: "r2",
    category: "storage",
    display_name: "Cloudflare R2",
    description: "Armazenamento de mídias em escala.",
    default_mode: "sandbox",
  },
];

export const INTEGRATION_CATALOG_BY_PROVIDER = new Map(
  INTEGRATION_CATALOG.map((item) => [item.provider, item] as const),
);
