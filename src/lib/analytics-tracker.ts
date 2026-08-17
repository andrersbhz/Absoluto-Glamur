import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { getCommerceSessionId, trackCommerce } from "./commerce-tracking";

const HEARTBEAT_INTERVAL = 30000;

function shouldTrackPath(pathname: string) {
  return !pathname.startsWith("/admin") && !pathname.startsWith("/auth");
}

export function useAnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    // O painel e a autenticação não são tráfego de cliente. Além de poluir o mapa,
    // rastreá-los gerava heartbeats e escritas no banco durante o uso administrativo.
    if (!shouldTrackPath(location.pathname)) return;

    trackCommerce("view_item", {
      metadata: {
        path: location.pathname,
        title: document.title,
        referrer: document.referrer,
        utm_source: new URLSearchParams(window.location.search).get("utm_source"),
        utm_medium: new URLSearchParams(window.location.search).get("utm_medium"),
        utm_campaign: new URLSearchParams(window.location.search).get("utm_campaign"),
        browser: navigator.userAgent,
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
      },
    });

    const sendHeartbeat = () => {
      const sessionId = getCommerceSessionId();
      if (!sessionId) return;

      const body = JSON.stringify({
        session_id: sessionId,
        current_page: window.location.pathname,
        metadata: {
          path: window.location.pathname,
          device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
          referrer: document.referrer,
        },
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/public/commerce-event",
          new Blob([body], { type: "application/json" }),
        );
      } else {
        void fetch("/api/public/commerce-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    };

    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    sendHeartbeat();

    return () => window.clearInterval(interval);
  }, [location.pathname]);
}
