from pathlib import Path

ROOT = Path('.')


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new)

# 1) Catálogo autenticado: RLS já permite admin/catalog; service-role não é necessário.
p = ROOT / 'src/lib/admin-catalog.functions.ts'
s = p.read_text()
s = s.replace('const { supabaseAdmin } = await import("@/integrations/supabase/client.server");', 'const db = context.supabase;')
s = s.replace('supabaseAdmin', 'db')
p.write_text(s)

# 2) AliExpress OAuth iniciado pelo admin usa a sessão autenticada.
p = ROOT / 'src/lib/aliexpress-oauth.functions.ts'
s = p.read_text()
s = replace_required(s,
    '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n    const { data: integration } = await supabaseAdmin',
    '    const db = context.supabase;\n    const { data: integration } = await db',
    'aliexpress oauth db')
p.write_text(s)

# 3) Roteamento: leitura pública usa cliente publishable/RLS; administração usa sessão admin.
p = ROOT / 'src/lib/payment-routing.functions.ts'
s = p.read_text()
s = replace_required(s,
    'import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";\n',
    'import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";\nimport { supabase } from "@/integrations/supabase/client";\n',
    'routing public client import')
s = replace_required(s,
    '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n    const { data, error } = await supabaseAdmin',
    '    const { data, error } = await supabase',
    'routing public list')
s = s.replace('    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n    const { data, error } = await supabaseAdmin',
              '    const db = context.supabase;\n    const { data, error } = await db')
s = s.replace('    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n\n    let provider = data.provider;',
              '    const db = context.supabase;\n\n    let provider = data.provider;')
s = s.replace('supabaseAdmin', 'db')
p.write_text(s)

# 4) Variações AliExpress acionadas pelo catálogo usam sessão autenticada e passam o client à API.
p = ROOT / 'src/lib/aliexpress-variants.functions.ts'
s = p.read_text()
s = s.replace('    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n    const { syncVariantsForProduct }',
              '    const db = context.supabase;\n    const { syncVariantsForProduct }')
s = s.replace('supabaseAdmin', 'db')
p.write_text(s)

p = ROOT / 'src/lib/aliexpress-variants.server.ts'
s = p.read_text()
s = replace_required(s,
    '  const json = await callAli("aliexpress.ds.product.get", {\n    product_id: sourceId,\n    ship_to_country: "BR",\n    target_currency: "BRL",\n    target_language: "PT",\n  });',
    '  const json = await callAli("aliexpress.ds.product.get", {\n    product_id: sourceId,\n    ship_to_country: "BR",\n    target_currency: "BRL",\n    target_language: "PT",\n  }, admin);',
    'variants callAli authenticated client')
p.write_text(s)

# 5) Estoque: fluxo admin usa sessão; runBulkSync continua aceitando service-role para cron quando não recebe client.
p = ROOT / 'src/lib/aliexpress-stock.functions.ts'
s = p.read_text()
s = replace_required(s,
    'async function fetchAliexpressLive(productId: string): Promise<{',
    'async function fetchAliexpressLive(productId: string, credentialClient?: any): Promise<{',
    'stock fetch signature')
s = replace_required(s,
    '  const json = await callAli("aliexpress.ds.product.get", {\n    product_id: productId,\n    ship_to_country: "BR",\n    target_currency: "BRL",\n    target_language: "PT",\n  });',
    '  const json = await callAli("aliexpress.ds.product.get", {\n    product_id: productId,\n    ship_to_country: "BR",\n    target_currency: "BRL",\n    target_language: "PT",\n  }, credentialClient);',
    'stock callAli client')
s = replace_required(s,
    '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n\n    const { data: imp } = await supabaseAdmin',
    '    const db = context.supabase;\n\n    const { data: imp } = await db',
    'stock one db')
# Replace only in the single handler before bulk section.
head, tail = s.split('/**\n * Sincroniza o estoque de TODOS os produtos', 1)
head = head.replace('supabaseAdmin', 'db').replace('fetchAliexpressLive(imp.source_id)', 'fetchAliexpressLive(imp.source_id, db)')
s = head + '/**\n * Sincroniza o estoque de TODOS os produtos' + tail
s = replace_required(s,
    '    await assertCatalog(context);\n    return await runBulkSync(data.limit);',
    '    await assertCatalog(context);\n    return await runBulkSync(data.limit, context.supabase);',
    'stock bulk authenticated client')
s = replace_required(s,
    'export async function runBulkSync(limit: number) {\n  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n  const { data: imports } = await supabaseAdmin',
    'export async function runBulkSync(limit: number, client?: any) {\n  let db = client;\n  if (!db) {\n    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n    db = supabaseAdmin;\n  }\n  const { data: imports } = await db',
    'stock bulk db fallback')
