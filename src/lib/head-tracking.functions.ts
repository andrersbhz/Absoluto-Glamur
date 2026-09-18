import { createServerFn } from "@tanstack/react-start";

export type HeadTracking = {
  head_html: string;
  body_html: string;
  gtm_id: string | null;
  meta_pixel_id: string | null;
  ga4_id: string | null;
  tiktok_pixel_id: string | null;
};

const EMPTY: HeadTracking = {
  head_html: "",
  body_html: "",
  gtm_id: null,
  meta_pixel_id: null,
  ga4_id: null,
  tiktok_pixel_id: null,
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function orNull(value: unknown): string | null {
  const v = str(value);
  return v ? v : null;
}

// Lido em rota pública (SSR do __root), por isso usa o cliente administrativo
// apenas para leitura de uma chave de configuração não sensível.
export const getHeadTracking = createServerFn({ method: "GET" }).handler(
  async (): Promise<HeadTracking> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("site_settings")
        .select("value")
        .eq("key", "tracking_head")
        .maybeSingle();

      const value = (data?.value ?? {}) as Record<string, unknown>;
      if (value.enabled === false) return EMPTY;

      let gtm = orNull(value.gtm_id);
      if (gtm && !/^GTM-[A-Z0-9]+$/i.test(gtm)) gtm = null;

      return {
        head_html: str(value.head_html),
        body_html: str(value.body_html),
        gtm_id: gtm,
        meta_pixel_id: orNull(value.meta_pixel_id),
        ga4_id: orNull(value.ga4_id),
        tiktok_pixel_id: orNull(value.tiktok_pixel_id),
      };
    } catch {
      return EMPTY;
    }
  },
);

// insertAdjacentHTML marca <script> como "already started", então o código colado
// nunca executava. Aqui recriamos cada script para que o navegador realmente o rode.
export function buildHtmlInjector(html: string, target: "head" | "body"): string {
  return `(function(){var host=document.${target};var tpl=document.createElement('template');tpl.innerHTML=${JSON.stringify(html)};var nodes=Array.prototype.slice.call(tpl.content.childNodes);nodes.forEach(function(node){if(node.nodeName==='SCRIPT'){var s=document.createElement('script');for(var i=0;i<node.attributes.length;i++){s.setAttribute(node.attributes[i].name,node.attributes[i].value);}s.text=node.textContent||'';host.appendChild(s);}else{host.appendChild(node);}});})();`;
}

export function buildTrackingScripts(t: HeadTracking): string {
  const parts: string[] = [];

  if (t.gtm_id) {
    parts.push(
      `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${t.gtm_id}');`,
    );
  }

  if (t.meta_pixel_id) {
    parts.push(
      `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${t.meta_pixel_id}');fbq('track','PageView');`,
    );
  }

  if (t.tiktok_pixel_id) {
    parts.push(
      `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(e,n){e[n]=function(){e.push([n].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${t.tiktok_pixel_id}');ttq.page()}(window,document,'ttq');`,
    );
  }

  return parts.join("\n");
}
