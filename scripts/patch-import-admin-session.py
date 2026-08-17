from pathlib import Path

p = Path('src/lib/aliexpress-import.functions.ts')
s = p.read_text()
needle = 'const { supabaseAdmin } = await import("@/integrations/supabase/client.server");'
count = s.count(needle)
if count == 0:
    raise SystemExit('no importer service-role declarations found')
s = s.replace(needle, 'const db = context.supabase;')
s = s.replace('supabaseAdmin', 'db')
p.write_text(s)
print(f'replaced {count} importer service-role declarations')
