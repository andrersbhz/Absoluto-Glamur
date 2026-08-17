from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 occurrence, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# AliExpress TOP client: allow authenticated server functions to provide their RLS-bound client.
path = "src/lib/aliexpress-top-public.server.ts"
replace_once(
    path,
    '''async function loadAliTopCredentials() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("integrations")''',
    '''async function loadAliTopCredentials(credentialClient?: any) {
  let client = credentialClient;
  if (!client) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    client = supabaseAdmin;
  }
  const { data, error } = await client
    .from("integrations")''',
)
replace_once(
    path,
    '''export async function callAliTopPublic<T = any>(
  method: string,
  bizParams: Record<string, string | number | boolean | undefined | null>,
): Promise<T> {
  const { appKey, secrets } = await loadAliTopCredentials();''',
    '''export async function callAliTopPublic<T = any>(
  method: string,
  bizParams: Record<string, string | number | boolean | undefined | null>,
  credentialClient?: any,
): Promise<T> {
  const { appKey, secrets } = await loadAliTopCredentials(credentialClient);''',
)

# Reviews pipeline: manual admin sync uses authenticated Supabase client instead of elevated server secret.
path = "src/lib/product-reviews-live.functions.ts"
replace_once(
    path,
    '''async function fetchOfficialReviews(
  sourceId: string,
): Promise<{ reviews: NormalizedOfficialReview[]; productId: string; total: number }> {''',
    '''async function fetchOfficialReviews(
  sourceId: string,
  credentialClient?: any,
): Promise<{ reviews: NormalizedOfficialReview[]; productId: string; total: number }> {''',
)
replace_once(
    path,
    '''    const payload = await callAliTopPublic<any>("aliexpress.social.product.evaluation.query", {
      product_id: productId,
      page,
      page_size: OFFICIAL_SYNC_PAGE_SIZE,
    });''',
    '''    const payload = await callAliTopPublic<any>("aliexpress.social.product.evaluation.query", {
      product_id: productId,
      page,
      page_size: OFFICIAL_SYNC_PAGE_SIZE,
    }, credentialClient);''',
)
replace_once(
    path,
    '''export async function syncLiveReviewsInternal(admin: any, productId: string, force = false) {''',
    '''export async function syncLiveReviewsInternal(
  admin: any,
  productId: string,
  force = false,
  credentialClient: any = admin,
) {''',
)
replace_once(
    path,
    '''    const official = await fetchOfficialReviews(sourceId);''',
    '''    const official = await fetchOfficialReviews(sourceId, credentialClient);''',
)
replace_once(
    path,
    '''  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return syncLiveReviewsInternal(supabaseAdmin, data.product_id, true);
  });''',
    '''  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    // Manual sync is already protected by Bearer auth + admin/catalog authorization.
    // Use the authenticated RLS-bound client so the button does not depend on a
    // server service-role/secret key being injected by the hosting runtime.
    return syncLiveReviewsInternal(context.supabase, data.product_id, true, context.supabase);
  });''',
)

print("Manual AliExpress review sync now uses authenticated Supabase session.")
