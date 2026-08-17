from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 occurrence, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


path = "src/lib/aliexpress-discovery.functions.ts"
p = Path(path)
text = p.read_text()

old = '''async function loadAliCreds() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("integrations")'''
new = '''async function loadAliCreds(credentialClient?: any) {
  let client = credentialClient;
  if (!client) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    client = supabaseAdmin;
  }
  const { data, error } = await client
    .from("integrations")'''
if text.count(old) != 1:
    raise SystemExit("loadAliCreds signature block not found exactly once")
text = text.replace(old, new, 1)
text = text.replace('''    .eq("provider", "aliexpress")
    .maybeSingle();
  const cfg = (data?.config ?? {}) as any;''', '''    .eq("provider", "aliexpress")
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler a integração AliExpress: ${error.message}`);
  const cfg = (data?.config ?? {}) as any;''', 1)

old = '''async function refreshAliToken(appKey: string, appSecret: string, refreshToken: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const markInvalid = async (msg: string) => {
    const { data: existing } = await supabaseAdmin'''
new = '''async function refreshAliToken(
  appKey: string,
  appSecret: string,
  refreshToken: string,
  credentialClient?: any,
): Promise<string> {
  let client = credentialClient;
  if (!client) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    client = supabaseAdmin;
  }

  const markInvalid = async (msg: string) => {
    const { data: existing } = await client'''
if text.count(old) != 1:
    raise SystemExit("refreshAliToken header not found exactly once")
text = text.replace(old, new, 1)
refresh_start = text.index("async function refreshAliToken(")
refresh_end = text.index("\nasync function requestAli(", refresh_start)
refresh_chunk = text[refresh_start:refresh_end].replace("supabaseAdmin", "client")
refresh_chunk = refresh_chunk.replace('const { client } = await import("@/integrations/supabase/client.server");\n    client = client;', 'const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n    client = supabaseAdmin;')
text = text[:refresh_start] + refresh_chunk + text[refresh_end:]

old = '''export async function callAli<T = any>(
  method: string,
  bizParams: Record<string, string | number | boolean | undefined | null>,
): Promise<T> {
  let { appKey, appSecret, fallbackAppSecret, accessToken, refreshToken, refreshedAt, expiresIn } = await loadAliCreds();'''
new = '''export async function callAli<T = any>(
  method: string,
  bizParams: Record<string, string | number | boolean | undefined | null>,
  credentialClient?: any,
): Promise<T> {
  let { appKey, appSecret, fallbackAppSecret, accessToken, refreshToken, refreshedAt, expiresIn } = await loadAliCreds(credentialClient);'''
if text.count(old) != 1:
    raise SystemExit("callAli header not found exactly once")
text = text.replace(old, new, 1)
text = text.replace("accessToken = await refreshAliToken(appKey, appSecret, refreshToken);", "accessToken = await refreshAliToken(appKey, appSecret, refreshToken, credentialClient);", 1)
text = text.replace("const newToken = await refreshAliToken(appKey, appSecret, refreshToken);", "const newToken = await refreshAliToken(appKey, appSecret, refreshToken, credentialClient);", 1)

old = "async function enrichWebResultsWithAliDetails(items: DiscoveryProduct[]): Promise<DiscoveryProduct[]> {"
new = "async function enrichWebResultsWithAliDetails(items: DiscoveryProduct[], credentialClient?: any): Promise<DiscoveryProduct[]> {"
if text.count(old) != 1:
    raise SystemExit("enrich helper header not found exactly once")
text = text.replace(old, new, 1)
enrich_start = text.index(new)
enrich_end = text.index("\n// -------------------- Search --------------------", enrich_start)
enrich_chunk = text[enrich_start:enrich_end]
enrich_chunk = enrich_chunk.replace('''        const json = await callAli("aliexpress.ds.product.get", {
          product_id: item.product_id,
          ship_to_country: "BR",
          target_currency: "BRL",
          target_language: "PT",
        });''', '''        const json = await callAli("aliexpress.ds.product.get", {
          product_id: item.product_id,
          ship_to_country: "BR",
          target_currency: "BRL",
          target_language: "PT",
        }, credentialClient);''')
text = text[:enrich_start] + enrich_chunk + text[enrich_end:]

text = text.replace('json = await callAli("aliexpress.affiliate.product.query", bizParams);', 'json = await callAli("aliexpress.affiliate.product.query", bizParams, context.supabase);', 1)
text = text.replace('items = await enrichWebResultsWithAliDetails(items);', 'items = await enrichWebResultsWithAliDetails(items, context.supabase);', 1)
text = text.replace('json = await callAli("aliexpress.ds.recommend.feed.get", bizParams);', 'json = await callAli("aliexpress.ds.recommend.feed.get", bizParams, context.supabase);', 1)

handler_marker = 'export const importAliexpressProductToStore = createServerFn({ method: "POST" })'
handler_start = text.index(handler_marker)
handler_chunk = text[handler_start:]
old_admin = '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");'
if handler_chunk.count(old_admin) != 1:
    raise SystemExit(f"import handler admin binding count={handler_chunk.count(old_admin)}")
handler_chunk = handler_chunk.replace(old_admin, '    const db = context.supabase;', 1)
handler_chunk = handler_chunk.replace('''    const json = await callAli("aliexpress.ds.product.get", {
      product_id: data.product_id,
      target_currency: "BRL",
      target_language: "PT",
      ship_to_country: "BR",
    });''', '''    const json = await callAli("aliexpress.ds.product.get", {
      product_id: data.product_id,
      target_currency: "BRL",
      target_language: "PT",
      ship_to_country: "BR",
    }, db);''', 1)
handler_chunk = handler_chunk.replace("supabaseAdmin", "db")
text = text[:handler_start] + handler_chunk
p.write_text(text)

replace_once(
    "src/hooks/use-theme.ts",
    '''    setThemeState(initial);
    apply(initial);
  }, []);''',
    '''    setThemeState(initial);
    apply(initial);
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);''',
)

replace_once(
    "src/components/store/StoreLayout.tsx",
    '''  useEffect(() => {
    // A loja pública usa sempre a identidade visual clara da marca.
    // O modo escuro pertence somente ao painel administrativo e não pode vazar para o storefront.
    document.documentElement.classList.remove("dark");
  }, []);''',
    '''  useEffect(() => {
    // A loja pública usa sempre a identidade visual clara da marca.
    // Reforce a cada navegação para impedir vazamento do tema do painel.
    document.documentElement.classList.remove("dark");
  }, [location.pathname]);''',
)

print("Discovery auth + storefront theme patch applied.")
