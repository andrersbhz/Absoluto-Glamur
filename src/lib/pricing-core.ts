export type ProfessionalPricingProfile = {
  gateway_pct?: number | string | null;
  gateway_fixed_cents?: number | string | null;
  tax_pct?: number | string | null;
  fx_spread_pct?: number | string | null;
  returns_pct?: number | string | null;
  chargeback_pct?: number | string | null;
  operational_pct?: number | string | null;
  desired_margin_pct?: number | string | null;
  target_ad_cost_pct?: number | string | null;
  shipping_subsidy_cents?: number | string | null;
  packaging_cents?: number | string | null;
};

export type LegacyImportPricing = {
  markup_percent: number;
  markup_fixed_cents: number;
  round_to_99: boolean;
};

export function roundPriceTo99(cents: number): number {
  return Math.max(99, Math.floor(Math.max(0, cents) / 100) * 100 + 99);
}

export function computeProfessionalListPrice(
  supplierCostCents: number,
  additionalCostCents: number,
  profile: ProfessionalPricingProfile,
): number {
  if (!Number.isFinite(supplierCostCents) || supplierCostCents <= 0) return 0;
  const fixedBase =
    supplierCostCents +
    Math.max(0, additionalCostCents) +
    Number(profile.packaging_cents ?? 0) +
    Number(profile.shipping_subsidy_cents ?? 0);
  const landed = fixedBase * (1 + Number(profile.fx_spread_pct ?? 0) / 100);
  const variablePct =
    Number(profile.gateway_pct ?? 0) +
    Number(profile.tax_pct ?? 0) +
    Number(profile.returns_pct ?? 0) +
    Number(profile.chargeback_pct ?? 0) +
    Number(profile.operational_pct ?? 0) +
    Number(profile.target_ad_cost_pct ?? 0) +
    Number(profile.desired_margin_pct ?? 0);
  if (!Number.isFinite(variablePct) || variablePct >= 95) {
    throw new Error("A soma de custos percentuais e margem deve ser menor que 95%.");
  }
  const recommended = roundPriceTo99(Math.ceil(
    (landed + Number(profile.gateway_fixed_cents ?? 0)) / (1 - variablePct / 100),
  ));
  // A v1.2 mantém 10% de espaço entre preço normal e recomendado. Descontos
  // são aplicados depois, sem alterar este preço-base.
  return roundPriceTo99(Math.ceil(recommended / 0.9));
}

export function computeLegacyListPrice(
  supplierCostCents: number,
  settings: LegacyImportPricing,
): number {
  if (!Number.isFinite(supplierCostCents) || supplierCostCents <= 0) return 0;
  const raw =
    Math.round(supplierCostCents * (1 + settings.markup_percent / 100)) +
    settings.markup_fixed_cents;
  return settings.round_to_99 ? roundPriceTo99(raw) : Math.max(0, raw);
}

export function resolveDiscountPercent(
  productId: string,
  categoryId: string | null,
  productDiscounts: Map<string, number>,
  categoryDiscounts: Map<string, number>,
  globalDiscount: number | null,
): number {
  const product = productDiscounts.get(productId);
  if (product !== undefined) return product;
  if (categoryId) {
    const category = categoryDiscounts.get(categoryId);
    if (category !== undefined) return category;
  }
  return globalDiscount ?? 0;
}

export function salePriceFromDiscount(listCents: number, percent: number): number | null {
  if (!(percent > 0) || !(listCents > 0)) return null;
  const sale = Math.max(0, Math.round(listCents * (1 - percent / 100)));
  return sale > 0 && sale < listCents ? sale : null;
}