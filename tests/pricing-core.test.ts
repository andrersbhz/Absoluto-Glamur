import { describe, expect, test } from "bun:test";
import {
  computeLegacyListPrice,
  computeProfessionalListPrice,
  resolveDiscountPercent,
  salePriceFromDiscount,
} from "../src/lib/pricing-core";

describe("pricing core", () => {
  test("applies the professional profile and .99 rounding", () => {
    expect(computeProfessionalListPrice(10_000, 500, {
      gateway_pct: 5,
      tax_pct: 5,
      returns_pct: 2,
      chargeback_pct: 1,
      operational_pct: 2,
      target_ad_cost_pct: 15,
      desired_margin_pct: 20,
      fx_spread_pct: 4,
      gateway_fixed_cents: 100,
    })).toBe(24_599);
  });

  test("rejects unsustainable percentage totals", () => {
    expect(() => computeProfessionalListPrice(1_000, 0, { desired_margin_pct: 95 })).toThrow();
  });

  test("keeps the legacy fallback deterministic", () => {
    expect(computeLegacyListPrice(4_000, { markup_percent: 150, markup_fixed_cents: 0, round_to_99: true })).toBe(10_099);
  });

  test("resolves product over category over global, including explicit zero", () => {
    const product = new Map([["p1", 0], ["p2", 10]]);
    const category = new Map([["c1", 20]]);
    expect(resolveDiscountPercent("p1", "c1", product, category, 30)).toBe(0);
    expect(resolveDiscountPercent("p2", "c1", product, category, 30)).toBe(10);
    expect(resolveDiscountPercent("p3", "c1", product, category, 30)).toBe(20);
    expect(resolveDiscountPercent("p3", null, product, category, 30)).toBe(30);
  });

  test("creates no promotional price for zero percent", () => {
    expect(salePriceFromDiscount(10_000, 0)).toBeNull();
    expect(salePriceFromDiscount(10_000, 20)).toBe(8_000);
  });
});