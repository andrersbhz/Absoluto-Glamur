import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "crypto";

function restTs(): string {
  // AliExpress /rest/* usa timestamp em milissegundos Unix (13 dígitos).
  return Date.now().toString();
}

function signRest(apiPath: string, params: Record<string, string>, appSecret: string): string {
  const keys = Object.keys(params).sort();
  const base = apiPath + keys.map((k) => `${k}${params[k]}`).join("");
  return createHmac("sha256", appSecret).update(base, "utf8").digest("hex").toUpperCase();
}


/**
 * Callback OAuth do AliExpress Open Platform.
 * Fluxo:
 *  1. Admin cadastra App Key + App Secret na tabela integrations.
 *  2. AliExpress redireciona o usuário para esta URL com ?code=XXX após autorização.
 *  3. Trocamos o code por access_token/refresh_token via /rest/auth/token/create
 *     e gravamos no config da integração.
 */
export const Route = createFileRoute("/api/public/webhooks/aliexpress")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          return htmlResponse(
            `<h1>Falha na autorização AliExpress</h1><p>${escapeHtml(error)}</p>`,
            400,
          );
        }
        if (!code) {
          return htmlResponse("<h1>Parâmetro ?code ausente.</h1>", 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: integ } = await supabaseAdmin
          .from("integrations")
          .select("config, api_key, webhook_token")
          .eq("provider", "aliexpress")
          .maybeSingle();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg = (integ?.config as any) ?? {};
        const appKey = String(cfg.app_key ?? integ?.api_key ?? "").trim();
        const appSecret = String(cfg.app_secret ?? integ?.webhook_token ?? "").trim();

        if (!appKey || !appSecret) {
          await supabaseAdmin
            .from("integrations")
            .update({
              config: { ...cfg, pending_code: code, pending_code_at: new Date().toISOString() },
              last_status: "pending_exchange",
              last_error: "App Key/App Secret ausentes — cadastre e reautorize.",
            })
            .eq("provider", "aliexpress");
          return htmlResponse(
            `<h1>Code recebido, mas faltam credenciais</h1>
             <p>Cadastre App Key (em "API Key") e App Secret (em "Webhook Token") em /admin/integrations e refaça a autorização.</p>
             <p><code>code=${escapeHtml(code)}</code></p>`,
            200,
          );
        }


        try {
          const signParams: Record<string, string> = {
            app_key: appKey,
            code,
            sign_method: "hmac-sha256",
            timestamp: restTs(),
          };
          const signature = signRest("/auth/token/create", signParams, appSecret);
          const body = new URLSearchParams({ ...signParams, sign: signature }).toString();
          const tokenRes = await fetch("https://api-sg.aliexpress.com/rest/auth/token/create", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
          const tokenText = await tokenRes.text();
          let tokenJson: {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            refresh_expires_in?: number;
            user_id?: string;
            error?: string;
            error_description?: string;
            message?: string;
            code?: string;
            msg?: string;
          } = {};
          try { tokenJson = JSON.parse(tokenText); } catch { /* keep empty */ }

          if (!tokenRes.ok || tokenJson.error || !tokenJson.access_token) {
            const msg =
              tokenJson.error_description ??
              tokenJson.msg ??
              tokenJson.message ??
              tokenJson.error ??
              tokenJson.code ??
              tokenText.slice(0, 300) ??
              `HTTP ${tokenRes.status}`;

            // Debug info to help diagnose signature mismatches
            const keysSorted = Object.keys(signParams).sort();
            const baseString = "/auth/token/create" + keysSorted.map((k) => `${k}${signParams[k]}`).join("");
            const debug = {
              app_key_len: appKey.length,
              app_key_head: appKey.slice(0, 4),
              app_key_tail: appKey.slice(-2),
              app_secret_len: appSecret.length,
              app_secret_head: appSecret.slice(0, 2),
              app_secret_tail: appSecret.slice(-2),
              base_string: baseString,
              signature,
              response: tokenText.slice(0, 500),
            };

            await supabaseAdmin
              .from("integrations")
              .update({
                last_status: "error",
                last_error: `Troca do code falhou: ${msg}`,
                last_verified_at: new Date().toISOString(),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                config: { ...cfg, last_oauth_debug: debug } as any,
              })
              .eq("provider", "aliexpress");
            return htmlResponse(
              `<h1>Falha ao trocar code por token</h1>
               <pre>${escapeHtml(msg)}</pre>
               <details><summary>Debug (não compartilhe publicamente)</summary>
               <pre>${escapeHtml(JSON.stringify(debug, null, 2))}</pre></details>`,
              400,
            );
          }


          await supabaseAdmin
            .from("integrations")
            .update({
              config: {
                ...cfg,
                app_key: appKey,
                app_secret: appSecret,
                access_token: tokenJson.access_token,
                refresh_token: tokenJson.refresh_token,
                expires_in: tokenJson.expires_in,
                refresh_expires_in: tokenJson.refresh_expires_in,
                aliexpress_user_id: tokenJson.user_id,
                authorized_at: new Date().toISOString(),
                pending_code: null,
              },
              enabled: true,
              last_status: "ok",
              last_error: null,
              last_verified_at: new Date().toISOString(),
            })
            .eq("provider", "aliexpress");

          return htmlResponse(
            `<h1>✅ AliExpress conectado</h1>
             <p>Access e refresh tokens salvos. Pode fechar esta aba e voltar para o painel.</p>
             <script>setTimeout(()=>{window.close();},1500);</script>`,
            200,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin
            .from("integrations")
            .update({
              last_status: "error",
              last_error: msg,
              last_verified_at: new Date().toISOString(),
            })
            .eq("provider", "aliexpress");
          return htmlResponse(`<h1>Erro</h1><pre>${escapeHtml(msg)}</pre>`, 500);
        }
      },
    },
  },
});

function htmlResponse(html: string, status: number) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>AliExpress OAuth</title>
     <style>body{font-family:system-ui;padding:2rem;max-width:640px;margin:auto;color:#1a1a1a}
     pre{background:#f4f4f5;padding:1rem;border-radius:8px;white-space:pre-wrap}</style>${html}`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