# In runBulkSync only, replace remaining DB operations and pass DB to Ali API.
marker = 'export async function runBulkSync'
pos = s.index(marker)
prefix, bulk = s[:pos], s[pos:]
bulk = bulk.replace('supabaseAdmin', 'db').replace('fetchAliexpressLive(row.source_id!)', 'fetchAliexpressLive(row.source_id!, db)')
s = prefix + bulk
p.write_text(s)

# 6) Avaliações: operações administrativas usam RLS; auto-sync público permanece isolado.
p = ROOT / 'src/lib/product-reviews.functions.ts'
s = p.read_text()
public_marker = 'export const autoSyncProductReviews'
pos = s.index(public_marker)
admin_part, public_part = s[:pos], s[pos:]
admin_part = admin_part.replace('const { supabaseAdmin } = await import("@/integrations/supabase/client.server");', 'const db = context.supabase;')
admin_part = admin_part.replace('supabaseAdmin', 'db')
s = admin_part + public_part
p.write_text(s)

# 7) UI de integrações: catálogo fallback + revelar segredo explicitamente via olho.
p = ROOT / 'src/routes/_authenticated/admin.integrations.tsx'
s = p.read_text()
s = replace_required(s,
    'import { Copy, ExternalLink, Plug, PlugZap, RefreshCw, Route as RouteIcon, Save, TestTube } from "lucide-react";',
    'import { Copy, ExternalLink, Eye, EyeOff, Plug, PlugZap, RefreshCw, Route as RouteIcon, Save, TestTube } from "lucide-react";',
    'eye imports')
s = replace_required(s,
    '  listIntegrations,\n  saveIntegration,\n  testIntegration,',
    '  INTEGRATION_CATALOG,\n  getIntegrationSecrets,\n  listIntegrations,\n  saveIntegration,\n  testIntegration,',
    'integration imports')
s = replace_required(s,
    '  const grouped = (q.data ?? []).reduce<Record<string, Integration[]>>((acc, it) => {',
    '''  const fallbackRows: Integration[] = INTEGRATION_CATALOG.map((it) => ({
    ...it,
    enabled: false,
    mode: it.default_mode ?? "sandbox",
    config: {},
    last_verified_at: null,
    last_status: null,
    last_error: null,
    updated_at: new Date(0).toISOString(),
    api_key_masked: null,
    webhook_token_masked: null,
    merchant_key_masked: null,
    has_api_key: false,
    has_webhook_token: false,
    has_merchant_key: false,
    reauth_required: false,
  }));
  const grouped = (q.data ?? fallbackRows).reduce<Record<string, Integration[]>>((acc, it) => {''',
    'integration fallback rows')
s = replace_required(s,
    '  const save = useServerFn(saveIntegration);\n  const test = useServerFn(testIntegration);',
    '  const save = useServerFn(saveIntegration);\n  const reveal = useServerFn(getIntegrationSecrets);\n  const test = useServerFn(testIntegration);',
    'reveal server fn')
s = replace_required(s,
    '  const [merchantKey, setMerchantKey] = useState("");\n  const [mode, setMode] = useState(integration.mode);',
    '''  const [merchantKey, setMerchantKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [showMerchantKey, setShowMerchantKey] = useState(false);
  const [mode, setMode] = useState(integration.mode);''',
    'secret visibility state')
s = replace_required(s,
    '  const saveMut = useMutation({',
    '''  const revealMut = useMutation({
    mutationFn: () => reveal({ data: { provider: integration.provider } }),
    onSuccess: (secrets) => {
      if (!apiKey) setApiKey(secrets.api_key ?? "");
      if (!webhookToken) setWebhookToken(secrets.webhook_token ?? "");
      if (!merchantKey) setMerchantKey(secrets.merchant_key ?? "");
    },
    onError: (e: Error) => toast.error(`Não foi possível revelar a credencial: ${e.message}`),
  });

  async function toggleSecret(field: "api" | "webhook" | "merchant") {
    const showing = field === "api" ? showApiKey : field === "webhook" ? showWebhookToken : showMerchantKey;
    if (showing) {
      if (field === "api") setShowApiKey(false);
      if (field === "webhook") setShowWebhookToken(false);
      if (field === "merchant") setShowMerchantKey(false);
      return;
    }
    const hasSaved = field === "api" ? integration.has_api_key : field === "webhook" ? integration.has_webhook_token : integration.has_merchant_key;
    const localValue = field === "api" ? apiKey : field === "webhook" ? webhookToken : merchantKey;
    if (hasSaved && !localValue) await revealMut.mutateAsync();
    if (field === "api") setShowApiKey(true);
    if (field === "webhook") setShowWebhookToken(true);
    if (field === "merchant") setShowMerchantKey(true);
  }

  const saveMut = useMutation({''',
    'reveal mutation')
