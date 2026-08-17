from pathlib import Path

path = Path('src/routes/_authenticated/admin.integrations.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace(
    'import { Copy, ExternalLink, Plug, PlugZap, RefreshCw, Route as RouteIcon, Save, TestTube } from "lucide-react";',
    'import { Copy, ExternalLink, Eye, EyeOff, Plug, PlugZap, RefreshCw, Route as RouteIcon, Save, TestTube } from "lucide-react";',
)
text = text.replace(
    '  listIntegrations,\n  saveIntegration,\n  testIntegration,',
    '  listIntegrations,\n  revealIntegrationCredential,\n  saveIntegration,\n  testIntegration,',
)
text = text.replace(
    '  type IntegrationDTO,\n  type SaveIntegrationInput,',
    '  type IntegrationCredentialField,\n  type IntegrationDTO,\n  type SaveIntegrationInput,',
)
text = text.replace(
    '  ai: "IA",\n  storage:',
    '  ai: "IA",\n  import: "Importação / fornecedores",\n  storage:',
)
text = text.replace(
    '  const currentMerchantKey =\n    (integration.config as { merchant_key?: string } | null)?.merchant_key ?? "";',
    '  const hasMerchantKey = integration.has_merchant_key;',
)
text = text.replace(
'''          <p className="font-mono text-xs">
            {integration.api_key_masked ?? <span className="text-muted-foreground">— vazia —</span>}
          </p>''',
'''          <StoredCredential
            provider={integration.provider}
            field="api_key"
            masked={integration.api_key_masked}
            emptyLabel="— vazia —"
          />''',
)
api_input_end = '''              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            {isGtm && ('''
text = text.replace(
    api_input_end,
'''              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            {!isGtm && integration.has_api_key && (
              <StoredCredential
                provider={integration.provider}
                field="api_key"
                masked={integration.api_key_masked}
                prefix="Atual: "
              />
            )}
            {isGtm && (''',
    1,
)
text = text.replace(
    'X-Merchant-Key {currentMerchantKey && "(preenchida — deixe vazio para manter)"}',
    'X-Merchant-Key {hasMerchantKey && "(preenchida — deixe vazio para manter)"}',
)
merchant_input = '''                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Encontre em NuPay Business'''
text = text.replace(
    merchant_input,
'''                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              {integration.has_merchant_key && (
                <StoredCredential
                  provider={integration.provider}
                  field="merchant_key"
                  masked={integration.merchant_key_masked}
                  prefix="Atual: "
                />
              )}
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Encontre em NuPay Business''',
    1,
)
webhook_input = '''                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {isAliexpress'''
text = text.replace(
    webhook_input,
'''                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              {integration.has_webhook_token && (
                <StoredCredential
                  provider={integration.provider}
                  field="webhook_token"
                  masked={integration.webhook_token_masked}
                  prefix="Atual: "
                />
              )}
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {isAliexpress''',
    1,
)

marker = '\nfunction StatusLight({' 
component = r'''
function StoredCredential({
  provider,
  field,
  masked,
  prefix = "",
  emptyLabel = "Não configurada",
}: {
  provider: string;
  field: IntegrationCredentialField;
  masked: string | null;
  prefix?: string;
  emptyLabel?: string;
}) {
  const reveal = useServerFn(revealIntegrationCredential);
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!masked && !value) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }

  const toggle = async () => {
    if (visible) {
      setVisible(false);
      return;
    }
    if (value == null) {
      setLoading(true);
      try {
        const result = await reveal({ data: { provider, field } });
        setValue(result.value ?? null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível revelar a credencial");
        return;
      } finally {
        setLoading(false);
      }
    }
    setVisible(true);
  };

  return (
    <span className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]">
      <span className="truncate">
        {prefix}
        {visible ? (value ?? "— vazia —") : (masked ?? "••••")}
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
        aria-label={visible ? "Ocultar credencial" : "Mostrar credencial"}
        title={visible ? "Ocultar credencial" : "Mostrar credencial"}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}
'''
if marker not in text:
    raise SystemExit('StatusLight marker not found')
text = text.replace(marker, '\n' + component + marker, 1)

required = ['revealIntegrationCredential', 'StoredCredential', 'EyeOff', 'Importação / fornecedores']
for item in required:
    if item not in text:
        raise SystemExit(f'missing expected UI patch: {item}')

path.write_text(text, encoding='utf-8')
