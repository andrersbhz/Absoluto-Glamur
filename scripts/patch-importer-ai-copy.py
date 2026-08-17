from pathlib import Path

p = Path('src/routes/_authenticated/admin.imports.tsx')
text = p.read_text()
old = '''              A IA (Gemini via Lovable AI Gateway) gera palavras-chave estratégicas para o seu nicho e
              busca automaticamente os produtos mais vendidos e melhor avaliados na API oficial do AliExpress.'''
new = '''              A IA usa primeiro o Gemini configurado em Integrações e pode usar OpenAI como fallback para gerar
              palavras-chave estratégicas; os produtos são buscados e classificados com dados da API oficial do AliExpress.'''
if old not in text:
    raise SystemExit('Texto antigo do Lovable AI Gateway não encontrado')
p.write_text(text.replace(old, new, 1))
print('Importer AI copy updated')
