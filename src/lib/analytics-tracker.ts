import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { sendCommercePresence, trackCommerce } from "./commerce-tracking";

const HEARTBEAT_INTERVAL = 30000;

type FunnelStage = "browsing" | "product_view" | "cart" | "checkout" | "purchased";

function shouldTrackPath(pathname: string) {
  return !pathname.startsWith("/admin") && !pathname.startsWith("/auth");
}

function inferFunnelStage(pathname: string): FunnelStage {
  if (pathname === "/cart") return "cart";
  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) return "checkout";

  const segments = pathname.split("/").filter(Boolean);
  const knownNonProductPrefixes = ["blog", "compliance", "products", "account", "favorites", "orders"];
  if (segments.length === 2 && !knownNonProductPrefixes.includes(segments[0] ?? "")) {
    return "product_view";
  }

  return "browsing";
}

function currentMetadata(pathname = window.location.pathname) {
  return {
    path: pathname,
    title: document.title,
    referrer: document.referrer,
    utm_source: new URLSearchParams(window.location.search).get("utm_source"),
    utm_medium: new URLSearchParams(window.location.search).get("utm_medium"),
    utm_campaign: new URLSearchParams(window.location.search).get("utm_campaign"),
    browser: navigator.userAgent,
    device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
    funnel_stage: inferFunnelStage(pathname),
  };
}

export function useAnalyticsTracker() {
  const location = useLocation();

  // Registra a navegação como histórico. "page_view" não significa "viu produto";
  // produtos geram o evento semântico view_item na página de produto.
  useEffect(() => {
    if (!shouldTrackPath(location.pathname)) return;

    trackCommerce("page_view", {
      current_page: location.pathname,
      metadata: currentMetadata(location.pathname),
    });

    const sendHeartbeat = () => {
      if (!shouldTrackPath(window.location.pathname)) return;
      sendCommercePresence("active", {
        current_page: window.location.pathname,
        metadata: currentMetadata(window.location.pathname),
      });
    };

    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    sendHeartbeat();
    return () => window.clearInterval(interval);
  }, [location.pathname]);

  // Presença é temporária; histórico não. Ao fechar/abandonar a página, apenas a
  // sessão vira offline. Os eventos permanecem no banco para reconstruir a jornada.
  useEffect(() => {
    const sendOffline = () => {
      if (!shouldTrackPath(window.location.pathname)) return;
      sendCommercePresence("offline", {
        current_page: window.location.pathname,
        metadata: currentMetadata(window.location.pathname),
      });
    };

    const sendActive = () => {
      if (!shouldTrackPath(window.location.pathname)) return;
      sendCommercePresence("active", {
        current_page: window.location.pathname,
        metadata: currentMetadata(window.location.pathname),
      });
    };

    window.addEventListener("pagehide", sendOffline);
    window.addEventListener("pageshow", sendActive);
    return () => {
      window.removeEventListener("pagehide", sendOffline);
      window.removeEventListener("pageshow", sendActive);
    };
  }, []);
}
