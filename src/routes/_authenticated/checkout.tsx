import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShoppingBag, QrCode, CreditCard, Barcode, Wallet } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cartTotals, useCart } from "@/lib/cart-store";
import { formatBRL } from "@/lib/format";
import { createCheckout, type CheckoutInput } from "@/lib/checkout.functions";
import { listCheckoutMethods, type PaymentMethodKey } from "@/lib/payment-routing.functions";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({ meta: [{ title: "Checkout · Absoluto Glamur" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const { subtotal } = cartTotals(items);

  const [form, setForm] = useState({
    name: "",
    email: user?.email ?? "",
    document: "",
    phone: "",
    zipCode: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    notes: "",
    saveAddress: true,
  });

  // Preload defaults from profile + default address
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: profile }, { data: addr }] = await Promise.all([
        supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
        supabase
          .from("addresses")
          .select("*")
          .eq("user_id", user.id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setForm((f) => ({
        ...f,
        name: f.name || profile?.full_name || "",
        phone: f.phone || profile?.phone || "",
        email: f.email || user.email || "",
        zipCode: f.zipCode || addr?.zip_code || "",
        street: f.street || addr?.street || "",
        number: f.number || addr?.number || "",
        complement: f.complement || addr?.complement || "",
        district: f.district || addr?.district || "",
        city: f.city || addr?.city || "",
        state: f.state || addr?.state || "",
        document: f.document || addr?.document || "",
      }));
    })();
  }, [user]);

  const createFn = useServerFn(createCheckout);
  const methodsFn = useServerFn(listCheckoutMethods);
  const methodsQ = useQuery({ queryKey: ["checkout-methods"], queryFn: () => methodsFn() });
  const methods = methodsQ.data ?? [];
  const [method, setMethod] = useState<PaymentMethodKey>("pix");

  // Seleciona o primeiro método habilitado assim que a lista carrega
  useEffect(() => {
    if (methods.length && !methods.find((m) => m.method === method)) {
      setMethod(methods[0].method);
    }
  }, [methods, method]);

  const mut = useMutation({
    mutationFn: (payload: CheckoutInput) => createFn({ data: payload }),
    onSuccess: (r) => {
      clear();
      // Fluxo redirect (NuPay/Stripe/boleto) → mandar direto para o gateway
      const redirect = (r as { redirectUrl?: string | null }).redirectUrl;
      if (redirect) {
        window.location.href = redirect;
        return;
      }
      navigate({ to: "/checkout/$orderId", params: { orderId: r.orderId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (items.length === 0) {
    return (
      <StoreLayout>
        <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
          <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 font-display text-3xl">Seu carrinho está vazio</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Adicione produtos antes de finalizar a compra.
          </p>
          <Link
            to="/products"
            search={{} as never}
            className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground shadow-soft"
          >
            Ver produtos
          </Link>
        </div>
      </StoreLayout>
    );
  }

  async function handleCepBlur() {
    const cep = form.zipCode.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = (await res.json()) as {
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
        erro?: boolean;
      };
      if (j.erro) return;
      setForm((f) => ({
        ...f,
        street: f.street || j.logradouro || "",
        district: f.district || j.bairro || "",
        city: f.city || j.localidade || "",
        state: f.state || j.uf || "",
      }));
    } catch {
      /* ignore */
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    mut.mutate({
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      customer: {
        name: form.name.trim(),
        email: form.email.trim(),
        document: form.document,
        phone: form.phone,
      },
      address: {
        zipCode: form.zipCode,
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim() || null,
        district: form.district.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
      },
      saveAddress: form.saveAddress,
      notes: form.notes.trim() || null,
      method,
    });
  }

  return (
    <StoreLayout>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl">Finalizar pedido</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o método de pagamento e finalize sem sair da loja.
        </p>

        <form onSubmit={onSubmit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <fieldset className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <legend className="px-2 font-display text-lg">Dados</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome completo" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
                <Field label="E-mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
                <Field label="CPF / CNPJ" value={form.document} onChange={(v) => setForm({ ...form, document: v })} required />
                <Field label="Celular" placeholder="(11) 90000-0000" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required />
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <legend className="px-2 font-display text-lg">Endereço de entrega</legend>
              <div className="grid gap-4 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Field label="CEP" value={form.zipCode} onChange={(v) => setForm({ ...form, zipCode: v })} onBlur={handleCepBlur} required />
                </div>
                <div className="sm:col-span-4">
                  <Field label="Rua" value={form.street} onChange={(v) => setForm({ ...form, street: v })} required />
                </div>
                <div className="sm:col-span-2">
                  <Field label="Número" value={form.number} onChange={(v) => setForm({ ...form, number: v })} required />
                </div>
                <div className="sm:col-span-4">
                  <Field label="Complemento" value={form.complement} onChange={(v) => setForm({ ...form, complement: v })} />
                </div>
                <div className="sm:col-span-3">
                  <Field label="Bairro" value={form.district} onChange={(v) => setForm({ ...form, district: v })} required />
                </div>
                <div className="sm:col-span-2">
                  <Field label="Cidade" value={form.city} onChange={(v) => setForm({ ...form, city: v })} required />
                </div>
                <div className="sm:col-span-1">
                  <Field label="UF" maxLength={2} value={form.state} onChange={(v) => setForm({ ...form, state: v.toUpperCase() })} required />
                </div>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.saveAddress}
                  onChange={(e) => setForm({ ...form, saveAddress: e.target.checked })}
                />
                Salvar este endereço na minha conta
              </label>
            </fieldset>

            <fieldset className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <legend className="px-2 font-display text-lg">Forma de pagamento</legend>
              {methodsQ.isLoading && (
                <p className="text-xs text-muted-foreground">Carregando métodos…</p>
              )}
              {!methodsQ.isLoading && methods.length === 0 && (
                <p className="text-xs text-destructive">
                  Nenhum método de pagamento habilitado. Peça ao administrador para ativar em Admin → Integrações.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {methods.map((m) => {
                  const active = method === m.method;
                  const Icon =
                    m.method === "pix"
                      ? QrCode
                      : m.method === "credit_card"
                        ? CreditCard
                        : m.method === "boleto"
                          ? Barcode
                          : Wallet;
                  return (
                    <button
                      type="button"
                      key={m.method}
                      onClick={() => setMethod(m.method)}
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{m.label}</p>
                        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                          via {m.provider}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <legend className="px-2 font-display text-lg">Observações</legend>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Instruções para o entregador, presente etc. (opcional)"
              />
            </fieldset>
          </div>

          <aside className="h-fit rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-xl">Resumo</h2>
            <ul className="mt-4 max-h-72 space-y-3 overflow-auto pr-1 text-sm">
              {items.map((i) => (
                <li key={i.variantId} className="flex gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-secondary/40">
                    {i.imageUrl ? (
                      <img src={i.imageUrl} alt={i.name} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <p className="line-clamp-2 text-sm">{i.name}</p>
                    {i.variantName && (
                      <p className="text-[11px] text-muted-foreground">{i.variantName}</p>
                    )}
                    <p className="text-xs text-muted-foreground">Qtd: {i.quantity}</p>
                  </div>
                  <p className="text-sm">{formatBRL(i.unitCents * i.quantity)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatBRL(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Frete</dt>
                <dd className="text-success">Grátis</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-display text-lg">
                <dt>Total</dt>
                <dd>{formatBRL(subtotal)}</dd>
              </div>
            </dl>
            <button
              type="submit"
              disabled={mut.isPending}
              className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-soft disabled:opacity-60"
            >
              {mut.isPending
                ? "Processando…"
                : method === "pix"
                  ? "Gerar PIX"
                  : method === "boleto"
                    ? "Gerar boleto"
                    : method === "nubank_redirect"
                      ? "Pagar com Nubank"
                      : "Finalizar pagamento"}
            </button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Você continua no site — QR Code e código copia-e-cola exibidos aqui mesmo.
            </p>
          </aside>
        </form>
      </div>
    </StoreLayout>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlur}
        required={props.required}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
