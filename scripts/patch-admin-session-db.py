from pathlib import Path

FILES = [
    Path('src/lib/admin-catalog.functions.ts'),
    Path('src/lib/dashboard.functions.ts'),
    Path('src/lib/blog-admin.functions.ts'),
]

IMPORT = '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");'

for path in FILES:
    text = path.read_text(encoding='utf-8')
    before = text

    if path.name == 'blog-admin.functions.ts':
        text = text.replace(
            IMPORT + '\n    const db = supabaseAdmin as any;',
            '    const db = context.supabase as any;',
        )
        text = text.replace(IMPORT, '    const db = context.supabase as any;')
        text = text.replace('(supabaseAdmin as any)', 'db')
        text = text.replace('supabaseAdmin', 'db')
        text = text.replace('loadAiCredential("gemini")', 'loadAiCredential("gemini", db)')
    else:
        text = text.replace(IMPORT, '    const db = context.supabase;')
        text = text.replace('supabaseAdmin', 'db')

    if text == before:
        raise SystemExit(f'No changes applied to {path}')
    if 'client.server' in text or 'supabaseAdmin' in text:
        raise SystemExit(f'Privileged DB reference remains in {path}')
    path.write_text(text, encoding='utf-8')

print('Patched:', ', '.join(str(p) for p in FILES))
