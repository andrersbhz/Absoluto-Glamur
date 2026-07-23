import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getPushPublicKey } from "@/lib/push.functions";
import {
  registerCustomerPushSubscription,
  unregisterCustomerPushSubscription,
} from "@/lib/customer-push.functions";

const DISMISS_KEY = "ag_push_prompt_dismissed_at";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 3; // reoferecer após 3 dias

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function ab2b64(buf: ArrayBuffer | null) {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function CustomerPushPrompt() {
  const { user, loading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const fetchKey = useServerFn(getPushPublicKey);
  const register = useServerFn(registerCustomerPushSubscription);
  const unregister = useServerFn(unregisterCustomerPushSubscription);

  useEffect(() => {
    if (loading || !user) {
      setVisible(false);
      return;
    }
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return;
    }
    if (Notification.permission === "granted" || Notification.permission === "denied") {
      return;
    }
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismissed && Date.now() - dismissed < DISMISS_MS) return;
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, [user, loading]);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Permissão negada. Ative nas configurações do navegador.");
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setVisible(false);
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const { publicKey } = await fetchKey();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const json = sub.toJSON();
      await register({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? ab2b64(sub.getKey("p256dh")),
          auth: json.keys?.auth ?? ab2b64(sub.getKey("auth")),
          userAgent: navigator.userAgent,
        },
      });
      toast.success("Prontinho! Você receberá avisos de novas vendas e promoções.");
      setVisible(false);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ativar notificações.");
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await unregister({ data: { endpoint: sub.endpoint } });
          await sub.unsubscribe();
        }
      } catch {
        // ignore
      }
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-md rounded-2xl border border-primary/30 bg-background/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-display text-base text-foreground">Receber avisos de vendas?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ative as notificações e seja a primeira a saber de promoções, lançamentos e novidades da
            Absoluto Glamur.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={enable} disabled={busy}>
              <Bell className="mr-1 h-4 w-4" />
              {busy ? "Ativando..." : "Aceitar notificações"}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy}>
              Agora não
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground transition hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
