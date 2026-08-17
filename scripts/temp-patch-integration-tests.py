from pathlib import Path

# Backend tests
p = Path('src/lib/integrations.functions.ts')
s = p.read_text()
marker = '    if (data.provider === "openai" || data.provider === "gemini") {'
if marker not in s:
    raise SystemExit('backend insertion marker missing')
insert = r'''    if (data.provider === "stripe") {
      const secret = String(row.api_key ?? "").trim();
      if (!secret) throw new Error("Preencha a Secret Key da Stripe antes de testar.");
      try {
        const basic = Buffer.from(`${secret}:`, "utf8").toString("base64");
        const response = await fetch("https://api.stripe.com/v1/balance", {
          method: "GET",
          headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
        });
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          const error = json.error as { message?: string } | undefined;
          throw new Error(error?.message ?? `Stripe respondeu HTTP ${response.status}.`);
        }
        await writeVerification(db, "stripe", null);
        return {
          ok: true,
          info: {
            name: `Stripe · ${json.livemode === true ? "produção" : "teste"}`,
            email: null,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, "stripe", message);
        throw new Error(message);
      }
    }

    if (data.provider === "mercadopago") {
      const accessToken = String(row.api_key ?? "").trim();
      if (!accessToken) throw new Error("Preencha o Access Token do Mercado Pago antes de testar.");
      try {
        const response = await fetch("https://api.mercadolibre.com/users/me", {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          throw new Error(String(json.message ?? json.error ?? `Mercado Pago respondeu HTTP ${response.status}.`));
        }
        await writeVerification(db, "mercadopago", null);
        return {
          ok: true,
          info: {
            name: `Mercado Pago · ${String(json.nickname ?? json.id ?? "conta validada")}`,
            email: typeof json.email === "string" ? json.email : null,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, "mercadopago", message);
        throw new Error(message);
      }
    }

    if (data.provider === "17track") {
      const token = String(row.api_key ?? "").trim();
      if (!token) throw new Error("Preencha a API Key da 17TRACK antes de testar.");
      try {
        const response = await fetch("https://api.17track.net/track/v2.4/getquota", {
          method: "POST",
          headers: { "17token": token, "Content-Type": "application/json", Accept: "application/json" },
          body: "[]",
        });
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const apiCode = typeof json.code === "number" ? json.code : null;
        if (!response.ok || (apiCode !== null && apiCode !== 0)) {
          throw new Error(String(json.message ?? json.msg ?? `17TRACK respondeu HTTP ${response.status}.`));
        }
        await writeVerification(db, "17track", null);
        return { ok: true, info: { name: "17TRACK · credencial válida", email: null } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, "17track", message);
        throw new Error(message);
      }
    }

    if (data.provider === "facebook" || data.provider === "instagram") {
      try {
        const { testMetaIntegration } = await import("./meta-social.server");
        const info = await testMetaIntegration(data.provider, db);
        await writeVerification(db, data.provider, null);
        return { ok: true, info: { name: info.name, email: null } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeVerification(db, data.provider, message);
        throw new Error(message);
      }
    }

    if (data.provider === "google_tag_manager") {
      const containerId = String(row.api_key ?? "").trim().toUpperCase();
      if (!/^GTM-[A-Z0-9]+$/.test(containerId)) {
        const message = "ID do Google Tag Manager inválido. Use o formato GTM-XXXXXX.";
        await writeVerification(db, "google_tag_manager", message);
        throw new Error(message);
      }
      await writeVerification(db, "google_tag_manager", null);
      return { ok: true, info: { name: `Google Tag Manager · ${containerId}`, email: null } };
    }

'''
s = s.replace(marker, insert + marker, 1)
old = '''    return {
      ok: true,
      info: {
        name: INTEGRATION_CATALOG.find((item) => item.provider === data.provider)?.display_name ?? data.provider,
        message: `Teste automático para "${data.provider}" ainda não está disponível. As credenciais permanecem salvas e a integração pode ser validada pelo fluxo do próprio provedor.`,
      },
    };'''
new = '''    const name = INTEGRATION_CATALOG.find((item) => item.provider === data.provider)?.display_name ?? data.provider;
    const message = `Teste automático para "${name}" ainda não está implementado. A integração foi mantida disponível e as credenciais continuam salvas; valide pelo fluxo oficial do provedor.`;
    await db
      .from("integrations")
      .update({
        last_verified_at: new Date().toISOString(),
        last_status: "manual",
        last_error: null,
      })
      .eq("provider", data.provider);
    return {
      ok: false,
      unsupported: true as const,
      info: { name, message },
    };'''
if old not in s:
    raise SystemExit('backend fallback marker missing')
s = s.replace(old, new, 1)
p.write_text(s)

# UI: truthful toasts + Meta ids + manual status
p = Path('src/routes/_authenticated/admin.integrations.tsx')
s = p.read_text()
old = '''  const [merchantKey, setMerchantKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);'''
new = '''  const [merchantKey, setMerchantKey] = useState("");
  const [pageId, setPageId] = useState(
    String((integration.config as { page_id?: string } | null)?.page_id ?? ""),
  );
  const [igUserId, setIgUserId] = useState(
    String((integration.config as { ig_user_id?: string } | null)?.ig_user_id ?? ""),
  );
  const [showApiKey, setShowApiKey] = useState(false);'''