s = replace_required(s,
    '  const currentMerchantKey =\n    (integration.config as { merchant_key?: string } | null)?.merchant_key ?? "";',
    '  const currentMerchantKey = integration.has_merchant_key;',
    'merchant current mask')

old_api = '''            <input
              type={isGtm ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}'''
new_api = '''            <div className="relative">
              <input
              type={isGtm || showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}'''
s = replace_required(s, old_api, new_api, 'api input wrapper start')
s = replace_required(s,
    '              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"\n            />\n            {isGtm && (',
    '''              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 font-mono text-sm"
              />
              {!isGtm && (
                <button type="button" onClick={() => void toggleSecret("api")} disabled={revealMut.isPending} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={showApiKey ? "Ocultar chave" : "Mostrar chave"}>
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
            {isGtm && (''',
    'api wrapper end')

s = replace_required(s,
    '''              <input
                type="password"
                value={merchantKey}
                onChange={(e) => setMerchantKey(e.target.value)}
                placeholder="chave pública do merchant NuPay"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />''',
    '''              <div className="relative">
                <input
                  type={showMerchantKey ? "text" : "password"}
                  value={merchantKey}
                  onChange={(e) => setMerchantKey(e.target.value)}
                  placeholder="Merchant Key do NuPay"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 font-mono text-sm"
                />
                <button type="button" onClick={() => void toggleSecret("merchant")} disabled={revealMut.isPending} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={showMerchantKey ? "Ocultar Merchant Key" : "Mostrar Merchant Key"}>
                  {showMerchantKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>''',
    'merchant eye')

s = replace_required(s,
    '''              <input
                type="password"
                value={webhookToken}
                onChange={(e) => setWebhookToken(e.target.value)}''',
    '''              <div className="relative">
                <input
                type={showWebhookToken ? "text" : "password"}
                value={webhookToken}
                onChange={(e) => setWebhookToken(e.target.value)}''',
    'webhook wrapper start')
s = replace_required(s,
    '''                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">''',
    '''                className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 font-mono text-sm"
                />
                <button type="button" onClick={() => void toggleSecret("webhook")} disabled={revealMut.isPending} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={showWebhookToken ? "Ocultar token" : "Mostrar token"}>
                  {showWebhookToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <span className="mt-1 block text-[11px] text-muted-foreground">''',
    'webhook wrapper end')
p.write_text(s)

# 8) Banco: integrações admin via RLS + roteamento público seguro/admin update.
migration = ROOT / 'supabase/migrations/20260817070500_admin_stability_integrations_rls.sql'
migration.write_text('''-- Admin stability: remove unnecessary service-role dependency from authenticated UI flows.\n\nGRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;\nDROP POLICY IF EXISTS "admins manage integrations" ON public.integrations;\nCREATE POLICY "admins manage integrations"\n  ON public.integrations FOR ALL TO authenticated\n  USING (public.is_admin(auth.uid()))\n  WITH CHECK (public.is_admin(auth.uid()));\n\n-- Payment routing is non-secret checkout configuration.\nGRANT SELECT ON public.payment_method_routing TO anon, authenticated;\nGRANT UPDATE ON public.payment_method_routing TO authenticated;\nDROP POLICY IF EXISTS "payment routing public read" ON public.payment_method_routing;\nCREATE POLICY "payment routing public read"\n  ON public.payment_method_routing FOR SELECT\n  USING (true);\nDROP POLICY IF EXISTS "payment routing admin update" ON public.payment_method_routing;\nCREATE POLICY "payment routing admin update"\n  ON public.payment_method_routing FOR UPDATE TO authenticated\n  USING (public.is_admin(auth.uid()))\n  WITH CHECK (public.is_admin(auth.uid()));\n''')

# 9) Guardrail CI: these authenticated admin modules may not regress to service-role.
p = ROOT / '.github/workflows/ci.yml'
s = p.read_text()
needle = '      - name: Build (required)\n        run: bun run build\n'
insert = '''      - name: Guard authenticated admin DB access\n        shell: bash\n        run: |\n          set -euo pipefail\n          files=(\n            src/lib/admin-catalog.functions.ts\n            src/lib/integrations.functions.ts\n            src/lib/payment-routing.functions.ts\n            src/lib/aliexpress-oauth.functions.ts\n            src/lib/aliexpress-variants.functions.ts\n          )\n          if grep -nE 'client\\.server|supabaseAdmin' "${files[@]}"; then\n            echo "Authenticated admin module regressed to service-role dependency"\n            exit 1\n          fi\n      - name: Build (required)\n        run: bun run build\n'''
s = replace_required(s, needle, insert, 'ci admin guard')
p.write_text(s)

print('admin stability patch applied')
