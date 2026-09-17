import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { listSiteSettings, upsertSiteSetting } from "@/lib/site-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-destructive">Erro: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Página não encontrada.</div>,
});

function SettingsPage() {
  const list = useServerFn(listSiteSettings);
  const save = useServerFn(upsertSiteSetting);
  const qc = useQueryClient();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => list(),
  });

  const mutation = useMutation({
    mutationFn: (input: { key: string; value: Record<string, unknown> }) =>
      save({ data: input as never }),
    onSuccess: () => {
      toast.success("Preferência salva no banco");
      qc.invalidateQueries({ queryKey: ["site-settings"] });
      router.invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byKey = (k: string) =>
    (data?.find((r) => r.key === k)?.value as Record<string, unknown>) ?? {};

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-primary">Preferências globais</h1>
        <p className="text-sm text-muted-foreground">
          Todas as configurações abaixo são persistidas no banco de dados (tabela{" "}
          <code>site_settings</code>) e aplicam-se ao site inteiro.
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : (
        <div className="grid gap-6">
          <IdentityCard
            value={byKey("site_identity")}
            onSave={(v) => mutation.mutate({ key: "site_identity", value: v })}
            saving={mutation.isPending}
          />
          <SocialCard
            value={byKey("social_links")}
            onSave={(v) => mutation.mutate({ key: "social_links", value: v })}
            saving={mutation.isPending}
          />
          <OrgCard
            value={byKey("organization_jsonld")}
            onSave={(v) => mutation.mutate({ key: "organization_jsonld", value: v })}
            saving={mutation.isPending}
          />
          <ImportDefaultsCard
            value={byKey("import_defaults")}
            onSave={(v) => mutation.mutate({ key: "import_defaults", value: v })}
            saving={mutation.isPending}
          />
          <TrackingHeadCard
            value={byKey("tracking_head")}
            onSave={(v) => mutation.mutate({ key: "tracking_head", value: v })}
            saving={mutation.isPending}
          />
        </div>
      )}
    </AdminLayout>
  );
}

type CardProps = {
  value: Record<string, unknown>;
  onSave: (v: Record<string, unknown>) => void;
  saving: boolean;
};

function useForm<T extends Record<string, unknown>>(initial: T) {
  const [state, setState] = useState<T>(initial);
  useEffect(() => setState(initial), [JSON.stringify(initial)]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, setState] as const;
}

