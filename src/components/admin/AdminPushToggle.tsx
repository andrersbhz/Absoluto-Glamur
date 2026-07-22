import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getPushPublicKey,
  registerAdminPushSubscription,
  unregisterAdminPushSubscription,
  sendTestPush,
} from "@/lib/push.functions";

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

export function AdminPushToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const fetchKey = useServerFn(getPushPublicKey);
  const register = useServerFn(registerAdminPushSubscription);
  const unregister = useServerFn(unregisterAdminPushSubscription);
  const test = useServerFn(sendTestPush);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      const sub = await reg?.pushManager.getSubscription();
      setEnabled(!!sub);
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Permissão negada. Ative nas configurações do navegador.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const { publicKey } = await fetchKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await register({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? ab2b64(sub.getKey("p256dh")),
          auth: json.keys?.auth ?? ab2b64(sub.getKey("auth")),
          userAgent: navigator.userAgent,
        },
      });
      setEnabled(true);
      toast.success("Notificações de venda ativadas neste dispositivo.");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ativar notificações.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unregister({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Notificações desativadas neste dispositivo.");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao desativar.");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    try {
      const r = await test({});
      toast.success(`Teste enviado (${r.sent} dispositivo(s))`);
    } catch {
      toast.error("Falha no teste");
    }
  }

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      {enabled ? (
        <>
          <Button size="sm" variant="outline" onClick={runTest} disabled={busy}>
            <Bell className="mr-1 h-4 w-4" /> Testar
          </Button>
          <Button size="sm" variant="ghost" onClick={disable} disabled={busy}>
            <BellOff className="mr-1 h-4 w-4" /> Desativar alertas
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={enable} disabled={busy}>
          <Bell className="mr-1 h-4 w-4" /> Ativar alertas de venda
        </Button>
      )}
    </div>
  );
}
