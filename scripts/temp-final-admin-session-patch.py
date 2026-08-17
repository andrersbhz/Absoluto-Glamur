from pathlib import Path

IMPORT = 'const { supabaseAdmin } = await import("@/integrations/supabase/client.server");'

# AI product optimizer: entire server fn is authenticated catalog/admin.
p = Path('src/lib/ai-product-optimize.functions.ts')
s = p.read_text()
if IMPORT not in s:
    raise SystemExit('AI optimizer service import not found')
s = s.replace(IMPORT, 'const db = context.supabase;', 1).replace('supabaseAdmin', 'db')
s = s.replace('generateWithOwnKeys(SYSTEM_COPY, prompt)', 'generateWithOwnKeys(SYSTEM_COPY, prompt, db)')
if 'client.server' in s or 'supabaseAdmin' in s:
    raise SystemExit('AI optimizer still contains service role')
p.write_text(s)

# Blog admin: every exported server fn is authenticated and asserts admin.
p = Path('src/lib/blog-admin.functions.ts')
s = p.read_text()
s = s.replace(IMPORT + '\n    const db = supabaseAdmin as any;', 'const db = context.supabase as any;')
s = s.replace(IMPORT, 'const db = context.supabase as any;')
s = s.replace('(supabaseAdmin as any)', 'db').replace('supabaseAdmin', 'db')
s = s.replace('loadAiCredential("gemini")', 'loadAiCredential("gemini", db)')
s = s.replace('publishBlogPostToMeta(published)', 'publishBlogPostToMeta(published, db)')
s = s.replace('retryBlogSocialPublication(data.post_id, data.platform)', 'retryBlogSocialPublication(data.post_id, data.platform, context.supabase)')
if 'client.server' in s or 'supabaseAdmin' in s:
    raise SystemExit('Blog admin still contains service role')
p.write_text(s)

# Blog Meta settings/testing: authenticated admin only.
p = Path('src/lib/blog-meta.functions.ts')
s = p.read_text()
s = s.replace(IMPORT + '\n    const db = supabaseAdmin as any;', 'const db = context.supabase as any;')
s = s.replace(IMPORT, 'const db = context.supabase as any;')
s = s.replace('(supabaseAdmin as any)', 'db').replace('supabaseAdmin', 'db')
s = s.replace('testMetaIntegration(data.provider)', 'testMetaIntegration(data.provider, db)')
if 'client.server' in s or 'supabaseAdmin' in s:
    raise SystemExit('Blog Meta still contains service role')
p.write_text(s)

# Customer push subscriptions already have own-user RLS.
p = Path('src/lib/customer-push.functions.ts')
s = p.read_text()
s = s.replace(IMPORT, 'const db = context.supabase;').replace('supabaseAdmin', 'db')
if 'client.server' in s or 'supabaseAdmin' in s:
    raise SystemExit('Customer push still contains service role')
p.write_text(s)

# Admin push register/unregister can use authenticated RLS. Server fanout remains privileged.
p = Path('src/lib/push.functions.ts')
s = p.read_text()
s = s.replace(IMPORT, 'const db = context.supabase;').replace('supabaseAdmin', 'db')
if 'client.server' in s or 'supabaseAdmin' in s:
    raise SystemExit('push.functions still contains direct service role')
p.write_text(s)

# Admin system: compliance and usage are read-only authenticated admin views.
p = Path('src/lib/admin-system.functions.ts')
s = p.read_text()
start = s.index('export const getComplianceOverview')
mid = s.index('export type UsageOverview', start)
section = s[start:mid].replace(IMPORT, 'const db = context.supabase;').replace('supabaseAdmin', 'db')
s = s[:start] + section + s[mid:]
start = s.index('export const getUsageOverview')
section = s[start:].replace(IMPORT, 'const db = context.supabase;').replace('supabaseAdmin', 'db')
s = s[:start] + section
p.write_text(s)

# Canonical integration catalog: use actual provider ids present in the database/features
# and always expose Facebook + Instagram even before rows are configured.
p = Path('src/lib/integrations.functions.ts')
s = p.read_text()
s = s.replace(
'  { provider: "meta_ads", category: "marketing", display_name: "Meta Ads (Facebook/Instagram)", description: "Campanhas, Pixel e Conversions API da Meta." },',
'  { provider: "meta", category: "marketing", display_name: "Meta Ads / Catalog / Pixel", description: "Campanhas, Pixel, catálogo e Conversions API da Meta." },\n  { provider: "facebook", category: "marketing", display_name: "Facebook Page", description: "Publicação do blog na Página via Meta Graph API." },\n  { provider: "instagram", category: "marketing", display_name: "Instagram Business", description: "Publicação do blog no Instagram profissional via Meta Graph API." },'
)
for provider in ['"meta"', '"facebook"', '"instagram"']:
    if f'provider: {provider}' not in s:
        raise SystemExit(f'Missing canonical provider {provider}')
p.write_text(s)

print('Final authenticated-admin patch applied')
