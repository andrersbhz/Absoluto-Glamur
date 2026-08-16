import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { getCommerceSessionId, trackCommerce } from "./commerce-tracking";

// Tempo de heartbeat em ms (30 segundos)
const HEARTBEAT_INTERVAL = 30000;

export function useAnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    // 1. Rastrear visualização de página inicial
    trackCommerce("view_item" as any, {
      metadata: {
        path: location.pathname,
        title: document.title,
        referrer: document.referrer,
        utm_source: new URLSearchParams(window.location.search).get("utm_source"),
        utm_medium: new URLSearchParams(window.location.search).get("utm_medium"),
        utm_campaign: new URLSearchParams(window.location.search).get("utm_campaign"),
        browser: navigator.userAgent,
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
        referrer: document.referrer,
      }
    });

    // 2. Configurar Heartbeat
    const sendHeartbeat = () => {
      const sessionId = getCommerceSessionId();
      if (!sessionId) return;

      const body = JSON.stringify({
        session_id: sessionId,
        current_page: window.location.pathname,
        metadata: {
          path: window.location.pathname,
          device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
        }
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/public/commerce-event", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/public/commerce-event", { method: "POST", body, keepalive: true });
      }
    };

    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    
    // Enviar um imediato para garantir que a sessão foi criada corretamente
    sendHeartbeat();

    return () => clearInterval(interval);
  }, [location.pathname]);
}
