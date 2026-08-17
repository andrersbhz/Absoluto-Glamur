from pathlib import Path

p = Path('src/lib/intelligence.functions.ts')
s = p.read_text()
needle = 'const { supabaseAdmin } = await import("@/integrations/supabase/client.server");'
count_imports = s.count(needle)
if count_imports == 0:
    raise SystemExit('No service-role imports found in intelligence.functions.ts')
s = s.replace(needle, 'const db = context.supabase;')
s = s.replace('supabaseAdmin', 'db')
if 'client.server' in s or 'supabaseAdmin' in s:
    raise SystemExit('Service-role references remain after intelligence patch')
p.write_text(s)
print(f'Patched {count_imports} authenticated intelligence handlers')
