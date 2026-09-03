import { describe, expect, test } from "bun:test";
import { parseSkus } from "../src/lib/aliexpress-variants.server";

describe("AliExpress SKU parser", () => {
  test("imports every SKU and its supplier cost", () => {
    const parsed = parseSkus({
      aliexpress_ds_product_get_response: { result: { ae_item_sku_info_dtos: {
        ae_item_sku_info_d_t_o: [
          { sku_id: "red", sku_code: "RED", offer_sale_price: "12.50", sku_available_stock: 3 },
          { sku_id: "blue", sku_code: "BLUE", offer_sale_price: "15.00", sku_available_stock: 7 },
        ],
      } } },
    });
    expect(parsed).toHaveLength(2);
    expect(parsed.map((sku) => sku.cost)).toEqual([12.5, 15]);
    expect(parsed.map((sku) => sku.stock)).toEqual([3, 7]);
  });

  test("accepts alternate nested SKU list wrappers", () => {
    const parsed = parseSkus({ result: { ae_item_sku_info_list: { values: [{ id: 42, price: 8 }] } } });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.external_sku_id).toBe("42");
  });
});