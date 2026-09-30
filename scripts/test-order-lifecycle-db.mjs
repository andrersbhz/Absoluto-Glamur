const { PGlite } = await import(process.env.PGLITE_MODULE_URL || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid';CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS 'select true';
CREATE TYPE order_status AS ENUM ('pending','awaiting_payment','paid','processing','shipped','delivered','cancelled','refunded','failed');
CREATE TYPE payment_status AS ENUM ('pending','confirmed','received','overdue','refunded','cancelled','failed');
CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,status order_status,code text,customer_name text,customer_email text,total_cents int,paid_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE payments(id uuid DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders,status payment_status,paid_at timestamptz);`);
await db.exec(
  readFileSync("supabase/migrations/20260929233407_order_lifecycle_notifications.sql", "utf8"),
);
const {
  rows: [o],
} = await db.query(
  `INSERT INTO orders(status,code,customer_name,customer_email,total_cents) VALUES('awaiting_payment','TEST-001','Ana','ana@example.test',19900) RETURNING id`,
);
const count = async () => +(await db.query("select count(*) n from order_email_outbox")).rows[0].n;
assert.equal(await count(), 0, "Do not email a payment that was not created");
await db.query(`INSERT INTO payments(order_id,status) VALUES($1,'pending')`, [o.id]);
assert.equal(await count(), 1);
await db.query(`UPDATE orders SET payment_review_at=now() WHERE id=$1`, [o.id]);
assert.equal(await count(), 2);
await db.query(`UPDATE payments SET status='confirmed' WHERE order_id=$1`, [o.id]);
assert.equal(
  (await db.query(`SELECT status FROM orders WHERE id=$1`, [o.id])).rows[0].status,
  "paid",
);
assert.equal(await count(), 3);
await db.query(`UPDATE orders SET status='paid' WHERE id=$1`, [o.id]);
assert.equal(await count(), 3, "duplicate paid callback does not email again");
await db.query(`UPDATE orders SET status='processing' WHERE id=$1`, [o.id]);
await db.query(`UPDATE orders SET status='paid',paid_at=null WHERE id=$1`, [o.id]);
const progress = (await db.query(`SELECT status,paid_at FROM orders WHERE id=$1`, [o.id])).rows[0];
assert.equal(progress.status, "processing");
assert.ok(progress.paid_at);
await assert.rejects(
  db.query(`UPDATE orders SET status='shipped' WHERE id=$1`, [o.id]),
  /rastreio/,
);
await db.query(`UPDATE orders SET status='shipped',tracking_number='TEST12345' WHERE id=$1`, [
  o.id,
]);
await db.query(`UPDATE orders SET status='delivered' WHERE id=$1`, [o.id]);
await db.query(`UPDATE orders SET status='processing' WHERE id=$1`, [o.id]);
assert.equal(
  (await db.query("select status from orders where id=$1", [o.id])).rows[0].status,
  "delivered",
);
assert.equal(await count(), 6);
const claim = await db.query("select * from claim_order_emails(10)");
assert.equal(claim.rows.length, 1);
assert.ok(claim.rows.every((r) => r.lock_token));
assert.equal(
  (await db.query("select * from claim_order_emails(10)")).rows.length,
  0,
  "two workers cannot claim the same emails",
);
console.log(
  "SQL lifecycle: payment creation, validation, confirmation, separation, tracking requirement, delivery, delayed callbacks and queue locking passed",
);
await db.close();
