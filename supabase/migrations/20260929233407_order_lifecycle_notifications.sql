-- Keep operational status separate from supplier fulfillment and carrier status.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_carrier text,
  ADD COLUMN IF NOT EXISTS tracking_status text,
  ADD COLUMN IF NOT EXISTS tracking_sub_status text,
  ADD COLUMN IF NOT EXISTS tracking_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_number_unique ON public.orders(tracking_number) WHERE tracking_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;
CREATE POLICY "Read own order history" ON public.order_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_admin(auth.uid()))));
CREATE INDEX order_history_order_time ON public.order_status_history(order_id, created_at);

CREATE TABLE IF NOT EXISTS public.order_email_outbox (
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lock_token uuid,
  sent_at timestamptz,
  last_error text,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, event_key)
);
ALTER TABLE public.order_email_outbox ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.order_email_outbox TO service_role;
GRANT SELECT ON public.order_email_outbox TO authenticated;
CREATE POLICY "Admin reads email queue" ON public.order_email_outbox FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX order_outbox_sequence ON public.order_email_outbox(order_id,sequence) WHERE status <> 'sent';
CREATE INDEX order_outbox_due ON public.order_email_outbox(available_at) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.guard_order_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- Duplicate/delayed gateway notifications must never move fulfillment backwards.
  IF OLD.status IN ('paid','processing','shipped','delivered') AND NEW.status IN ('pending','awaiting_payment','paid','failed','cancelled') THEN
    NEW.status := OLD.status;
  END IF;
  IF OLD.status IN ('cancelled','refunded') AND NEW.status <> OLD.status THEN NEW.status := OLD.status; END IF;
  IF OLD.status = 'delivered' AND NEW.status NOT IN ('delivered','refunded') THEN NEW.status := OLD.status; END IF;
  NEW.paid_at := coalesce(OLD.paid_at, NEW.paid_at);
  IF NEW.status = 'paid' THEN NEW.paid_at := coalesce(NEW.paid_at, now()); END IF;
  IF NEW.status = 'processing' AND OLD.status NOT IN ('paid','processing') THEN RAISE EXCEPTION 'Confirme o pagamento antes da separação'; END IF;
  IF NEW.status = 'shipped' AND OLD.status NOT IN ('processing','shipped') THEN RAISE EXCEPTION 'Separe o pedido antes do despacho'; END IF;
  IF NEW.status IN ('shipped','delivered') AND nullif(trim(NEW.tracking_number),'') IS NULL THEN RAISE EXCEPTION 'Informe o código de rastreio'; END IF;
  IF NEW.status = 'delivered' AND OLD.status NOT IN ('shipped','delivered') THEN RAISE EXCEPTION 'Somente um pedido despachado pode ser entregue'; END IF;
  IF NEW.status = 'shipped' THEN NEW.shipped_at := coalesce(OLD.shipped_at, NEW.shipped_at, now()); END IF;
  IF NEW.status = 'delivered' THEN NEW.delivered_at := coalesce(OLD.delivered_at, NEW.delivered_at, now()); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER orders_lifecycle_guard BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_lifecycle();

CREATE OR REPLACE FUNCTION public.record_order_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE stage text; changed boolean;
BEGIN
  changed := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN changed := NEW.status IS DISTINCT FROM OLD.status; END IF;
  stage := NEW.status::text;
  IF TG_OP = 'UPDATE' AND NEW.status = 'awaiting_payment' AND NEW.payment_review_at IS DISTINCT FROM OLD.payment_review_at AND NEW.payment_review_at IS NOT NULL THEN
    stage := 'validating'; changed := true;
  END IF;
  IF changed THEN
    INSERT INTO public.order_status_history(order_id,status) VALUES (NEW.id,stage);
    -- The initial email is queued only once a payment has actually been created.
    IF stage NOT IN ('pending','awaiting_payment') THEN
      INSERT INTO public.order_email_outbox(order_id,event_key,snapshot)
      VALUES(NEW.id,stage,jsonb_build_object('code',NEW.code,'name',NEW.customer_name,'email',NEW.customer_email,'status',stage,'totalCents',NEW.total_cents,'trackingNumber',NEW.tracking_number,'carrier',NEW.tracking_carrier))
      ON CONFLICT(order_id,event_key) DO NOTHING;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.tracking_status IS DISTINCT FROM OLD.tracking_status OR NEW.tracking_sub_status IS DISTINCT FROM OLD.tracking_sub_status) AND NEW.tracking_status IS NOT NULL THEN
    INSERT INTO public.order_status_history(order_id,status,description) VALUES(NEW.id,'tracking',coalesce(NEW.tracking_sub_status,NEW.tracking_status));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER orders_lifecycle_history AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.record_order_lifecycle();

CREATE OR REPLACE FUNCTION public.record_order_payment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
  IF NEW.status IN ('confirmed','received') AND o.status IN ('pending','awaiting_payment','failed') THEN
    UPDATE public.orders SET status='paid',paid_at=coalesce(paid_at,NEW.paid_at,now()) WHERE id=o.id;
  ELSIF TG_OP = 'INSERT' AND o.status IN ('pending','awaiting_payment') THEN
    INSERT INTO public.order_email_outbox(order_id,event_key,snapshot)
    VALUES(o.id,'awaiting_payment',jsonb_build_object('code',o.code,'name',o.customer_name,'email',o.customer_email,'status','awaiting_payment','totalCents',o.total_cents))
    ON CONFLICT(order_id,event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER payments_lifecycle AFTER INSERT OR UPDATE OF status ON public.payments FOR EACH ROW EXECUTE FUNCTION public.record_order_payment();

CREATE OR REPLACE FUNCTION public.claim_order_emails(batch_size integer DEFAULT 10) RETURNS SETOF public.order_email_outbox LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$
  WITH due AS (
    SELECT q.id FROM public.order_email_outbox q
    WHERE ((q.status='pending' AND q.available_at<=now()) OR (q.status='sending' AND q.locked_at<now()-interval '15 minutes'))
      AND NOT EXISTS (SELECT 1 FROM public.order_email_outbox earlier WHERE earlier.order_id=q.order_id AND earlier.sequence<q.sequence AND earlier.status<>'sent')
    ORDER BY q.sequence LIMIT greatest(1,least(batch_size,50)) FOR UPDATE SKIP LOCKED
  )
  UPDATE public.order_email_outbox q SET status='sending',locked_at=now(),lock_token=gen_random_uuid(),attempts=q.attempts+1
  FROM due WHERE q.id=due.id RETURNING q.*;
$$;
REVOKE ALL ON FUNCTION public.claim_order_emails(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_emails(integer) TO service_role;
REVOKE ALL ON FUNCTION public.guard_order_lifecycle(),public.record_order_lifecycle(),public.record_order_payment() FROM PUBLIC,anon,authenticated;
-- Preserve existing orders without emitting retroactive emails.
INSERT INTO public.order_status_history(order_id,status,created_at)
SELECT o.id,o.status::text,o.updated_at FROM public.orders o WHERE NOT EXISTS (SELECT 1 FROM public.order_status_history h WHERE h.order_id=o.id);