function IdentityCard({ value, onSave, saving }: CardProps) {
  const [f, setF] = useForm({
    name: (value.name as string) ?? "",
    tagline: (value.tagline as string) ?? "",
    default_title: (value.default_title as string) ?? "",
    default_description: (value.default_description as string) ?? "",
    default_keywords: (value.default_keywords as string) ?? "",
    og_image: (value.og_image as string) ?? "",
  });
  return (
    <Card>
      <CardHeader><CardTitle>Identidade & SEO padrão</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <Field label="Nome do site"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Tagline"><Input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></Field>
        <Field label="Título padrão (SEO)"><Input value={f.default_title} onChange={(e) => setF({ ...f, default_title: e.target.value })} /></Field>
        <Field label="Imagem social (og:image URL)"><Input value={f.og_image} onChange={(e) => setF({ ...f, og_image: e.target.value })} /></Field>
        <Field label="Descrição padrão" className="md:col-span-2">
          <Textarea rows={2} value={f.default_description} onChange={(e) => setF({ ...f, default_description: e.target.value })} />
        </Field>
        <Field label="Palavras-chave (separadas por vírgula)" className="md:col-span-2">
          <Input value={f.default_keywords} onChange={(e) => setF({ ...f, default_keywords: e.target.value })} />
        </Field>
        <div className="md:col-span-2">
          <Button onClick={() => onSave(f)} disabled={saving}>Salvar identidade</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SocialCard({ value, onSave, saving }: CardProps) {
  const [f, setF] = useForm({
    instagram: (value.instagram as string) ?? "",
    facebook: (value.facebook as string) ?? "",
    tiktok: (value.tiktok as string) ?? "",
    youtube: (value.youtube as string) ?? "",
    whatsapp: (value.whatsapp as string) ?? "",
  });
  return (
    <Card>
      <CardHeader><CardTitle>Redes sociais</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {(["instagram", "facebook", "tiktok", "youtube", "whatsapp"] as const).map((k) => (
          <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
            <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
        <div className="md:col-span-2">
          <Button onClick={() => onSave(f)} disabled={saving}>Salvar redes</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrgCard({ value, onSave, saving }: CardProps) {
  const [f, setF] = useForm({
    legal_name: (value.legal_name as string) ?? "",
    cnpj: (value.cnpj as string) ?? "",
    email: (value.email as string) ?? "",
    phone: (value.phone as string) ?? "",
    address: (value.address as string) ?? "",
  });
  return (
    <Card>
      <CardHeader><CardTitle>Dados da organização (JSON-LD)</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <Field label="Razão social"><Input value={f.legal_name} onChange={(e) => setF({ ...f, legal_name: e.target.value })} /></Field>
        <Field label="CNPJ"><Input value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} /></Field>
        <Field label="E-mail de contato"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Telefone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Endereço" className="md:col-span-2"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <div className="md:col-span-2">
          <Button onClick={() => onSave(f)} disabled={saving}>Salvar organização</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ImportDefaultsCard({ value, onSave, saving }: CardProps) {
  const [f, setF] = useForm({
    markup_pct: Number(value.markup_pct ?? 100),
    fixed_fee_cents: Number(value.fixed_fee_cents ?? 0),
    rounding: (value.rounding as string) ?? "psychological_99",
  });
  return (
    <Card>
      <CardHeader><CardTitle>Defaults do importador AliExpress</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <Field label="Markup (%)"><Input type="number" value={f.markup_pct} onChange={(e) => setF({ ...f, markup_pct: Number(e.target.value) })} /></Field>
        <Field label="Taxa fixa (centavos)"><Input type="number" value={f.fixed_fee_cents} onChange={(e) => setF({ ...f, fixed_fee_cents: Number(e.target.value) })} /></Field>
        <Field label="Arredondamento">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={f.rounding}
            onChange={(e) => setF({ ...f, rounding: e.target.value })}
          >
            <option value="none">Nenhum</option>
            <option value="psychological_99">Psicológico ,99</option>
            <option value="psychological_90">Psicológico ,90</option>
            <option value="nearest_1">Inteiro mais próximo</option>
            <option value="nearest_5">Múltiplo de 5</option>
          </select>
        </Field>
        <div className="md:col-span-3">
          <Button onClick={() => onSave(f)} disabled={saving}>Salvar defaults</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TrackingHeadCard({ value, onSave, saving }: CardProps) {
  const [f, setF] = useForm({
    enabled: value.enabled !== false,
    meta_pixel_id: (value.meta_pixel_id as string) ?? "",
    ga4_id: (value.ga4_id as string) ?? "",
    gtm_id: (value.gtm_id as string) ?? "",
    tiktok_pixel_id: (value.tiktok_pixel_id as string) ?? "",
    head_html: (value.head_html as string) ?? "",
    body_html: (value.body_html as string) ?? "",
  });
  return (
    <Card>
      <CardHeader><CardTitle>Pixels & códigos de rastreamento (head)</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <Field label="Meta Pixel ID"><Input placeholder="123456789012345" value={f.meta_pixel_id} onChange={(e) => setF({ ...f, meta_pixel_id: e.target.value })} /></Field>
        <Field label="Google Analytics 4 (G-XXXX)"><Input placeholder="G-XXXXXXX" value={f.ga4_id} onChange={(e) => setF({ ...f, ga4_id: e.target.value })} /></Field>
        <Field label="Google Tag Manager (GTM-XXXX)"><Input placeholder="GTM-XXXXXXX" value={f.gtm_id} onChange={(e) => setF({ ...f, gtm_id: e.target.value })} /></Field>
        <Field label="TikTok Pixel ID"><Input placeholder="CXXXXXXXXXXXXXXXXXXX" value={f.tiktok_pixel_id} onChange={(e) => setF({ ...f, tiktok_pixel_id: e.target.value })} /></Field>
        <Field label="Código extra no <head> (HTML/scripts)" className="md:col-span-2">
          <Textarea rows={6} className="font-mono text-xs" placeholder="<script>...</script>" value={f.head_html} onChange={(e) => setF({ ...f, head_html: e.target.value })} />
        </Field>
        <Field label="Código extra no final do <body>" className="md:col-span-2">
          <Textarea rows={4} className="font-mono text-xs" placeholder="<script>...</script>" value={f.body_html} onChange={(e) => setF({ ...f, body_html: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
          Ativar rastreamento no site público
        </label>
        <p className="text-xs text-muted-foreground md:col-span-2">
          Os códigos são aplicados em todas as páginas da loja. Cole apenas scripts de fontes confiáveis.
        </p>
        <div className="md:col-span-2">
          <Button onClick={() => onSave(f)} disabled={saving}>Salvar rastreamento</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
