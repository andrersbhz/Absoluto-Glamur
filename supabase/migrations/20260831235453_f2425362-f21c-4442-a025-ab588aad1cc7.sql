ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'paypal';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'ebanx_card';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'ebanx_boleto';