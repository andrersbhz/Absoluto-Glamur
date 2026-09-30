import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
const dir = mkdtempSync(join(tmpdir(), "order-tests-"));
try {
  for (const file of [
    "order-lifecycle",
    "order-email-templates",
    "order-tracking.server",
    "smtp-email.server",
  ]) {
    const source = readFileSync(`src/lib/${file}.ts`, "utf8");
    const output = ts
      .transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      })
      .outputText.replace('"./order-lifecycle"', '"./order-lifecycle.mjs"');
    writeFileSync(join(dir, `${file}.mjs`), output);
  }
  const load = (file) => import(pathToFileURL(join(dir, `${file}.mjs`)).href);
  const lifecycle = await load("order-lifecycle");
  assert.equal(lifecycle.canTransitionOrder("awaiting_payment", "processing"), false);
  assert.equal(lifecycle.canTransitionOrder("paid", "processing"), true);
  assert.equal(lifecycle.canTransitionOrder("processing", "shipped", ""), false);
  assert.equal(lifecycle.canTransitionOrder("processing", "shipped", "TRACK123"), true);
  assert.equal(lifecycle.canTransitionOrder("processing", "delivered"), false);
  for (const status of ["paid", "processing", "shipped", "delivered"])
    assert.equal(lifecycle.isPaidOrder(status), true);
  assert.equal(lifecycle.safeWhatsApp("javascript:alert(1)"), null);
  assert.equal(lifecycle.safeWhatsApp("https://evil.example/"), null);
  const { buildOrderEmail } = await load("order-email-templates");
  const base = {
    code: "TEST-001",
    name: "Ana <script>",
    totalCents: 19900,
    orderUrl: "https://example.test/checkout/1",
    whatsappUrl: "https://wa.me/5531999999999",
    trackingNumber: "RR123456789CN",
    carrier: "Correios",
  };
  for (const status of [
    "awaiting_payment",
    "validating",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
    "failed",
  ]) {
    const email = buildOrderEmail({ ...base, status });
    assert.ok(email.text.includes("WhatsApp"));
    assert.ok(email.subject.includes("TEST-001"));
    assert.ok(!email.html.includes("<script>"));
    assert.ok(email.html.includes("https://wa.me/5531999999999"));
  }
  const email = buildOrderEmail({ ...base, status: "shipped" });
  assert.equal(email.attachments.length, 1);
  assert.ok(email.attachments[0].content.includes(base.trackingNumber));
  const { buildMime } = await load("smtp-email.server");
  const mime = buildMime(
    {
      host: "localhost",
      port: 465,
      security: "ssl_tls",
      username: "test",
      password: "unused",
      fromEmail: "store@example.test",
    },
    { to: "ana@example.test", ...email },
  );
  assert.ok(mime.includes("multipart/mixed"));
  assert.ok(mime.includes("multipart/alternative"));
  assert.ok(mime.includes('filename="rastreio-TEST-001.txt"'));
  assert.ok(
    mime.includes(Buffer.from(email.attachments[0].content).toString("base64").slice(0, 60)),
  );
  const tracking = await load("order-tracking.server");
  const raw = JSON.stringify({ event: "TRACKING_UPDATED", data: { number: "RR123456789CN" } });
  const sign = createHash("sha256").update(`${raw}/key`).digest("hex");
  assert.equal(tracking.verifyTrackingSignature(raw, "key", sign), true);
  assert.equal(tracking.verifyTrackingSignature(raw + " ", "key", sign), false);
  assert.equal(tracking.verifyTrackingSignature(raw, "key", "malformed"), false);
  assert.equal(
    tracking.normalizeTrackingUpdate({
      number: "RR123456789CN",
      track_info: {
        latest_status: { status: "InTransit" },
        time_metrics: { estimated_delivery_date: { to: "2026-01-01" } },
      },
    }).status,
    "InTransit",
  );
  assert.equal(
    tracking.normalizeTrackingUpdate({
      number: "RR123456789CN",
      track_info: { latest_status: { status: "Delivered" } },
    }).status,
    "Delivered",
  );
  assert.equal(
    tracking.normalizeTrackingUpdate({
      number: "RR123456789CN",
      track_info: { latest_status: { status: "Unknown" } },
    }),
    null,
  );
  console.log(
    "Order lifecycle, 9 email templates, HTML escaping, WhatsApp links, tracking attachment and webhook signature: passed",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