if old not in s: raise SystemExit('state marker missing')
s = s.replace(old, new, 1)
old = '''    onSuccess: (r) => {
      toast.success(`Conectado a ${r.info?.name ?? "provedor"}`);
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },'''
new = '''    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Conexão validada: ${r.info?.name ?? "provedor"}`);
      } else if ("unsupported" in r && r.unsupported) {
        toast.info(r.info?.message ?? "Este provedor exige validação manual.");
      } else {
        toast.info(r.info?.message ?? "A integração não foi validada automaticamente.");
      }
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },'''
if old not in s: raise SystemExit('test toast marker missing')
s = s.replace(old, new, 1)
old = '''  const isNuPay = integration.provider === "nupay";
  const isAliexpress = integration.provider === "aliexpress";
  const isGtm = integration.provider === "google_tag_manager";'''
new = '''  const isNuPay = integration.provider === "nupay";
  const isAliexpress = integration.provider === "aliexpress";
  const isFacebook = integration.provider === "facebook";
  const isInstagram = integration.provider === "instagram";
  const isGtm = integration.provider === "google_tag_manager";'''
if old not in s: raise SystemExit('provider flags marker missing')
s = s.replace(old, new, 1)
old = '''          <StatusLight
            connected={integration.last_status === "ok" && integration.enabled}
            errored={integration.last_status === "error"}
            hasKey={integration.has_api_key}'''
new = '''          <StatusLight
            connected={integration.last_status === "ok" && integration.enabled}
            errored={integration.last_status === "error"}
            manual={integration.last_status === "manual"}
            hasKey={integration.has_api_key}'''
if old not in s: raise SystemExit('status invocation marker missing')
s = s.replace(old, new, 1)
# Insert Meta ID fields before webhook block
marker = '''          {webhookUrl && (
            <label className="block text-sm">'''
insert = '''          {isFacebook && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Facebook Page ID</span>
              <input
                type="text"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                placeholder="ID numérico da Página"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Use o ID da Página vinculada ao token. O botão Testar valida o Page ID pela Meta Graph API.
              </span>
            </label>
          )}
          {isInstagram && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Instagram Professional User ID</span>
              <input
                type="text"
                value={igUserId}
                onChange={(e) => setIgUserId(e.target.value)}
                placeholder="ID da conta profissional"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Informe o ID da conta Business/Creator vinculada. O teste consulta o usuário pela Meta Graph API.
              </span>
            </label>
          )}
'''
if marker not in s: raise SystemExit('webhook marker missing')
s = s.replace(marker, insert + marker, 1)
old = '''                if (isNuPay && merchantKey) cfg.merchant_key = merchantKey;
                if (isAliexpress) cfg.redirect_uri = redirectUri.trim() || null;'''
new = '''                if (isNuPay && merchantKey) cfg.merchant_key = merchantKey;
                if (isFacebook) cfg.page_id = pageId.trim() || null;
                if (isInstagram) cfg.ig_user_id = igUserId.trim() || null;
                if (isAliexpress) cfg.redirect_uri = redirectUri.trim() || null;'''
if old not in s: raise SystemExit('save config marker missing')
s = s.replace(old, new, 1)
# StatusLight signature + behavior
old = '''function StatusLight({
  connected,
  errored,
  hasKey,
  errorMessage,
}: {
  connected: boolean;
  errored: boolean;
  hasKey: boolean;'''
new = '''function StatusLight({
  connected,
  errored,
  manual,
  hasKey,
  errorMessage,
}: {
  connected: boolean;
  errored: boolean;
  manual: boolean;
  hasKey: boolean;'''
if old not in s: raise SystemExit('status signature marker missing')
s = s.replace(old, new, 1)
old = '''    : errored
      ? { color: "bg-destructive", label: "Erro", pulse: false, title: errorMessage ?? "Falha na última verificação" }
      : hasKey
        ? { color: "bg-warning", label: "Aguardando teste", pulse: false, title: "Chave configurada — clique em 'Testar conexão'" }'''
new = '''    : errored
      ? { color: "bg-destructive", label: "Erro", pulse: false, title: errorMessage ?? "Falha na última verificação" }
      : manual
        ? { color: "bg-warning", label: "Teste manual", pulse: false, title: "Credencial salva; este provedor ainda exige validação pelo fluxo oficial" }
        : hasKey
          ? { color: "bg-warning", label: "Aguardando teste", pulse: false, title: "Chave configurada — clique em 'Testar conexão'" }'''
if old not in s: raise SystemExit('status behavior marker missing')
s = s.replace(old, new, 1)
# Add docs for Facebook/Instagram before GTM block
marker = '''    google_tag_manager: {
      keyUrl: "https://tagmanager.google.com/",'''
insert = '''    facebook: {
      keyUrl: "https://developers.facebook.com/apps/",
      keyLabel: "Abrir Meta for Developers",
      docsUrl: "https://developers.facebook.com/docs/graph-api/",
      instructions: "Cole um token de acesso com permissão para a Página no campo Chave da API e informe o Facebook Page ID. Salve e use Testar conexão.",
    },
    instagram: {
      keyUrl: "https://developers.facebook.com/apps/",
      keyLabel: "Abrir Meta for Developers",
      docsUrl: "https://developers.facebook.com/docs/instagram-api/",
      instructions: "Cole o token de acesso da conta profissional no campo Chave da API e informe o Instagram Professional User ID. Salve e use Testar conexão.",
    },
'''
if marker not in s: raise SystemExit('docs marker missing')
s = s.replace(marker, insert + marker, 1)
p.write_text(s)
print('Integration test truth patch applied')
