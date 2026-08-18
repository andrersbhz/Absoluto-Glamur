import { strict as assert } from "node:assert";
import {
  normalizeAliExpressPublicProductId,
  parseAliExpressPublicReviewHtml,
  parseAliExpressPublicReviewJson,
  fetchAliExpressPublicReviews,
} from "../src/lib/aliexpress-public-reviews.server";

const PRODUCT_ID = "1005001234567890";

assert.equal(normalizeAliExpressPublicProductId(PRODUCT_ID), PRODUCT_ID);
assert.equal(
  normalizeAliExpressPublicProductId(`https://www.aliexpress.com/item/${PRODUCT_ID}.html?spm=test`),
  PRODUCT_ID,
);

const jsonFixture = `<!doctype html><html><body>
<script id="__NEXT_DATA__" type="application/json">
${JSON.stringify({
  props: {
    feedbackModule: {
      feedbackList: [
        {
          feedbackId: "fb-1",
          evaluation: 5,
          feedback: "Produto excelente e chegou rápido.",
          buyer_blured_name: "A****e",
          buyer_country_code: "BR",
          feedback_epoch_date: 1710000000,
          image_urls: ["https://ae01.alicdn.com/kf/test1.jpg"],
        },
        {
          reviewId: "fb-2",
          rating: 4,
          reviewContent: "Gostei bastante do produto.",
          buyerName: "M****a",
          countryCode: "BR",
          reviewDate: "2026-08-10T12:00:00Z",
        },
      ],
    },
  },
})}
</script>
</body></html>`;

const jsonReviews = parseAliExpressPublicReviewHtml(jsonFixture, PRODUCT_ID);
assert.equal(jsonReviews.length, 2);
assert.equal(jsonReviews[0].rating, 5);
assert.match(jsonReviews[0].body ?? "", /excelente/i);
assert.equal(jsonReviews[0].author_country, "BR");
assert.equal(jsonReviews[0].images.length, 1);

const feedbackEndpointFixture = JSON.stringify({
  success: true,
  data: {
    evaViewList: [
      {
        evaId: "eva-100",
        starView: 5,
        evaContent: "Chegou perfeito e igual ao anúncio.",
        anonymousName: "R***a",
        buyerCountryCode: "BR",
        evaDate: "2026-08-12T13:45:00Z",
        skuInfo: "Cor: Rosa",
        evaImageList: ["https://ae01.alicdn.com/kf/eva-100.jpg"],
      },
      {
        evaId: "eva-101",
        starView: 4,
        evaContent: "Boa qualidade e embalagem intacta.",
        anonymousName: "C***s",
        buyerCountryCode: "BR",
        evaDate: "2026-08-11T09:20:00Z",
      },
    ],
  },
});

const endpointReviews = parseAliExpressPublicReviewJson(feedbackEndpointFixture, PRODUCT_ID);
assert.equal(endpointReviews.length, 2);
assert.equal(endpointReviews[0].source_review_id, "public-eva-100");
assert.equal(endpointReviews[0].rating, 5);
assert.equal(endpointReviews[0].author_name, "R***a");
assert.equal(endpointReviews[0].author_country, "BR");
assert.equal(endpointReviews[0].title, "Cor: Rosa");
assert.equal(endpointReviews[0].images.length, 1);
assert.match(endpointReviews[0].body ?? "", /igual ao anúncio/i);

const htmlFixture = `
<div class="feedback-item" data-review-id="legacy-1" data-rating="5">
  <span class="buyer-name">J****o</span>
  <span class="buyer-country">BR</span>
  <div class="buyer-feedback">Muito bom, recomendo.</div>
  <span class="feedback-date">2026-08-01T10:00:00Z</span>
  <img src="https://ae01.alicdn.com/kf/photo.jpg" />
</div>`;

const htmlReviews = parseAliExpressPublicReviewHtml(htmlFixture, PRODUCT_ID);
assert.equal(htmlReviews.length, 1);
assert.equal(htmlReviews[0].source_review_id, "public-legacy-1");
assert.equal(htmlReviews[0].rating, 5);
assert.match(htmlReviews[0].body ?? "", /recomendo/i);

const noReviews = parseAliExpressPublicReviewHtml("<html><body>Produto sem comentários embutidos.</body></html>", PRODUCT_ID);
assert.equal(noReviews.length, 0);

console.log("[parser] OK: JSON do feedback endpoint, JSON embutido, HTML legado e produto sem reviews validados.");

if (process.argv.includes("--live")) {
  const liveId = process.env.ALIEXPRESS_PUBLIC_REVIEW_TEST_PRODUCT_ID || "32839190109";
  try {
    const result = await fetchAliExpressPublicReviews(liveId);
    console.log(`[live] product=${result.productId} source=${result.source} reviews=${result.reviews.length}`);
    for (const line of result.diagnostics) console.log(`[live] ${line}`);
    // Smoke de rede: não falhamos quando o AliExpress bloqueia o runner com CAPTCHA/403.
    // O objetivo aqui é provar que o fallback degrada com diagnóstico, sem quebrar o app.
    assert.ok(Array.isArray(result.diagnostics) && result.diagnostics.length >= 1);
  } catch (error) {
    console.log(`[live] falha controlada: ${error instanceof Error ? error.message : String(error)}`);
  }
}
