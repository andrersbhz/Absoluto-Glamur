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

  test("finds all SKUs in deeply nested alternate wrappers and removes duplicates", () => {
    const parsed = parseSkus({
      result: {
        payload: {
          sku_info_list: {
            values: [
              { sku_id: "a", sku_attr: "14:1", sku_price: "10", inventory: 4 },
              { sku_id: "b", sku_attr: "14:2", sku_price: "12", stock: 6 },
              { sku_id: "a", sku_attr: "14:1", sku_price: "10", inventory: 4 },
            ],
          },
        },
      },
    });
    expect(parsed.map((sku) => sku.external_sku_id)).toEqual(["a", "b"]);
    expect(parsed.map((sku) => sku.stock)).toEqual([4, 6]);
  });

  test("uses sku_attr as stable identity when sku_id is absent", () => {
    const parsed = parseSkus({ result: { skus: [{ sku_attr: "14:193;5:1", sku_price: 9, stock: 2 }] } });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.external_sku_id).toBe("14:193;5:1");
  });
});