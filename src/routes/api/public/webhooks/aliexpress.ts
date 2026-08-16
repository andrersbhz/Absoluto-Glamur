import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function restTs(): string {
  return Date.now().toString();
}

function signRest(apiPath: string, params: Record<string, string>, appSecret: string): string {
  const keys = Object.keys(params).sort();
  const base = apiPath + keys.map((k) => `${k}${params[k]}`).join("");
  return createHmac("sha256", appSecret).update(base, "utf8").digest("hex").toUpperCase();
}

type OAuthStatePayload = {
  uid: string;
  ts: number;
  nonce: string;
};

async function validateOAuthState(
  state: string | null,
  appSecret: string,
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
): Promise<boolean> {
  if (!state) return false;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;

  const expected = createHmac("sha256", appSecret).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;

  let parsed: OAuthStatePayload;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    return false;
  }

  if (!parsed.uid || !parsed.nonce || !Number.isFinite(parsed.ts)) return false;
  const ageMs = Date.now() - parsed.ts;
  if (ageMs < 0 || ageMs > 10 * 60 * 1000) return false;

  const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: parsed.uid });
  return !!isAdmin;
}

export const Route = createFileRoute("/api/public/webhooks/aliexpress")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        const state = url.searchParams.get("state");

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

        const cfg = (integ?.config as Record<string, unknown> | null) ?? {};
        const appKey = String(integ?.api_key ?? cfg.app_key ?? "").trim();
        const appSecret = String(integ?.webhook_token ?? cfg.app_secret ?? "").trim();

        if (!appKey || !appSecret) {
          return htmlResponse(
            `<h1>Credenciais ausentes</h1>
             <p>Cadastre App Key e App Secret em /admin/integrations e refaça a autorização.</p>`,
            400,
          );
        }

        if (!(await validateOAuthState(state, appSecret, supabaseAdmin))) {
          return htmlResponse(
            `<h1>Autorização inválida ou expirada</h1>
             <p>Volte ao painel administrativo e inicie novamente a autorização do AliExpress.</p>`,
            403,
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
          try {
            tokenJson = JSON.parse(tokenText);
          } catch {
            // keep empty
          }

          if (!tokenRes.ok || tokenJson.error || !tokenJson.access_token) {
            const msg =
              tokenJson.error_description ??
              tokenJson.msg ??
              tokenJson.message ??
              tokenJson.error ??
              tokenJson.code ??
              tokenText.slice(0, 300) ??
              `HTTP ${tokenRes.status}`;

            await supabaseAdmin
              .from("integrations")
              .update({
                last_status: "error",
                last_error: `Troca do code falhou: ${msg}`,
                last_verified_at: new Date().toISOString(),
              })
              .eq("provider", "aliexpress");
            return htmlResponse(
              `<h1>Falha ao trocar code por token</h1>
               <pre>${escapeHtml(msg)}</pre>
               <p>Confira App Key e App Secret em /admin/integrations e refaça a autorização.</p>`,
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
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
