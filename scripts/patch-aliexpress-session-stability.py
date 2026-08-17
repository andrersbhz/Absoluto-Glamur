from pathlib import Path

# -------------------- Importer --------------------
path = Path('src/lib/aliexpress-import.functions.ts')
text = path.read_text(encoding='utf-8')

text = text.replace(
    'async function translateToPtBr(input: { title: string; description: string | null }): Promise<{',
    'async function translateToPtBr(input: { title: string; description: string | null }, db?: any): Promise<{',
)
text = text.replace(
    '      `Traduza para pt-BR o conteúdo abaixo. Reescreva de forma natural, sem estrangeirismos desnecessários.\\n\\n${payload}`,\n    );',
    '      `Traduza para pt-BR o conteúdo abaixo. Reescreva de forma natural, sem estrangeirismos desnecessários.\\n\\n${payload}`,\n      db,\n    );',
    1,
)
# URL preview already has request client available without a local db variable.
text = text.replace(
    'const translated = await translateToPtBr({ title: raw.title, description: raw.description });',
    'const translated = await translateToPtBr({ title: raw.title, description: raw.description }, context.supabase);',
)
# saveImportDraft has a local db.
text = text.replace(
    '      description: data.normalized.description ?? null,\n    });',
    '      description: data.normalized.description ?? null,\n    }, db);',
    1,
)

# Every remaining service-role import in this authenticated module is an admin/catalog
# request and can use the request-scoped Supabase client. Helper functions already
# accept generic clients.
text = text.replace(
    '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");',
    '    const db = context.supabase;',
)
text = text.replace('supabaseAdmin', 'db')

# Bulk JSON translation now uses the local request client.
bulk_old = '''      const translated = await translateToPtBr({
        title: n.title,
        description: n.description ?? null,
      });'''
bulk_new = '''      const translated = await translateToPtBr({
        title: n.title,
        description: n.description ?? null,
      }, db);'''
text = text.replace(bulk_old, bulk_new)

if 'supabaseAdmin' in text or '@/integrations/supabase/client.server' in text:
    raise SystemExit('Importer still contains privileged Supabase references')
path.write_text(text, encoding='utf-8')

# -------------------- Stock sync --------------------
path = Path('src/lib/aliexpress-stock.functions.ts')
text = path.read_text(encoding='utf-8')
text = text.replace(
    'async function fetchAliexpressLive(productId: string): Promise<{',
    'async function fetchAliexpressLive(productId: string, credentialClient?: any): Promise<{',
)
text = text.replace(
    '    target_language: "PT",\n  });',
    '    target_language: "PT",\n  }, credentialClient);',
    1,
)
text = text.replace(
    'async function fetchAliexpressStock(productId: string) {\n  const r = await fetchAliexpressLive(productId);',
    'async function fetchAliexpressStock(productId: string, credentialClient?: any) {\n  const r = await fetchAliexpressLive(productId, credentialClient);',
)
text = text.replace(
    '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");',
    '    const db = context.supabase;',
    1,
)
# Only the single-product authenticated handler is before runBulkSync.
prefix, marker, suffix = text.partition('export const syncAllAliexpressStock')
if not marker:
    raise SystemExit('syncAllAliexpressStock marker missing')
prefix = prefix.replace('supabaseAdmin', 'db')
prefix = prefix.replace('fetchAliexpressLive(imp.source_id)', 'fetchAliexpressLive(imp.source_id, db)')
text = prefix + marker + suffix
text = text.replace(
    '    return await runBulkSync(data.limit);',
    '    return await runBulkSync(data.limit, context.supabase);',
)
old_bulk = '''export async function runBulkSync(limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: imports } = await supabaseAdmin'''
new_bulk = '''export async function runBulkSync(limit: number, credentialClient?: any) {
  let db = credentialClient;
  if (!db) {
    const { getSupabaseAdminOrNull } = await import("@/integrations/supabase/client.server");
    db = getSupabaseAdminOrNull();
  }
  if (!db) {
    throw new Error("Sincronização automática de estoque requer uma credencial de servidor; use o botão autenticado do Catálogo ou configure SUPABASE_SECRET_KEY no backend.");
  }
  const { data: imports } = await db'''
if old_bulk not in text:
    raise SystemExit('runBulkSync service-role block not found')
text = text.replace(old_bulk, new_bulk)
# Replace privileged variable only in bulk part after the new declaration.
bulk_pos = text.index('export async function runBulkSync')
head, tail = text[:bulk_pos], text[bulk_pos:]
tail = tail.replace('supabaseAdmin', 'db')
tail = tail.replace('fetchAliexpressLive(row.source_id!)', 'fetchAliexpressLive(row.source_id!, db)')
text = head + tail
if 'const { supabaseAdmin }' in text:
    raise SystemExit('Stock sync still directly imports supabaseAdmin')
path.write_text(text, encoding='utf-8')

# -------------------- Live reviews --------------------
path = Path('src/lib/product-reviews-live.functions.ts')
text = path.read_text(encoding='utf-8')
text = text.replace(
    'async function translateBatch(\n  rows: Array<{ title: string | null; body: string | null }>,\n): Promise<Array<{ title: string | null; body: string | null; translated: boolean }>> {',
    'async function translateBatch(\n  rows: Array<{ title: string | null; body: string | null }>,\n  credentialClient?: any,\n): Promise<Array<{ title: string | null; body: string | null; translated: boolean }>> {',
)
text = text.replace(
    '    const text = await generateWithOwnKeys(system, prompt);',
    '    const text = await generateWithOwnKeys(system, prompt, credentialClient);',
)
text = text.replace(
    '    const translated = await translateBatch(batch.map((row: any) => ({ title: row.title, body: row.body })));',
    '    const translated = await translateBatch(batch.map((row: any) => ({ title: row.title, body: row.body })), admin);',
)
old_auto = '''  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return syncLiveReviewsInternal(supabaseAdmin, data.product_id, false);
  });'''
new_auto = '''  .handler(async ({ data }) => {
    const { getSupabaseAdminOrNull } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdminOrNull();
    if (!admin) {
      // Public product pages must remain healthy even when the hosting runtime does
      // not inject a privileged Supabase secret. Manual admin sync still works via RLS.
      return {
        fetched: 0,
        upserted: 0,
        translated: 0,
        skipped: true,
        source: "server_unavailable" as const,
        error: null,
      };
    }
    return syncLiveReviewsInternal(admin, data.product_id, false, admin);
  });'''
if old_auto not in text:
    raise SystemExit('Public review auto-sync block not found')
text = text.replace(old_auto, new_auto)
path.write_text(text, encoding='utf-8')

print('AliExpress session stability patch applied')
